import type { ArchitectureDependency, ArchitectureModelPatch, ArchitectureModule } from "./architecture";
import type { ArchitectureFinding, ArchitectureFindingReport } from "./finding";

export type ProjectionStatus = "fresh" | "stale" | "regenerating" | "failed";

export interface ArchitectureDependencyView {
  schemaVersion: "praxis.architectureDependencyView.v1";
  id: string;
  kind: "architecture_dependency";
  root: string;
  generatedAt: string;
  nodes: ArchitectureDependencyViewNode[];
  edges: ArchitectureDependencyViewEdge[];
  annotations: ArchitectureDependencyViewAnnotation[];
}

export interface ArchitectureDependencyViewNode {
  id: string;
  label: string;
  path: string;
  role: string;
  confidence: ArchitectureModule["confidence"];
  knowledgeKind: ArchitectureModule["knowledgeKind"];
  sourceMemoryIds: string[];
}

export interface ArchitectureDependencyViewEdge {
  id: string;
  source: string;
  target: string;
  kind: ArchitectureDependency["kind"];
  confidence: ArchitectureDependency["confidence"];
  knowledgeKind: ArchitectureDependency["knowledgeKind"];
  sourceMemoryIds: string[];
  evidenceCount: number;
  findingIds: string[];
}

export interface ArchitectureDependencyViewAnnotation {
  id: string;
  findingId: string;
  antiPatternId: string;
  severity: ArchitectureFinding["severity"];
  status: ArchitectureFinding["status"];
  targetIds: string[];
  summary: string;
}

export interface ProjectionManifest {
  schemaVersion: "praxis.projectionManifest.v1";
  root: string;
  generatedAt: string;
  views: ProjectionViewRecord[];
}

export interface ProjectionViewRecord {
  id: string;
  kind:
    | "architecture_dependency"
    | "architecture_component"
    | "architecture_context"
    | "code_fact"
    | "finding"
    | "context"
    | "memory"
    | "trace"
    | "task_plan"
    | "uml_class"
    | "project_plan"
    | "memory_map"
    | "trace_graph"
    | "quality_inbox";
  path: string;
  authority: "review_cache" | "durable_model";
  sourceCachePaths: string[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];
  status: ProjectionStatus;
  generatedAt?: string;
  error?: string;
}

export interface ProjectArchitectureDependencyViewInput {
  model: ArchitectureModelPatch;
  findings?: ArchitectureFindingReport;
  generatedAt?: string;
}
