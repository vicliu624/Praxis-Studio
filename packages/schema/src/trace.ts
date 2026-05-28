export type TraceTargetType = "project" | "node" | "edge" | "subgraph" | "task" | "finding" | "memory" | "result" | "external_agent_result";

export interface TraceTarget {
  type: TraceTargetType;
  id?: string;
}

export interface TraceRecord {
  schemaVersion?: "praxis.traceRecord.v1";
  id: string;
  traceId: string;
  timestamp: string;
  kind: string;
  target?: TraceTarget;
  summary: string;
  data?: Record<string, unknown>;
}
