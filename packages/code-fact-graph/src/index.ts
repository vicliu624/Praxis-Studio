import path from "node:path";
import { createEvidence, slugify, type Confidence } from "@praxis/core";
import { scanRepository, toRepositoryPath, type RepositorySnapshot, type SourceFileSummary } from "@praxis/repository-scanner";
import type {
  CodeFactCapability,
  CodeFactEdge,
  CodeFactEdgeKind,
  CodeFactEvidenceRef,
  CodeFactFile,
  CodeFactGraphSnapshot,
  CodeFactNode,
  CodeFactProviderInfo,
  CodeFactProviderSource,
  CodeFactStatistics,
  CodeFactWarning
} from "@praxis/schema";

export type {
  CodeFactCapability,
  CodeFactEdge,
  CodeFactEdgeKind,
  CodeFactEvidenceRef,
  CodeFactFile,
  CodeFactGraphSnapshot,
  CodeFactNode,
  CodeFactNodeKind,
  CodeFactProviderInfo,
  CodeFactProviderSource,
  CodeFactRange,
  CodeFactStatistics,
  CodeFactWarning
} from "@praxis/schema";

export interface CodeFactGraphBuildOptions {
  maxFiles?: number;
  maxFileSizeBytes?: number;
  includeHidden?: boolean;
}

export interface CodeFactGraphProvider {
  name: string;
  source: CodeFactProviderSource;
  capabilities: CodeFactCapability[];
  isAvailable(root: string): Promise<boolean>;
  buildSnapshot(root: string, options?: CodeFactGraphBuildOptions): Promise<CodeFactGraphSnapshot>;
}

export class NativeHeuristicCodeFactGraphProvider implements CodeFactGraphProvider {
  name = "native-heuristic";
  source: CodeFactProviderSource = "native";
  capabilities: CodeFactCapability[] = ["file_structure", "imports_exports"];

  async isAvailable(_root: string): Promise<boolean> {
    return true;
  }

  async buildSnapshot(root: string, options: CodeFactGraphBuildOptions = {}): Promise<CodeFactGraphSnapshot> {
    const snapshot = await scanRepository({ root, ...options });
    return buildNativeCodeFactGraphSnapshot(snapshot, {
      name: this.name,
      source: this.source,
      version: "0.1.0-alpha.0",
      runId: `code-facts:native:${Date.now()}`,
      capabilities: this.capabilities
    });
  }
}

export async function buildCodeFactGraphSnapshot(
  root: string,
  options: CodeFactGraphBuildOptions & { provider?: CodeFactProviderSource } = {}
): Promise<CodeFactGraphSnapshot> {
  if (options.provider && options.provider !== "native") {
    throw new Error(`Code fact provider is not implemented yet: ${options.provider}`);
  }
  const provider = new NativeHeuristicCodeFactGraphProvider();
  if (!(await provider.isAvailable(root))) throw new Error(`Code fact provider is unavailable: ${provider.name}`);
  return provider.buildSnapshot(root, options);
}

export function buildNativeCodeFactGraphSnapshot(snapshot: RepositorySnapshot, provider: CodeFactProviderInfo): CodeFactGraphSnapshot {
  const rootNode: CodeFactNode = {
    id: "code:project-root",
    kind: "project",
    name: snapshot.name,
    qualifiedName: snapshot.name,
    filePath: ".",
    language: "Repository",
    evidence: [
      {
        source: "repository_scan",
        filePath: "."
      }
    ]
  };

  const files = snapshot.files.map(toCodeFactFile);
  const fileNodes = snapshot.files.map((file) => toFileNode(file));
  const importNodesByKey = new Map<string, CodeFactNode>();
  const edges: CodeFactEdge[] = [];

  for (const file of snapshot.files) {
    const sourceFileNodeId = fileNodeId(file.path);
    edges.push({
      id: edgeId("code:project-root", "contains", sourceFileNodeId, file.path),
      kind: "contains",
      sourceId: "code:project-root",
      targetId: sourceFileNodeId,
      filePath: file.path,
      confidence: 1,
      evidence: [evidenceForFile(file.path)]
    });

    for (const importedPath of file.importedPaths) {
      const importNode = getImportNode(importNodesByKey, file, importedPath);
      edges.push({
        id: edgeId(sourceFileNodeId, "imports", importNode.id, importedPath),
        kind: "imports",
        sourceId: sourceFileNodeId,
        targetId: importNode.id,
        filePath: file.path,
        confidence: 0.85,
        evidence: [evidenceForFile(file.path, `Import observed: ${importedPath}`)]
      });
    }
  }

  const nodes = [rootNode, ...fileNodes, ...importNodesByKey.values()];
  const statistics = buildStatistics(files, nodes, edges);
  return {
    schemaVersion: "praxis.codeFactGraph.v1",
    root: snapshot.root,
    generatedAt: new Date().toISOString(),
    provider,
    files,
    nodes,
    edges,
    statistics,
    warnings: buildWarnings(snapshot)
  };
}

function toCodeFactFile(file: SourceFileSummary): CodeFactFile {
  const id = fileNodeId(file.path);
  return {
    id,
    path: file.path,
    language: file.language,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    lineCount: file.lineCount,
    roleHint: file.roleHint,
    nodeIds: [id],
    evidence: [evidenceForFile(file.path)]
  };
}

function toFileNode(file: SourceFileSummary): CodeFactNode {
  return {
    id: fileNodeId(file.path),
    kind: "file",
    name: path.posix.basename(file.path),
    qualifiedName: file.path,
    filePath: file.path,
    language: file.language,
    range: file.lineCount > 0 ? { startLine: 1, endLine: file.lineCount } : undefined,
    evidence: [evidenceForFile(file.path)]
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
    evidence: [evidenceForFile(file.path, `Import observed: ${importedPath}`)]
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

function buildWarnings(snapshot: RepositorySnapshot): CodeFactWarning[] {
  const warnings: CodeFactWarning[] = [];
  if (snapshot.files.length === 0) {
    warnings.push({
      id: "code-fact-warning:no-files",
      severity: "warning",
      summary: "No source files were available to the native code fact provider."
    });
  }
  warnings.push({
    id: "code-fact-warning:native-provider-limited",
    severity: "info",
    summary: "Native provider records file and import facts only; symbol, call, and reference facts require a stronger provider."
  });
  return warnings;
}

function evidenceForFile(filePath: string, excerpt?: string): CodeFactEvidenceRef {
  return {
    source: "repository_scan",
    filePath,
    excerpt
  };
}

function fileNodeId(filePath: string): string {
  return `code:file:${slugify(filePath)}`;
}

function edgeId(sourceId: string, kind: CodeFactEdgeKind, targetId: string, salt: string): string {
  return `code-edge:${slugify(`${sourceId}:${kind}:${targetId}:${salt}`)}`;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

export function codeFactEvidenceToCoreEvidence(fact: CodeFactEvidenceRef, confidence: Confidence = "high") {
  return createEvidence({
    kind: fact.source === "agent_inference" ? "INFERENCE" : fact.source === "user_confirmation" ? "CONFIRMED" : "FACT",
    source: fact.source,
    summary: fact.excerpt ?? `Code fact evidence at ${fact.filePath}`,
    confidence,
    references: [toRepositoryPath(fact.filePath)]
  });
}
