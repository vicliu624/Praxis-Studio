export type CodeFactProviderSource = "native" | "codegraph" | "lsp" | "scip";

export type CodeFactCapability =
  | "file_structure"
  | "imports_exports"
  | "symbols"
  | "calls"
  | "type_relations"
  | "routes"
  | "references"
  | "impact";

export interface CodeFactProviderInfo {
  name: string;
  source: CodeFactProviderSource;
  version?: string;
  runId?: string;
  capabilities: CodeFactCapability[];
}

export type CodeFactNodeKind =
  | "project"
  | "file"
  | "module"
  | "class"
  | "struct"
  | "interface"
  | "trait"
  | "function"
  | "method"
  | "property"
  | "field"
  | "variable"
  | "constant"
  | "enum"
  | "enum_member"
  | "type_alias"
  | "namespace"
  | "import"
  | "export"
  | "route"
  | "component";

export type CodeFactEdgeKind =
  | "contains"
  | "calls"
  | "imports"
  | "exports"
  | "extends"
  | "implements"
  | "references"
  | "type_of"
  | "returns"
  | "instantiates"
  | "overrides"
  | "decorates"
  | "impacts";

export interface CodeFactRange {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

export interface CodeFactEvidenceRef {
  source: "repository_scan" | "codegraph" | "tree_sitter" | "lsp" | "agent_inference" | "user_confirmation";
  filePath: string;
  startLine?: number;
  endLine?: number;
  excerpt?: string;
}

export interface CodeFactFile {
  id: string;
  path: string;
  language: string;
  extension: string;
  sizeBytes: number;
  hash?: string;
  lineCount: number;
  roleHint: string;
  nodeIds: string[];
  evidence: CodeFactEvidenceRef[];
}

export interface CodeFactNode {
  id: string;
  kind: CodeFactNodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: string;
  range?: CodeFactRange;
  signature?: string;
  docSummary?: string;
  visibility?: "public" | "private" | "protected" | "internal";
  evidence: CodeFactEvidenceRef[];
}

export interface CodeFactEdge {
  id: string;
  kind: CodeFactEdgeKind;
  sourceId: string;
  targetId: string;
  filePath?: string;
  range?: Partial<CodeFactRange>;
  confidence: number;
  evidence: CodeFactEvidenceRef[];
}

export interface CodeFactStatistics {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  filesByLanguage: Record<string, number>;
  nodesByKind: Record<string, number>;
  edgesByKind: Record<string, number>;
}

export interface CodeFactWarning {
  id: string;
  severity: "info" | "warning";
  summary: string;
}

export interface CodeFactGraphSnapshot {
  schemaVersion: "praxis.codeFactGraph.v1";
  root: string;
  generatedAt: string;
  provider: CodeFactProviderInfo;
  files: CodeFactFile[];
  nodes: CodeFactNode[];
  edges: CodeFactEdge[];
  statistics: CodeFactStatistics;
  warnings: CodeFactWarning[];
}
