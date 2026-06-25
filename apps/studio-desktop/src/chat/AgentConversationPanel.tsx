import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { ReasoningBlock } from "./ReasoningBlock";

export type AgentConversationEventKind =
  | "user_message"
  | "assistant_message"
  | "runtime_event"
  | "tool_call"
  | "command_run"
  | "file_read"
  | "file_edit"
  | "validation"
  | "permission"
  | "plan"
  | "final_summary"
  | "error";

export interface AgentConversationAction {
  label: string;
  tone?: "primary" | "danger" | "neutral";
  onClick: () => void;
}

export interface AgentConversationEvent {
  id: string;
  kind: AgentConversationEventKind;
  role?: "user" | "assistant" | "system" | "runtime";
  title?: string;
  content?: string;
  detail?: string;
  status?: "pending" | "running" | "done" | "success" | "failed" | "cancelled" | string;
  timestamp?: string;
  reasoning?: {
    content: string;
    durationMs?: number;
    isStreaming?: boolean;
  };
  command?: string;
  path?: string;
  metadata?: string[];
  actions?: AgentConversationAction[];
  durationMs?: number;
}

interface AgentConversationPanelProps {
  events: AgentConversationEvent[];
  title?: string;
  emptyTitle?: string;
  emptyCopy?: string;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function AgentConversationPanel({
  events,
  title,
  emptyTitle = "No agent events yet",
  emptyCopy = "The agent conversation will appear here.",
  compact = false,
  className = "",
  ariaLabel
}: AgentConversationPanelProps) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);
  const hasRunningEvents = events.some((event) => event.status === "running");
  const [now, setNow] = useState(() => Date.now());
  const eventsWithDuration = useMemo(() => {
    return events.map((event, index) => ({
      ...event,
      durationMs: event.durationMs ?? inferredDuration(event, events[index + 1], now)
    }));
  }, [events, now]);

  useEffect(() => {
    if (shouldStickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [eventsWithDuration]);

  useEffect(() => {
    if (!hasRunningEvents) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningEvents]);

  function handleScroll() {
    const element = scrollerRef.current;
    if (!element) return;
    shouldStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 56;
  }

  return (
    <section
      ref={scrollerRef}
      className={`agent-conversation-panel${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? title ?? "Agent conversation"}
      aria-live="polite"
      onScroll={handleScroll}
    >
      {title ? <h3>{title}</h3> : null}
      {eventsWithDuration.length ? (
        eventsWithDuration.map((event) => <AgentConversationEventView event={event} key={event.id} />)
      ) : (
        <div className="agent-conversation-empty">
          <strong>{emptyTitle}</strong>
          <span>{emptyCopy}</span>
        </div>
      )}
      <div ref={endRef} />
    </section>
  );
}

function AgentConversationEventView({ event }: { event: AgentConversationEvent }) {
  const role = event.role ?? roleForKind(event.kind);
  const status = event.status ?? statusForKind(event.kind);
  const title = event.title ?? titleForKind(event.kind);
  const isUser = role === "user";
  const content = event.content ?? event.detail ?? "";

  return (
    <article className={`agent-conversation-event ${event.kind} ${role} ${status ?? ""}`}>
      <div className="agent-conversation-meta">
        <strong>{isUser ? "You" : title}</strong>
        <span>{[statusLabel(status), durationOrTimeLabel(event, status)].filter(Boolean).join(" / ")}</span>
      </div>

      {event.command ? <code className="agent-conversation-command">{event.command}</code> : null}
      {event.path ? <code className="agent-conversation-path">{event.path}</code> : null}

      {event.reasoning ? (
        <ReasoningBlock
          content={event.reasoning.content}
          durationMs={event.reasoning.durationMs}
          isStreaming={event.reasoning.isStreaming}
        />
      ) : null}

      {content ? (
        <div className="agent-conversation-content">
          {isUser ? content : <Markdown content={content} />}
        </div>
      ) : null}

      {event.metadata?.length ? (
        <div className="agent-conversation-metadata">
          {event.metadata.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}

      {event.actions?.length ? (
        <div className="agent-conversation-actions">
          {event.actions.map((action) => (
            <button
              className={action.tone === "primary" ? "primary-action" : action.tone === "danger" ? "danger-action" : ""}
              type="button"
              onClick={action.onClick}
              key={action.label}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function roleForKind(kind: AgentConversationEventKind): AgentConversationEvent["role"] {
  if (kind === "user_message") return "user";
  if (kind === "assistant_message" || kind === "final_summary") return "assistant";
  return "runtime";
}

function statusForKind(kind: AgentConversationEventKind): AgentConversationEvent["status"] | undefined {
  if (kind === "error") return "failed";
  if (kind === "final_summary") return "done";
  return undefined;
}

function titleForKind(kind: AgentConversationEventKind): string {
  if (kind === "assistant_message") return "Praxis";
  if (kind === "runtime_event") return "Runtime";
  if (kind === "tool_call") return "Tool";
  if (kind === "command_run") return "Command";
  if (kind === "file_read") return "File read";
  if (kind === "file_edit") return "File edit";
  if (kind === "validation") return "Validation";
  if (kind === "permission") return "Permission";
  if (kind === "plan") return "Plan";
  if (kind === "final_summary") return "Summary";
  if (kind === "error") return "Error";
  return "Message";
}

function statusLabel(status: AgentConversationEvent["status"]): string {
  if (!status) return "";
  if (status === "success") return "done";
  return status;
}

function durationOrTimeLabel(event: AgentConversationEvent, status: AgentConversationEvent["status"]): string {
  if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs) && event.durationMs >= 0) {
    return formatDuration(event.durationMs);
  }
  return status === "running" ? "" : formatTime(event.timestamp);
}

function inferredDuration(event: AgentConversationEvent, nextEvent: AgentConversationEvent | undefined, now: number): number | undefined {
  const start = timestampMs(event.timestamp);
  if (start === undefined) return undefined;
  if (event.status === "running") return Math.max(0, now - start);
  const end = timestampMs(nextEvent?.timestamp);
  if (end === undefined || end < start) return undefined;
  return end - start;
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = new Date(value);
  const ms = time.getTime();
  if (Number.isNaN(ms)) return undefined;
  return ms;
}

function formatTime(value: string | undefined): string {
  const ms = timestampMs(value);
  if (ms === undefined) return "";
  const time = new Date(ms);
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
