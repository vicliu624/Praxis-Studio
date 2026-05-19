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

export async function openProjectDialog(): Promise<string | null> {
  try {
    const selected = await open({ directory: true, multiple: false, title: "Open Existing Project" });
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

export async function generateTask(root: string, plan: unknown): Promise<string> {
  return invoke<string>("generate_task_from_plan", {
    projectRoot: root,
    planJson: JSON.stringify(plan)
  });
}

export async function readGraph(root: string): Promise<RuntimeGraph> {
  const [nodes, edges] = await Promise.all([
    invoke<string>("read_file", { path: `${root}/.distinction/graph/nodes.json` }),
    invoke<string>("read_file", { path: `${root}/.distinction/graph/edges.json` })
  ]);
  return {
    id: "graph:local",
    title: "Development Graph",
    rootPath: root,
    nodes: JSON.parse(nodes) as RuntimeNode[],
    edges: JSON.parse(edges) as RuntimeEdge[]
  };
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
  await invoke<void>("write_file", {
    path: `${projectRoot}/.distinction/models.yaml`,
    content: renderModelsYaml(settings)
  });
}
