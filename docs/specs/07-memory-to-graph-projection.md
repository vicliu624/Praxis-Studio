# Memory to Graph Projection Specification

## 1. Purpose

Graph views are projections from structured memory and models.

A graph view is not the source of truth.

## 2. Projection pipeline

```text
Memory Store
→ Memory Query
→ Model Resolver
→ Projection Rule
→ Graph View
→ UI Layout
```

AI is not part of the view generation step. AI may propose memory or model patches. Projection code renders views from validated memory and models.

## 3. GraphView

```ts
export type GraphViewStatus =
  | "fresh"
  | "stale"
  | "regenerating"
  | "failed";

export interface GraphView {
  id: string;
  type: GraphViewType;
  title: string;
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceSpecIds: string[];
  sourcePlanIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  generatedAt: string;
  status: GraphViewStatus;
  invalidatedAt?: string;
  invalidationReason?: string;
}
```

## 4. Required graph view types

```text
architecture.c4.context
architecture.c4.container
architecture.component
architecture.dependency
architecture.symbol
design.use_case_list
design.use_case_diagram
design.sequence
design.class_collaboration
design.pattern_map
project.task_dependency
project.gantt
project.progress
architecture.uml.class_diagram
memory.decision_map
memory.distinction_map
trace.agent_run
```

## 5. Projection quality rules

```text
1. Every graph node must reference at least one memory or model record.
2. Every graph edge must reference evidence or projection rule.
3. INFERENCE edges must be visually distinguishable from FACT / CONFIRMED edges.
4. Graph must expose fresh / stale / regenerating / failed status.
5. User correction must update memory, not only graph layout.
6. Every graph view must expose source record IDs.
7. The UI must never present stale projections as fresh.
8. Every graph node and edge must be usable as a context anchor when source links are available.
```

## 6. Live Projection Rule

Graph views are live projections. They must be updated or invalidated whenever their source memory, model, specification, plan, task or trace changes.

```text
source record changes
→ projection invalidated
→ view status becomes stale or regenerating
→ projection regenerated
→ view status becomes fresh or failed
→ workspace UI receives update
```

A cached graph view is allowed, but it is only a derived cache. It must not become source of truth.

AI must not directly edit projection cache files:

```text
views/architecture/*.json
views/architecture/*.mmd
views/project-plan/*.json
```

## 7. Projection Invalidation

```ts
export interface GraphProjectionInvalidation {
  viewId: string;
  reason:
    | "source_memory_created"
    | "source_memory_confirmed"
    | "source_memory_stale"
    | "model_updated"
    | "spec_updated"
    | "plan_updated"
    | "task_updated"
    | "trace_updated";
  sourceIds: string[];
  createdAt: string;
}
```

Projection invalidation is required when an Agent action changes memory, model, spec, plan, task or trace state.

## 8. Live Construction Implication

Agent construction changes the workspace through memory and events, not through direct graph authority.

```text
Agent action
→ runtime event
→ memory/model/spec/plan/task/trace mutation
→ affected graph view invalidation
→ graph reprojection
→ UI refresh
```

The graph is live because the memory and runtime state are live.

## 8.1 Patch to Projection Rule

Model patches drive graph projection changes.

```text
MemoryPatch / ModelPatch / PlanPatch
→ patch validation
→ memory/model update
→ projection invalidation
→ deterministic reprojection
→ UI refresh
```

UML diagrams are projections from `UmlModel`.
Architecture diagrams are projections from `ArchitectureModel`.
Use Case diagrams are projections from `InteractionModel`.
Sequence diagrams, Class Collaboration diagrams and Pattern Maps are projections from `DesignModel`.
Gantt diagrams are projections from `PlanModel`.

## 9. Context Anchor Rule

Graph projection output must preserve enough source links to build a `ContextPacket`.

```text
Graph node / edge
→ sourceMemoryIds
→ sourceModelIds
→ sourceSpecIds
→ sourcePlanIds / sourceTaskIds
→ sourceTraceIds
→ relatedSourcePaths
```

If a projected graph element cannot resolve to source records, it may still be displayed as low-confidence projection output, but it must not be used as a precise Agent construction anchor.
