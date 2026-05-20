import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelAgentRun,
  createChatSession,
  readChatSession,
  respondToPermission,
  sendChatMessage,
  startAgentRun,
  readGraph,
  type RuntimeAgentRunResult,
  type RuntimeAgentStep,
  type RuntimeChatMessage,
  type RuntimeChatSession,
  type RuntimeChatTarget,
  type RuntimeChatTranscriptResult,
  type RuntimeGraph,
  type RuntimeNode,
  type RuntimeEdge,
  type RuntimeGraphPlan,
  type RuntimePlanAction,
  type RuntimeToolCallView
} from "../runtimeClient";
import { useI18n } from "../i18n";
import { CommandMenu, useCommands, type Command } from "../chat/CommandMenu";
import { SessionSidebar } from "../chat/SessionSidebar";
import { Markdown } from "../chat/Markdown";
import { ReasoningBlock } from "../chat/ReasoningBlock";

interface AgentWorkspacePageProps {
  projectRoot: string;
  onNavigateToGraph: () => void;
  onNavigateToSettings: () => void;
  onNavigateHome: () => void;
}

type WorkspaceView = "chat" | "graph" | "memory" | "files";

export function AgentWorkspacePage({ projectRoot, onNavigateToGraph, onNavigateToSettings, onNavigateHome }: AgentWorkspacePageProps) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<RuntimeGraph | null>(null);
  const [session, setSession] = useState<RuntimeChatSession | null>(null);
  const [messages, setMessages] = useState<RuntimeChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"explain" | "plan">("explain");
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RuntimeAgentRunResult | null>(null);
  const [runSteps, setRunSteps] = useState<RuntimeAgentStep[]>([]);
  const [error, setError] = useState("");
  const [leftView, setLeftView] = useState<WorkspaceView>("files");
  const [rightView, setRightView] = useState<"context" | "plan" | "tools" | "memory" | "diff">("context");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const messagesScroller = useRef<HTMLDivElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);
  const commands = useCommands();

  // ── Load graph ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    readGraph(projectRoot)
      .then((g) => { if (active) setGraph(g); })
      .catch(() => {});
    return () => { active = false; };
  }, [projectRoot]);

  // ── Create or load session ───────────────────────────────
  useEffect(() => {
    let active = true;
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
  }, [projectRoot, selectedNode, selectedEdge]);

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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    return () => {
      pollRef.current = null;
    };
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !session) return;
    setShowCommands(false);
    setInput("");
    setError("");
    setRunResult(null);
    setRunSteps([]);
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

    const sid = session.id;
    const target: RuntimeChatTarget = selectedNode
      ? { type: "node", id: selectedNode }
      : selectedEdge
        ? { type: "edge", id: selectedEdge }
        : { type: "project" };

    // Fire-and-forget: start agent via async spawn (returns immediately)
    startAgentRun(projectRoot, target, mode, text, sid)
      .then((result) => { if (result.runStatus !== "running") setRunResult(result); })
      .catch((err) => { setError(err instanceof Error ? err.message : String(err)); });
    // Agent runs in background — polling below will detect completion

    // Recursive polling: stops when agent is done
    pollCountRef.current = 0;
    let polling = true;
    pollRef.current = 1 as any;
    
    const doPoll = async () => {
      if (!polling || pollRef.current === null) return;
      pollCountRef.current++;
      try {
        const transcript = await readChatSession(projectRoot, sid);
        if (!polling || pollRef.current === null) return;
        setMessages(transcript.messages);
        
        // Detect completion: last message is assistant (not tool/permission), or an error
        const msgs = transcript.messages;
        if (msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          const isDone = last.role === "assistant"
                      || last.role === "error"
                      || last.status === "failed"
                      || last.status === "cancelled";
          
          if (isDone && pollCountRef.current > 2) {
            // Agent is done — stop polling
            polling = false;
            pollRef.current = null;
            setIsRunning(false);
            // Try to get the run result
            setRunResult({
              ok: last.role !== "error",
              sessionId: sid,
              runId: "",
              runPath: "",
              runStatus: last.role === "error" || last.status === "failed" ? "failed" : last.status === "cancelled" ? "cancelled" : "completed",
              stepCount: pollCountRef.current,
              finalMessage: last.content
            });
            return;
          }
        }
        
        // Timeout after 60 minutes (7200 polls at 500ms). Permission waits can legitimately be long.
        if (pollCountRef.current > 7200) {
          polling = false;
          pollRef.current = null;
          setIsRunning(false);
          setError("Agent run timed out after 60 minutes.");
          return;
        }
      } catch {}
      if (polling && pollRef.current !== null) setTimeout(doPoll, 500);
    };
    setTimeout(doPoll, 500);
  }, [input, session, selectedNode, selectedEdge, mode, projectRoot]);

  // ── Permission response ──────────────────────────────────
  const handlePermission = useCallback(async (permissionId: string, approval: "approve" | "reject") => {
    if (!session) return;
    // Write response file that the agent is polling
    await respondToPermission(projectRoot, permissionId, approval);
    shouldStickToBottom.current = true;
    // Agent will pick up the response within 1 second and continue
  }, [session, selectedNode, selectedEdge, projectRoot]);

  const handleCancelRun = useCallback(async () => {
    await cancelAgentRun(projectRoot);
    setError("Agent cancellation requested.");
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>Praxis Studio</span>
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
            <FileTreePanel root={projectRoot} onSelectNode={setSelectedNode} />
          )}
          {leftView === "graph" && (
            <GraphShortcutsPanel
              nodes={nodeList}
              edges={edgeList}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onSelectNode={(id) => { setSelectedNode(id); setSelectedEdge(null); }}
              onSelectEdge={(id) => { setSelectedEdge(id); setSelectedNode(null); }}
              onOpenGraph={onNavigateToGraph}
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
          <button className="small-btn" onClick={onNavigateToGraph} style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: "#161b22", border: "1px solid #1a2332", color: "#96a3b5", borderRadius: 4, cursor: "pointer" }}>
            {t("nav.graphFocus")}
          </button>
        </div>
      </aside>

      {/* ── Center Chat ─────────────────────────── */}
      <main className="workspace-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#0b0f14" }}>
        {/* Chat Header */}
        <div className="chat-header" style={{ padding: "10px 16px", borderBottom: "1px solid #1a2332", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
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
                ● Agent running
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
          {messages.length === 0 && !isRunning && (
            <div style={{ textAlign: "center", color: "#96a3b5", marginTop: 80 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F4AC;</div>
              <div style={{ fontSize: 14 }}>{t("chat.emptyHint")}</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                {graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges` : t("chat.loadingGraph")}
              </div>
            </div>
          )}

          {renderMessages(messages, handlePermission)}

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
                pollRef.current = null;
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
          {(["context", "tools", "plan", "memory", "diff"] as const).map((v) => (
            <button
              key={v}
              className={`sidebar-tab ${rightView === v ? "active" : ""}`}
              onClick={() => setRightView(v)}
              style={{
                flex: 1, padding: "8px 2px", background: rightView === v ? "#161b22" : "transparent",
                border: "none", color: rightView === v ? "#e8edf2" : "#96a3b5", cursor: "pointer", fontSize: 11, borderBottom: rightView === v ? "2px solid #eba341" : "2px solid transparent"
              }}
            >
              {v === "context" ? t("panel.context") : v === "tools" ? t("panel.tools") : v === "plan" ? t("panel.plan") : v === "memory" ? t("panel.memory") : t("panel.diff")}
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

function FileTreePanel({ root, onSelectNode }: { root: string; onSelectNode: (id: string) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simple: we show directories only, actual file listing handled by agent tools
    const dirs = ["apps", "packages", "docs", "scripts", ".distinction"];
    setFiles(dirs);
    setLoading(false);
  }, [root]);

  if (loading) return <div style={{ color: "#96a3b5", fontSize: 12, padding: 8 }}>Loading...</div>;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ color: "#96a3b5", padding: "4px 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Project Map</div>
      {files.map((f) => (
        <div key={f} style={{ padding: "3px 8px", color: "#e8edf2", cursor: "pointer", borderRadius: 3 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#161b22")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          &#x1F4C1; {f}
        </div>
      ))}
      <div style={{ color: "#96a3b5", padding: "8px 8px 4px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", marginTop: 8 }}>Actions</div>
      <div style={{ padding: "3px 8px", color: "#96a3b5", fontSize: 11, fontStyle: "italic" }}>
        Type in chat to explore files. The agent can read and search automatically.
      </div>
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
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px" }}>
        <span style={{ color: "#96a3b5", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Nodes ({nodes.length})</span>
        <button onClick={onOpenGraph} style={{ fontSize: 10, background: "none", border: "1px solid #1a2332", color: "#eba341", borderRadius: 3, cursor: "pointer", padding: "2px 6px" }}>
          Open Graph
        </button>
      </div>
      {nodes.slice(0, 30).map((n) => (
        <div
          key={n.id}
          onClick={() => onSelectNode(n.id)}
          style={{
            padding: "4px 8px", cursor: "pointer", borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center",
            background: selectedNode === n.id ? "#161b22" : "transparent",
            borderLeft: selectedNode === n.id ? "2px solid #eba341" : "2px solid transparent"
          }}
          onMouseEnter={(e) => { if (selectedNode !== n.id) e.currentTarget.style.background = "#161b22"; }}
          onMouseLeave={(e) => { if (selectedNode !== n.id) e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ color: "#e8edf2" }}>{n.title}</span>
          <span style={{ color: "#96a3b5", fontSize: 10 }}>{Math.round(n.progress * 100)}%</span>
        </div>
      ))}
      {nodes.length > 30 && <div style={{ color: "#96a3b5", fontSize: 11, padding: 4, textAlign: "center" }}>+{nodes.length - 30} more</div>}

      <div style={{ color: "#96a3b5", padding: "8px 8px 4px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", marginTop: 8 }}>Edges</div>
      {edges.slice(0, 20).map((e) => (
        <div
          key={e.id}
          onClick={() => onSelectEdge(e.id)}
          style={{
            padding: "3px 8px", cursor: "pointer", borderRadius: 3, fontSize: 11,
            background: selectedEdge === e.id ? "#161b22" : "transparent",
            borderLeft: selectedEdge === e.id ? "2px solid #eba341" : "2px solid transparent"
          }}
          onMouseEnter={(ev) => { if (selectedEdge !== e.id) ev.currentTarget.style.background = "#161b22"; }}
          onMouseLeave={(ev) => { if (selectedEdge !== e.id) ev.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ color: "#e8edf2" }}>{e.kind}</span>
          <span style={{ color: e.riskLevel !== "none" ? "#f87171" : "#96a3b5", marginLeft: 6 }}>{e.riskLevel !== "none" ? "!" : ""}</span>
        </div>
      ))}
    </div>
  );
}

// ─── MemoryQuickPanel ───────────────────────────────────────

function MemoryQuickPanel({ projectRoot: _root }: { projectRoot: string }) {
  return (
    <div style={{ fontSize: 12, color: "#96a3b5" }}>
      <div style={{ padding: "4px 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Memory</div>
      <div style={{ padding: 8 }}>Use chat to read and write project memory. The agent can access .distinction/memory/ files.</div>
    </div>
  );
}

// ─── AgentChatMessage (Claude Code style: user right, thinking collapsed) ──

function AgentChatMessage({
  message,
  onApprovePermission,
  onRejectPermission,
  toolGroup,
  groupIndex,
  totalInGroup
}: {
  message: RuntimeChatMessage;
  onApprovePermission: (id: string) => void;
  onRejectPermission: (id: string) => void;
  toolGroup?: RuntimeChatMessage[];
  groupIndex?: number;
  totalInGroup?: number;
}) {
  const isUser = message.role === "user";

  // Tool messages are rendered via toolGroup, not individually
  if (message.role === "tool" && toolGroup && groupIndex !== 0) return null;
  if (message.role === "tool" && !toolGroup) return null;

  return (
    <div style={{
      marginBottom: 10, display: "flex", gap: 10,
      flexDirection: isUser ? "row-reverse" : "row"
    }}>
      {/* Role label */}
      <div style={{ width: 50, flexShrink: 0, textAlign: isUser ? "left" : "right", paddingTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: isUser ? "#eba341" : "#58a6ff" }}>
          {isUser ? "You" : "Praxis"}
        </div>
        <div style={{ fontSize: 9, color: "#96a3b5" }}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Tool group — collapsed thinking block */}
        {toolGroup && groupIndex === 0 && (
          <ThinkingBlock messages={toolGroup} />
        )}

        {/* Permission request */}
        {message.permissionRequest && (
          <PermissionCard
            permission={message.permissionRequest}
            onApprove={() => onApprovePermission(message.permissionRequest!.id)}
            onReject={() => onRejectPermission(message.permissionRequest!.id)}
          />
        )}

        {/* Plan */}
        {message.plan && (
          <PlanCard plan={message.plan} />
        )}

        {/* Reasoning block */}
        {message.reasoning && (
          <ReasoningBlock
            content={message.reasoning.content}
            durationMs={message.reasoning.durationMs}
          />
        )}

        {/* Text content (non-tool) */}
        {message.content && message.role !== "tool" && (
          <div style={{ position: "relative", maxWidth: "85%", marginLeft: isUser ? "auto" : 0, marginRight: isUser ? 0 : "auto" }}>
            <div style={{
              padding: isUser ? "8px 14px" : "10px 16px",
              borderRadius: 12,
              background: isUser ? "#1a3350" : "#161b22",
              color: "#e8edf2", fontSize: 13, lineHeight: 1.55,
              whiteSpace: isUser ? "pre-wrap" : "normal",
              wordBreak: "break-word"
            }}>
              {isUser ? message.content : <Markdown content={message.content} />}
            </div>
            {!isUser && (
              <button
                onClick={() => { navigator.clipboard.writeText(message.content).catch(() => {}); }}
                title="Copy"
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 24, height: 24, borderRadius: 4,
                  border: "none", background: "transparent",
                  color: "#96a3b5", cursor: "pointer", fontSize: 12,
                  opacity: 0.3, display: "flex", alignItems: "center", justifyContent: "center"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
              >
                ⎘
              </button>
            )}
          </div>
        )}

        {message.status === "failed" && (
          <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>Failed</div>
        )}
      </div>
    </div>
  );
}

// ─── ThinkingBlock — collapsible group of tool calls ─────────

function ThinkingBlock({ messages }: { messages: RuntimeChatMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  const toolMsgs = latestToolMessages(messages);
  const toolNames = [...new Set(toolMsgs.map(m => m.toolCall?.name).filter(Boolean))];
  const successes = toolMsgs.filter(m => m.toolCall?.status === "success").length;
  const failed = toolMsgs.filter(m => m.toolCall?.status === "failed").length;
  const running = toolMsgs.filter(m => m.toolCall?.status === "running").length;

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", textAlign: "left", padding: "6px 12px", borderRadius: 6,
          border: "1px solid #1a2332", background: "#0d1117",
          color: "#96a3b5", cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "inherit"
        }}
      >
        <span style={{ fontSize: 10, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </span>
        <span style={{ color: "#e8edf2" }}>
          {toolMsgs.length} tool{toolMsgs.length > 1 ? "s" : ""}: {toolNames.join(", ")}
        </span>
        {running > 0 && <span style={{ color: "#eba341", fontSize: 10 }}>▶ running</span>}
        {successes > 0 && <span style={{ color: "#7ee787", fontSize: 10 }}>✓ {successes}</span>}
        {failed > 0 && <span style={{ color: "#f87171", fontSize: 10 }}>✗ {failed}</span>}
      </button>

      {expanded && (
        <div style={{ marginTop: 4, padding: "4px 8px", borderRadius: 4, background: "#0d1117", border: "1px solid #1a2332" }}>
          {toolMsgs.map((m, i) => (
            m.toolCall && (
              <div key={m.id} style={{
                padding: "4px 8px", borderTop: i > 0 ? "1px solid #1a2332" : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    color: m.toolCall.status === "success" ? "#7ee787" : m.toolCall.status === "failed" ? "#f87171" : m.toolCall.status === "running" ? "#eba341" : "#96a3b5",
                    fontSize: 10
                  }}>
                    {m.toolCall.status === "running" ? "▶" : m.toolCall.status === "success" ? "✓" : m.toolCall.status === "failed" ? "✗" : "○"}
                  </span>
                  <span style={{ color: "#e8edf2", fontSize: 12, fontWeight: 500 }}>{m.toolCall.name}</span>
                  <span style={{ color: "#96a3b5", fontSize: 10 }}>{m.toolCall.riskLevel}</span>
                </span>
                <span style={{ fontSize: 11, color: "#96a3b5", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.toolCall.inputSummary}
                </span>
              </div>
            )
          ))}
        </div>
      )}
    </div>
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


// ─── Message grouping helper ────────────────────────────────

function renderMessages(
  messages: RuntimeChatMessage[],
  handlePermission: (pid: string, approval: "approve" | "reject") => void
) {
  const result: React.ReactNode[] = [];
  let toolGroup: RuntimeChatMessage[] = [];
  const latestToolMessageIds = new Set(latestToolMessages(messages).map((message) => message.id));
  const visibleMessages = messages.filter((message) => !message.toolCall || latestToolMessageIds.has(message.id));

  for (let i = 0; i < visibleMessages.length; i++) {
    const msg = visibleMessages[i];

    if (msg.role === "tool") {
      toolGroup.push(msg);
      // If next message is not tool or this is the last, render group
      if (i === visibleMessages.length - 1 || visibleMessages[i + 1]?.role !== "tool") {
        result.push(
          <AgentChatMessage
            key={toolGroup[0].id}
            message={toolGroup[0]}
            onApprovePermission={(pid) => handlePermission(pid, "approve")}
            onRejectPermission={(pid) => handlePermission(pid, "reject")}
            toolGroup={toolGroup}
            groupIndex={0}
            totalInGroup={toolGroup.length}
          />
        );
        toolGroup = [];
      }
    } else {
      result.push(
        <AgentChatMessage
          key={msg.id}
          message={msg}
          onApprovePermission={(pid) => handlePermission(pid, "approve")}
          onRejectPermission={(pid) => handlePermission(pid, "reject")}
        />
      );
    }
  }
  return result;
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
    return <div style={{ fontSize: 12, color: "#96a3b5", padding: 8 }}>No tool calls yet. Start an agent run to see tools in action.</div>;
  }
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#e8edf2", fontSize: 11, textTransform: "uppercase" }}>Tool Calls ({toolMsgs.length})</div>
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

// ─── Legacy card wrappers (used by right panels) ─────────────

function ToolCallCard({ tool }: { tool: RuntimeToolCallView }) {
  const statusColors: Record<string, string> = { pending: "#96a3b5", running: "#eba341", success: "#7ee787", failed: "#f87171" };
  const color = statusColors[tool.status] ?? "#96a3b5";
  return (
    <div style={{ padding: "4px 8px", border: `1px solid ${color}33`, borderRadius: 4, fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "#e8edf2", fontWeight: 600 }}>{tool.name}</span>
      <span style={{ color, marginLeft: 8 }}>{tool.status}</span>
      {tool.inputSummary && <div style={{ color: "#96a3b5", fontSize: 10 }}>{tool.inputSummary}</div>}
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
