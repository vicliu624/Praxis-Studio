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

export interface CodingAgentResult {
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

export interface CodingAgentResultInput {
  taskId: string;
  status: "done" | "partial" | "failed";
  summary: string;
  changedFiles: string[];
  testResult?: string;
  progressSuggestion?: {
    nodeUpdates?: { nodeId: string; progress: number }[];
    edgeUpdates?: { edgeId: string; progress: number }[];
  };
  memorySuggestion?: string;
}

export interface CodingAgentPreparedTask {
  kind: "markdown" | "manual_command";
  markdown?: string;
  command?: string;
  promptFile?: string;
  instructions: string;
}

export interface CodingAgentAdapter {
  name: string;
  prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask>;
}

export class ManualAdapter implements CodingAgentAdapter {
  name = "manual";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "markdown",
      markdown: renderCodingTaskMarkdown(task),
      instructions: "Copy this task into the external coding agent, then paste the result back into Praxis."
    };
  }
}

export class ClaudeCodeBestAdapter implements CodingAgentAdapter {
  name = "claude-code-best";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "ccb",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open ccb in project root and paste the generated task."
    };
  }
}

export class CodexAdapter implements CodingAgentAdapter {
  name = "codex";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "codex",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open Codex in project root and provide the generated task file."
    };
  }
}

export class ClaudeCodeAdapter implements CodingAgentAdapter {
  name = "claude-code";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "claude",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open Claude Code in project root and provide the generated task file."
    };
  }
}

export class OpenCodeAdapter implements CodingAgentAdapter {
  name = "opencode";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "opencode",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open OpenCode in project root and provide the generated task file."
    };
  }
}

export function createCodingAgentTask(input: Partial<CodingAgentTask> & Pick<CodingAgentTask, "title" | "instruction">): CodingAgentTask {
  const id = input.id ?? `TASK-${String(Date.now()).slice(-4)}`;
  return {
    id,
    title: input.title,
    instruction: input.instruction,
    source: input.source ?? { targetNodeIds: [], targetEdgeIds: [] },
    context: input.context ?? {
      architectureContext: "",
      graphContext: "",
      memoryContext: [],
      constraints: ["Do not modify files outside allowed paths."]
    },
    scope: input.scope ?? {
      relatedFiles: [],
      allowedPaths: [".distinction"],
      forbiddenPaths: ["apps/studio-desktop/src", "src"]
    },
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    verificationCommands: input.verificationCommands ?? ["npm run build", "npm run typecheck"],
    expectedOutput: input.expectedOutput ?? {
      patchSummary: true,
      changedFiles: true,
      testResult: true,
      progressSuggestion: true,
      memorySuggestion: true
    }
  };
}

export function renderCodingTaskMarkdown(task: CodingAgentTask): string {
  return [
    `# ${task.id} ${task.title}`,
    "",
    "## Selected target",
    "",
    `Plan: ${task.source.planId ?? "None"}`,
    "",
    "Target nodes:",
    ...list(task.source.targetNodeIds),
    "",
    "Target edges:",
    ...list(task.source.targetEdgeIds),
    "",
    "## Context",
    "",
    task.context.graphContext || "No graph context provided.",
    "",
    "## Architecture Context",
    "",
    task.context.architectureContext || "No architecture context provided.",
    "",
    "## Allowed paths",
    "",
    ...list(task.scope.allowedPaths),
    "",
    "## Forbidden paths",
    "",
    ...list(task.scope.forbiddenPaths),
    "",
    "## Acceptance Criteria",
    "",
    ...list(task.acceptanceCriteria),
    "",
    "## Verification",
    "",
    ...list(task.verificationCommands),
    "",
    "## Instructions for external coding agent",
    "",
    task.instruction,
    "",
    "## Expected return format",
    "",
    "- Patch summary",
    "- Changed files",
    "- Test result",
    "- Progress suggestion",
    "- Memory suggestion",
    ""
  ].join("\n");
}

function list(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- None"];
}
