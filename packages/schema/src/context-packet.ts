import type { ArchitectureDependency, ArchitectureModelWarning, ArchitectureModule } from "./architecture";
import type { CodeFactEdge, CodeFactFile, CodeFactNode } from "./code-fact";
import type { ArchitectureFinding } from "./finding";
import type { GraphAnchor } from "./graph-anchor";
import type { ProjectedGraphAnnotation, ProjectedGraphEdge, ProjectedGraphNode, ProjectedGraphView } from "./projected-graph";
import type { MemoryRecord } from "./repository-understanding";

export type ContextPacketPurpose = "explain" | "plan" | "task" | "review" | "governance" | "external_agent";

export interface ArchitectureModelSlice {
  modules: ArchitectureModule[];
  dependencies: ArchitectureDependency[];
  warnings: ArchitectureModelWarning[];
}

export interface ContextPacket {
  schemaVersion: "praxis.contextPacket.v1";
  id: string;
  root: string;
  generatedAt: string;
  anchor: GraphAnchor;
  purpose: ContextPacketPurpose;
  memory: {
    facts: MemoryRecord[];
    inferences: MemoryRecord[];
    candidates: MemoryRecord[];
    confirmations: MemoryRecord[];
    findings: MemoryRecord[];
    decisions: MemoryRecord[];
  };
  models: {
    architecture?: ArchitectureModelSlice;
  };
  codeFacts: {
    nodes: CodeFactNode[];
    edges: CodeFactEdge[];
    callers: CodeFactNode[];
    callees: CodeFactNode[];
    impacted: CodeFactNode[];
    relatedFiles: CodeFactFile[];
  };
  projections: {
    views: ProjectedGraphView[];
    nodes: ProjectedGraphNode[];
    edges: ProjectedGraphEdge[];
    annotations: ProjectedGraphAnnotation[];
  };
  findings: ArchitectureFinding[];
  rules: {
    architectureRules: string[];
    boundaryRules: string[];
    aiConstraints: string[];
    playbooks: string[];
  };
  scope: {
    includedPaths: string[];
    excludedPaths: string[];
    expansionPolicy: "forbidden" | "explain_first" | "allowed_with_trace";
  };
  authority: {
    memoryAuthority: "durable" | "review_cache" | "mixed";
    projectionAuthority: "review_cache" | "durable_model";
  };
  trace: {
    createdBy: "cli" | "desktop" | "mcp" | "agent_runtime";
    sourceViewId?: string;
  };
  warnings: string[];
}
