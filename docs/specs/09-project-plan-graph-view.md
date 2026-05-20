# Project Plan Graph View Specification

## 1. Purpose

Project Plan views help users understand task order, dependencies, blockers, progress and deliverables.

They are inspired by OmniPlan, Gantt charts and task dependency graphs.

Project Plan views are generated from `PlanModel`. AI may propose plan patches, but must not directly edit Gantt or task graph view cache.

## 2. Plan nodes

```text
goal
milestone
workstream
task
subtask
deliverable
blocker
decision
verification
external_agent_task
```

## 3. Plan edges

```text
depends_on
blocks
unblocks
produces
verifies
requires_decision
assigned_to_agent
relates_to_architecture
```

## 4. Task fields

```ts
export interface PlanTask {
  id: string;
  title: string;
  status: "draft" | "ready" | "in_progress" | "blocked" | "done" | "cancelled";
  progress: number;
  dependsOn: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  blockedReason?: string;
  relatedArchitectureNodeIds: string[];
  sourceMemoryIds: string[];
  relatedSpecPaths: string[];
  relatedSourcePaths: string[];
  forbiddenPaths: string[];
  relatedTraceIds: string[];
}
```

## 5. v0.1 minimum behavior

Praxis must generate a task dependency graph from confirmed v0.1 scope, specs and model gaps.

It must show:

```text
- task ordering
- blockers
- progress
- deliverables
- related architecture nodes
- which tasks can become coding tasks
```

## 6. Gantt rule

Gantt is a projection of task dependencies and progress. It is not a separate source of truth.

The source of truth is:

```text
PlanModel.tasks
PlanModel.dependencies
confirmed task progress memory
runtime event evidence
```

## 7. Task Anchor Rule

A task node in Project Plan View is a graph-anchored context entry point.

Selecting a task must produce a `ContextPacket` with:

```text
task goal
task status and progress
dependencies
blockers
deliverables
acceptance criteria
source memory
related specs
related architecture nodes
related source paths
forbidden paths
related traces
```

When a task becomes a coding task, this packet becomes the default construction scope.

The Agent must not inspect unrelated files unless the anchored task context is insufficient and scope expansion is recorded.

## 8. Progress Update Rule

Agent or external worker results must not directly update confirmed task progress.

```text
TaskResultImported
→ CANDIDATE task_progress_update memory
→ user confirmation
→ PlanModel progress update
→ Gantt projection invalidation
→ Gantt regeneration
```

Suggested progress from AI or external workers remains CANDIDATE until confirmed.
