#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanRepository } from "@praxis/repository-scanner";
import { profileProject } from "@praxis/project-profiler";
import { generateDevelopmentGraphCandidate } from "@praxis/graph-generator";
import {
  appendMessage,
  createSessionForTarget,
  loadSessions,
  readMessages,
  readSession,
  readSessionTranscript,
  type ChatMessage,
  type ChatTarget,
  type NewChatMessage,
  type PermissionRequestView,
  type ToolCallView
} from "@praxis/chat-session";
import { buildContext, type SelectionTarget } from "@praxis/context-builder";
import {
  appendChange,
  appendTrace,
  getLocalKnowledgePaths,
  initializeLocalKnowledge,
  readDevelopmentGraph,
  writeCodingTask,
  writeDevelopmentGraph
} from "@praxis/local-knowledge";
import { PraxisAgentRuntime } from "@praxis/agent-runtime";
import { ManualAdapter, createCodingAgentTask } from "@praxis/coding-agent-adapter";
import { applyNewProjectPlan, createNewProjectPlan, type NewProjectPlan } from "@praxis/project-wizard";
import {
  findEdge,
  findNode,
  normalizeProgress,
  type DevelopmentEdge,
  type DevelopmentGraph,
  type DevelopmentGraphCandidate,
  type DevelopmentNode
} from "@praxis/development-graph";
import { isGraphPlan, type GraphPlan, type PlanAction } from "@praxis/plan-model";
import { loadModelConfig, resolveModelRoute } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt } from "@praxis/prompt-registry";
import { AgentLoop, persistRun, type AgentConversationMessage, type AgentRun, type AgentStep } from "@praxis/agent-loop";
import { ToolRegistry } from "@praxis/tool-registry";
import { registerAgentTools } from "@praxis/agent-loop/tools";

type Args = Record<string, string | boolean>;

interface CodingAgentResultInput {
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

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  try {
    if (command === "scan") return await commandScan(args);
    if (command === "profile") return await commandProfile(args);
    if (command === "generate-graph") return await commandGenerateGraph(args);
    if (command === "intake") return await commandIntake(args);
    if (command === "init-memory") return await commandInitMemory(args);
    if (command === "chat") return await commandChat(args);
    if (command === "chat-session-create") return await commandChatSessionCreate(args);
    if (command === "chat-session-list") return await commandChatSessionList(args);
    if (command === "chat-session-read") return await commandChatSessionRead(args);
    if (command === "chat-send") return await commandChatSend(args);
    if (command === "agent-run") return await commandAgentRun(args);
    if (command === "generate-task") return await commandGenerateTask(args);
    if (command === "apply-plan") return await commandApplyPlan(args);
    if (command === "import-task-result") return await commandImportTaskResult(args);
    if (command === "create-project-plan") return await commandCreateProjectPlan(args);
    if (command === "create-project") return await commandCreateProject(args);
    throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function commandScan(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = await scanRepository({ root });
  await maybeWriteJson(args, "out", snapshot);
  outputJson({ ok: true, fileCount: snapshot.files.length, root: snapshot.root });
}

async function commandProfile(args: Args): Promise<void> {
  const snapshot = await readJson(required(args, "snapshot"));
  const profile = await profileProject(snapshot);
  await maybeWriteJson(args, "out", profile);
  outputJson({ ok: true, modules: profile.moduleCandidates.length, projectKinds: profile.projectKinds });
}

async function commandGenerateGraph(args: Args): Promise<void> {
  const snapshot = await readJson(required(args, "snapshot"));
  const profile = await readJson(required(args, "profile"));
  const candidate = generateDevelopmentGraphCandidate({ snapshot, profile });
  await maybeWriteJson(args, "out", candidate);
  outputJson({ ok: true, nodes: candidate.graph.nodes.length, edges: candidate.graph.edges.length, warnings: candidate.warnings.length });
}

async function commandIntake(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = await scanRepository({ root });
  const profile = await profileProject(snapshot);
  const candidate = generateDevelopmentGraphCandidate({ snapshot, profile });
  outputJson({ ok: true, snapshot, profile, candidate });
}

async function commandInitMemory(args: Args): Promise<void> {
  const root = required(args, "root");
  const candidate = (await readJson(required(args, "candidate"))) as DevelopmentGraphCandidate;
  await initializeLocalKnowledge(root, candidate);
  outputJson({ ok: true, distinction: path.join(path.resolve(root), ".distinction") });
}

async function commandChat(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const target = required(args, "target");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const instruction = String(args.instruction ?? (mode === "plan" ? "Generate plan" : "Explain selected target"));
  const graph = await readDevelopmentGraph(projectRoot);
  const runtime = new PraxisAgentRuntime();
  const targetObject = target.startsWith("edge:") ? { type: "edge" as const, id: target } : { type: "node" as const, id: target };
  const result = await runtime.run({
    mode,
    projectRoot,
    graph,
    target: targetObject,
    instruction,
    taskType: targetObject.type === "edge" ? (mode === "plan" ? "graph.edge.plan" : "graph.edge.explain") : mode === "plan" ? "graph.node.plan" : "graph.node.explain"
  });
  await maybeWriteJson(args, "out", result.structured ?? result);
  outputJson(result);
}

async function commandAgentRun(args: Args): Promise<void> {
  console.error("[agent-run] Starting agent run...");
  const projectRoot = required(args, "project-root");
  const graph = await readDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const instruction = String(args.instruction ?? args.message ?? "Explain the selected target.");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const requestedSessionId = typeof args.session === "string" ? args.session : undefined;
  const existingSession = requestedSessionId ? await readSession(projectRoot, requestedSessionId) : undefined;
  const session = existingSession ?? await createSessionForTarget(projectRoot, target, {
    title: sessionTitleForTarget(graph, target),
    mode: chatModeFromArgs(args)
  });

  const priorMessages = await readMessages(projectRoot, session.id);

  // Save user message to session first (so it appears in transcript)
  await appendMessage(projectRoot, {
    sessionId: session.id,
    role: "user",
    content: instruction
  });

  const registry = new ToolRegistry();
  registerAgentTools(registry);
  console.error(`[agent-run] Session ${session.id}, mode=${mode}, instruction="${instruction.slice(0,60)}"`);

  const loop = new AgentLoop();
  console.error("[agent-run] Starting agent loop...");
  const result = await loop.run({
    projectRoot,
    sessionId: session.id,
    target: selectionTargetFromChatTarget(graph, target),
    mode,
    instruction,
    graph,
    registry,
    conversationHistory: chatHistoryForAgent(priorMessages),
    maxToolCalls: mode === "explain" ? 18 : 24,
    onStep: async (step: AgentStep) => {
      if (step.kind === "tool_call") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "tool",
          content: `[${step.toolStatus}] ${step.toolName}: ${step.toolInputSummary ?? ""}`,
          toolCall: {
            id: step.id,
            name: step.toolName ?? "unknown",
            status: (step.toolStatus as "pending" | "running" | "success" | "failed") ?? "running",
            inputSummary: step.toolInputSummary ?? "",
            outputSummary: step.toolOutputSummary,
            riskLevel: step.toolRiskLevel ?? "read"
          }
        });
      } else if (step.kind === "tool_result") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "tool",
          content: `[${step.toolStatus}] ${step.toolName}: ${step.toolOutputSummary ?? ""}`,
          toolCall: {
            id: step.toolCallId ?? step.id,
            name: step.toolName ?? "unknown",
            status: (step.toolStatus as "pending" | "running" | "success" | "failed") ?? "success",
            inputSummary: "",
            outputSummary: step.toolOutputSummary,
            riskLevel: step.toolRiskLevel ?? "read"
          }
        });
      } else if (step.kind === "model_response" && step.reasoningContent) {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "system",
          content: `Reasoning: ${step.reasoningContent?.slice(0, 2000) ?? ""}`,
          structured: { reasoning: { content: step.reasoningContent, durationMs: step.reasoningDurationMs } }
        });
      } else if (step.kind === "context_compaction") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "system",
          content: step.transitionReason === "reactive_compact_retry"
            ? "Context was compacted after a prompt-too-long error; the agent is retrying with a summarized history."
            : "Older conversation history was compacted into a summary for this agent run.",
          structured: {
            compaction: {
              reason: step.transitionReason,
              compactedMessageCount: step.compactedMessageCount,
              compactedChars: step.compactedChars,
              summary: step.compactSummary
            }
          }
        });
      } else if (step.kind === "error") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "error",
          content: step.errorMessage ?? "Agent run failed.",
          status: "failed"
        });
      } else if (step.kind === "permission_request") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "permission",
          content: step.permissionDescription ?? "Permission required.",
          permissionRequest: {
            id: step.permissionId ?? `perm-${Date.now()}`,
            title: step.permissionTitle ?? "Permission Required",
            description: step.permissionDescription ?? "",
            actionType: (step.permissionActionType as PermissionRequestView["actionType"]) ?? "tool_call",
            affectedPaths: step.permissionAffectedPaths ?? [],
            affectedNodeIds: [],
            affectedEdgeIds: [],
            options: (step.permissionOptions as { id: "approve" | "reject" | "modify"; label: string }[]) ?? [
              { id: "approve" as const, label: "Approve once" },
              { id: "reject" as const, label: "Reject" }
            ]
          }
        });
      }
    },
    onPermissionRequired: async (step: AgentStep) => {
      const decision = await waitForPermissionDecision(projectRoot, step.permissionId ?? "");
      await appendMessage(projectRoot, {
        sessionId: session.id,
        role: "result",
        content: decision === "approve"
          ? `Permission approved: ${step.toolName ?? "tool"}`
          : decision === "modify"
            ? `Permission modification requested: ${step.toolName ?? "tool"}`
            : `Permission rejected: ${step.toolName ?? "tool"}`,
        structured: { permissionId: step.permissionId, decision, toolName: step.toolName }
      });
      return decision;
    }
  });

  if (result.run.status === "completed") {
    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "assistant",
      content: result.finalMessage,
      structured: result.finalStructured,
      traceIds: result.run.steps.filter((s) => s.kind === "model_response").map((s) => s.id)
    });
  } else if (!result.run.steps.some((step) => step.kind === "error" && step.errorMessage === result.finalMessage)) {
    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "error",
      content: result.finalMessage,
      status: result.run.status === "cancelled" ? "cancelled" : "failed",
      structured: { runStatus: result.run.status }
    });
  }

  console.error(`[agent-run] Run completed: status=${result.run.status}, steps=${result.run.steps.length}`);
  const runPath = await persistRun(projectRoot, result.run);

  outputJson({
    ok: true,
    sessionId: session.id,
    runId: result.run.id,
    runPath,
    runStatus: result.run.status,
    terminalReason: result.terminalReason,
    transitions: result.run.transitions,
    stepCount: result.run.steps.length,
    finalMessage: result.finalMessage,
    finalStructured: result.finalStructured
  });
}

async function commandChatSessionCreate(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const graph = await readDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const session = await createSessionForTarget(projectRoot, target, {
    title: sessionTitleForTarget(graph, target),
    mode: chatModeFromArgs(args)
  });
  outputJson({ ok: true, session, messages: await readMessages(projectRoot, session.id) });
}

async function waitForPermissionDecision(projectRoot: string, permissionId: string): Promise<"approve" | "reject" | "modify"> {
  if (!permissionId) return "reject";
  const responsePath = path.join(projectRoot, ".distinction", `.perm-${permissionId}.json`);
  const startedAt = Date.now();
  const timeoutMs = 60 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const raw = await readFile(responsePath, "utf8");
      await rm(responsePath, { force: true });
      const parsed = JSON.parse(raw) as { status?: string; approval?: string };
      const value = String(parsed.approval ?? parsed.status ?? "").toLowerCase();
      if (value === "approved" || value === "approve") return "approve";
      if (value === "modify") return "modify";
      return "reject";
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Permission request timed out: ${permissionId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatHistoryForAgent(messages: ChatMessage[]): AgentConversationMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: chatHistoryContent(message)
    }))
    .filter((message) => message.content.trim().length > 0);
}

function chatHistoryContent(message: ChatMessage): string {
  const sections = [message.content];
  if (message.toolCall) {
    sections.push(`Tool ${message.toolCall.name} ${message.toolCall.status}: ${message.toolCall.outputSummary ?? message.toolCall.inputSummary}`);
  }
  if (message.permissionRequest) {
    sections.push(`Permission ${message.permissionRequest.id}: ${message.permissionRequest.actionType} (${message.permissionRequest.title})`);
  }
  if (message.plan) {
    sections.push([
      `Plan ${message.plan.id}: ${message.plan.summary}`,
      ...message.plan.actions.map((action) => `- ${action.id}: ${action.title}`)
    ].join("\n"));
  }
  if (message.task) {
    sections.push(`Coding task ${message.task.id}: ${message.task.title}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

async function commandChatSessionList(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  outputJson({ ok: true, sessions: await loadSessions(projectRoot) });
}

async function commandChatSessionRead(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const sessionId = required(args, "session");
  outputJson({ ok: true, ...(await readSessionTranscript(projectRoot, sessionId)) });
}

async function commandChatSend(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const graph = await readDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const session =
    typeof args.session === "string" && (await readSession(projectRoot, args.session))
      ? (await readSession(projectRoot, args.session))!
      : await createSessionForTarget(projectRoot, target, { title: sessionTitleForTarget(graph, target), mode: chatModeFromArgs(args) });
  const sessionId = session.id;
  const runtimeTarget = selectionTargetFromChatTarget(graph, target);
  const message = String(args.message ?? "");
  const intent = inferChatIntent(message, args.intent ?? args.mode);

  if (typeof args.approval === "string") {
    return await handlePermissionResponse({ projectRoot, graph, sessionId, target: runtimeTarget, message, approval: args.approval, args });
  }

  const appended: ChatMessage[] = [];
  appended.push(
    await appendMessage(projectRoot, {
      sessionId,
      role: "user",
      content: message || quickInstructionForIntent(intent),
      structured: { intent, target }
    })
  );

  try {
    if (intent === "apply") {
      const latest = latestPlan(await readMessages(projectRoot, sessionId));
      if (!latest) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "assistant",
            content: "I need a plan in this session before I can request Apply approval."
          })
        );
        return await outputChatSendResult(projectRoot, sessionId, appended);
      }
      const selectedActionIds = actionIdsFromArgs(args) ?? latest.actions.map((action) => action.id);
      const permission = permissionRequestForPlan(latest, selectedActionIds);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "permission",
          content: "Praxis needs confirmation before applying selected plan actions.",
          permissionRequest: permission,
          structured: { plan: latest, selectedActionIds }
        })
      );
      return await outputChatSendResult(projectRoot, sessionId, appended, { pendingPermission: permission, plan: latest });
    }

    if (intent === "generate_task") {
      const latest = latestPlan(await readMessages(projectRoot, sessionId));
      if (!latest) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "assistant",
            content: "Generate a plan first, then I can turn it into a controlled coding task."
          })
        );
        return await outputChatSendResult(projectRoot, sessionId, appended);
      }
      appended.push(await appendMessage(projectRoot, toolMessage(sessionId, "GenerateCodingTask", "Use latest graph plan", "Writing .distinction task file.", "write_docs")));
      const taskResult = await generateTaskFromPlan(projectRoot, latest);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "result",
          content: `Generated ${taskResult.task.id} at ${taskResult.taskPath}`,
          task: taskResult.task,
          structured: taskResult
        })
      );
      return await outputChatSendResult(projectRoot, sessionId, appended, taskResult);
    }

    if (intent === "import_result") {
      appended.push(
        await appendMessage(projectRoot, toolMessage(sessionId, "ImportTaskResult", "Normalize external agent result", "Recording task result candidate.", "write_memory"))
      );
      const resultInput = parseTaskResultMessage(message);
      const importResult = await importTaskResultPayload(projectRoot, resultInput);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "result",
          content: `Imported result for ${resultInput.taskId}.`,
          structured: importResult,
          plan: importResult.progressPlan
        })
      );
      if (importResult.progressPlan) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "result",
            content: "Progress suggestions are ready for review before Apply.",
            plan: importResult.progressPlan
          })
        );
      }
      return await outputChatSendResult(projectRoot, sessionId, appended, importResult);
    }

    const context = buildContext(graph, runtimeTarget);
    appended.push(await appendMessage(projectRoot, toolMessage(sessionId, "BuildTargetContext", targetSummary(target), context.summary, "read")));

    const mode = intent === "plan" ? "plan" : "explain";
    const runtime = new PraxisAgentRuntime();
    const result = await runtime.run({
      mode,
      projectRoot,
      graph,
      target: runtimeTarget,
      instruction: message || quickInstructionForIntent(intent),
      taskType: taskTypeForTarget(runtimeTarget, mode)
    });
    appended.push(
      await appendMessage(projectRoot, toolMessage(sessionId, "AgentRuntime", `${mode} selected target`, `Used ${result.selectedModel}`, "network", [result.traceId]))
    );

    if (mode === "plan") {
      const plan = isGraphPlan(result.structured) ? result.structured : undefined;
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "assistant",
          content: plan?.summary ?? result.message,
          structured: result.structured,
          traceIds: [result.traceId]
        })
      );
      if (plan) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "result",
            content: `Plan created with ${plan.actions.length} action(s).`,
            plan,
            traceIds: [result.traceId]
          })
        );
      }
      return await outputChatSendResult(projectRoot, sessionId, appended, { plan });
    }

    appended.push(
      await appendMessage(projectRoot, {
        sessionId,
        role: "assistant",
        content: readableAssistantContent(result.message, result.structured),
        structured: result.structured,
        traceIds: [result.traceId]
      })
    );
    return await outputChatSendResult(projectRoot, sessionId, appended);
  } catch (error) {
    appended.push(
      await appendMessage(projectRoot, {
        sessionId,
        role: "error",
        content: error instanceof Error ? error.message : String(error),
        status: "failed"
      })
    );
    return await outputChatSendResult(projectRoot, sessionId, appended);
  }
}

async function commandGenerateTask(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const plan = (await readJson(required(args, "plan"))) as GraphPlan;
  const result = await generateTaskFromPlan(projectRoot, plan);
  outputJson({ ok: true, ...result });
}

async function generateTaskFromPlan(projectRoot: string, plan: GraphPlan): Promise<{ taskPath: string; task: ReturnType<typeof createCodingAgentTask> }> {
  const graph = await readDevelopmentGraph(projectRoot);
  const draft = plan.codingTasks[0];
  const action = plan.actions.find((item) => item.type === "create_coding_task" || item.type === "create_task");
  const context = buildCodingTaskContext(graph, plan, action);
  const task = createCodingAgentTask({
    id: "TASK-0001",
    title: draft?.title ?? "Controlled coding task",
    instruction: plan.summary,
    source: {
      planId: plan.id,
      targetNodeIds: context.targetNodeIds,
      targetEdgeIds: context.targetEdgeIds
    },
    context: {
      architectureContext: context.architectureContext,
      graphContext: context.graphContext,
      memoryContext: context.memoryContext,
      constraints: ["Existing source code must not be modified by Praxis v0.1 Apply."]
    },
    scope: {
      relatedFiles: context.relatedFiles,
      allowedPaths: unique([...(draft?.allowedPaths ?? []), ...context.allowedPaths]),
      forbiddenPaths: draft?.forbiddenPaths ?? ["apps/studio-desktop/src"]
    },
    acceptanceCriteria: draft?.acceptanceCriteria ?? [],
    verificationCommands: ["npm run build", "npm run typecheck"]
  });
  const prepared = await new ManualAdapter().prepare(task);
  const taskPath = await writeCodingTask(projectRoot, { id: task.id, markdown: prepared.markdown ?? "" });
  await appendChange(projectRoot, {
    title: `Generated ${task.id}`,
    summary: `Generated controlled coding task from ${plan.id} for ${context.targetEdgeIds.length} edge(s) and ${context.targetNodeIds.length} node(s).`,
    kind: "CANDIDATE"
  });
  await appendTrace(projectRoot, {
    id: `trace-event:task:${Date.now()}`,
    traceId: `trace:task:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "task.generated",
    target: context.targetEdgeIds[0]
      ? { type: "edge", id: context.targetEdgeIds[0] }
      : context.targetNodeIds[0]
        ? { type: "node", id: context.targetNodeIds[0] }
        : { type: "project" },
    summary: `Generated ${task.id}`,
    data: { taskPath, planId: plan.id, targetNodeIds: context.targetNodeIds, targetEdgeIds: context.targetEdgeIds }
  });
  return { taskPath, task };
}

async function commandApplyPlan(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const plan = (await readJson(required(args, "plan"))) as GraphPlan;
  const actionIds = typeof args.actions === "string" ? new Set(args.actions.split(",").map((item) => item.trim()).filter(Boolean)) : undefined;
  const graph = await readDevelopmentGraph(projectRoot);
  const result = await applyPlanActions(projectRoot, graph, plan, actionIds);
  outputJson({ ok: true, ...result });
}

async function commandImportTaskResult(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const result = (await readJson(required(args, "result"))) as CodingAgentResultInput;
  outputJson({ ok: true, ...(await importTaskResultPayload(projectRoot, result)) });
}

async function importTaskResultPayload(projectRoot: string, result: CodingAgentResultInput): Promise<{ resultPath: string; progressPlan?: GraphPlan }> {
  const normalized = normalizeTaskResultInput(result);
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.tasksDir, { recursive: true });
  const resultPath = path.join(paths.tasksDir, `${safeFilePart(normalized.taskId)}.result.json`);
  await writeFile(resultPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  const progressPlan = progressPlanFromTaskResult(normalized);
  if (progressPlan) {
    await mkdir(paths.reportsDir, { recursive: true });
    await writeFile(path.join(paths.reportsDir, `${normalized.taskId}.progress-preview.json`), `${JSON.stringify(progressPlan, null, 2)}\n`, "utf8");
  }

  await appendChange(projectRoot, {
    title: `Imported result for ${normalized.taskId}`,
    summary: `${normalized.status}: ${normalized.summary}`,
    kind: "CANDIDATE"
  });
  await appendTrace(projectRoot, {
    id: `trace-event:task-result:${Date.now()}`,
    traceId: `trace:task-result:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "memory.recorded",
    target: { type: "project" },
    summary: `Imported task result ${normalized.taskId}`,
    data: { taskId: normalized.taskId, status: normalized.status, resultPath, progressPlan }
  });

  return { resultPath, progressPlan };
}

type ChatIntent = "explain" | "plan" | "generate_task" | "apply" | "import_result";

async function handlePermissionResponse(input: {
  projectRoot: string;
  graph: DevelopmentGraph;
  sessionId: string;
  target: SelectionTarget;
  message: string;
  approval: string;
  args: Args;
}): Promise<void> {
  const appended: ChatMessage[] = [];
  const approval = input.approval.toLowerCase();
  const userContent =
    input.message ||
    (approval === "approve" ? "Approved selected actions." : approval === "reject" ? "Rejected apply request." : "Modify apply request.");
  appended.push(
    await appendMessage(input.projectRoot, {
      sessionId: input.sessionId,
      role: "user",
      content: userContent,
      structured: { approval }
    })
  );

  try {
    const messages = await readMessages(input.projectRoot, input.sessionId);
    const permissionId = typeof input.args["permission-id"] === "string" ? input.args["permission-id"] : undefined;
    const permissionMessage = [...messages]
      .reverse()
      .find((message) => message.role === "permission" && (!permissionId || message.permissionRequest?.id === permissionId));
    if (!permissionMessage) throw new Error("No pending permission request was found in this chat session.");
    const plan = planFromMessage(permissionMessage) ?? latestPlan(messages);
    if (!plan) throw new Error("Permission request does not contain an applyable plan.");

    if (approval === "reject") {
      appended.push(
        await appendMessage(input.projectRoot, {
          sessionId: input.sessionId,
          role: "result",
          content: "Apply request rejected. No graph or memory changes were written.",
          structured: { permissionId: permissionMessage.permissionRequest?.id, rejected: true }
        })
      );
      return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
    }

    if (approval === "modify") {
      appended.push(
        await appendMessage(input.projectRoot, {
          sessionId: input.sessionId,
          role: "assistant",
          content: "Tell me which actions to keep, remove, or change, and I will prepare a revised Apply request.",
          structured: { permissionId: permissionMessage.permissionRequest?.id, modifyRequested: true }
        })
      );
      return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
    }

    if (approval !== "approve") throw new Error(`Unknown approval response: ${input.approval}`);
    const selectedActionIds = actionIdsFromArgs(input.args) ?? selectedActionIdsFromPermission(permissionMessage) ?? plan.actions.map((action) => action.id);
    const actionIdSet = new Set(selectedActionIds);
    const result = await applyPlanActions(input.projectRoot, input.graph, plan, actionIdSet);
    appended.push(
      await appendMessage(
        input.projectRoot,
        toolMessage(input.sessionId, "ApplyPlan", `${selectedActionIds.length} selected action(s)`, "Graph and memory apply completed.", "write_memory")
      )
    );
    appended.push(
      await appendMessage(input.projectRoot, {
        sessionId: input.sessionId,
        role: "result",
        content: [
          `Applied ${result.appliedActions.length} action(s).`,
          result.skippedActions.length ? `Skipped ${result.skippedActions.length} action(s).` : "",
          result.graphUpdated ? "Development Graph updated." : "No graph fields changed."
        ]
          .filter(Boolean)
          .join(" "),
        structured: { ...result, permissionId: permissionMessage.permissionRequest?.id, selectedActionIds }
      })
    );
    return await outputChatSendResult(input.projectRoot, input.sessionId, appended, result);
  } catch (error) {
    appended.push(
      await appendMessage(input.projectRoot, {
        sessionId: input.sessionId,
        role: "error",
        content: error instanceof Error ? error.message : String(error),
        status: "failed"
      })
    );
    return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
  }
}

async function outputChatSendResult(projectRoot: string, sessionId: string, appendedMessages: ChatMessage[], extra: Record<string, unknown> = {}): Promise<void> {
  const transcript = await readSessionTranscript(projectRoot, sessionId);
  outputJson({ ok: true, sessionId, appendedMessages, ...transcript, ...extra });
}

function chatTargetFromArgs(args: Args): ChatTarget {
  if (typeof args["target-json"] === "string") {
    const parsed = JSON.parse(args["target-json"]) as ChatTarget;
    if (parsed.type === "project" || parsed.type === "node" || parsed.type === "edge" || parsed.type === "subgraph") return parsed;
  }

  const rawTarget = typeof args.target === "string" ? args.target : "";
  const rawType = typeof args["target-type"] === "string" ? args["target-type"] : "";
  const targetType = rawType || (rawTarget.startsWith("edge:") ? "edge" : rawTarget ? "node" : "project");
  if (targetType === "project") return { type: "project" };
  if (targetType === "node" || targetType === "edge") {
    const id = String(args["target-id"] ?? rawTarget);
    if (!id) throw new Error(`Missing --target-id for ${targetType} chat target.`);
    return { type: targetType, id };
  }
  throw new Error(`Unsupported chat target type: ${targetType}`);
}

function chatModeFromArgs(args: Args): "explain" | "plan" | "apply" | "task" {
  if (args.mode === "plan") return "plan";
  if (args.mode === "apply") return "apply";
  if (args.mode === "task" || args.intent === "generate_task") return "task";
  return "explain";
}

function selectionTargetFromChatTarget(graph: DevelopmentGraph, target: ChatTarget): SelectionTarget {
  if (target.type === "node" || target.type === "edge" || target.type === "subgraph") return target;
  const nodeIds = graph.nodes.slice(0, 18).map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  const edgeIds = graph.edges
    .filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
    .slice(0, 24)
    .map((edge) => edge.id);
  return { type: "subgraph", nodeIds, edgeIds };
}

function sessionTitleForTarget(graph: DevelopmentGraph, target: ChatTarget): string {
  if (target.type === "node") return findNode(graph, target.id)?.title ?? target.id;
  if (target.type === "edge") {
    const edge = findEdge(graph, target.id);
    if (!edge) return target.id;
    const source = findNode(graph, edge.source)?.title ?? edge.source;
    const destination = findNode(graph, edge.target)?.title ?? edge.target;
    return `${source} -> ${destination}`;
  }
  if (target.type === "subgraph") return `Subgraph (${target.nodeIds.length}/${target.edgeIds.length})`;
  return graph.title || "Project chat";
}

function inferChatIntent(message: string, explicit: string | boolean | undefined): ChatIntent {
  if (explicit === "plan") return "plan";
  if (explicit === "task" || explicit === "generate_task") return "generate_task";
  if (explicit === "apply") return "apply";
  if (explicit === "import_result") return "import_result";
  if (explicit === "explain") return "explain";

  const lower = message.toLowerCase();
  if (message.includes("生成任务") || lower.includes("generate task") || lower.includes("task")) return "generate_task";
  if (message.includes("应用") || message.includes("执行") || lower.includes("apply")) return "apply";
  if (message.includes("导入") || message.includes("结果") || lower.includes("import result") || lower.includes("task result")) return "import_result";
  if (message.includes("计划") || lower.includes("plan") || lower.includes("next step")) return "plan";
  return "explain";
}

function quickInstructionForIntent(intent: ChatIntent): string {
  if (intent === "plan") return "Plan next steps for the selected target.";
  if (intent === "generate_task") return "Generate a controlled coding task from the latest plan.";
  if (intent === "apply") return "Prepare an Apply permission request for the latest plan.";
  if (intent === "import_result") return "Import an external coding agent result.";
  return "Explain the selected target.";
}

function toolMessage(
  sessionId: string,
  name: string,
  inputSummary: string,
  outputSummary: string,
  riskLevel: ToolCallView["riskLevel"],
  traceIds?: string[]
): NewChatMessage {
  const toolCall: ToolCallView = {
    id: `tool-${Date.now()}-${slug(name)}`,
    name,
    status: "success",
    inputSummary,
    outputSummary,
    riskLevel
  };
  return {
    sessionId,
    role: "tool",
    content: `${name}: ${outputSummary}`,
    toolCall,
    traceIds
  };
}

function taskTypeForTarget(target: SelectionTarget, mode: "explain" | "plan") {
  if (target.type === "edge") return mode === "plan" ? "graph.edge.plan" : "graph.edge.explain";
  return mode === "plan" ? "graph.node.plan" : "graph.node.explain";
}

function latestPlan(messages: ChatMessage[]): GraphPlan | undefined {
  for (const message of [...messages].reverse()) {
    const plan = planFromMessage(message);
    if (plan) return plan;
  }
  return undefined;
}

function planFromMessage(message?: ChatMessage): GraphPlan | undefined {
  if (!message) return undefined;
  if (isGraphPlan(message.plan)) return message.plan;
  if (isRecord(message.structured) && isGraphPlan(message.structured.plan)) return message.structured.plan;
  if (isGraphPlan(message.structured)) return message.structured;
  return undefined;
}

function selectedActionIdsFromPermission(message: ChatMessage): string[] | undefined {
  if (!isRecord(message.structured) || !Array.isArray(message.structured.selectedActionIds)) return undefined;
  const values = message.structured.selectedActionIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
  return values.length ? values : undefined;
}

function actionIdsFromArgs(args: Args): string[] | undefined {
  if (typeof args.actions !== "string") return undefined;
  const values = args.actions
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function permissionRequestForPlan(plan: GraphPlan, selectedActionIds: string[]): PermissionRequestView {
  const selected = plan.actions.filter((action) => selectedActionIds.includes(action.id));
  const actions = selected.length ? selected : plan.actions;
  return {
    id: `permission-${Date.now()}`,
    title: "Apply selected plan actions",
    description: plan.summary,
    actionType: "apply_plan",
    affectedPaths: unique(actions.flatMap(pathsForAction)),
    affectedNodeIds: unique(actions.flatMap((action) => action.targetNodeIds)),
    affectedEdgeIds: unique(actions.flatMap((action) => action.targetEdgeIds)),
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
      { id: "modify", label: "Modify" }
    ]
  };
}

function pathsForAction(action: PlanAction): string[] {
  if (action.type === "update_edge" || action.type === "update_edge_progress") {
    return [".distinction/graph/edges.json", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "update_node_progress") {
    return [".distinction/graph/nodes.json", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "create_task" || action.type === "create_coding_task") {
    return [".distinction/tasks/*.md", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "write_report") {
    return [".distinction/reports/*.md", ".distinction/memory/traces.jsonl"];
  }
  return [".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
}

function targetSummary(target: ChatTarget): string {
  if (target.type === "project") return "Project";
  if (target.type === "subgraph") return `Subgraph with ${target.nodeIds.length} node(s) and ${target.edgeIds.length} edge(s)`;
  return `${target.type}: ${target.id}`;
}

function readableAssistantContent(message: string, structured: unknown): string {
  if (isRecord(structured) && typeof structured.summary === "string") return structured.summary;
  return message;
}

function parseTaskResultMessage(message: string): CodingAgentResultInput {
  const trimmed = message.trim();
  const parsed = safeJson(trimmed);
  if (isRecord(parsed) && typeof parsed.taskId === "string") return normalizeTaskResultInput(parsed as unknown as CodingAgentResultInput);

  const taskId = trimmed.match(/TASK-\d+/i)?.[0]?.toUpperCase() ?? "TASK-0001";
  const lower = trimmed.toLowerCase();
  const status = lower.includes("failed") || lower.includes("failure") ? "failed" : lower.includes("done") || lower.includes("pass") ? "done" : "partial";
  const summary =
    trimmed
      .split(/\r?\n/)
      .map((line) => line.replace(/^[#*\-\s]+/, "").trim())
      .find(Boolean) ?? "External coding agent result imported from chat.";
  const changedFiles = Array.from(
    new Set(
      [...trimmed.matchAll(/(?:^|\s)([A-Za-z0-9_.\/\\-]+\.(?:ts|tsx|js|jsx|rs|md|json|yaml|yml|toml|css|html))/g)].map((match) =>
        match[1].replace(/\\/g, "/")
      )
    )
  );
  const testResult = trimmed
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes("test"))
    ?.trim();
  return { taskId, status, summary, changedFiles, testResult, memorySuggestion: trimmed };
}

async function applyPlanActions(projectRoot: string, graph: DevelopmentGraph, plan: GraphPlan, actionIds?: Set<string>) {
  const selectedActions = plan.actions.filter((action) => !actionIds || actionIds.has(action.id));
  const appliedActions: { id: string; type: string; summary: string }[] = [];
  const skippedActions: { id: string; type: string; reason: string }[] = [];
  let graphChanged = false;

  for (const action of selectedActions) {
    let graphChangedByAction = false;
    if (!isSupportedApplyAction(action)) {
      skippedActions.push({ id: action.id, type: action.type, reason: "Action is not supported by v0.1 limited Apply." });
      continue;
    }
    if (action.type === "update_edge") {
      const edge = action.targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).find(Boolean) as DevelopmentEdge | undefined;
      if (!edge) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target edge was not found." });
        continue;
      }
      edge.blockedReason = stringOr(action.data?.blockedReason, action.description || plan.summary);
      edge.metadata = {
        ...(edge.metadata ?? {}),
        lastAppliedPlanId: plan.id,
        lastAppliedActionId: action.id,
        appliedBy: "user-confirmed"
      };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${edge.id}` });
    } else if (action.type === "update_node_progress") {
      const progress = progressFromAction(action);
      const node = action.targetNodeIds.map((nodeId) => findNode(graph, nodeId)).find(Boolean) as DevelopmentNode | undefined;
      if (!node || progress === undefined) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target node or progress was not found." });
        continue;
      }
      node.progress = progress;
      node.metadata = { ...(node.metadata ?? {}), lastAppliedPlanId: plan.id, lastAppliedActionId: action.id, appliedBy: "user-confirmed" };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${node.id} progress to ${Math.round(progress * 100)}%` });
    } else if (action.type === "update_edge_progress") {
      const progress = progressFromAction(action);
      const edge = action.targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).find(Boolean) as DevelopmentEdge | undefined;
      if (!edge || progress === undefined) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target edge or progress was not found." });
        continue;
      }
      edge.progress = progress;
      edge.metadata = { ...(edge.metadata ?? {}), lastAppliedPlanId: plan.id, lastAppliedActionId: action.id, appliedBy: "user-confirmed" };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${edge.id} progress to ${Math.round(progress * 100)}%` });
    } else if (action.type === "create_memory_event") {
      await appendChange(projectRoot, {
        title: action.title,
        summary: `${action.description}\n\nPlan: ${plan.summary}`,
        kind: "CONFIRMED"
      });
      appliedActions.push({ id: action.id, type: action.type, summary: "Recorded memory event." });
    } else if (action.type === "create_decision") {
      await appendDecision(projectRoot, action, plan);
      appliedActions.push({ id: action.id, type: action.type, summary: "Recorded decision." });
    } else if (action.type === "create_task" || action.type === "create_coding_task") {
      const taskId = `TASK-${String(Date.now()).slice(-6)}`;
      const taskPath = await writeCodingTask(projectRoot, {
        id: taskId,
        markdown: [`# ${taskId} ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", "Target nodes:", ...list(action.targetNodeIds), "", "Target edges:", ...list(action.targetEdgeIds), ""].join("\n")
      });
      appliedActions.push({ id: action.id, type: action.type, summary: `Wrote ${taskPath}` });
    } else if (action.type === "write_report") {
      const reportPath = await writeActionReport(projectRoot, action, plan);
      appliedActions.push({ id: action.id, type: action.type, summary: `Wrote ${reportPath}` });
    }

    await appendTrace(projectRoot, {
      id: `trace-event:apply:${Date.now()}:${action.id}`,
      traceId: `trace:apply:${Date.now()}`,
      timestamp: new Date().toISOString(),
      kind: graphChangedByAction ? "graph.updated" : "memory.recorded",
      target: traceTargetFromAction(action),
      summary: `Applied plan action ${action.title}`,
      data: { planId: plan.id, action }
    });
  }

  if (graphChanged) await writeDevelopmentGraph(projectRoot, graph);
  if (appliedActions.length) {
    await appendChange(projectRoot, {
      title: `Applied ${appliedActions.length} plan action(s)`,
      summary: appliedActions.map((action) => `${action.type}: ${action.summary}`).join("\n"),
      kind: "CONFIRMED"
    });
  }

  return { appliedActions, skippedActions, graphUpdated: graphChanged };
}

function normalizeTaskResultInput(value: CodingAgentResultInput): CodingAgentResultInput {
  if (!value || typeof value !== "object") throw new Error("Task result must be a JSON object.");
  if (!value.taskId) throw new Error("Task result requires taskId.");
  if (!["done", "partial", "failed"].includes(value.status)) throw new Error("Task result status must be done, partial, or failed.");
  return {
    taskId: value.taskId,
    status: value.status,
    summary: value.summary || "",
    changedFiles: Array.isArray(value.changedFiles) ? value.changedFiles.filter((item) => typeof item === "string") : [],
    testResult: value.testResult,
    progressSuggestion: value.progressSuggestion,
    memorySuggestion: value.memorySuggestion
  };
}

function progressPlanFromTaskResult(result: CodingAgentResultInput): GraphPlan | undefined {
  const nodeActions =
    result.progressSuggestion?.nodeUpdates?.map((update, index) => ({
      id: `action:${result.taskId}:node-progress:${index + 1}`,
      type: "update_node_progress" as const,
      title: `Apply suggested node progress for ${update.nodeId}`,
      description: result.summary,
      targetNodeIds: [update.nodeId],
      targetEdgeIds: [],
      data: { progress: update.progress }
    })) ?? [];
  const edgeActions =
    result.progressSuggestion?.edgeUpdates?.map((update, index) => ({
      id: `action:${result.taskId}:edge-progress:${index + 1}`,
      type: "update_edge_progress" as const,
      title: `Apply suggested edge progress for ${update.edgeId}`,
      description: result.summary,
      targetNodeIds: [],
      targetEdgeIds: [update.edgeId],
      data: { progress: update.progress }
    })) ?? [];
  const actions = [...nodeActions, ...edgeActions];
  if (!actions.length) return undefined;
  return {
    id: `plan:${result.taskId}:progress-preview`,
    summary: `Progress suggestions imported from ${result.taskId}. Confirm before Apply.`,
    missingGluePoints: [],
    actions,
    codingTasks: [],
    questions: ["Which progress suggestions should Praxis apply to the Development Graph?"]
  };
}

function buildCodingTaskContext(graph: DevelopmentGraph, plan: GraphPlan, action?: GraphPlan["actions"][number]) {
  const targetEdgeIds = unique([
    ...(action?.targetEdgeIds ?? []),
    ...plan.actions.flatMap((item) => item.targetEdgeIds ?? [])
  ]);
  const edgeTargets = targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).filter(Boolean) as DevelopmentEdge[];
  const edgeNodeIds = edgeTargets.flatMap((edge) => [edge.source, edge.target]);
  const targetNodeIds = unique([...(action?.targetNodeIds ?? []), ...plan.actions.flatMap((item) => item.targetNodeIds ?? []), ...edgeNodeIds]);
  const nodeTargets = targetNodeIds.map((nodeId) => findNode(graph, nodeId)).filter(Boolean) as DevelopmentNode[];

  const edgeLines = edgeTargets.map((edge) => {
    const source = findNode(graph, edge.source);
    const target = findNode(graph, edge.target);
    return [
      `Edge: ${edge.id}`,
      `  Relation: ${source?.title ?? edge.source} --${edge.kind}--> ${target?.title ?? edge.target}`,
      `  Progress: ${Math.round(edge.progress * 100)}%`,
      `  Risk: ${edge.riskLevel}`,
      `  Knowledge: ${edge.knowledgeKind} / ${edge.confidence}`,
      edge.blockedReason ? `  Blocked reason: ${edge.blockedReason}` : "  Blocked reason: None recorded"
    ].join("\n");
  });
  const nodeLines = nodeTargets.map((node) =>
    [
      `Node: ${node.id}`,
      `  Title: ${node.title}`,
      `  Kind: ${node.kind}`,
      `  Progress: ${Math.round(node.progress * 100)}%`,
      `  Knowledge: ${node.knowledgeKind} / ${node.confidence}`,
      node.description ? `  Description: ${node.description}` : undefined
    ]
      .filter(Boolean)
      .join("\n")
  );
  const relatedFiles = unique(
    nodeTargets
      .map((node) => node.metadata?.path)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const relatedModulePaths = unique(
    nodeTargets
      .map((node) => node.metadata?.path)
      .filter((value): value is string => typeof value === "string" && (value.startsWith("apps/") || value.startsWith("packages/") || value === "docs"))
  );

  return {
    targetNodeIds,
    targetEdgeIds,
    relatedFiles,
    allowedPaths: relatedModulePaths.length ? [...relatedModulePaths, ".distinction"] : [".distinction", "packages"],
    architectureContext: nodeLines.length ? nodeLines.join("\n\n") : "No node context was resolved from the selected graph plan.",
    graphContext: [
      plan.summary,
      "",
      "Selected graph context:",
      edgeLines.length ? edgeLines.join("\n\n") : "No edge context was resolved from the selected graph plan.",
      "",
      nodeLines.length ? nodeLines.join("\n\n") : ""
    ]
      .filter(Boolean)
      .join("\n"),
    memoryContext: plan.missingGluePoints.map((point) => `${point.kind}: ${point.title} - ${point.reason}`)
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function list(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- None"];
}

function isSupportedApplyAction(action: PlanAction): boolean {
  return [
    "update_edge",
    "update_node_progress",
    "update_edge_progress",
    "create_memory_event",
    "create_decision",
    "create_task",
    "create_coding_task",
    "write_report"
  ].includes(action.type);
}

function progressFromAction(action: PlanAction): number | undefined {
  const raw = action.data?.progress ?? action.data?.value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return normalizeProgress(raw > 1 ? raw / 100 : raw);
}

async function appendDecision(projectRoot: string, action: PlanAction, plan: GraphPlan): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.memoryDir, { recursive: true });
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(
      path.join(paths.memoryDir, "decisions.md"),
      [`## ${new Date().toISOString()} ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", ""].join("\n"),
      "utf8"
    )
  );
}

async function writeActionReport(projectRoot: string, action: PlanAction, plan: GraphPlan): Promise<string> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.reportsDir, { recursive: true });
  const reportPath = path.join(paths.reportsDir, `${slug(action.id)}.md`);
  await writeFile(
    reportPath,
    [`# ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", "## Plan Summary", "", plan.summary, ""].join("\n"),
    "utf8"
  );
  return reportPath;
}

function traceTargetFromAction(action: PlanAction) {
  if (action.targetEdgeIds[0]) return { type: "edge" as const, id: action.targetEdgeIds[0] };
  if (action.targetNodeIds[0]) return { type: "node" as const, id: action.targetNodeIds[0] };
  return { type: "project" as const };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "TASK-result";
}

async function commandCreateProject(args: Args): Promise<void> {
  const root = required(args, "root");
  let plan: NewProjectPlan;
  if (args.plan) {
    plan = (await readJson(String(args.plan))) as NewProjectPlan;
  } else {
    plan = await createProjectPlanWithAgents(root, {
      projectName: String(args.name ?? "praxis-project"),
      productIdea: String(args.intent ?? "New Praxis project"),
      projectKind: args.kind === "tauri-desktop-minimal" ? "tauri-desktop-minimal" : "documentation-first"
    });
  }
  const result = await applyNewProjectPlan(root, plan);
  await appendChange(root, {
    title: "Created project from product intent",
    summary: `Generated ${plan.files.length} file(s), ${plan.requirements.length} requirement(s), and ${plan.architecture.length} architecture component(s).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:create-project:${Date.now()}`,
    traceId: `trace:create-project:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "graph.generated",
    target: { type: "project", id: "project:root" },
    summary: "Created new project graph from product intent",
    data: { projectName: plan.projectName, projectKind: plan.projectKind }
  }).catch(() => undefined);
  outputJson({ ok: true, ...result });
}

async function commandCreateProjectPlan(args: Args): Promise<void> {
  const root = String(args.root ?? process.cwd());
  const plan = await createProjectPlanWithAgents(root, {
    projectName: String(args.name ?? "praxis-project"),
    productIdea: String(args.intent ?? "New Praxis project"),
    projectKind: args.kind === "tauri-desktop-minimal" ? "tauri-desktop-minimal" : "documentation-first"
  });
  await maybeWriteJson(args, "out", plan);
  outputJson({ ok: true, requirements: plan.requirements.length, architecture: plan.architecture.length, files: plan.files.length, plan });
}

async function createProjectPlanWithAgents(
  root: string,
  input: { projectName: string; productIdea: string; projectKind: "documentation-first" | "tauri-desktop-minimal" }
): Promise<NewProjectPlan> {
  const plan = createNewProjectPlan(input);
  const config = await loadModelConfig(root);
  const requirements = await callProjectCreationAgent(config, "project.create.requirements", "project-create-requirements", input);
  const architecture = await callProjectCreationAgent(config, "project.create.architecture", "project-create-architecture", {
    ...input,
    requirements: requirements?.requirements ?? plan.requirements
  });

  if (Array.isArray(requirements?.requirements)) {
    plan.requirements = normalizeRequirements(requirements.requirements, plan.requirements);
  }
  if (Array.isArray(architecture?.architecture)) {
    plan.architecture = normalizeArchitecture(architecture.architecture, plan.architecture);
  }
  plan.assumptions = [
    ...plan.assumptions,
    ...normalizeStringRecords(requirements?.assumptions, "requirement-agent-assumption"),
    ...normalizeStringRecords(requirements?.nonGoals, "requirement-agent-non-goal"),
    ...normalizeStringRecords(requirements?.successCriteria, "requirement-agent-success-criterion"),
    ...normalizeStringRecords(architecture?.risks, "architecture-agent-risk")
  ];
  plan.questions = [
    ...plan.questions,
    ...normalizeQuestionRecords(requirements?.questions, "requirement-agent-question"),
    ...normalizeQuestionRecords(architecture?.questions, "architecture-agent-question")
  ];
  refreshNewProjectPlanArtifacts(plan);
  return plan;
}

async function callProjectCreationAgent(
  config: Awaited<ReturnType<typeof loadModelConfig>>,
  taskType: "project.create.requirements" | "project.create.architecture",
  promptName: "project-create-requirements" | "project-create-architecture",
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, { apiKeyEnv: providerConfig?.apiKeyEnv, baseUrl: providerConfig?.baseUrl });
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt(promptName).body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  const parsed = safeJson(response.content);
  return isRecord(parsed) ? parsed : undefined;
}

function normalizeRequirements(value: unknown[], fallback: NewProjectPlan["requirements"]): NewProjectPlan["requirements"] {
  const requirements = value
    .filter(isRecord)
    .map((item, index) => ({
      id: stringOr(item.id, `REQ-${String(index + 1).padStart(3, "0")}`),
      title: stringOr(item.title, `Requirement ${index + 1}`),
      description: stringOr(item.description, "")
    }))
    .filter((item) => item.title || item.description);
  return requirements.length ? requirements : fallback;
}

function normalizeArchitecture(value: unknown[], fallback: NewProjectPlan["architecture"]): NewProjectPlan["architecture"] {
  const architecture = value
    .filter(isRecord)
    .map((item, index) => ({
      id: stringOr(item.id, `ARCH-${String(index + 1).padStart(3, "0")}`),
      title: stringOr(item.title, `Architecture Component ${index + 1}`),
      responsibility: stringOr(item.responsibility, stringOr(item.description, ""))
    }))
    .filter((item) => item.title || item.responsibility);
  return architecture.length ? architecture : fallback;
}

function normalizeStringRecords(value: unknown, prefix: string): { id: string; summary: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((summary, index) => ({ id: `${prefix}-${index + 1}`, summary }));
}

function normalizeQuestionRecords(value: unknown, prefix: string): { id: string; question: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") return { id: `${prefix}-${index + 1}`, question: item };
      if (isRecord(item)) return { id: stringOr(item.id, `${prefix}-${index + 1}`), question: stringOr(item.question, "") };
      return undefined;
    })
    .filter((item): item is { id: string; question: string } => Boolean(item?.question));
}

function refreshNewProjectPlanArtifacts(plan: NewProjectPlan): void {
  const projectNode = plan.graph.nodes.find((node) => node.id === "project:root");
  plan.graph.nodes = [
    projectNode ?? {
      id: "project:root",
      kind: "project",
      title: plan.projectName,
      status: "draft",
      progress: 0.1,
      confidence: "medium",
      knowledgeKind: "CANDIDATE"
    },
    ...plan.requirements.map((requirement) => ({
      id: `requirement:${requirement.id}`,
      kind: "requirement" as const,
      title: requirement.title,
      description: requirement.description,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    })),
    ...plan.architecture.map((component) => ({
      id: `architecture:${component.id}`,
      kind: "architecture_component" as const,
      title: component.title,
      description: component.responsibility,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    }))
  ];
  plan.graph.edges = plan.graph.nodes
    .filter((node) => node.id !== "project:root")
    .map((node) => ({
      id: `edge:project-contains-${node.id}`,
      source: "project:root",
      target: node.id,
      kind: "contains" as const,
      title: "contains",
      status: "draft" as const,
      progress: 0.1,
      riskLevel: "none" as const,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    }));

  replaceGeneratedFile(
    plan,
    "docs/PRODUCT_SPEC.md",
    [
      "# Product Spec",
      "",
      `Project: ${plan.projectName}`,
      "",
      "## Product Intent",
      "",
      plan.productIdea,
      "",
      "## Requirements",
      "",
      ...plan.requirements.map((requirement) => `- ${requirement.id}: ${requirement.title} - ${requirement.description}`),
      "",
      "## Assumptions / Constraints",
      "",
      ...plan.assumptions.map((assumption) => `- ${assumption.summary}`),
      "",
      "## Questions",
      "",
      ...plan.questions.map((question) => `- ${question.question}`),
      ""
    ].join("\n")
  );
  replaceGeneratedFile(
    plan,
    "docs/ARCHITECTURE.md",
    [
      "# Architecture",
      "",
      "## Components",
      "",
      ...plan.architecture.map((component) => `- ${component.id}: ${component.title} - ${component.responsibility}`),
      "",
      "## Assumptions And Risks",
      "",
      ...plan.assumptions.map((assumption) => `- ${assumption.summary}`),
      ""
    ].join("\n")
  );
  replaceGeneratedFile(plan, ".distinction/graph/nodes.json", `${JSON.stringify(plan.graph.nodes, null, 2)}\n`);
  replaceGeneratedFile(plan, ".distinction/graph/edges.json", `${JSON.stringify(plan.graph.edges, null, 2)}\n`);
}

function replaceGeneratedFile(plan: NewProjectPlan, filePath: string, content: string): void {
  const file = plan.files.find((item) => item.path === filePath);
  if (file) file.content = content;
  else plan.files.push({ path: filePath, content });
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(values: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing required --${key}`);
  return value;
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

async function maybeWriteJson(args: Args, key: string, value: unknown): Promise<void> {
  const out = args[key];
  if (typeof out === "string") await writeFile(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function outputJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

void main(process.argv.slice(2));
