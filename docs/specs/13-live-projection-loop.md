# Live Projection Loop Specification

## 1. Purpose

Praxis graph views are live projections, not static diagrams.

During agent construction, every meaningful runtime event may create memory, update model state, mark projections stale, regenerate graph views, and notify the workspace UI.

```text
Agent Step
→ Runtime Event
→ Memory Mutation
→ Model / Plan / Task Mutation
→ Projection Invalidation
→ Graph Reprojection
→ UI Patch
```

This loop is part of the product model. It is not optional UI polish.

## 2. Core Rule

Graph views must reflect the current state of structured memory, models, specifications, plans, tasks and traces.

A graph view may be cached, but it must expose whether it is fresh, stale, regenerating, or failed.

```ts
export type ProjectionStatus =
  | "fresh"
  | "stale"
  | "regenerating"
  | "failed";

export interface LiveGraphProjection {
  viewId: string;
  projectionType: GraphViewType;
  status: ProjectionStatus;
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceSpecIds: string[];
  sourcePlanIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  generatedAt: string;
  invalidatedAt?: string;
  invalidationReason?: string;
}
```

The status is a truth boundary. The UI must never present stale projections as fresh.

## 3. Runtime Event to Projection Rule

Runtime events are not only audit records. Some events are projection drivers.

The following events must affect graph projections:

```text
MemoryRecordCreated
  invalidate related memory views and candidate-dependent graph views

MemoryRecordConfirmed
  regenerate affected architecture / plan / memory views

MemoryRecordMarkedStale
  mark affected graph nodes and edges stale

ModelCandidateGenerated
  regenerate model-derived views as candidate projections

ModelConfirmed
  regenerate architecture / domain / plan views

SpecProjected
  regenerate spec coverage and project plan views

GraphProjected
  publish fresh projection metadata and source links

PlanGenerated
  update project task dependency view

TaskGenerated
  update project plan and task graph views

ExternalAgentResultImported
  update task progress, trace view and related architecture status

ToolCalled
  update active trace graph

PermissionRequested
  update trace graph and construction state

PermissionApproved
  update trace graph and allow mutation event

PermissionDenied
  update trace graph and blocker state

ApplyApproved
  write approved memory/model/spec/task changes and trigger affected projections

AntiPatternFindingDetected
  write finding memory and invalidate related quality annotations

FindingStatusChanged
  update finding lifecycle and refresh affected graph annotations

QualityAnnotationProjected
  publish finding annotations into affected graph views

GovernancePlaybookSelected
  update finding-anchored chat and trace graph with selected remediation playbook

RemediationRecommended
  update plan candidate view with recommended strategy, remediation strength and user intervention points
```

## 4. Live Workspace Behavior

The workspace must support incremental updates.

```text
Architecture View
  shows new or stale responsibilities, dependencies, risks and confirmations

Project Plan View
  shows task progress, blockers, generated tasks, imported results and dependency changes

Trace View
  shows active agent run, model calls, tool calls, permission requests and apply results

Memory View
  shows newly created candidates, confirmations, stale records, conflicts and corrections

Quality View / Annotations
  shows anti-pattern findings over architecture, UML, plan, trace, memory and projection views

Governance View / Recommendation Cards
  shows selected playbook, recommended remediation, alternatives, intervention points and verification criteria
```

Live refresh may be incremental or full reprojection, but the user-visible state must indicate what changed and where the change came from.

## 5. Projection Invalidation

A projection must be marked stale when any of its source memory/model/spec/plan/task/trace records changes.

```ts
export interface ProjectionInvalidation {
  projectionId: string;
  reason:
    | "source_memory_created"
    | "source_memory_confirmed"
    | "source_memory_stale"
    | "model_updated"
    | "plan_updated"
    | "task_updated"
    | "trace_updated"
    | "spec_updated"
    | "finding_updated";
  sourceIds: string[];
  createdAt: string;
}
```

Invalidation is required before regeneration. A projection must not silently drift from its sources.

## 6. Agent Construction Loop

Agent construction must be visible as graph evolution.

Before construction:

```text
task node is ready
related architecture nodes are unchanged
trace graph is empty or inactive
```

During construction:

```text
task node becomes in_progress
trace graph receives model/tool/permission events
memory candidates may appear
related graph views may become stale or regenerating
```

After construction result import:

```text
task node becomes result_imported / verified / done
memory candidates are created from result
user confirmation may update progress
architecture / plan views are regenerated
```

## 7. UI Requirements

The UI must distinguish:

```text
confirmed graph element
candidate graph element
inferred graph element
stale graph element
actively changing graph element
blocked graph element
```

Live graph changes must not hide their source. Every visual change must be traceable to memory/model/spec/plan/task/trace records.

The user must be able to see:

```text
what changed
why it changed
which event caused it
which memory/model/spec/task/trace records support it
whether the change is candidate, inference or confirmed
which anti-pattern finding or quality annotation is involved
```

## 8. Negative Rules

Praxis must not:

```text
silently update graph views without recording memory or trace
let UI-only graph edits become authoritative truth
treat task progress as confirmed without event source
overwrite confirmed memory through projection regeneration
hide stale projections as if they were fresh
let trace-only events mutate confirmed memory
let projection cache become source of truth
```

## 9. Acceptance Criteria

The Live Projection Loop is implemented when:

```text
1. Agent steps emit runtime events.
2. Events declare writes / invalidates / regenerates / notifies.
3. Memory or model changes mark affected projections stale.
4. Graph views expose fresh / stale / regenerating / failed status.
5. Workspace UI receives projection updates or stale notifications.
6. Architecture, plan, trace and memory views can change during construction.
7. Every visual graph change is traceable to source records and runtime events.
```
