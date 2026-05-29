import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);
const projectRoot = process.env.PRAXIS_PI_PROJECT_ROOT;
const maxBufferBytes = 2 * 1024 * 1024;

const codegraphQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", description: "Symbol or concept to search for." },
    limit: { type: "number", description: "Maximum number of results. Default: 10." },
    kind: { type: "string", description: "Optional symbol kind filter, e.g. function, class, method." }
  }
} as const;

const codegraphContextSchema = {
  type: "object",
  additionalProperties: false,
  required: ["task"],
  properties: {
    task: { type: "string", description: "Task or question to build code context for." },
    maxNodes: { type: "number", description: "Maximum graph nodes to include. Default: 50." },
    maxCode: { type: "number", description: "Maximum code blocks to include. Default: 10." },
    includeCode: { type: "boolean", description: "Whether to include code blocks. Default: true." }
  }
} as const;

const codegraphRelationsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["direction", "symbol"],
  properties: {
    direction: { type: "string", enum: ["callers", "callees", "impact"], description: "Relation query direction." },
    symbol: { type: "string", description: "Symbol name to inspect." },
    limit: { type: "number", description: "Maximum relation results. Used for callers/callees. Default: 20." },
    depth: { type: "number", description: "Traversal depth for impact. Default: 2." }
  }
} as const;

export default function praxisCodeGraphExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "codegraph_query",
    label: "CodeGraph Query",
    description: "Search the repository CodeGraph index for symbols. Read-only; does not write Praxis memory.",
    promptSnippet: "Search CodeGraph for symbols and code facts.",
    promptGuidelines: [
      "Use CodeGraph tools when symbol-level repo context would be more precise than grep/find.",
      "Treat CodeGraph output as repository evidence, not confirmed Praxis memory."
    ],
    parameters: codegraphQuerySchema,
    async execute(_toolCallId, params, signal) {
      const args = ["query", params.query, "--path", requiredProjectRoot(), "--limit", String(clampNumber(params.limit, 1, 50, 10)), "--json"];
      if (params.kind) args.push("--kind", params.kind);
      const result = await runCodeGraph(args, signal);
      return textResult(formatOutput(result.stdout || result.stderr || "No CodeGraph query results."));
    }
  });

  pi.registerTool({
    name: "codegraph_context",
    label: "CodeGraph Context",
    description: "Build focused CodeGraph context for a task. Read-only; Pi decides when this context is useful.",
    promptSnippet: "Build task-scoped CodeGraph context.",
    parameters: codegraphContextSchema,
    async execute(_toolCallId, params, signal) {
      const args = [
        "context",
        params.task,
        "--path",
        requiredProjectRoot(),
        "--max-nodes",
        String(clampNumber(params.maxNodes, 1, 120, 50)),
        "--max-code",
        String(clampNumber(params.maxCode, 0, 30, 10)),
        "--format",
        "markdown"
      ];
      if (params.includeCode === false) args.push("--no-code");
      const result = await runCodeGraph(args, signal);
      return textResult(formatOutput(result.stdout || result.stderr || "No CodeGraph context produced."));
    }
  });

  pi.registerTool({
    name: "codegraph_relations",
    label: "CodeGraph Relations",
    description: "Inspect callers, callees, or impact for a symbol through CodeGraph. Read-only.",
    promptSnippet: "Inspect symbol callers, callees, and impact through CodeGraph.",
    parameters: codegraphRelationsSchema,
    async execute(_toolCallId, params, signal) {
      const direction = params.direction;
      const args = [direction, params.symbol, "--path", requiredProjectRoot(), "--json"];
      if (direction === "impact") {
        args.push("--depth", String(clampNumber(params.depth, 1, 8, 2)));
      } else {
        args.push("--limit", String(clampNumber(params.limit, 1, 100, 20)));
      }
      const result = await runCodeGraph(args, signal);
      return textResult(formatOutput(result.stdout || result.stderr || "No CodeGraph relation results."));
    }
  });
}

function requiredProjectRoot(): string {
  if (!projectRoot) throw new Error("PRAXIS_PI_PROJECT_ROOT is required for Praxis CodeGraph tools.");
  return projectRoot;
}

function runCodeGraph(args: string[], signal: AbortSignal | undefined): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Operation aborted"));
      return;
    }

    const child = spawn(process.execPath, [codeGraphShimPath(), ...args], {
      cwd: requiredProjectRoot(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      child.kill();
      settle(() => reject(new Error("Operation aborted")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBufferBytes) child.kill();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBufferBytes) child.kill();
    });
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => {
      if (code === 0) {
        settle(() => resolve({ stdout, stderr }));
        return;
      }
      const detail = formatOutput(stderr || stdout || `CodeGraph exited with code ${code ?? 1}.`);
      settle(() => reject(new Error(detail)));
    });
  });
}

function codeGraphShimPath(): string {
  return require.resolve("@colbymchenry/codegraph/npm-shim.js");
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: undefined
  };
}

function formatOutput(value: string): string {
  const clean = value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").trim();
  if (clean.length <= maxBufferBytes) return clean;
  return `${clean.slice(0, maxBufferBytes)}\n...[truncated ${clean.length - maxBufferBytes} chars]`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}
