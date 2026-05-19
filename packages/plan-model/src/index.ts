export type PlanActionType =
  | "create_node"
  | "create_edge"
  | "update_edge"
  | "update_node_progress"
  | "update_edge_progress"
  | "create_memory_event"
  | "create_decision"
  | "create_task"
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

const ACTION_TYPES = new Set<PlanActionType>([
  "create_node",
  "create_edge",
  "update_edge",
  "update_node_progress",
  "update_edge_progress",
  "create_memory_event",
  "create_decision",
  "create_task",
  "create_coding_task",
  "write_report"
]);

const KNOWLEDGE_KINDS = new Set<MissingGluePoint["kind"]>(["FACT", "CANDIDATE", "INFERENCE", "CONFIRMED"]);

export function isGraphPlan(value: unknown): value is GraphPlan {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.missingGluePoints) &&
    value.missingGluePoints.every(isMissingGluePoint) &&
    Array.isArray(value.actions) &&
    value.actions.every(isPlanAction) &&
    Array.isArray(value.codingTasks) &&
    value.codingTasks.every(isCodingTaskDraft) &&
    Array.isArray(value.questions) &&
    value.questions.every((question) => typeof question === "string")
  );
}

export function normalizeGraphPlanDraft(value: unknown, fallback: GraphPlan): GraphPlan {
  if (isGraphPlan(value)) return value;
  if (!isRecord(value)) return fallback;

  const actionsSource = Array.isArray(value.actions) ? value.actions : Array.isArray(value.plan) ? value.plan : [];
  const missingGluePoints = normalizeMissingGluePoints(value.missingGluePoints, fallback.missingGluePoints);
  const actions = normalizeActions(actionsSource, fallback.actions);
  const codingTasks = normalizeCodingTasks(value.codingTasks, fallback.codingTasks);
  const questions = normalizeStringArray(value.questions, fallback.questions);

  return {
    id: typeof value.id === "string" && value.id ? value.id : fallback.id,
    summary: typeof value.summary === "string" && value.summary ? value.summary : fallback.summary,
    missingGluePoints,
    actions,
    codingTasks,
    questions
  };
}

function normalizeMissingGluePoints(value: unknown, fallback: MissingGluePoint[]): MissingGluePoint[] {
  if (!Array.isArray(value)) return fallback;
  const points = value
    .filter(isRecord)
    .map((item, index) => ({
      title: stringOr(item.title, `Missing glue point ${index + 1}`),
      reason: stringOr(item.reason, ""),
      kind: normalizeKnowledgeKind(item.kind)
    }))
    .filter((item) => item.title || item.reason);
  return points.length ? points : fallback;
}

function normalizeActions(value: unknown[], fallback: PlanAction[]): PlanAction[] {
  const actions = value
    .filter(isRecord)
    .map((item, index) => {
      const type = normalizeActionType(item.type);
      return {
        id: stringOr(item.id, `action:${Date.now()}:${index + 1}`),
        type,
        title: stringOr(item.title, `Plan action ${index + 1}`),
        description: stringOr(item.description, ""),
        targetNodeIds: normalizeStringArray(item.targetNodeIds, []),
        targetEdgeIds: normalizeStringArray(item.targetEdgeIds, []),
        data: isRecord(item.data) ? item.data : undefined
      };
    });
  return actions.length ? actions : fallback;
}

function normalizeCodingTasks(value: unknown, fallback: CodingTaskDraft[]): CodingTaskDraft[] {
  if (!Array.isArray(value)) return fallback;
  const tasks = value
    .filter(isRecord)
    .map((item, index) => ({
      title: stringOr(item.title, `Controlled coding task ${index + 1}`),
      allowedPaths: normalizeStringArray(item.allowedPaths, [".distinction"]),
      forbiddenPaths: normalizeStringArray(item.forbiddenPaths, ["apps/studio-desktop/src"]),
      acceptanceCriteria: normalizeStringArray(item.acceptanceCriteria, ["Return patch summary", "Return changed files", "Return verification result"])
    }));
  return tasks.length ? tasks : fallback;
}

function isPlanAction(value: unknown): value is PlanAction {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    ACTION_TYPES.has(value.type as PlanActionType) &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    Array.isArray(value.targetNodeIds) &&
    value.targetNodeIds.every((item) => typeof item === "string") &&
    Array.isArray(value.targetEdgeIds) &&
    value.targetEdgeIds.every((item) => typeof item === "string")
  );
}

function isMissingGluePoint(value: unknown): value is MissingGluePoint {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.reason === "string" &&
    typeof value.kind === "string" &&
    KNOWLEDGE_KINDS.has(value.kind as MissingGluePoint["kind"])
  );
}

function isCodingTaskDraft(value: unknown): value is CodingTaskDraft {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    Array.isArray(value.allowedPaths) &&
    value.allowedPaths.every((item) => typeof item === "string") &&
    Array.isArray(value.forbiddenPaths) &&
    value.forbiddenPaths.every((item) => typeof item === "string") &&
    Array.isArray(value.acceptanceCriteria) &&
    value.acceptanceCriteria.every((item) => typeof item === "string")
  );
}

function normalizeActionType(value: unknown): PlanActionType {
  if (typeof value === "string" && ACTION_TYPES.has(value as PlanActionType)) return value as PlanActionType;
  return "create_memory_event";
}

function normalizeKnowledgeKind(value: unknown): MissingGluePoint["kind"] {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (KNOWLEDGE_KINDS.has(upper as MissingGluePoint["kind"])) return upper as MissingGluePoint["kind"];
  }
  return "INFERENCE";
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const values = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return values.length ? values : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
