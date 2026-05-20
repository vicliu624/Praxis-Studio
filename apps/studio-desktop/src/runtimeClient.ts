import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface RuntimeIntakeResult {
  ok: boolean;
  snapshot: unknown;
  profile: {
    moduleCandidates: { id: string; title: string; path: string; kind: string; confidence: string }[];
    projectKinds: string[];
    languages: string[];
    frameworks: string[];
    warnings?: string[];
  };
  candidate: {
    graph: RuntimeGraph;
    warnings: { id: string; severity: string; summary: string; targetId?: string }[];
    unresolvedQuestions: { id: string; question: string; targetId?: string }[];
  };
}

export interface RuntimeGraph {
  id: string;
  title: string;
  rootPath?: string;
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
}

export interface RuntimeNode {
  id: string;
  kind: string;
  title: string;
  description?: string;
  progress: number;
  status: string;
  confidence: string;
  knowledgeKind: string;
}

export interface RuntimeEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  title?: string;
  description?: string;
  progress: number;
  status: string;
  riskLevel: string;
  blockedReason?: string;
  confidence: string;
  knowledgeKind: string;
}

export interface RuntimeChatResult {
  traceId: string;
  mode: "explain" | "plan";
  contextSummary: string;
  selectedModel: string;
  message: string;
  structured?: unknown;
}

export interface RuntimePlanAction {
  id: string;
  type: string;
  title: string;
  description: string;
  targetNodeIds: string[];
  targetEdgeIds: string[];
  data?: Record<string, unknown>;
}

export interface RuntimeGraphPlan {
  id: string;
  summary: string;
  missingGluePoints: { title: string; reason: string; kind: string }[];
  actions: RuntimePlanAction[];
  codingTasks: { title: string; allowedPaths: string[]; forbiddenPaths: string[]; acceptanceCriteria: string[] }[];
  questions: string[];
}

export type RuntimeChatTarget =
  | { type: "project" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

export interface RuntimeChatSession {
  id: string;
  projectRoot: string;
  title: string;
  target: RuntimeChatTarget;
  mode: "explain" | "plan" | "apply" | "task";
  modelRoute?: string;
  createdAt: string;
  updatedAt: string;
}

export type RuntimeChatIntent = "explain" | "plan" | "generate_task" | "apply" | "import_result";

export type RuntimeChatMessageRole = "user" | "assistant" | "system" | "tool" | "permission" | "result" | "error";

export interface RuntimeToolCallView {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  inputSummary: string;
  outputSummary?: string;
  riskLevel: "read" | "plan" | "write_memory" | "write_docs" | "write_source" | "shell" | "network";
}

export interface RuntimePermissionRequestView {
  id: string;
  title: string;
  description: string;
  actionType: "apply_plan" | "write_memory" | "write_graph" | "generate_task" | "import_task_result" | "run_external_agent";
  affectedPaths: string[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  options: { id: "approve" | "reject" | "modify"; label: string }[];
}

export interface RuntimeCodingAgentTask {
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
  expectedOutput: Record<string, boolean>;
}

export interface RuntimeChatMessage {
  id: string;
  sessionId: string;
  role: RuntimeChatMessageRole;
  createdAt: string;
  content: string;
  status?: "streaming" | "done" | "failed" | "cancelled";
  structured?: unknown;
  toolCall?: RuntimeToolCallView;
  permissionRequest?: RuntimePermissionRequestView;
  plan?: RuntimeGraphPlan;
  task?: RuntimeCodingAgentTask;
  traceIds?: string[];
}

export interface RuntimeChatTranscriptResult {
  ok: boolean;
  sessionId?: string;
  session: RuntimeChatSession;
  messages: RuntimeChatMessage[];
  appendedMessages?: RuntimeChatMessage[];
  pendingPermission?: RuntimePermissionRequestView;
  plan?: RuntimeGraphPlan;
}

export interface RecentProject {
  root: string;
  name: string;
  lastOpenedAt: string;
}

export interface NewProjectPlan {
  projectName: string;
  productIdea: string;
  projectKind: string;
  requirements: { id: string; title: string; description: string }[];
  architecture: { id: string; title: string; responsibility: string }[];
  graph: RuntimeGraph;
  files: { path: string; content: string }[];
  assumptions: { id: string; summary: string }[];
  questions: { id: string; question: string }[];
}

export interface ModelSettings {
  defaultProvider: string;
  baseUrl: string;
  apiKeyEnv: string;
  intakeModel: string;
  nodeExplainModel: string;
  edgeExplainModel: string;
  edgePlanModel: string;
  codingTaskModel: string;
}

export const defaultModelSettings: ModelSettings = {
  defaultProvider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  intakeModel: "deepseek-v4-pro",
  nodeExplainModel: "deepseek-v4-flash",
  edgeExplainModel: "deepseek-v4-pro",
  edgePlanModel: "deepseek-v4-pro",
  codingTaskModel: "deepseek-v4-pro"
};

export async function runRuntimeCommand(command: string, args: string[]): Promise<string> {
  return invoke<string>("run_runtime_command", { command, args });
}

export async function openProjectDialog(title = "Open Existing Project"): Promise<string | null> {
  try {
    const selected = await open({ directory: true, multiple: false, title });
    if (typeof selected === "string") return selected;
    if (Array.isArray(selected)) return selected[0] ?? null;
    return null;
  } catch {
    const selected = await invoke<string | null>("open_project_dialog").catch(() => null);
    return selected;
  }
}

export async function runProjectIntake(root: string): Promise<RuntimeIntakeResult> {
  const stdout = await runRuntimeCommand("intake", ["--root", root]);
  return JSON.parse(stdout) as RuntimeIntakeResult;
}

export async function acceptGraph(root: string, candidate: RuntimeIntakeResult["candidate"]): Promise<void> {
  await invoke<string>("initialize_project_memory", {
    projectRoot: root,
    candidateJson: JSON.stringify(candidate)
  });
}

export async function runChat(root: string, targetId: string, mode: "explain" | "plan", instruction: string): Promise<RuntimeChatResult> {
  const stdout = await runRuntimeCommand("chat", ["--project-root", root, "--target", targetId, "--mode", mode, "--instruction", instruction]);
  return JSON.parse(stdout) as RuntimeChatResult;
}

export async function createChatSession(root: string, target: RuntimeChatTarget): Promise<RuntimeChatTranscriptResult> {
  const stdout = await runRuntimeCommand("chat-session-create", ["--project-root", root, ...chatTargetArgs(target)]);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function readChatSession(root: string, sessionId: string): Promise<RuntimeChatTranscriptResult> {
  const stdout = await runRuntimeCommand("chat-session-read", ["--project-root", root, "--session", sessionId]);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function sendChatMessage(
  root: string,
  sessionId: string,
  target: RuntimeChatTarget,
  message: string,
  intent?: RuntimeChatIntent,
  actionIds?: string[]
): Promise<RuntimeChatTranscriptResult> {
  const args = ["--project-root", root, "--session", sessionId, ...chatTargetArgs(target), "--message", message];
  if (intent) args.push("--intent", intent);
  if (actionIds?.length) args.push("--actions", actionIds.join(","));
  const stdout = await runRuntimeCommand("chat-send", args);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function respondToChatPermission(
  root: string,
  sessionId: string,
  target: RuntimeChatTarget,
  permissionId: string,
  approval: "approve" | "reject" | "modify",
  actionIds: string[] = []
): Promise<RuntimeChatTranscriptResult> {
  const args = [
    "--project-root",
    root,
    "--session",
    sessionId,
    ...chatTargetArgs(target),
    "--intent",
    "apply",
    "--approval",
    approval,
    "--permission-id",
    permissionId,
    "--message",
    approval === "approve" ? "Approve selected plan actions." : approval === "reject" ? "Reject this Apply request." : "Modify this Apply request."
  ];
  if (actionIds.length) args.push("--actions", actionIds.join(","));
  const stdout = await runRuntimeCommand("chat-send", args);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function generateTask(root: string, plan: unknown): Promise<string> {
  return invoke<string>("generate_task_from_plan", {
    projectRoot: root,
    planJson: JSON.stringify(plan)
  });
}

export async function applyPlan(root: string, plan: unknown, actionIds: string[]): Promise<unknown> {
  const stdout = await invoke<string>("apply_plan_actions", {
    projectRoot: root,
    planJson: JSON.stringify(plan),
    actionIds
  });
  return JSON.parse(stdout) as unknown;
}

export async function importTaskResult(root: string, result: unknown): Promise<unknown> {
  const stdout = await invoke<string>("import_task_result", {
    projectRoot: root,
    resultJson: typeof result === "string" ? result : JSON.stringify(result)
  });
  return JSON.parse(stdout) as unknown;
}

export async function createProjectPlan(root: string, name: string, intent: string, kind: string): Promise<NewProjectPlan> {
  const stdout = await runRuntimeCommand("create-project-plan", ["--root", root || ".", "--name", name, "--intent", intent, "--kind", kind]);
  const payload = JSON.parse(stdout) as { plan: NewProjectPlan };
  return payload.plan;
}

export async function createProjectFromPlan(root: string, plan: NewProjectPlan): Promise<unknown> {
  const stdout = await invoke<string>("create_project_from_plan", {
    projectRoot: root,
    planJson: JSON.stringify(plan)
  });
  return JSON.parse(stdout) as unknown;
}

export async function readRecentProjects(): Promise<RecentProject[]> {
  const stdout = await invoke<string>("read_recent_projects");
  return JSON.parse(stdout) as RecentProject[];
}

export async function recordRecentProject(root: string): Promise<RecentProject[]> {
  const stdout = await invoke<string>("write_recent_project", { projectRoot: root });
  return JSON.parse(stdout) as RecentProject[];
}

export async function readGraph(root: string): Promise<RuntimeGraph> {
  const [nodes, edges] = await Promise.all([
    invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/nodes.json" }),
    invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/edges.json" })
  ]);
  return {
    id: "graph:local",
    title: "Development Graph",
    rootPath: root,
    nodes: JSON.parse(nodes) as RuntimeNode[],
    edges: JSON.parse(edges) as RuntimeEdge[]
  };
}

function chatTargetArgs(target: RuntimeChatTarget): string[] {
  if (target.type === "project") return ["--target-type", "project"];
  if (target.type === "node" || target.type === "edge") return ["--target-type", target.type, "--target-id", target.id];
  return ["--target-json", JSON.stringify(target)];
}

export function renderModelsYaml(settings: ModelSettings): string {
  return [
    `default_provider: ${settings.defaultProvider}`,
    "",
    "providers:",
    "  deepseek:",
    "    type: openai-compatible",
    `    base_url: ${settings.baseUrl}`,
    `    api_key_env: ${settings.apiKeyEnv}`,
    "",
    "routes:",
    "  project.intake.analyze:",
    "    provider: deepseek",
    `    model: ${settings.intakeModel}`,
    "    reasoning: true",
    "    reasoning_effort: medium",
    "",
    "  graph.node.explain:",
    "    provider: deepseek",
    `    model: ${settings.nodeExplainModel}`,
    "    reasoning: false",
    "",
    "  graph.edge.explain:",
    "    provider: deepseek",
    `    model: ${settings.edgeExplainModel}`,
    "    reasoning: true",
    "    reasoning_effort: medium",
    "",
    "  graph.edge.plan:",
    "    provider: deepseek",
    `    model: ${settings.edgePlanModel}`,
    "    reasoning: true",
    "    reasoning_effort: high",
    "",
    "  coding.task.generate:",
    "    provider: deepseek",
    `    model: ${settings.codingTaskModel}`,
    "    reasoning: true",
    "    reasoning_effort: high",
    ""
  ].join("\n");
}

export async function saveProjectModelSettings(projectRoot: string, settings: ModelSettings): Promise<void> {
  await invoke<void>("write_project_distinction_file", {
    projectRoot,
    relativePath: ".distinction/models.yaml",
    content: renderModelsYaml(settings)
  });
}
