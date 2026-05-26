import { readFileSync } from "node:fs";
import path from "node:path";
import type { SourceFileSummary } from "@praxis/repository-scanner";
import { CodeGraphCli } from "./CodeGraphCli.js";
import type { CodeGraphFallbackResult, CodeGraphIndexedEdge, CodeGraphIndexedNode, CodeGraphRawQueryNode, CodeGraphRelation } from "./CodeGraphTypes.js";

const CODEGRAPH_SYMBOL_QUERY_LIMIT = 250;

export class CodeGraphFallbackQuery {
  constructor(private readonly cli = new CodeGraphCli()) {}

  queryFromSourceCandidates(root: string, files: SourceFileSummary[]): CodeGraphFallbackResult {
    const candidates = extractSymbolCandidates(root, files);
    const queriedCandidates = candidates.slice(0, CODEGRAPH_SYMBOL_QUERY_LIMIT);
    const nodesById = new Map<string, CodeGraphIndexedNode>();
    const warnings: string[] = [];

    for (const candidate of queriedCandidates) {
      for (const rawNode of this.cli.querySymbols(root, candidate, 20)) {
        const node = toIndexedNode(rawNode, candidate);
        if (node) nodesById.set(node.id, node);
      }
    }

    const nodes = Array.from(nodesById.values());
    const edges = queryRelationEdges(root, nodes, this.cli);
    if (candidates.length > CODEGRAPH_SYMBOL_QUERY_LIMIT) {
      warnings.push(`CodeGraph CLI fallback symbol discovery was capped at ${CODEGRAPH_SYMBOL_QUERY_LIMIT} candidate queries.`);
    }
    if (nodes.length > 0) {
      warnings.push("CodeGraph provider used CLI query fallback because the full SQLite index was unavailable or incomplete.");
    }

    return { nodes, edges, warnings };
  }
}

function queryRelationEdges(root: string, nodes: CodeGraphIndexedNode[], cli: CodeGraphCli): CodeGraphIndexedEdge[] {
  const byName = indexNodes(nodes);
  const edges = new Map<string, CodeGraphIndexedEdge>();

  for (const source of nodes) {
    for (const callee of cli.readRelations(root, "callees", source.name)) {
      const target = findRelationNode(byName, callee);
      if (!target) continue;
      const id = `fallback-calls:${source.id}:${target.id}`;
      edges.set(id, {
        id,
        source: source.id,
        target: target.id,
        kind: "calls",
        line: source.range.startLine,
        metadata: { confidence: 0.85, source: "cli-fallback" }
      });
    }

    for (const caller of cli.readRelations(root, "callers", source.name)) {
      const callerNode = findRelationNode(byName, caller);
      if (!callerNode) continue;
      const id = `fallback-calls:${callerNode.id}:${source.id}`;
      edges.set(id, {
        id,
        source: callerNode.id,
        target: source.id,
        kind: "calls",
        line: callerNode.range.startLine,
        metadata: { confidence: 0.85, source: "cli-fallback" }
      });
    }
  }

  return Array.from(edges.values());
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
    /^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm,
    /\bfn\s+([A-Za-z_][\w]*)\s*\(/g,
    /\bfunc\s+([A-Za-z_][\w]*)\s*\(/g,
    /^\s*(?:[A-Za-z_][\w:<>,*&\s]+)\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*\{/gm
  ];

  for (const file of files) {
    if (file.sizeBytes > 1_000_000) continue;
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

function toIndexedNode(rawNode: CodeGraphRawQueryNode, query: string): CodeGraphIndexedNode | undefined {
  const name = stringOr(rawNode.name, query);
  const filePath = typeof rawNode.filePath === "string" ? normalizeRepositoryPath(rawNode.filePath) : undefined;
  if (!name || !filePath || rawNode.kind === "file") return undefined;
  const startLine = positiveNumber(rawNode.startLine) ?? 1;
  const endLine = positiveNumber(rawNode.endLine) ?? startLine;
  return {
    id: stringOr(rawNode.id, `fallback:${filePath}:${name}:${startLine}`),
    kind: stringOr(rawNode.kind, "function"),
    name,
    qualifiedName: stringOr(rawNode.qualifiedName, name),
    filePath,
    language: stringOr(rawNode.language, "unknown"),
    range: {
      startLine,
      endLine,
      startColumn: nonnegativeNumber(rawNode.startColumn) ?? 0,
      endColumn: nonnegativeNumber(rawNode.endColumn) ?? 0
    },
    signature: typeof rawNode.signature === "string" && rawNode.signature ? rawNode.signature : undefined,
    visibility: typeof rawNode.visibility === "string" && rawNode.visibility ? rawNode.visibility : undefined,
    isExported: rawNode.isExported === true
  };
}

function indexNodes(nodes: CodeGraphIndexedNode[]): Map<string, CodeGraphIndexedNode[]> {
  const result = new Map<string, CodeGraphIndexedNode[]>();
  for (const node of nodes) {
    const entries = result.get(node.name) ?? [];
    entries.push(node);
    result.set(node.name, entries);
  }
  return result;
}

function findRelationNode(nodesByName: Map<string, CodeGraphIndexedNode[]>, relation: CodeGraphRelation): CodeGraphIndexedNode | undefined {
  const candidates = nodesByName.get(relation.name) ?? [];
  const relationPath = typeof relation.filePath === "string" ? normalizeRepositoryPath(relation.filePath) : undefined;
  const relationLine = positiveNumber(relation.startLine);
  return (
    candidates.find((candidate) => candidate.filePath === relationPath && candidate.range.startLine === relationLine) ??
    candidates.find((candidate) => candidate.filePath === relationPath) ??
    candidates[0]
  );
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
