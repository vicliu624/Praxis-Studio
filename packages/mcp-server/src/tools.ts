import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildContextPacket, parseGraphAnchor } from "@praxis/context-builder";
import {
  ArchitectureFindingReportSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  PraxisMcpCodeFactsInputSchema,
  PraxisMcpCodeFactsResultSchema,
  PraxisMcpContextPacketInputSchema,
  PraxisMcpContextPacketResultSchema,
  PraxisMcpFindingsInputSchema,
  PraxisMcpFindingsResultSchema,
  PraxisMcpProjectionViewsInputSchema,
  PraxisMcpProjectionViewsResultSchema,
  PraxisMcpStatusInputSchema,
  PraxisMcpStatusResultSchema,
  ProjectedGraphViewSchema,
  type ArchitectureFinding,
  type ArchitectureFindingReport,
  type CodeFactGraphSnapshot,
  type GraphAnchor,
  type PraxisMcpToolName,
  type ProjectedGraphView
} from "@praxis/schema";

interface JsonSchema<T> {
  parse(value: unknown): T;
}

export interface McpToolContext {
  root: string;
}

export interface McpToolDefinition {
  name: PraxisMcpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (rawInput: unknown, context: McpToolContext) => Promise<unknown>;
}

export const READ_ONLY_TOOL_NAMES: PraxisMcpToolName[] = [
  "praxis_status",
  "praxis_code_facts",
  "praxis_findings",
  "praxis_projection_views",
  "praxis_context_packet"
];

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "praxis_status",
    description: "Return read-only Praxis project intelligence status for the scoped project.",
    inputSchema: objectSchema({ root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root.") }),
    call: callStatus
  },
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
    name: "praxis_findings",
    description: "Read architecture findings from .distinction/cache/architecture-findings.json.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      category: enumSchema(["architecture"], "Optional finding category filter."),
      status: enumSchema(["open", "acknowledged", "planned", "in_progress", "mitigated", "resolved", "false_positive", "accepted_risk"], "Optional finding status filter."),
      severity: enumSchema(["info", "low", "medium", "high", "critical"], "Optional finding severity filter."),
      limit: numberSchema("Maximum number of findings to return.")
    }),
    call: callFindings
  },
  {
    name: "praxis_projection_views",
    description: "Read schema-valid projected graph views under .distinction/views.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      kind: enumSchema(["architecture_dependency", "architecture_component", "code_fact", "finding", "context", "task_plan", "trace", "memory"], "Optional projected graph view kind filter."),
      anchor: graphAnchorJsonSchema(),
      limit: numberSchema("Maximum number of projected graph views to return.")
    }),
    call: callProjectionViews
  },
  {
    name: "praxis_context_packet",
    description: "Build a ContextPacket from a graph anchor using the shared Praxis context builder.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        anchor: {
          ...graphAnchorJsonSchema(),
          description: "Required graph anchor. A string anchor is also accepted at runtime for convenience."
        },
        purpose: enumSchema(["explain", "plan", "task", "review", "governance", "external_agent"], "Context packet purpose."),
        limit: {
          type: "object",
          description: "Optional context slice limits.",
          additionalProperties: false,
          properties: {
            codeFacts: { type: "number", minimum: 1, maximum: 500 },
            findings: { type: "number", minimum: 1, maximum: 500 },
            memory: { type: "number", minimum: 1, maximum: 500 },
            projectionNodes: { type: "number", minimum: 1, maximum: 500 }
          }
        }
      },
      ["anchor"]
    ),
    call: callContextPacket
  }
];

async function callStatus(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpStatusInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const distinctionPath = path.join(root, ".distinction");
  const cachePath = path.join(distinctionPath, "cache");
  const memoryPath = path.join(distinctionPath, "memory");
  const viewsPath = path.join(distinctionPath, "views");

  const [distinctionExists, codeFacts, findings, projectionManifestExists, contextPacketExists, codeFactViewExists, findingViewExists, projectedViews] =
    await Promise.all([
      exists(distinctionPath),
      tryReadJsonWithSchema(path.join(cachePath, "code-fact-graph.json"), CodeFactGraphSnapshotSchema),
      tryReadJsonWithSchema(path.join(cachePath, "architecture-findings.json"), ArchitectureFindingReportSchema),
      exists(path.join(cachePath, "projection-manifest.json")),
      exists(path.join(cachePath, "context-packet.json")),
      exists(path.join(viewsPath, "code", "code-fact-view.json")),
      exists(path.join(viewsPath, "findings", "finding-view.json")),
      readProjectedGraphViews(root)
    ]);

  const warnings: string[] = [];
  if (!distinctionExists) warnings.push(".distinction directory is missing; run intake before using project intelligence tools.");
  if (!codeFacts) warnings.push("Code fact cache is missing; run praxis-runtime intake or code-facts --write-cache.");
  if (!findings) warnings.push("Finding cache is missing; run praxis-runtime detect-findings.");

  return PraxisMcpStatusResultSchema.parse({
    schemaVersion: "praxis.mcp.statusResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    server: {
      name: "praxis-mcp-server",
      version: "0.1.0-alpha.0",
      readOnly: true
    },
    distinction: {
      exists: distinctionExists,
      path: distinctionPath,
      cachePath,
      memoryPath,
      viewsPath
    },
    cache: {
      codeFacts: Boolean(codeFacts),
      findings: Boolean(findings),
      projectionManifest: projectionManifestExists,
      contextPacket: contextPacketExists
    },
    views: {
      codeFacts: codeFactViewExists,
      findings: findingViewExists,
      projectedGraphViewCount: projectedViews.length
    },
    codeFacts: codeFacts
      ? {
          provider: codeFacts.provider,
          files: codeFacts.files.length,
          nodes: codeFacts.nodes.length,
          edges: codeFacts.edges.length,
          warnings: codeFacts.warnings
        }
      : undefined,
    findings: findings
      ? {
          count: findings.findings.length,
          open: findings.findings.filter((finding) => finding.status === "open").length
        }
      : undefined,
    tools: READ_ONLY_TOOL_NAMES,
    warnings
  });
}

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

  if (pathFilter) {
    files = files.filter((file) => pathMatches(file.path, pathFilter));
    nodes = nodes.filter((node) => pathMatches(node.filePath, pathFilter));
    edges = edges.filter((edge) => (edge.filePath ? pathMatches(edge.filePath, pathFilter) : false));
  }
  if (input.kind) nodes = nodes.filter((node) => node.kind === input.kind);
  if (nameFilter) {
    nodes = nodes.filter((node) => node.name.toLowerCase().includes(nameFilter) || node.qualifiedName.toLowerCase().includes(nameFilter));
    files = files.filter((file) => file.path.toLowerCase().includes(nameFilter));
  }

  if (input.path || input.kind || input.name) {
    const selectedNodeIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => selectedNodeIds.has(edge.sourceId) || selectedNodeIds.has(edge.targetId));
    const selectedPaths = new Set([...nodes.map((node) => node.filePath), ...edges.map((edge) => edge.filePath).filter(Boolean) as string[]]);
    files = files.filter((file) => selectedPaths.has(file.path) || (pathFilter ? pathMatches(file.path, pathFilter) : false));
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

async function callFindings(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpFindingsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const report = await readJsonWithSchema(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema);
  const limit = input.limit ?? 100;
  let findings = report.findings;
  if (input.category) findings = findings.filter((finding) => finding.category === input.category);
  if (input.status) findings = findings.filter((finding) => finding.status === input.status);
  if (input.severity) findings = findings.filter((finding) => finding.severity === input.severity);

  return PraxisMcpFindingsResultSchema.parse({
    schemaVersion: "praxis.mcp.findingsResult.v1",
    root: report.root,
    generatedAt: new Date().toISOString(),
    findings: findings.slice(0, limit),
    truncated: findings.length > limit,
    sourceCachePath: ".distinction/cache/architecture-findings.json"
  });
}

async function callProjectionViews(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpProjectionViewsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const limit = input.limit ?? 20;
  let records = await readProjectedGraphViewRecords(root);
  if (input.kind) records = records.filter((record) => record.view.kind === input.kind);
  const anchor = input.anchor;
  if (anchor) records = records.filter((record) => projectedViewMatchesAnchor(record.view, anchor));

  const selected = records.slice(0, limit);
  return PraxisMcpProjectionViewsResultSchema.parse({
    schemaVersion: "praxis.mcp.projectionViewsResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    views: selected.map((record) => record.view),
    truncated: records.length > limit,
    sourceViewPaths: selected.map((record) => record.relativePath)
  });
}

async function callContextPacket(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const normalizedInput = normalizeContextPacketInput(rawInput);
  const input = PraxisMcpContextPacketInputSchema.parse(normalizedInput);
  const root = resolveToolRoot(context, input.root);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor: input.anchor,
      purpose: input.purpose ?? "explain",
      createdBy: "mcp",
      limit: input.limit
    })
  );
  return PraxisMcpContextPacketResultSchema.parse(packet);
}

function normalizeContextPacketInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "object" || rawInput === null || !("anchor" in rawInput)) return rawInput;
  const input = rawInput as { anchor?: unknown };
  if (typeof input.anchor !== "string") return rawInput;
  return { ...(rawInput as Record<string, unknown>), anchor: parseGraphAnchor(input.anchor) };
}

function resolveToolRoot(context: McpToolContext, requestedRoot?: string): string {
  if (!requestedRoot) return context.root;
  const resolved = path.isAbsolute(requestedRoot) ? path.resolve(requestedRoot) : path.resolve(context.root, requestedRoot);
  if (normalizeForCompare(resolved) !== normalizeForCompare(context.root)) {
    throw new Error(`MCP server is scoped to ${context.root}; refusing root ${resolved}`);
  }
  return context.root;
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function pathMatches(filePath: string, filter: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const normalizedFilter = filter.toLowerCase();
  return normalizedPath === normalizedFilter || normalizedPath.startsWith(`${normalizedFilter}/`) || normalizedPath.includes(normalizedFilter);
}

async function readProjectedGraphViews(root: string): Promise<ProjectedGraphView[]> {
  return (await readProjectedGraphViewRecords(root)).map((record) => record.view);
}

async function readProjectedGraphViewRecords(root: string): Promise<{ view: ProjectedGraphView; relativePath: string }[]> {
  const viewsRoot = path.join(root, ".distinction", "views");
  const files = await listJsonFiles(viewsRoot);
  const records: { view: ProjectedGraphView; relativePath: string }[] = [];
  for (const file of files) {
    try {
      const view = await readJsonWithSchema(file, ProjectedGraphViewSchema);
      records.push({ view, relativePath: projectRelativePath(root, file) });
    } catch {
      // Not every view JSON is a unified ProjectedGraphView yet; skip legacy projections.
    }
  }
  return records;
}

async function listJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolute);
  }
  return files;
}

function projectedViewMatchesAnchor(view: ProjectedGraphView, anchor: GraphAnchor): boolean {
  return (
    view.nodes.some((node) => graphAnchorMatches(node.anchor, anchor)) ||
    view.edges.some((edge) => graphAnchorMatches(edge.anchor, anchor)) ||
    view.annotations.some((annotation) => annotation.anchor && graphAnchorMatches(annotation.anchor, anchor))
  );
}

function graphAnchorMatches(left: GraphAnchor, right: GraphAnchor): boolean {
  return left.kind === right.kind && left.id === right.id && (!right.path || left.path === right.path);
}

async function readJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

async function tryReadJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T | undefined> {
  try {
    return await readJsonWithSchema(filePath, schema);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function projectRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return filePath.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {})
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

function numberSchema(description: string): Record<string, unknown> {
  return { type: "number", minimum: 1, maximum: 500, description };
}

function enumSchema(values: string[], description: string): Record<string, unknown> {
  return { type: "string", enum: values, description };
}

function graphAnchorJsonSchema(): Record<string, unknown> {
  return objectSchema(
    {
      kind: enumSchema(
        [
          "file",
          "symbol",
          "code_fact_node",
          "code_fact_edge",
          "architecture_module",
          "architecture_dependency",
          "finding",
          "task",
          "trace",
          "memory",
          "projection_node",
          "projection_edge"
        ],
        "Graph anchor kind."
      ),
      id: stringSchema("Stable graph anchor id."),
      path: stringSchema("Optional repository-relative path.")
    },
    ["kind", "id"]
  );
}
