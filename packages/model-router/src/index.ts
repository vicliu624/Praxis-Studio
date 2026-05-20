export type ModelTaskType =
  | "project.intake.analyze"
  | "project.create.requirements"
  | "project.create.architecture"
  | "project.create.graph"
  | "graph.node.explain"
  | "graph.edge.explain"
  | "graph.node.plan"
  | "graph.edge.plan"
  | "coding.task.generate"
  | "memory.summarize"
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
  apiKeyEnv?: string;
}

export interface ModelRouterConfig {
  defaultProvider: string;
  providers: Record<string, ModelProviderConfig>;
  routes: Record<ModelTaskType, ModelRoute>;
}

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
    "project.create.requirements": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "project.create.architecture": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "project.create.graph": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "graph.node.explain": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "graph.edge.explain": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "medium" },
    "graph.node.plan": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "graph.edge.plan": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "coding.task.generate": { provider: "deepseek", model: "deepseek-v4-pro", reasoning: true, reasoningEffort: "high" },
    "memory.summarize": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false },
    "report.generate": { provider: "deepseek", model: "deepseek-v4-flash", reasoning: false }
  }
};

export function resolveModelRoute(config: ModelRouterConfig, taskType: ModelTaskType): ModelRoute {
  const route = config.routes[taskType];
  if (!route) throw new Error(`No model route configured for task type: ${taskType}`);
  return route;
}

export async function loadModelConfig(_projectRoot: string): Promise<ModelRouterConfig> {
  return applyIdeModelSettings(defaultModelRouterConfig, process.env.PRAXIS_MODEL_SETTINGS_JSON);
}

function applyIdeModelSettings(config: ModelRouterConfig, settingsJson: string | undefined): ModelRouterConfig {
  if (!settingsJson) return config;
  const settings = safeJsonRecord(settingsJson);
  if (!settings) return config;
  const defaultProvider = stringValue(settings.defaultProvider) ?? config.defaultProvider;
  const baseUrl = stringValue(settings.baseUrl) ?? config.providers.deepseek?.baseUrl;
  return {
    ...config,
    defaultProvider,
    providers: {
      ...config.providers,
      deepseek: {
        ...(config.providers.deepseek ?? {}),
        type: "openai-compatible",
        baseUrl
      }
    },
    routes: {
      ...config.routes,
      "project.intake.analyze": routeWithModel(config.routes["project.intake.analyze"], settings.intakeModel),
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

function safeJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
