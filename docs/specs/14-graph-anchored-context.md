# Graph Anchored Context Specification

## 1. Purpose

Every graph node or edge can be used as an entry point for discussion, planning and controlled construction.

The selected graph element becomes the context anchor.

Praxis must build a bounded `ContextPacket` from the anchor's source memory, related models, specifications, tasks, traces and source paths.

This is the main interaction value of graph-projected memory:

```text
graph as navigation
memory as context
agent as scoped worker
```

## 2. Core Rule

An Agent must start from the anchored context before searching the wider repository.

Graph selection must not make the graph authoritative. It only selects a semantic entry point whose authority comes from memory, models, specs, tasks, traces and evidence.

```text
User selects graph element
→ resolve source records
→ build ContextPacket
→ run scoped Agent discussion / plan / construction
→ emit runtime events
→ update memory
→ refresh live graph projections
```

## 3. Context Anchors

```ts
export type ContextAnchor =
  | { type: "memory"; id: string }
  | { type: "model"; id: string }
  | { type: "spec"; path: string; sectionId?: string }
  | { type: "graph_node"; viewId: string; id: string }
  | { type: "graph_edge"; viewId: string; id: string }
  | { type: "task"; id: string }
  | { type: "trace"; id: string }
  | { type: "finding"; id: string };
```

Supported anchor examples:

```text
Gantt task
  opens task-scoped requirement / planning / construction context

Architecture component
  opens responsibility, dependency and related code context

Dependency edge
  opens source/target component relation, evidence and risk context

Requirement node
  opens user scenario, spec, acceptance and task context

Trace node
  opens model call, tool call, permission and result context

Anti-pattern finding
  opens affected memory, model, graph, spec, task, source and trace context
```

## 4. Context Expansion Levels

```ts
export type ContextExpansionLevel =
  | "anchor_only"
  | "one_hop"
  | "subgraph"
  | "repository_search";
```

Expansion semantics:

```text
anchor_only
  Only selected node/edge/task/trace and directly attached memory.

one_hop
  Anchor plus directly related nodes/edges, specs, tasks, traces and source files.

subgraph
  User-selected graph region and all source records behind it.

repository_search
  Wider repository search, only when anchored context is insufficient.
```

Default:

```text
task anchor: one_hop
architecture node anchor: one_hop
dependency edge anchor: anchor_only
trace anchor: anchor_only
selected subgraph anchor: subgraph
```

## 5. ContextPacket

Praxis must pass a structured `ContextPacket`, not only a natural language summary.

```ts
export interface ContextPacket {
  id: string;
  anchor: ContextAnchor;

  scope: {
    primaryMemoryIds: string[];
    relatedMemoryIds: string[];
    modelElementIds: string[];
    specPaths: string[];
    taskIds: string[];
    graphViewIds: string[];
    sourcePaths: string[];
    forbiddenPaths: string[];
    traceIds: string[];
    findingIds: string[];
  };

  knowledgeBoundary: {
    facts: string[];
    inferences: string[];
    candidates: string[];
    confirmations: string[];
    staleRecords: string[];
  };

  taskContext?: {
    taskId: string;
    title: string;
    status: string;
    progress: number;
    dependsOn: string[];
    deliverables: string[];
    acceptanceCriteria: string[];
    blockers: string[];
  };

  architectureContext?: {
    relatedComponents: string[];
    dependencyEdges: string[];
    affectedInterfaces: string[];
    riskEdges: string[];
  };

  discussionPolicy: {
    defaultScope: ContextExpansionLevel;
    currentScope: ContextExpansionLevel;
    requireUserApprovalToExpandScope: boolean;
    maxSourceFiles: number;
    maxMemoryRecords: number;
  };

  generatedAt: string;
}
```

## 6. Anchor Resolution Chain

Every graph node and edge must be able to resolve back to source records.

```text
Graph Node / Edge
→ sourceMemoryIds
→ relatedModelIds
→ relatedSpecIds
→ relatedTaskIds
→ relatedSourcePaths
→ relatedTraceIds
```

If this chain is incomplete, Praxis should mark the context packet as low confidence and avoid pretending the scope is fully known.

## 7. Agent Behavior

When operating inside graph-anchored context, the Agent must follow this rule:

```text
Use the provided ContextPacket first.
Do not search the wider repository unless the packet is insufficient.
If scope expands, explain why and record the expansion.
```

Detailed behavior:

```text
1. Use ContextPacket first.
2. Prefer CONFIRMED memory over INFERENCE.
3. Prefer FACT memory over model guesses.
4. Prefer source paths linked by memory over broad repository search.
5. Do not inspect unrelated files unless anchored context is insufficient.
6. When expanding scope, record why.
7. When discovering new relevant context, write CANDIDATE memory.
8. When user confirms, update memory and refresh graph projections.
```

Scope expansion policy:

```text
anchor_only → one_hop
  allowed when direct evidence is insufficient.

one_hop → subgraph
  should be stated in the transcript or trace.

subgraph → repository_search
  requires explicit reason and should request user approval when expensive or risky.
```

## 8. Task Anchors and Coding Scope

When the anchor is a project plan task, the `ContextPacket` must become the default coding task scope.

Example:

```text
anchor:
  task:TASK-001 Implement Architecture Graph Projection

allowedPaths:
  packages/graph-projection/**
  packages/development-graph/**
  packages/local-knowledge/**
  docs/specs/07-memory-to-graph-projection.md
  docs/specs/13-live-projection-loop.md
  docs/specs/14-graph-anchored-context.md

forbiddenPaths:
  unrelated packages
  existing source outside selected scope unless approved

acceptanceCriteria:
  graph node references sourceMemoryIds
  projection status supports stale/regenerating
  ContextPacket is generated from graph anchor
  scope expansion is traced
```

Project Plan Graph is therefore not only a progress view. It is a scoped construction entry point.

## 8.1 Finding Anchors and Quality Scope

When the anchor is an anti-pattern finding, the `ContextPacket` must include:

```text
finding summary
detector type
severity and confidence
affected memory
affected models
affected graph elements
affected specs
affected tasks
affected source paths
affected traces
evidence
applicable governance playbooks
recommended remediation strength
suggested questions
suggested plan actions
```

The Agent must explain evidence before proposing remediation. It must select an applicable governance playbook when one exists, recommend one professional default remediation, and expose user intervention points. It must not mark the finding resolved without detector rerun or user confirmation.

## 9. UI Behavior

When the user selects a graph element, Praxis should show:

```text
Context scope
Related memory
Related models
Related specs
Related code
Related tasks
Related traces
Confidence / stale status
Scope expansion controls
```

The user should be able to:

```text
start discussion from anchor
ask for explanation within anchor scope
plan within anchor scope
generate task from anchor scope
approve scope expansion
see why scope expanded
inspect source records behind the anchor
```

## 10. Benefits

Graph-anchored context gives Praxis a runtime advantage over plain coding chat:

```text
faster agent execution
lower context cost
less repository-wide search
clearer task boundary
better traceability
safer apply
more stable requirements discussion
```

The graph is not for decoration. It is the user's semantic navigation surface for scoped collaboration.

## 11. Negative Rules

Praxis must not:

```text
let graph selection replace source memory
let Agent freely search the repository before using ContextPacket
hide scope expansion
pretend source paths are known when the anchor chain is incomplete
write confirmed memory from anchor context without user confirmation
let a task anchor authorize unrelated code changes
```

## 12. Acceptance Criteria

Graph-anchored context is implemented when:

```text
1. Selecting a graph node / edge / task / trace can produce ContextPacket.
2. Selecting an anti-pattern finding can produce ContextPacket.
3. ContextPacket lists source memory, specs, tasks, traces and source paths.
4. Agent starts from ContextPacket before repository search.
5. Scope expansion is explicit and traceable.
6. Task anchors produce allowed / forbidden construction scope.
7. Finding anchors produce quality remediation context.
8. New relevant discoveries become CANDIDATE memory.
9. User confirmation updates memory and triggers live graph reprojection.
```
