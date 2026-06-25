# Praxis Agent Runtime Specification System

Status: draft  
Owner: Praxis Studio  
Scope: Agent Session, Agent Runtime, governed tools, permission, context, memory, recovery, and multi-agent execution.

## 1. Purpose

Praxis Studio must not be reduced to a chat panel, a form-based action console, or a Claude Code clone.

The target is:

```text
Claude Code-like runtime quality
Praxis-native object model
Documented-memory-first, graph-projected interaction
Docs-backed Project Memory as the durable authority
Controlled external coding agents as workers
```

The user-facing experience should feel like a real agent session:

```text
user goal
  -> agent explains current understanding
  -> agent builds target context
  -> agent calls governed tools
  -> agent asks permission when needed
  -> user approves / rejects / modifies
  -> agent continues
  -> memory, graph projections, tasks, traces and transcript stay inspectable
```

## 2. Core Distinction

Praxis needs an Agent Runtime, not one monolithic agent.

```text
Agent Session
  the conversation and transcript the user sees

Agent Runtime
  the execution system behind the conversation

Agent Loop
  the repeated model/tool/permission/context cycle inside one run

Tool Runtime
  governed capabilities that can read, plan, write memory, invalidate projections, generate tasks or call external workers

Project Memory
  normalized project documents plus Git timeline, updated from facts, inferences and user confirmations

Graph Projection
  derived live views over docs, parsed models, plans, tasks and trace

Trace
  low-level execution audit record, not the chat itself
```

Praxis does not copy Claude Code's product center. Claude Code is file, command, patch and test centered. Praxis is:

```text
documented memory events
models
specifications
graph projection views
plans
tasks
project intake
projection invalidation
confirmed development knowledge
```

## 3. Specification Map

Read these files together:

```text
docs/agent-runtime/
  README.md
  01-agent-session-and-loop.md
  02-tool-runtime-and-permission.md
  03-context-memory-transcript.md
  04-multi-agent-task-runtime.md
  05-observability-recovery.md
  06-capability-roadmap.md
```

Relationship to existing specs:

```text
docs/AGENT_RUNTIME_SPEC.md
  earlier runtime notes and v0.1 boundary

docs/DEVELOPMENT_GRAPH_SPEC.md
  earlier graph object model; superseded by documented-memory-first graph projection rules where conflicts exist

docs/specs/13-live-projection-loop.md
  canonical live projection loop for agent construction

docs/specs/14-graph-anchored-context.md
  graph element to ContextPacket rules for scoped discussion and construction

docs/specs/15-code-reading-to-model-patches.md
  AI/static analysis patch pipeline for UML, architecture and Gantt projections

docs/specs/16-anti-pattern-quality-management.md
  finding memory, graph annotations and finding-anchored quality resolution

docs/specs/17-opinionated-governance-playbooks.md
  professional default remediation, user intervention points and playbook-backed governance

docs/prompts/
  prompt procedures that execute playbooks without scattering prompt logic in UI components

docs/LOCAL_KNOWLEDGE_SPEC.md
  .distinction migration/runtime state and docs-backed project memory model

docs/CODING_AGENT_ADAPTER_SPEC.md
  external coding agent adapter boundary

docs/CLEAN_ROOM_BORROWING_SPEC.md
  rules for learning mechanisms without cloning products or moving unsafe code into core
```

## 4. Non-Negotiable Product Rules

The Agent Runtime must enforce the repository principles:

```text
1. Chat is bound to selected project / node / edge / subgraph.
2. Explain before Plan.
3. Plan before Apply.
4. Local scan produces FACT.
5. Agent produces CANDIDATE / INFERENCE.
6. User confirmation produces CONFIRMED memory.
7. External coding agents are workers.
8. Praxis owns memory, models, graph projections, progress, trace and task intent.
9. v0.1 does not automatically modify existing source code.
10. Writes must go through Tool Registry and Trace Recorder.
11. Graph projections are live views and must be updated or invalidated by runtime events.
12. Graph nodes, edges, tasks and trace nodes are context anchors that produce bounded ContextPacket.
13. Agent must use ContextPacket before expanding to wider repository search.
14. AI must propose MemoryPatch / ModelPatch / PlanPatch rather than directly editing UML / architecture / Gantt view cache.
15. Anti-pattern findings are structured memory and can become graph/chat anchors.
16. Governance recommendations must be playbook-backed, opinionated, explainable and user-overridable.
```

## 5. Maturity Levels

Praxis should grow the runtime in levels.

```text
L1: Session Chat
  durable target-bound transcript, non-mock model calls, visible run status

L2: Tool Loop
  model can call governed tools and continue after tool results

L3: Permission Runtime
  tool exposure filtering, execution permission, approval / reject / modify

L4: Context Governance
  memory recall, transcript resume, compaction, target-scoped budget

L5: Recovery and Observability
  trace timeline, terminal reasons, abort, retry, model fallback, resumable runs

L6: Multi-Agent Runtime
  subagents, background tasks, worktree / remote isolation, named worker routing
```

v0.1 should reach a useful subset of L1 to L3, with early pieces of L4 and L5 where needed to avoid brittle sessions.

## 6. Clean Boundary

Praxis may learn from mature agent runtimes, including Claude Code-like systems, but the borrowed unit is an abstract mechanism:

```text
query engine
agent loop
tool runtime
permission policy
context compaction
transcript resume
subagent lifecycle
trace and recovery
```

The product center must remain Praxis:

```text
Structured Memory is the source of truth.
Graph Projections are live workspace views.
Graph Anchors are semantic entry points.
ContextPacket is bounded working context, not new truth.
Patches are proposed changes, not confirmed truth.
UML / C4 / Gantt are deterministic projections from models.
Quality Findings are memory-backed annotations, not disposable UI warnings.
Agent Chat is the interaction entrance.
Tool / Plan / Apply / Task are events inside the session.
Runtime Events update memory or invalidate projections.
Trace is durable audit and a source for trace views.
```
