# 01. Agent Session and Loop Spec

Status: draft  
Depends on: `docs/DEVELOPMENT_GRAPH_SPEC.md`, `docs/LOCAL_KNOWLEDGE_SPEC.md`, `docs/AGENT_RUNTIME_SPEC.md`

## 1. Positioning

The right-side Praxis experience must be an Agent Session, not an action form.

Bad shape:

```text
instruction textarea
Explain / Plan / Task buttons
single response string
old response overwritten by new response
```

Required shape:

```text
target-bound transcript
multi-turn conversation
streaming or staged run events
tool timeline
permission cards
plan and task cards
visible run status
recoverable errors
durable session state
```

## 2. Runtime Layers

Praxis should expose several clients, but they must reuse the same runtime core.

```text
Studio UI
Runtime CLI
future IDE adapter
future SDK / MCP / ACP adapter
        |
        v
AgentSessionEngine
        |
        v
AgentLoop
        |
        +-- ModelRouter / Provider
        +-- ToolRuntime / ToolRegistry
        +-- PermissionPolicy
        +-- ContextEngine
        +-- TranscriptStore
        +-- TraceRecorder
        +-- ProjectMemoryStore
```

The Studio UI is a client. It must not own the core agent semantics.

## 3. Core Objects

### AgentSession

An `AgentSession` is a durable conversation bound to a target.

```ts
export interface AgentSession {
  id: string;
  projectRoot: string;
  title: string;

  target:
    | { type: "project" }
    | { type: "node"; id: string }
    | { type: "edge"; id: string }
    | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

  mode: "explain" | "plan" | "apply" | "task";
  modelRoute?: string;

  createdAt: string;
  updatedAt: string;
}
```

### AgentTurn

An `AgentTurn` is one user message plus the runtime work caused by it.

```ts
export interface AgentTurn {
  id: string;
  sessionId: string;
  runId: string;
  userMessageId: string;
  status: "queued" | "running" | "waiting_permission" | "completed" | "failed" | "cancelled";
  terminalReason?: AgentTerminalReason;
  startedAt: string;
  completedAt?: string;
}
```

### AgentRun

An `AgentRun` is the execution record for one turn. It owns loop steps, tool calls, permissions and terminal reason.

```ts
export type AgentTerminalReason =
  | "completed"
  | "max_turns"
  | "permission_rejected"
  | "permission_modified"
  | "aborted"
  | "provider_error"
  | "prompt_too_long"
  | "tool_error"
  | "unknown_error";
```

## 4. Agent Loop

Praxis must treat a model response as one phase of a loop, not the whole run.

```text
while run is active:
  prepare target-scoped context
  call model with current messages, tools and policy
  stream / collect assistant blocks
  detect tool calls
  execute allowed tools
  append tool results to context
  request permission when needed
  continue until no tool calls, failure, max turns or user abort
```

The loop must support:

```text
model streaming
tool call discovery
tool execution
tool result injection
permission pause and resume
user abort
max turns
context compaction
trace recording
terminal reason
```

## 5. Run State Machine

```text
idle
  -> receiving_user_turn
  -> preparing_context
  -> calling_model
  -> streaming_response
  -> executing_tools
  -> waiting_permission
  -> continuing_after_permission
  -> completed

failure exits:
  -> failed
  -> cancelled
  -> compacted_and_retrying
```

Rules:

```text
1. waiting_permission must freeze the mutation and keep the run visible.
2. user history must remain scrollable while a run is active.
3. auto-scroll is allowed only when the user is already near the bottom.
4. run command / shell / external action previews must be visible before approval.
5. every terminal exit must produce a terminalReason.
```

## 6. Session Events

The UI should consume runtime events, whether they come from CLI JSONL, Tauri events, or an in-process adapter.

```ts
export type AgentSessionEvent =
  | { type: "message.started"; messageId: string; role: "assistant" }
  | { type: "content.delta"; messageId: string; delta: string }
  | { type: "message.finished"; messageId: string }
  | { type: "tool.started"; toolCallId: string; name: string; inputSummary: string }
  | { type: "tool.progress"; toolCallId: string; summary: string }
  | { type: "tool.finished"; toolCallId: string; status: "success" | "failed"; outputSummary?: string }
  | { type: "plan.created"; messageId: string; plan: unknown }
  | { type: "task.created"; messageId: string; task: unknown }
  | { type: "permission.requested"; request: unknown }
  | { type: "permission.resolved"; requestId: string; decision: "approve" | "reject" | "modify" }
  | { type: "context.compacted"; summary: string }
  | { type: "run.finished"; runId: string; status: "completed" | "failed" | "cancelled"; terminalReason: AgentTerminalReason };
```

v0.1 may implement non-streaming `chat-send` or `agent-run`, but internally it should still produce equivalent step records. The UI should not be built around a single response string.

## 7. UI Contract

The Agent Session panel consists of:

```text
Target Context Bar
  selected target, status, progress, risk and session metadata

Transcript
  user messages
  assistant messages
  tool call cards
  plan cards
  permission cards
  task cards
  result cards
  error recovery cards

Composer
  natural language input
  shortcuts for Explain / Plan / Task / Apply
  attachment and selected target awareness
```

Shortcuts are allowed, but they must append messages into the transcript. They must not become the primary runtime abstraction.

## 8. Intent Inference

v0.1 can infer intent by deterministic rules.

```ts
export type ChatIntent =
  | "explain"
  | "plan"
  | "generate_task"
  | "apply"
  | "import_result";
```

Rules:

```text
explain is the default
plan requires prior explanation context or user explicit request
apply requires a prior plan and permission
generate_task requires plan or explicit selected target context
import_result must never mark memory confirmed without user confirmation
```

Later versions may let the model classify intent, but the decision must be traceable.

## 9. Acceptance Criteria

The Agent Session layer is acceptable when:

```text
1. Messages are not overwritten.
2. A selected node / edge / subgraph gets a durable target-bound session.
3. Explain / Plan / Task appear as transcript events.
4. Tool calls are visible in the transcript or trace timeline.
5. Permission prompts pause the run and show affected objects.
6. User can scroll history while the agent is working.
7. Root app window does not scroll; internal panes own scrolling.
8. Failed runs explain where the runtime stopped.
9. Chat writes to .distinction/chat.
10. Trace writes to .distinction/memory/traces.jsonl or .distinction/runs.
```

