# Runtime Events and Trace Specification

## 1. Purpose

Runtime events make Praxis auditable.

Every important model, memory, projection, plan, apply and agent action must be traceable.

## 2. Events

```text
RepositoryScanned
MemoryRecordCreated
MemoryRecordConfirmed
MemoryRecordMarkedStale
ModelCandidateGenerated
ModelConfirmed
SpecProjected
GraphProjected
PlanGenerated
ApplyRequested
ApplyApproved
ApplyRejected
TaskGenerated
ExternalAgentResultImported
ToolCalled
PermissionRequested
PermissionApproved
PermissionDenied
ModelCalled
```

## 3. Trace storage

```text
.distinction/memory/traces.jsonl
.distinction/views/trace/agent-run-graph.json
```

## 4. Trace event

```ts
export interface TraceEvent {
  id: string;
  traceId: string;
  timestamp: string;
  kind: string;
  target: {
    type: "memory" | "model" | "spec" | "graph" | "task" | "source" | "project";
    id?: string;
  };
  summary: string;
  data?: Record<string, unknown>;
}
```

## 5. Trace rule

If an Agent caused it, Praxis must be able to explain:

```text
what input it used
which memory records it read
which model/spec/view it touched
which tool it called
what permission was requested
what was written
why the action was allowed
```