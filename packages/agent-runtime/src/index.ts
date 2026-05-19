import type { DevelopmentGraph } from "@praxis/development-graph";
import { buildContext, type SelectionTarget } from "@praxis/context-builder";
import { loadModelConfig, resolveModelRoute, type ModelTaskType } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt, type PromptName } from "@praxis/prompt-registry";
import type { GraphPlan } from "@praxis/plan-model";
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
    const provider = createProvider(route.provider, { apiKeyEnv: providerConfig?.apiKeyEnv, baseUrl: providerConfig?.baseUrl });
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
      data: { usedMock: modelResponse.usedMock }
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
    const explanation = await this.explainTarget({ ...request, mode: "explain" });
    const plan = fallbackPlan(request, explanation.contextSummary);
    await this.record(request.projectRoot, {
      traceId: explanation.traceId,
      kind: "plan.generated",
      target: targetForTrace(request.target),
      summary: plan.summary,
      data: { plan }
    });
    return {
      ...explanation,
      mode: "plan",
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
  if (taskType === "memory.summarize") return "memory-summarize";
  return "project-intake-analyze";
}

function fallbackPlan(request: RuntimeRequest, contextSummary: string): GraphPlan {
  const targetEdgeIds = request.target.type === "edge" ? [request.target.id] : [];
  const targetNodeIds = request.target.type === "node" ? [request.target.id] : [];
  return {
    id: `plan:${Date.now()}`,
    summary: `Plan for ${contextSummary}`,
    missingGluePoints: [
      {
        title: "Confirm graph evidence",
        reason: "Generated plans must preserve FACT / CANDIDATE / INFERENCE boundaries.",
        kind: "INFERENCE"
      },
      {
        title: "Generate controlled coding task",
        reason: "v0.1 delegates source edits to external coding agents through TASK.md.",
        kind: "CANDIDATE"
      }
    ],
    actions: [
      {
        id: `action:${Date.now()}:update-edge`,
        type: "update_edge",
        title: "Update selected edge candidate",
        description: "Record missing glue points and blocked reason on the selected edge after user confirmation.",
        targetNodeIds,
        targetEdgeIds
      },
      {
        id: `action:${Date.now()}:memory`,
        type: "create_memory_event",
        title: "Create candidate memory event",
        description: "Record this plan as candidate memory before any Apply action.",
        targetNodeIds,
        targetEdgeIds
      },
      {
        id: `action:${Date.now()}:task`,
        type: "create_task",
        title: "Create controlled coding task",
        description: request.instruction,
        targetNodeIds,
        targetEdgeIds
      }
    ],
    codingTasks: [
      {
        title: request.instruction || "Implement controlled task",
        allowedPaths: [".distinction", "packages"],
        forbiddenPaths: ["apps/studio-desktop/src"],
        acceptanceCriteria: ["Return patch summary", "Return changed files", "Return test result", "Return progress and memory suggestions"]
      }
    ],
    questions: ["Which actions should be confirmed before Apply?"]
  };
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
