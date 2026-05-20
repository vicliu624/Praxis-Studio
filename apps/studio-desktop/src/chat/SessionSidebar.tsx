import { useCallback, useEffect, useState } from "react";
import type { RuntimeChatSession } from "../runtimeClient";

interface SessionSidebarProps {
  projectRoot: string;
  activeSessionId: string | null;
  onSelectSession: (session: RuntimeChatSession) => void;
  onNewSession: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function SessionSidebar({
  activeSessionId,
  onSelectSession,
  onNewSession,
  collapsed,
  onToggle
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<RuntimeChatSession[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      // Sessions come from the .distinction/chat/sessions.json
      // For now, we rely on parent to pass them via messages/session state
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filtered = search
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
      )
    : sessions;

  const grouped = groupByDate(filtered);

  return (
    <div
      style={{
        width: collapsed ? 48 : 240,
        flexShrink: 0,
        borderRight: "1px solid #1a2332",
        background: "#0d1117",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s",
        overflow: "hidden"
      }}
    >
      {/* Toggle + New */}
      <div style={{
        padding: "8px 10px",
        borderBottom: "1px solid #1a2332",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        {!collapsed && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e8edf2" }}>Sessions</span>
        )}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onNewSession}
            title="New Session"
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1px solid #1a2332",
              background: "transparent", color: "#96a3b5", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            +
          </button>
          <button
            onClick={onToggle}
            title={collapsed ? "Expand" : "Collapse"}
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1px solid #1a2332",
              background: "transparent", color: "#96a3b5", cursor: "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            {collapsed ? "→" : "←"}
          </button>
        </div>
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ padding: "6px 8px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            style={{
              width: "100%", padding: "5px 8px", borderRadius: 6,
              background: "#161b22", border: "1px solid #1a2332",
              color: "#e8edf2", fontSize: 11, outline: "none"
            }}
          />
        </div>
      )}

      {/* Session List */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "#96a3b5", fontSize: 12 }}>
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#96a3b5", fontSize: 12 }}>
              No sessions yet
            </div>
          ) : (
            Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <div style={{
                  padding: "6px 10px 2px", fontSize: 10, fontWeight: 600,
                  color: "#96a3b5", textTransform: "uppercase"
                }}>
                  {label}
                </div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s)}
                    style={{
                      padding: "6px 10px",
                      cursor: "pointer",
                      background: s.id === activeSessionId ? "rgba(235, 163, 65, 0.08)" : "transparent",
                      borderLeft: s.id === activeSessionId ? "3px solid #eba341" : "3px solid transparent",
                      fontSize: 12
                    }}
                  >
                    <div style={{
                      color: s.id === activeSessionId ? "#e8edf2" : "#96a3b5",
                      fontWeight: s.id === activeSessionId ? 600 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 10, color: "#96a3b5", opacity: 0.6 }}>
                      {formatRelativeTime(s.updatedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function groupByDate(sessions: RuntimeChatSession[]): Record<string, RuntimeChatSession[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const thisWeek = today - 7 * 86400000;

  const groups: Record<string, RuntimeChatSession[]> = {};

  for (const s of sessions) {
    const d = new Date(s.updatedAt).getTime();
    let key: string;
    if (d >= today) key = "Today";
    else if (d >= yesterday) key = "Yesterday";
    else if (d >= thisWeek) key = "This Week";
    else key = "Older";

    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }

  return groups;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
