import { useEffect, useRef, useState } from "react";

export interface Command {
  name: string;
  description: string;
  hint?: string;
  action?: (insertText: string) => void;
}

interface CommandMenuProps {
  commands: Command[];
  visible: boolean;
  query: string;
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandMenu({ commands, visible, query, onSelect, onClose }: CommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = commands.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          onSelect(filtered[activeIndex]);
        }
      } else if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        onClose();
      }
    }

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [visible, filtered, activeIndex, onSelect, onClose]);

  // Scroll active into view
  useEffect(() => {
    const active = menuRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        marginBottom: 4,
        background: "#101721",
        border: "1px solid #1a2332",
        borderRadius: 8,
        overflow: "hidden",
        zIndex: 100,
        maxHeight: 260,
        overflowY: "auto"
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: "12px 16px", color: "#96a3b5", fontSize: 12, textAlign: "center" }}>
          No matching commands
        </div>
      ) : (
        filtered.map((cmd, i) => (
          <div
            key={cmd.name}
            data-index={i}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setActiveIndex(i)}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              background: i === activeIndex ? "rgba(235, 163, 65, 0.1)" : "transparent",
              borderLeft: i === activeIndex ? "2px solid #eba341" : "2px solid transparent",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div>
              <span style={{ color: "#eba341", fontWeight: 600, fontSize: 13 }}>
                /{cmd.name}
              </span>
              <span style={{ color: "#96a3b5", fontSize: 12, marginLeft: 8 }}>
                {cmd.description}
              </span>
            </div>
            {cmd.hint && (
              <span style={{ color: "#96a3b5", fontSize: 10, opacity: 0.6 }}>
                {cmd.hint}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function useCommands(): Command[] {
  return [
    { name: "explain", description: "Explain the selected target in detail", hint: "read-only" },
    { name: "plan", description: "Plan next steps for the selected target", hint: "generates plan" },
    { name: "fix", description: "Find and fix a bug or issue", hint: "analysis + patch" },
    { name: "refactor", description: "Suggest refactoring improvements", hint: "read-only" },
    { name: "review", description: "Review code for issues and improvements", hint: "read-only" },
    { name: "test", description: "Generate or fix tests", hint: "generates code" },
    { name: "docs", description: "Generate documentation", hint: "writes docs" },
    { name: "search", description: "Search the codebase for a pattern", hint: "grep" },
    { name: "file", description: "Read and analyze a specific file", hint: "read-only" },
    { name: "graph", description: "Show the Development Graph", hint: "read-only" },
    { name: "memory", description: "Read project memory and decisions", hint: "read-only" },
    { name: "clear", description: "Start a new conversation session", hint: "reset" },
  ];
}
