import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelAgentRun,
  createChatSession,
  readChatSession,
  respondToPermission,
  sendChatMessage,
  startAgentRun,
  readGraph,
  readEngineeringSourceData,
  readProjectTree,
  type RuntimeAgentRunResult,
  type RuntimeAgentLogPaths,
  type RuntimeAgentStep,
  type RuntimeChatMessage,
  type RuntimeChatSession,
  type RuntimeChatTarget,
  type RuntimeChatTranscriptResult,
  type RuntimeGraph,
  type RuntimeNode,
  type RuntimeEdge,
  type RuntimeGraphPlan,
  type RuntimeMemoryRecord,
  type RuntimePlanAction,
  type RuntimeProjectTreeNode,
  type RuntimeProjectTreeResult,
  type RuntimeScopedAgentHistoryEntry,
  type RuntimeToolCallView
} from "../runtimeClient";
import { useI18n } from "../i18n";
import { CommandMenu, useCommands, type Command } from "../chat/CommandMenu";
import { SessionSidebar } from "../chat/SessionSidebar";
import { AgentConversationPanel, type AgentConversationEvent } from "../chat/AgentConversationPanel";
import { appendScopedAgentHistoryEntries, readScopedAgentHistory } from "../chat/scopedAgentHistory";

interface AgentWorkspacePageProps {
  projectRoot: string;
  initialDraft?: { text: string; mode: "explain" | "plan"; token: number } | null;
  onDraftConsumed?: (token: number) => void;
  onNavigateToPlan: () => void;
  onNavigateToSettings: () => void;
  onNavigateHome: () => void;
}

type WorkspaceView = "chat" | "graph" | "memory" | "files";

type ActiveAgentPoll = {
  cancelled: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
  sessionId: string;
  baselineCount: number;
  pollCount: number;
  stableTerminalReads: number;
  readErrorCount: number;
};

function isTerminalRunMessage(message: RuntimeChatMessage): boolean {
  return message.role === "assistant"
    || message.role === "error"
    || message.status === "failed"
    || message.status === "cancelled";
}

function findTerminalRunMessage(messages: RuntimeChatMessage[], baselineCount: number): RuntimeChatMessage | null {
  const startIndex = Math.max(0, Math.min(baselineCount, messages.length));
  for (let index = messages.length - 1; index >= startIndex; index--) {
    const message = messages[index];
    if (isTerminalRunMessage(message)) return message;
  }
  return null;
}

function runStatusFromTerminalMessage(message: RuntimeChatMessage): RuntimeAgentRunResult["runStatus"] {
  if (message.role === "error" || message.status === "failed") return "failed";
  if (message.status === "cancelled") return "cancelled";
  return "completed";
}

export function AgentWorkspacePage({ projectRoot, initialDraft, onDraftConsumed, onNavigateToPlan, onNavigateToSettings, onNavigateHome }: AgentWorkspacePageProps) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<RuntimeGraph | null>(null);
  const [session, setSession] = useState<RuntimeChatSession | null>(null);
  const [messages, setMessages] = useState<RuntimeChatMessage[]>([]);
  const [sharedAgentHistory, setSharedAgentHistory] = useState<RuntimeScopedAgentHistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"explain" | "plan">("explain");
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RuntimeAgentRunResult | null>(null);
  const [runSteps, setRunSteps] = useState<RuntimeAgentStep[]>([]);
  const [error, setError] = useState("");
  const [leftView, setLeftView] = useState<WorkspaceView>("files");
  const [rightView, setRightView] = useState<"context" | "plan" | "tools" | "memory" | "diff" | "logs">("context");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [projectTreeRefreshToken, setProjectTreeRefreshToken] = useState(0);
  const [slashQuery, setSlashQuery] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const messagesScroller = useRef<HTMLDivElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);
  const activePollRef = useRef<ActiveAgentPoll | null>(null);
  const consumedDraftTokenRef = useRef<number | null>(null);
  const commands = useCommands();

  useEffect(() => {
    if (!initialDraft) return;
    if (consumedDraftTokenRef.current === initialDraft.token) return;
    consumedDraftTokenRef.current = initialDraft.token;
    setInput(initialDraft.text);
    setMode(initialDraft.mode);
    setShowCommands(false);
    shouldStickToBottom.current = false;
    onDraftConsumed?.(initialDraft.token);
  }, [initialDraft?.token]);

  const stopActivePoll = useCallback(() => {
    const poll = activePollRef.current;
    if (poll?.timeoutId) clearTimeout(poll.timeoutId);
    if (poll) poll.cancelled = true;
    activePollRef.current = null;
  }, []);

  const finishActivePoll = useCallback((poll: ActiveAgentPoll, result?: RuntimeAgentRunResult) => {
    if (activePollRef.current !== poll) return;
    if (poll.timeoutId) clearTimeout(poll.timeoutId);
    poll.cancelled = true;
    activePollRef.current = null;
    setIsRunning(false);
    if (result) setRunResult(result);
  }, []);

  // ── Load graph ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    readGraph(projectRoot)
      .then((g) => { if (active) setGraph(g); })
      .catch(() => {});
    return () => { active = false; };
  }, [projectRoot]);

  useEffect(() => {
    let active = true;
    readScopedAgentHistory(projectRoot)
      .then((entries) => { if (active) setSharedAgentHistory(entries); })
      .catch(() => { if (active) setSharedAgentHistory([]); });
    return () => { active = false; };
  }, [projectRoot]);

  const persistGlobalAgentHistory = useCallback(async (entries: RuntimeScopedAgentHistoryEntry[]) => {
    const next = await appendScopedAgentHistoryEntries(projectRoot, entries);
    setSharedAgentHistory(next);
    return next;
  }, [projectRoot]);

  // ── Create or load session ───────────────────────────────
  useEffect(() => {
    let active = true;
    stopActivePoll();
    setIsRunning(false);
    const target: RuntimeChatTarget = selectedNode
      ? { type: "node", id: selectedNode }
      : selectedEdge
        ? { type: "edge", id: selectedEdge }
        : { type: "project" };

    createChatSession(projectRoot, target)
      .then((result) => {
        if (!active) return;
        setSession(result.session);
        setMessages(result.messages);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [projectRoot, selectedNode, selectedEdge, stopActivePoll]);

  // ── Auto-scroll ──────────────────────────────────────────
  useEffect(() => {
    if (shouldStickToBottom.current) {
      messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isRunning, runResult]);

  // ── Send message (agent run) ─────────────────────────────
  const handleCommandSelect = useCallback((cmd: Command) => {
    setShowCommands(false);
    if (cmd.action) {
      cmd.action(cmd.name);
    } else {
      setInput(`/${cmd.name} `);
    }
  }, []);

  useEffect(() => {
    return () => stopActivePoll();
  }, [stopActivePoll]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !session) return;
    stopActivePoll();
    const baselineCount = messages.length;
    setShowCommands(false);
    setInput("");
    setError("");
    setRunResult(null);
    setRunSteps([]);
    setRightView("tools");
    shouldStickToBottom.current = true;

    // Show user message immediately
    const userMsg: RuntimeChatMessage = {
      id: `msg-${Date.now()}`,
      sessionId: session.id,
      role: "user",
      createdAt: new Date().toISOString(),
      content: text
    };
    setMessages(prev => [...prev, userMsg]);
    setIsRunning(true);
    let conversationHistoryForRun = sharedAgentHistory;
    try {
      conversationHistoryForRun = await persistGlobalAgentHistory([
        createPraxisAssistantHistoryEntry("user", text, {
          id: `praxis-assistant:${userMsg.id}`,
          projectRoot,
          intent: mode,
          status: "done"
        })
      ]);
    } catch (err) {
      setError(err instanceof Error ? `Unable to persist shared agent history: ${err.message}` : String(err));
    }

    const sid = session.id;
    const poll: ActiveAgentPoll = {
      cancelled: false,
      timeoutId: null,
      sessionId: sid,
      baselineCount,
      pollCount: 0,
      stableTerminalReads: 0,
      readErrorCount: 0
    };
    activePollRef.current = poll;
    const target: RuntimeChatTarget = selectedNode
      ? { type: "node", id: selectedNode }
      : selectedEdge
        ? { type: "edge", id: selectedEdge }
        : { type: "project" };

    // Fire-and-forget: start agent via async spawn (returns immediately)
    startAgentRun(projectRoot, target, mode, text, sid, conversationHistoryForRun.slice(-40))
      .then((result) => { if (result.runStatus !== "running") setRunResult(result); })
      .catch(async (err) => {
        if (activePollRef.current !== poll || poll.cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        try {
          await persistGlobalAgentHistory([
            createPraxisAssistantHistoryEntry("assistant", message, {
              id: `praxis-assistant:${sid}:spawn-error:${Date.now()}`,
              projectRoot,
              intent: mode,
              status: "failed"
            })
          ]);
        } catch {}
        finishActivePoll(poll, {
          ok: false,
          sessionId: sid,
          runId: "",
          runPath: "",
          runStatus: "failed",
          stepCount: poll.pollCount,
          finalMessage: message
        });
      });
    // Agent runs in background — polling below will detect completion

    const doPoll = async () => {
      if (poll.cancelled || activePollRef.current !== poll) return;
      poll.pollCount++;
      try {
        const transcript = await readChatSession(projectRoot, sid);
        if (poll.cancelled || activePollRef.current !== poll) return;
        poll.readErrorCount = 0;
        setMessages(transcript.messages);
        
        const terminal = findTerminalRunMessage(transcript.messages, poll.baselineCount);
        if (terminal) {
          poll.stableTerminalReads++;
          if (poll.stableTerminalReads >= 2) {
            let finalMessages = transcript.messages;
            try {
              const finalTranscript = await readChatSession(projectRoot, sid);
              finalMessages = finalTranscript.messages;
              if (!poll.cancelled && activePollRef.current === poll) setMessages(finalMessages);
            } catch {
              finalMessages = transcript.messages;
            }
            if (poll.cancelled || activePollRef.current !== poll) return;
            const finalTerminal = findTerminalRunMessage(finalMessages, poll.baselineCount) ?? terminal;
            const runStatus = runStatusFromTerminalMessage(finalTerminal);
            try {
              await persistGlobalAgentHistory([
                createPraxisAssistantHistoryEntry("assistant", finalTerminal.content, {
                  id: `praxis-assistant:${finalTerminal.id}`,
                  projectRoot,
                  intent: mode,
                  status: runStatus === "completed" ? "done" : runStatus
                })
              ]);
            } catch (err) {
              setError(err instanceof Error ? `Unable to persist shared agent history: ${err.message}` : String(err));
            }
            finishActivePoll(poll, {
              ok: runStatus === "completed",
              sessionId: sid,
              runId: "",
              runPath: "",
              runStatus,
              stepCount: poll.pollCount,
              finalMessage: finalTerminal.content,
              finalStructured: finalTerminal.structured
            });
            setProjectTreeRefreshToken((value) => value + 1);
            return;
          }
        } else {
          poll.stableTerminalReads = 0;
        }
        
        // Timeout after 60 minutes (7200 polls at 500ms). Permission waits can legitimately be long.
        if (poll.pollCount > 7200) {
          const message = "Agent run timed out after 60 minutes.";
          setError(message);
          finishActivePoll(poll, {
            ok: false,
            sessionId: sid,
            runId: "",
            runPath: "",
            runStatus: "failed",
            stepCount: poll.pollCount,
            finalMessage: message
          });
          return;
        }
      } catch (err) {
        if (poll.cancelled || activePollRef.current !== poll) return;
        poll.readErrorCount++;
        if (poll.readErrorCount === 10) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`Unable to refresh agent transcript: ${message}`);
        }
      }
      if (!poll.cancelled && activePollRef.current === poll) {
        poll.timeoutId = setTimeout(doPoll, 500);
      }
    };
    poll.timeoutId = setTimeout(doPoll, 150);
  }, [input, session, messages.length, selectedNode, selectedEdge, mode, projectRoot, sharedAgentHistory, persistGlobalAgentHistory, stopActivePoll, finishActivePoll]);

  // ── Permission response ──────────────────────────────────
  const handlePermission = useCallback(async (permissionId: string, approval: "approve" | "reject") => {
    if (!session) return;
    // Write response file that the agent is polling
    await respondToPermission(projectRoot, permissionId, approval);
    shouldStickToBottom.current = true;
    // Agent will pick up the response within 1 second and continue
  }, [session, selectedNode, selectedEdge, projectRoot]);

  const handleCancelRun = useCallback(async () => {
    try {
      await cancelAgentRun(projectRoot);
      setError("Agent cancellation requested.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!activePollRef.current) setIsRunning(false);
    }
  }, [projectRoot]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScroller.current;
    if (!el) return;
    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  // ── Derived data ─────────────────────────────────────────
  const currentTarget = selectedNode
    ? graph?.nodes.find((n) => n.id === selectedNode) ?? null
    : selectedEdge
      ? graph?.edges.find((e) => e.id === selectedEdge) ?? null
      : null;

  const latestPlan = useMemo(() => {
    for (const msg of [...messages].reverse()) {
      if (msg.plan) return msg.plan;
    }
    return null;
  }, [messages]);

  const nodeList = useMemo(() => graph?.nodes ?? [], [graph]);
  const edgeList = useMemo(() => graph?.edges ?? [], [graph]);
  const isWaitingForPermission = isRunning && messages[messages.length - 1]?.role === "permission";
  const conversationEvents = useMemo(() => {
    const sharedEvents = sharedAgentHistory.map(sharedHistoryEntryToConversationEvent);
    const runtimeEvents = runtimeMessagesToConversationEvents(messages, handlePermission)
      .filter((event) => event.kind !== "user_message" && event.kind !== "assistant_message");
    return mergeAgentConversationEvents(sharedEvents, runtimeEvents);
  }, [messages, sharedAgentHistory, handlePermission]);

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="agent-workspace" style={{ display: "flex", flex: "1 1 auto", minHeight: 0, height: "100%", overflow: "hidden" }}>
      {/* ── Session Sidebar ─────────────────────── */}
      <SessionSidebar
        projectRoot={projectRoot}
        activeSessionId={session?.id ?? null}
        onSelectSession={async (s) => {
          const transcript = await readChatSession(projectRoot, s.id);
          setSession(transcript.session);
          setMessages(transcript.messages);
        }}
        onNewSession={async () => {
          const target: RuntimeChatTarget = selectedNode
            ? { type: "node", id: selectedNode }
            : selectedEdge ? { type: "edge", id: selectedEdge } : { type: "project" };
          const result = await createChatSession(projectRoot, target);
          setSession(result.session);
          setMessages(result.messages);
          setRunResult(null);
        }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* ── Left Sidebar ────────────────────────── */}
      <aside className="workspace-sidebar left-sidebar" style={{ width: 260, flexShrink: 0, borderRight: "1px solid #1a2332", display: "flex", flexDirection: "column", background: "#0d1117" }}>
        <div className="sidebar-header" style={{ padding: "12px 16px", borderBottom: "1px solid #1a2332", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t("agent.betaTitle")}</span>
          <button className="icon-btn" onClick={onNavigateHome} title={t("nav.home")} style={{ background: "none", border: "none", color: "#96a3b5", cursor: "pointer", fontSize: 16 }}>&#x2302;</button>
        </div>

        <div className="sidebar-tabs" style={{ display: "flex", borderBottom: "1px solid #1a2332" }}>
          {(["files", "graph", "memory"] as WorkspaceView[]).map((v) => (
            <button
              key={v}
              className={`sidebar-tab ${leftView === v ? "active" : ""}`}
              onClick={() => setLeftView(v)}
              style={{
                flex: 1, padding: "8px 4px", background: leftView === v ? "#161b22" : "transparent",
                border: "none", color: leftView === v ? "#e8edf2" : "#96a3b5", cursor: "pointer", fontSize: 12, borderBottom: leftView === v ? "2px solid #eba341" : "2px solid transparent"
              }}
            >
              {v === "files" ? t("sidebar.files") : v === "graph" ? t("sidebar.graph") : t("sidebar.memory")}
            </button>
          ))}
        </div>

        <div className="sidebar-content" style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {leftView === "files" && (
            <FileTreePanel root={projectRoot} refreshToken={projectTreeRefreshToken} onSelectNode={setSelectedNode} />
          )}
          {leftView === "graph" && (
            <GraphShortcutsPanel
              nodes={nodeList}
              edges={edgeList}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onSelectNode={(id) => { setSelectedNode(id); setSelectedEdge(null); }}
              onSelectEdge={(id) => { setSelectedEdge(id); setSelectedNode(null); }}
              onOpenGraph={onNavigateToPlan}
            />
          )}
          {leftView === "memory" && (
            <MemoryQuickPanel projectRoot={projectRoot} />
          )}
        </div>

        <div className="sidebar-footer" style={{ padding: 8, borderTop: "1px solid #1a2332", display: "flex", gap: 6 }}>
          <button className="small-btn" onClick={onNavigateToSettings} style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: "#161b22", border: "1px solid #1a2332", color: "#96a3b5", borderRadius: 4, cursor: "pointer" }}>
            {t("settings.title")}
          </button>
          <button className="small-btn" onClick={onNavigateToPlan} style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: "#161b22", border: "1px solid #1a2332", color: "#96a3b5", borderRadius: 4, cursor: "pointer" }}>
            {t("route.projectPlan")}
          </button>
        </div>
      </aside>

      {/* ── Center Chat ─────────────────────────── */}
      <main className="workspace-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#0b0f14" }}>
        {/* Chat Header */}
        <div className="chat-header" style={{ padding: "10px 16px", borderBottom: "1px solid #1a2332", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: "#8deadd", fontWeight: 700 }}>{t("agent.betaBadge")}</span>
              <span style={{ fontSize: 11, color: "#96a3b5" }}>{t("agent.betaCopy")}</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {currentTarget
                ? `${"kind" in currentTarget ? (currentTarget as RuntimeNode).kind : (currentTarget as RuntimeEdge).kind}: ${currentTarget.title ?? currentTarget.id}`
                : t("chat.projectChat")}
            </span>
            {currentTarget && (
              <span className="pill" style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 8, background: "#1a2332", color: "#96a3b5" }}>
                {t(`graph.${"kind" in currentTarget ? "node" : "edge"}`)}
              </span>
            )}
            {/* Permission mode pills */}
            {isRunning && (
              <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "#eba34122", color: "#eba341" }}>
                Agent running
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className={`mode-btn ${mode === "explain" ? "active" : ""}`}
              onClick={() => setMode("explain")}
              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid #1a2332", background: mode === "explain" ? "#eba341" : "transparent", color: mode === "explain" ? "#0b0f14" : "#96a3b5", cursor: "pointer" }}
            >
              {t("mode.explain")}
            </button>
            <button
              className={`mode-btn ${mode === "plan" ? "active" : ""}`}
              onClick={() => setMode("plan")}
              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid #1a2332", background: mode === "plan" ? "#eba341" : "transparent", color: mode === "plan" ? "#0b0f14" : "#96a3b5", cursor: "pointer" }}
            >
              {t("mode.plan")}
            </button>
            <span style={{ width: 1, height: 20, background: "#1a2332", margin: "0 4px" }} />
            <button
              onClick={async () => {
                if (!session) return;
                const target: RuntimeChatTarget = selectedNode
                  ? { type: "node", id: selectedNode }
                  : selectedEdge ? { type: "edge", id: selectedEdge } : { type: "project" };
                const result = await createChatSession(projectRoot, target);
                setSession(result.session);
                setMessages(result.messages);
                setRunResult(null);
              }}
              title="New Session"
              style={{ padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #1a2332", background: "transparent", color: "#96a3b5", cursor: "pointer" }}
            >
              + New
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesScroller}
          className="chat-messages"
          onScroll={handleMessagesScroll}
          style={{ flex: 1, overflow: "auto", padding: 16 }}
        >
          {conversationEvents.length === 0 && !isRunning && (
            <div style={{ textAlign: "center", color: "#96a3b5", marginTop: 80 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F4AC;</div>
              <div style={{ fontSize: 14 }}>{t("chat.emptyHint")}</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                {graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges` : t("chat.loadingGraph")}
              </div>
            </div>
          )}

          {conversationEvents.length ? (
            <AgentConversationPanel
              events={conversationEvents}
              compact
              className="workspace-agent-conversation"
              emptyTitle={t("chat.projectChat")}
              emptyCopy={t("chat.emptyHint")}
            />
          ) : null}

          {/* Running indicator */}
          {isRunning && (
            <div className="running-indicator" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", color: "#eba341", fontSize: 13 }}>
              <span className="spinner" style={{ width: 12, height: 12, border: "2px solid #1a2332", borderTop: "2px solid #eba341", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              {isWaitingForPermission ? "Waiting for approval..." : t("chat.agentWorking")}
            </div>
          )}

          {/* Run result summary */}
          {runResult && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #1a2332", fontSize: 12, color: "#96a3b5", display: "flex", gap: 12 }}>
              <span>{t("chat.runSteps")}: {runResult.stepCount}</span>
              <span>{t("chat.runStatus")}: {runResult.runStatus}</span>
            </div>
          )}

          {error && (
            <div style={{
              margin: "8px 16px", padding: "10px 14px", background: "rgba(248, 113, 113, 0.12)",
              border: "1px solid rgba(248, 113, 113, 0.25)", borderRadius: 8,
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8
            }}>
              <span style={{ color: "#f87171", fontSize: 13, lineHeight: 1.4 }}>{error}</span>
              <button
                onClick={() => setError("")}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>

        {/* Input — Claude Code style: auto-resize, stop toggle, hints */}
        <div className="chat-input" style={{ padding: "8px 16px 12px", borderTop: "1px solid #1a2332" }}>
          <div style={{ position: "relative" }}>
            <CommandMenu
              commands={commands}
              visible={showCommands}
              query={slashQuery}
              onSelect={handleCommandSelect}
              onClose={() => setShowCommands(false)}
            />
            <div style={{
              display: "flex", alignItems: "flex-end", gap: 8,
              background: "#161b22", borderRadius: 12, border: "1px solid #1a2332",
              padding: "6px 8px 6px 14px"
            }}>
            <textarea
              ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } }}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                // Slash command detection
                if (val.startsWith("/")) {
                  setSlashQuery(val.slice(1));
                  setShowCommands(true);
                } else {
                  setShowCommands(false);
                }
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isRunning) handleSend(); }
              }}
              placeholder={t("chat.placeholder")}
              disabled={isRunning}
              rows={1}
              style={{
                flex: 1, resize: "none", background: "transparent", border: "none",
                color: "#e8edf2", padding: "6px 0", fontSize: 13, fontFamily: "inherit",
                outline: "none", maxHeight: 160, lineHeight: 1.5
              }}
            />
            <button
              onClick={isRunning ? handleCancelRun : handleSend}
              disabled={!isRunning && !input.trim()}
              title={isRunning ? "Stop generation" : "Send message"}
              style={{
                width: 36, height: 36, borderRadius: 8, border: "none",
                background: isRunning ? "#f87171" : (!input.trim() ? "#1a2332" : "#eba341"),
                color: isRunning ? "#fff" : (!input.trim() ? "#96a3b5" : "#0b0f14"),
                cursor: isRunning ? "pointer" : (!input.trim() ? "not-allowed" : "pointer"),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, transition: "all 0.15s"
              }}
            >
              {isRunning ? "■" : "↑"}
            </button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#96a3b5" }}>Enter to send, Shift+Enter for newline</span>
            {isRunning && (
              <button onClick={() => {
                cancelAgentRun(projectRoot).catch(() => {});
                stopActivePoll();
                setIsRunning(false);
              }} style={{ fontSize: 10, background: "none", border: "none", color: "#f87171", cursor: "pointer" }}>
                Cancel run
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Right Sidebar ───────────────────────── */}
      <aside className="workspace-sidebar right-sidebar" style={{ width: 300, flexShrink: 0, borderLeft: "1px solid #1a2332", display: "flex", flexDirection: "column", background: "#0d1117" }}>
        <div className="sidebar-tabs" style={{ display: "flex", borderBottom: "1px solid #1a2332" }}>
          {(["context", "tools", "plan", "memory", "diff", "logs"] as const).map((v) => (
            <button
              key={v}
              className={`sidebar-tab ${rightView === v ? "active" : ""}`}
              onClick={() => setRightView(v)}
              style={{
                flex: 1, padding: "8px 2px", background: rightView === v ? "#161b22" : "transparent",
                border: "none", color: rightView === v ? "#e8edf2" : "#96a3b5", cursor: "pointer", fontSize: 11, borderBottom: rightView === v ? "2px solid #eba341" : "2px solid transparent"
              }}
            >
              {v === "context" ? t("panel.context") : v === "tools" ? t("panel.tools") : v === "plan" ? t("panel.plan") : v === "memory" ? t("panel.memory") : v === "logs" ? t("panel.logs") : t("panel.diff")}
            </button>
          ))}
        </div>

        <div className="sidebar-content" style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {rightView === "context" && (
            <ContextPanel target={currentTarget} graph={graph} />
          )}
          {rightView === "tools" && (
            <ToolCallsPanel messages={messages} />
          )}
          {rightView === "plan" && (
            <PlanPanel plan={latestPlan} />
          )}
          {rightView === "memory" && (
            <MemoryPanel projectRoot={projectRoot} />
          )}
          {rightView === "diff" && (
            <DiffPanel messages={messages} />
          )}
          {rightView === "logs" && (
            <LogsPanel projectRoot={projectRoot} sessionId={session?.id ?? ""} runResult={runResult} />
          )}
        </div>
      </aside>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── FileTreePanel ──────────────────────────────────────────

function FileTreePanel({ root, refreshToken, onSelectNode }: { root: string; refreshToken: number; onSelectNode: (id: string) => void }) {
  const [tree, setTree] = useState<RuntimeProjectTreeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    readProjectTree(root)
      .then((result) => {
        if (!active) return;
        setTree(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setTree(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [root, refreshToken, manualRefreshToken]);

  return (
    <div className="assistant-tree-panel">
      <div className="assistant-panel-heading">
        <span>项目文件</span>
        <div className="assistant-panel-heading-actions">
          {tree ? <small>{tree.totalFiles} files</small> : null}
          <button type="button" onClick={() => setManualRefreshToken((value) => value + 1)} disabled={loading}>
            {loading ? "扫描中" : "刷新"}
          </button>
        </div>
      </div>
      {loading ? <div className="assistant-side-note">正在读取当前工作区文件...</div> : null}
      {error ? <div className="assistant-side-error">{error}</div> : null}
      {tree ? <ProjectTreeNodeView node={tree.root} depth={0} onSelectNode={onSelectNode} /> : null}
      {tree?.warning ? <div className="assistant-side-note">实时扫描失败，正在展示缓存文件树。{tree.warning}</div> : null}
      {tree?.truncated ? <div className="assistant-side-note">文件树已为响应速度做了截断。修改文件后点刷新即可查看当前结构；只有需要重建 Praxis 记忆时才需要重新项目接入。</div> : null}
    </div>
  );
}

function ProjectTreeNodeView({
  node,
  depth,
  onSelectNode
}: {
  node: RuntimeProjectTreeNode;
  depth: number;
  onSelectNode: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDirectory = node.kind === "directory";
  if (node.path === ".") {
    return (
      <div className="assistant-tree-root">
        {node.children.map((child) => (
          <ProjectTreeNodeView key={child.id} node={child} depth={depth} onSelectNode={onSelectNode} />
        ))}
      </div>
    );
  }
  return (
    <div className="assistant-tree-node">
      <button
        type="button"
        className={isDirectory ? "assistant-tree-row directory" : "assistant-tree-row file"}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => {
          if (isDirectory) setExpanded((value) => !value);
          else onSelectNode(`file:${node.path}`);
        }}
        title={node.path}
      >
        <span className="assistant-tree-caret">{isDirectory ? (expanded ? "v" : ">") : ""}</span>
        <span className="assistant-tree-icon">{isDirectory ? "[]" : "-"}</span>
        <span className="assistant-tree-name">{node.name}</span>
        <small>{isDirectory ? `${node.fileCount}` : node.language ?? node.roleHint ?? ""}</small>
      </button>
      {isDirectory && expanded ? (
        <div className="assistant-tree-children">
          {node.children.map((child) => (
            <ProjectTreeNodeView key={child.id} node={child} depth={depth + 1} onSelectNode={onSelectNode} />
          ))}
          {node.truncated ? <div className="assistant-tree-truncated" style={{ paddingLeft: 18 + depth * 12 }}>More hidden at this depth</div> : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── GraphShortcutsPanel ────────────────────────────────────

function GraphShortcutsPanel({
  nodes, edges, selectedNode, selectedEdge,
  onSelectNode, onSelectEdge, onOpenGraph
}: {
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
  selectedNode: string | null;
  selectedEdge: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onOpenGraph: () => void;
}) {
  const nodesByKind = groupNodesByKind(nodes);
  const riskyEdges = edges.filter((edge) => edge.riskLevel !== "none");
  return (
    <div className="assistant-graph-panel">
      <div className="assistant-panel-heading">
        <span>Graph Summary</span>
        <button type="button" onClick={onOpenGraph}>
          Open Plan
        </button>
      </div>
      <div className="assistant-summary-grid">
        <span><strong>{nodes.length}</strong> nodes</span>
        <span><strong>{edges.length}</strong> relations</span>
        <span><strong>{riskyEdges.length}</strong> risks</span>
      </div>
      {nodesByKind.map((group) => (
        <section className="assistant-side-section" key={group.kind}>
          <h3>{group.kind}</h3>
          {group.nodes.slice(0, 12).map((node) => (
            <button
              key={node.id}
              type="button"
              className={selectedNode === node.id ? "assistant-side-item active" : "assistant-side-item"}
              onClick={() => onSelectNode(node.id)}
            >
              <span>{node.title ?? node.id}</span>
              <small>{Math.round(node.progress * 100)}%</small>
            </button>
          ))}
        </section>
      ))}
      {riskyEdges.length ? (
        <section className="assistant-side-section">
          <h3>Risky relations</h3>
          {riskyEdges.slice(0, 10).map((edge) => (
            <button
              key={edge.id}
              type="button"
              className={selectedEdge === edge.id ? "assistant-side-item active danger" : "assistant-side-item danger"}
              onClick={() => onSelectEdge(edge.id)}
            >
              <span>{edge.title ?? edge.kind}</span>
              <small>{edge.riskLevel}</small>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

// ─── MemoryQuickPanel ───────────────────────────────────────

function MemoryQuickPanel({ projectRoot }: { projectRoot: string }) {
  const [records, setRecords] = useState<RuntimeMemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    readEngineeringSourceData(projectRoot)
      .then((data) => {
        if (!active) return;
        const memory = data.memory;
        setRecords([
          ...memory.facts,
          ...memory.confirmations,
          ...memory.decisions,
          ...memory.candidates,
          ...memory.findings
        ].slice(0, 80));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [projectRoot]);

  if (loading) return <div style={{ color: "#96a3b5", fontSize: 12, padding: 8 }}>Loading memory...</div>;
  return (
    <div className="assistant-memory-panel">
      <div className="assistant-panel-heading">
        <span>Project Memory</span>
        <small>{records.length} shown</small>
      </div>
      {error ? <div className="assistant-side-error">{error}</div> : null}
      {records.length ? records.map((record) => (
        <article className={`assistant-memory-card ${record.kind.toLowerCase()}`} key={record.id}>
          <strong>{record.summary || record.subject}</strong>
          <span>{record.kind} / {record.type}</span>
          <small>{record.subject} {record.predicate ? `-> ${record.predicate}` : ""}</small>
        </article>
      )) : <div className="assistant-side-note">No project memory has been accepted yet. Run project intake or engineering review first.</div>}
    </div>
  );
}

function groupNodesByKind(nodes: RuntimeNode[]): { kind: string; nodes: RuntimeNode[] }[] {
  const groups = new Map<string, RuntimeNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.kind) ?? [];
    group.push(node);
    groups.set(node.kind, group);
  }
  return [...groups.entries()]
    .map(([kind, groupNodes]) => ({ kind, nodes: groupNodes.sort((left, right) => (left.title ?? left.id).localeCompare(right.title ?? right.id)) }))
    .sort((left, right) => right.nodes.length - left.nodes.length);
}

function createPraxisAssistantHistoryEntry(
  role: RuntimeScopedAgentHistoryEntry["role"],
  text: string,
  options: {
    id: string;
    projectRoot: string;
    intent?: string;
    status?: RuntimeScopedAgentHistoryEntry["status"];
  }
): RuntimeScopedAgentHistoryEntry {
  return {
    id: options.id,
    role,
    text,
    timestamp: new Date().toISOString(),
    scopeId: "global:praxis-assistant",
    scopeTitle: "Praxis Assistant",
    scopeKind: "global",
    contextTitle: "Global Project",
    contextPath: options.projectRoot,
    intent: options.intent,
    status: options.status
  };
}

function sharedHistoryEntryToConversationEvent(entry: RuntimeScopedAgentHistoryEntry): AgentConversationEvent {
  return {
    id: entry.id,
    kind: entry.role === "user" ? "user_message" : "assistant_message",
    role: entry.role,
    title: entry.role === "user" ? "You" : entry.scopeTitle,
    content: entry.text,
    status: entry.status ?? "done",
    timestamp: entry.timestamp,
    metadata: compactMetadata([
      entry.scopeKind ?? "global",
      entry.contextTitle ?? "",
      entry.intent ?? "",
      entry.contextPath ?? ""
    ])
  };
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

function runtimeMessagesToConversationEvents(
  messages: RuntimeChatMessage[],
  handlePermission: (pid: string, approval: "approve" | "reject") => void
): AgentConversationEvent[] {
  return messages.map((message, index) => {
    if (message.toolCall) return toolCallMessageToConversationEvent(message, index);
    if (message.permissionRequest) return permissionMessageToConversationEvent(message, handlePermission);
    if (message.plan) return planMessageToConversationEvent(message);
    if (message.task) return taskMessageToConversationEvent(message);
    return plainMessageToConversationEvent(message);
  });
}

function plainMessageToConversationEvent(message: RuntimeChatMessage): AgentConversationEvent {
  const isError = message.role === "error" || message.status === "failed";
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant" || message.role === "result";
  return {
    id: message.id,
    kind: isError ? "error" : isUser ? "user_message" : isAssistant ? "assistant_message" : "runtime_event",
    role: isUser ? "user" : isAssistant ? "assistant" : message.role === "system" ? "system" : "runtime",
    title: conversationTitleForRole(message.role),
    content: message.content,
    status: conversationStatus(message.status),
    timestamp: message.createdAt,
    reasoning: message.reasoning
      ? {
        content: message.reasoning.content,
        durationMs: message.reasoning.durationMs,
        isStreaming: message.status === "streaming"
      }
      : undefined,
    metadata: message.traceIds?.length ? message.traceIds.map((traceId) => `trace: ${traceId}`) : undefined
  };
}

function toolCallMessageToConversationEvent(message: RuntimeChatMessage, index: number): AgentConversationEvent {
  const tool = message.toolCall!;
  const content = [
    tool.inputSummary ? `Input: ${tool.inputSummary}` : "",
    tool.outputSummary ? `Output: ${tool.outputSummary}` : "",
    message.content
  ].filter(Boolean).join("\n\n");
  return {
    id: message.id || `${tool.id}-${index}`,
    kind: "tool_call",
    role: "runtime",
    title: tool.name,
    content,
    status: conversationStatus(tool.status),
    timestamp: message.createdAt,
    metadata: compactMetadata([
      `risk: ${tool.riskLevel}`,
      `tool: ${tool.id}`,
      ...(message.traceIds ?? []).map((traceId) => `trace: ${traceId}`)
    ])
  };
}

function permissionMessageToConversationEvent(
  message: RuntimeChatMessage,
  handlePermission: (pid: string, approval: "approve" | "reject") => void
): AgentConversationEvent {
  const permission = message.permissionRequest!;
  return {
    id: message.id,
    kind: "permission",
    role: "runtime",
    title: permission.title,
    content: [permission.description, message.content].filter(Boolean).join("\n\n"),
    status: conversationStatus(message.status) ?? "pending",
    timestamp: message.createdAt,
    metadata: compactMetadata([
      permission.actionType,
      ...permission.affectedPaths.map((path) => `path: ${path}`),
      ...permission.affectedNodeIds.map((id) => `node: ${id}`),
      ...permission.affectedEdgeIds.map((id) => `edge: ${id}`)
    ]),
    actions: permission.options
      .filter((option): option is { id: "approve" | "reject"; label: string } => option.id === "approve" || option.id === "reject")
      .map((option) => ({
        label: option.label,
        tone: option.id === "approve" ? "primary" : "danger",
        onClick: () => handlePermission(permission.id, option.id)
      }))
  };
}

function planMessageToConversationEvent(message: RuntimeChatMessage): AgentConversationEvent {
  const plan = message.plan!;
  return {
    id: message.id,
    kind: "plan",
    role: "assistant",
    title: "Plan",
    content: [
      message.content,
      plan.summary,
      formatPlanActionList(plan.actions),
      formatStringList("Questions", plan.questions)
    ].filter(Boolean).join("\n\n"),
    status: conversationStatus(message.status),
    timestamp: message.createdAt,
    reasoning: message.reasoning ? { content: message.reasoning.content, durationMs: message.reasoning.durationMs } : undefined,
    metadata: compactMetadata([
      `${plan.actions.length} actions`,
      `${plan.codingTasks.length} coding tasks`,
      `${plan.missingGluePoints.length} missing glue points`
    ])
  };
}

function taskMessageToConversationEvent(message: RuntimeChatMessage): AgentConversationEvent {
  const task = message.task!;
  return {
    id: message.id,
    kind: "final_summary",
    role: "assistant",
    title: task.title,
    content: [
      message.content,
      task.instruction,
      formatStringList("Acceptance criteria", task.acceptanceCriteria),
      formatStringList("Verification", task.verificationCommands)
    ].filter(Boolean).join("\n\n"),
    status: conversationStatus(message.status),
    timestamp: message.createdAt,
    metadata: compactMetadata([
      `task: ${task.id}`,
      ...task.scope.allowedPaths.map((path) => `allow: ${path}`),
      ...task.scope.forbiddenPaths.map((path) => `deny: ${path}`)
    ])
  };
}

function conversationTitleForRole(role: RuntimeChatMessage["role"]): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Praxis";
  if (role === "result") return "Result";
  if (role === "system") return "System";
  if (role === "error") return "Error";
  return "Runtime";
}

function conversationStatus(status: RuntimeChatMessage["status"] | RuntimeToolCallView["status"] | undefined): AgentConversationEvent["status"] {
  if (status === "streaming" || status === "running") return "running";
  if (status === "success") return "done";
  return status;
}

function formatPlanActionList(actions: RuntimePlanAction[]): string {
  if (!actions.length) return "";
  return [
    "Actions:",
    ...actions.map((action) => `- ${action.title}: ${action.description}`)
  ].join("\n");
}

function formatStringList(title: string, values: string[]): string {
  if (!values.length) return "";
  return [
    `${title}:`,
    ...values.map((value) => `- ${value}`)
  ].join("\n");
}

function compactMetadata(values: string[]): string[] | undefined {
  const compacted = values.map((value) => value.trim()).filter(Boolean);
  return compacted.length ? compacted.slice(0, 12) : undefined;
}

function latestToolMessages(messages: RuntimeChatMessage[]): RuntimeChatMessage[] {
  const byToolCall = new Map<string, RuntimeChatMessage>();
  for (const message of messages) {
    if (!message.toolCall) continue;
    byToolCall.set(message.toolCall.id, message);
  }
  return [...byToolCall.values()];
}

// ─── Right Panels ───────────────────────────────────────────

function ContextPanel({ target, graph }: { target: RuntimeNode | RuntimeEdge | null; graph: RuntimeGraph | null }) {
  if (!target) {
    return (
      <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2" }}>Project Context</div>
        <div>{graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges` : "Loading..."}</div>
        <div style={{ marginTop: 8 }}>Select a node or edge from the left panel to see its context.</div>
      </div>
    );
  }

  const isNode = "kind" in target;
  return (
    <div style={{ fontSize: 12, color: "#96a3b5" }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2" }}>
        {isNode ? "Node" : "Edge"}: {target.title ?? target.id}
      </div>
      {isNode ? (
        <>
          <div>Kind: {(target as RuntimeNode).kind}</div>
          <div>Progress: {Math.round((target as RuntimeNode).progress * 100)}%</div>
          <div>Status: {(target as RuntimeNode).status}</div>
          <div>Knowledge: {(target as RuntimeNode).knowledgeKind}</div>
          {(target as RuntimeNode).description && (
            <div style={{ marginTop: 8, color: "#e8edf2" }}>{(target as RuntimeNode).description}</div>
          )}
        </>
      ) : (
        <>
          <div>Kind: {(target as RuntimeEdge).kind}</div>
          <div>Progress: {Math.round((target as RuntimeEdge).progress * 100)}%</div>
          <div>Risk: {(target as RuntimeEdge).riskLevel}</div>
          <div>Knowledge: {(target as RuntimeEdge).knowledgeKind}</div>
          {(target as RuntimeEdge).blockedReason && (
            <div style={{ marginTop: 8, color: "#f87171" }}>Blocked: {(target as RuntimeEdge).blockedReason}</div>
          )}
        </>
      )}
    </div>
  );
}

function ToolCallsPanel({ messages }: { messages: RuntimeChatMessage[] }) {
  const toolMsgs = latestToolMessages(messages);
  if (toolMsgs.length === 0) {
    return <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>还没有工具调用。发送消息后，这里会显示 Pi 启动、工具运行和完成状态。</div>;
  }
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2", fontSize: 11, textTransform: "uppercase" }}>运行过程 / 工具调用 ({toolMsgs.length})</div>
      {toolMsgs.map((m) => (
        m.toolCall && <ToolCallCard key={m.id} tool={m.toolCall} />
      ))}
    </div>
  );
}

function PlanPanel({ plan }: { plan: RuntimeGraphPlan | null }) {
  if (!plan) {
    return <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>No plan generated yet. Switch to Plan mode and ask the agent to plan next steps.</div>;
  }
  return <PlanCard plan={plan} />;
}

function MemoryPanel({ projectRoot: _root }: { projectRoot: string }) {
  return (
    <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2", fontSize: 11, textTransform: "uppercase" }}>Project Memory</div>
      <div>Check .distinction/memory/ for:</div>
      <ul style={{ paddingLeft: 16, marginTop: 4 }}>
        <li>changes.md — change log</li>
        <li>decisions.md — design decisions</li>
        <li>traces.jsonl — trace events</li>
        <li>incidents.json — incidents</li>
        <li>do-not-repeat.md — anti-patterns</li>
      </ul>
    </div>
  );
}

function DiffPanel({ messages }: { messages: RuntimeChatMessage[] }) {
  const patches = messages.filter((m) => m.role === "result" && m.content.includes("patch"));
  if (patches.length === 0) {
    return <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>No patches yet. Use propose_patch / apply_patch tools to modify files.</div>;
  }
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2", fontSize: 11, textTransform: "uppercase" }}>Patches</div>
      {patches.map((m) => (
        <pre key={m.id} style={{ fontSize: 11, color: "#e8edf2", background: "#161b22", padding: 8, borderRadius: 4, overflow: "auto", whiteSpace: "pre-wrap" }}>
          {m.content}
        </pre>
      ))}
    </div>
  );
}

function LogsPanel({
  projectRoot,
  sessionId,
  runResult
}: {
  projectRoot: string;
  sessionId: string;
  runResult: RuntimeAgentRunResult | null;
}) {
  const paths = runResult?.logPaths ?? agentLogPaths(projectRoot, sessionId, runResult?.runPath);
  return (
    <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2", fontSize: 11, textTransform: "uppercase" }}>Agent Logs</div>
      <div style={{ marginBottom: 8 }}>Agent Workspace writes chat transcript, run details and traces into the project .distinction directory.</div>
      <LogPath label="Chat transcript" value={paths.chatTranscript} />
      <LogPath label="Chat sessions index" value={paths.chatSessionsIndex} />
      <LogPath label="Run record" value={paths.runPath || "Run record appears after an agent run finishes."} />
      <LogPath label="Runs index" value={paths.runsIndex} />
      <LogPath label="Trace log" value={paths.traces} />
    </div>
  );
}

function LogPath({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3, padding: "7px 0", borderTop: "1px solid #1a2332" }}>
      <strong style={{ color: "#e8edf2", fontSize: 11 }}>{label}</strong>
      <code style={{ color: "#8deadd", fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</code>
    </div>
  );
}

function agentLogPaths(projectRoot: string, sessionId: string, runPath?: string): RuntimeAgentLogPaths {
  const base = `${projectRoot}\\.distinction`;
  return {
    chatSessionsIndex: `${base}\\chat\\sessions.json`,
    chatTranscript: sessionId ? `${base}\\chat\\sessions\\${sessionId}.jsonl` : `${base}\\chat\\sessions\\<session-id>.jsonl`,
    runsIndex: `${base}\\runs\\runs.jsonl`,
    runPath,
    traces: `${base}\\memory\\traces.jsonl`
  };
}

// ─── Legacy card wrappers (used by right panels) ─────────────

function ToolCallCard({ tool }: { tool: RuntimeToolCallView }) {
  const statusColors: Record<string, string> = { pending: "#96a3b5", running: "#eba341", success: "#7ee787", failed: "#f87171" };
  const color = statusColors[tool.status] ?? "#96a3b5";
  return (
    <div style={{ padding: "4px 8px", border: `1px solid ${color}33`, borderRadius: 4, fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "#e8edf2", fontWeight: 600 }}>{tool.name}</span>
      <span style={{ color, marginLeft: 8 }}>{tool.status}</span>
      {tool.inputSummary && <div style={{ color: "#96a3b5", fontSize: 10 }}>{tool.inputSummary}</div>}
      {tool.outputSummary && <div style={{ color: "#b7c4d4", fontSize: 10 }}>{tool.outputSummary}</div>}
    </div>
  );
}

function PermissionCard({ permission, onApprove, onReject }: {
  permission: { id: string; title: string; description: string; actionType: string; affectedPaths: string[]; options: { id: string; label: string }[] };
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{ padding: 8, borderRadius: 6, border: "1px solid #f0883e44", fontSize: 12, marginBottom: 6 }}>
      <div style={{ fontWeight: 600, color: "#f0883e" }}>{permission.title}</div>
      <div style={{ color: "#96a3b5", fontSize: 10, marginTop: 2 }}>{permission.actionType}</div>
      <div style={{ color: "#e8edf2", fontSize: 11 }}>{permission.description}</div>
      {permission.affectedPaths.length > 0 && (
        <div style={{ marginTop: 6, color: "#96a3b5", fontSize: 10 }}>
          {permission.affectedPaths.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button onClick={onApprove} style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: "#7ee78733", color: "#7ee787", cursor: "pointer", fontSize: 11 }}>Approve</button>
        <button onClick={onReject} style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: "#f8717133", color: "#f87171", cursor: "pointer", fontSize: 11 }}>Reject</button>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: RuntimeGraphPlan }) {
  return (
    <div style={{ padding: 8, borderRadius: 6, border: "1px solid #58a6ff44", fontSize: 12, marginBottom: 6 }}>
      <div style={{ fontWeight: 600, color: "#58a6ff" }}>Plan</div>
      <div style={{ color: "#e8edf2", fontSize: 11 }}>{plan.summary}</div>
      <div style={{ fontSize: 10, color: "#96a3b5", marginTop: 4 }}>{plan.actions.length} action(s)</div>
    </div>
  );
}
