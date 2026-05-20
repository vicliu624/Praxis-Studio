import type { RuntimeChatMessage } from "../runtimeClient";

interface ToolCallCardProps {
  message: RuntimeChatMessage;
}

export function ToolCallCard({ message }: ToolCallCardProps) {
  const tool = message.toolCall;
  if (!tool) return null;
  return (
    <article className="tool-call-card">
      <div className="chat-message-meta">
        <strong>{tool.name}</strong>
        <span className={`tool-status ${tool.status}`}>{tool.status}</span>
      </div>
      <span>{tool.inputSummary}</span>
      {tool.outputSummary ? <small>{tool.outputSummary}</small> : null}
      <div className="tool-footer">
        <span>{tool.riskLevel}</span>
        {message.traceIds?.length ? <span>{message.traceIds.join(", ")}</span> : null}
      </div>
    </article>
  );
}
