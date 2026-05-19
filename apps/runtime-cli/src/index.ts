#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanRepository } from "@praxis/repository-scanner";
import { profileProject } from "@praxis/project-profiler";
import { generateDevelopmentGraphCandidate } from "@praxis/graph-generator";
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
import type { GraphPlan, PlanAction } from "@praxis/plan-model";
import { loadModelConfig, resolveModelRoute } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt } from "@praxis/prompt-registry";

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

async function commandGenerateTask(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const plan = (await readJson(required(args, "plan"))) as GraphPlan;
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
  outputJson({ ok: true, taskPath, task });
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

  outputJson({ ok: true, resultPath, progressPlan });
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
