import type { RuntimeChatMessage } from "../runtimeClient";

interface PlanCardProps {
  message: RuntimeChatMessage;
  selectedActionIds: string[];
  onSelectedActionIdsChange: (actionIds: string[]) => void;
  onRequestApply: () => void;
  onGenerateTask: () => void;
}

export function PlanCard({ message, selectedActionIds, onSelectedActionIdsChange, onRequestApply, onGenerateTask }: PlanCardProps) {
  const plan = message.plan;
  if (!plan) return null;

  function toggleAction(actionId: string) {
    onSelectedActionIdsChange(selectedActionIds.includes(actionId) ? selectedActionIds.filter((id) => id !== actionId) : [...selectedActionIds, actionId]);
  }

  return (
    <article className="plan-card">
      <div className="chat-message-meta">
        <strong>Plan</strong>
        <span>{plan.id}</span>
      </div>
      <p>{plan.summary}</p>
      {plan.missingGluePoints.length ? (
        <div className="plan-section">
          <strong>Glue points</strong>
          {plan.missingGluePoints.map((point, index) => (
            <span key={`${point.title}-${index}`}>
              {point.kind}: {point.title}
            </span>
          ))}
        </div>
      ) : null}
      <div className="plan-action-list">
        {plan.actions.map((action) => (
          <label className="plan-action-row" key={action.id}>
            <input type="checkbox" checked={selectedActionIds.includes(action.id)} onChange={() => toggleAction(action.id)} />
            <span>
              <strong>{action.title}</strong>
              <small>
                {action.type} - {action.targetEdgeIds[0] ?? action.targetNodeIds[0] ?? "project"}
              </small>
            </span>
          </label>
        ))}
      </div>
      <div className="card-action-row">
        <button type="button" disabled={!selectedActionIds.length} onClick={onRequestApply}>
          Request Apply
        </button>
        <button type="button" onClick={onGenerateTask}>
          Generate Task
        </button>
      </div>
    </article>
  );
}
