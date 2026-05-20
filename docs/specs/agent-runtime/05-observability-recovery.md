# 05. Observability and Recovery Spec

Status: draft  
Depends on: `packages/trace-recorder`, `packages/agent-loop`, `packages/chat-session`

## 1. Principle

A production agent runtime must explain what happened.

Praxis must be able to answer:

```text
Which model was called?
Which context was sent?
Which tools were exposed?
Which tools ran?
Which permissions were requested?
Which permission was denied or modified?
Which memory was read?
Which graph objects were affected?
Why did the run stop?
What should the user do next?
```

## 2. Trace Event Model

```ts
export interface AgentTraceEvent {
  id: string;
  runId: string;
  sessionId: string;
  timestamp: string;
  kind:
    | "run.started"
    | "context.built"
    | "context.compacted"
    | "model.called"
    | "model.delta"
    | "model.finished"
    | "model.failed"
    | "tool.started"
    | "tool.progress"
    | "tool.finished"
    | "tool.failed"
    | "permission.requested"
    | "permission.approved"
    | "permission.rejected"
    | "permission.modified"
    | "plan.generated"
    | "task.generated"
    | "memory.proposed"
    | "memory.confirmed"
    | "graph.change_proposed"
    | "graph.change_applied"
    | "run.finished";

  target?: {
    type: "project" | "node" | "edge" | "subgraph";
    id?: string;
  };

  summary: string;
  data?: Record<string, unknown>;
}
```

## 3. Run Record

Each run should persist enough state to support debugging and future resume.

```ts
export interface AgentRunRecord {
  id: string;
  sessionId: string;
  status: "running" | "waiting_permission" | "completed" | "failed" | "cancelled";
  mode: "explain" | "plan" | "apply" | "task";
  target: unknown;
  modelRoute?: string;
  startedAt: string;
  completedAt?: string;
  terminalReason?: string;
  steps: AgentRunStep[];
  pendingPermissionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costEstimate?: number;
  };
}
```

## 4. Terminal Reasons

Every run must finish with a reason.

```text
completed
  no more tool calls or tasks remain

max_turns
  loop hit configured turn limit

permission_rejected
  user rejected a required action

permission_modified
  user asked to change the action before continuing

aborted
  user stopped the run or runtime signal aborted

provider_error
  model provider failed

prompt_too_long
  context exceeded provider limit and recovery failed

tool_error
  a required tool failed and no fallback was available

unknown_error
  unexpected failure
```

The UI should show terminal reason in the transcript or run details, not only in logs.

## 5. Recovery Cases

### Provider Abort

```text
1. Stop streaming.
2. Mark current assistant message cancelled or failed.
3. Abort running tools.
4. Persist terminal reason.
5. Leave transcript readable.
```

### Prompt Too Long

```text
1. Emit context.compacted if compaction is possible.
2. Retry once with compacted context.
3. If retry fails, stop with prompt_too_long.
```

### Tool Missing Result

If a model emits a tool call and execution fails before a result exists:

```text
1. Create a synthetic tool failure result.
2. Append it to run state.
3. Let the model recover if turns remain.
4. Otherwise stop with tool_error.
```

### Permission Timeout or Missing UI Response

```text
1. Keep run in waiting_permission.
2. Show pending request in transcript.
3. Allow reject / modify / approve from restored UI.
4. Do not auto-approve.
```

### Model Fallback

Future fallback must avoid leaking orphan tool call IDs.

```text
1. Tombstone incomplete assistant output.
2. Clear orphan tool execution state.
3. Retry with fallback model.
4. Trace fallback reason.
```

## 6. Observability Views

Praxis UI should eventually expose:

```text
Chat Transcript
  user-facing session messages

Run Timeline
  model calls, tool calls, permission, compaction, terminal reason

Memory Timeline
  proposed and confirmed memory changes

Graph Change Timeline
  proposed and applied graph mutations

External Worker Timeline
  task package, worker run, result import and review
```

## 7. Data Redaction

Trace should avoid leaking secrets.

Rules:

```text
1. API keys must never be written into project .distinction files.
2. Model settings belong to the IDE/user profile, not the project memory.
3. Tool input summaries should redact secrets and long raw payloads.
4. Full command previews may be shown to the user, but secrets must be masked.
```

## 8. Acceptance Criteria

```text
1. Every run has status, steps and terminal reason.
2. Permission waits are visible and resumable.
3. Abort leaves no fake success message.
4. Prompt-too-long has compaction or a clear failure.
5. Runtime failures do not corrupt transcript or graph.
6. API keys are never requested from .distinction/models.yaml.
7. Trace can explain why the agent made a claim or stopped.
```

