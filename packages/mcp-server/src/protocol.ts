import type { Readable, Writable } from "node:stream";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export class JsonRpcProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
  }
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof (value as { method?: unknown }).method === "string"
  );
}

export function success(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function failure(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

export async function runLineDelimitedJsonRpcServer(options: {
  input: Readable;
  output: Writable;
  handle: (request: JsonRpcRequest) => Promise<unknown>;
}): Promise<void> {
  const { input, output, handle } = options;
  input.setEncoding("utf8");

  let buffer = "";
  let chain = Promise.resolve();
  let stopped = false;
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    input.pause();
    resolveDone?.();
  };

  input.on("data", (chunk: string) => {
    if (stopped) return;
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        chain = chain.then(async () => {
          await processLine(line, output, handle, stop);
        });
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  input.on("end", () => {
    chain.finally(() => stop()).catch(() => stop());
  });
  input.on("error", () => stop());
  input.resume();

  await done;
  await chain;
}

async function processLine(
  line: string,
  output: Writable,
  handle: (request: JsonRpcRequest) => Promise<unknown>,
  stop: () => void
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    writeResponse(output, failure(null, -32700, "Parse error", error instanceof Error ? error.message : String(error)));
    return;
  }

  if (!isJsonRpcRequest(parsed)) {
    writeResponse(output, failure(null, -32600, "Invalid Request"));
    return;
  }

  const hasId = Object.prototype.hasOwnProperty.call(parsed, "id");
  try {
    const result = await handle(parsed);
    if (hasId) writeResponse(output, success(parsed.id ?? null, result));
    if (parsed.method === "shutdown") stop();
  } catch (error) {
    if (hasId) {
      if (error instanceof JsonRpcProtocolError) {
        writeResponse(output, failure(parsed.id ?? null, error.code, error.message, error.data));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        writeResponse(output, failure(parsed.id ?? null, -32000, message));
      }
    }
  }
}

function writeResponse(output: Writable, response: JsonRpcResponse): void {
  output.write(`${JSON.stringify(response)}\n`);
}
