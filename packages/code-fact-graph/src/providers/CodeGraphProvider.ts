import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { slugify } from "@praxis/core";
import { scanRepository, type RepositorySnapshot, type SourceFileSummary } from "@praxis/repository-scanner";
import {
  CodeFactGraphSnapshotSchema,
  type CodeFactCapability,
  type CodeFactEdge,
  type CodeFactEdgeKind,
  type CodeFactEvidenceRef,
  type CodeFactFile,
  type CodeFactGraphSnapshot,
  type CodeFactNode,
  type CodeFactNodeKind,
  type CodeFactWarning
} from "@praxis/schema";
import type { CodeFactGraphBuildOptions, CodeFactGraphProvider } from "../index.js";

const require = createRequire(import.meta.url);
const CODEGRAPH_SYMBOL_QUERY_LIMIT = 250;
const CODEGRAPH_JSON_BUFFER_BYTES = 32 * 1024 * 1024;

type CodeGraphStatus = {
  initialized?: boolean;
  fileCount?: number;
  nodeCount?: number;
  edgeCount?: number;
  languages?: string[];
};

type CodeGraphFileRecord = {
  path?: string;
  language?: string;
  nodeCount?: number;
  size?: number;
};

type CodeGraphRawNode = {
  id?: string;
  kind?: string;
  name?: string;
  qualifiedName?: string;
  filePath?: string;
  language?: string;
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  signature?: string | null;
  visibility?: string | null;
  isExported?: boolean;
};

type CodeGraphRelationResponse = {
  symbol?: string;
  callers?: CodeGraphRelationNode[];
  callees?: CodeGraphRelationNode[];
};

type CodeGraphRelationNode = {
  name?: string;
  kind?: string;
  filePath?: string;
  startLine?: number;
};

export class CodeGraphCodeFactGraphProvider implements CodeFactGraphProvider {
  name = "codegraph-cli";
  source = "codegraph" as const;
  capabilities: CodeFactCapability[] = ["file_structure", "imports_exports", "symbols", "calls", "references"];

  async isAvailable(_root: string): Promise<boolean> {
    const result = runCodeGraph(["--version"], { allowFailure: true });
    return result.ok;
  }

  async buildSnapshot(root: string, options: CodeFactGraphBuildOptions = {}): Promise<CodeFactGraphSnapshot> {
    const resolvedRoot = path.resolve(root);
    const repository = await scanRepository({ root: resolvedRoot, ...options });
    const version = codeGraphVersion();
    const status = ensureCodeGraphIndex(resolvedRoot);
    const codeGraphFiles = readCodeGraphFiles(resolvedRoot);
    const files = repository.files.map((file) => toCodeFactFile(file, codeGraphFiles));
    const filesByPath = new Map(files.map((file) => [file.path, file]));

    const rootNode = toRootNode(repository);
    const fileNodes = repository.files.map((file) => toFileNode(file, codeGraphFiles));
    const importNodesByKey = new Map<string, CodeFactNode>();
    const nodeMap = new Map<string, CodeFactNode>([[rootNode.id, rootNode]]);
    const edgeMap = new Map<string, CodeFactEdge>();

    for (const fileNode of fileNodes) nodeMap.set(fileNode.id, fileNode);
    addRepositoryStructureFacts(repository, importNodesByKey, edgeMap);
    for (const importNode of importNodesByKey.values()) nodeMap.set(importNode.id, importNode);

    const symbolCandidates = extractSymbolCandidates(resolvedRoot, repository.files);
    const symbolNodes = querySymbolNodes(resolvedRoot, symbolCandidates);
    for (const symbolNode of symbolNodes) {
      if (nodeMap.has(symbolNode.id)) continue;
      nodeMap.set(symbolNode.id, symbolNode);
      const file = filesByPath.get(symbolNode.filePath);
      if (file && !file.nodeIds.includes(symbolNode.id)) file.nodeIds.push(symbolNode.id);
      addEdge(edgeMap, {
        id: edgeId(fileNodeId(symbolNode.filePath), "contains", symbolNode.id, symbolNode.qualifiedName),
        kind: "contains",
        sourceId: fileNodeId(symbolNode.filePath),
        targetId: symbolNode.id,
        filePath: symbolNode.filePath,
        range: symbolNode.range ? { startLine: symbolNode.range.startLine, endLine: symbolNode.range.endLine } : undefined,
        confidence: 0.92,
        evidence: [codeGraphEvidence(symbolNode.filePath, symbolNode.range?.startLine, `CodeGraph symbol: ${symbolNode.qualifiedName}`)]
      });
    }

    addCallAndReferenceEdges(resolvedRoot, symbolNodes, edgeMap);

    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.values());
    const snapshot: CodeFactGraphSnapshot = {
      schemaVersion: "praxis.codeFactGraph.v1",
      root: repository.root,
      generatedAt: new Date().toISOString(),
      provider: {
        name: this.name,
        source: this.source,
        version,
        runId: `code-facts:codegraph:${Date.now()}`,
        capabilities: [...this.capabilities]
      },
      files,
      nodes,
      edges,
      statistics: buildStatistics(files, nodes, edges),
      warnings: buildWarnings(status, symbolNodes, edges, symbolCandidates.length)
    };

    return CodeFactGraphSnapshotSchema.parse(snapshot);
  }
}

function ensureCodeGraphIndex(root: string): CodeGraphStatus | undefined {
  const status = readCodeGraphStatus(root);
  if (!status?.initialized) {
    runCodeGraph(["init", root, "-i"]);
    return readCodeGraphStatus(root);
  }

  runCodeGraph(["index", root, "--quiet"]);
  return readCodeGraphStatus(root);
}

function readCodeGraphStatus(root: string): CodeGraphStatus | undefined {
  const result = runCodeGraph(["status", root, "--json"], { allowFailure: true });
  if (!result.ok) return undefined;
  const parsed = safeJson(result.stdout);
  return isRecord(parsed) ? (parsed as CodeGraphStatus) : undefined;
}

function readCodeGraphFiles(root: string): Map<string, CodeGraphFileRecord> {
  const result = runCodeGraph(["files", "--path", root, "--format", "flat", "--json"], { allowFailure: true });
  if (!result.ok) return new Map();
  const parsed = safeJson(result.stdout);
  if (!Array.isArray(parsed)) return new Map();
  const files = new Map<string, CodeGraphFileRecord>();
  for (const item of parsed) {
    if (!isRecord(item) || typeof item.path !== "string") continue;
    files.set(normalizeRepositoryPath(item.path), item as CodeGraphFileRecord);
  }
  return files;
}

function codeGraphVersion(): string | undefined {
  const result = runCodeGraph(["--version"], { allowFailure: true });
  return result.ok ? result.stdout.trim() || undefined : undefined;
}

function querySymbolNodes(root: string, candidates: string[]): CodeFactNode[] {
  const queriedCandidates = candidates.slice(0, CODEGRAPH_SYMBOL_QUERY_LIMIT);
  const nodesById = new Map<string, CodeFactNode>();

  for (const candidate of queriedCandidates) {
    const result = runCodeGraph(["query", candidate, "--path", root, "--limit", "20", "--json"], { allowFailure: true });
    if (!result.ok) continue;
    const parsed = safeJson(result.stdout);
    if (!Array.isArray(parsed)) continue;

    for (const item of parsed) {
      const rawNode = isRecord(item) && isRecord(item.node) ? (item.node as CodeGraphRawNode) : undefined;
      const node = rawNode ? toSymbolNode(rawNode, candidate) : undefined;
      if (!node) continue;
      nodesById.set(node.id, node);
    }
  }

  return Array.from(nodesById.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function extractSymbolCandidates(root: string, files: SourceFileSummary[]): string[] {
  const candidates = new Set<string>();
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g,
    /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[{;]/gm
  ];

  for (const file of files) {
    if (!isCodeGraphQueryableFile(file) || file.sizeBytes > 1_000_000) continue;
    const absolutePath = path.join(root, file.path);
    let content = "";
    try {
      content = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
        const name = match[1];
        if (name && !RESERVED_SYMBOL_NAMES.has(name)) candidates.add(name);
      }
    }
  }

  return Array.from(candidates).sort((left, right) => left.localeCompare(right));
}

const RESERVED_SYMBOL_NAMES = new Set(["if", "for", "while", "switch", "catch", "function", "return"]);

function isCodeGraphQueryableFile(file: SourceFileSummary): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].includes(file.extension);
}

function toSymbolNode(rawNode: CodeGraphRawNode, query: string): CodeFactNode | undefined {
  const name = stringOr(rawNode.name, query);
  const filePath = typeof rawNode.filePath === "string" ? normalizeRepositoryPath(rawNode.filePath) : undefined;
  if (!name || !filePath || rawNode.kind === "file") return undefined;

  const startLine = positiveNumber(rawNode.startLine);
  const endLine = positiveNumber(rawNode.endLine) ?? startLine;
  const range = startLine && endLine
    ? {
        startLine,
        endLine,
        startColumn: nonnegativeNumber(rawNode.startColumn),
        endColumn: nonnegativeNumber(rawNode.endColumn)
      }
    : undefined;

  return {
    id: symbolNodeId(rawNode, name, filePath, startLine),
    kind: toCodeFactNodeKind(rawNode.kind),
    name,
    qualifiedName: stringOr(rawNode.qualifiedName, name),
    filePath,
    language: stringOr(rawNode.language, "unknown"),
    range,
    signature: typeof rawNode.signature === "string" && rawNode.signature ? rawNode.signature : undefined,
    visibility: toVisibility(rawNode.visibility),
    evidence: [codeGraphEvidence(filePath, startLine, `CodeGraph symbol: ${stringOr(rawNode.qualifiedName, name)}`)]
  };
}

function addCallAndReferenceEdges(root: string, symbols: CodeFactNode[], edgeMap: Map<string, CodeFactEdge>): void {
  const byName = indexSymbols(symbols);

  for (const symbol of symbols) {
    const callees = readRelations(root, "callees", symbol);
    for (const callee of callees) {
      const target = findRelationTarget(byName, callee);
      if (!target) continue;
      addEdge(edgeMap, relationEdge(symbol, target, "calls", 0.9, "CodeGraph call"));
      addEdge(edgeMap, relationEdge(symbol, target, "references", 0.75, "CodeGraph call reference"));
    }

    const callers = readRelations(root, "callers", symbol);
    for (const caller of callers) {
      const source = findRelationTarget(byName, caller);
      if (!source) continue;
      addEdge(edgeMap, relationEdge(source, symbol, "calls", 0.88, "CodeGraph caller"));
      addEdge(edgeMap, relationEdge(source, symbol, "references", 0.75, "CodeGraph caller reference"));
    }
  }
}

function readRelations(root: string, direction: "callers" | "callees", symbol: CodeFactNode): CodeGraphRelationNode[] {
  const result = runCodeGraph([direction, symbol.name, "--path", root, "--json"], { allowFailure: true });
  if (!result.ok) return [];
  const parsed = safeJson(result.stdout);
  if (!isRecord(parsed)) return [];
  const relations = parsed as CodeGraphRelationResponse;
  const values = direction === "callers" ? relations.callers : relations.callees;
  return Array.isArray(values) ? values.filter(isRecord) as CodeGraphRelationNode[] : [];
}

function indexSymbols(symbols: CodeFactNode[]): Map<string, CodeFactNode[]> {
  const result = new Map<string, CodeFactNode[]>();
  for (const symbol of symbols) {
    const entries = result.get(symbol.name) ?? [];
    entries.push(symbol);
    result.set(symbol.name, entries);
  }
  return result;
}

function findRelationTarget(symbolsByName: Map<string, CodeFactNode[]>, relation: CodeGraphRelationNode): CodeFactNode | undefined {
  if (typeof relation.name !== "string") return undefined;
  const candidates = symbolsByName.get(relation.name) ?? [];
  const relationPath = typeof relation.filePath === "string" ? normalizeRepositoryPath(relation.filePath) : undefined;
  const relationLine = positiveNumber(relation.startLine);
  return (
    candidates.find((candidate) => candidate.filePath === relationPath && candidate.range?.startLine === relationLine) ??
    candidates.find((candidate) => candidate.filePath === relationPath) ??
    candidates[0]
  );
}

function relationEdge(source: CodeFactNode, target: CodeFactNode, kind: "calls" | "references", confidence: number, label: string): CodeFactEdge {
  return {
    id: edgeId(source.id, kind, target.id, `${source.qualifiedName}->${target.qualifiedName}`),
    kind,
    sourceId: source.id,
    targetId: target.id,
    filePath: source.filePath,
    range: source.range ? { startLine: source.range.startLine, endLine: source.range.endLine } : undefined,
    confidence,
    evidence: [codeGraphEvidence(source.filePath, source.range?.startLine, `${label}: ${source.name} -> ${target.name}`)]
  };
}

function addRepositoryStructureFacts(repository: RepositorySnapshot, importNodesByKey: Map<string, CodeFactNode>, edgeMap: Map<string, CodeFactEdge>): void {
  for (const file of repository.files) {
    const sourceFileNodeId = fileNodeId(file.path);
    addEdge(edgeMap, {
      id: edgeId("code:project-root", "contains", sourceFileNodeId, file.path),
      kind: "contains",
      sourceId: "code:project-root",
      targetId: sourceFileNodeId,
      filePath: file.path,
      confidence: 1,
      evidence: [repositoryEvidence(file.path)]
    });

    for (const importedPath of file.importedPaths) {
      const importNode = getImportNode(importNodesByKey, file, importedPath);
      addEdge(edgeMap, {
        id: edgeId(sourceFileNodeId, "imports", importNode.id, importedPath),
        kind: "imports",
        sourceId: sourceFileNodeId,
        targetId: importNode.id,
        filePath: file.path,
        confidence: 0.85,
        evidence: [repositoryEvidence(file.path, `Import observed: ${importedPath}`)]
      });
    }
  }
}

function toRootNode(repository: RepositorySnapshot): CodeFactNode {
  return {
    id: "code:project-root",
    kind: "project",
    name: repository.name,
    qualifiedName: repository.name,
    filePath: ".",
    language: "Repository",
    evidence: [{ source: "repository_scan", filePath: "." }]
  };
}

function toCodeFactFile(file: SourceFileSummary, codeGraphFiles: Map<string, CodeGraphFileRecord>): CodeFactFile {
  const codeGraphFile = codeGraphFiles.get(file.path);
  const id = fileNodeId(file.path);
  return {
    id,
    path: file.path,
    language: codeGraphFile?.language ?? file.language,
    extension: file.extension,
    sizeBytes: codeGraphFile?.size ?? file.sizeBytes,
    lineCount: file.lineCount,
    roleHint: file.roleHint,
    nodeIds: [id],
    evidence: [codeGraphFiles.has(file.path) ? codeGraphEvidence(file.path, undefined, "CodeGraph indexed file") : repositoryEvidence(file.path)]
  };
}

function toFileNode(file: SourceFileSummary, codeGraphFiles: Map<string, CodeGraphFileRecord>): CodeFactNode {
  return {
    id: fileNodeId(file.path),
    kind: "file",
    name: path.posix.basename(file.path),
    qualifiedName: file.path,
    filePath: file.path,
    language: codeGraphFiles.get(file.path)?.language ?? file.language,
    range: file.lineCount > 0 ? { startLine: 1, endLine: file.lineCount } : undefined,
    evidence: [codeGraphFiles.has(file.path) ? codeGraphEvidence(file.path, undefined, "CodeGraph indexed file") : repositoryEvidence(file.path)]
  };
}

function getImportNode(importNodesByKey: Map<string, CodeFactNode>, file: SourceFileSummary, importedPath: string): CodeFactNode {
  const key = `${file.language}:${importedPath}`;
  const existing = importNodesByKey.get(key);
  if (existing) return existing;
  const node: CodeFactNode = {
    id: `code:import:${slugify(key)}`,
    kind: "import",
    name: importedPath,
    qualifiedName: importedPath,
    filePath: file.path,
    language: file.language,
    evidence: [repositoryEvidence(file.path, `Import observed: ${importedPath}`)]
  };
  importNodesByKey.set(key, node);
  return node;
}

function buildStatistics(files: CodeFactFile[], nodes: CodeFactNode[], edges: CodeFactEdge[]) {
  return {
    fileCount: files.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    filesByLanguage: countBy(files, (file) => file.language),
    nodesByKind: countBy(nodes, (node) => node.kind),
    edgesByKind: countBy(edges, (edge) => edge.kind)
  };
}

function buildWarnings(status: CodeGraphStatus | undefined, symbolNodes: CodeFactNode[], edges: CodeFactEdge[], symbolCandidateCount: number): CodeFactWarning[] {
  const warnings: CodeFactWarning[] = [];
  if (!status?.initialized) {
    warnings.push({
      id: "code-fact-warning:codegraph-status-unavailable",
      severity: "warning",
      summary: "CodeGraph indexing completed, but status output was unavailable."
    });
  }
  if (symbolNodes.length === 0) {
    warnings.push({
      id: "code-fact-warning:codegraph-no-symbols",
      severity: "warning",
      summary: "CodeGraph provider produced no symbol facts for this repository."
    });
  }
  if (!edges.some((edge) => edge.kind === "calls")) {
    warnings.push({
      id: "code-fact-warning:codegraph-no-call-edges",
      severity: "info",
      summary: "CodeGraph provider produced no call edges; this can be normal for small or non-TypeScript projects."
    });
  }
  if (symbolCandidateCount > CODEGRAPH_SYMBOL_QUERY_LIMIT) {
    warnings.push({
      id: "code-fact-warning:codegraph-symbol-query-limit",
      severity: "info",
      summary: `CodeGraph symbol discovery was capped at ${CODEGRAPH_SYMBOL_QUERY_LIMIT} candidate queries for this MVP provider.`
    });
  }
  return warnings;
}

function runCodeGraph(args: string[], options: { allowFailure?: boolean } = {}): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [codeGraphShimPath(), ...args], {
    encoding: "utf8",
    maxBuffer: CODEGRAPH_JSON_BUFFER_BYTES,
    windowsHide: true
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const ok = result.status === 0 && !result.error;
  if (!ok && !options.allowFailure) {
    const command = `codegraph ${args.join(" ")}`;
    const detail = stderr.trim() || stdout.trim() || result.error?.message || "unknown error";
    throw new Error(`CodeGraph command failed: ${command}\n${detail}`);
  }
  return { ok, stdout, stderr };
}

function codeGraphShimPath(): string {
  return require.resolve("@colbymchenry/codegraph/npm-shim.js");
}

function addEdge(edgeMap: Map<string, CodeFactEdge>, edge: CodeFactEdge): void {
  edgeMap.set(edge.id, edge);
}

function codeGraphEvidence(filePath: string, startLine?: number, excerpt?: string): CodeFactEvidenceRef {
  return {
    source: "codegraph",
    filePath,
    startLine,
    endLine: startLine,
    excerpt
  };
}

function repositoryEvidence(filePath: string, excerpt?: string): CodeFactEvidenceRef {
  return {
    source: "repository_scan",
    filePath,
    excerpt
  };
}

function fileNodeId(filePath: string): string {
  return `code:file:${slugify(filePath)}`;
}

function symbolNodeId(rawNode: CodeGraphRawNode, name: string, filePath: string, startLine?: number): string {
  if (typeof rawNode.id === "string" && rawNode.id) return `codegraph:${slugify(rawNode.id)}`;
  return `code:symbol:${slugify(`${filePath}:${name}:${startLine ?? "unknown"}`)}`;
}

function edgeId(sourceId: string, kind: CodeFactEdgeKind, targetId: string, salt: string): string {
  return `code-edge:${slugify(`${sourceId}:${kind}:${targetId}:${salt}`)}`;
}

function toCodeFactNodeKind(kind: string | undefined): CodeFactNodeKind {
  switch (kind) {
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "method":
      return "method";
    case "property":
      return "property";
    case "field":
      return "field";
    case "variable":
      return "variable";
    case "constant":
      return "constant";
    case "enum":
      return "enum";
    case "type":
    case "type_alias":
      return "type_alias";
    case "namespace":
      return "namespace";
    case "function":
    default:
      return "function";
  }
}

function toVisibility(value: unknown): "public" | "private" | "protected" | "internal" | undefined {
  return value === "public" || value === "private" || value === "protected" || value === "internal" ? value : undefined;
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}
