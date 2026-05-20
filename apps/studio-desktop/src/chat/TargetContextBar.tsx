import type { RuntimeChatSession, RuntimeGraph } from "../runtimeClient";
import type { AgentPanelSelectedTarget } from "./AgentChatPanel";

interface TargetContextBarProps {
  selectedTarget: AgentPanelSelectedTarget | null;
  session: RuntimeChatSession | null;
  graph: RuntimeGraph | null;
}

export function TargetContextBar({ selectedTarget, session, graph }: TargetContextBarProps) {
  return (
    <section className="target-context-bar" aria-label="Selected target">
      <div className="panel-heading tight">
        <h2>Agent Chat</h2>
        <span className="pill">Target-bound</span>
      </div>
      <div className="target-context-card">
        <strong>{selectedTarget ? selectedTarget.item.title ?? selectedTarget.item.id : "No target selected"}</strong>
        <span>{selectedTarget ? `${selectedTarget.type} in ${graph?.title ?? "Development Graph"}` : "Select a node or edge"}</span>
        {selectedTarget ? <small>{selectedTarget.item.id}</small> : null}
        {selectedTarget ? (
          <small>
            {Math.round(selectedTarget.item.progress * 100)}% - {selectedTarget.item.status} - {selectedTarget.item.knowledgeKind}
            {selectedTarget.type === "edge" ? ` - ${selectedTarget.item.riskLevel}` : ""}
          </small>
        ) : null}
      </div>
      {session ? (
        <div className="session-meta">
          <span>{session.id}</span>
          <span>{new Date(session.updatedAt).toLocaleTimeString()}</span>
        </div>
      ) : null}
    </section>
  );
}
