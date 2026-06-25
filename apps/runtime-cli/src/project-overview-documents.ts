import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readProjectGitVersion, readProjectSemanticVersion, type DesignGitVersionInfo } from "./design-documents.js";

export const PROJECT_OVERVIEW_DOC_RELATIVE_PATH = "docs/project/project-overview.md";
export const PROJECT_TIMELINE_DOC_RELATIVE_PATH = "docs/project/project-timeline.md";

export interface ProjectOverviewSourceDocument {
  path: string;
  kind: "overview" | "timeline" | "readme" | "changelog" | "agents" | "docs" | "package" | "other";
  title: string;
  content: string;
}

export interface ProjectOverviewDraft {
  schemaVersion: "praxis.projectOverviewDraft.v1";
  projectName: string;
  summary: string;
  positioning: string[];
  currentState: {
    label: string;
    summary: string;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
  keyCapabilities: Array<{
    title: string;
    summary: string;
    evidence: string[];
  }>;
  engineeringEntrances: Array<{
    title: string;
    path: string;
    summary: string;
  }>;
  designAndArchitectureEntrances: Array<{
    title: string;
    path: string;
    summary: string;
  }>;
  timeline: Array<{
    date: string;
    title: string;
    summary: string;
    source: string;
  }>;
  progress: Array<{
    title: string;
    status: "done" | "in_progress" | "blocked" | "unknown";
    summary: string;
    evidence: string[];
  }>;
  risks: Array<{
    title: string;
    summary: string;
    evidence: string[];
  }>;
  openQuestions: string[];
  nextSteps: string[];
  sourceDocuments: string[];
}

export interface ProjectOverviewDocumentsResult {
  overviewPath: string;
  timelinePath: string;
  overviewRelativePath: string;
  timelineRelativePath: string;
}

const sourceCandidates: Array<Omit<ProjectOverviewSourceDocument, "content">> = [
  { path: PROJECT_OVERVIEW_DOC_RELATIVE_PATH, kind: "overview", title: "Project Overview" },
  { path: PROJECT_TIMELINE_DOC_RELATIVE_PATH, kind: "timeline", title: "Project Timeline" },
  { path: "README.md", kind: "readme", title: "README" },
  { path: "README.zh-CN.md", kind: "readme", title: "README zh-CN" },
  { path: "CHANGELOG.md", kind: "changelog", title: "CHANGELOG" },
  { path: "docs/CHANGELOG.md", kind: "changelog", title: "docs CHANGELOG" },
  { path: "docs/changelog.md", kind: "changelog", title: "docs changelog" },
  { path: "AGENTS.md", kind: "agents", title: "AGENTS" },
  { path: "package.json", kind: "package", title: "package.json" },
  { path: "docs/design/use-case-diagrams-maps.md", kind: "docs", title: "Design maps" },
  { path: "docs/engineering/engineering-maps.md", kind: "docs", title: "Engineering maps" },
  { path: "docs/architecture/c4/c4-model-maps.md", kind: "docs", title: "Architecture C4 maps" }
];

export async function projectOverviewDocumentsExist(root: string): Promise<boolean> {
  try {
    await readFile(path.join(root, PROJECT_OVERVIEW_DOC_RELATIVE_PATH), "utf8");
    await readFile(path.join(root, PROJECT_TIMELINE_DOC_RELATIVE_PATH), "utf8");
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

export async function readProjectOverviewSourceDocuments(root: string): Promise<ProjectOverviewSourceDocument[]> {
  const sources: ProjectOverviewSourceDocument[] = [];
  for (const candidate of sourceCandidates) {
    try {
      const content = await readFile(path.join(root, candidate.path), "utf8");
      sources.push({ ...candidate, content });
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  return sources;
}

export function projectOverviewAgentPayload(root: string, generatedAt: string, sources: ProjectOverviewSourceDocument[]): Record<string, unknown> {
  return {
    schemaVersion: "praxis.projectOverviewAgentInput.v1",
    root,
    generatedAt,
    targetDocuments: [PROJECT_OVERVIEW_DOC_RELATIVE_PATH, PROJECT_TIMELINE_DOC_RELATIVE_PATH],
    sourceDocuments: sources.map((source) => ({
      path: source.path,
      kind: source.kind,
      title: source.title,
      excerpt: excerptForAgent(source.content, source.kind === "readme" || source.kind === "changelog" ? 9000 : 5000)
    })),
    rules: [
      "生成中文文档。",
      "只把有来源的内容写成事实。",
      "不确定内容进入 risks 或 openQuestions。",
      "docs 是 Project Memory 权威；.distinction 只能作为迁移期缓存。"
    ]
  };
}

export function normalizeProjectOverviewDraft(
  value: unknown,
  root: string,
  generatedAt: string,
  sources: ProjectOverviewSourceDocument[]
): ProjectOverviewDraft {
  const input = isRecord(value) ? value : {};
  const projectName = nonEmptyString(input.projectName) ?? (path.basename(root) || "Project");
  const sourcePaths = sources.map((source) => source.path);
  return {
    schemaVersion: "praxis.projectOverviewDraft.v1",
    projectName,
    summary: nonEmptyString(input.summary) ?? `${projectName} 的项目概要仍需要从 README、CHANGELOG 和 docs 中补充。`,
    positioning: normalizeStringArray(input.positioning, ["项目定位证据不足，需要补充 README 或 docs/project/project-overview.md。"]),
    currentState: normalizeCurrentState(input.currentState),
    keyCapabilities: normalizeNamedSections(input.keyCapabilities),
    engineeringEntrances: normalizeEntrances(input.engineeringEntrances),
    designAndArchitectureEntrances: normalizeEntrances(input.designAndArchitectureEntrances),
    timeline: normalizeTimeline(input.timeline, generatedAt),
    progress: normalizeProgressItems(input.progress),
    risks: normalizeNamedSections(input.risks),
    openQuestions: normalizeStringArray(input.openQuestions, missingSourceQuestions(sourcePaths)),
    nextSteps: normalizeStringArray(input.nextSteps, ["补齐项目概要和时间线文档。", "确认 README 与 CHANGELOG 是否代表当前真实状态。"]),
    sourceDocuments: normalizeStringArray(input.sourceDocuments, sourcePaths)
  };
}

export async function writeProjectOverviewDocuments(root: string, draft: ProjectOverviewDraft, generatedAt: string): Promise<ProjectOverviewDocumentsResult> {
  const projectVersion = (await readProjectSemanticVersion(root)) ?? "0.0.0";
  const git = await readProjectGitVersion(root);
  const overviewPath = path.join(root, PROJECT_OVERVIEW_DOC_RELATIVE_PATH);
  const timelinePath = path.join(root, PROJECT_TIMELINE_DOC_RELATIVE_PATH);
  await mkdir(path.dirname(overviewPath), { recursive: true });
  await writeFile(overviewPath, renderProjectOverviewMarkdown(draft, generatedAt, projectVersion, git), "utf8");
  await writeFile(timelinePath, renderProjectTimelineMarkdown(draft, generatedAt, projectVersion, git), "utf8");
  return {
    overviewPath,
    timelinePath,
    overviewRelativePath: PROJECT_OVERVIEW_DOC_RELATIVE_PATH,
    timelineRelativePath: PROJECT_TIMELINE_DOC_RELATIVE_PATH
  };
}

function renderProjectOverviewMarkdown(
  draft: ProjectOverviewDraft,
  generatedAt: string,
  projectVersion: string,
  git: DesignGitVersionInfo
): string {
  return [
    `# ${draft.projectName} 项目概要`,
    "",
    "<!-- praxis:project-overview:start -->",
    "",
    `- 项目版本：${projectVersion}`,
    `- Git：${git.shortCommit} / ${git.branch}${git.dirty ? " / dirty" : ""}`,
    `- 更新于：${generatedAt}`,
    `- 知识状态：CANDIDATE；当前概要来自项目文档与仓库证据，尚未提升为 CONFIRMED 项目记忆。`,
    "",
    "## 项目定位",
    "",
    draft.summary,
    "",
    ...draft.positioning.flatMap((item) => [item, ""]),
    "## 当前状态",
    "",
    `**${draft.currentState.label}**（${draft.currentState.confidence}）`,
    "",
    draft.currentState.summary,
    "",
    bulletSection("状态证据", draft.currentState.evidence),
    "",
    "## 关键能力",
    "",
    ...namedSectionList(draft.keyCapabilities),
    "## 工程入口",
    "",
    ...entranceList(draft.engineeringEntrances),
    "## 设计与架构入口",
    "",
    ...entranceList(draft.designAndArchitectureEntrances),
    "## 当前进度",
    "",
    ...progressList(draft.progress),
    "## 风险与缺口",
    "",
    ...namedSectionList(draft.risks),
    "## 待确认问题",
    "",
    bulletSection(undefined, draft.openQuestions),
    "",
    "## 下一步",
    "",
    bulletSection(undefined, draft.nextSteps),
    "",
    "## 来源文档",
    "",
    bulletSection(undefined, draft.sourceDocuments),
    "",
    "<!-- praxis:project-overview:end -->",
    ""
  ].join("\n");
}

function renderProjectTimelineMarkdown(
  draft: ProjectOverviewDraft,
  generatedAt: string,
  projectVersion: string,
  git: DesignGitVersionInfo
): string {
  return [
    `# ${draft.projectName} 项目时间线`,
    "",
    "<!-- praxis:project-timeline:start -->",
    "",
    `- 项目版本：${projectVersion}`,
    `- Git：${git.shortCommit} / ${git.branch}${git.dirty ? " / dirty" : ""}`,
    `- 更新于：${generatedAt}`,
    "",
    "## 时间线",
    "",
    ...(draft.timeline.length
      ? draft.timeline.flatMap((item) => [
          `### ${item.date} ${item.title}`,
          "",
          item.summary,
          "",
          `来源：${item.source}`,
          ""
        ])
      : ["暂无可证据化时间线。", ""]),
    "## 当前进度",
    "",
    ...progressList(draft.progress),
    "## 来源文档",
    "",
    bulletSection(undefined, draft.sourceDocuments),
    "",
    "<!-- praxis:project-timeline:end -->",
    ""
  ].join("\n");
}

function bulletSection(title: string | undefined, items: string[]): string {
  const lines = title ? [`### ${title}`, ""] : [];
  lines.push(...(items.length ? items.map((item) => `- ${item}`) : ["- 暂无。"]));
  return lines.join("\n");
}

function namedSectionList(items: Array<{ title: string; summary: string; evidence?: string[] }>): string[] {
  if (!items.length) return ["- 暂无。", ""];
  return items.flatMap((item) => [
    `### ${item.title}`,
    "",
    item.summary,
    "",
    ...(item.evidence?.length ? [bulletSection("证据", item.evidence), ""] : [])
  ]);
}

function entranceList(items: Array<{ title: string; path: string; summary: string }>): string[] {
  if (!items.length) return ["- 暂无明确入口。", ""];
  return items.flatMap((item) => [`- **${item.title}**：${item.path}。${item.summary}`]);
}

function progressList(items: ProjectOverviewDraft["progress"]): string[] {
  if (!items.length) return ["- 暂无可证据化进度。", ""];
  return items.flatMap((item) => [
    `- **${item.title}**（${item.status}）：${item.summary}`,
    ...(item.evidence.length ? item.evidence.map((evidence) => `  - 证据：${evidence}`) : [])
  ]);
}

function excerptForAgent(content: string, limit: number): string {
  const clean = content.replace(/\r\n/g, "\n").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n...[truncated ${clean.length - limit} chars]`;
}

function normalizeCurrentState(value: unknown): ProjectOverviewDraft["currentState"] {
  const input = isRecord(value) ? value : {};
  return {
    label: nonEmptyString(input.label) ?? "未知状态",
    summary: nonEmptyString(input.summary) ?? "当前状态证据不足，需要从 README、CHANGELOG 或项目概要文档补充。",
    confidence: confidenceValue(input.confidence),
    evidence: normalizeStringArray(input.evidence, [])
  };
}

function normalizeNamedSections(value: unknown): Array<{ title: string; summary: string; evidence: string[] }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string" && item.trim()) return { title: `条目 ${index + 1}`, summary: item.trim(), evidence: [] };
      if (!isRecord(item)) return undefined;
      const title = nonEmptyString(item.title) ?? `条目 ${index + 1}`;
      const summary = nonEmptyString(item.summary) ?? "";
      if (!title && !summary) return undefined;
      return { title, summary, evidence: normalizeStringArray(item.evidence, []) };
    })
    .filter((item): item is { title: string; summary: string; evidence: string[] } => Boolean(item));
}

function normalizeEntrances(value: unknown): ProjectOverviewDraft["engineeringEntrances"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      title: nonEmptyString(item.title) ?? `入口 ${index + 1}`,
      path: nonEmptyString(item.path) ?? "",
      summary: nonEmptyString(item.summary) ?? ""
    }))
    .filter((item) => item.title || item.path || item.summary);
}

function normalizeTimeline(value: unknown, generatedAt: string): ProjectOverviewDraft["timeline"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      date: nonEmptyString(item.date) ?? generatedAt.slice(0, 10),
      title: nonEmptyString(item.title) ?? `时间线事件 ${index + 1}`,
      summary: nonEmptyString(item.summary) ?? "",
      source: nonEmptyString(item.source) ?? "unknown"
    }))
    .filter((item) => item.title || item.summary);
}

function normalizeProgressItems(value: unknown): ProjectOverviewDraft["progress"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      title: nonEmptyString(item.title) ?? `进度 ${index + 1}`,
      status: progressStatus(item.status),
      summary: nonEmptyString(item.summary) ?? "",
      evidence: normalizeStringArray(item.evidence, [])
    }))
    .filter((item) => item.title || item.summary);
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : fallback;
}

function missingSourceQuestions(sourcePaths: string[]): string[] {
  const questions: string[] = [];
  if (!sourcePaths.some((item) => item.toLowerCase().includes("readme"))) questions.push("缺少 README，项目定位和使用入口证据不足。");
  if (!sourcePaths.some((item) => item.toLowerCase().includes("changelog"))) questions.push("缺少 CHANGELOG，项目进度与时间线证据不足。");
  return questions.length ? questions : ["项目概要需要用户确认是否代表当前真实状态。"];
}

function confidenceValue(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function progressStatus(value: unknown): "done" | "in_progress" | "blocked" | "unknown" {
  return value === "done" || value === "in_progress" || value === "blocked" || value === "unknown" ? value : "unknown";
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
