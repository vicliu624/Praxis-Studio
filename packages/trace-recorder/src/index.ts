import type { Id } from "@praxis/core";
export type TraceEventKind = "context.built" | "tool.called" | "model.called" | "plan.generated" | "change.applied" | "memory.recorded" | "permission.denied";
export interface TraceEvent { id: Id; traceId: Id; kind: TraceEventKind; timestamp: string; summary: string; data?: Record<string, unknown>; }
export class InMemoryTraceRecorder { private events: TraceEvent[] = []; record(event: Omit<TraceEvent, "id" | "timestamp">): TraceEvent { const full: TraceEvent = { ...event, id: `trace-event:${this.events.length + 1}`, timestamp: new Date().toISOString() }; this.events.push(full); return full; } list(traceId?: Id): TraceEvent[] { return traceId ? this.events.filter((event) => event.traceId === traceId) : [...this.events]; } }
