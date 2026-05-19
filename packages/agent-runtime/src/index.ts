import type { DevelopmentGraph } from "@praxis/development-graph";
import { buildContext, type SelectionTarget } from "@praxis/context-builder";
import { resolveModelRoute, defaultModelRouterConfig, type ModelTaskType } from "@praxis/model-router";
import { InMemoryTraceRecorder } from "@praxis/trace-recorder";
export type RuntimeMode = "explain" | "plan" | "apply" | "execute";
export interface RuntimeRequest { mode: RuntimeMode; graph: DevelopmentGraph; target: SelectionTarget; instruction: string; taskType: ModelTaskType; }
export interface RuntimeResponse { traceId: string; mode: RuntimeMode; contextSummary: string; selectedModel: string; message: string; }
export class PraxisAgentRuntime { private traces = new InMemoryTraceRecorder(); async run(request: RuntimeRequest): Promise<RuntimeResponse> { const traceId = `trace:${Date.now()}`; const context = buildContext(request.graph, request.target); this.traces.record({ traceId, kind: "context.built", summary: context.summary, data: { target: request.target } }); const route = resolveModelRoute(defaultModelRouterConfig, request.taskType); this.traces.record({ traceId, kind: "model.called", summary: `Resolved model route: ${route.provider}/${route.model}`, data: { route } }); return { traceId, mode: request.mode, contextSummary: context.summary, selectedModel: `${route.provider}/${route.model}`, message: [`Mode: ${request.mode}`, `Instruction: ${request.instruction}`, `Context: ${context.summary}`, `Model route: ${route.provider}/${route.model}`, "Skeleton response. Wire provider adapters in the next implementation phase."].join("
") }; } }
