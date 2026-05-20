import { useEffect, useRef } from "react";
import type { RuntimeChatMessage } from "../runtimeClient";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { CodingTaskCard } from "./CodingTaskCard";
import { PermissionCard } from "./PermissionCard";
import { PlanCard } from "./PlanCard";
import { ToolCallCard } from "./ToolCallCard";

interface ChatTranscriptProps {
  messages: RuntimeChatMessage[];
  planSelections: Record<string, string[]>;
  onPlanSelectionChange: (messageId: string, actionIds: string[]) => void;
  onRequestApply: (message: RuntimeChatMessage, actionIds: string[]) => void;
  onGenerateTask: (message: RuntimeChatMessage) => void;
  onApprovePermission: (message: RuntimeChatMessage) => void;
  onRejectPermission: (message: RuntimeChatMessage) => void;
  onModifyPermission: (message: RuntimeChatMessage) => void;
}

export function ChatTranscript({
  messages,
  planSelections,
  onPlanSelectionChange,
  onRequestApply,
  onGenerateTask,
  onApprovePermission,
  onRejectPermission,
  onModifyPermission
}: ChatTranscriptProps) {
  const transcriptRef = useRef<HTMLElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    if (shouldStickToBottom.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  function handleScroll() {
    const element = transcriptRef.current;
    if (!element) return;
    shouldStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  const latestToolMessageIds = new Set(latestToolMessages(messages).map((message) => message.id));
  const visibleMessages = messages.filter((message) => !message.toolCall || latestToolMessageIds.has(message.id));

  return (
    <section ref={transcriptRef} className="chat-transcript" aria-live="polite" onScroll={handleScroll}>
      {visibleMessages.length ? (
        visibleMessages.map((message) => {
          if (message.toolCall) return <ToolCallCard key={message.id} message={message} />;
          if (message.permissionRequest) {
            return (
              <PermissionCard
                key={message.id}
                message={message}
                onApprove={() => onApprovePermission(message)}
                onReject={() => onRejectPermission(message)}
                onModify={() => onModifyPermission(message)}
              />
            );
          }
          if (message.plan) {
            const defaultSelection = message.plan.actions.map((action) => action.id);
            const selectedActionIds = planSelections[message.id] ?? defaultSelection;
            return (
              <PlanCard
                key={message.id}
                message={message}
                selectedActionIds={selectedActionIds}
                onSelectedActionIdsChange={(actionIds) => onPlanSelectionChange(message.id, actionIds)}
                onRequestApply={() => onRequestApply(message, selectedActionIds)}
                onGenerateTask={() => onGenerateTask(message)}
              />
            );
          }
          if (message.task) return <CodingTaskCard key={message.id} message={message} />;
          return <ChatMessageBubble key={message.id} message={message} />;
        })
      ) : (
        <div className="chat-empty-state">
          <strong>No messages yet</strong>
          <span>Target transcript is empty.</span>
        </div>
      )}
      <div ref={endRef} />
    </section>
  );
}

function latestToolMessages(messages: RuntimeChatMessage[]): RuntimeChatMessage[] {
  const byToolCall = new Map<string, RuntimeChatMessage>();
  for (const message of messages) {
    if (!message.toolCall) continue;
    byToolCall.set(message.toolCall.id, message);
  }
  return [...byToolCall.values()];
}
