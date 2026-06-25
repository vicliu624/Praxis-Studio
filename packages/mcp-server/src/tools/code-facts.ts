import path from "node:path";
import {
  CodeFactGraphSnapshotSchema,
  PraxisMcpCodeFactsInputSchema,
  PraxisMcpCodeFactsResultSchema,
  PraxisMcpCodeRelationInputSchema,
  PraxisMcpCodeRelationResultSchema,
  type CodeFactGraphSnapshot
} from "@praxis/schema";
import { codeRelationInputSchema, enumSchema, numberSchema, objectSchema, stringSchema } from "./schema-helpers.js";
import { pathMatches, readJsonWithSchema, resolveToolRoot } from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const codeFactTools: McpToolDefinition[] = [
  {
    name: "praxis_code_facts",
    description: "Read normalized CodeFactGraph facts from .distinction/cache/code-fact-graph.json.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      path: stringSchema("Optional repository-relative path filter."),
      kind: enumSchema(["project", "file", "module", "class", "struct", "interface", "trait", "function", "method", "property", "field", "variable", "constant", "enum", "enum_member", "type_alias", "namespace", "import", "export", "route", "component"], "Optional code fact node kind filter."),
      name: stringSchema("Optional case-insensitive symbol or file name substring filter."),
      limit: numberSchema("Maximum number of files, nodes, and edges to return.")
    }),
    call: callCodeFacts
  },
  {
    name: "praxis_callers",
    description: "Return call edges whose target is the requested symbol.",
    inputSchema: codeRelationInputSchema("Symbol id whose callers should be returned."),
    call: (rawInput, context) => callCodeRelation("callers", rawInput, context)
  },
  {
    name: "praxis_callees",
    description: "Return call edges whose source is the requested symbol.",
    inputSchema: codeRelationInputSchema("Symbol id whose callees should be returned."),
    call: (rawInput, context) => callCodeRelation("callees", rawInput, context)
  },
  {
    name: "praxis_impact",
    description: "Return impact-like outgoing call/reference edges for the requested symbol when provider facts support them.",
    inputSchema: codeRelationInputSchema("Symbol id whose impact should be returned."),
    call: (rawInput, context) => callCodeRelation("impact", rawInput, context)
  }
];

async function callCodeFacts(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpCodeFactsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const cachePath = path.join(root, ".distinction", "cache", "code-fact-graph.json");
  const snapshot = await readJsonWithSchema(cachePath, CodeFactGraphSnapshotSchema);
  const limit = input.limit ?? 100;
  const nameFilter = input.name?.toLowerCase();
  const pathFilter = input.path?.replace(/\\/g, "/");

  let files = snapshot.files;
  let nodes = snapshot.nodes;
  let edges = snapshot.edges;
  let nameMatchedFilePaths = new Set<string>();

  if (pathFilter) {
    files = files.filter((file) => pathMatches(file.path, pathFilter));
    nodes = nodes.filter((node) => pathMatches(node.filePath, pathFilter));
    edges = edges.filter((edge) => (edge.filePath ? pathMatches(edge.filePath, pathFilter) : false));
  }
  if (input.kind) nodes = nodes.filter((node) => node.kind === input.kind);
  if (nameFilter) {
    nameMatchedFilePaths = new Set(files.filter((file) => file.path.toLowerCase().includes(nameFilter)).map((file) => file.path));
    nodes = nodes.filter((node) => node.name.toLowerCase().includes(nameFilter) || node.qualifiedName.toLowerCase().includes(nameFilter));
  }

  if (input.path || input.kind || input.name) {
    const selectedNodeIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => selectedNodeIds.has(edge.sourceId) || selectedNodeIds.has(edge.targetId));
    const selectedPaths = new Set([...nodes.map((node) => node.filePath), ...edges.map((edge) => edge.filePath).filter(Boolean) as string[]]);
    files = files.filter((file) => selectedPaths.has(file.path) || nameMatchedFilePaths.has(file.path) || (pathFilter ? pathMatches(file.path, pathFilter) : false));
  }

  const truncated = files.length > limit || nodes.length > limit || edges.length > limit;
  return PraxisMcpCodeFactsResultSchema.parse({
    schemaVersion: "praxis.mcp.codeFactsResult.v1",
    root: snapshot.root,
    generatedAt: new Date().toISOString(),
    provider: snapshot.provider,
    files: files.slice(0, limit),
    nodes: nodes.slice(0, limit),
    edges: edges.slice(0, limit),
    truncated,
    sourceCachePath: ".distinction/cache/code-fact-graph.json",
    warnings: snapshot.warnings
  });
}

async function callCodeRelation(relation: "callers" | "callees" | "impact", rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpCodeRelationInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const snapshot = await readJsonWithSchema(path.join(root, ".distinction", "cache", "code-fact-graph.json"), CodeFactGraphSnapshotSchema);
  const limit = input.limit ?? 100;
  const depth = input.depth ?? 1;
  const relationKinds = relation === "impact" ? new Set(["calls", "references", "impacts"]) : new Set(["calls"]);
  const selectedEdges = traverseCodeRelation(snapshot, input.symbolId, relation, relationKinds, depth);
  const selectedNodeIds = new Set<string>([input.symbolId]);
  for (const edge of selectedEdges) {
    selectedNodeIds.add(edge.sourceId);
    selectedNodeIds.add(edge.targetId);
  }
  const nodes = snapshot.nodes.filter((node) => selectedNodeIds.has(node.id));
  const providerSupportsImpact = snapshot.provider.capabilities.includes("impact") || selectedEdges.some((edge) => edge.kind === "impacts");
  const supported = relation !== "impact" || providerSupportsImpact || selectedEdges.length > 0;
  const reason =
    relation === "impact" && !supported
      ? "Provider did not expose impact/reference/call facts for this symbol."
      : undefined;

  return PraxisMcpCodeRelationResultSchema.parse({
    schemaVersion: "praxis.mcp.codeRelationResult.v1",
    root: snapshot.root,
    generatedAt: new Date().toISOString(),
    relation,
    symbolId: input.symbolId,
    supported,
    reason,
    nodes: nodes.slice(0, limit),
    edges: selectedEdges.slice(0, limit),
    truncated: nodes.length > limit || selectedEdges.length > limit,
    sourceCachePath: ".distinction/cache/code-fact-graph.json"
  });
}

function traverseCodeRelation(
  snapshot: CodeFactGraphSnapshot,
  symbolId: string,
  relation: "callers" | "callees" | "impact",
  relationKinds: Set<string>,
  depth: number
) {
  const selected = new Map<string, CodeFactGraphSnapshot["edges"][number]>();
  const frontier = new Set([symbolId]);
  const visited = new Set<string>();
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      for (const edge of snapshot.edges) {
        if (!relationKinds.has(edge.kind)) continue;
        const matches =
          relation === "callers"
            ? edge.targetId === nodeId
            : relation === "callees"
              ? edge.sourceId === nodeId
              : edge.sourceId === nodeId || edge.kind === "impacts";
        if (!matches) continue;
        selected.set(edge.id, edge);
        next.add(relation === "callers" ? edge.sourceId : edge.targetId);
      }
    }
    frontier.clear();
    for (const item of next) frontier.add(item);
  }
  return Array.from(selected.values());
}
