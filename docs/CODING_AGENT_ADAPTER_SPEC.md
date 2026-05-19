# Coding Agent Adapter Spec

## 1. 定位

Praxis Studio v0.1 不实现完整自动代码修改 agent，但必须能生成外部 coding agent 可执行的任务包。

外部 coding agent 包括：

```text
Claude Code
Codex
Claude Code Best
OpenCode
Manual execution
```

Praxis 的职责是：

```text
生成任务上下文
限定修改范围
生成验收标准
记录 trace
回写 graph / memory / progress
```

外部 agent 的职责是：

```text
具体修改代码
运行测试
生成 patch
返回结果
```

---

## 2. CodingAgentTask

```ts
export interface CodingAgentTask {
  id: string;
  title: string;
  instruction: string;

  source: {
    planId?: string;
    targetNodeIds: string[];
    targetEdgeIds: string[];
  };

  context: {
    architectureContext: string;
    graphContext: string;
    memoryContext: string[];
    constraints: string[];
  };

  scope: {
    relatedFiles: string[];
    allowedPaths: string[];
    forbiddenPaths: string[];
  };

  acceptanceCriteria: string[];
  verificationCommands: string[];

  expectedOutput: {
    patchSummary: boolean;
    changedFiles: boolean;
    testResult: boolean;
    progressSuggestion: boolean;
    memorySuggestion: boolean;
  };
}
```

---

## 3. ManualAdapter

v0.1 必须实现 ManualAdapter。

它做：

```text
Plan → CodingAgentTask → TASK.md
```

输出：

```text
.distinction/tasks/TASK-0001.md
```

用户可以复制 TASK.md 给 Claude Code / Codex / CCB。

Markdown 模板：

```md
# TASK-0001 Implement report-to-memory-event writer

## Context

Selected edge:
Architecture Memory --records--> Local Knowledge

## Allowed paths

- packages/local-knowledge/src
- packages/trace-recorder/src

## Forbidden paths

- apps/studio-desktop/src

## Acceptance Criteria

- Report can be converted into MemoryEvent
- MemoryEvent is appended to .distinction/memory/changes.md
- Trace event is recorded

## Verification

- npm run build
- npm test

## Instructions for external coding agent

Work only inside the allowed paths. Return a patch summary, changed files, test result, progress suggestion, and memory suggestion.
```

---

## 4. ClaudeCodeBestAdapter

v0.1 只做 skeleton，不自动执行。

```ts
export class ClaudeCodeBestAdapter implements CodingAgentAdapter {
  name = "claude-code-best";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "ccb",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open CCB in project root and paste the generated task."
    };
  }
}
```

v0.2 再考虑自动调用。

## 5. Additional v0.1 Skeletons

v0.1 should also expose skeleton adapters for:

```text
CodexAdapter
ClaudeCodeAdapter
OpenCodeAdapter
```

They have the same boundary as `ClaudeCodeBestAdapter`:

```text
prepare task package
produce manual command or instructions
do not execute automatically
do not edit source through Praxis
do not run tests automatically
```

---

## 6. Result 回填

第一版支持手动回填：

```ts
interface CodingAgentResult {
  taskId: string;
  status: "done" | "failed" | "partial";
  summary: string;
  changedFiles?: string[];
  testResult?: string;
  progressSuggestion?: {
    nodeUpdates?: { nodeId: string; progress: number }[];
    edgeUpdates?: { edgeId: string; progress: number }[];
  };
  memorySuggestion?: string;
}
```

用户确认后：

```text
更新 node progress
更新 edge progress
写入 memory event
写入 trace
```

If the external agent suggests source changes that exceed the original task scope, Praxis must record them as a candidate follow-up task instead of silently expanding the current task.
