import { cp, mkdir, readFile, rename, stat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { DevelopmentGraph, DevelopmentGraphCandidate } from "@praxis/development-graph";
import { serializeTraceEvent, type TraceEvent } from "@praxis/trace-recorder";

export interface LocalKnowledgePaths {
  root: string;
  distinctionDir: string;
  graphDir: string;
  memoryDir: string;
  rulesDir: string;
  tasksDir: string;
  reportsDir: string;
}

export interface ChangeRecord {
  title: string;
  summary: string;
  kind?: "FACT" | "CANDIDATE" | "INFERENCE" | "CONFIRMED";
  timestamp?: string;
}

export function getLocalKnowledgePaths(projectRoot: string): LocalKnowledgePaths {
  const root = path.resolve(projectRoot);
  const distinctionDir = path.join(root, ".distinction");
  return {
    root,
    distinctionDir,
    graphDir: path.join(distinctionDir, "graph"),
    memoryDir: path.join(distinctionDir, "memory"),
    rulesDir: path.join(distinctionDir, "rules"),
    tasksDir: path.join(distinctionDir, "tasks"),
    reportsDir: path.join(distinctionDir, "reports")
  };
}

export async function initializeLocalKnowledge(projectRoot: string, candidate: DevelopmentGraphCandidate): Promise<LocalKnowledgePaths> {
  const paths = getLocalKnowledgePaths(projectRoot);
  if (await exists(paths.distinctionDir)) {
    await backupExistingDistinction(paths);
  }
  await ensureDistinctionDirectories(paths);
  await writeDevelopmentGraph(projectRoot, candidate.graph);
  await writeJson(path.join(paths.graphDir, "progress.json"), {
    nodes: Object.fromEntries(candidate.graph.nodes.map((node) => [node.id, node.progress])),
    edges: Object.fromEntries(candidate.graph.edges.map((edge) => [edge.id, edge.progress]))
  });
  await writeJson(path.join(paths.graphDir, "views.json"), {
    default: "relations",
    views: ["outline", "relations", "progress", "risk", "memory"]
  });
  await writeProjectIntakeReport(projectRoot, candidate);
  await ensureFile(path.join(paths.memoryDir, "changes.md"), "# Changes\n\n");
  await appendChange(projectRoot, {
    title: "Project intake graph accepted",
    summary: `Accepted graph candidate with ${candidate.graph.nodes.length} nodes and ${candidate.graph.edges.length} edges.`,
    kind: "CONFIRMED"
  });
  await ensureFile(path.join(paths.memoryDir, "decisions.md"), "# Decisions\n\n");
  await ensureFile(path.join(paths.memoryDir, "traces.jsonl"), "");
  await writeJson(path.join(paths.memoryDir, "incidents.json"), []);
  await ensureFile(path.join(paths.memoryDir, "do-not-repeat.md"), "# Do Not Repeat\n\n");
  await ensureFile(path.join(paths.rulesDir, "architecture.md"), "# Architecture Rules\n\n");
  await ensureFile(path.join(paths.rulesDir, "boundaries.md"), "# Boundaries\n\n");
  await ensureFile(
    path.join(paths.rulesDir, "ai-constraints.md"),
    [
      "# AI Constraints",
      "",
      "- Local scan produces FACT.",
      "- Agent output is CANDIDATE or INFERENCE until user confirmation.",
      "- v0.1 must not automatically modify existing source code.",
      "- Explain before Plan. Plan before Apply.",
      ""
    ].join("\n")
  );
  await ensureFile(
    path.join(paths.distinctionDir, "models.yaml"),
    [
      "default_provider: deepseek",
      "providers:",
      "  deepseek:",
      "    type: openai-compatible",
      "    base_url: https://api.deepseek.com",
      "    api_key_env: DEEPSEEK_API_KEY",
      ""
    ].join("\n")
  );
  return paths;
}

export async function readDevelopmentGraph(projectRoot: string): Promise<DevelopmentGraph> {
  const paths = getLocalKnowledgePaths(projectRoot);
  const nodes = JSON.parse(await readFile(path.join(paths.graphDir, "nodes.json"), "utf8")) as DevelopmentGraph["nodes"];
  const edges = JSON.parse(await readFile(path.join(paths.graphDir, "edges.json"), "utf8")) as DevelopmentGraph["edges"];
  return {
    id: "graph:local",
    title: `${path.basename(path.resolve(projectRoot))} Development Graph`,
    rootPath: path.resolve(projectRoot),
    nodes,
    edges,
    updatedAt: new Date().toISOString()
  };
}

export async function writeDevelopmentGraph(projectRoot: string, graph: DevelopmentGraph): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await ensureDistinctionDirectories(paths);
  await writeJson(path.join(paths.graphDir, "nodes.json"), graph.nodes);
  await writeJson(path.join(paths.graphDir, "edges.json"), graph.edges);
}

export async function appendTrace(projectRoot: string, traceEvent: TraceEvent): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.memoryDir, { recursive: true });
  await appendFile(path.join(paths.memoryDir, "traces.jsonl"), `${serializeTraceEvent(traceEvent)}\n`, "utf8");
}

export async function appendChange(projectRoot: string, change: ChangeRecord): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.memoryDir, { recursive: true });
  const timestamp = change.timestamp ?? new Date().toISOString();
  const kind = change.kind ?? "CANDIDATE";
  await appendFile(path.join(paths.memoryDir, "changes.md"), `## ${timestamp} ${change.title}\n\n${kind}: ${change.summary}\n\n`, "utf8");
}

export async function writeProjectIntakeReport(projectRoot: string, candidate: DevelopmentGraphCandidate): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.reportsDir, { recursive: true });
  const report = [
    "# Project Intake Report",
    "",
    `Generated at: ${candidate.generatedAt}`,
    `Source: ${candidate.source}`,
    `Confidence: ${candidate.confidence}`,
    "",
    `Nodes: ${candidate.graph.nodes.length}`,
    `Edges: ${candidate.graph.edges.length}`,
    "",
    "## Warnings",
    "",
    ...candidate.warnings.map((warning) => `- [${warning.severity}] ${warning.summary}`),
    "",
    "## Questions",
    "",
    ...candidate.unresolvedQuestions.map((question) => `- ${question.question}`),
    ""
  ].join("\n");
  await writeFile(path.join(paths.reportsDir, "project-intake.md"), report, "utf8");
}

export async function writeCodingTask(projectRoot: string, task: { id: string; markdown: string }): Promise<string> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.tasksDir, { recursive: true });
  const taskPath = path.join(paths.tasksDir, `${task.id}.md`);
  await writeFile(taskPath, task.markdown, "utf8");
  return taskPath;
}

async function ensureDistinctionDirectories(paths: LocalKnowledgePaths): Promise<void> {
  await mkdir(paths.graphDir, { recursive: true });
  await mkdir(paths.memoryDir, { recursive: true });
  await mkdir(paths.rulesDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.reportsDir, { recursive: true });
}

async function backupExistingDistinction(paths: LocalKnowledgePaths): Promise<void> {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backupPath = path.join(paths.root, `.distinction.backup-${stamp}`);
  await cp(paths.distinctionDir, backupPath, { recursive: true });
  await rename(paths.distinctionDir, `${paths.distinctionDir}.previous-${stamp}`).catch(async () => {
    await cp(paths.distinctionDir, backupPath, { recursive: true });
  });
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  if (await exists(filePath)) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
