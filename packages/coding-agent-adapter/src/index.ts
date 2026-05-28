import {
  ExternalAgentResultSchema,
  type CodeFactEvidenceRef,
  type ExternalAgentResult,
  type FindingStatusPatch,
  type MemorySuggestionPatch
} from "@praxis/schema";

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

export interface PiCodingAgentPayload {
  schemaVersion: "praxis.piCodingAgentPayload.v1";
  adapter: {
    name: "pi-coding-agent";
    boundary: "external_worker";
    version: string;
  };
  task: CodingAgentTask;
  contextPacket?: unknown;
  instructions: string[];
  returnContract: {
    schemaVersion: "praxis.externalAgentResult.v1";
    requiredFields: string[];
    optionalFields: string[];
    reviewPolicy: string;
  };
}

export interface PiImportedResult {
  sourceText: string;
  parsedJson: boolean;
  raw: unknown;
  externalAgentResult?: ExternalAgentResult;
}

export interface PiRawResult {
  id?: string;
  taskId?: string;
  status?: "done" | "partial" | "failed";
  summary?: string;
  changedFiles?: string[];
  testResult?: string;
  memorySuggestion?: string;
  memorySuggestions?: MemorySuggestionPatch[];
  findingStatusSuggestions?: FindingStatusPatch[];
  evidence?: CodeFactEvidenceRef[];
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

export class PiCodingAgentAdapter implements CodingAgentAdapter {
  name = "pi-coding-agent";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    const payload = generatePiTaskPayload(task);
    return {
      kind: "markdown",
      markdown: renderPiTaskMarkdown(payload),
      instructions: "Copy or export this governed task payload to Pi, then import Pi's result back into Praxis review."
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

export function generatePiTaskPayload(task: CodingAgentTask, contextPacket?: unknown): PiCodingAgentPayload {
  return {
    schemaVersion: "praxis.piCodingAgentPayload.v1",
    adapter: {
      name: "pi-coding-agent",
      boundary: "external_worker",
      version: "0.1"
    },
    task,
    contextPacket,
    instructions: [
      "Act as an external coding worker. Praxis owns memory, findings, graph state, and acceptance.",
      "Do not treat your output as confirmed Praxis memory.",
      "Return a praxis.externalAgentResult.v1 JSON object when possible.",
      "If you cannot complete the task, set status to partial or failed and explain why."
    ],
    returnContract: {
      schemaVersion: "praxis.externalAgentResult.v1",
      requiredFields: ["schemaVersion", "id", "taskId", "status", "summary", "changedFiles", "evidence", "memorySuggestions", "findingStatusSuggestions", "createdAt"],
      optionalFields: ["testResult"],
      reviewPolicy: "Imported results enter Praxis Review Queue. A user must accept memory or finding status patches before durable memory changes."
    }
  };
}

export function importPiResult(resultFileOrText: string): PiImportedResult {
  const sourceText = resultFileOrText.trim();
  if (!sourceText) {
    return {
      sourceText,
      parsedJson: false,
      raw: { status: "failed", summary: "Pi result import was empty." } satisfies PiRawResult
    };
  }

  const parsed = tryParseJson(sourceText);
  if (parsed.ok) {
    const external = ExternalAgentResultSchema.safeParse(parsed.value);
    return {
      sourceText,
      parsedJson: true,
      raw: parsed.value,
      externalAgentResult: external.success ? external.data : undefined
    };
  }

  return {
    sourceText,
    parsedJson: false,
    raw: {
      status: "partial",
      summary: firstNonEmptyLine(sourceText) ?? "Pi returned an unstructured result.",
      changedFiles: extractChangedFiles(sourceText),
      testResult: extractTestResult(sourceText),
      memorySuggestion: sourceText
    } satisfies PiRawResult
  };
}

export function normalizeToExternalAgentResult(input: PiImportedResult | PiRawResult | unknown, task?: CodingAgentTask): ExternalAgentResult {
  if (isPiImportedResult(input) && input.externalAgentResult) return input.externalAgentResult;
  const raw = normalizeRawInput(input);
  const now = new Date().toISOString();
  const taskId = stringOr(raw.taskId, task?.id ?? `pi-task-${Date.now()}`);
  const id = stringOr(raw.id, `external-result:pi:${safeId(taskId)}:${Date.now()}`);
  const evidence: CodeFactEvidenceRef[] = raw.evidence?.length
    ? raw.evidence
    : [
        {
          source: "agent_inference",
          filePath: `.distinction/reports/external-results/${safeFilePart(id)}.json`,
          excerpt: raw.summary ?? "Pi coding worker result."
        }
      ];
  const memorySuggestions = raw.memorySuggestions ?? buildMemorySuggestionsFromText(raw, id, taskId, now, evidence);
  const findingStatusSuggestions = raw.findingStatusSuggestions ?? [];

  return ExternalAgentResultSchema.parse({
    schemaVersion: "praxis.externalAgentResult.v1",
    id,
    taskId,
    status: raw.status ?? "partial",
    summary: stringOr(raw.summary, "Pi coding worker returned a result."),
    changedFiles: raw.changedFiles ?? [],
    testResult: raw.testResult,
    evidence,
    memorySuggestions,
    findingStatusSuggestions,
    createdAt: now
  } satisfies ExternalAgentResult);
}

export function renderPiTaskMarkdown(payload: PiCodingAgentPayload): string {
  return [
    `# Pi Coding Worker Payload`,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "## Human-readable task",
    "",
    renderCodingTaskMarkdown(payload.task),
    "",
    "## Return contract",
    "",
    "Return `praxis.externalAgentResult.v1` JSON if possible. Praxis will import it into Review Queue; it will not be accepted automatically."
  ].join("\n");
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

function buildMemorySuggestionsFromText(
  raw: PiRawResult,
  resultId: string,
  taskId: string,
  timestamp: string,
  evidence: CodeFactEvidenceRef[]
): MemorySuggestionPatch[] {
  const text = raw.memorySuggestion?.trim();
  if (!text) return [];
  const suggestionId = `memory-suggestion:pi:${safeId(taskId)}:${Date.now()}`;
  return [
    {
      schemaVersion: "praxis.memorySuggestionPatch.v1",
      id: suggestionId,
      sourceResultId: resultId,
      sourceTaskId: taskId,
      summary: `Pi suggested project memory for ${taskId}.`,
      memoryPatches: [
        {
          id: `memory-patch:pi:${safeId(taskId)}:${Date.now()}`,
          operation: "append",
          status: "proposed",
          record: {
            id: `memory:candidate:pi:${safeId(taskId)}:${Date.now()}`,
            kind: "CANDIDATE",
            type: "external_agent_observation",
            subject: taskId,
            predicate: "reported",
            value: { text },
            summary: firstNonEmptyLine(text) ?? `Pi result observation for ${taskId}.`,
            evidence,
            source: "agent",
            confidence: "medium",
            status: "proposed",
            createdAt: timestamp,
            updatedAt: timestamp
          },
          sourceCodeFactIds: []
        }
      ],
      createdAt: timestamp
    }
  ];
}

function normalizeRawInput(input: PiImportedResult | PiRawResult | unknown): PiRawResult {
  if (isPiImportedResult(input)) {
    if (input.externalAgentResult) {
      return input.externalAgentResult as unknown as PiRawResult;
    }
    if (isRecord(input.raw)) return input.raw as PiRawResult;
    return { summary: input.sourceText, memorySuggestion: input.sourceText };
  }
  if (isRecord(input)) return input as PiRawResult;
  if (typeof input === "string") return { summary: input, memorySuggestion: input };
  return {};
}

function isPiImportedResult(value: unknown): value is PiImportedResult {
  return isRecord(value) && "sourceText" in value && "parsedJson" in value && "raw" in value;
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#*\-\s]+/, "").trim())
    .find(Boolean);
}

function extractChangedFiles(value: string): string[] {
  return Array.from(
    new Set(
      [...value.matchAll(/(?:^|\s)([A-Za-z0-9_.\/\\-]+\.(?:ts|tsx|js|jsx|rs|md|json|yaml|yml|toml|css|html|py|go|cpp|h))/g)].map(
        (match) => match[1]
      )
    )
  );
}

function extractTestResult(value: string): string | undefined {
  const match = value.match(/(?:test|verification|验证|测试)[^\n:：]*[:：]\s*(.+)/i);
  return match?.[1]?.trim();
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

function safeFilePart(value: string): string {
  return safeId(value).replace(/[:]/g, "-");
}
