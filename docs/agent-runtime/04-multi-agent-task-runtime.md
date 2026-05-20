# 04. Multi-Agent and Task Runtime Spec

Status: draft  
Depends on: `docs/CODING_AGENT_ADAPTER_SPEC.md`, `packages/coding-agent-adapter`

## 1. Principle

Multi-agent support is not for spectacle. It is for controlled division of labor.

Praxis should eventually support several agent roles, but all roles must remain governed by the same runtime concepts:

```text
session
run
tool registry
permission policy
target context
trace
memory boundary
task lifecycle
```

## 2. Role Model

Recommended roles:

```text
Main Graph Agent
  owns the user conversation and target-bound session

Context Reader
  reads graph, memory, docs and repository facts

Architecture Judge
  evaluates boundaries, coupling, risk and missing specifications

Plan Agent
  converts explanation into proposed graph / memory / task actions

Task Generator
  creates controlled coding tasks for external workers

External Coding Worker
  performs source edits outside Praxis ownership boundary

Verifier
  reviews returned worker result, test output and graph impact

Documentation Writer
  proposes docs, ADR and memory updates
```

v0.1 should not implement all roles as separate model agents. It should define the lifecycle so the runtime can grow without rewriting the product model.

## 3. Subagent Definition

```ts
export interface SubagentDefinition {
  id: string;
  name: string;
  role: string;
  parentSessionId: string;
  parentRunId: string;
  target:
    | { type: "project" }
    | { type: "node"; id: string }
    | { type: "edge"; id: string }
    | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };
  permissionMode: "read_only" | "plan_only" | "apply_limited" | "execute_guarded";
  isolation: "none" | "readonly_snapshot" | "worktree" | "remote";
  modelRoute?: string;
  background: boolean;
}
```

## 4. Subagent Lifecycle

```text
created
  -> queued
  -> running
  -> waiting_permission
  -> completed

failure exits:
  -> failed
  -> cancelled
  -> killed
```

Every subagent must produce:

```text
status
progress summary
trace link
output artifact
terminal reason
```

The parent agent may summarize subagent output, but must not hide failed or denied work.

## 5. Background Tasks

Background tasks are useful for slow side work:

```text
scan related modules
build symbol index
summarize long docs
prepare coding task package
verify returned result
```

Requirements:

```text
1. Background tasks must be visible in the UI.
2. They need cancel / kill semantics.
3. They must write output artifacts.
4. They must not mutate graph or memory without permission.
5. Their output must be linked back to the parent session.
```

## 6. Isolation

```text
none
  uses current project state; read-only unless permission grants writes

readonly_snapshot
  copies or snapshots context for analysis

worktree
  future mode for isolated source edits by worker agents

remote
  future mode for remote execution or hosted workers
```

v0.1 default:

```text
none for read / plan
manual external adapter for source edits
no automatic worktree source modification
```

## 7. Coding Task Boundary

Praxis owns:

```text
why the task exists
which graph target it belongs to
what specification it should satisfy
what files or areas are expected to be touched
what constraints must be preserved
what result evidence is required
how returned result updates graph and memory
```

External workers own:

```text
concrete patch authoring
test execution
implementation details inside the approved task scope
```

Returning a worker result must create a review step:

```text
import result
  -> parse result
  -> show evidence
  -> propose graph / memory updates
  -> ask user confirmation
  -> write confirmed memory if approved
```

## 8. Team Routing

Future team mode may allow named workers.

```ts
export interface AgentTeamMember {
  name: string;
  role: "reader" | "judge" | "planner" | "worker" | "verifier" | "writer";
  permissionMode: string;
  defaultModelRoute?: string;
  defaultIsolation: string;
}
```

Routing must be explicit and traceable:

```text
message routed to Architecture Judge
task delegated to External Coding Worker
verification requested from Verifier
```

## 9. Acceptance Criteria

```text
1. Subagents have lifecycle records, not just hidden model calls.
2. Background work is visible, cancellable and linked to output artifacts.
3. External coding agents remain workers, not Praxis' source of truth.
4. Worktree / remote isolation is a future capability, not v0.1 default.
5. Imported worker results do not automatically become confirmed memory.
```

