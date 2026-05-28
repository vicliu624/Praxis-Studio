import type { Id } from "@praxis/core";
import { TraceRecordSchema, type TraceRecord, type TraceTarget } from "@praxis/schema";

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

export type { TraceRecord, TraceTarget };
export type TraceEvent = TraceRecord;

export class InMemoryTraceRecorder {
  private events: TraceEvent[] = [];

  record(event: Omit<TraceEvent, "id" | "timestamp"> & { id?: Id; timestamp?: string }): TraceEvent {
    const full = TraceRecordSchema.parse({
      ...event,
      id: event.id ?? `trace-event:${this.events.length + 1}`,
      timestamp: event.timestamp ?? new Date().toISOString()
    });
    this.events.push(full);
    return full;
  }

  list(traceId?: Id): TraceEvent[] {
    return traceId ? this.events.filter((event) => event.traceId === traceId) : [...this.events];
  }
}

export function serializeTraceEvent(event: TraceEvent): string {
  return JSON.stringify(TraceRecordSchema.parse(event));
}
