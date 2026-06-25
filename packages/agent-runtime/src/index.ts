import type { DevelopmentGraph } from "@praxis/development-graph";
import { buildContext, type SelectionTarget } from "@praxis/context-builder";
import { loadModelConfig, resolveModelRoute, type ModelTaskType } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt, type PromptName } from "@praxis/prompt-registry";
import { isGraphPlan } from "@praxis/plan-model";
import { appendTrace } from "@praxis/local-knowledge";
import { InMemoryTraceRecorder } from "@praxis/trace-recorder";

export type RuntimeMode = "explain" | "plan" | "apply" | "execute";

export interface RuntimeRequest {
  mode: RuntimeMode;
  projectRoot: string;
  graph: DevelopmentGraph;
  target: SelectionTarget;
  instruction: string;
  taskType: ModelTaskType;
}

export interface RuntimeResponse {
  traceId: string;
  mode: RuntimeMode;
  contextSummary: string;
  selectedModel: string;
  message: string;
  structured?: unknown;
}

export class PraxisAgentRuntime {
  private traces = new InMemoryTraceRecorder();

  async run(request: RuntimeRequest): Promise<RuntimeResponse> {
    if (request.mode === "plan") return this.planForTarget(request);
    return this.explainTarget(request);
  }

  async explainTarget(request: RuntimeRequest): Promise<RuntimeResponse> {
    const traceId = `trace:${Date.now()}`;
    const context = buildContext(request.graph, request.target);
    await this.record(request.projectRoot, {
      traceId,
      kind: "context.built",
      target: targetForTrace(request.target),
      summary: context.summary,
      data: { target: request.target }
    });
    const config = await loadModelConfig(request.projectRoot);
    const route = resolveModelRoute(config, request.taskType);
    const providerConfig = config.providers[route.provider];
    const provider = createProvider(route.provider, {
      apiKey: providerConfig?.apiKey,
      apiKeyEnv: providerConfig?.apiKeyEnv,
      baseUrl: providerConfig?.baseUrl
    });
    const prompt = getPrompt(promptForTask(request.taskType));
    const modelResponse = await provider.call({
      route,
      responseFormat: "json",
      messages: [
        { role: "system", content: prompt.body },
        { role: "user", content: JSON.stringify({ instruction: request.instruction, context }, null, 2) }
      ]
    });
    await this.record(request.projectRoot, {
      traceId,
      kind: "model.called",
      target: targetForTrace(request.target),
      summary: `Called ${modelResponse.provider}/${modelResponse.model}`,
      data: { provider: modelResponse.provider, model: modelResponse.model }
    });
    return {
      traceId,
      mode: "explain",
      contextSummary: context.summary,
      selectedModel: `${modelResponse.provider}/${modelResponse.model}`,
      message: modelResponse.content,
      structured: safeJson(modelResponse.content)
    };
  }

  async planForTarget(request: RuntimeRequest): Promise<RuntimeResponse> {
    const traceId = `trace:${Date.now()}`;
    const context = buildContext(request.graph, request.target);
    await this.record(request.projectRoot, {
      traceId,
      kind: "context.built",
      target: targetForTrace(request.target),
      summary: context.summary,
      data: { target: request.target }
    });

    const config = await loadModelConfig(request.projectRoot);
    const planTaskType: ModelTaskType = request.target.type === "edge" ? "graph.edge.plan" : "graph.node.plan";
    const route = resolveModelRoute(config, planTaskType);
    const providerConfig = config.providers[route.provider];
    const provider = createProvider(route.provider, {
      apiKey: providerConfig?.apiKey,
      apiKeyEnv: providerConfig?.apiKeyEnv,
      baseUrl: providerConfig?.baseUrl
    });
    const prompt = getPrompt(promptForTask(planTaskType));
    const modelResponse = await provider.call({
      route,
      responseFormat: "json",
      messages: [
        { role: "system", content: prompt.body },
        { role: "user", content: JSON.stringify({ instruction: request.instruction, context }, null, 2) }
      ]
    });

    await this.record(request.projectRoot, {
      traceId,
      kind: "model.called",
      target: targetForTrace(request.target),
      summary: `Called ${modelResponse.provider}/${modelResponse.model}`,
      data: { provider: modelResponse.provider, model: modelResponse.model, taskType: planTaskType }
    });

    const parsed = safeJson(modelResponse.content);
    if (!isGraphPlan(parsed)) {
      throw new Error(`Model response for ${planTaskType} did not match GraphPlan schema.`);
    }
    const plan = parsed;
    await this.record(request.projectRoot, {
      traceId,
      kind: "plan.generated",
      target: targetForTrace(request.target),
      summary: plan.summary,
      data: { plan }
    });
    return {
      traceId,
      mode: "plan",
      contextSummary: context.summary,
      selectedModel: `${modelResponse.provider}/${modelResponse.model}`,
      message: JSON.stringify(plan, null, 2),
      structured: plan
    };
  }

  async limitedApply(): Promise<RuntimeResponse> {
    throw new Error("limitedApply is reserved for .distinction/docs/tasks/new project writes in v0.1.");
  }

  private async record(projectRoot: string, event: Parameters<InMemoryTraceRecorder["record"]>[0]): Promise<void> {
    const recorded = this.traces.record(event);
    await appendTrace(projectRoot, recorded).catch(() => undefined);
  }
}

function promptForTask(taskType: ModelTaskType): PromptName {
  if (taskType === "graph.edge.plan") return "graph-edge-plan";
  if (taskType === "graph.node.plan") return "graph-node-plan";
  if (taskType === "graph.edge.explain") return "graph-edge-explain";
  if (taskType === "graph.node.explain") return "graph-node-explain";
  if (taskType === "coding.task.generate") return "coding-task-generate";
  if (taskType === "project.create.requirements") return "project-create-requirements";
  if (taskType === "project.create.architecture") return "project-create-architecture";
  if (taskType === "project.create.graph") return "project-create-graph";
  if (taskType === "design.discovery.use_cases") return "design-discovery-use-cases";
  if (taskType === "design.story_intake") return "design-story-intake";
  if (taskType === "design.diagram_discussion") return "design-diagram-discussion";
  if (taskType === "design.version_decision") return "design-version-decision";
  if (taskType === "memory.summarize") return "memory-summarize";
  return "project-intake-analyze";
}

function targetForTrace(target: SelectionTarget) {
  if (target.type === "subgraph") return { type: "subgraph" as const };
  return { type: target.type, id: target.id };
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}
