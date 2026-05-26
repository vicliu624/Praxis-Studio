import type { CodeFactNode, CodeFactRange } from "@praxis/schema";

export interface CodeGraphIndexStatus {
  initialized: boolean;
  projectPath?: string;
  fileCount?: number;
  nodeCount?: number;
  edgeCount?: number;
  dbSizeBytes?: number;
  backend?: string;
  languages?: string[];
  nodesByKind?: Record<string, number>;
  pendingChanges?: {
    added: number;
    modified: number;
    removed: number;
  };
}

export interface CodeGraphIndexedFile {
  path: string;
  contentHash?: string;
  language: string;
  size: number;
  nodeCount?: number;
  errors?: unknown[];
}

export interface CodeGraphIndexedNode {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: string;
  range: CodeFactRange;
  docstring?: string;
  signature?: string;
  visibility?: string;
  isExported: boolean;
}

export interface CodeGraphIndexedEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  metadata?: Record<string, unknown>;
  line?: number;
  col?: number;
  provenance?: string;
}

export interface CodeGraphRelation {
  name: string;
  kind?: string;
  filePath?: string;
  startLine?: number;
}

export interface CodeGraphFallbackResult {
  nodes: CodeGraphIndexedNode[];
  edges: CodeGraphIndexedEdge[];
  warnings: string[];
}

export interface CodeGraphIndexReadResult {
  status?: CodeGraphIndexStatus;
  files: CodeGraphIndexedFile[];
  nodes: CodeGraphIndexedNode[];
  edges: CodeGraphIndexedEdge[];
  readMode: "sqlite_index" | "cli_fallback";
  warnings: string[];
}

export interface CodeGraphRawQueryNode {
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
}

export interface CodeGraphRawRelationResponse {
  symbol?: string;
  callers?: CodeGraphRelation[];
  callees?: CodeGraphRelation[];
}

export interface CodeGraphSymbolRelationSource {
  source: CodeFactNode;
  target: CodeFactNode;
}
