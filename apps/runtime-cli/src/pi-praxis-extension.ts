import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from "@praxis/mcp-server";

const projectRoot = process.env.PRAXIS_PI_PROJECT_ROOT;
const maxToolOutputChars = 40_000;

const defaultPiLimits: Record<string, Record<string, unknown>> = {
  praxis_code_facts: { limit: 30 },
  praxis_findings: { limit: 15 },
  praxis_finding_audit: { limit: 15 },
  praxis_projection_views: { limit: 10 },
  praxis_context_packet: {
    purpose: "external_agent",
    limit: {
      codeFacts: 24,
      findings: 10,
      memory: 12,
      projectionNodes: 24
    }
  },
  praxis_callers: { depth: 1, limit: 30 },
  praxis_callees: { depth: 1, limit: 30 },
  praxis_impact: { depth: 1, limit: 30 }
};

const writeToolNames = new Set(["praxis_plan_from_finding", "praxis_generate_task", "praxis_record_external_result"]);

export default function praxisMcpBridgeExtension(pi: ExtensionAPI) {
  for (const tool of MCP_TOOL_DEFINITIONS) {
    pi.registerTool({
      name: tool.name,
      label: labelForTool(tool.name),
      description: tool.description,
      promptSnippet: promptSnippetForTool(tool.name),
      promptGuidelines: promptGuidelinesForTool(tool.name),
      parameters: tool.inputSchema as Record<string, unknown>,
      async execute(_toolCallId, params) {
        const result = await tool.call(prepareInput(tool, params), { root: requiredProjectRoot() });
        return {
          content: [{ type: "text" as const, text: formatToolResult(tool.name, result) }],
          details: undefined
        };
      }
    });
  }
}

function requiredProjectRoot(): string {
  if (!projectRoot) throw new Error("PRAXIS_PI_PROJECT_ROOT is required for Praxis MCP bridge tools.");
  return projectRoot;
}

function prepareInput(tool: McpToolDefinition, params: unknown): unknown {
  const input = isRecord(params) ? { ...params } : {};
  const defaults = defaultPiLimits[tool.name];
  if (!defaults) return input;
  return mergeDefaults(input, defaults);
}

function mergeDefaults(input: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...input };
  for (const [key, value] of Object.entries(defaults)) {
    if (merged[key] === undefined) {
      merged[key] = value;
      continue;
    }
    if (isRecord(merged[key]) && isRecord(value)) {
      merged[key] = mergeDefaults(merged[key], value);
    }
  }
  return merged;
}

function formatToolResult(toolName: string, result: unknown): string {
  const compact = compactKnownResult(toolName, result);
  const json = JSON.stringify(compact, null, 2);
  if (json.length <= maxToolOutputChars) return json;
  return `${json.slice(0, maxToolOutputChars)}\n... [truncated ${json.length - maxToolOutputChars} chars; rerun the Praxis tool with narrower filters or smaller limits for more detail]`;
}

function compactKnownResult(toolName: string, result: unknown): unknown {
  if (toolName === "praxis_status" || toolName === "praxis_explain_anchor") return compactValue(result, 4);
  if (toolName === "praxis_context_packet") return compactContextPacket(result);
  return compactValue(result, 5);
}

function compactContextPacket(result: unknown): unknown {
  if (!isRecord(result)) return compactValue(result, 5);
  const codeFacts = isRecord(result.codeFacts) ? result.codeFacts : {};
  const memory = isRecord(result.memory) ? result.memory : {};
  const projections = isRecord(result.projections) ? result.projections : {};
  const scope = isRecord(result.scope) ? result.scope : {};
  return compactValue({
    schemaVersion: result.schemaVersion,
    id: result.id,
    root: result.root,
    generatedAt: result.generatedAt,
    anchor: result.anchor,
    purpose: result.purpose,
    authority: result.authority,
    scope: {
      includedPaths: takeArray(scope.includedPaths, 30),
      excludedPaths: takeArray(scope.excludedPaths, 30),
      expansionPolicy: scope.expansionPolicy
    },
    counts: {
      codeFactNodes: arrayLength(codeFacts.nodes),
      codeFactEdges: arrayLength(codeFacts.edges),
      relatedFiles: arrayLength(codeFacts.relatedFiles),
      findings: Array.isArray(result.findings) ? result.findings.length : 0,
      projectionViews: arrayLength(projections.views),
      memoryFacts: arrayLength(memory.facts),
      memoryDecisions: arrayLength(memory.decisions),
      memoryOpenQuestions: arrayLength(memory.openQuestions)
    },
    codeFacts: {
      nodes: takeArray(codeFacts.nodes, 16),
      edges: takeArray(codeFacts.edges, 16),
      relatedFiles: takeArray(codeFacts.relatedFiles, 16)
    },
    findings: takeArray(result.findings, 10),
    memory: {
      facts: takeArray(memory.facts, 8),
      decisions: takeArray(memory.decisions, 8),
      openQuestions: takeArray(memory.openQuestions, 8)
    },
    projections: {
      views: takeArray(projections.views, 8)
    },
    rules: takeArray(result.rules, 12),
    warnings: takeArray(result.warnings, 12),
    piNote: "This is a compact Praxis ContextPacket view. Use narrower filters or explicit limits when more detail is needed."
  }, 5);
}

function compactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateString(value, 2_400);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => compactValue(item, depth - 1));
    if (value.length > items.length) items.push({ truncatedItems: value.length - items.length });
    return items;
  }
  if (depth <= 0) return "[object omitted; request a narrower Praxis tool result]";
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    output[key] = compactValue(child, depth - 1);
  }
  return output;
}

function takeArray(value: unknown, count: number): unknown[] {
  if (!Array.isArray(value)) return [];
  const items = value.slice(0, count).map((item) => compactValue(item, 4));
  if (value.length > items.length) items.push({ truncatedItems: value.length - items.length });
  return items;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}... [truncated ${value.length - maxChars} chars]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labelForTool(name: string): string {
  return name
    .replace(/^praxis_/, "Praxis ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function promptSnippetForTool(name: string): string {
  if (name === "praxis_context_packet") {
    return "Read a compact Praxis ContextPacket for the current graph anchor before broad repository exploration.";
  }
  if (name === "praxis_projection_views") {
    return "Read Praxis projected graph/design views when a UI graph or design surface already exists.";
  }
  if (name === "praxis_code_facts") {
    return "Read cached Praxis code facts for scoped symbol/file discovery before broad grep/read.";
  }
  if (name === "praxis_findings" || name === "praxis_finding_audit") {
    return "Read Praxis findings and their audit history instead of rediscovering known review facts.";
  }
  if (writeToolNames.has(name)) {
    return "Write only governed Praxis artifacts, never source code or confirmed memory.";
  }
  return "Read Praxis project intelligence that is already indexed by Praxis Studio.";
}

function promptGuidelinesForTool(name: string): string[] {
  const common = [
    "Prefer Praxis tools before broad read/grep when the task is graph-, memory-, finding-, or design-anchored.",
    "Start with small limits and narrow filters; expand only when evidence is missing.",
    "Treat Praxis cache/projection outputs as scoped project evidence, not as automatically confirmed user memory."
  ];
  if (name === "praxis_context_packet") {
    return [
      ...common,
      "Use anchor strings such as file:path, symbol:id, finding:id, code_fact_node:id, projection_view:id, or memory:id when available.",
      "Use purpose external_agent for coding worker context unless a more specific purpose is requested."
    ];
  }
  if (writeToolNames.has(name)) {
    return [
      ...common,
      "Use this only when Praxis has enabled the tool in the allowlist and the user requested a governed artifact.",
      "Do not use governed artifact writes as a substitute for source edits or user confirmation."
    ];
  }
  return common;
}
