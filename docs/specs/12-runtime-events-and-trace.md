# Runtime Events and Trace Specification

## 1. Purpose

Runtime events make Praxis auditable and live.

Every important model, memory, projection, plan, apply and agent action must be traceable. Some runtime events also drive memory mutation, projection invalidation, graph reprojection and workspace updates.

## 2. Events

```text
RepositoryScanned
RepositoryUnderstandingPatchProposed
ModelPatchProposed
ModelPatchValidated
ModelPatchApplied
PatchRejected
SymbolDiffDetected
AntiPatternFindingDetected
FindingStatusChanged
DetectorRerun
QualityAnnotationProjected
GovernancePlaybookSelected
RemediationRecommended
MemoryRecordCreated
MemoryRecordConfirmed
MemoryRecordMarkedStale
ModelCandidateGenerated
ModelConfirmed
SpecProjected
GraphProjected
PlanGenerated
TaskStarted
TaskProgressSuggested
TaskResultImported
VerificationPassed
VerificationFailed
ApplyRequested
ApplyApproved
ApplyRejected
TaskGenerated
ExternalAgentResultImported
ContextPacketBuilt
ScopeExpansionRequested
ScopeExpanded
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
    type:
      | "memory"
      | "model"
      | "spec"
      | "graph"
      | "task"
      | "source"
      | "project"
      | "finding"
      | "playbook";
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

## 6. Event Effects

Runtime events are not only audit records. Some events drive memory, model, plan, task and projection state.

Every event handler must declare:

```text
writes
invalidates
regenerates
notifies
```

Event effect classes:

```text
Trace-only events:
  ModelCalled
  ToolCalled
  PermissionRequested
  ContextPacketBuilt
  ScopeExpansionRequested
  ScopeExpanded

Memory-mutating events:
  MemoryRecordCreated
  MemoryRecordConfirmed
  MemoryRecordMarkedStale
  ExternalAgentResultImported
  RepositoryUnderstandingPatchProposed
  AntiPatternFindingDetected
  FindingStatusChanged

Model-mutating events:
  ModelCandidateGenerated
  ModelConfirmed
  ModelPatchApplied
  SymbolDiffDetected

Projection-mutating events:
  GraphProjected
  SpecProjected
  QualityAnnotationProjected

Plan/task-mutating events:
  PlanGenerated
  TaskGenerated
  ApplyApproved
  TaskStarted
  TaskProgressSuggested
  TaskResultImported
  VerificationPassed
  VerificationFailed
  DetectorRerun
```

Trace-only events may still update trace views, active run views and construction state. They must not create confirmed memory by themselves.

## 7. Projection Effects

Events that mutate memory, models, specs, plans, tasks or traces must trigger projection invalidation for affected graph views.

```text
Runtime Event
→ Event Effect Handler
→ Write / Invalidate / Regenerate / Notify
→ Live Projection Loop
```

Examples:

```text
MemoryRecordCreated
  writes candidate memory
  invalidates related memory and candidate graph views
  notifies workspace

MemoryRecordConfirmed
  writes confirmed memory
  invalidates related architecture, plan and memory views
  regenerates affected projections
  notifies workspace

ToolCalled
  writes trace
  invalidates active trace view
  regenerates or patches active agent-run graph
  notifies workspace

PermissionDenied
  writes trace
  invalidates active trace and blocker views
  notifies workspace

ExternalAgentResultImported
  writes result trace and candidate memory
  invalidates task, progress, architecture and trace views
  notifies workspace

RepositoryUnderstandingPatchProposed
  writes trace
  may write INFERENCE / CANDIDATE memory
  invalidates affected model review views
  notifies workspace

ModelPatchValidated
  writes trace
  records validation result and affected models
  notifies workspace

ModelPatchApplied
  writes model state
  invalidates affected UML / architecture / Gantt projections
  notifies workspace

SymbolDiffDetected
  writes FACT memory from deterministic extraction
  marks related inference/candidate memory stale
  invalidates affected UML and dependency projections
  notifies workspace

TaskProgressSuggested
  writes CANDIDATE task progress memory
  invalidates project plan review state
  notifies workspace

AntiPatternFindingDetected
  writes finding memory
  invalidates quality annotations for affected graph views
  notifies workspace

FindingStatusChanged
  writes finding lifecycle update
  invalidates affected graph annotations and quality inbox
  notifies workspace

DetectorRerun
  writes trace
  may update finding status to resolved, mitigated, reopened or unchanged
  invalidates affected quality annotations
  notifies workspace

QualityAnnotationProjected
  writes projection metadata
  publishes findings into graph views as annotations
  notifies workspace

GovernancePlaybookSelected
  writes trace
  records finding id, playbook id, rationale and rejected alternatives
  notifies finding-anchored chat

RemediationRecommended
  writes trace
  records recommended strategy, remediation strength and user intervention points
  may create candidate plan actions
  notifies finding-anchored chat and plan panel

ContextPacketBuilt
  writes trace
  records selected anchor and initial scope
  notifies workspace context panel

ScopeExpanded
  writes trace
  records previous scope, new scope and reason
  may invalidate active context panel
  notifies workspace
```

The runtime must not treat event recording as a passive log append. Event effects are part of the Agent construction loop.
