export type PlanActionType =
  | "create_node"
  | "create_edge"
  | "update_node_progress"
  | "update_edge_progress"
  | "create_memory_event"
  | "create_decision"
  | "create_coding_task"
  | "write_report";

export interface PlanAction {
  id: string;
  type: PlanActionType;
  title: string;
  description: string;
  targetNodeIds: string[];
  targetEdgeIds: string[];
  data?: Record<string, unknown>;
}

export interface MissingGluePoint {
  title: string;
  reason: string;
  kind: "FACT" | "CANDIDATE" | "INFERENCE" | "CONFIRMED";
}

export interface CodingTaskDraft {
  title: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
}

export interface GraphPlan {
  id: string;
  summary: string;
  missingGluePoints: MissingGluePoint[];
  actions: PlanAction[];
  codingTasks: CodingTaskDraft[];
  questions: string[];
}
