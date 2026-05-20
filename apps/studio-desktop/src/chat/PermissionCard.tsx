import type { RuntimeChatMessage } from "../runtimeClient";

interface PermissionCardProps {
  message: RuntimeChatMessage;
  onApprove: () => void;
  onReject: () => void;
  onModify: () => void;
}

export function PermissionCard({ message, onApprove, onReject, onModify }: PermissionCardProps) {
  const request = message.permissionRequest;
  if (!request) return null;
  return (
    <article className="permission-card">
      <div className="chat-message-meta">
        <strong>{request.title}</strong>
        <span>{request.actionType}</span>
      </div>
      <p>{request.description}</p>
      <div className="permission-grid">
        <AffectedList title="Paths" values={request.affectedPaths} />
        <AffectedList title="Nodes" values={request.affectedNodeIds} />
        <AffectedList title="Edges" values={request.affectedEdgeIds} />
      </div>
      <div className="card-action-row">
        <button type="button" className="approve-button" onClick={onApprove}>
          Approve
        </button>
        <button type="button" onClick={onReject}>
          Reject
        </button>
        <button type="button" onClick={onModify}>
          Modify
        </button>
      </div>
    </article>
  );
}

function AffectedList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <strong>{title}</strong>
      {(values.length ? values : ["None"]).slice(0, 5).map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  );
}
