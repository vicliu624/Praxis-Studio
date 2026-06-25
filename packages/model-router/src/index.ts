import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ModelTaskType =
  | "project.intake.analyze"
  | "project.overview.generate"
  | "project.change_plan.generate"
  | "project.create.requirements"
  | "project.create.architecture"
  | "project.create.graph"
  | "design.discovery.use_cases"
  | "design.story_intake"
  | "design.diagram_discussion"
  | "design.version_decision"
  | "engineering.diagram_discussion"
  | "architecture.diagram_discussion"
  | "graph.node.explain"
  | "graph.edge.explain"
  | "graph.node.plan"
  | "graph.edge.plan"
  | "coding.task.generate"
  | "memory.summarize"
  | "review.finding_discussion"
  | "report.generate";

export interface ModelRoute {
  provider: string;
  model: string;
  reasoning?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs?: number;
}

export interface ModelProviderConfig {
  type: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
}

export interface ModelRouterConfig {
  defaultProvider: string;
  providers: Record<string, ModelProviderConfig>;
  routes: Record<ModelTaskType, ModelRoute>;
  agent?: {
    pi?: {
      provider?: string;
      model?: string;
      thinking?: string;
      tools?: string;
      codeGraph?: boolean;
      allowRead?: boolean;
      allowShell?: boolean;
      allowWrite?: boolean;
      timeoutMs?: number;
      reviewThinking?: string;
      reviewTimeoutMs?: number;
    };
  };
}

const legacyDefaultPiTools = "read,grep,find,ls,codegraph_query,codegraph_context,codegraph_relations,bash,edit,write";
const defaultPiTools = [
  "praxis_status",
  "praxis_context_packet",
  "praxis_projection_views",
  "praxis_code_facts",
  "praxis_findings",
  "read",
  "grep",
  "find",
  "ls",
  "codegraph_query",
  "codegraph_context",
  "codegraph_relations",
  "bash",
  "edit",
  "write"
].join(",");

const defaultPiAgentSettings = {
  provider: "deepseek",
  model: "deepseek-v4-pro",
  thinking: "high",
  tools: defaultPiTools,
  codeGraph: true,
  allowRead: true,
  allowShell: true,
  allowWrite: true,
  timeoutMs: 300_000,
  reviewThinking: "high",
  reviewTimeoutMs: 300_000
} satisfies NonNullable<NonNullable<ModelRouterConfig["agent"]>["pi"]>;

export const defaultModelRouterConfig: ModelRouterConfig = {
  defaultProvider: "deepseek",
  providers: {
    deepseek: {
      type: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY"
    }
  },
  routes: {
    "project.intake.analyze": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "project.overview.generate": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "project.change_plan.generate": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "project.create.requirements": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "project.create.architecture": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "project.create.graph": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "design.discovery.use_cases": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high", timeoutMs: 0 },
    "design.story_intake": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "design.diagram_discussion": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "design.version_decision": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "engineering.diagram_discussion": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "architecture.diagram_discussion": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "graph.node.explain": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "graph.edge.explain": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "graph.node.plan": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "graph.edge.plan": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "coding.task.generate": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "memory.summarize": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "review.finding_discussion": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "report.generate": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false }
  },
  agent: {
    pi: defaultPiAgentSettings
  }
};

export function resolveModelRoute(config: ModelRouterConfig, taskType: ModelTaskType): ModelRoute {
  const route = config.routes[taskType];
  if (!route) throw new Error(`No model route configured for task type: ${taskType}`);
  return route;
}

export async function loadModelConfig(_projectRoot: string): Promise<ModelRouterConfig> {
  return applyIdeModelSettings(defaultModelRouterConfig, await loadModelSettingsJson());
}

async function loadModelSettingsJson(): Promise<string | undefined> {
  if (process.env.PRAXIS_MODEL_SETTINGS_JSON?.trim()) return process.env.PRAXIS_MODEL_SETTINGS_JSON;
  const configuredPath = process.env.PRAXIS_MODEL_SETTINGS_PATH?.trim();
  const candidates = [
    configuredPath,
    path.join(os.homedir(), ".praxis-studio", "model-settings.json")
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  return undefined;
}

function applyIdeModelSettings(config: ModelRouterConfig, settingsJson: string | undefined): ModelRouterConfig {
  if (!settingsJson) return config;
  const settings = safeJsonRecord(settingsJson);
  if (!settings) return config;
  const defaultProvider = stringValue(settings.defaultProvider) ?? config.defaultProvider;
  const baseUrl = stringValue(settings.baseUrl) ?? config.providers.deepseek?.baseUrl;
  const legacyApiKeyEnv = stringValue(settings.apiKeyEnv);
  const apiKey = stringValue(settings.apiKey) ?? (legacyApiKeyEnv && looksLikeApiKey(legacyApiKeyEnv) ? legacyApiKeyEnv : undefined);
  const apiKeyEnv =
    legacyApiKeyEnv && !looksLikeApiKey(legacyApiKeyEnv)
      ? legacyApiKeyEnv
      : config.providers.deepseek?.apiKeyEnv;
  return {
    ...config,
    defaultProvider,
    agent: {
      ...config.agent,
      pi: {
        ...defaultPiAgentSettings,
        ...config.agent?.pi,
        provider: stringValue(settings.piProvider) ?? config.agent?.pi?.provider ?? defaultPiAgentSettings.provider,
        model: stringValue(settings.piModel) ?? config.agent?.pi?.model ?? defaultPiAgentSettings.model,
        thinking: stringValue(settings.piThinking) ?? config.agent?.pi?.thinking ?? defaultPiAgentSettings.thinking,
        tools: normalizePiToolsSetting(settings.piTools) ?? config.agent?.pi?.tools ?? defaultPiAgentSettings.tools,
        codeGraph: booleanValue(settings.piCodeGraph) ?? config.agent?.pi?.codeGraph ?? defaultPiAgentSettings.codeGraph,
        allowRead: booleanValue(settings.piAllowRead) ?? config.agent?.pi?.allowRead ?? defaultPiAgentSettings.allowRead,
        allowShell: booleanValue(settings.piAllowShell) ?? config.agent?.pi?.allowShell ?? defaultPiAgentSettings.allowShell,
        allowWrite: booleanValue(settings.piAllowWrite) ?? config.agent?.pi?.allowWrite ?? defaultPiAgentSettings.allowWrite,
        timeoutMs: numberValue(settings.piTimeoutMs) ?? config.agent?.pi?.timeoutMs ?? defaultPiAgentSettings.timeoutMs,
        reviewThinking: stringValue(settings.reviewPiThinking) ?? config.agent?.pi?.reviewThinking ?? defaultPiAgentSettings.reviewThinking,
        reviewTimeoutMs: numberValue(settings.reviewPiTimeoutMs) ?? config.agent?.pi?.reviewTimeoutMs ?? defaultPiAgentSettings.reviewTimeoutMs
      }
    },
    providers: {
      ...config.providers,
      deepseek: {
        ...(config.providers.deepseek ?? {}),
        type: "openai-compatible",
        baseUrl,
        apiKey,
        apiKeyEnv
      }
    },
    routes: {
      ...config.routes,
      "project.intake.analyze": routeWithModel(config.routes["project.intake.analyze"], settings.intakeModel),
      "design.discovery.use_cases": routeWithTimeout(
        routeWithModel(config.routes["design.discovery.use_cases"], settings.designDiscoveryModel),
        settings.designDiscoveryTimeoutMs
      ),
      "graph.node.explain": routeWithModel(config.routes["graph.node.explain"], settings.nodeExplainModel),
      "graph.edge.explain": routeWithModel(config.routes["graph.edge.explain"], settings.edgeExplainModel),
      "graph.edge.plan": routeWithModel(config.routes["graph.edge.plan"], settings.edgePlanModel),
      "coding.task.generate": routeWithModel(config.routes["coding.task.generate"], settings.codingTaskModel)
    }
  };
}

function routeWithModel(route: ModelRoute, value: unknown): ModelRoute {
  return {
    ...route,
    model: stringValue(value) ?? route.model
  };
}

function routeWithTimeout(route: ModelRoute, value: unknown): ModelRoute {
  return {
    ...route,
    timeoutMs: numberValue(value) ?? route.timeoutMs
  };
}

function normalizePiToolsSetting(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  return raw === legacyDefaultPiTools ? defaultPiAgentSettings.tools : raw;
}

function safeJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(stripJsonBom(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function stripJsonBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function looksLikeApiKey(value: string): boolean {
  return value.startsWith("sk-") || value.startsWith("sk_");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
