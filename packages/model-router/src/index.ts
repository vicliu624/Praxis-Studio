import { readFile } from "node:fs/promises";
import path from "node:path";

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
    },
    mock: {
      type: "mock"
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
  const provider = route?.provider ?? config.defaultProvider;
  return route ?? { provider, model: "mock", reasoning: false };
}

export async function loadModelConfig(projectRoot: string): Promise<ModelRouterConfig> {
  const configPath = path.join(projectRoot, ".distinction", "models.yaml");
  try {
    const content = await readFile(configPath, "utf8");
    return parseSimpleModelsYaml(content, defaultModelRouterConfig);
  } catch {
    return defaultModelRouterConfig;
  }
}

function parseSimpleModelsYaml(content: string, fallback: ModelRouterConfig): ModelRouterConfig {
  const defaultProvider = content.match(/^default_provider:\s*(\S+)/m)?.[1] ?? fallback.defaultProvider;
  const baseUrl = content.match(/base_url:\s*(\S+)/m)?.[1] ?? fallback.providers.deepseek?.baseUrl;
  const apiKeyEnv = content.match(/api_key_env:\s*(\S+)/m)?.[1] ?? fallback.providers.deepseek?.apiKeyEnv;
  return {
    ...fallback,
    defaultProvider,
    providers: {
      ...fallback.providers,
      deepseek: {
        type: "openai-compatible",
        baseUrl,
        apiKeyEnv
      }
    }
  };
}
