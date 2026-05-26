import type { CodeFactEdge, CodeFactFile, CodeFactNode, CodeFactProviderInfo, CodeFactWarning } from "./code-fact";
import type { ContextPacket, ContextPacketPurpose } from "./context-packet";
import type { ArchitectureFinding } from "./finding";
import type { GraphAnchor } from "./graph-anchor";
import type { ProjectedGraphView, ProjectedGraphViewKind } from "./projected-graph";

export type PraxisMcpToolName =
  | "praxis_status"
  | "praxis_code_facts"
  | "praxis_findings"
  | "praxis_projection_views"
  | "praxis_context_packet";

export interface PraxisMcpStatusInput {
  root?: string;
}

export interface PraxisMcpStatusResult {
  schemaVersion: "praxis.mcp.statusResult.v1";
  root: string;
  generatedAt: string;
  server: {
    name: string;
    version: string;
    readOnly: true;
  };
  distinction: {
    exists: boolean;
    path: string;
    cachePath: string;
    memoryPath: string;
    viewsPath: string;
  };
  cache: {
    codeFacts: boolean;
    findings: boolean;
    projectionManifest: boolean;
    contextPacket: boolean;
  };
  views: {
    codeFacts: boolean;
    findings: boolean;
    projectedGraphViewCount: number;
  };
  codeFacts?: {
    provider: CodeFactProviderInfo;
    files: number;
    nodes: number;
    edges: number;
    warnings: CodeFactWarning[];
  };
  findings?: {
    count: number;
    open: number;
  };
  tools: PraxisMcpToolName[];
  warnings: string[];
}

export interface PraxisMcpCodeFactsInput {
  root?: string;
  path?: string;
  kind?: CodeFactNode["kind"];
  name?: string;
  limit?: number;
}

export interface PraxisMcpCodeFactsResult {
  schemaVersion: "praxis.mcp.codeFactsResult.v1";
  root: string;
  generatedAt: string;
  provider: CodeFactProviderInfo;
  files: CodeFactFile[];
  nodes: CodeFactNode[];
  edges: CodeFactEdge[];
  truncated: boolean;
  sourceCachePath: string;
  warnings: CodeFactWarning[];
}

export interface PraxisMcpFindingsInput {
  root?: string;
  category?: ArchitectureFinding["category"];
  status?: ArchitectureFinding["status"];
  severity?: ArchitectureFinding["severity"];
  limit?: number;
}

export interface PraxisMcpFindingsResult {
  schemaVersion: "praxis.mcp.findingsResult.v1";
  root: string;
  generatedAt: string;
  findings: ArchitectureFinding[];
  truncated: boolean;
  sourceCachePath: string;
}

export interface PraxisMcpProjectionViewsInput {
  root?: string;
  kind?: ProjectedGraphViewKind;
  anchor?: GraphAnchor;
  limit?: number;
}

export interface PraxisMcpProjectionViewsResult {
  schemaVersion: "praxis.mcp.projectionViewsResult.v1";
  root: string;
  generatedAt: string;
  views: ProjectedGraphView[];
  truncated: boolean;
  sourceViewPaths: string[];
}

export interface PraxisMcpContextPacketInput {
  root?: string;
  anchor: GraphAnchor;
  purpose?: ContextPacketPurpose;
  limit?: {
    codeFacts?: number;
    findings?: number;
    memory?: number;
    projectionNodes?: number;
  };
}

export type PraxisMcpContextPacketResult = ContextPacket;
