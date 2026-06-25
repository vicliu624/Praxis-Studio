import {
  readDistinctionFile,
  writeDistinctionFile,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";

const AGENT_HISTORY_RELATIVE_PATH = ".distinction/runtime/agent-conversation-history.json";
const MAX_HISTORY_ENTRIES = 500;

interface ScopedAgentHistoryFile {
  schemaVersion: "praxis.agentConversationHistory.v1";
  root: string;
  updatedAt: string;
  entries: RuntimeScopedAgentHistoryEntry[];
}

export async function readScopedAgentHistory(root: string): Promise<RuntimeScopedAgentHistoryEntry[]> {
  try {
    const content = await readDistinctionFile(root, AGENT_HISTORY_RELATIVE_PATH);
    const parsed = JSON.parse(content) as Partial<ScopedAgentHistoryFile>;
    return normalizeHistoryEntries(parsed.entries);
  } catch {
    return [];
  }
}

export async function appendScopedAgentHistoryEntries(
  root: string,
  entries: RuntimeScopedAgentHistoryEntry[]
): Promise<RuntimeScopedAgentHistoryEntry[]> {
  const current = await readScopedAgentHistory(root);
  const next = dedupeHistoryEntries([...current, ...normalizeHistoryEntries(entries)]).slice(-MAX_HISTORY_ENTRIES);
  const payload: ScopedAgentHistoryFile = {
    schemaVersion: "praxis.agentConversationHistory.v1",
    root,
    updatedAt: new Date().toISOString(),
    entries: next
  };
  await writeDistinctionFile(root, AGENT_HISTORY_RELATIVE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  return next;
}

function normalizeHistoryEntries(value: unknown): RuntimeScopedAgentHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Partial<RuntimeScopedAgentHistoryEntry>;
    const id = stringValue(record.id);
    const role = record.role === "user" || record.role === "assistant" || record.role === "system" ? record.role : undefined;
    const text = stringValue(record.text);
    const timestamp = stringValue(record.timestamp);
    const scopeId = stringValue(record.scopeId);
    const scopeTitle = stringValue(record.scopeTitle);
    if (!id || !role || !text || !timestamp || !scopeId || !scopeTitle) return [];
    return [{
      id,
      role,
      text,
      timestamp,
      scopeId,
      scopeTitle,
      scopeKind: stringValue(record.scopeKind),
      contextTitle: stringValue(record.contextTitle),
      contextPath: stringValue(record.contextPath),
      intent: stringValue(record.intent),
      status: stringValue(record.status)
    }];
  });
}

function dedupeHistoryEntries(entries: RuntimeScopedAgentHistoryEntry[]): RuntimeScopedAgentHistoryEntry[] {
  const seen = new Set<string>();
  const result: RuntimeScopedAgentHistoryEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
