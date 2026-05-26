import path from "node:path";
import { scanRepository, type RepositorySnapshot } from "@praxis/repository-scanner";
import { CodeFactGraphSnapshotSchema, type CodeFactCapability, type CodeFactGraphSnapshot } from "@praxis/schema";
import type { CodeFactGraphBuildOptions, CodeFactGraphProvider } from "../../index.js";
import { CodeGraphCli } from "./CodeGraphCli.js";
import { detectCodeGraphCapabilities } from "./CodeGraphCapabilities.js";
import { CodeGraphFallbackQuery } from "./CodeGraphFallbackQuery.js";
import { SqliteCodeGraphIndexReader } from "./CodeGraphIndexReader.js";
import { hasRepositoryImportFacts, normalizeCodeGraphSnapshot } from "./CodeGraphNormalizer.js";
import type { CodeGraphIndexedEdge, CodeGraphIndexedFile, CodeGraphIndexedNode } from "./CodeGraphTypes.js";

export class CodeGraphCodeFactGraphProvider implements CodeFactGraphProvider {
  name = "codegraph";
  source = "codegraph" as const;
  capabilities: CodeFactCapability[] = ["file_structure"];

  private readonly cli = new CodeGraphCli();
  private readonly indexReader = new SqliteCodeGraphIndexReader(this.cli);
  private readonly fallback = new CodeGraphFallbackQuery(this.cli);

  async isAvailable(root: string): Promise<boolean> {
    return this.indexReader.isAvailable(root);
  }

  async buildSnapshot(root: string, options: CodeFactGraphBuildOptions = {}): Promise<CodeFactGraphSnapshot> {
    const resolvedRoot = path.resolve(root);
    const repository = await scanRepository({ root: resolvedRoot, ...options });
    const index = await this.indexReader.readIndex(resolvedRoot);
    const fallback = shouldUseFallback(index.nodes, index.edges) ? this.fallback.queryFromSourceCandidates(resolvedRoot, repository.files) : { nodes: [], edges: [], warnings: [] };
    const capabilities = detectCapabilities(repository, index.files, index.nodes, index.edges, fallback.nodes, fallback.edges);

    this.capabilities = capabilities;

    const snapshot = normalizeCodeGraphSnapshot({
      repository,
      index,
      fallback,
      provider: {
        name: this.name,
        source: this.source,
        version: this.cli.version(),
        runId: `code-facts:codegraph:${Date.now()}`,
        capabilities
      }
    });

    return CodeFactGraphSnapshotSchema.parse(snapshot);
  }
}

function shouldUseFallback(nodes: CodeGraphIndexedNode[], edges: CodeGraphIndexedEdge[]): boolean {
  return nodes.filter((node) => node.kind !== "file").length === 0 || !edges.some((edge) => edge.kind === "calls");
}

function detectCapabilities(
  repository: RepositorySnapshot,
  indexFiles: CodeGraphIndexedFile[],
  indexNodes: CodeGraphIndexedNode[],
  indexEdges: CodeGraphIndexedEdge[],
  fallbackNodes: CodeGraphIndexedNode[],
  fallbackEdges: CodeGraphIndexedEdge[]
): CodeFactCapability[] {
  const files =
    indexFiles.length > 0
      ? indexFiles
      : repository.files.map((file) => ({
          path: file.path,
          language: file.language,
          size: file.sizeBytes
        }));
  const nodes = indexNodes.length > 0 ? indexNodes : fallbackNodes;
  const edges = indexEdges.some((edge) => edge.kind === "calls") ? indexEdges : [...indexEdges, ...fallbackEdges];
  const capabilities = detectCodeGraphCapabilities({
    files,
    nodes,
    edges,
    hasRepositoryImportFacts: hasRepositoryImportFacts(repository)
  });
  return capabilities.length > 0 ? capabilities : ["file_structure"];
}
