#!/usr/bin/env node
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildArchitectureModelPatch, type ArchitectureModelPatch } from "@praxis/architecture-modeler";
import { buildCodeFactGraphSnapshot, type CodeFactProviderSource } from "@praxis/code-fact-graph";
import { detectArchitectureFindings, type ArchitectureFindingReport } from "@praxis/finding-detector";
import {
  buildProjectionManifest,
  projectArchitectureDependencyGraphView,
  projectArchitectureDependencyView,
  projectCodeFactGraphView,
  projectContextGraphView,
  projectFindingsGraphView,
  projectMemoryGraphView,
  readProjectedGraphViewRecords,
  projectTaskPlanGraphView,
  projectTraceGraphView,
  type TaskProjectionRecord,
  type TraceProjectionRecord
} from "@praxis/projection-engine";
import {
  acceptedFactRecordsFromPatch,
  buildRepositoryUnderstandingPatch,
  proposedFactRecordsFromPatchForPreview,
  type RepositoryUnderstandingPatch
} from "@praxis/repository-understanding";
import { scanRepository } from "@praxis/repository-scanner";
import { profileProject } from "@praxis/project-profiler";
import {
  ArchitectureDependencyViewSchema,
  ArchitectureFindingReportSchema,
  ArchitectureModelPatchSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  ExternalAgentResultSchema,
  FindingStatusPatchSchema,
  MemorySuggestionPatchSchema,
  MemoryRecordSchema,
  ProjectedGraphViewSchema,
  ProjectionManifestSchema,
  RepositoryUnderstandingPatchSchema,
  TraceRecordSchema,
  type ArchitectureFinding,
  type CodeFactGraphSnapshot,
  type ExternalAgentResult,
  type FindingStatusPatch,
  type MemoryRecord,
  type MemoryPatch,
  type MemorySuggestionPatch,
  type ProjectedGraphView,
  type TraceRecord
} from "@praxis/schema";
import { generateDevelopmentGraphCandidate } from "@praxis/graph-generator";
import {
  appendMessage,
  createSessionForTarget,
  getChatSessionPaths,
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
import { buildContext, buildContextPacket, parseGraphAnchor, type SelectionTarget } from "@praxis/context-builder";
import {
  appendChange,
  appendFactRecords,
  appendTrace,
  getLocalKnowledgePaths,
  initializeLocalKnowledge,
  readDevelopmentGraph,
  readFactRecords,
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
import { startMcpServer } from "@praxis/mcp-server";

type Args = Record<string, string | boolean>;

interface JsonSchema<T> {
  parse(value: unknown): T;
}

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
    if (command === "code-facts") return await commandCodeFacts(args);
    if (command === "profile") return await commandProfile(args);
    if (command === "generate-graph") return await commandGenerateGraph(args);
    if (command === "intake") return await commandIntake(args);
    if (command === "understand") return await commandUnderstand(args);
    if (command === "accept-understanding") return await commandAcceptUnderstanding(args);
    if (command === "model-architecture") return await commandModelArchitecture(args);
    if (command === "detect-findings") return await commandDetectFindings(args);
    if (command === "review-queue") return await commandReviewQueue(args);
    if (command === "finding-audit") return await commandFindingAudit(args);
    if (command === "accept-external-result") return await commandAcceptExternalResult(args);
    if (command === "accept-memory-suggestion") return await commandAcceptMemorySuggestion(args);
    if (command === "accept-finding-status") return await commandAcceptFindingStatus(args);
    if (command === "project:view") return await commandProjectView(args, rest);
    if (command === "context-packet") return await commandContextPacket(args);
    if (command === "serve") return await commandServe(args);
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

async function commandServe(args: Args): Promise<void> {
  if (args.mcp !== true) throw new Error("Unsupported serve mode. Use: praxis-runtime serve --mcp --path <project>");
  const root = typeof args.path === "string" ? args.path : required(args, "root");
  await startMcpServer({ root: path.resolve(root) });
}

async function commandScan(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = await scanRepository({ root });
  await maybeWriteJson(args, "out", snapshot);
  outputJson({ ok: true, fileCount: snapshot.files.length, root: snapshot.root });
}

async function commandCodeFacts(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );
  await maybeWriteJson(args, "out", snapshot);
  if (args["write-cache"] === true) {
    const cachePath = path.join(path.resolve(root), ".distinction", "cache", "code-fact-graph.json");
    await writeJson(cachePath, snapshot, CodeFactGraphSnapshotSchema);
  }
  outputJson({
    ok: true,
    root: snapshot.root,
    provider: snapshot.provider,
    files: snapshot.statistics.fileCount,
    nodes: snapshot.statistics.nodeCount,
    edges: snapshot.statistics.edgeCount,
    warnings: snapshot.warnings
  });
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
  outputJson({
    ok: true,
    flow: "legacy_development_graph",
    legacy: true,
    nextFlow: "Use intake -> model-architecture -> detect-findings -> project:view for the v0.1 projection pipeline.",
    nodes: candidate.graph.nodes.length,
    edges: candidate.graph.edges.length,
    warnings: candidate.warnings.length
  });
}

async function commandIntake(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const snapshot = await scanRepository({ root });
  const codeFacts = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );

  await writeJson(path.join(resolvedRoot, ".distinction", "cache", "repository-snapshot.json"), snapshot);
  const codeFactsPath = path.join(resolvedRoot, ".distinction", "cache", "code-fact-graph.json");
  await writeJson(codeFactsPath, codeFacts, CodeFactGraphSnapshotSchema);

  const profile = await profileProject(snapshot);
  const profilePath = path.join(resolvedRoot, ".distinction", "cache", "project-profile.json");
  await writeJson(profilePath, profile);

  const understanding = RepositoryUnderstandingPatchSchema.parse(buildRepositoryUnderstandingPatch(codeFacts));
  const understandingPath = path.join(resolvedRoot, ".distinction", "cache", "repository-understanding-patch.json");
  await writeJson(understandingPath, understanding, RepositoryUnderstandingPatchSchema);

  const previewFacts = proposedFactRecordsFromPatchForPreview(understanding);
  const architecture = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(resolvedRoot, previewFacts));
  const architecturePath = path.join(resolvedRoot, ".distinction", "cache", "architecture-model-patch.json");
  await writeJson(architecturePath, architecture, ArchitectureModelPatchSchema);

  const findings = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(architecture));
  const findingsPath = path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");
  await writeJson(findingsPath, findings, ArchitectureFindingReportSchema);

  outputJson({
    ok: true,
    root: resolvedRoot,
    reviewOnly: true,
    provider: codeFacts.provider,
    cache: {
      repositorySnapshot: path.relative(resolvedRoot, path.join(resolvedRoot, ".distinction", "cache", "repository-snapshot.json")),
      codeFacts: path.relative(resolvedRoot, codeFactsPath),
      projectProfile: path.relative(resolvedRoot, profilePath),
      repositoryUnderstandingPatch: path.relative(resolvedRoot, understandingPath),
      architectureModelPatch: path.relative(resolvedRoot, architecturePath),
      architectureFindings: path.relative(resolvedRoot, findingsPath)
    },
    summary: {
      files: snapshot.files.length,
      codeFactNodes: codeFacts.statistics.nodeCount,
      codeFactEdges: codeFacts.statistics.edgeCount,
      memoryPatches: understanding.memoryPatches.length,
      modules: architecture.modules.length,
      dependencies: architecture.dependencies.length,
      findings: findings.findings.length
    },
    next: "Run praxis-runtime accept-understanding --root <path> to persist FACT memory."
  });
}

async function commandInitMemory(args: Args): Promise<void> {
  const root = required(args, "root");
  const candidate = (await readJson(required(args, "candidate"))) as DevelopmentGraphCandidate;
  await initializeLocalKnowledge(root, candidate);
  outputJson({
    ok: true,
    flow: "legacy_development_graph",
    legacy: true,
    nextFlow: "Use project:view outputs under .distinction/views/ for new projection cache.",
    distinction: path.join(path.resolve(root), ".distinction")
  });
}

async function commandChat(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const target = required(args, "target");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const instruction = String(args.instruction ?? (mode === "plan" ? "Generate plan" : "Explain selected target"));
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
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
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
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
    logPaths: agentLogPaths(projectRoot, session.id, runPath),
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
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
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
  outputJson({ ok: true, ...(await readSessionTranscript(projectRoot, sessionId)), logPaths: agentLogPaths(projectRoot, sessionId) });
}

async function commandChatSend(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
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
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
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
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const result = await applyPlanActions(projectRoot, graph, plan, actionIds);
  outputJson({ ok: true, ...result });
}

async function commandImportTaskResult(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const result = (await readJson(required(args, "result"))) as CodingAgentResultInput;
  outputJson({ ok: true, ...(await importTaskResultPayload(projectRoot, result)) });
}

async function readRuntimeDevelopmentGraph(projectRoot: string): Promise<DevelopmentGraph> {
  const root = path.resolve(projectRoot);
  try {
    return await readDevelopmentGraph(root);
  } catch (error) {
    if (!isMissingLegacyDevelopmentGraphError(error)) throw error;
    return await readFoundationDevelopmentGraphFallback(root);
  }
}

function isMissingLegacyDevelopmentGraphError(error: unknown): boolean {
  if (isMissingFileError(error)) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.replace(/\\/g, "/");
  return message.includes(".distinction/graph/") && (message.includes("nodes.json") || message.includes("edges.json"));
}

async function readFoundationDevelopmentGraphFallback(root: string): Promise<DevelopmentGraph> {
  const projectedRecords = await readProjectedGraphViewRecords(root);
  if (projectedRecords.length > 0) {
    return developmentGraphFromProjectedViews(root, projectedRecords.map((record) => record.view));
  }

  const codeFacts = await tryReadJsonWithSchema(path.join(root, ".distinction", "cache", "code-fact-graph.json"), CodeFactGraphSnapshotSchema);
  if (codeFacts) return developmentGraphFromCodeFacts(root, codeFacts);

  return minimalFoundationDevelopmentGraph(root, "No legacy DevelopmentGraph or Foundation projection cache was found. Run intake and project:view to populate project intelligence.");
}

function minimalFoundationDevelopmentGraph(root: string, description?: string): DevelopmentGraph {
  return {
    id: "graph:foundation:fallback",
    title: `${path.basename(root) || "Project"} Foundation Graph`,
    rootPath: root,
    updatedAt: new Date().toISOString(),
    metadata: {
      foundationFallback: true,
      source: "empty_foundation_fallback",
      readOnly: true
    },
    nodes: [
      {
        id: "project:foundation",
        kind: "project",
        title: path.basename(root) || "Project",
        description,
        status: "active",
        progress: 0,
        confidence: "medium",
        knowledgeKind: "FACT",
        metadata: {
          path: root,
          foundationFallback: true
        }
      }
    ],
    edges: []
  };
}

function developmentGraphFromProjectedViews(root: string, views: ProjectedGraphView[]): DevelopmentGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalFoundationDevelopmentGraph(root, "Synthesized from Foundation ProjectedGraphView cache because legacy .distinction/graph is absent.");
  graph.metadata = {
    ...(graph.metadata ?? {}),
    source: "projected_graph_views",
    projectedViewIds: views.map((view) => view.id),
    projectedViewKinds: Array.from(new Set(views.map((view) => view.kind)))
  };

  const nodeIdByViewNode = new Map<string, string>();
  const seenNodes = new Set(graph.nodes.map((node) => node.id));
  const seenEdges = new Set<string>();
  let truncatedNodes = 0;
  let truncatedEdges = 0;

  for (const view of views) {
    for (const projectedNode of view.nodes) {
      const graphNodeId = foundationProjectionNodeId(view.id, projectedNode.id);
      nodeIdByViewNode.set(`${view.id}\u0000${projectedNode.id}`, graphNodeId);
      if (seenNodes.has(graphNodeId)) continue;
      if (graph.nodes.length >= nodeLimit) {
        truncatedNodes += 1;
        continue;
      }
      seenNodes.add(graphNodeId);
      graph.nodes.push({
        id: graphNodeId,
        kind: developmentNodeKindFromProjection(projectedNode.kind, projectedNode.anchor.kind),
        title: projectedNode.label || projectedNode.id,
        description: projectedNode.summary,
        status: statusFromString(projectedNode.status),
        progress: 0,
        confidence: view.authority === "durable_model" ? "high" : "medium",
        knowledgeKind: view.authority === "durable_model" ? "CONFIRMED" : "INFERENCE",
        tags: ["foundation", "projection", view.kind],
        metadata: {
          foundationFallback: true,
          projectionViewId: view.id,
          projectionViewKind: view.kind,
          projectionNodeId: projectedNode.id,
          anchor: projectedNode.anchor,
          source: projectedNode.source,
          path: projectedNode.path,
          projectedGraphMetadata: projectedNode.metadata
        }
      });
    }
  }

  for (const node of graph.nodes.slice(1, 41)) {
    const edgeId = `foundation-root:${node.id}`;
    seenEdges.add(edgeId);
    graph.edges.push({
      id: edgeId,
      source: "project:foundation",
      target: node.id,
      kind: "contains",
      title: "Contains",
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: "medium",
      knowledgeKind: "INFERENCE",
      metadata: { foundationFallback: true, synthetic: true }
    });
  }

  for (const view of views) {
    for (const projectedEdge of view.edges) {
      const source = nodeIdByViewNode.get(`${view.id}\u0000${projectedEdge.sourceId}`);
      const target = nodeIdByViewNode.get(`${view.id}\u0000${projectedEdge.targetId}`);
      if (!source || !target) {
        truncatedEdges += 1;
        continue;
      }
      const graphEdgeId = foundationProjectionEdgeId(view.id, projectedEdge.id);
      if (seenEdges.has(graphEdgeId)) continue;
      if (graph.edges.length >= edgeLimit) {
        truncatedEdges += 1;
        continue;
      }
      seenEdges.add(graphEdgeId);
      graph.edges.push({
        id: graphEdgeId,
        source,
        target,
        kind: developmentEdgeKindFromProjection(projectedEdge.kind),
        title: projectedEdge.kind,
        description: projectedEdge.summary,
        status: "active",
        progress: 0,
        riskLevel: projectedEdge.kind.includes("conflict") ? "medium" : "none",
        confidence: projectedEdge.confidence ?? "medium",
        knowledgeKind: view.authority === "durable_model" ? "CONFIRMED" : "INFERENCE",
        metadata: {
          foundationFallback: true,
          projectionViewId: view.id,
          projectionViewKind: view.kind,
          projectionEdgeId: projectedEdge.id,
          anchor: projectedEdge.anchor,
          source: projectedEdge.source,
          projectedGraphMetadata: projectedEdge.metadata
        }
      });
    }
  }

  graph.metadata = {
    ...(graph.metadata ?? {}),
    truncatedNodes,
    truncatedEdges
  };
  return graph;
}

function developmentGraphFromCodeFacts(root: string, snapshot: CodeFactGraphSnapshot): DevelopmentGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalFoundationDevelopmentGraph(root, "Synthesized from CodeFactGraphSnapshot cache because legacy .distinction/graph is absent.");
  graph.metadata = {
    ...(graph.metadata ?? {}),
    source: "code_fact_graph_snapshot",
    provider: snapshot.provider,
    readOnly: true
  };

  const selectedNodes = snapshot.nodes.filter((node) => node.kind !== "project").slice(0, nodeLimit - 1);
  const idMap = new Map<string, string>();
  for (const node of selectedNodes) {
    const graphNodeId = foundationCodeFactNodeId(node.id);
    idMap.set(node.id, graphNodeId);
    graph.nodes.push({
      id: graphNodeId,
      kind: developmentNodeKindFromProjection(node.kind, node.kind === "file" ? "file" : "symbol"),
      title: node.name || node.qualifiedName || node.id,
      description: node.qualifiedName,
      status: "active",
      progress: 0,
      confidence: "high",
      knowledgeKind: "FACT",
      tags: ["foundation", "code-fact", node.kind],
      metadata: {
        foundationFallback: true,
        codeFactNodeId: node.id,
        path: node.filePath,
        language: node.language,
        range: node.range
      }
    });
  }

  for (const node of graph.nodes.slice(1, 41)) {
    graph.edges.push({
      id: `foundation-root:${node.id}`,
      source: "project:foundation",
      target: node.id,
      kind: "contains",
      title: "Contains",
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: "high",
      knowledgeKind: "FACT",
      metadata: { foundationFallback: true, synthetic: true }
    });
  }

  let truncatedEdges = 0;
  for (const edge of snapshot.edges) {
    const source = idMap.get(edge.sourceId);
    const target = idMap.get(edge.targetId);
    if (!source || !target) {
      truncatedEdges += 1;
      continue;
    }
    if (graph.edges.length >= edgeLimit) {
      truncatedEdges += 1;
      continue;
    }
    graph.edges.push({
      id: foundationCodeFactEdgeId(edge.id),
      source,
      target,
      kind: developmentEdgeKindFromProjection(edge.kind),
      title: edge.kind,
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: confidenceFromNumber(edge.confidence),
      knowledgeKind: "FACT",
      metadata: {
        foundationFallback: true,
        codeFactEdgeId: edge.id,
        filePath: edge.filePath,
        range: edge.range
      }
    });
  }

  graph.metadata = {
    ...(graph.metadata ?? {}),
    truncatedNodes: Math.max(0, snapshot.nodes.length - selectedNodes.length - 1),
    truncatedEdges
  };
  return graph;
}

function foundationProjectionNodeId(viewId: string, nodeId: string): string {
  return `projection:${viewId}:${nodeId}`;
}

function foundationProjectionEdgeId(viewId: string, edgeId: string): string {
  return `projection:${viewId}:${edgeId}`;
}

function foundationCodeFactNodeId(nodeId: string): string {
  return `code-fact:${nodeId}`;
}

function foundationCodeFactEdgeId(edgeId: string): string {
  return `code-fact:${edgeId}`;
}

function developmentNodeKindFromProjection(kind: string, anchorKind?: string): DevelopmentNode["kind"] {
  if (anchorKind === "finding" || kind.includes("finding") || kind.includes("risk")) return "risk";
  if (anchorKind === "task" || kind.includes("task")) return "task";
  if (anchorKind === "trace" || anchorKind === "memory" || kind.includes("trace") || kind.includes("memory")) return "memory_event";
  if (anchorKind === "architecture_module" || kind.includes("architecture") || kind.includes("module")) return "architecture_component";
  if (anchorKind === "file" || anchorKind === "symbol" || kind.includes("file") || kind.includes("function") || kind.includes("class")) return "code_unit";
  if (kind.includes("decision")) return "decision";
  if (kind.includes("document") || kind.includes("spec")) return "document";
  return "code_unit";
}

function developmentEdgeKindFromProjection(kind: string): DevelopmentEdge["kind"] {
  if (kind === "contains" || kind === "owns") return "contains";
  if (kind === "implements") return "implements";
  if (kind === "impacts" || kind === "affects") return "impacts";
  if (kind === "blocks") return "blocks";
  if (kind === "conflicts_with") return "conflicts_with";
  if (kind === "derived_from") return "derived_from";
  if (kind === "validates") return "validates";
  if (kind === "records" || kind.includes("finding") || kind.includes("trace") || kind.includes("memory")) return "records";
  return "depends_on";
}

function statusFromString(value: string | undefined): DevelopmentNode["status"] {
  if (value === "draft" || value === "active" || value === "wip" || value === "blocked" || value === "done" || value === "stale" || value === "deprecated") {
    return value;
  }
  return "active";
}

function confidenceFromNumber(value: number): DevelopmentEdge["confidence"] {
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

function isFoundationFallbackGraph(graph: DevelopmentGraph): boolean {
  return graph.metadata?.foundationFallback === true;
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
  outputJson({ ok: true, sessionId, appendedMessages, ...transcript, logPaths: agentLogPaths(projectRoot, sessionId), ...extra });
}

function agentLogPaths(projectRoot: string, sessionId: string, runPath?: string) {
  const root = path.resolve(projectRoot);
  const chatPaths = getChatSessionPaths(root);
  return {
    chatSessionsIndex: chatPaths.sessionsIndexPath,
    chatTranscript: path.join(chatPaths.sessionsDir, `${sessionId}.jsonl`),
    runsIndex: path.join(root, ".distinction", "runs", "runs.jsonl"),
    runPath,
    traces: path.join(root, ".distinction", "memory", "traces.jsonl")
  };
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
    if (isFoundationFallbackGraph(graph) && isDevelopmentGraphMutationAction(action)) {
      skippedActions.push({
        id: action.id,
        type: action.type,
        reason: "Foundation projection fallback graph is read-only; rerun projection commands instead of writing legacy .distinction/graph."
      });
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

function isDevelopmentGraphMutationAction(action: PlanAction): boolean {
  return action.type === "update_edge" || action.type === "update_node_progress" || action.type === "update_edge_progress";
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
  outputJson({
    ok: true,
    legacyGraphFiles: true,
    legacyGraphNotice: "Generated .distinction/graph files are legacy DevelopmentGraph bootstrap artifacts, not v0.1 projection authority.",
    requirements: plan.requirements.length,
    architecture: plan.architecture.length,
    files: plan.files.length,
    plan
  });
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
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
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
  // Legacy bootstrap output: new v0.1 graph surfaces should be projected under views/.
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

async function commandUnderstand(args: Args): Promise<void> {
  const root = required(args, "root");
  const codeFacts = args["code-facts"]
    ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
    : await readOrBuildCodeFacts(root, args);
  const patch = RepositoryUnderstandingPatchSchema.parse(buildRepositoryUnderstandingPatch(codeFacts));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "repository-understanding-patch.json");
  await writeJson(cachePath, patch, RepositoryUnderstandingPatchSchema);
  await maybeWriteJson(args, "out", patch);
  outputJson({
    ok: true,
    root: patch.root,
    cachePath,
    memoryPatches: patch.memoryPatches.length,
    modelPatches: patch.modelPatches.length,
    findingPatches: patch.findingPatches.length,
    warnings: patch.warnings,
    reviewQuestions: patch.reviewQuestions
  });
}

async function commandAcceptUnderstanding(args: Args): Promise<void> {
  const root = required(args, "root");
  const patchPath =
    typeof args.patch === "string"
      ? args.patch
      : path.join(path.resolve(root), ".distinction", "cache", "repository-understanding-patch.json");
  const patch = await readJsonWithSchema(patchPath, RepositoryUnderstandingPatchSchema);
  const records = acceptedFactRecordsFromPatch(patch);
  const factsPath = await appendFactRecords(root, records);
  await appendChange(root, {
    title: "Accepted repository understanding facts",
    summary: `Accepted ${records.length} FACT memory record(s) from ${path.relative(path.resolve(root), patchPath) || patchPath}.`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: path.resolve(root),
    factsPath,
    acceptedFacts: records.length
  });
}

async function commandModelArchitecture(args: Args): Promise<void> {
  const root = required(args, "root");
  const records = await readFactRecords(root);
  const patch = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(path.resolve(root), records as any[]));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "architecture-model-patch.json");
  await writeJson(cachePath, patch, ArchitectureModelPatchSchema);
  await maybeWriteJson(args, "out", patch);
  outputJson({
    ok: true,
    root: patch.root,
    cachePath,
    modules: patch.modules.length,
    dependencies: patch.dependencies.length,
    warnings: patch.warnings
  });
}

async function commandDetectFindings(args: Args): Promise<void> {
  const root = required(args, "root");
  const modelPath =
    typeof args.model === "string"
      ? args.model
      : path.join(path.resolve(root), ".distinction", "cache", "architecture-model-patch.json");
  let model: ArchitectureModelPatch;
  try {
    model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    const records = await readFactRecords(root);
    model = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(path.resolve(root), records as any[]));
    await writeJson(modelPath, model, ArchitectureModelPatchSchema);
  }
  const detectedReport = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "architecture-findings.json");
  const previousReport = await tryReadJsonWithSchema(cachePath, ArchitectureFindingReportSchema);
  const report = previousReport ? reconcileFindingReport(previousReport, detectedReport) : detectedReport;
  await writeJson(cachePath, report, ArchitectureFindingReportSchema);
  await maybeWriteJson(args, "out", report);
  outputJson({
    ok: true,
    root: report.root,
    cachePath,
    findings: report.findings.length,
    detectorIds: report.detectorIds
  });
}

async function commandReviewQueue(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const includeAccepted = args["include-accepted"] === true;
  const accepted = await readAcceptedReviewArtifactIds(root);
  const memorySuggestionPaths = await listJsonFiles(path.join(root, ".distinction", "cache", "memory-suggestions"));
  const findingStatusPatchPaths = await listJsonFiles(path.join(root, ".distinction", "cache", "finding-status-patches"));

  const memorySuggestions = [];
  for (const filePath of memorySuggestionPaths) {
    const suggestion = await readJsonWithSchema(filePath, MemorySuggestionPatchSchema);
    const acceptedAt = accepted.memorySuggestions.get(suggestion.id);
    if (acceptedAt && !includeAccepted) continue;
    memorySuggestions.push({
      id: suggestion.id,
      path: projectRelativePath(root, filePath),
      sourceResultId: suggestion.sourceResultId,
      sourceTaskId: suggestion.sourceTaskId,
      summary: suggestion.summary,
      createdAt: suggestion.createdAt,
      acceptedAt,
      memoryPatchCount: suggestion.memoryPatches.length,
      records: suggestion.memoryPatches.map((patch) => ({
        patchId: patch.id,
        patchStatus: patch.status,
        id: patch.record.id,
        kind: patch.record.kind,
        type: patch.record.type,
        subject: patch.record.subject,
        predicate: patch.record.predicate,
        object: patch.record.object,
        summary: patch.record.summary,
        confidence: patch.record.confidence,
        source: patch.record.source,
        status: patch.record.status
      }))
    });
  }

  const findingStatusPatches = [];
  for (const filePath of findingStatusPatchPaths) {
    const patch = await readJsonWithSchema(filePath, FindingStatusPatchSchema);
    const acceptedAt = accepted.findingStatusPatches.get(patch.id);
    if (acceptedAt && !includeAccepted) continue;
    findingStatusPatches.push({
      id: patch.id,
      path: projectRelativePath(root, filePath),
      sourceResultId: patch.sourceResultId,
      sourceTaskId: patch.sourceTaskId,
      findingId: patch.findingId,
      status: patch.status,
      summary: patch.summary,
      rationale: patch.rationale,
      createdAt: patch.createdAt,
      acceptedAt,
      evidenceCount: patch.evidence.length
    });
  }

  const foundation = await buildFoundationReviewStatus(root);
  const result = {
    ok: true,
    root,
    generatedAt: new Date().toISOString(),
    includeAccepted,
    counts: {
      memorySuggestions: memorySuggestions.length,
      findingStatusPatches: findingStatusPatches.length,
      total: memorySuggestions.length + findingStatusPatches.length
    },
    foundation,
    memorySuggestions,
    findingStatusPatches
  };
  await maybeWriteJson(args, "out", result);
  outputJson(result);
}

async function buildFoundationReviewStatus(root: string) {
  const cacheDir = path.join(root, ".distinction", "cache");
  const memoryDir = path.join(root, ".distinction", "memory");
  const distinctionExists = await exists(path.join(root, ".distinction"));
  const repositorySnapshotPath = path.join(cacheDir, "repository-snapshot.json");
  const codeFactsPath = path.join(cacheDir, "code-fact-graph.json");
  const profilePath = path.join(cacheDir, "project-profile.json");
  const understandingPath = path.join(cacheDir, "repository-understanding-patch.json");
  const factsPath = path.join(memoryDir, "facts.jsonl");
  const architecturePath = path.join(cacheDir, "architecture-model-patch.json");
  const findingsPath = path.join(cacheDir, "architecture-findings.json");
  const manifestPath = path.join(cacheDir, "projection-manifest.json");

  const [repositorySnapshot, codeFacts, profile, understanding, factRecords, architecture, findings, manifest, projectedViews, traces, tasks] = await Promise.all([
    tryReadJsonFile(repositorySnapshotPath),
    tryReadJsonWithSchema(codeFactsPath, CodeFactGraphSnapshotSchema),
    tryReadJsonFile(profilePath),
    tryReadJsonWithSchema(understandingPath, RepositoryUnderstandingPatchSchema),
    readMemoryRecordJsonl(factsPath),
    tryReadJsonWithSchema(architecturePath, ArchitectureModelPatchSchema),
    tryReadJsonWithSchema(findingsPath, ArchitectureFindingReportSchema),
    tryReadJsonWithSchema(manifestPath, ProjectionManifestSchema),
    readProjectedGraphViewRecords(root),
    readTraceRecordJsonl(root),
    readTaskProjectionRecords(root)
  ]);

  const repositoryFiles = isRecord(repositorySnapshot) && Array.isArray(repositorySnapshot.files) ? repositorySnapshot.files.length : undefined;
  const projectKinds = isRecord(profile) && Array.isArray(profile.projectKinds) ? profile.projectKinds.filter((item): item is string => typeof item === "string") : [];
  const languages = isRecord(profile) && Array.isArray(profile.languages) ? profile.languages.filter((item): item is string => typeof item === "string") : [];
  const frameworks = isRecord(profile) && Array.isArray(profile.frameworks) ? profile.frameworks.filter((item): item is string => typeof item === "string") : [];
  const pendingUnderstanding = Boolean(understanding && factRecords.length === 0);
  const status = !distinctionExists
    ? "not_initialized"
    : !repositorySnapshot
      ? "needs_intake"
      : pendingUnderstanding
        ? "understanding_pending"
        : "foundation_ready";

  const nextActions: string[] = [];
  if (!repositorySnapshot) nextActions.push("Run project intake to create repository/cache facts.");
  if (pendingUnderstanding) nextActions.push("Accept repository understanding to persist FACT memory.");
  if (!manifest || projectedViews.length === 0) nextActions.push("Generate projected graph views for architecture, code facts, findings and memory.");
  if (findings && findings.findings.length > 0) nextActions.push("Review open findings or create governed finding status patches.");
  if (!nextActions.length) nextActions.push("No pending governance review items. Use Projection Inspector or Agent Session for exploration.");

  return {
    status,
    generatedAt: new Date().toISOString(),
    artifacts: {
      repositorySnapshot: {
        exists: Boolean(repositorySnapshot),
        path: projectRelativePath(root, repositorySnapshotPath),
        files: repositoryFiles
      },
      codeFacts: {
        exists: Boolean(codeFacts),
        path: projectRelativePath(root, codeFactsPath),
        provider: codeFacts?.provider,
        files: codeFacts?.statistics.fileCount ?? 0,
        nodes: codeFacts?.statistics.nodeCount ?? 0,
        edges: codeFacts?.statistics.edgeCount ?? 0,
        warnings: codeFacts?.warnings.length ?? 0
      },
      projectProfile: {
        exists: Boolean(profile),
        path: projectRelativePath(root, profilePath),
        projectKinds,
        languages,
        frameworks
      },
      repositoryUnderstanding: {
        exists: Boolean(understanding),
        path: projectRelativePath(root, understandingPath),
        memoryPatches: understanding?.memoryPatches.length ?? 0,
        warnings: understanding?.warnings.length ?? 0,
        reviewQuestions: understanding?.reviewQuestions.length ?? 0,
        pendingAcceptance: pendingUnderstanding
      },
      factMemory: {
        exists: factRecords.length > 0,
        path: projectRelativePath(root, factsPath),
        records: factRecords.length
      },
      architectureModel: {
        exists: Boolean(architecture),
        path: projectRelativePath(root, architecturePath),
        modules: architecture?.modules.length ?? 0,
        dependencies: architecture?.dependencies.length ?? 0,
        warnings: architecture?.warnings.length ?? 0
      },
      findings: {
        exists: Boolean(findings),
        path: projectRelativePath(root, findingsPath),
        detected: findings?.findings.length ?? 0,
        detectorIds: findings?.detectorIds ?? []
      },
      projections: {
        exists: Boolean(manifest),
        path: projectRelativePath(root, manifestPath),
        manifestViews: manifest?.views.length ?? 0,
        schemaValidViews: projectedViews.length,
        freshViews: projectedViews.filter((record) => record.view.status === "fresh").length,
        failedViews: projectedViews.filter((record) => record.view.status === "failed").length,
        kinds: Array.from(new Set(projectedViews.map((record) => record.view.kind)))
      },
      traces: {
        records: traces.length
      },
      tasks: {
        records: tasks.length
      }
    },
    nextActions
  };
}

async function commandFindingAudit(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const filterFindingId = typeof args.finding === "string" ? args.finding : undefined;
  const audit = await buildFindingAudit(root, filterFindingId);
  await maybeWriteJson(args, "out", audit);
  outputJson(audit);
}

async function commandAcceptExternalResult(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const resultPath = await resolveExternalResultPath(resolvedRoot, required(args, "result"));
  const result = await readJsonWithSchema(resultPath, ExternalAgentResultSchema);
  const materializedMemorySuggestions: string[] = [];
  const materializedFindingStatusPatches: string[] = [];
  for (const suggestion of result.memorySuggestions) {
    materializedMemorySuggestions.push(await writeMemorySuggestionPatch(resolvedRoot, suggestion));
  }
  for (const patch of result.findingStatusSuggestions) {
    materializedFindingStatusPatches.push(await writeFindingStatusPatch(resolvedRoot, patch));
  }

  const traceRecord = TraceRecordSchema.parse({
    schemaVersion: "praxis.traceRecord.v1",
    id: `trace-event:external-result-accepted:${safeFilePart(result.id)}:${Date.now()}`,
    traceId: `trace:task:${result.taskId}`,
    timestamp: new Date().toISOString(),
    kind: "external_agent.result_accepted",
    target: { type: "external_agent_result", id: result.id },
    summary: `Accepted external result ${result.id} into governance review.`,
    data: {
      taskId: result.taskId,
      status: result.status,
      resultPath: projectRelativePath(resolvedRoot, resultPath),
      memorySuggestionPaths: materializedMemorySuggestions,
      findingStatusPatchPaths: materializedFindingStatusPatches
    }
  } satisfies TraceRecord);
  const tracePath = await appendTraceRecord(resolvedRoot, traceRecord);
  await appendChange(resolvedRoot, {
    title: `Accepted external result ${result.id}`,
    summary: `Accepted ${result.status} result for ${result.taskId}. Materialized ${materializedMemorySuggestions.length} memory suggestion(s) and ${materializedFindingStatusPatches.length} finding status patch(es).`,
    kind: "CANDIDATE"
  });

  outputJson({
    ok: true,
    root: resolvedRoot,
    resultId: result.id,
    resultPath: projectRelativePath(resolvedRoot, resultPath),
    memorySuggestionPaths: materializedMemorySuggestions,
    findingStatusPatchPaths: materializedFindingStatusPatches,
    tracePath
  });
}

async function commandAcceptMemorySuggestion(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const suggestionArg = typeof args.suggestion === "string" ? args.suggestion : typeof args.patch === "string" ? args.patch : "";
  if (!suggestionArg) throw new Error("Missing required --suggestion");
  const suggestionPath = await resolveMemorySuggestionPatchPath(resolvedRoot, suggestionArg);
  const suggestion = await readJsonWithSchema(suggestionPath, MemorySuggestionPatchSchema);
  const now = new Date().toISOString();
  const records = suggestion.memoryPatches.map((patch, index) =>
    confirmedMemoryRecordFromSuggestion(suggestion, patch, now, index, projectRelativePath(resolvedRoot, suggestionPath))
  );
  const memoryPath = await appendMemoryRecords(resolvedRoot, "confirmations.jsonl", records);
  const tracePath = await appendTraceRecord(
    resolvedRoot,
    TraceRecordSchema.parse({
      schemaVersion: "praxis.traceRecord.v1",
      id: `trace-event:memory-suggestion-accepted:${safeFilePart(suggestion.id)}:${Date.now()}`,
      traceId: suggestion.sourceTaskId ? `trace:task:${suggestion.sourceTaskId}` : `trace:memory:${suggestion.id}`,
      timestamp: now,
      kind: "memory_suggestion.accepted",
      target: { type: "memory", id: suggestion.id },
      summary: suggestion.summary,
      data: {
        suggestionId: suggestion.id,
        suggestionPath: projectRelativePath(resolvedRoot, suggestionPath),
        sourceResultId: suggestion.sourceResultId,
        sourceTaskId: suggestion.sourceTaskId,
        memoryPatchIds: suggestion.memoryPatches.map((patch) => patch.id),
        acceptedMemoryIds: records.map((record) => record.id)
      }
    } satisfies TraceRecord)
  );
  await appendChange(resolvedRoot, {
    title: `Accepted memory suggestion ${suggestion.id}`,
    summary: `Accepted ${records.length} memory record(s) from ${projectRelativePath(resolvedRoot, suggestionPath)}.`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: resolvedRoot,
    suggestionId: suggestion.id,
    suggestionPath: projectRelativePath(resolvedRoot, suggestionPath),
    memoryPath,
    acceptedMemoryIds: records.map((record) => record.id),
    tracePath
  });
}

async function commandAcceptFindingStatus(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const patchPath = await resolveFindingStatusPatchPath(resolvedRoot, required(args, "patch"));
  const patch = await readJsonWithSchema(patchPath, FindingStatusPatchSchema);
  const findingsPath = path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");
  const existingReport = await readJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  const now = new Date().toISOString();
  const updatedReport = applyFindingStatusPatch(existingReport, patch, now);
  await writeJson(findingsPath, updatedReport, ArchitectureFindingReportSchema);
  const findingMemoryPath = await appendFindingStatusMemory(resolvedRoot, patch, now);
  const tracePath = await appendTraceRecord(
    resolvedRoot,
    TraceRecordSchema.parse({
      schemaVersion: "praxis.traceRecord.v1",
      id: `trace-event:finding-status-accepted:${safeFilePart(patch.id)}:${Date.now()}`,
      traceId: `trace:finding:${patch.findingId}`,
      timestamp: now,
      kind: "finding.status_accepted",
      target: { type: "finding", id: patch.findingId },
      summary: patch.summary,
      data: {
        patchId: patch.id,
        patchPath: projectRelativePath(resolvedRoot, patchPath),
        status: patch.status,
        sourceResultId: patch.sourceResultId,
        sourceTaskId: patch.sourceTaskId
      }
    } satisfies TraceRecord)
  );
  const rerunReport = await rerunDetectorWithFindingStatusReconciliation(resolvedRoot, updatedReport);
  await appendChange(resolvedRoot, {
    title: `Accepted finding status ${patch.status}`,
    summary: `${patch.findingId}: ${patch.summary}`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: resolvedRoot,
    patchId: patch.id,
    findingId: patch.findingId,
    status: patch.status,
    findingsPath,
    findingMemoryPath,
    tracePath,
    detectorRerun: {
      findings: rerunReport.findings.length,
      statusPreserved: rerunReport.findings.some((finding) => finding.id === patch.findingId && finding.status === patch.status)
    }
  });
}

async function resolveExternalResultPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const reportsDir = path.join(root, ".distinction", "reports", "external-results");
  const candidates = await listJsonFiles(reportsDir);
  for (const candidate of candidates) {
    const result = await readJsonWithSchema(candidate, ExternalAgentResultSchema);
    if (result.id === value || safeFilePart(result.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`ExternalAgentResult not found: ${value}`);
}

async function resolveFindingStatusPatchPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const patchDir = path.join(root, ".distinction", "cache", "finding-status-patches");
  const candidates = await listJsonFiles(patchDir);
  for (const candidate of candidates) {
    const patch = await readJsonWithSchema(candidate, FindingStatusPatchSchema);
    if (patch.id === value || safeFilePart(patch.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`FindingStatusPatch not found: ${value}`);
}

async function resolveMemorySuggestionPatchPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const patchDir = path.join(root, ".distinction", "cache", "memory-suggestions");
  const candidates = await listJsonFiles(patchDir);
  for (const candidate of candidates) {
    const patch = await readJsonWithSchema(candidate, MemorySuggestionPatchSchema);
    if (patch.id === value || safeFilePart(patch.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`MemorySuggestionPatch not found: ${value}`);
}

async function writeMemorySuggestionPatch(root: string, suggestion: MemorySuggestionPatch): Promise<string> {
  const parsed = MemorySuggestionPatchSchema.parse(suggestion);
  const relative = `.distinction/cache/memory-suggestions/${safeFilePart(parsed.id)}.json`;
  await writeJson(path.join(root, relative), parsed, MemorySuggestionPatchSchema);
  return relative;
}

function confirmedMemoryRecordFromSuggestion(
  suggestion: MemorySuggestionPatch,
  patch: MemoryPatch,
  timestamp: string,
  index: number,
  suggestionPath: string
): MemoryRecord {
  if (patch.status === "rejected") throw new Error(`Cannot accept rejected memory patch: ${patch.id}`);
  const base = patch.record;
  return MemoryRecordSchema.parse({
    ...base,
    id: `memory:confirmed:${safeFilePart(suggestion.id)}:${index + 1}:${Date.now()}`,
    kind: "CONFIRMED",
    evidence: [
      ...base.evidence,
      {
        source: "user_confirmation",
        filePath: suggestionPath,
        excerpt: suggestion.summary
      }
    ],
    source: "user",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MemoryRecord);
}

async function appendMemoryRecords(root: string, fileName: string, records: MemoryRecord[]): Promise<string> {
  const memoryPath = path.join(root, ".distinction", "memory", fileName);
  await mkdir(path.dirname(memoryPath), { recursive: true });
  if (!records.length) {
    await appendFile(memoryPath, "", "utf8");
    return memoryPath;
  }
  const lines = records.map((record) => JSON.stringify(MemoryRecordSchema.parse(record))).join("\n");
  await appendFile(memoryPath, `${lines}\n`, "utf8");
  return memoryPath;
}

async function writeFindingStatusPatch(root: string, patch: FindingStatusPatch): Promise<string> {
  const parsed = FindingStatusPatchSchema.parse(patch);
  const relative = `.distinction/cache/finding-status-patches/${safeFilePart(parsed.id)}.json`;
  await writeJson(path.join(root, relative), parsed, FindingStatusPatchSchema);
  return relative;
}

function applyFindingStatusPatch(report: ArchitectureFindingReport, patch: FindingStatusPatch, timestamp: string): ArchitectureFindingReport {
  let matched = false;
  const findings = report.findings.map((finding) => {
    if (finding.id !== patch.findingId) return finding;
    matched = true;
    return {
      ...finding,
      status: patch.status,
      updatedAt: timestamp
    } satisfies ArchitectureFinding;
  });
  if (!matched) throw new Error(`Finding not found in architecture-findings cache: ${patch.findingId}`);
  return ArchitectureFindingReportSchema.parse({
    ...report,
    generatedAt: timestamp,
    findings
  });
}

function reconcileFindingReport(previous: ArchitectureFindingReport, detected: ArchitectureFindingReport): ArchitectureFindingReport {
  const previousById = new Map(previous.findings.map((finding) => [finding.id, finding]));
  const findings = detected.findings.map((finding) => {
    const previousFinding = previousById.get(finding.id);
    if (!previousFinding) return finding;
    if (previousFinding.status === "open") {
      return {
        ...finding,
        createdAt: previousFinding.createdAt
      };
    }
    return {
      ...finding,
      status: previousFinding.status,
      createdAt: previousFinding.createdAt,
      updatedAt: previousFinding.updatedAt
    };
  });
  return ArchitectureFindingReportSchema.parse({
    ...detected,
    findings
  });
}

async function rerunDetectorWithFindingStatusReconciliation(root: string, previousReport: ArchitectureFindingReport): Promise<ArchitectureFindingReport> {
  const modelPath = path.join(root, ".distinction", "cache", "architecture-model-patch.json");
  const model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  const detected = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
  const reconciled = reconcileFindingReport(previousReport, detected);
  await writeJson(path.join(root, ".distinction", "cache", "architecture-findings.json"), reconciled, ArchitectureFindingReportSchema);
  return reconciled;
}

async function appendFindingStatusMemory(root: string, patch: FindingStatusPatch, timestamp: string): Promise<string> {
  const record = MemoryRecordSchema.parse({
    id: `memory:finding-status:${safeFilePart(patch.id)}:${Date.now()}`,
    kind: "CONFIRMED",
    type: "finding_status",
    subject: patch.findingId,
    predicate: "status",
    object: patch.status,
    value: {
      patchId: patch.id,
      sourceResultId: patch.sourceResultId,
      sourceTaskId: patch.sourceTaskId,
      rationale: patch.rationale
    },
    summary: patch.summary,
    evidence: patch.evidence,
    source: "user",
    confidence: "high",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MemoryRecord);
  const findingsPath = path.join(root, ".distinction", "memory", "findings.jsonl");
  await mkdir(path.dirname(findingsPath), { recursive: true });
  await appendFile(findingsPath, `${JSON.stringify(record)}\n`, "utf8");
  return findingsPath;
}

async function appendTraceRecord(root: string, record: TraceRecord): Promise<string> {
  const tracePath = path.join(root, ".distinction", "memory", "traces.jsonl");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await appendFile(tracePath, `${JSON.stringify(TraceRecordSchema.parse(record))}\n`, "utf8");
  return tracePath;
}

async function readAcceptedReviewArtifactIds(root: string): Promise<{
  memorySuggestions: Map<string, string>;
  findingStatusPatches: Map<string, string>;
}> {
  const memorySuggestions = new Map<string, string>();
  const findingStatusPatches = new Map<string, string>();
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const value = safeJson(trimmed);
      if (!isRecord(value)) continue;
      const kind = typeof value.kind === "string" ? value.kind : "";
      const timestamp = typeof value.timestamp === "string" ? value.timestamp : "";
      const data = isRecord(value.data) ? value.data : {};
      if (kind === "memory_suggestion.accepted" && typeof data.suggestionId === "string") {
        memorySuggestions.set(data.suggestionId, timestamp);
      }
      if (kind === "finding.status_accepted" && typeof data.patchId === "string") {
        findingStatusPatches.set(data.patchId, timestamp);
      }
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { memorySuggestions, findingStatusPatches };
}

async function buildFindingAudit(root: string, filterFindingId?: string) {
  const findingsPath = path.join(root, ".distinction", "cache", "architecture-findings.json");
  const report = await tryReadJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  const currentById = new Map((report?.findings ?? []).map((finding) => [finding.id, finding]));
  const accepted = await readAcceptedReviewArtifactIds(root);
  const patchEntries = await readFindingStatusPatchEntries(root);
  const findingMemoryRecords = (await readMemoryRecordJsonl(path.join(root, ".distinction", "memory", "findings.jsonl"))).filter(
    (record) => record.type === "finding_status"
  );
  const traces = (await readTraceRecordJsonl(root)).filter(
    (trace) =>
      trace.kind === "finding.status_accepted" ||
      trace.target?.type === "finding" ||
      (isRecord(trace.data) && typeof trace.data.findingId === "string")
  );

  const findingIds = new Set<string>();
  for (const id of currentById.keys()) findingIds.add(id);
  for (const entry of patchEntries) findingIds.add(entry.patch.findingId);
  for (const record of findingMemoryRecords) findingIds.add(record.subject);
  for (const trace of traces) {
    if (trace.target?.type === "finding" && trace.target.id) findingIds.add(trace.target.id);
    if (isRecord(trace.data) && typeof trace.data.findingId === "string") findingIds.add(trace.data.findingId);
  }

  const findings = Array.from(findingIds)
    .filter((findingId) => !filterFindingId || findingId === filterFindingId)
    .sort()
    .map((findingId) => {
      const current = currentById.get(findingId);
      const patches = patchEntries
        .filter((entry) => entry.patch.findingId === findingId)
        .sort((left, right) => left.patch.createdAt.localeCompare(right.patch.createdAt));
      const memoryRecords = findingMemoryRecords
        .filter((record) => record.subject === findingId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const findingTraces = traces
        .filter((trace) => {
          if (trace.target?.type === "finding" && trace.target.id === findingId) return true;
          return isRecord(trace.data) && trace.data.findingId === findingId;
        })
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      const latestMemory = memoryRecords.length ? memoryRecords[memoryRecords.length - 1] : undefined;
      const latestPatch = patches.length ? patches[patches.length - 1].patch : undefined;
      const latestAcceptedStatus =
        typeof latestMemory?.object === "string" ? latestMemory.object : latestPatch?.status;
      const latestAcceptedAt = latestMemory?.createdAt ?? (latestPatch ? accepted.findingStatusPatches.get(latestPatch.id) : undefined);
      return {
        findingId,
        currentlyDetected: Boolean(current),
        detectorState: findingDetectorState(current, latestAcceptedStatus),
        currentStatus: current?.status,
        currentTitle: current?.title,
        currentSummary: current?.summary,
        severity: current?.severity,
        latestAcceptedStatus,
        latestAcceptedAt,
        history: patches.map(({ patch, path: patchPath }) => ({
          patchId: patch.id,
          patchPath,
          status: patch.status,
          summary: patch.summary,
          rationale: patch.rationale,
          sourceTaskId: patch.sourceTaskId,
          sourceResultId: patch.sourceResultId,
          createdAt: patch.createdAt,
          acceptedAt: accepted.findingStatusPatches.get(patch.id),
          evidenceCount: patch.evidence.length
        })),
        memoryRecords: memoryRecords.map((record) => ({
          id: record.id,
          status: typeof record.object === "string" ? record.object : undefined,
          summary: record.summary,
          createdAt: record.createdAt,
          patchId: isRecord(record.value) && typeof record.value.patchId === "string" ? record.value.patchId : undefined,
          sourceResultId: isRecord(record.value) && typeof record.value.sourceResultId === "string" ? record.value.sourceResultId : undefined,
          sourceTaskId: isRecord(record.value) && typeof record.value.sourceTaskId === "string" ? record.value.sourceTaskId : undefined
        })),
        traces: findingTraces.map((trace) => ({
          id: trace.id,
          kind: trace.kind,
          timestamp: trace.timestamp,
          summary: trace.summary,
          patchId: isRecord(trace.data) && typeof trace.data.patchId === "string" ? trace.data.patchId : undefined,
          status: isRecord(trace.data) && typeof trace.data.status === "string" ? trace.data.status : undefined
        }))
      };
    });

  return {
    ok: true,
    root,
    generatedAt: new Date().toISOString(),
    findingsPath: projectRelativePath(root, findingsPath),
    counts: {
      findings: findings.length,
      currentlyDetected: findings.filter((finding) => finding.currentlyDetected).length,
      historicalOnly: findings.filter((finding) => !finding.currentlyDetected).length,
      acceptedHistoryEvents: findings.reduce((total, finding) => total + finding.history.filter((entry) => entry.acceptedAt).length, 0)
    },
    findings
  };
}

function findingDetectorState(current: ArchitectureFinding | undefined, latestAcceptedStatus: string | undefined): string {
  if (!current && latestAcceptedStatus) return "disappeared_after_reconciliation";
  if (!current) return "historical_only";
  if (!latestAcceptedStatus) return "detected";
  if (current.status === "open" && latestAcceptedStatus !== "open") return "reopened";
  if (current.status === latestAcceptedStatus) return "still_detected_with_accepted_status";
  return "detected_with_new_status";
}

async function readFindingStatusPatchEntries(root: string): Promise<Array<{ path: string; patch: FindingStatusPatch }>> {
  const patchDir = path.join(root, ".distinction", "cache", "finding-status-patches");
  const files = await listJsonFiles(patchDir);
  const entries: Array<{ path: string; patch: FindingStatusPatch }> = [];
  for (const file of files) {
    entries.push({
      path: projectRelativePath(root, file),
      patch: await readJsonWithSchema(file, FindingStatusPatchSchema)
    });
  }
  return entries;
}

async function readTraceRecordJsonl(root: string): Promise<TraceRecord[]> {
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    const records: TraceRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(TraceRecordSchema.parse(JSON.parse(trimmed)));
      } catch {
        // Legacy trace records are intentionally ignored by the governed audit view.
      }
    }
    return records;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(absolute)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) files.push(absolute);
  }
  return files;
}

async function commandProjectView(args: Args, rest: string[]): Promise<void> {
  const view = rest.find((item) => !item.startsWith("--")) ?? String(args.view ?? "");
  if (
    view !== "architecture" &&
    view !== "code-facts" &&
    view !== "findings" &&
    view !== "memory" &&
    view !== "trace" &&
    view !== "tasks" &&
    view !== "context"
  ) {
    throw new Error(`Unsupported project:view target: ${view || "(missing)"}`);
  }

  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  if (view === "memory") {
    const records = await readAllMemoryRecords(resolvedRoot);
    const memoryView = ProjectedGraphViewSchema.parse(
      projectMemoryGraphView({
        root: resolvedRoot,
        records,
        sourceMemoryPaths: [
          ".distinction/memory/facts.jsonl",
          ".distinction/memory/inferences.jsonl",
          ".distinction/memory/candidates.jsonl",
          ".distinction/memory/confirmations.jsonl",
          ".distinction/memory/decisions.jsonl",
          ".distinction/memory/findings.jsonl"
        ]
      })
    );
    const memoryViewPath = path.join(resolvedRoot, ".distinction", "views", "memory", "memory-view.json");
    await writeJson(memoryViewPath, memoryView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: memoryView, path: ".distinction/views/memory/memory-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", memoryView);
    outputProjectedViewSummary(resolvedRoot, view, memoryViewPath, manifestPath, memoryView);
    return;
  }

  if (view === "trace") {
    const traces = await readTraceRecords(resolvedRoot);
    const traceView = ProjectedGraphViewSchema.parse(
      projectTraceGraphView({
        root: resolvedRoot,
        traces,
        sourceTracePaths: [".distinction/memory/traces.jsonl"]
      })
    );
    const traceViewPath = path.join(resolvedRoot, ".distinction", "views", "trace", "trace-view.json");
    await writeJson(traceViewPath, traceView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: traceView, path: ".distinction/views/trace/trace-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", traceView);
    outputProjectedViewSummary(resolvedRoot, view, traceViewPath, manifestPath, traceView);
    return;
  }

  if (view === "tasks") {
    const tasks = await readTaskProjectionRecords(resolvedRoot);
    const taskView = ProjectedGraphViewSchema.parse(
      projectTaskPlanGraphView({
        root: resolvedRoot,
        tasks,
        sourceTaskPaths: tasks.map((task) => task.path ?? ".distinction/tasks")
      })
    );
    const taskViewPath = path.join(resolvedRoot, ".distinction", "views", "project-plan", "task-view.json");
    await writeJson(taskViewPath, taskView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: taskView, path: ".distinction/views/project-plan/task-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", taskView);
    outputProjectedViewSummary(resolvedRoot, view, taskViewPath, manifestPath, taskView);
    return;
  }

  if (view === "context") {
    const packetPath =
      typeof args.packet === "string"
        ? args.packet
        : path.join(resolvedRoot, ".distinction", "cache", "context-packet.json");
    const packet = await readJsonWithSchema(packetPath, ContextPacketSchema);
    const contextView = ProjectedGraphViewSchema.parse(
      projectContextGraphView({
        packet,
        sourceCachePaths: [projectRelativePath(resolvedRoot, packetPath)]
      })
    );
    const contextViewPath = path.join(resolvedRoot, ".distinction", "views", "context", "context-view.json");
    await writeJson(contextViewPath, contextView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: contextView, path: ".distinction/views/context/context-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", contextView);
    outputProjectedViewSummary(resolvedRoot, view, contextViewPath, manifestPath, contextView);
    return;
  }

  if (view === "code-facts") {
    const codeFacts = args["code-facts"]
      ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
      : await readOrBuildCodeFacts(root, args);
    const codeFactView = ProjectedGraphViewSchema.parse(
      projectCodeFactGraphView({
        codeFacts,
        sourceCachePaths: [".distinction/cache/code-fact-graph.json"]
      })
    );
    const codeFactViewPath = path.join(resolvedRoot, ".distinction", "views", "code", "code-fact-view.json");
    await writeJson(codeFactViewPath, codeFactView, ProjectedGraphViewSchema);
    const manifest = buildProjectionManifest({
      root: resolvedRoot,
      projectedViews: [{ view: codeFactView, path: ".distinction/views/code/code-fact-view.json" }]
    });
    const manifestPath = await writeProjectionManifest(resolvedRoot, manifest);
    await maybeWriteJson(args, "out", codeFactView);
    outputJson({
      ok: true,
      root: resolvedRoot,
      view: "code-facts",
      codeFactViewPath,
      manifestPath,
      nodes: codeFactView.nodes.length,
      edges: codeFactView.edges.length,
      annotations: codeFactView.annotations.length,
      status: codeFactView.status
    });
    return;
  }

  const modelPath =
    typeof args.model === "string"
      ? args.model
      : path.join(resolvedRoot, ".distinction", "cache", "architecture-model-patch.json");
  const findingsPath =
    typeof args.findings === "string"
      ? args.findings
      : path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");

  let model: ArchitectureModelPatch;
  try {
    model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    const records = await readFactRecords(root);
    model = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(resolvedRoot, records as any[]));
    await writeJson(modelPath, model, ArchitectureModelPatchSchema);
  }

  let findings: ArchitectureFindingReport;
  try {
    findings = await readJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    findings = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
    await writeJson(findingsPath, findings, ArchitectureFindingReportSchema);
  }

  if (view === "findings") {
    const findingView = ProjectedGraphViewSchema.parse(
      projectFindingsGraphView({
        findings,
        sourceCachePaths: [projectRelativePath(resolvedRoot, findingsPath)]
      })
    );
    const findingViewPath = path.join(resolvedRoot, ".distinction", "views", "findings", "finding-view.json");
    await writeJson(findingViewPath, findingView, ProjectedGraphViewSchema);
    const manifest = buildProjectionManifest({
      root: resolvedRoot,
      projectedViews: [{ view: findingView, path: ".distinction/views/findings/finding-view.json" }]
    });
    const manifestPath = await writeProjectionManifest(resolvedRoot, manifest);
    await maybeWriteJson(args, "out", findingView);
    outputJson({
      ok: true,
      root: resolvedRoot,
      view: "findings",
      findingViewPath,
      manifestPath,
      nodes: findingView.nodes.length,
      edges: findingView.edges.length,
      annotations: findingView.annotations.length,
      status: findingView.status
    });
    return;
  }

  const dependencyView = ArchitectureDependencyViewSchema.parse(projectArchitectureDependencyView({ model, findings }));
  const architectureGraphView = ProjectedGraphViewSchema.parse(
    projectArchitectureDependencyGraphView({
      model,
      findings,
      sourceCachePaths: [projectRelativePath(resolvedRoot, modelPath), projectRelativePath(resolvedRoot, findingsPath)]
    })
  );
  const dependencyViewPath = path.join(resolvedRoot, ".distinction", "views", "architecture", "dependency-view.json");
  const architectureGraphViewPath = path.join(resolvedRoot, ".distinction", "views", "architecture", "architecture-graph-view.json");
  await writeJson(dependencyViewPath, dependencyView, ArchitectureDependencyViewSchema);
  await writeJson(architectureGraphViewPath, architectureGraphView, ProjectedGraphViewSchema);

  const manifest = buildProjectionManifest({
    root: resolvedRoot,
    dependencyView,
    dependencyViewPath: ".distinction/views/architecture/dependency-view.json",
    projectedViews: [{ view: architectureGraphView, path: ".distinction/views/architecture/architecture-graph-view.json" }],
    authority: "review_cache",
    sourceCachePaths: [projectRelativePath(resolvedRoot, modelPath), projectRelativePath(resolvedRoot, findingsPath)]
  });
  const manifestPath = path.join(resolvedRoot, ".distinction", "cache", "projection-manifest.json");
  await writeProjectionManifest(resolvedRoot, manifest);
  await maybeWriteJson(args, "out", dependencyView);

  outputJson({
    ok: true,
    root: resolvedRoot,
    view: "architecture",
    dependencyViewPath,
    architectureGraphViewPath,
    manifestPath,
    nodes: dependencyView.nodes.length,
    edges: dependencyView.edges.length,
    annotations: dependencyView.annotations.length,
    status: manifest.views[0]?.status ?? "fresh"
  });
}

function outputProjectedViewSummary(root: string, view: string, viewPath: string, manifestPath: string, projectedView: { nodes: unknown[]; edges: unknown[]; annotations: unknown[]; status: string }): void {
  outputJson({
    ok: true,
    root,
    view,
    viewPath,
    manifestPath,
    nodes: projectedView.nodes.length,
    edges: projectedView.edges.length,
    annotations: projectedView.annotations.length,
    status: projectedView.status
  });
}

async function writeProjectionManifest(root: string, next: ReturnType<typeof buildProjectionManifest>): Promise<string> {
  const manifestPath = path.join(root, ".distinction", "cache", "projection-manifest.json");
  let existing: ReturnType<typeof buildProjectionManifest> | undefined;
  try {
    existing = await readJsonWithSchema(manifestPath, ProjectionManifestSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  const nextIds = new Set(next.views.map((view) => view.id));
  const merged = ProjectionManifestSchema.parse({
    schemaVersion: "praxis.projectionManifest.v1",
    root,
    generatedAt: next.generatedAt,
    views: [...(existing?.views.filter((view) => !nextIds.has(view.id)) ?? []), ...next.views]
  });
  await writeJson(manifestPath, merged, ProjectionManifestSchema);
  return manifestPath;
}

async function commandContextPacket(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const anchor = parseGraphAnchor(required(args, "anchor"));
  const purpose = contextPacketPurposeArg(args);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root: resolvedRoot,
      anchor,
      purpose,
      createdBy: "cli",
      limit: {
        codeFacts: numberArg(args, "limit-code-facts"),
        findings: numberArg(args, "limit-findings"),
        memory: numberArg(args, "limit-memory"),
        projectionNodes: numberArg(args, "limit-projection-nodes")
      }
    })
  );
  if (args["write-cache"] === true) {
    await writeJson(path.join(resolvedRoot, ".distinction", "cache", "context-packet.json"), packet, ContextPacketSchema);
  }
  await maybeWriteJsonWithSchema(args, "out", packet, ContextPacketSchema);
  outputJson({
    ok: true,
    root: resolvedRoot,
    contextPacketId: packet.id,
    anchor: packet.anchor,
    purpose: packet.purpose,
    codeFactNodes: packet.codeFacts.nodes.length,
    codeFactEdges: packet.codeFacts.edges.length,
    findings: packet.findings.length,
    projectionViews: packet.projections.views.length,
    memoryFacts: packet.memory.facts.length,
    includedPaths: packet.scope.includedPaths,
    warnings: packet.warnings
  });
}

function contextPacketPurposeArg(args: Args) {
  const purpose = String(args.purpose ?? "explain");
  if (
    purpose === "explain" ||
    purpose === "plan" ||
    purpose === "task" ||
    purpose === "review" ||
    purpose === "governance" ||
    purpose === "external_agent"
  ) {
    return purpose;
  }
  throw new Error(`Unsupported context packet purpose: ${purpose}`);
}

async function readOrBuildCodeFacts(root: string, args: Args) {
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "code-fact-graph.json");
  if (args["rebuild-code-facts"] !== true) {
    try {
      return await readJsonWithSchema(cachePath, CodeFactGraphSnapshotSchema);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      // Build below when no cache exists.
    }
  }
  const snapshot = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );
  await writeJson(cachePath, snapshot, CodeFactGraphSnapshotSchema);
  return snapshot;
}

function codeFactProviderArg(args: Args): CodeFactProviderSource {
  const provider = String(args.provider ?? "native");
  if (provider === "native" || provider === "codegraph" || provider === "lsp" || provider === "scip") return provider;
  throw new Error(`Unsupported code fact provider: ${provider}`);
}

function projectRelativePath(root: string, filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return absolute.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
}

function numberArg(args: Args, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value for --${key}: ${value}`);
  return parsed;
}

async function readAllMemoryRecords(root: string): Promise<MemoryRecord[]> {
  const memoryDir = path.join(root, ".distinction", "memory");
  const files = [
    "facts.jsonl",
    "inferences.jsonl",
    "candidates.jsonl",
    "confirmations.jsonl",
    "decisions.jsonl",
    "findings.jsonl"
  ];
  const records: MemoryRecord[] = [];
  for (const file of files) {
    records.push(...(await readMemoryRecordJsonl(path.join(memoryDir, file))));
  }
  return records;
}

async function readMemoryRecordJsonl(filePath: string): Promise<MemoryRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => MemoryRecordSchema.parse(JSON.parse(line)));
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function readTraceRecords(root: string): Promise<TraceProjectionRecord[]> {
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => normalizeTraceProjectionRecord(JSON.parse(line), index));
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

function normalizeTraceProjectionRecord(value: unknown, index: number): TraceProjectionRecord {
  if (!isRecord(value)) return { id: `trace:${index + 1}`, summary: String(value) };
  return {
    id: stringOr(value.id, `trace:${index + 1}`),
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : undefined,
    kind: typeof value.kind === "string" ? value.kind : undefined,
    target: isRecord(value.target)
      ? {
          type: typeof value.target.type === "string" ? value.target.type : undefined,
          id: typeof value.target.id === "string" ? value.target.id : undefined
        }
      : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    data: isRecord(value.data) ? value.data : undefined
  };
}

async function readTaskProjectionRecords(root: string): Promise<TaskProjectionRecord[]> {
  const tasksDir = path.join(root, ".distinction", "tasks");
  let entries;
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const tasks: TaskProjectionRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const absolute = path.join(tasksDir, entry.name);
    const relativePath = projectRelativePath(root, absolute);
    const raw = await readFile(absolute, "utf8");
    const firstHeading = raw.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim();
    const id = entry.name.replace(/\.md$/i, "");
    tasks.push({
      id,
      title: firstHeading || id,
      path: relativePath,
      status: "open",
      summary: raw.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"))?.trim(),
      sourceFindingIds: extractFindingIds(raw)
    });
  }
  return tasks;
}

function extractFindingIds(value: string): string[] {
  return Array.from(new Set(value.match(/finding:[A-Za-z0-9._:-]+/g) ?? []));
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T> {
  return schema.parse(await readJson(filePath));
}

async function tryReadJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T | undefined> {
  try {
    return await readJsonWithSchema(filePath, schema);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

async function tryReadJsonFile(filePath: string): Promise<unknown | undefined> {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
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

async function maybeWriteJsonWithSchema<T>(args: Args, key: string, value: T, schema: JsonSchema<T>): Promise<void> {
  const out = args[key];
  if (typeof out === "string") await writeFile(out, `${JSON.stringify(schema.parse(value), null, 2)}\n`, "utf8");
}

async function writeJson<T>(filePath: string, value: T, schema?: JsonSchema<T>): Promise<void> {
  const parsed = schema ? schema.parse(value) : value;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function outputJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

void main(process.argv.slice(2));
