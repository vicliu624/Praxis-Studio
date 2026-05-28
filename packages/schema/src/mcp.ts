import type { CodeFactEdge, CodeFactFile, CodeFactNode, CodeFactProviderInfo, CodeFactWarning } from "./code-fact";
import type { ContextPacket, ContextPacketPurpose } from "./context-packet";
import type { CodingAgentTask, ExternalAgentResult, PlanPatch } from "./coding-task";
import type { ArchitectureFinding } from "./finding";
import type { GraphAnchor } from "./graph-anchor";
import type { ProjectedGraphView, ProjectedGraphViewKind } from "./projected-graph";

export type PraxisMcpToolName =
  | "praxis_status"
  | "praxis_project_profile"
  | "praxis_code_facts"
  | "praxis_callers"
  | "praxis_callees"
  | "praxis_impact"
  | "praxis_findings"
  | "praxis_finding_audit"
  | "praxis_projection_views"
  | "praxis_context_packet"
  | "praxis_explain_anchor"
  | "praxis_plan_from_finding"
  | "praxis_generate_task"
  | "praxis_record_external_result";

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
    readOnly: boolean;
    writePolicy: "governed_artifacts_only";
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

export interface PraxisMcpFindingAuditInput {
  root?: string;
  findingId?: string;
  state?: string;
  limit?: number;
}

export interface PraxisMcpFindingAuditResult {
  schemaVersion: "praxis.mcp.findingAuditResult.v1";
  root: string;
  generatedAt: string;
  findingsPath: string;
  counts: {
    findings: number;
    currentlyDetected: number;
    historicalOnly: number;
    acceptedHistoryEvents: number;
  };
  findings: PraxisMcpFindingAuditItem[];
  truncated: boolean;
}

export interface PraxisMcpFindingAuditItem {
  findingId: string;
  currentlyDetected: boolean;
  detectorState: string;
  currentStatus?: string;
  currentTitle?: string;
  currentSummary?: string;
  severity?: string;
  latestAcceptedStatus?: string;
  latestAcceptedAt?: string;
  history: PraxisMcpFindingAuditHistoryEntry[];
  memoryRecords: PraxisMcpFindingAuditMemoryRecord[];
  traces: PraxisMcpFindingAuditTraceEntry[];
}

export interface PraxisMcpFindingAuditHistoryEntry {
  patchId: string;
  patchPath: string;
  status: string;
  summary: string;
  rationale?: string;
  sourceTaskId?: string;
  sourceResultId?: string;
  createdAt: string;
  acceptedAt?: string;
  evidenceCount: number;
}

export interface PraxisMcpFindingAuditMemoryRecord {
  id: string;
  status?: string;
  summary: string;
  createdAt: string;
  patchId?: string;
  sourceResultId?: string;
  sourceTaskId?: string;
}

export interface PraxisMcpFindingAuditTraceEntry {
  id: string;
  kind: string;
  timestamp: string;
  summary: string;
  patchId?: string;
  status?: string;
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

export interface PraxisMcpProjectProfileInput {
  root?: string;
}

export interface PraxisMcpProjectProfileResult {
  schemaVersion: "praxis.mcp.projectProfileResult.v1";
  root: string;
  generatedAt: string;
  profile: Record<string, unknown>;
  sourceCachePath: string;
}

export interface PraxisMcpCodeRelationInput {
  root?: string;
  symbolId: string;
  depth?: number;
  limit?: number;
}

export interface PraxisMcpCodeRelationResult {
  schemaVersion: "praxis.mcp.codeRelationResult.v1";
  root: string;
  generatedAt: string;
  relation: "callers" | "callees" | "impact";
  symbolId: string;
  supported: boolean;
  reason?: string;
  nodes: CodeFactNode[];
  edges: CodeFactEdge[];
  truncated: boolean;
  sourceCachePath: string;
}

export interface PraxisMcpExplainAnchorInput {
  root?: string;
  anchor: GraphAnchor;
}

export interface PraxisMcpExplainAnchorResult {
  schemaVersion: "praxis.mcp.explainAnchorResult.v1";
  root: string;
  generatedAt: string;
  anchor: GraphAnchor;
  summary: string;
  contextPacket: ContextPacket;
}

export interface PraxisMcpPlanFromFindingInput {
  root?: string;
  findingId: string;
  strength?: "conservative" | "balanced" | "aggressive";
}

export interface PraxisMcpPlanFromFindingResult {
  schemaVersion: "praxis.mcp.planFromFindingResult.v1";
  root: string;
  generatedAt: string;
  planPatch: PlanPatch;
  path: string;
}

export interface PraxisMcpGenerateTaskInput {
  root?: string;
  anchor?: GraphAnchor;
  findingId?: string;
  adapter?: "manual" | "codex" | "claude-code" | "claude-code-best" | "opencode";
}

export interface PraxisMcpGenerateTaskResult {
  schemaVersion: "praxis.mcp.generateTaskResult.v1";
  root: string;
  generatedAt: string;
  task: CodingAgentTask;
  taskJsonPath: string;
  taskMarkdownPath: string;
}

export interface PraxisMcpRecordExternalResultInput {
  root?: string;
  taskId: string;
  status: "done" | "partial" | "failed";
  summary: string;
  changedFiles?: string[];
  testResult?: string;
  evidencePaths?: string[];
}

export interface PraxisMcpRecordExternalResultResult {
  schemaVersion: "praxis.mcp.recordExternalResultResult.v1";
  root: string;
  generatedAt: string;
  result: ExternalAgentResult;
  resultPath: string;
  tracePath: string;
}
