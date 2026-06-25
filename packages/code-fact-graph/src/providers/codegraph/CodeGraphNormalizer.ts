import path from "node:path";
import { slugify } from "@praxis/core";
import type { RepositorySnapshot, SourceFileSummary } from "@praxis/repository-scanner";
import type {
  CodeFactEdge,
  CodeFactEdgeKind,
  CodeFactEvidenceRef,
  CodeFactFile,
  CodeFactGraphSnapshot,
  CodeFactNode,
  CodeFactNodeKind,
  CodeFactProviderInfo,
  CodeFactStatistics,
  CodeFactWarning
} from "@praxis/schema";
import type { CodeGraphFallbackResult, CodeGraphIndexedEdge, CodeGraphIndexedFile, CodeGraphIndexedNode, CodeGraphIndexReadResult } from "./CodeGraphTypes.js";

export function normalizeCodeGraphSnapshot(input: {
  repository: RepositorySnapshot;
  index: CodeGraphIndexReadResult;
  fallback: CodeGraphFallbackResult;
  provider: CodeFactProviderInfo;
}): CodeFactGraphSnapshot {
  const repositoryFilePaths = new Set(input.repository.files.map((file) => normalizeRepositoryPath(file.path)));
  const indexedFiles = mergeIndexedFiles(input.index.files, input.repository.files);
  const indexedNodes = mergeIndexedNodes(input.index.nodes, input.fallback.nodes, repositoryFilePaths);
  const indexedEdges = mergeIndexedEdges(input.index.edges, input.fallback.edges);
  const scannerFilesByPath = new Map(input.repository.files.map((file) => [normalizeRepositoryPath(file.path), file]));
  const indexedFilesByPath = new Map(indexedFiles.map((file) => [file.path, file]));
  const files = Array.from(new Set([...indexedFilesByPath.keys(), ...scannerFilesByPath.keys()]))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => toCodeFactFile(filePath, indexedFilesByPath.get(filePath), scannerFilesByPath.get(filePath)));

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const rootNode = toRootNode(input.repository);
  const nodeMap = new Map<string, CodeFactNode>([[rootNode.id, rootNode]]);
  const edgeMap = new Map<string, CodeFactEdge>();
  const codeGraphNodeIdMap = new Map<string, string>();

  for (const file of files) {
    const node = toFileNode(file);
    nodeMap.set(node.id, node);
    addEdge(edgeMap, {
      id: edgeId("code:project-root", "contains", node.id, file.path),
      kind: "contains",
      sourceId: "code:project-root",
      targetId: node.id,
      filePath: file.path,
      confidence: 1,
      evidence: [file.evidence[0] ?? repositoryEvidence(file.path)]
    });
  }

  for (const indexedNode of indexedNodes) {
    if (indexedNode.kind === "file") {
      codeGraphNodeIdMap.set(indexedNode.id, fileNodeId(indexedNode.filePath));
      continue;
    }
    const node = toSymbolNode(indexedNode);
    codeGraphNodeIdMap.set(indexedNode.id, node.id);
    if (nodeMap.has(node.id)) continue;
    nodeMap.set(node.id, node);
    const file = filesByPath.get(node.filePath);
    if (file && !file.nodeIds.includes(node.id)) file.nodeIds.push(node.id);
  }

  addRepositoryImportFacts(input.repository.files, edgeMap, nodeMap);
  addIndexedEdges(indexedEdges, indexedNodes, codeGraphNodeIdMap, edgeMap);
  addMissingSymbolContainmentEdges(indexedNodes, codeGraphNodeIdMap, edgeMap);

  const nodes = Array.from(nodeMap.values());
  const edges = Array.from(edgeMap.values());
  return {
    schemaVersion: "praxis.codeFactGraph.v1",
    root: input.repository.root,
    generatedAt: new Date().toISOString(),
    provider: input.provider,
    files,
    nodes,
    edges,
    statistics: buildStatistics(files, nodes, edges),
    warnings: buildWarnings(input.index, input.fallback, indexedNodes, edges)
  };
}

export function hasRepositoryImportFacts(repository: RepositorySnapshot): boolean {
  return repository.files.some((file) => file.importedPaths.length > 0);
}

function mergeIndexedFiles(indexFiles: CodeGraphIndexedFile[], scannerFiles: SourceFileSummary[]): CodeGraphIndexedFile[] {
  const files = new Map<string, CodeGraphIndexedFile>();
  for (const file of scannerFiles) {
    const filePath = normalizeRepositoryPath(file.path);
    files.set(filePath, {
      path: filePath,
      language: file.language,
      size: file.sizeBytes
    });
  }
  for (const file of indexFiles) {
    const filePath = normalizeRepositoryPath(file.path);
    const existing = files.get(filePath);
    if (!existing) continue;
    files.set(filePath, { ...existing, ...file, path: filePath });
  }
  return Array.from(files.values());
}

function mergeIndexedNodes(
  indexNodes: CodeGraphIndexedNode[],
  fallbackNodes: CodeGraphIndexedNode[],
  repositoryFilePaths: Set<string>
): CodeGraphIndexedNode[] {
  const nodes = new Map<string, CodeGraphIndexedNode>();
  for (const node of indexNodes) {
    const filePath = normalizeRepositoryPath(node.filePath);
    if (!repositoryFilePaths.has(filePath)) continue;
    nodes.set(node.id, { ...node, filePath });
  }
  if (nodes.size === 0) {
    for (const node of fallbackNodes) {
      const filePath = normalizeRepositoryPath(node.filePath);
      if (!repositoryFilePaths.has(filePath)) continue;
      nodes.set(node.id, { ...node, filePath });
    }
  }
  return Array.from(nodes.values());
}

function mergeIndexedEdges(indexEdges: CodeGraphIndexedEdge[], fallbackEdges: CodeGraphIndexedEdge[]): CodeGraphIndexedEdge[] {
  const edges = new Map<string, CodeGraphIndexedEdge>();
  for (const edge of indexEdges) edges.set(edge.id, edge);
  if (!Array.from(edges.values()).some((edge) => edge.kind === "calls")) {
    for (const edge of fallbackEdges) edges.set(edge.id, edge);
  }
  return Array.from(edges.values());
}

function toCodeFactFile(filePath: string, indexedFile: CodeGraphIndexedFile | undefined, scannerFile: SourceFileSummary | undefined): CodeFactFile {
  const id = fileNodeId(filePath);
  return {
    id,
    path: filePath,
    language: indexedFile?.language ?? scannerFile?.language ?? "unknown",
    extension: scannerFile?.extension ?? path.posix.extname(filePath),
    sizeBytes: indexedFile?.size ?? scannerFile?.sizeBytes ?? 0,
    hash: indexedFile?.contentHash,
    lineCount: scannerFile?.lineCount ?? 0,
    roleHint: scannerFile?.roleHint ?? "source",
    nodeIds: [id],
    evidence: [indexedFile ? codeGraphEvidence(filePath, undefined, "CodeGraph indexed file") : repositoryEvidence(filePath)]
  };
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

function toFileNode(file: CodeFactFile): CodeFactNode {
  return {
    id: file.id,
    kind: "file",
    name: path.posix.basename(file.path),
    qualifiedName: file.path,
    filePath: file.path,
    language: file.language,
    range: file.lineCount > 0 ? { startLine: 1, endLine: file.lineCount } : undefined,
    evidence: file.evidence
  };
}

function toSymbolNode(indexedNode: CodeGraphIndexedNode): CodeFactNode {
  return {
    id: symbolNodeId(indexedNode),
    kind: toCodeFactNodeKind(indexedNode.kind),
    name: indexedNode.name,
    qualifiedName: indexedNode.qualifiedName,
    filePath: normalizeRepositoryPath(indexedNode.filePath),
    language: indexedNode.language,
    range: indexedNode.range,
    signature: indexedNode.signature,
    docSummary: indexedNode.docstring,
    visibility: toVisibility(indexedNode.visibility),
    evidence: [codeGraphEvidence(indexedNode.filePath, indexedNode.range.startLine, `CodeGraph symbol: ${indexedNode.qualifiedName}`)]
  };
}

function addRepositoryImportFacts(files: SourceFileSummary[], edgeMap: Map<string, CodeFactEdge>, nodeMap: Map<string, CodeFactNode>): void {
  const importNodesByKey = new Map<string, CodeFactNode>();
  for (const file of files) {
    const filePath = normalizeRepositoryPath(file.path);
    const sourceFileNodeId = fileNodeId(filePath);
    for (const importedPath of file.importedPaths) {
      const importNode = getImportNode(importNodesByKey, file, importedPath);
      nodeMap.set(importNode.id, importNode);
      addEdge(edgeMap, {
        id: edgeId(sourceFileNodeId, "imports", importNode.id, importedPath),
        kind: "imports",
        sourceId: sourceFileNodeId,
        targetId: importNode.id,
        filePath,
        confidence: 0.85,
        evidence: [repositoryEvidence(filePath, `Import observed: ${importedPath}`)]
      });
    }
  }
}

function addIndexedEdges(
  indexedEdges: CodeGraphIndexedEdge[],
  indexedNodes: CodeGraphIndexedNode[],
  codeGraphNodeIdMap: Map<string, string>,
  edgeMap: Map<string, CodeFactEdge>
): void {
  const indexedNodesById = new Map(indexedNodes.map((node) => [node.id, node]));
  for (const indexedEdge of indexedEdges) {
    const sourceId = codeGraphNodeIdMap.get(indexedEdge.source);
    const targetId = codeGraphNodeIdMap.get(indexedEdge.target);
    if (!sourceId || !targetId) continue;
    const sourceNode = indexedNodesById.get(indexedEdge.source);
    const filePath = normalizeRepositoryPath(sourceNode?.filePath ?? indexedNodesById.get(indexedEdge.target)?.filePath ?? ".");
    const kind = toCodeFactEdgeKind(indexedEdge.kind);
    addEdge(edgeMap, {
      id: `codegraph-edge:${slugify(`${indexedEdge.id}:${sourceId}:${kind}:${targetId}`)}`,
      kind,
      sourceId,
      targetId,
      filePath,
      range: indexedEdge.line ? { startLine: indexedEdge.line, startColumn: indexedEdge.col } : undefined,
      confidence: edgeConfidence(indexedEdge),
      evidence: [codeGraphEvidence(filePath, indexedEdge.line, `CodeGraph ${kind}: ${indexedEdge.source} -> ${indexedEdge.target}`)]
    });
    if (kind === "calls") {
      addEdge(edgeMap, {
        id: `codegraph-edge:${slugify(`${indexedEdge.id}:${sourceId}:references:${targetId}`)}`,
        kind: "references",
        sourceId,
        targetId,
        filePath,
        range: indexedEdge.line ? { startLine: indexedEdge.line, startColumn: indexedEdge.col } : undefined,
        confidence: Math.min(edgeConfidence(indexedEdge), 0.8),
        evidence: [codeGraphEvidence(filePath, indexedEdge.line, `CodeGraph call reference: ${indexedEdge.source} -> ${indexedEdge.target}`)]
      });
    }
  }
}

function addMissingSymbolContainmentEdges(indexedNodes: CodeGraphIndexedNode[], codeGraphNodeIdMap: Map<string, string>, edgeMap: Map<string, CodeFactEdge>): void {
  for (const indexedNode of indexedNodes) {
    if (indexedNode.kind === "file") continue;
    const symbolId = codeGraphNodeIdMap.get(indexedNode.id);
    if (!symbolId) continue;
    const fileId = fileNodeId(indexedNode.filePath);
    const containsEdge = edgeId(fileId, "contains", symbolId, indexedNode.qualifiedName);
    if (edgeMap.has(containsEdge) || hasEdge(edgeMap, "contains", fileId, symbolId)) continue;
    addEdge(edgeMap, {
      id: containsEdge,
      kind: "contains",
      sourceId: fileId,
      targetId: symbolId,
      filePath: indexedNode.filePath,
      range: { startLine: indexedNode.range.startLine, endLine: indexedNode.range.endLine },
      confidence: 0.92,
      evidence: [codeGraphEvidence(indexedNode.filePath, indexedNode.range.startLine, `CodeGraph symbol containment: ${indexedNode.qualifiedName}`)]
    });
  }
}

function getImportNode(importNodesByKey: Map<string, CodeFactNode>, file: SourceFileSummary, importedPath: string): CodeFactNode {
  const filePath = normalizeRepositoryPath(file.path);
  const key = `${file.language}:${importedPath}`;
  const existing = importNodesByKey.get(key);
  if (existing) return existing;
  const node: CodeFactNode = {
    id: `code:import:${slugify(key)}`,
    kind: "import",
    name: importedPath,
    qualifiedName: importedPath,
    filePath,
    language: file.language,
    evidence: [repositoryEvidence(filePath, `Import observed: ${importedPath}`)]
  };
  importNodesByKey.set(key, node);
  return node;
}

function buildStatistics(files: CodeFactFile[], nodes: CodeFactNode[], edges: CodeFactEdge[]): CodeFactStatistics {
  return {
    fileCount: files.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    filesByLanguage: countBy(files, (file) => file.language),
    nodesByKind: countBy(nodes, (node) => node.kind),
    edgesByKind: countBy(edges, (edge) => edge.kind)
  };
}

function buildWarnings(index: CodeGraphIndexReadResult, fallback: CodeGraphFallbackResult, nodes: CodeGraphIndexedNode[], edges: CodeFactEdge[]): CodeFactWarning[] {
  const warnings: CodeFactWarning[] = [
    ...index.warnings.map((summary, index) => ({
      id: `code-fact-warning:codegraph-index-${index + 1}`,
      severity: "warning" as const,
      summary
    })),
    ...fallback.warnings.map((summary, index) => ({
      id: `code-fact-warning:codegraph-fallback-${index + 1}`,
      severity: "info" as const,
      summary
    }))
  ];
  if (nodes.filter((node) => node.kind !== "file").length === 0) {
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
      summary: "CodeGraph provider produced no call edges; this can be normal when the index has no resolved calls."
    });
  }
  if (index.readMode === "cli_fallback") {
    warnings.push({
      id: "code-fact-warning:codegraph-cli-fallback",
      severity: "warning",
      summary: "CodeGraph provider used CLI fallback instead of direct index reads."
    });
  }
  return warnings;
}

function addEdge(edgeMap: Map<string, CodeFactEdge>, edge: CodeFactEdge): void {
  edgeMap.set(edge.id, edge);
}

function hasEdge(edgeMap: Map<string, CodeFactEdge>, kind: CodeFactEdgeKind, sourceId: string, targetId: string): boolean {
  return Array.from(edgeMap.values()).some((edge) => edge.kind === kind && edge.sourceId === sourceId && edge.targetId === targetId);
}

function codeGraphEvidence(filePath: string, startLine?: number, excerpt?: string): CodeFactEvidenceRef {
  return {
    source: "codegraph",
    filePath: normalizeRepositoryPath(filePath),
    startLine,
    endLine: startLine,
    excerpt
  };
}

function repositoryEvidence(filePath: string, excerpt?: string): CodeFactEvidenceRef {
  return {
    source: "repository_scan",
    filePath: normalizeRepositoryPath(filePath),
    excerpt
  };
}

function fileNodeId(filePath: string): string {
  return `code:file:${slugify(normalizeRepositoryPath(filePath))}`;
}

function symbolNodeId(indexedNode: CodeGraphIndexedNode): string {
  return `codegraph:${slugify(indexedNode.id)}`;
}

function edgeId(sourceId: string, kind: CodeFactEdgeKind, targetId: string, salt: string): string {
  return `code-edge:${slugify(`${sourceId}:${kind}:${targetId}:${salt}`)}`;
}

function edgeConfidence(edge: CodeGraphIndexedEdge): number {
  const value = edge.metadata?.confidence;
  return typeof value === "number" && value >= 0 && value <= 1 ? value : 0.9;
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

function toCodeFactEdgeKind(kind: string | undefined): CodeFactEdgeKind {
  switch (kind) {
    case "contains":
    case "calls":
    case "imports":
    case "exports":
    case "extends":
    case "implements":
    case "references":
    case "type_of":
    case "returns":
    case "instantiates":
    case "overrides":
    case "decorates":
    case "impacts":
      return kind;
    default:
      return "references";
  }
}

function toVisibility(value: unknown): "public" | "private" | "protected" | "internal" | undefined {
  return value === "public" || value === "private" || value === "protected" || value === "internal" ? value : undefined;
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}
