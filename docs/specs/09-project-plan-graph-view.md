# Project Plan Graph View Specification

## 1. Purpose

Project Plan views help users understand task order, dependencies, blockers, progress and deliverables.

They are inspired by OmniPlan, Gantt charts and task dependency graphs.

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
