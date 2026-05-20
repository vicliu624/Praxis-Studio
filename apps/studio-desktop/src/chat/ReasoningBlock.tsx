import { useEffect, useRef, useState } from "react";

interface ReasoningBlockProps {
  content: string;
  durationMs?: number;
  isStreaming?: boolean;
}

export function ReasoningBlock({ content, durationMs, isStreaming }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const hasAutoCollapsed = useRef(false);

  // Auto-expand when streaming starts, auto-collapse once when streaming ends
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
      hasAutoCollapsed.current = false;
    } else if (!hasAutoCollapsed.current && expanded) {
      const timer = setTimeout(() => {
        setExpanded(false);
        hasAutoCollapsed.current = true;
        setAutoCollapsed(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  if (!content) return null;

  const durationText = durationMs
    ? durationMs < 2000
      ? "Thought for a few seconds"
      : `Thought for ${Math.round(durationMs / 1000)} seconds`
    : "Thinking...";

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", textAlign: "left", padding: "6px 12px", borderRadius: 6,
          border: "1px solid rgba(139, 92, 246, 0.2)", background: "rgba(139, 92, 246, 0.06)",
          color: "#a78bfa", cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "inherit"
        }}
      >
        <span
          style={{
            fontSize: 10,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block"
          }}
        >
          ▶
        </span>
        <span style={{ fontSize: 14, lineHeight: 1 }}>🧠</span>
        <span style={{ color: "#a78bfa", fontWeight: 500 }}>
          {isStreaming ? "Thinking..." : durationText}
        </span>
        {isStreaming && (
          <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16 }}>
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#a78bfa",
              animation: "thinking-dot 1.4s infinite"
            }} />
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#a78bfa",
              animation: "thinking-dot 1.4s infinite 0.2s"
            }} />
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#a78bfa",
              animation: "thinking-dot 1.4s infinite 0.4s"
            }} />
          </span>
        )}
      </button>

      {expanded && (
        <div style={{
          marginTop: 4, padding: "8px 12px 8px 28px",
          background: "rgba(139, 92, 246, 0.04)", borderRadius: "0 0 6px 6px",
          border: "1px solid rgba(139, 92, 246, 0.1)", borderTop: "none",
          color: "#c4b5fd", fontSize: 12, lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: 300, overflowY: "auto"
        }}>
          {content}
        </div>
      )}

      <style>{`
        @keyframes thinking-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
