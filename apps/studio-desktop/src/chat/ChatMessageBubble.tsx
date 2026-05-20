import type { RuntimeChatMessage } from "../runtimeClient";

interface ChatMessageBubbleProps {
  message: RuntimeChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const applied = appliedSummary(message.structured);
  return (
    <article className={`chat-message ${message.role}`}>
      <div className="chat-message-meta">
        <strong>{roleLabel(message.role)}</strong>
        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="chat-message-content">{message.content}</div>
      {applied ? (
        <div className="result-summary">
          <span>{applied}</span>
        </div>
      ) : null}
      {message.traceIds?.length ? <small className="trace-chip">{message.traceIds.join(", ")}</small> : null}
    </article>
  );
}

function roleLabel(role: RuntimeChatMessage["role"]): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Praxis";
  if (role === "result") return "Result";
  if (role === "error") return "Error";
  return role;
}

function appliedSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { appliedActions?: unknown[]; skippedActions?: unknown[]; graphUpdated?: unknown };
  if (!Array.isArray(record.appliedActions)) return null;
  const skipped = Array.isArray(record.skippedActions) ? record.skippedActions.length : 0;
  return `${record.appliedActions.length} applied${skipped ? `, ${skipped} skipped` : ""}${record.graphUpdated ? ", graph updated" : ""}.`;
}
