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

## 3. GraphView

```ts
export interface GraphView {
  id: string;
  type: GraphViewType;
  title: string;
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  generatedAt: string;
  stale: boolean;
}
```

## 4. Required graph view types

```text
architecture.c4.context
architecture.c4.container
architecture.component
architecture.dependency
architecture.symbol
project.task_dependency
project.gantt
project.progress
memory.decision_map
memory.distinction_map
trace.agent_run
```

## 5. Projection quality rules

```text
1. Every graph node must reference at least one memory or model record.
2. Every graph edge must reference evidence or projection rule.
3. INFERENCE edges must be visually distinguishable from FACT / CONFIRMED edges.
4. Graph must expose stale status.
5. User correction must update memory, not only graph layout.
```