import type { Id } from "@praxis/core";

export type TraceEventKind =
  | "project.opened"
  | "repository.scanned"
  | "profile.generated"
  | "graph.generated"
  | "context.built"
  | "tool.called"
  | "model.called"
  | "plan.generated"
  | "task.generated"
  | "graph.updated"
  | "memory.recorded"
  | "permission.denied";

export interface TraceTarget {
  type: "project" | "node" | "edge" | "subgraph";
  id?: string;
}

export interface TraceEvent {
  id: Id;
  traceId: Id;
  timestamp: string;
  kind: TraceEventKind;
  target?: TraceTarget;
  summary: string;
  data?: Record<string, unknown>;
}

export class InMemoryTraceRecorder {
  private events: TraceEvent[] = [];

  record(event: Omit<TraceEvent, "id" | "timestamp"> & { id?: Id; timestamp?: string }): TraceEvent {
    const full: TraceEvent = {
      ...event,
      id: event.id ?? `trace-event:${this.events.length + 1}`,
      timestamp: event.timestamp ?? new Date().toISOString()
    };
    this.events.push(full);
    return full;
  }

  list(traceId?: Id): TraceEvent[] {
    return traceId ? this.events.filter((event) => event.traceId === traceId) : [...this.events];
  }
}

export function serializeTraceEvent(event: TraceEvent): string {
  return JSON.stringify(event);
}
