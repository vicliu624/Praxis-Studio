import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildContextPacket } from "@praxis/context-builder";
import {
  CodingAgentTaskSchema,
  ContextPacketSchema,
  ExternalAgentResultSchema,
  FindingStatusPatchSchema,
  MemorySuggestionPatchSchema,
  PlanPatchSchema,
  PraxisMcpGenerateTaskInputSchema,
  PraxisMcpGenerateTaskResultSchema,
  PraxisMcpPlanFromFindingInputSchema,
  PraxisMcpPlanFromFindingResultSchema,
  PraxisMcpRecordExternalResultInputSchema,
  PraxisMcpRecordExternalResultResultSchema,
  TraceRecordSchema,
  type CodingAgentTask,
  type ExternalAgentResult,
  type FindingStatusPatch,
  type MemorySuggestionPatch,
  type PlanPatch,
  type TraceRecord
} from "@praxis/schema";
import { enumSchema, graphAnchorJsonSchema, objectSchema, stringSchema } from "./schema-helpers.js";
import { readArchitectureFindingReport, requiredFinding } from "./findings.js";
import { isRecord, normalizeAnchorInput, readJsonWithSchema, resolveToolRoot, sanitizeId, tryReadJsonWithSchema, writeSchemaJson } from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const governedArtifactTools: McpToolDefinition[] = [
  {
    name: "praxis_plan_from_finding",
    description: "Create a governed PlanPatch from a finding. Does not modify source code or confirmed memory.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        findingId: stringSchema("Finding id to plan from."),
        strength: enumSchema(["conservative", "balanced", "aggressive"], "Governance remediation strength.")
      },
      ["findingId"]
    ),
    call: callPlanFromFinding
  },
  {
    name: "praxis_generate_task",
    description: "Generate a governed CodingAgentTask artifact for an anchor or finding. Does not execute an external agent.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      anchor: graphAnchorJsonSchema(),
      findingId: stringSchema("Optional finding id to task from."),
      adapter: enumSchema(["manual", "codex", "claude-code", "claude-code-best", "opencode"], "External adapter hint.")
    }),
    call: callGenerateTask
  },
  {
    name: "praxis_record_external_result",
    description: "Record an external agent result as trace/result artifacts. Does not confirm memory or edit source code.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        taskId: stringSchema("CodingAgentTask id."),
        status: enumSchema(["done", "partial", "failed"], "External agent result status."),
        summary: stringSchema("Result summary."),
        changedFiles: { type: "array", items: { type: "string" } },
        testResult: stringSchema("Optional test result summary."),
        evidencePaths: { type: "array", items: { type: "string" } }
      },
      ["taskId", "status", "summary"]
    ),
    call: callRecordExternalResult
  }
];

async function callPlanFromFinding(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpPlanFromFindingInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const finding = requiredFinding(await readArchitectureFindingReport(root), input.findingId);
  const strength = input.strength ?? "conservative";
  const planPatch = PlanPatchSchema.parse({
    schemaVersion: "praxis.planPatch.v1",
    id: `plan-patch:${sanitizeId(finding.id)}:${Date.now()}`,
    sourceFindingId: finding.id,
    title: `Plan remediation for ${finding.title}`,
    summary: finding.summary,
    strength,
    steps: [
      "Explain the finding and evidence before proposing edits.",
      ...finding.suggestedPlanActions,
      "Generate a controlled coding task instead of editing source directly.",
      "Record external result and rerun detector before closing the finding."
    ],
    createdAt: new Date().toISOString()
  } satisfies PlanPatch);
  const relativePath = `.distinction/cache/plan-patches/${sanitizeId(planPatch.id)}.json`;
  await writeSchemaJson(path.join(root, relativePath), planPatch, PlanPatchSchema);
  return PraxisMcpPlanFromFindingResultSchema.parse({
    schemaVersion: "praxis.mcp.planFromFindingResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    planPatch,
    path: relativePath
  });
}

async function callGenerateTask(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpGenerateTaskInputSchema.parse(normalizeAnchorInput(rawInput ?? {}));
  const root = resolveToolRoot(context, input.root);
  const finding = input.findingId ? requiredFinding(await readArchitectureFindingReport(root), input.findingId) : undefined;
  const anchor = input.anchor ?? (finding ? { kind: "finding" as const, id: finding.id } : undefined);
  if (!anchor) throw new Error("praxis_generate_task requires either anchor or findingId.");
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor,
      purpose: "task",
      createdBy: "mcp"
    })
  );
  const sourceFindingIds = finding ? [finding.id] : packet.findings.map((item) => item.id);
  const task = CodingAgentTaskSchema.parse({
    schemaVersion: "praxis.codingAgentTask.v1",
    id: `TASK-${Date.now()}`,
    sourceFindingIds,
    sourceContextPacketId: packet.id,
    goal: finding ? `Address finding: ${finding.title}` : `Work on anchor ${anchor.kind}:${anchor.id}`,
    nonGoals: ["Do not bypass Praxis memory/model confirmation boundaries.", "Do not modify files outside allowed paths."],
    allowedPaths: packet.scope.includedPaths.length ? packet.scope.includedPaths : ["."],
    forbiddenPaths: [".distinction/cache", ".distinction/views"],
    acceptanceCriteria: finding?.suggestedPlanActions.length ? finding.suggestedPlanActions : ["Explain the proposed change and provide verification evidence."],
    expectedOutputs: ["patch summary", "changed files", "test result", "risk notes"],
    riskNotes: packet.warnings.length ? packet.warnings : ["External agent must return results to Praxis instead of directly confirming memory."],
    createdAt: new Date().toISOString()
  } satisfies CodingAgentTask);
  const taskJsonPath = `.distinction/tasks/${task.id}.json`;
  const taskMarkdownPath = `.distinction/tasks/${task.id}.md`;
  await writeSchemaJson(path.join(root, taskJsonPath), task, CodingAgentTaskSchema);
  await writeFile(path.join(root, taskMarkdownPath), renderCodingAgentTaskMarkdown(task), "utf8");
  return PraxisMcpGenerateTaskResultSchema.parse({
    schemaVersion: "praxis.mcp.generateTaskResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    task,
    taskJsonPath,
    taskMarkdownPath
  });
}

async function callRecordExternalResult(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpRecordExternalResultInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const createdAt = new Date().toISOString();
  const stamp = Date.now();
  const resultId = `external-result:${sanitizeId(input.taskId)}:${stamp}`;
  const task = await tryReadJsonWithSchema(path.join(root, ".distinction", "tasks", `${input.taskId}.json`), CodingAgentTaskSchema);
  const evidence = (input.evidencePaths ?? []).map((filePath) => ({
    source: "agent_inference" as const,
    filePath
  }));
  const findingStatusSuggestions = (task?.sourceFindingIds ?? []).map((findingId) =>
    FindingStatusPatchSchema.parse({
      schemaVersion: "praxis.findingStatusPatch.v1",
      id: `finding-status-patch:${sanitizeId(input.taskId)}:${sanitizeId(findingId)}:${stamp}`,
      sourceResultId: resultId,
      sourceTaskId: input.taskId,
      findingId,
      status: input.status === "done" ? "mitigated" : input.status === "partial" ? "in_progress" : "acknowledged",
      summary: `External agent result for ${input.taskId}: ${input.summary}`,
      rationale: input.testResult,
      evidence,
      createdAt
    } satisfies FindingStatusPatch)
  );
  const memorySuggestions = [
    MemorySuggestionPatchSchema.parse({
      schemaVersion: "praxis.memorySuggestionPatch.v1",
      id: `memory-suggestion:${sanitizeId(input.taskId)}:${stamp}`,
      sourceResultId: resultId,
      sourceTaskId: input.taskId,
      summary: `Record external result for ${input.taskId} as candidate memory.`,
      memoryPatches: [
        {
          id: `memory-patch:external-result:${sanitizeId(input.taskId)}:${stamp}`,
          operation: "append",
          status: "proposed",
          record: {
            id: `memory:external-result:${sanitizeId(input.taskId)}:${stamp}`,
            kind: "CANDIDATE",
            type: "external_agent_result",
            subject: input.taskId,
            predicate: "reported_result",
            object: input.summary,
            summary: `External agent reported ${input.status} for ${input.taskId}.`,
            evidence,
            source: "agent",
            confidence: input.status === "done" ? "high" : "medium",
            status: "proposed",
            createdAt,
            updatedAt: createdAt
          },
          sourceCodeFactIds: []
        }
      ],
      createdAt
    } satisfies MemorySuggestionPatch)
  ];
  const result = ExternalAgentResultSchema.parse({
    schemaVersion: "praxis.externalAgentResult.v1",
    id: resultId,
    taskId: input.taskId,
    status: input.status,
    summary: input.summary,
    changedFiles: input.changedFiles ?? [],
    testResult: input.testResult,
    evidence,
    memorySuggestions,
    findingStatusSuggestions,
    createdAt
  } satisfies ExternalAgentResult);
  const resultPath = `.distinction/reports/external-results/${sanitizeId(input.taskId)}-${stamp}.json`;
  const tracePath = ".distinction/memory/traces.jsonl";
  const traceRecord = TraceRecordSchema.parse({
    schemaVersion: "praxis.traceRecord.v1",
    id: `trace-event:external-result:${stamp}`,
    traceId: `trace:task:${input.taskId}`,
    timestamp: createdAt,
    kind: "external_agent.result_recorded",
    target: { type: "task", id: input.taskId },
    summary: input.summary,
    data: { resultPath, resultId, status: input.status, changedFiles: input.changedFiles ?? [] }
  } satisfies TraceRecord);
  await writeSchemaJson(path.join(root, resultPath), result, ExternalAgentResultSchema);
  await mkdir(path.dirname(path.join(root, tracePath)), { recursive: true });
  await appendFile(path.join(root, tracePath), `${JSON.stringify(traceRecord)}\n`, "utf8");
  return PraxisMcpRecordExternalResultResultSchema.parse({
    schemaVersion: "praxis.mcp.recordExternalResultResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    result,
    resultPath,
    tracePath
  });
}

function renderCodingAgentTaskMarkdown(task: CodingAgentTask): string {
  return [
    `# ${task.id}`,
    "",
    "## Goal",
    "",
    task.goal,
    "",
    "## Source Findings",
    "",
    ...list(task.sourceFindingIds),
    "",
    "## Non-goals",
    "",
    ...list(task.nonGoals),
    "",
    "## Allowed Paths",
    "",
    ...list(task.allowedPaths),
    "",
    "## Forbidden Paths",
    "",
    ...list(task.forbiddenPaths),
    "",
    "## Acceptance Criteria",
    "",
    ...list(task.acceptanceCriteria),
    "",
    "## Expected Outputs",
    "",
    ...list(task.expectedOutputs),
    "",
    "## Risk Notes",
    "",
    ...list(task.riskNotes),
    ""
  ].join("\n");
}

function list(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- None"];
}
