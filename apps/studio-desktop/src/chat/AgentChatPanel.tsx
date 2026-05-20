import { useEffect, useMemo, useState } from "react";
import {
  createChatSession,
  readGraph,
  respondToChatPermission,
  sendChatMessage,
  type RuntimeChatIntent,
  type RuntimeChatMessage,
  type RuntimeChatSession,
  type RuntimeChatTarget,
  type RuntimeEdge,
  type RuntimeGraph,
  type RuntimeNode
} from "../runtimeClient";
import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";
import { TargetContextBar } from "./TargetContextBar";

export type AgentPanelSelectedTarget = { type: "node"; item: RuntimeNode } | { type: "edge"; item: RuntimeEdge };

interface AgentChatPanelProps {
  projectRoot: string;
  graph: RuntimeGraph | null;
  selectedTarget: AgentPanelSelectedTarget | null;
  onGraphChanged: (graph: RuntimeGraph) => void;
}

export function AgentChatPanel({ projectRoot, graph, selectedTarget, onGraphChanged }: AgentChatPanelProps) {
  const target = useMemo(() => targetFromSelection(selectedTarget), [selectedTarget]);
  const targetKeyValue = useMemo(() => (target ? targetKey(target) : ""), [target]);
  const [session, setSession] = useState<RuntimeChatSession | null>(null);
  const [messages, setMessages] = useState<RuntimeChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [planSelections, setPlanSelections] = useState<Record<string, string[]>>({});

  const latestPlan = useMemo(() => [...messages].reverse().find((message) => message.plan)?.plan, [messages]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setPlanSelections({});
    if (!projectRoot || !target) {
      setSession(null);
      setMessages([]);
      return;
    }

    setStatus("Opening chat session...");
    createChatSession(projectRoot, target)
      .then((result) => {
        if (cancelled) return;
        setSession(result.session);
        setMessages(result.messages);
        setStatus("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("");
      });

    return () => {
      cancelled = true;
    };
  }, [projectRoot, targetKeyValue]);

  async function submitMessage(intent?: RuntimeChatIntent, overrideMessage?: string, actionIds?: string[]) {
    if (!projectRoot || !session || !target) return;
    const text = (overrideMessage ?? composer).trim();
    if (!text) return;
    setStatus(statusForIntent(intent));
    setError("");
    try {
      const result = await sendChatMessage(projectRoot, session.id, target, text, intent, actionIds);
      setSession(result.session);
      setMessages(result.messages);
      setComposer("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStatus("");
    }
  }

  async function respondToPermission(message: RuntimeChatMessage, approval: "approve" | "reject" | "modify") {
    if (!projectRoot || !session || !target || !message.permissionRequest) return;
    const actionIds = selectedActionIdsFromPermission(message);
    if (approval === "modify") {
      setComposer(buildModifyDraft(message, actionIds));
    }
    setStatus(approval === "approve" ? "Applying confirmed actions..." : approval === "reject" ? "Recording rejection..." : "Preparing modification...");
    setError("");
    try {
      const result = await respondToChatPermission(projectRoot, session.id, target, message.permissionRequest.id, approval, actionIds);
      setSession(result.session);
      setMessages(result.messages);
      if (approval === "approve") {
        const loaded = await readGraph(projectRoot);
        onGraphChanged(loaded);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStatus("");
    }
  }

  function updatePlanSelection(messageId: string, actionIds: string[]) {
    setPlanSelections((current) => ({ ...current, [messageId]: actionIds }));
  }

  return (
    <aside className="panel agent-chat-panel" aria-label="Agent Chat Session">
      <TargetContextBar selectedTarget={selectedTarget} session={session} graph={graph} />
      <div className="agent-mode-row" aria-label="Agent shortcuts">
        <button type="button" disabled={!session} onClick={() => submitMessage("explain", "Explain this selected target.")}>
          Explain
        </button>
        <button type="button" disabled={!session} onClick={() => submitMessage("plan", "Plan next steps for this selected target.")}>
          Plan
        </button>
        <button type="button" disabled={!session || !latestPlan} onClick={() => submitMessage("generate_task", "Generate a controlled coding task from the latest plan.")}>
          Task
        </button>
        <button type="button" disabled={!session || !latestPlan} onClick={() => submitMessage("apply", "Prepare Apply approval for the latest plan.")}>
          Apply
        </button>
        <button type="button" disabled={!session || !composer.trim()} onClick={() => submitMessage("import_result")}>
          Import
        </button>
      </div>

      <ChatTranscript
        messages={messages}
        planSelections={planSelections}
        onPlanSelectionChange={updatePlanSelection}
        onRequestApply={(message, actionIds) => submitMessage("apply", `Prepare Apply approval for ${message.plan?.id ?? "the selected plan"}.`, actionIds)}
        onGenerateTask={() => submitMessage("generate_task", "Generate a controlled coding task from the latest plan.")}
        onApprovePermission={(message) => respondToPermission(message, "approve")}
        onRejectPermission={(message) => respondToPermission(message, "reject")}
        onModifyPermission={(message) => respondToPermission(message, "modify")}
      />

      {status ? <p className="status-text chat-status">{status}</p> : null}
      {error ? <p className="error-text chat-status">{error}</p> : null}

      <ChatComposer
        value={composer}
        disabled={!session}
        placeholder={selectedTarget ? "Message Praxis..." : "No target selected."}
        onChange={setComposer}
        onSend={() => submitMessage()}
      />
    </aside>
  );
}

function targetFromSelection(selectedTarget: AgentPanelSelectedTarget | null): RuntimeChatTarget | null {
  if (!selectedTarget) return null;
  return { type: selectedTarget.type, id: selectedTarget.item.id };
}

function targetKey(target: RuntimeChatTarget): string {
  if (target.type === "project") return "project";
  if (target.type === "subgraph") return `subgraph:${target.nodeIds.join(",")}|${target.edgeIds.join(",")}`;
  return `${target.type}:${target.id}`;
}

function statusForIntent(intent?: RuntimeChatIntent): string {
  if (intent === "plan") return "Planning...";
  if (intent === "generate_task") return "Generating controlled task...";
  if (intent === "apply") return "Preparing Apply approval...";
  if (intent === "import_result") return "Importing result...";
  return "Thinking...";
}

function selectedActionIdsFromPermission(message: RuntimeChatMessage): string[] {
  const structured = message.structured;
  if (!structured || typeof structured !== "object" || !("selectedActionIds" in structured)) return [];
  const values = (structured as { selectedActionIds?: unknown }).selectedActionIds;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
}

function buildModifyDraft(message: RuntimeChatMessage, actionIds: string[]): string {
  const actionLines = actionIds.length ? actionIds.map((id) => `- keep ${id}`) : ["- keep the useful actions", "- remove or change the risky actions"];
  return [`Modify this Apply request:`, "", ...actionLines].join("\n");
}
