import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodingAgentTask } from "@praxis/coding-agent-adapter";
import type { GraphPlan } from "@praxis/plan-model";

export type ChatTarget =
  | { type: "project" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

export type ChatMode = "explain" | "plan" | "apply" | "task";

export interface ChatSession {
  id: string;
  projectRoot: string;
  title: string;
  target: ChatTarget;
  mode: ChatMode;
  modelRoute?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatMessageRole = "user" | "assistant" | "system" | "tool" | "permission" | "result" | "error";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  createdAt: string;
  content: string;
  status?: "streaming" | "done" | "failed" | "cancelled";
  structured?: unknown;
  toolCall?: ToolCallView;
  permissionRequest?: PermissionRequestView;
  plan?: GraphPlan;
  task?: CodingAgentTask;
  traceIds?: string[];
}

export interface ToolCallView {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  inputSummary: string;
  outputSummary?: string;
  riskLevel: "read" | "plan" | "write_memory" | "write_docs" | "write_source" | "shell" | "network";
}

export interface PermissionRequestView {
  id: string;
  title: string;
  description: string;
  actionType: "apply_plan" | "write_memory" | "write_graph" | "generate_task" | "import_task_result" | "run_external_agent";
  affectedPaths: string[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  options: Array<{
    id: "approve" | "reject" | "modify";
    label: string;
  }>;
}

export interface ChatSessionTranscript {
  session: ChatSession;
  messages: ChatMessage[];
}

export type NewChatMessage = Omit<ChatMessage, "id" | "createdAt"> & Partial<Pick<ChatMessage, "id" | "createdAt">>;

interface ChatSessionsIndex {
  sessions: ChatSession[];
  updatedAt: string;
}

export function getChatSessionPaths(projectRoot: string) {
  const root = path.resolve(projectRoot);
  const chatDir = path.join(root, ".distinction", "chat");
  const sessionsDir = path.join(chatDir, "sessions");
  return {
    root,
    chatDir,
    sessionsDir,
    sessionsIndexPath: path.join(chatDir, "sessions.json")
  };
}

export async function loadSessions(projectRoot: string): Promise<ChatSession[]> {
  const index = await readSessionsIndex(projectRoot);
  return index.sessions;
}

export async function createSessionForTarget(
  projectRoot: string,
  target: ChatTarget,
  options: { title?: string; mode?: ChatMode; modelRoute?: string } = {}
): Promise<ChatSession> {
  const paths = getChatSessionPaths(projectRoot);
  await ensureChatStore(projectRoot);
  const index = await readSessionsIndex(projectRoot);
  const normalizedTarget = normalizeTarget(target);
  const existing = index.sessions.find((session) => targetKey(session.target) === targetKey(normalizedTarget));
  if (existing) return existing;

  const now = new Date().toISOString();
  const session: ChatSession = {
    id: nextSessionId(index.sessions),
    projectRoot: paths.root,
    title: options.title ?? defaultSessionTitle(normalizedTarget),
    target: normalizedTarget,
    mode: options.mode ?? "explain",
    modelRoute: options.modelRoute,
    createdAt: now,
    updatedAt: now
  };
  index.sessions.push(session);
  index.updatedAt = now;
  await writeSessionsIndex(projectRoot, index);
  await ensureTranscriptFile(projectRoot, session.id);
  return session;
}

export async function readSession(projectRoot: string, sessionId: string): Promise<ChatSession | undefined> {
  const index = await readSessionsIndex(projectRoot);
  return index.sessions.find((session) => session.id === sessionId);
}

export async function readSessionTranscript(projectRoot: string, sessionId: string): Promise<ChatSessionTranscript> {
  const session = await readSession(projectRoot, sessionId);
  if (!session) throw new Error(`Chat session not found: ${sessionId}`);
  return { session, messages: await readMessages(projectRoot, sessionId) };
}

export async function readMessages(projectRoot: string, sessionId: string): Promise<ChatMessage[]> {
  const paths = getChatSessionPaths(projectRoot);
  const transcriptPath = transcriptFilePath(paths.sessionsDir, sessionId);
  if (!(await exists(transcriptPath))) return [];
  const raw = await readFile(transcriptPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChatMessage);
}

export async function appendMessage(projectRoot: string, message: NewChatMessage): Promise<ChatMessage> {
  const appended = createChatMessage(message);
  await appendMessages(projectRoot, [appended]);
  return appended;
}

export async function appendMessages(projectRoot: string, messages: NewChatMessage[]): Promise<ChatMessage[]> {
  if (!messages.length) return [];
  await ensureChatStore(projectRoot);
  const appended = messages.map(createChatMessage);
  const paths = getChatSessionPaths(projectRoot);
  const grouped = new Map<string, ChatMessage[]>();
  for (const message of appended) {
    grouped.set(message.sessionId, [...(grouped.get(message.sessionId) ?? []), message]);
  }
  for (const [sessionId, group] of grouped) {
    await ensureTranscriptFile(projectRoot, sessionId);
    await appendFile(transcriptFilePath(paths.sessionsDir, sessionId), group.map((message) => JSON.stringify(message)).join("\n") + "\n", "utf8");
    await touchSession(projectRoot, sessionId, group[group.length - 1]?.createdAt ?? new Date().toISOString());
  }
  return appended;
}

export function createChatMessage(message: NewChatMessage): ChatMessage {
  return {
    ...message,
    id: message.id ?? `msg-${randomUUID()}`,
    createdAt: message.createdAt ?? new Date().toISOString(),
    status: message.status ?? "done"
  };
}

export function targetKey(target: ChatTarget): string {
  const normalized = normalizeTarget(target);
  if (normalized.type === "project") return "project";
  if (normalized.type === "subgraph") return `subgraph:${normalized.nodeIds.join(",")}|${normalized.edgeIds.join(",")}`;
  return `${normalized.type}:${normalized.id}`;
}

export function normalizeTarget(target: ChatTarget): ChatTarget {
  if (target.type === "subgraph") {
    return {
      type: "subgraph",
      nodeIds: [...new Set(target.nodeIds)].sort(),
      edgeIds: [...new Set(target.edgeIds)].sort()
    };
  }
  return target;
}

async function ensureChatStore(projectRoot: string): Promise<void> {
  const paths = getChatSessionPaths(projectRoot);
  await mkdir(paths.sessionsDir, { recursive: true });
  if (!(await exists(paths.sessionsIndexPath))) {
    await writeSessionsIndex(projectRoot, { sessions: [], updatedAt: new Date().toISOString() });
  }
}

async function ensureTranscriptFile(projectRoot: string, sessionId: string): Promise<void> {
  const paths = getChatSessionPaths(projectRoot);
  await mkdir(paths.sessionsDir, { recursive: true });
  const filePath = transcriptFilePath(paths.sessionsDir, sessionId);
  if (!(await exists(filePath))) await writeFile(filePath, "", "utf8");
}

async function readSessionsIndex(projectRoot: string): Promise<ChatSessionsIndex> {
  await ensureChatStoreIfPresent(projectRoot);
  const paths = getChatSessionPaths(projectRoot);
  if (!(await exists(paths.sessionsIndexPath))) return { sessions: [], updatedAt: new Date().toISOString() };
  const parsed = JSON.parse(await readFile(paths.sessionsIndexPath, "utf8")) as unknown;
  if (Array.isArray(parsed)) return { sessions: parsed as ChatSession[], updatedAt: new Date().toISOString() };
  if (isRecord(parsed) && Array.isArray(parsed.sessions)) {
    return {
      sessions: parsed.sessions as ChatSession[],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  }
  return { sessions: [], updatedAt: new Date().toISOString() };
}

async function writeSessionsIndex(projectRoot: string, index: ChatSessionsIndex): Promise<void> {
  const paths = getChatSessionPaths(projectRoot);
  await mkdir(paths.chatDir, { recursive: true });
  await writeFile(paths.sessionsIndexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function touchSession(projectRoot: string, sessionId: string, updatedAt: string): Promise<void> {
  const index = await readSessionsIndex(projectRoot);
  const session = index.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.updatedAt = updatedAt;
  index.updatedAt = updatedAt;
  await writeSessionsIndex(projectRoot, index);
}

async function ensureChatStoreIfPresent(projectRoot: string): Promise<void> {
  const paths = getChatSessionPaths(projectRoot);
  if (await exists(paths.chatDir)) await mkdir(paths.sessionsDir, { recursive: true });
}

function nextSessionId(sessions: ChatSession[]): string {
  const max = sessions.reduce((highest, session) => {
    const match = /^session-(\d+)$/.exec(session.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `session-${String(max + 1).padStart(4, "0")}`;
}

function transcriptFilePath(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, `${safeFilePart(sessionId)}.jsonl`);
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "session";
}

function defaultSessionTitle(target: ChatTarget): string {
  if (target.type === "project") return "Project chat";
  if (target.type === "subgraph") return `Subgraph chat (${target.nodeIds.length} nodes, ${target.edgeIds.length} edges)`;
  return `${target.type}: ${target.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
