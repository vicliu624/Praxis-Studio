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
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <section className="chat-transcript" aria-live="polite">
      {messages.length ? (
        messages.map((message) => {
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
