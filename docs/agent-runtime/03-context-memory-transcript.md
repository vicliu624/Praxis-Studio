# 03. Context, Memory and Transcript Spec

Status: draft  
Depends on: `docs/LOCAL_KNOWLEDGE_SPEC.md`, `packages/context-builder`, `packages/chat-session`, `packages/trace-recorder`

## 1. Principle

Long-running agent quality depends on context governance.

Praxis must not solve context by endlessly sending all prior messages. It must separate:

```text
Transcript
  what the user saw and said

Trace
  what the runtime did

Memory
  durable project knowledge

Context
  the selected subset prepared for the next model call
```

These are related but not interchangeable.

## 2. Knowledge States

Praxis knowledge must carry provenance.

```text
FACT
  produced by deterministic local scan or explicit file read

CANDIDATE
  generated hypothesis awaiting review

INFERENCE
  model-derived interpretation from available evidence

CONFIRMED
  user-confirmed memory or accepted graph knowledge
```

Rules:

```text
1. Local scan may create FACT.
2. Agent output may create CANDIDATE or INFERENCE.
3. User confirmation may create CONFIRMED.
4. The runtime must not silently upgrade AI guesses into confirmed memory.
```

## 3. Storage Boundary

Recommended `.distinction` layout:

```text
.distinction/
  chat/
    sessions.json
    sessions/
      session-0001.jsonl
      session-0002.jsonl

  graph/
    nodes.json
    edges.json

  memory/
    traces.jsonl
    changes.md
    decisions/
    confirmed/

  runs/
    run-*.json

  tasks/
    task-*.md
```

Interpretation:

```text
chat/session-*.jsonl
  user-facing conversation record

runs/run-*.json
  detailed run state and step timeline

memory/traces.jsonl
  machine-readable audit trail

memory/confirmed/*
  durable user-confirmed project knowledge
```

Do not dump raw trace events into chat as if they were conversation.

## 4. Context Pipeline

Each turn should build context through a staged pipeline.

```text
1. Resolve selected target.
2. Load session transcript summary and recent messages.
3. Load graph context for target.
4. Load relevant memory and decisions.
5. Load relevant prior tool results.
6. Apply current mode and permission policy.
7. Apply token budget.
8. Compact or summarize if needed.
9. Produce model-ready messages and tool list.
```

## 5. Target Context

### Project Context

```ts
export interface ProjectAgentContext {
  projectRoot: string;
  graphSummary: string;
  activeRisks: string[];
  recentDecisions: string[];
  openQuestions: string[];
  relevantTasks: string[];
}
```

### Node Context

```ts
export interface NodeAgentContext {
  nodeId: string;
  nodeTitle: string;
  nodeKind: string;
  status: string;
  progress: number;
  incomingEdges: string[];
  outgoingEdges: string[];
  evidence: string[];
  memoryEvents: string[];
  unresolvedQuestions: string[];
}
```

### Edge Context

```ts
export interface EdgeAgentContext {
  edgeId: string;
  sourceNode: string;
  targetNode: string;
  kind: string;
  status: string;
  progress: number;
  riskLevel: string;
  blockedReason?: string;
  evidence: string[];
  missingGluePoints: string[];
  relatedTasks: string[];
}
```

## 6. Transcript Governance

Transcript rules:

```text
1. User messages, assistant messages and visible cards must persist.
2. Streaming messages may be updated in place until done.
3. Tool call details may be summarized in chat but must remain recoverable from run trace.
4. Permission prompts are transcript objects.
5. Result cards are transcript objects.
6. Error recovery cards are transcript objects.
```

The UI must keep history readable while the agent runs. Auto-scroll only when the user is already near the bottom.

## 7. Context Compaction

Compaction is a runtime behavior, not a UI trick.

Triggers:

```text
prompt too long
session message count over budget
tool results over budget
large memory recall
long-running run approaching model context limit
```

Compaction output:

```ts
export interface ContextCompaction {
  id: string;
  sessionId: string;
  runId: string;
  createdAt: string;
  reason: "prompt_too_long" | "message_budget" | "tool_result_budget" | "manual";
  preservedFacts: string[];
  preservedDecisions: string[];
  preservedOpenQuestions: string[];
  droppedMessageIds: string[];
  summary: string;
}
```

Rules:

```text
1. Compaction must preserve target, current plan, pending permission and confirmed knowledge.
2. Compaction may summarize old assistant text.
3. Compaction must not delete the durable transcript.
4. Compaction should emit a context.compacted event.
```

## 8. Memory Recall

Memory recall should be target-scoped first.

Priority:

```text
1. confirmed decisions about selected target
2. open risks and blockers on selected target
3. recent related plan actions
4. related source scan facts
5. related prior chat summaries
6. broader project principles
```

Memory recall must distinguish evidence from interpretation.

## 9. Acceptance Criteria

```text
1. Chat, trace, run state and memory have separate storage.
2. Agent output cannot become confirmed memory without user confirmation.
3. Context is built from target, transcript, memory, graph and policy.
4. Prompt-too-long errors trigger compaction or a clear terminal reason.
5. Reloading the project restores target-bound sessions.
6. The user can inspect why a plan or explanation was produced.
```

