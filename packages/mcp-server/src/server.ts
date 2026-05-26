import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { MCP_TOOL_DEFINITIONS } from "./tools.js";
import { JsonRpcProtocolError, runLineDelimitedJsonRpcServer, type JsonRpcRequest } from "./protocol.js";

export interface StartMcpServerOptions {
  root: string;
  input?: Readable;
  output?: Writable;
}

const MCP_PROTOCOL_VERSION = "2024-11-05";

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  const root = path.resolve(options.root);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  await runLineDelimitedJsonRpcServer({
    input,
    output,
    handle: async (request) => handleRequest(request, root)
  });
}

async function handleRequest(request: JsonRpcRequest, root: string): Promise<unknown> {
  if (request.method === "initialize") {
    const requestedVersion = requestedProtocolVersion(request.params);
    return {
      protocolVersion: requestedVersion ?? MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "praxis-mcp-server",
        version: "0.1.0-alpha.0"
      }
    };
  }

  if (request.method === "notifications/initialized") return {};

  if (request.method === "tools/list") {
    return {
      tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  }

  if (request.method === "tools/call") return await callTool(request.params, root);

  if (request.method === "shutdown") return null;

  throw new JsonRpcProtocolError(-32601, `Method not found: ${request.method}`);
}

async function callTool(params: unknown, root: string): Promise<unknown> {
  if (typeof params !== "object" || params === null) throw new Error("tools/call params must be an object.");
  const name = (params as { name?: unknown }).name;
  if (typeof name !== "string") throw new Error("tools/call params.name must be a string.");
  const tool = MCP_TOOL_DEFINITIONS.find((item) => item.name === name);
  if (!tool) throw new Error(`Unknown Praxis MCP tool: ${name}`);
  const toolArguments = (params as { arguments?: unknown }).arguments ?? {};
  const structuredContent = await tool.call(toolArguments, { root });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent,
    isError: false
  };
}

function requestedProtocolVersion(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const value = (params as { protocolVersion?: unknown }).protocolVersion;
  return typeof value === "string" && value ? value : undefined;
}
