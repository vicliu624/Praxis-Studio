import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  type RuntimeDiagramDocumentEditResult,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";
import { AgentConversationPanel, type AgentConversationEvent } from "./AgentConversationPanel";
import { appendScopedAgentHistoryEntries, readScopedAgentHistory } from "./scopedAgentHistory";

export interface ScopedAgentScope {
  id: string;
  title: string;
  copy: string;
  modeLabel: string;
  placeholder: string;
  inputLabel: string;
  emptyTitle: string;
  emptyCopy: string;
  scopeKind?: RuntimeScopedAgentHistoryEntry["scopeKind"];
  contextTitle?: string;
  contextPath?: string;
  metadata?: string[];
}

export interface ScopedAgentSubmitResult {
  text: string;
  intent?: string;
  status?: string;
  documentEdits?: RuntimeDiagramDocumentEditResult[];
  artifactPaths?: string[];
  provider?: Record<string, unknown>;
  versionProvider?: Record<string, unknown>;
}

interface ScopedAgentPanelProps {
  projectRoot: string;
  scope: ScopedAgentScope;
  className?: string;
  textareaId: string;
  ariaLabel: string;
  compactConversation?: boolean;
  onSubmit: (
    message: string,
    conversationHistory: RuntimeScopedAgentHistoryEntry[]
  ) => Promise<ScopedAgentSubmitResult>;
  onResult?: (result: ScopedAgentSubmitResult) => void | Promise<void>;
}

export function ScopedAgentPanel({
  projectRoot,
  scope,
  className = "",
  textareaId,
  ariaLabel,
  compactConversation = true,
  onSubmit,
  onResult
}: ScopedAgentPanelProps) {
  const [history, setHistory] = useState<RuntimeScopedAgentHistoryEntry[]>([]);
  const [processEvents, setProcessEvents] = useState<AgentConversationEvent[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readScopedAgentHistory(projectRoot).then((entries) => {
      if (!cancelled) setHistory(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  const events = useMemo(() => {
    return mergeAgentConversationEvents(history.map(historyEntryToEvent), processEvents);
  }, [history, processEvents]);

  async function persistEntries(entries: RuntimeScopedAgentHistoryEntry[]) {
    const next = await appendScopedAgentHistoryEntries(projectRoot, entries);
    setHistory(next);
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);

    const runId = `scoped-agent-run:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const userEntry = createHistoryEntry(scope, "user", text);
    const historyWithUser = await persistEntries([userEntry]);
    setProcessEvents(buildRunStartEvents(runId, scope, historyWithUser.length));
    try {
      const result = await onSubmit(text, historyWithUser.slice(-40));
      setProcessEvents(buildRunResultEvents(runId, scope, result));
      const assistantEntry = createHistoryEntry(scope, "assistant", result.text, {
        intent: result.intent,
        status: result.status ?? "done"
      });
      await persistEntries([assistantEntry]);
      await onResult?.(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProcessEvents(buildRunErrorEvents(runId, scope, message));
      const assistantEntry = createHistoryEntry(scope, "assistant", `执行失败：${message}`, {
        status: "failed"
      });
      await persistEntries([assistantEntry]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className={className} aria-label={ariaLabel}>
      <div className="design-agent-heading">
        <div>
          <h2>{scope.title}</h2>
          <p>{scope.copy}</p>
        </div>
        <span className="status-pill">{scope.modeLabel}</span>
      </div>
      <AgentConversationPanel
        events={events}
        emptyTitle={scope.emptyTitle}
        emptyCopy={scope.emptyCopy}
        compact={compactConversation}
      />
      <form className="design-agent-form" onSubmit={handleSubmit}>
        <label htmlFor={textareaId}>{scope.inputLabel}</label>
        <textarea
          id={textareaId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={scope.placeholder}
        />
        <button className="primary-action" type="submit" disabled={running || !input.trim()}>
          {running ? "处理中..." : "发送"}
        </button>
      </form>
    </aside>
  );
}

function createHistoryEntry(
  scope: ScopedAgentScope,
  role: RuntimeScopedAgentHistoryEntry["role"],
  text: string,
  options?: Pick<RuntimeScopedAgentHistoryEntry, "intent" | "status">
): RuntimeScopedAgentHistoryEntry {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
    timestamp: new Date().toISOString(),
    scopeId: scope.id,
    scopeTitle: scope.title,
    scopeKind: scope.scopeKind,
    contextTitle: scope.contextTitle,
    contextPath: scope.contextPath,
    intent: options?.intent,
    status: options?.status
  };
}

function historyEntryToEvent(entry: RuntimeScopedAgentHistoryEntry): AgentConversationEvent {
  return {
    id: entry.id,
    kind: entry.role === "user" ? "user_message" : "assistant_message",
    role: entry.role,
    title: entry.role === "user" ? "You" : entry.scopeTitle,
    content: entry.text,
    status: entry.status ?? "done",
    timestamp: entry.timestamp,
    metadata: [
      entry.scopeKind,
      entry.contextTitle,
      entry.contextPath,
      entry.intent
    ].filter((item): item is string => Boolean(item))
  };
}

function buildRunStartEvents(runId: string, scope: ScopedAgentScope, historyCount: number): AgentConversationEvent[] {
  const timestamp = new Date().toISOString();
  return [
    {
      id: `${runId}:history`,
      kind: "runtime_event",
      role: "runtime",
      title: "读取共享会话历史",
      content: `已载入 ${historyCount} 条共享历史，当前请求会带入最近上下文。`,
      status: "done",
      timestamp,
      metadata: compactMetadata([scope.scopeKind, scope.contextTitle, scope.contextPath])
    },
    {
      id: `${runId}:context`,
      kind: "runtime_event",
      role: "runtime",
      title: "准备当前页面上下文",
      content: scope.contextPath
        ? `当前上下文绑定到 ${scope.contextPath}。`
        : "当前上下文绑定到项目全局或当前页面范围。",
      status: "done",
      timestamp,
      metadata: compactMetadata([scope.modeLabel])
    },
    {
      id: `${runId}:agent`,
      kind: "tool_call",
      role: "runtime",
      title: `调用 ${scope.title}`,
      content: `${scope.copy}\n\n正在把用户消息、当前上下文和共享历史交给 agent 处理。`,
      status: "running",
      timestamp,
      metadata: compactMetadata([scope.scopeKind, scope.modeLabel])
    }
  ];
}

function buildRunResultEvents(runId: string, scope: ScopedAgentScope, result: ScopedAgentSubmitResult): AgentConversationEvent[] {
  const timestamp = new Date().toISOString();
  const status = result.status === "failed" ? "failed" : "done";
  return [
    ...buildRunStartEvents(runId, scope, 0).map((event) => ({
      ...event,
      status: "done",
      content: event.id.endsWith(":history")
        ? "共享历史已作为上下文带入本次 agent 调用。"
        : event.id.endsWith(":agent")
          ? "当前上下文和共享历史已提交给 agent，agent 调用已返回。"
        : event.content
    })),
    {
      id: `${runId}:provider`,
      kind: "tool_call",
      role: "runtime",
      title: `调用 ${scope.title}`,
      content: formatProviderSummary(result.provider),
      status,
      timestamp,
      metadata: compactMetadata([
        result.intent ? `intent: ${result.intent}` : "",
        providerValue(result.provider, "provider"),
        providerValue(result.provider, "model"),
        providerValue(result.provider, "taskType"),
        providerValue(result.provider, "reasoning") ? `reasoning: ${providerValue(result.provider, "reasoning")}` : "",
        providerValue(result.provider, "reasoningEffort") ? `effort: ${providerValue(result.provider, "reasoningEffort")}` : ""
      ])
    },
    ...providerEvent(runId, "version-provider", "版本判断 Agent", result.versionProvider, timestamp),
    ...artifactEvents(runId, result.artifactPaths, timestamp),
    ...documentEditEvents(runId, result.documentEdits, timestamp),
    {
      id: `${runId}:summary`,
      kind: status === "failed" ? "error" : "final_summary",
      role: status === "failed" ? "runtime" : "assistant",
      title: status === "failed" ? "执行失败" : "完成",
      content: status === "failed"
        ? "agent 已返回失败状态，详细原因见回复。"
        : "agent 已完成本次处理，回复已写入共享会话历史。",
      status,
      timestamp,
      metadata: compactMetadata([scope.scopeKind, result.intent])
    }
  ];
}

function buildRunErrorEvents(runId: string, scope: ScopedAgentScope, message: string): AgentConversationEvent[] {
  const timestamp = new Date().toISOString();
  return [
    {
      id: `${runId}:agent`,
      kind: "tool_call",
      role: "runtime",
      title: `调用 ${scope.title}`,
      content: "agent 调用失败。",
      status: "failed",
      timestamp,
      metadata: compactMetadata([scope.scopeKind, scope.modeLabel])
    },
    {
      id: `${runId}:error`,
      kind: "error",
      role: "runtime",
      title: "错误",
      content: message,
      status: "failed",
      timestamp
    }
  ];
}

function documentEditEvents(
  runId: string,
  edits: RuntimeDiagramDocumentEditResult[] | undefined,
  timestamp: string
): AgentConversationEvent[] {
  if (!edits?.length) return [];
  return edits.map((edit, index) => ({
    id: `${runId}:edit:${index}:${edit.path}`,
    kind: "file_edit",
    role: "runtime",
    title: documentEditTitle(edit),
    content: [
      edit.message,
      edit.reason ? `原因：${edit.reason}` : "",
      typeof edit.bytesWritten === "number" ? `写入字节：${edit.bytesWritten}` : ""
    ].filter(Boolean).join("\n\n"),
    path: edit.path,
    status: edit.status === "failed" || edit.status === "rejected" ? "failed" : edit.status === "applied" ? "done" : edit.status,
    timestamp,
    metadata: compactMetadata([
      edit.operation,
      edit.changed ? "changed" : "unchanged",
      edit.status
    ])
  }));
}

function artifactEvents(runId: string, paths: string[] | undefined, timestamp: string): AgentConversationEvent[] {
  const cleanPaths = [...new Set((paths ?? []).map((path) => path.trim()).filter(Boolean))];
  if (!cleanPaths.length) return [];
  return cleanPaths.slice(0, 24).map((path, index) => ({
    id: `${runId}:artifact:${index}:${path}`,
    kind: "file_edit",
    role: "runtime",
    title: "生成或更新文档",
    content: "该文档已由本次 agent 流程生成或联动更新。",
    path,
    status: "done",
    timestamp,
    metadata: ["docs-backed memory"]
  }));
}

function providerEvent(
  runId: string,
  suffix: string,
  title: string,
  provider: Record<string, unknown> | undefined,
  timestamp: string
): AgentConversationEvent[] {
  if (!provider) return [];
  return [{
    id: `${runId}:${suffix}`,
    kind: "tool_call",
    role: "runtime",
    title,
    content: formatProviderSummary(provider),
    status: "done",
    timestamp,
    metadata: compactMetadata([
      providerValue(provider, "provider"),
      providerValue(provider, "model"),
      providerValue(provider, "taskType"),
      providerValue(provider, "reasoning") ? `reasoning: ${providerValue(provider, "reasoning")}` : "",
      providerValue(provider, "reasoningEffort") ? `effort: ${providerValue(provider, "reasoningEffort")}` : ""
    ])
  }];
}

function documentEditTitle(edit: RuntimeDiagramDocumentEditResult): string {
  if (edit.status === "failed") return "文档修改失败";
  if (edit.status === "rejected") return "文档修改被拒绝";
  if (edit.status === "skipped") return "跳过文档修改";
  return edit.changed ? "应用文档修改" : "检查文档修改";
}

function formatProviderSummary(provider: Record<string, unknown> | undefined): string {
  if (!provider) return "agent 调用完成。";
  const lines = [
    providerValue(provider, "taskType") ? `任务：${providerValue(provider, "taskType")}` : "",
    providerValue(provider, "provider") || providerValue(provider, "model")
      ? `模型：${[providerValue(provider, "provider"), providerValue(provider, "model")].filter(Boolean).join("/")}`
      : "",
    providerValue(provider, "reasoning") ? `Reasoning：${providerValue(provider, "reasoning")}` : "",
    providerValue(provider, "reasoningEffort") ? `Effort：${providerValue(provider, "reasoningEffort")}` : ""
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "agent 调用完成。";
}

function providerValue(provider: Record<string, unknown> | undefined, key: string): string {
  if (!provider) return "";
  const value = provider[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function mergeAgentConversationEvents(...groups: AgentConversationEvent[][]): AgentConversationEvent[] {
  const byId = new Map<string, AgentConversationEvent>();
  for (const event of groups.flat()) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()].sort((left, right) => timestampSortValue(left.timestamp) - timestampSortValue(right.timestamp));
}

function timestampSortValue(value: string | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compactMetadata(values: (string | undefined)[]): string[] | undefined {
  const compacted = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return compacted.length ? compacted.slice(0, 12) : undefined;
}
