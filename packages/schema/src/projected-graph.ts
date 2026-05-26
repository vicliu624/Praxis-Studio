import type { Confidence } from "./common";
import type { GraphAnchor } from "./graph-anchor";
import type { ProjectionStatus } from "./projection";

export type ProjectedGraphViewKind =
  | "architecture_dependency"
  | "architecture_component"
  | "code_fact"
  | "finding"
  | "context"
  | "task_plan"
  | "trace"
  | "memory";

export type ProjectedGraphAuthority = "review_cache" | "durable_model";

export type ProjectedGraphSource =
  | { type: "code_fact"; id: string }
  | { type: "code_fact_edge"; id: string }
  | { type: "memory"; id: string }
  | { type: "model"; id: string }
  | { type: "model_dependency"; id: string }
  | { type: "finding"; id: string }
  | { type: "task"; id: string }
  | { type: "trace"; id: string }
  | { type: "projection"; id: string };

export interface ProjectedGraphNode {
  id: string;
  kind: string;
  label: string;
  source: ProjectedGraphSource;
  anchor: GraphAnchor;
  path?: string;
  summary?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectedGraphEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  source: ProjectedGraphSource;
  anchor: GraphAnchor;
  confidence?: Confidence;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectedGraphAnnotation {
  id: string;
  kind: string;
  sourceFindingId?: string;
  targetNodeIds: string[];
  targetEdgeIds: string[];
  severity?: "info" | "low" | "medium" | "high" | "critical";
  status?: string;
  summary: string;
  anchor?: GraphAnchor;
  metadata?: Record<string, unknown>;
}

export interface ProjectedGraphView {
  schemaVersion: "praxis.projectedGraphView.v1";
  id: string;
  kind: ProjectedGraphViewKind;
  root: string;
  generatedAt: string;
  authority: ProjectedGraphAuthority;
  nodes: ProjectedGraphNode[];
  edges: ProjectedGraphEdge[];
  annotations: ProjectedGraphAnnotation[];
  sourceCachePaths: string[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];
  status: ProjectionStatus;
  error?: string;
}
