import type { DevelopmentGraph } from "@praxis/development-graph";
import type { SelectionTarget } from "@praxis/context-builder";
import type { ModelRouterConfig, ModelTaskType, ModelRoute } from "@praxis/model-router";
import type { ChatMessage, OpenAIToolCall } from "@praxis/provider-deepseek";
import type { ToolDefinition, ToolRegistry, PermissionSet, ToolRiskLevel } from "@praxis/tool-registry";
import { loadModelConfig, resolveModelRoute } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt, type PromptName } from "@praxis/prompt-registry";
import { buildContext } from "@praxis/context-builder";
import { appendTrace } from "@praxis/local-knowledge";
import { InMemoryTraceRecorder } from "@praxis/trace-recorder";
import { slugify } from "@praxis/core";
import { mkdir, readFile, stat, unlink, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

export type AgentRunStatus =
  | "running"
  | "waiting_for_permission"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTerminalReason =
  | "completed"
  | "cancelled"
  | "model_error"
  | "prompt_too_long"
  | "max_steps"
  | "aborted";

export type AgentContinueReason =
  | "next_turn"
  | "permission_denied"
  | "permission_modified"
  | "tool_budget_reached"
  | "context_compaction"
  | "reactive_compact_retry";

export type AgentStepKind =
  | "tool_call"
  | "tool_result"
  | "permission_request"
  | "context_compaction"
  | "patch_preview"
  | "command_result"
  | "model_response"
  | "error";

export interface AgentRun {
  id: string;
  projectRoot: string;
  sessionId: string;
  status: AgentRunStatus;
  target: SelectionTarget;
  mode: "explain" | "plan";
  instruction: string;
  steps: AgentStep[];
  terminalReason?: AgentTerminalReason;
  transitions: AgentTransition[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AgentTransition {
  reason: AgentContinueReason | AgentTerminalReason;
  timestamp: string;
  detail?: string;
}

export interface AgentStep {
  id: string;
  runId: string;
  sequence: number;
  timestamp: string;
  kind: AgentStepKind;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolRiskLevel?: ToolRiskLevel;
  toolStatus?: "pending" | "running" | "success" | "failed";
  toolInputSummary?: string;
  toolOutputSummary?: string;
  toolCallId?: string;
  permissionId?: string;
  permissionTitle?: string;
  permissionDescription?: string;
  permissionActionType?: string;
  permissionAffectedPaths?: string[];
  permissionOptions?: { id: string; label: string }[];
  patchFilePath?: string;
  patchDiff?: string;
  commandLine?: string;
  commandStdout?: string;
  commandStderr?: string;
  commandExitCode?: number;
  reasoningContent?: string;
  reasoningDurationMs?: number;
  modelContent?: string;
  modelStructured?: unknown;
  errorMessage?: string;
  transitionReason?: AgentContinueReason | AgentTerminalReason;
  compactedMessageCount?: number;
  compactedChars?: number;
  compactSummary?: string;
}

export interface AgentConversationMessage {
  role: "user" | "assistant" | "system" | "tool" | "permission" | "result" | "error";
  content: string;
}

export interface AgentLoopOptions {
  projectRoot: string;
  sessionId: string;
  target: SelectionTarget;
  mode: "explain" | "plan";
  instruction: string;
  graph: DevelopmentGraph;
  registry: ToolRegistry;
  conversationHistory?: AgentConversationMessage[];
  maxSteps?: number;
  maxToolCalls?: number;
  maxContextChars?: number;
  maxPermissionDenialsPerTool?: number;
  timeoutMs?: number;
  onStep?: (step: AgentStep) => void | Promise<void>;
  onPermissionRequired?: (step: AgentStep) => Promise<"approve" | "reject" | "modify">;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  run: AgentRun;
  finalMessage: string;
  finalStructured?: unknown;
  terminalReason: AgentTerminalReason;
}

export class AgentLoop {
  private traces = new InMemoryTraceRecorder();
  private stepCounter = 0;
  private abortController: AbortController;

  constructor() {
    this.abortController = new AbortController();
  }

  cancel(): void {
    this.abortController.abort();
  }

  async run(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const maxSteps = options.maxSteps ?? 120;
    const maxToolCalls = options.maxToolCalls ?? 24;
    const maxContextChars = options.maxContextChars ?? 70_000;
    const maxPermissionDenialsPerTool = options.maxPermissionDenialsPerTool ?? 3;
    const denialCounts = new Map<string, number>();
    let toolCallCount = 0;
    let hasAttemptedReactiveCompact = false;
    const slug = slugify(options.instruction.slice(0, 40)) || "run";
    const runId = `run-${Date.now()}-${slug}`;
    const traceId = `trace:${runId}`;
    const cancelFile = path.join(options.projectRoot, ".distinction", ".cancel-agent-run");

    const run: AgentRun = {
      id: runId,
      projectRoot: options.projectRoot,
      sessionId: options.sessionId,
      status: "running",
      target: options.target,
      mode: options.mode,
      instruction: options.instruction,
      steps: [],
      transitions: [],
      startedAt: new Date().toISOString()
    };

    const context = buildContext(options.graph, options.target);
    await this.recordTrace(options.projectRoot, traceId, "context.built", options.target, context.summary, { target: options.target });

    const config = await loadModelConfig(options.projectRoot);
    const taskType = this.taskTypeForTarget(options.target, options.mode);
    const route = resolveModelRoute(config, taskType);
    const providerConfig = config.providers[route.provider];
    const provider = createProvider(route.provider, {
      apiKeyEnv: providerConfig?.apiKeyEnv,
      baseUrl: providerConfig?.baseUrl
    });

    const tools = this.buildToolDefs(options.registry);
    const systemPrompt = this.buildSystemPrompt(options, context, config);

    let messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...this.openAiHistory(options.conversationHistory ?? []),
      { role: "user", content: options.instruction }
    ];

    const cancelPoll = setInterval(() => {
      void stat(cancelFile)
        .then(() => this.abortController.abort())
        .catch(() => undefined);
    }, 500);
    const externalAbort = () => this.abortController.abort(options.signal?.reason);
    if (options.signal?.aborted) externalAbort();
    else options.signal?.addEventListener("abort", externalAbort, { once: true });

    try {
      while (this.stepCounter < maxSteps) {
        // Check for cancellation file
        try {
          const cancelFile = path.join(options.projectRoot, '.distinction', '.cancel-agent-run');
          const { stat } = await import('node:fs/promises');
          await stat(cancelFile);
          // File exists — cancel the run
          run.status = "cancelled";
          run.finishedAt = new Date().toISOString();
          try { await import('node:fs/promises').then(fs => fs.unlink(cancelFile)); } catch {}
          return this.finishRun(run, "cancelled", "cancelled", "Run cancelled.");
        } catch {}
        if (options.signal?.aborted || this.abortController.signal.aborted) {
          run.status = "cancelled";
          run.finishedAt = new Date().toISOString();
          return this.finishRun(run, "cancelled", "aborted", "Run cancelled.");
        }

        const compaction = this.compactMessagesIfNeeded(messages, maxContextChars);
        if (compaction) {
          messages = compaction.messages;
          const step = this.createStep(runId, "context_compaction", {
            transitionReason: "context_compaction",
            compactedMessageCount: compaction.compactedMessageCount,
            compactedChars: compaction.compactedChars,
            compactSummary: compaction.summary
          });
          run.steps.push(step);
          this.addTransition(run, "context_compaction", `Compacted ${compaction.compactedMessageCount} older messages.`);
          if (options.onStep) await options.onStep(step);
        }

        const availableTools = toolCallCount >= maxToolCalls ? [] : tools;
        if (toolCallCount === maxToolCalls) {
          messages.push({
            role: "user",
            content: "Tool budget reached. Stop calling tools and answer now from the gathered evidence. If evidence is incomplete, say exactly what is missing."
          });
          this.addTransition(run, "tool_budget_reached", `Tool budget ${maxToolCalls} reached.`);
          toolCallCount++;
        }

        let modelResponse: Awaited<ReturnType<typeof this.callModel>>;
        try {
          modelResponse = await this.callModel(provider, route, messages, availableTools, config);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (this.abortController.signal.aborted || options.signal?.aborted) {
            await this.consumeCancelFile(cancelFile);
            return this.finishRun(run, "cancelled", "aborted", "Run cancelled.");
          }
          if (this.isPromptTooLong(errorMsg) && !hasAttemptedReactiveCompact) {
            hasAttemptedReactiveCompact = true;
            const forcedCompaction = this.forceCompactMessages(messages);
            messages = forcedCompaction.messages;
            const step = this.createStep(runId, "context_compaction", {
              transitionReason: "reactive_compact_retry",
              compactedMessageCount: forcedCompaction.compactedMessageCount,
              compactedChars: forcedCompaction.compactedChars,
              compactSummary: forcedCompaction.summary
            });
            run.steps.push(step);
            this.addTransition(run, "reactive_compact_retry", "Model reported prompt-too-long; compacted history and retried.");
            if (options.onStep) await options.onStep(step);
            continue;
          }
          throw error;
        }

        if (modelResponse.toolCalls && modelResponse.toolCalls.length > 0) {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: modelResponse.content || null,
            reasoning_content: modelResponse.reasoningContent,
            tool_calls: modelResponse.toolCalls
          };
          messages.push(assistantMsg);

          for (const tc of modelResponse.toolCalls) {
            if (options.signal?.aborted || this.abortController.signal.aborted) {
              await this.consumeCancelFile(cancelFile);
              return this.finishRun(run, "cancelled", "aborted", "Run cancelled.");
            }

            const tool = options.registry.get(tc.function.name);
            let toolInput: unknown;
            try { toolInput = JSON.parse(tc.function.arguments); }
            catch { toolInput = tc.function.arguments; }

            const callStep = this.createStep(runId, "tool_call", {
              toolName: tc.function.name,
              toolInput,
              toolRiskLevel: tool?.riskLevel ?? "read",
              toolStatus: "running",
              toolInputSummary: this.summarizeInput(tc.function.name, toolInput)
            });
            toolCallCount++;
            run.steps.push(callStep);
            if (options.onStep) await options.onStep(callStep);

            if (tool && !this.isAllowed(options.mode, tool)) {
              const permStep = this.createStep(runId, "permission_request", {
                toolName: tc.function.name,
                toolInput,
                permissionId: `perm-${Date.now()}`,
                permissionTitle: `Allow ${tc.function.name}?`,
                permissionActionType: tool.riskLevel,
                permissionDescription: this.permissionDescription(tc.function.name, tool.riskLevel, toolInput),
                permissionAffectedPaths: this.affectedPathsForTool(toolInput),
                permissionOptions: [
                  { id: "approve", label: "Approve once" },
                  { id: "reject", label: "Reject" }
                ]
              });
              run.steps.push(permStep);
              if (options.onStep) await options.onStep(permStep);

              if (options.onPermissionRequired) {
                run.status = "waiting_for_permission";
                const decision = await options.onPermissionRequired(permStep);
                if (decision === "reject" || decision === "modify") {
                  const count = (denialCounts.get(tc.function.name) ?? 0) + 1;
                  denialCounts.set(tc.function.name, count);
                  const transitionReason = decision === "modify" ? "permission_modified" : "permission_denied";
                  const resultStep = this.createStep(runId, "tool_result", {
                    toolCallId: callStep.id,
                    toolName: tc.function.name,
                    toolRiskLevel: tool.riskLevel,
                    toolStatus: "failed",
                    toolOutput: decision === "modify" ? "User requested a modified approach instead of approving this tool call." : "Permission denied by user.",
                    toolOutputSummary: decision === "modify" ? "Permission requires modification." : "Permission denied.",
                    transitionReason
                  });
                  run.steps.push(resultStep);
                  if (options.onStep) await options.onStep(resultStep);
                  messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: decision === "modify"
                      ? "Error: User asked to modify this request. Choose a safer alternative and explain what changed."
                      : "Error: Permission denied by user."
                  });
                  if (count >= maxPermissionDenialsPerTool) {
                    messages.push({
                      role: "user",
                      content: `The tool ${tc.function.name} has been denied ${count} times in this run. Do not request the same action again. Explain the blocker and propose a safer next step.`
                    });
                  }
                  this.addTransition(run, transitionReason, `${tc.function.name} ${decision}; denial count ${count}.`);
                  await this.recordTrace(options.projectRoot, traceId, "permission.denied", options.target, `${decision === "modify" ? "Modify requested for" : "Denied"} ${tc.function.name}`, { toolName: tc.function.name, decision, denialCount: count });
                  run.status = "running";
                  continue;
                }
                denialCounts.delete(tc.function.name);
                run.status = "running";
              } else {
                const resultStep = this.createStep(runId, "tool_result", {
                  toolCallId: callStep.id,
                  toolName: tc.function.name,
                  toolRiskLevel: tool.riskLevel,
                  toolStatus: "failed",
                  toolOutput: "Permission required but no handler registered.",
                  toolOutputSummary: "No permission handler."
                });
                run.steps.push(resultStep);
                if (options.onStep) await options.onStep(resultStep);
                messages.push({ role: "tool", tool_call_id: tc.id, content: "Error: Permission required but no handler registered." });
                continue;
              }
            }

            run.status = "running";
            try {
              let output: unknown;
              if (tool) {
                output = await tool.call(toolInput, {
                  projectRoot: options.projectRoot,
                  traceId,
                  mode: options.mode,
                  permissions: this.permissionsForMode(options.mode)
                });
              } else {
                output = `Unknown tool: ${tc.function.name}`;
              }

              const resultStep = this.createStep(runId, "tool_result", {
                toolCallId: callStep.id,
                toolName: tc.function.name,
                toolRiskLevel: tool?.riskLevel ?? "read",
                toolStatus: "success",
                toolOutput: output,
                toolOutputSummary: this.summarizeOutput(tc.function.name, output)
              });
              run.steps.push(resultStep);
              if (options.onStep) await options.onStep(resultStep);

              await this.recordTrace(options.projectRoot, traceId, "tool.called", options.target, `${tc.function.name} succeeded`, { toolName: tc.function.name, toolInput });

              messages.push({ role: "tool", tool_call_id: tc.id, content: typeof output === "string" ? output : JSON.stringify(output) });
              this.addTransition(run, "next_turn", `${tc.function.name} succeeded.`);
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              const resultStep = this.createStep(runId, "tool_result", {
                toolCallId: callStep.id,
                toolName: tc.function.name,
                toolRiskLevel: tool?.riskLevel ?? "read",
                toolStatus: "failed",
                toolOutput: errorMsg,
                toolOutputSummary: `Error: ${errorMsg.slice(0, 80)}`
              });
              run.steps.push(resultStep);
              if (options.onStep) await options.onStep(resultStep);
              messages.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${errorMsg}` });
              this.addTransition(run, "next_turn", `${tc.function.name} failed and returned an error observation.`);
            }
          }
          continue;
        }

        const content = modelResponse.content;
        const responseStep = this.createStep(runId, "model_response", {
          reasoningContent: modelResponse.reasoningContent,
          reasoningDurationMs: undefined,
          modelContent: content,
          modelStructured: this.safeJson(content)
        });
        run.steps.push(responseStep);
        if (options.onStep) await options.onStep(responseStep);

        await this.recordTrace(options.projectRoot, traceId, "model.called", options.target, `Model responded (${content.length} chars)`, { model: route.model });

        return this.finishRun(run, "completed", "completed", content, responseStep.modelStructured);
      }

      return this.finishRun(run, "failed", "max_steps", `Exceeded maximum steps (${maxSteps}).`);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStep = this.createStep(runId, "error", { errorMessage: errorMsg });
      run.steps.push(errorStep);
      if (options.onStep) await options.onStep(errorStep);
      return this.finishRun(run, "failed", this.isPromptTooLong(errorMsg) ? "prompt_too_long" : "model_error", errorMsg);
    } finally {
      clearInterval(cancelPoll);
      options.signal?.removeEventListener("abort", externalAbort);
    }
  }

  private finishRun(
    run: AgentRun,
    status: AgentRunStatus,
    terminalReason: AgentTerminalReason,
    finalMessage: string,
    finalStructured?: unknown
  ): AgentLoopResult {
    run.status = status;
    run.terminalReason = terminalReason;
    run.finishedAt = new Date().toISOString();
    if (status === "failed") run.error = finalMessage;
    this.addTransition(run, terminalReason);
    return { run, finalMessage, finalStructured, terminalReason };
  }

  private addTransition(run: AgentRun, reason: AgentContinueReason | AgentTerminalReason, detail?: string): void {
    run.transitions.push({
      reason,
      detail,
      timestamp: new Date().toISOString()
    });
  }

  private async consumeCancelFile(cancelFile: string): Promise<boolean> {
    try {
      await stat(cancelFile);
      await unlink(cancelFile).catch(() => undefined);
      this.abortController.abort();
      return true;
    } catch {
      return false;
    }
  }

  private compactMessagesIfNeeded(messages: ChatMessage[], maxContextChars: number) {
    const totalChars = this.messagesCharCount(messages);
    if (totalChars <= maxContextChars) return undefined;
    return this.compactMessages(messages, Math.max(8, Math.floor(messages.length / 3)));
  }

  private forceCompactMessages(messages: ChatMessage[]) {
    return this.compactMessages(messages, 8);
  }

  private compactMessages(messages: ChatMessage[], keepRecentMessages: number): {
    messages: ChatMessage[];
    compactedMessageCount: number;
    compactedChars: number;
    summary: string;
  } {
    if (messages.length <= keepRecentMessages + 2) {
      return {
        messages,
        compactedMessageCount: 0,
        compactedChars: 0,
        summary: "Conversation was already small enough; no messages were compacted."
      };
    }

    const systemMessages = messages.filter((message) => message.role === "system");
    const nonSystem = messages.filter((message) => message.role !== "system");
    let keepStart = Math.max(0, nonSystem.length - keepRecentMessages);
    while (keepStart < nonSystem.length && nonSystem[keepStart]?.role === "tool") {
      keepStart++;
    }

    const compacted = nonSystem.slice(0, keepStart);
    const recent = nonSystem.slice(keepStart);
    const summary = [
      "[Compacted conversation history]",
      "Older messages were summarized to keep the agent loop within context budget.",
      "",
      ...compacted.map((message, index) => `${index + 1}. ${message.role}: ${this.messageText(message).slice(0, 800)}`)
    ].join("\n");

    return {
      messages: [
        ...systemMessages.slice(0, 1),
        { role: "user", content: summary },
        ...recent
      ],
      compactedMessageCount: compacted.length,
      compactedChars: this.messagesCharCount(compacted),
      summary
    };
  }

  private messagesCharCount(messages: ChatMessage[]): number {
    return messages.reduce((total, message) => total + this.messageText(message).length, 0);
  }

  private messageText(message: ChatMessage): string {
    const parts = [message.content ?? ""];
    if (message.reasoning_content) parts.push(message.reasoning_content);
    if (message.tool_calls?.length) {
      parts.push(message.tool_calls.map((call) => `tool_use ${call.function.name}: ${call.function.arguments}`).join("\n"));
    }
    if (message.tool_call_id) parts.push(`tool_result:${message.tool_call_id}`);
    return parts.filter(Boolean).join("\n");
  }

  private isPromptTooLong(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes("prompt") && normalized.includes("too long")
      || normalized.includes("context") && normalized.includes("length")
      || normalized.includes("maximum context")
      || normalized.includes("context window")
      || normalized.includes("413");
  }

  private taskTypeForTarget(target: SelectionTarget, mode: "explain" | "plan"): ModelTaskType {
    if (target.type === "edge") return mode === "plan" ? "graph.edge.plan" : "graph.edge.explain";
    return mode === "plan" ? "graph.node.plan" : "graph.node.explain";
  }

  private async callModel(
    provider: ReturnType<typeof createProvider>,
    route: ModelRoute,
    messages: ChatMessage[],
    tools: import("@praxis/provider-deepseek").OpenAIToolDef[],
    _config: ModelRouterConfig
  ): Promise<{ content: string; reasoningContent?: string; toolCalls?: OpenAIToolCall[] }> {
    const routeForCall: ModelRoute = {
      ...route,
      timeoutMs: route.timeoutMs ?? 180_000
    };
    const response = await provider.call({
      route: routeForCall,
      messages,
      responseFormat: "text",
      tools: tools.length > 0 ? tools : undefined,
      toolChoice: tools.length > 0 ? "auto" : undefined,
      signal: this.abortController.signal
    });
    return { content: response.content, reasoningContent: response.reasoningContent, toolCalls: response.toolCalls };
  }

  private buildToolDefs(registry: ToolRegistry): import("@praxis/provider-deepseek").OpenAIToolDef[] {
    return registry.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} }
      }
    }));
  }

  private openAiHistory(history: AgentConversationMessage[]): ChatMessage[] {
    const maxMessages = 24;
    const maxChars = 20_000;
    const recent = history
      .filter((message) => message.content.trim().length > 0)
      .slice(-maxMessages);
    const converted: ChatMessage[] = [];
    let usedChars = 0;
    for (const message of recent.reverse()) {
      if (usedChars >= maxChars) break;
      const content = message.content.slice(0, Math.max(0, maxChars - usedChars));
      usedChars += content.length;
      converted.push(this.openAiHistoryMessage(message.role, content));
    }
    return converted.reverse();
  }

  private openAiHistoryMessage(role: AgentConversationMessage["role"], content: string): ChatMessage {
    if (role === "user" || role === "assistant" || role === "system") {
      return { role, content };
    }
    return {
      role: "user",
      content: `[previous ${role}]\n${content}`
    };
  }

  private buildSystemPrompt(options: AgentLoopOptions, context: ReturnType<typeof buildContext>, _config: ModelRouterConfig): string {
    const basePrompt = getPrompt(this.promptForTask(options)).body;
    return [
      basePrompt,
      "",
      "## Available Tools",
      "You have access to the following tools. Use them to gather information before responding.",
      "Call tools one at a time. Wait for the tool result before calling another.",
      "",
      options.registry.list().map((t) => `- **${t.name}**: ${t.description}`).join("\n"),
      "",
      "## Context",
      context.summary,
      "",
      "## Instructions",
      "1. Read relevant files and graph data before answering.",
      "2. Use a small evidence budget: prefer 4-8 highly relevant tool calls, and avoid exhaustive repository sweeps.",
      "3. For file modifications, propose patches using propose_patch first, then apply_patch after user approval.",
      "4. For commands, use run_command only when the answer depends on command output, and wait for explicit approval.",
      "5. Record important findings using write_memory only in Plan/Apply flows after permission.",
      "6. Always respond in the user's language."
    ].join("\n");
  }

  private promptForTask(options: AgentLoopOptions): PromptName {
    if (options.mode === "plan") {
      return options.target.type === "edge" ? "graph-edge-plan" : "graph-node-plan";
    }
    return options.target.type === "edge" ? "graph-edge-explain" : "graph-node-explain";
  }

  private isAllowed(mode: string, tool: ToolDefinition): boolean {
    if (tool.riskLevel === "read") return true;
    if (tool.riskLevel === "write_memory" || tool.riskLevel === "write_docs") {
      return mode === "plan" || mode === "apply" || mode === "execute";
    }
    if (tool.riskLevel === "write_source" || tool.riskLevel === "shell" || tool.riskLevel === "network") {
      return mode === "apply" || mode === "execute";
    }
    return false;
  }

  private permissionsForMode(mode: string): PermissionSet {
    return {
      allowRead: true,
      allowPlan: mode === "plan" || mode === "apply" || mode === "execute",
      allowWriteMemory: mode === "plan" || mode === "apply" || mode === "execute",
      allowWriteDocs: mode === "plan" || mode === "apply" || mode === "execute",
      allowWriteSource: mode === "apply" || mode === "execute",
      allowShell: mode === "apply" || mode === "execute",
      allowNetwork: true
    };
  }

  private createStep(runId: string, kind: AgentStepKind, fields: Partial<AgentStep> = {}): AgentStep {
    this.stepCounter++;
    return {
      id: `step-${runId}-${String(this.stepCounter).padStart(3, "0")}`,
      runId,
      sequence: this.stepCounter,
      timestamp: new Date().toISOString(),
      kind,
      ...fields
    };
  }

  private summarizeInput(toolName: string, input: unknown): string {
    if (typeof input === "string") return input.slice(0, 80);
    if (input && typeof input === "object") {
      const r = input as Record<string, unknown>;
      if (r.path) return `${toolName}: ${r.path}`;
      if (r.filePath) return `${toolName}: ${r.filePath}`;
      if (r.command) return String(r.command).slice(0, 200);
      if (r.pattern) return `${toolName}: ${r.pattern}`;
      return `${toolName}: ${JSON.stringify(r).slice(0, 80)}`;
    }
    return toolName;
  }

  private summarizeOutput(_toolName: string, output: unknown): string {
    if (typeof output === "string") return output.slice(0, 120);
    if (output && typeof output === "object") {
      const r = output as Record<string, unknown>;
      if (typeof r.summary === "string") return r.summary;
      if (typeof r.count === "number") return `${r.count} results`;
      return JSON.stringify(r).slice(0, 120);
    }
    return String(output).slice(0, 120);
  }

  private permissionDescription(toolName: string, riskLevel: ToolRiskLevel, input: unknown): string {
    const summary = this.summarizeInput(toolName, input);
    if (riskLevel === "shell") return `Tool ${toolName} wants to run a command: ${summary}`;
    if (riskLevel === "write_source") return `Tool ${toolName} wants to modify project source: ${summary}`;
    if (riskLevel === "write_memory" || riskLevel === "write_docs") return `Tool ${toolName} wants to write project memory/docs: ${summary}`;
    if (riskLevel === "network") return `Tool ${toolName} wants network access: ${summary}`;
    return `Tool ${toolName} requires ${riskLevel} access.`;
  }

  private affectedPathsForTool(input: unknown): string[] {
    if (!input || typeof input !== "object") return [];
    const record = input as Record<string, unknown>;
    return [record.path, record.filePath, record.directory]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  private safeJson(content: string): unknown {
    try { return JSON.parse(content); } catch { return undefined; }
  }

  private async recordTrace(
    projectRoot: string,
    traceId: string,
    kind: string,
    target: SelectionTarget,
    summary: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const traceTarget = target.type === "subgraph"
      ? { type: "subgraph" as const }
      : { type: target.type as "node" | "edge", id: (target as { id: string }).id };
    const event = this.traces.record({
      traceId,
      kind: kind as any,
      target: traceTarget,
      summary,
      data
    });
    await appendTrace(projectRoot, event).catch(() => undefined);
  }
}

export function getRunDir(projectRoot: string): string {
  return path.join(projectRoot, ".distinction", "runs");
}

export async function persistRun(projectRoot: string, run: AgentRun): Promise<string> {
  const dir = getRunDir(projectRoot);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${run.id}.json`);
  await writeFile(filePath, JSON.stringify(run, null, 2), "utf8");
  const index = path.join(dir, "runs.jsonl");
  await appendFile(index, JSON.stringify({
    id: run.id,
    sessionId: run.sessionId,
    status: run.status,
    instruction: run.instruction.slice(0, 120),
    stepCount: run.steps.length,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt
  }) + "\n", "utf8");
  return filePath;
}

export async function loadRun(projectRoot: string, runId: string): Promise<AgentRun | null> {
  const filePath = path.join(getRunDir(projectRoot), `${runId}.json`);
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as AgentRun;
  } catch {
    return null;
  }
}

export async function loadRunsForSession(projectRoot: string, sessionId: string): Promise<AgentRun[]> {
  const dir = getRunDir(projectRoot);
  const index = path.join(dir, "runs.jsonl");
  try {
    const content = await readFile(index, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines.map((l) => {
      try { return JSON.parse(l) as { id: string; sessionId: string }; } catch { return null; }
    }).filter(Boolean);
    const sessionRuns = entries.filter((e) => e && e.sessionId === sessionId);
    const runs: AgentRun[] = [];
    for (const entry of sessionRuns) {
      const run = await loadRun(projectRoot, entry!.id);
      if (run) runs.push(run);
    }
    return runs;
  } catch {
    return [];
  }
}
