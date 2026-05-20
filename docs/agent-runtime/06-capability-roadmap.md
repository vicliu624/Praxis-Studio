# 06. Capability Roadmap

Status: draft  
Depends on: all Agent Runtime specification files

## 1. Goal

Praxis should eventually reach Claude Code-like agent session completeness, but with Praxis-native objects and boundaries.

The roadmap is phased to avoid building a fragile runtime giant too early.

## 2. Capability Matrix

| Capability Area | v0.1 Target | Later Target |
| --- | --- | --- |
| Multi-turn chat | Durable target-bound sessions | Cross-target session linking and summaries |
| Streaming | Non-streaming plus step events acceptable | JSONL / event stream with live deltas |
| Tool calls | Governed Praxis tools | Deferred tool discovery and dynamic tool loading |
| Permission | Apply graph / memory / task approval | Tool exposure rules, command approval, policy profiles |
| Context | Target-scoped graph and memory context | Auto compact, microcompact, memory prefetch, tool result budgets |
| Recovery | Abort, terminal reason, clear failure messages | Fallback model, transcript resume, synthetic tool result recovery |
| Subagents | Specification and task lifecycle only | Background agents, named teams, isolated workers |
| External coding | Generate task and manual import | Worktree / remote worker execution with approval |
| Observability | Run JSON, trace JSONL, transcript cards | Full run timeline, cost, model usage, trace explorer |
| Source edits | Not automatic | Optional approved worker patches outside v0.1 boundary |
| Shell / tests | Not automatic | execute_guarded with command preview and approval |
| Web / browser | Not v0.1 core | Guarded tools for docs, issue trackers, logs and repro |

## 3. Phase 1: Agent Chat v1

Required:

```text
target-bound sessions
multi-turn transcript
messages not overwritten
visible working status
permission cards
plan cards
task cards
result cards
history scroll is stable during runs
root window has no body scroll
chat stored in .distinction/chat
trace stored outside chat
```

This phase makes Praxis feel like an agent workspace instead of a form panel.

## 4. Phase 2: Agent Loop v1

Required:

```text
AgentSessionEngine
AgentRun
AgentRunStep
terminalReason
mode transitions
tool call records
context compaction event
abort signal propagation
provider error handling
```

The loop may start with deterministic runtime calls, but the data model must be compatible with true model tool-use.

## 5. Phase 3: Tool Runtime and Permission

Required:

```text
ToolDefinition with schema and risk level
ToolContext
ToolResult view model
PermissionPolicy
tool exposure filtering
execution permission check
approval / reject / modify flow
command preview for future execute tools
```

v0.1 write tools:

```text
write chat
write trace
write graph
write memory proposal
write confirmed memory after user confirmation
write coding task artifact
write docs after approval
```

## 6. Phase 4: Context Governance

Required:

```text
target context builder
session transcript summary
recent message window
relevant memory recall
confirmed decision injection
tool result summarization
prompt budget policy
context.compacted event
```

Praxis-specific context must prioritize:

```text
selected target
graph relationships
progress and blocked reasons
product specifications
confirmed memory
open questions
task lineage
```

## 7. Phase 5: Task and External Worker Runtime

Required:

```text
CodingTask package
task scope and constraints
manual external adapter
worker result import
result review card
proposed graph / memory update from worker result
user confirmation before confirmed memory
```

Future:

```text
background worker
worktree isolation
remote worker
test result ingestion
patch review
```

## 8. Phase 6: Multi-Agent Runtime

Required later:

```text
SubagentDefinition
Subagent lifecycle
background progress
kill / cancel
output artifacts
team member routing
permission inheritance
isolation mode
parent run linkage
```

This phase should be implemented only after the single-session runtime is stable.

## 9. What Not To Build First

Do not start with:

```text
automatic source editing
full shell execution
remote control
browser / computer use
complex multi-agent teams
provider-specific compatibility behavior
Claude Code emulation
```

Those features are useful later only if the governed runtime foundation already works.

## 10. v0.1 Readiness Checklist

```text
1. API key belongs to IDE/user settings, not project .distinction.
2. No provider mock is used when the user asked for real model calls.
3. Agent run can wait for permission without hiding the requested action.
4. Chat history remains readable while agent is working.
5. Parent app window does not scroll.
6. Explain, Plan, Apply and Task are session events.
7. Tool calls and runtime steps are visible enough for debugging.
8. Failed run has a meaningful terminal reason.
9. Source code is not automatically modified in v0.1.
10. External coding agents are workers, never Praxis' memory authority.
```

