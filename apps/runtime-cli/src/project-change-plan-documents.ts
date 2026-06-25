import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewFinding, ReviewSeverity } from "@praxis/schema";
import { readProjectGitVersion, readProjectSemanticVersion, type DesignGitVersionInfo } from "./design-documents.js";

export const PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH = "docs/project/project-change-plan.md";
export const PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH = "docs/project/project-change-plan.html";

export type ProjectChangePlanStatus = "draft" | "ready_for_review" | "approved" | "in_development" | "completed";
export type ProjectChangePlanItemStatus = "candidate" | "approved" | "in_progress" | "done" | "blocked";
export type ProjectChangePlanTaskStatus = "todo" | "doing" | "done" | "blocked";
export type ProjectChangePlanBump = "major" | "minor" | "patch" | "none";
export type ProjectChangeSourceExplorer = "model" | "design" | "engineering" | "architecture" | "project" | "review";

export interface ProjectChangePlanChecklistItem {
  id: string;
  text: string;
  status: ProjectChangePlanTaskStatus;
  source?: string;
}

export interface ProjectChangePlanItem {
  id: string;
  title: string;
  summary: string;
  sourceExplorer: ProjectChangeSourceExplorer;
  sourceDocuments: string[];
  status: ProjectChangePlanItemStatus;
  checklist: ProjectChangePlanChecklistItem[];
  burnDown: {
    total: number;
    done: number;
    percent: number;
  };
  linkedDesignDocs: string[];
  linkedEngineeringDocs: string[];
  linkedArchitectureDocs: string[];
  linkedReviewFindingIds: string[];
  linkedReviewDocs: string[];
  resolutionEvidence: string[];
}

export interface ProjectDevelopmentPlanTask {
  id: string;
  title: string;
  summary: string;
  phase: "docs" | "plan" | "code" | "test" | "review" | "release";
  status: ProjectChangePlanTaskStatus;
  progress: number;
  start?: string;
  end?: string;
  dependencies: string[];
  changeItemIds: string[];
  deliverables: string[];
  acceptance: string[];
  implementationBrief: ProjectTaskImplementationBrief;
  workset: ProjectTaskWorkset;
  acceptanceEvidence: ProjectTaskAcceptanceEvidence[];
}

export interface ProjectTaskImplementationBrief {
  objective: string;
  currentBehavior: string;
  targetBehavior: string;
  approach: string;
  constraints: string[];
  nonGoals: string[];
  rollbackPlan: string;
}

export interface ProjectTaskWorkset {
  readFiles: string[];
  writeFiles: string[];
  relatedDocs: string[];
  testCommands: string[];
  traceLinks: string[];
  contextNotes: string[];
}

export interface ProjectTaskAcceptanceEvidence {
  id: string;
  description: string;
  command?: string;
  expectedResult: string;
  status: ProjectChangePlanTaskStatus;
  evidence?: string;
}

export interface ProjectExpectedChangelog {
  version: string;
  date: string;
  summary: string;
  added: string[];
  changed: string[];
  fixed: string[];
  risks: string[];
}

export interface ProjectChangePlanModel {
  schemaVersion: "praxis.projectChangePlan.v1";
  root: string;
  generatedAt: string;
  status: ProjectChangePlanStatus;
  currentVersion: string;
  nextVersion: string;
  bump: ProjectChangePlanBump;
  versionReason: string;
  git: DesignGitVersionInfo;
  sourceFingerprint: string;
  changeItems: ProjectChangePlanItem[];
  developmentPlan: ProjectDevelopmentPlanTask[];
  expectedChangelog: ProjectExpectedChangelog;
  agentProgress: Array<{
    timestamp: string;
    taskId: string;
    status: ProjectChangePlanTaskStatus;
    summary: string;
  }>;
  questions: string[];
}

export interface ProjectChangePlanSourceDocument {
  path: string;
  kind: ProjectChangeSourceExplorer | "readme" | "changelog";
  title: string;
  content: string;
  mtimeMs: number;
}

export interface ProjectChangePlanReadResult {
  exists: boolean;
  stale: boolean;
  model?: ProjectChangePlanModel;
  markdownPath: string;
  htmlPath: string;
  markdownRelativePath: string;
  htmlRelativePath: string;
  latestSourceUpdatedAt?: string;
}

const modelFenceStart = "```json praxis-project-change-plan";

const sourceCandidates: Array<Omit<ProjectChangePlanSourceDocument, "content" | "mtimeMs">> = [
  { path: "docs/project/project-overview.md", kind: "project", title: "Project Overview" },
  { path: "docs/project/project-timeline.md", kind: "project", title: "Project Timeline" },
  { path: "docs/review/quality-review.md", kind: "review", title: "Quality Review Queue" },
  { path: "docs/models/models-map.md", kind: "model", title: "UML Model Registry" },
  { path: "docs/design/use-case-diagrams-maps.md", kind: "design", title: "Design Use Case Maps" },
  { path: "docs/engineering/engineering-maps.md", kind: "engineering", title: "Engineering Maps" },
  { path: "docs/architecture/c4/c4-model-maps.md", kind: "architecture", title: "Architecture C4 Maps" },
  { path: "CHANGELOG.md", kind: "changelog", title: "CHANGELOG" },
  { path: "docs/CHANGELOG.md", kind: "changelog", title: "docs CHANGELOG" },
  { path: "README.md", kind: "readme", title: "README" },
  { path: "AGENTS.md", kind: "project", title: "AGENTS" }
];

export async function readProjectChangePlanSources(root: string): Promise<ProjectChangePlanSourceDocument[]> {
  const sources: ProjectChangePlanSourceDocument[] = [];
  for (const candidate of sourceCandidates) {
    const absolutePath = path.join(root, candidate.path);
    try {
      const [content, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
      sources.push({ ...candidate, content, mtimeMs: fileStat.mtimeMs });
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  return sources;
}

export function projectChangePlanAgentPayload(
  root: string,
  generatedAt: string,
  currentVersion: string,
  git: DesignGitVersionInfo,
  sources: ProjectChangePlanSourceDocument[]
): Record<string, unknown> {
  return {
    schemaVersion: "praxis.projectChangePlanAgentInput.v1",
    root,
    generatedAt,
    currentVersion,
    git,
    targetDocuments: [PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH, PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH],
    workflow: [
      "工程师与 agent 先完成文档。",
      "评审队列只记录问题和证据；需要整改时必须先转成项目变更项。",
      "agent 根据文档变更编排项目变更项和开发计划。",
      "用户核对需求变更后，agent 才进入开发阶段。",
      "代码生成、测试和交付进度必须回写计划文档。",
      "项目变更必须体现在 changelog 或更专业的项目变更文档中。"
    ],
    sourceDocuments: sources.map((source) => ({
      path: source.path,
      kind: source.kind,
      title: source.title,
      updatedAt: new Date(source.mtimeMs).toISOString(),
      excerpt: excerptForAgent(source.content, source.kind === "design" || source.kind === "engineering" || source.kind === "architecture" ? 9000 : 6000)
    })),
    rules: [
      "输出中文。",
      "只输出严格 JSON，不要 Markdown。",
      "Project Memory 权威是 docs 加 Git 时间线，不是 .distinction。",
      "Review Queue 的问题不得在评审页面直接消除；必须进入项目变更项、开发计划、验证证据和复核闭环。",
      "Design / Engineering / Architecture 文档变更必须联动到项目变更项和开发计划。",
      "Semantic Version 由 agent 决定：fix/小修为 patch，无破坏新能力为 minor，有破坏性变化为 major。",
      "每个版本变化应对应一个原子化 commit；如果无法判断，写入 questions，不要虚构。",
      "开发计划必须能被 UI 投影为 Gantt 和 checklist 进度。"
    ]
  };
}

export async function readProjectChangePlan(root: string): Promise<ProjectChangePlanReadResult> {
  const markdownPath = path.join(root, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH);
  const htmlPath = path.join(root, PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH);
  const [sources, markdown, html, currentVersion, git] = await Promise.all([
    readProjectChangePlanSources(root),
    readOptionalText(markdownPath),
    readOptionalText(htmlPath),
    readProjectSemanticVersion(root).then((value) => value ?? "0.0.0"),
    readProjectGitVersion(root)
  ]);
  const content = markdown || html;
  const parsedModel = content ? parseProjectChangePlanModel(content) : undefined;
  const model = parsedModel
    ? normalizeProjectChangePlanModel(
      parsedModel,
      root,
      parsedModel.generatedAt || new Date().toISOString(),
      parsedModel.currentVersion || currentVersion,
      git,
      sources
    )
    : undefined;
  const latestSourceMtime = Math.max(0, ...sources.map((source) => source.mtimeMs));
  const generatedAtMs = model ? Date.parse(model.generatedAt) : 0;
  return {
    exists: Boolean(model),
    stale: Boolean(model) && latestSourceMtime > generatedAtMs + 1000,
    model,
    markdownPath,
    htmlPath,
    markdownRelativePath: PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH,
    htmlRelativePath: PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH,
    latestSourceUpdatedAt: latestSourceMtime ? new Date(latestSourceMtime).toISOString() : undefined
  };
}

export async function writeProjectChangePlanDocuments(root: string, model: ProjectChangePlanModel): Promise<ProjectChangePlanReadResult> {
  const markdownPath = path.join(root, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH);
  const htmlPath = path.join(root, PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH);
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, renderProjectChangePlanMarkdown(model), "utf8");
  await writeFile(htmlPath, renderProjectChangePlanHtml(model), "utf8");
  return await readProjectChangePlan(root);
}

export async function approveProjectChangePlan(root: string): Promise<ProjectChangePlanReadResult> {
  const existing = await readProjectChangePlan(root);
  if (!existing.model) throw new Error(`Missing ${PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH}. Generate the project change plan first.`);
  const generatedAt = new Date().toISOString();
  const nextModel = normalizeProjectChangePlanModel(
    {
      ...existing.model,
      generatedAt,
      status: "in_development",
      changeItems: existing.model.changeItems.map((item) => ({
        ...item,
        status: item.status === "candidate" ? "approved" : item.status
      })),
      developmentPlan: existing.model.developmentPlan.map((task, index) => ({
        ...task,
        status: index === 0 && task.status === "todo" ? "doing" : task.status,
        progress: index === 0 && task.progress === 0 ? 0.05 : task.progress
      })),
      agentProgress: [
        ...existing.model.agentProgress,
        {
          timestamp: generatedAt,
          taskId: "approval",
          status: "doing",
          summary: "用户已核对当前项目变更，计划进入开发阶段。"
        }
      ]
    },
    root,
    generatedAt,
    existing.model.currentVersion,
    existing.model.git,
    []
  );
  return await writeProjectChangePlanDocuments(root, nextModel);
}

export interface UpsertReviewFindingChangeItemInput {
  root: string;
  finding: ReviewFinding;
  issueDocPath?: string;
  issueHtmlPath?: string;
  categoryDocPath?: string;
  categoryHtmlPath?: string;
  generatedAt?: string;
}

export function reviewFindingChangeItemId(findingId: string): string {
  return `review-${safeFilePart(findingId).slice(0, 96)}`;
}

export async function upsertReviewFindingChangeItem(input: UpsertReviewFindingChangeItemInput): Promise<ProjectChangePlanReadResult> {
  const root = path.resolve(input.root);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const [existing, currentVersion, git, sources] = await Promise.all([
    readProjectChangePlan(root),
    readProjectSemanticVersion(root).then((value) => value ?? "0.0.0"),
    readProjectGitVersion(root),
    readProjectChangePlanSources(root)
  ]);
  const baseModel = existing.model
    ? normalizeProjectChangePlanModel(existing.model, root, generatedAt, existing.model.currentVersion, git, sources)
    : normalizeProjectChangePlanModel(undefined, root, generatedAt, currentVersion, git, sources);
  const finding = input.finding;
  const changeItemId = reviewFindingChangeItemId(finding.id);
  const issueDocs = [
    input.issueDocPath,
    input.issueHtmlPath,
    input.categoryDocPath,
    input.categoryHtmlPath,
    "docs/review/quality-review.md",
    "docs/review/quality-review.html"
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const evidenceDocs = [
    ...finding.evidence.map((item) => item.path),
    ...finding.affectedAnchors.map((anchor) => anchor.path)
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const checklist = reviewFindingChecklist(finding, issueDocs[0]);
  const nextChangeItem: ProjectChangePlanItem = {
    id: changeItemId,
    title: `评审整改：${finding.title}`,
    summary: [
      `${finding.severity} ${qualityReviewCategoryLabel(finding.category)}：${finding.summary}`,
      finding.whyItMatters ? `影响：${finding.whyItMatters}` : "",
      finding.suggestedAction ? `建议：${finding.suggestedAction}` : ""
    ].filter(Boolean).join("\n"),
    sourceExplorer: "review",
    sourceDocuments: ["docs/review/quality-review.md", ...issueDocs, ...evidenceDocs].filter(uniqueFilter),
    status: "candidate",
    checklist,
    burnDown: burnDownFor(checklist),
    linkedDesignDocs: [],
    linkedEngineeringDocs: [],
    linkedArchitectureDocs: [],
    linkedReviewFindingIds: [finding.id],
    linkedReviewDocs: issueDocs.filter(uniqueFilter),
    resolutionEvidence: []
  };
  const changeItems = upsertById(baseModel.changeItems, nextChangeItem);
  const nextBump = maxBump(baseModel.bump, bumpForReviewFinding(finding.severity));
  const nextVersion = nextBump === baseModel.bump && baseModel.nextVersion
    ? baseModel.nextVersion
    : bumpSemver(baseModel.currentVersion, nextBump);
  const nextModel = normalizeProjectChangePlanModel(
    {
      ...baseModel,
      generatedAt,
      status: baseModel.status === "in_development" || baseModel.status === "completed"
        ? baseModel.status
        : "ready_for_review",
      bump: nextBump,
      nextVersion,
      versionReason: nextBump === baseModel.bump && baseModel.versionReason
        ? `${baseModel.versionReason}\n\nReview Queue 新增整改项：${finding.severity} ${finding.title}。该评审项默认不降低已有版本决策。`
        : reviewVersionReason(nextBump, finding),
      changeItems,
      developmentPlan: ensureReviewDevelopmentTasks(baseModel.developmentPlan, changeItemId, finding, generatedAt, issueDocs, evidenceDocs),
      expectedChangelog: {
        ...baseModel.expectedChangelog,
        version: nextVersion,
        fixed: [`${finding.severity} ${finding.title}`, ...baseModel.expectedChangelog.fixed].filter(uniqueFilter),
        risks: [
          "评审问题进入计划后，只有完成代码/文档变更、验证命令和评审复核证据，才能关闭对应 review finding。",
          ...baseModel.expectedChangelog.risks
        ].filter(uniqueFilter)
      },
      agentProgress: [
        ...baseModel.agentProgress,
        {
          timestamp: generatedAt,
          taskId: changeItemId,
          status: "todo",
          summary: `Review Queue 已将评审问题 ${finding.id} 转入项目变更计划。`
        }
      ],
      questions: baseModel.questions.filter((question) => !question.includes("缺少可编排"))
    },
    root,
    generatedAt,
    baseModel.currentVersion,
    git,
    sources
  );
  return await writeProjectChangePlanDocuments(root, nextModel);
}

export function normalizeProjectChangePlanModel(
  value: unknown,
  root: string,
  generatedAt: string,
  currentVersion: string,
  git: DesignGitVersionInfo,
  sources: ProjectChangePlanSourceDocument[]
): ProjectChangePlanModel;
export function normalizeProjectChangePlanModel(
  value: unknown,
  root: string,
  generatedAt: string,
  currentVersion: string,
  git: DesignGitVersionInfo,
  sources: ProjectChangePlanSourceDocument[]
): ProjectChangePlanModel {
  const input = isRecord(value) ? value : {};
  const sourceFingerprint = sourceFingerprintFor(sources);
  const bump = normalizeBump(input.bump);
  const nextVersion = nonEmptyString(input.nextVersion) ?? bumpSemver(currentVersion, bump);
  const changeItems = normalizeChangeItems(input.changeItems);
  const developmentPlan = normalizeDevelopmentPlan(input.developmentPlan, changeItems, generatedAt);
  const expectedChangelog = normalizeExpectedChangelog(input.expectedChangelog, nextVersion, generatedAt, changeItems);
  return {
    schemaVersion: "praxis.projectChangePlan.v1",
    root,
    generatedAt: nonEmptyString(input.generatedAt) ?? generatedAt,
    status: normalizePlanStatus(input.status),
    currentVersion: nonEmptyString(input.currentVersion) ?? currentVersion,
    nextVersion,
    bump,
    versionReason: nonEmptyString(input.versionReason) ?? defaultVersionReason(bump, changeItems),
    git,
    sourceFingerprint: nonEmptyString(input.sourceFingerprint) ?? sourceFingerprint,
    changeItems,
    developmentPlan,
    expectedChangelog,
    agentProgress: normalizeAgentProgress(input.agentProgress),
    questions: normalizeStringArray(input.questions, changeItems.length ? [] : ["缺少可编排的 Design / Engineering / Architecture / Review / Project 文档变更证据。"])
  };
}

function normalizeChangeItems(value: unknown): ProjectChangePlanItem[] {
  const fromAgent = Array.isArray(value) ? value.filter(isRecord).map((item, index) => normalizeChangeItem(item, index)) : [];
  return fromAgent;
}

function normalizeChangeItem(item: Record<string, unknown>, index: number): ProjectChangePlanItem {
  const checklist = normalizeChecklist(item.checklist, `change-${index + 1}`);
  const sourceExplorer = normalizeExplorer(item.sourceExplorer);
  return {
    id: nonEmptyString(item.id) ?? `change-${index + 1}`,
    title: nonEmptyString(item.title) ?? `项目变更项 ${index + 1}`,
    summary: nonEmptyString(item.summary) ?? "该变更项还缺少说明。",
    sourceExplorer,
    sourceDocuments: normalizeStringArray(item.sourceDocuments, []),
    status: normalizeChangeStatus(item.status),
    checklist,
    burnDown: burnDownFor(checklist),
    linkedDesignDocs: normalizeStringArray(item.linkedDesignDocs, []),
    linkedEngineeringDocs: normalizeStringArray(item.linkedEngineeringDocs, []),
    linkedArchitectureDocs: normalizeStringArray(item.linkedArchitectureDocs, []),
    linkedReviewFindingIds: normalizeStringArray(item.linkedReviewFindingIds, []),
    linkedReviewDocs: normalizeStringArray(item.linkedReviewDocs, []),
    resolutionEvidence: normalizeStringArray(item.resolutionEvidence, [])
  };
}

function normalizeChecklist(value: unknown, prefix: string): ProjectChangePlanChecklistItem[] {
  const raw = Array.isArray(value) ? value : [];
  const items = raw.filter(isRecord).map((item, index) => ({
    id: nonEmptyString(item.id) ?? `${prefix}-check-${index + 1}`,
    text: nonEmptyString(item.text) ?? nonEmptyString(item.title) ?? `核对项 ${index + 1}`,
    status: normalizeTaskStatus(item.status),
    source: nonEmptyString(item.source)
  }));
  return items.length ? items : [
    { id: `${prefix}-check-1`, text: "确认文档变更已经清楚描述需求。", status: "todo" },
    { id: `${prefix}-check-2`, text: "确认对应开发计划和验收条件。", status: "todo" }
  ];
}

function normalizeDevelopmentPlan(value: unknown, changeItems: ProjectChangePlanItem[], generatedAt: string): ProjectDevelopmentPlanTask[] {
  const raw = Array.isArray(value) ? value.filter(isRecord).map((item, index) => normalizeDevelopmentTask(item, index, changeItems)) : [];
  if (raw.length) return raw;
  return [];
}

function normalizeDevelopmentTask(item: Record<string, unknown>, index: number, changeItems: ProjectChangePlanItem[]): ProjectDevelopmentPlanTask {
  const phase = normalizePhase(item.phase);
  const id = nonEmptyString(item.id) ?? `task-${index + 1}`;
  const title = nonEmptyString(item.title) ?? `开发任务 ${index + 1}`;
  const summary = nonEmptyString(item.summary) ?? "该任务还缺少说明。";
  const changeItemIds = normalizeStringArray(item.changeItemIds, changeItems.map((change) => change.id));
  return {
    id,
    title,
    summary,
    phase,
    status: normalizeTaskStatus(item.status),
    progress: clampPercent(item.progress),
    start: nonEmptyString(item.start),
    end: nonEmptyString(item.end),
    dependencies: normalizeStringArray(item.dependencies, []),
    changeItemIds,
    deliverables: normalizeStringArray(item.deliverables, []),
    acceptance: normalizeStringArray(item.acceptance, []),
    implementationBrief: normalizeImplementationBrief(item.implementationBrief, { title, summary }),
    workset: normalizeWorkset(item.workset, changeItems, changeItemIds),
    acceptanceEvidence: normalizeAcceptanceEvidence(item.acceptanceEvidence, id)
  };
}

function normalizeImplementationBrief(
  value: unknown,
  fallback: { title: string; summary: string }
): ProjectTaskImplementationBrief {
  const input = isRecord(value) ? value : {};
  return {
    objective: nonEmptyString(input.objective) ?? fallback.title,
    currentBehavior: nonEmptyString(input.currentBehavior) ?? fallback.summary,
    targetBehavior: nonEmptyString(input.targetBehavior) ?? fallback.summary,
    approach: nonEmptyString(input.approach) ?? "按关联文档和工作集约束推进；缺少上下文时先回到计划文档补齐，不直接施工。",
    constraints: normalizeStringArray(input.constraints, []),
    nonGoals: normalizeStringArray(input.nonGoals, []),
    rollbackPlan: nonEmptyString(input.rollbackPlan) ?? "如果证据表明任务边界不成立，停止代码修改并回写计划问题。"
  };
}

function normalizeWorkset(
  value: unknown,
  changeItems: ProjectChangePlanItem[],
  changeItemIds: string[]
): ProjectTaskWorkset {
  const input = isRecord(value) ? value : {};
  const relatedChangeItems = changeItems.filter((item) => changeItemIds.includes(item.id));
  const relatedDocs = normalizeStringArray(input.relatedDocs, relatedChangeItems.flatMap((item) => [
    ...item.sourceDocuments,
    ...item.linkedDesignDocs,
    ...item.linkedEngineeringDocs,
    ...item.linkedArchitectureDocs,
    ...item.linkedReviewDocs
  ]).filter(uniqueFilter));
  return {
    readFiles: normalizeStringArray(input.readFiles, []),
    writeFiles: normalizeStringArray(input.writeFiles, []),
    relatedDocs,
    testCommands: normalizeStringArray(input.testCommands, []),
    traceLinks: normalizeStringArray(input.traceLinks, relatedChangeItems.flatMap((item) => item.linkedReviewFindingIds).filter(uniqueFilter)),
    contextNotes: normalizeStringArray(input.contextNotes, [])
  };
}

function normalizeAcceptanceEvidence(value: unknown, taskId: string): ProjectTaskAcceptanceEvidence[] {
  const raw = Array.isArray(value) ? value.filter(isRecord) : [];
  return raw.map((item, index) => ({
    id: nonEmptyString(item.id) ?? `${taskId}-evidence-${index + 1}`,
    description: nonEmptyString(item.description) ?? nonEmptyString(item.summary) ?? `验收证据 ${index + 1}`,
    command: nonEmptyString(item.command),
    expectedResult: nonEmptyString(item.expectedResult) ?? nonEmptyString(item.expected) ?? "需要记录可验证的实际结果。",
    status: normalizeTaskStatus(item.status),
    evidence: nonEmptyString(item.evidence)
  }));
}

function normalizeExpectedChangelog(
  value: unknown,
  version: string,
  generatedAt: string,
  changeItems: ProjectChangePlanItem[]
): ProjectExpectedChangelog {
  const input = isRecord(value) ? value : {};
  return {
    version: nonEmptyString(input.version) ?? version,
    date: nonEmptyString(input.date) ?? generatedAt.slice(0, 10),
    summary: nonEmptyString(input.summary) ?? "本版本将根据已核对的项目变更文档完成开发。",
    added: normalizeStringArray(input.added, changeItems.filter((item) => item.sourceExplorer === "design").map((item) => item.title)),
    changed: normalizeStringArray(input.changed, changeItems.filter((item) => item.sourceExplorer !== "design" && item.sourceExplorer !== "review").map((item) => item.title)),
    fixed: normalizeStringArray(input.fixed, changeItems.filter((item) => item.sourceExplorer === "review").map((item) => item.title)),
    risks: normalizeStringArray(input.risks, ["如果变更项没有被用户核对，agent 不应进入代码生成阶段。"])
  };
}

function normalizeAgentProgress(value: unknown): ProjectChangePlanModel["agentProgress"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item, index) => ({
    timestamp: nonEmptyString(item.timestamp) ?? new Date().toISOString(),
    taskId: nonEmptyString(item.taskId) ?? `progress-${index + 1}`,
    status: normalizeTaskStatus(item.status),
    summary: nonEmptyString(item.summary) ?? "agent 进度事件缺少说明。"
  }));
}

function renderProjectChangePlanMarkdown(model: ProjectChangePlanModel): string {
  return [
    "# 项目变更与开发计划",
    "",
    "<!-- praxis:project-change-plan:start -->",
    "",
    `- 当前版本：${model.currentVersion}`,
    `- 预期版本：${model.nextVersion}`,
    `- 版本变化：${model.bump}`,
    `- 状态：${model.status}`,
    `- Git：${model.git.shortCommit} / ${model.git.branch}${model.git.dirty ? " / dirty" : ""}`,
    `- 更新于：${model.generatedAt}`,
    "",
    "## 版本决策",
    "",
    model.versionReason,
    "",
    "## 项目变更项",
    "",
    ...model.changeItems.flatMap((item) => [
      `### ${item.title}`,
      "",
      `- ID：${item.id}`,
      `- 来源：${item.sourceExplorer}`,
      `- 状态：${item.status}`,
      `- 燃尽：${item.burnDown.done}/${item.burnDown.total} (${Math.round(item.burnDown.percent)}%)`,
      "",
      item.summary,
      "",
      "#### Checklist",
      "",
      ...item.checklist.map((check) => `- [${check.status === "done" ? "x" : " "}] ${check.text}${check.source ? ` (${check.source})` : ""}`),
      "",
      "#### 关联文档",
      "",
      ...[
        ...item.sourceDocuments,
        ...item.linkedDesignDocs,
        ...item.linkedEngineeringDocs,
        ...item.linkedArchitectureDocs,
        ...item.linkedReviewDocs
      ].filter(uniqueFilter).map((doc) => `- ${doc}`),
      "",
      ...(item.linkedReviewFindingIds.length ? [
        "#### 关联评审问题",
        "",
        ...item.linkedReviewFindingIds.map((findingId) => `- ${findingId}`),
        ""
      ] : []),
      ...(item.resolutionEvidence.length ? [
        "#### 修复证据",
        "",
        ...item.resolutionEvidence.map((evidence) => `- ${evidence}`),
        ""
      ] : []),
      ""
    ]),
    "## Agent 开发计划",
    "",
    ...model.developmentPlan.flatMap((task) => [
      `### ${task.title}`,
      "",
      `- ID：${task.id}`,
      `- 阶段：${task.phase}`,
      `- 状态：${task.status}`,
      `- 进度：${Math.round(task.progress * 100)}%`,
      `- 依赖：${task.dependencies.length ? task.dependencies.join(", ") : "无"}`,
      "",
      task.summary,
      "",
      "#### 交付物",
      "",
      ...task.deliverables.map((item) => `- ${item}`),
      "",
      "#### 验收条件",
      "",
      ...task.acceptance.map((item) => `- ${item}`),
      "",
      "#### 施工 Brief",
      "",
      `- 目标：${task.implementationBrief.objective}`,
      `- 当前：${task.implementationBrief.currentBehavior}`,
      `- 目标状态：${task.implementationBrief.targetBehavior}`,
      `- 施工策略：${task.implementationBrief.approach}`,
      `- 回退条件：${task.implementationBrief.rollbackPlan}`,
      "",
      markdownList("约束", task.implementationBrief.constraints),
      "",
      markdownList("非目标", task.implementationBrief.nonGoals),
      "",
      "#### 施工工作集",
      "",
      markdownList("必须读取", task.workset.readFiles),
      "",
      markdownList("预计写入", task.workset.writeFiles),
      "",
      markdownList("相关文档", task.workset.relatedDocs),
      "",
      markdownList("验证命令", task.workset.testCommands),
      "",
      markdownList("Trace", task.workset.traceLinks),
      "",
      markdownList("上下文说明", task.workset.contextNotes),
      "",
      "#### 验收证据",
      "",
      ...(task.acceptanceEvidence.length ? task.acceptanceEvidence.flatMap((item) => [
        `- ${item.description}`,
        `  - 状态：${item.status}`,
        item.command ? `  - 命令：\`${item.command}\`` : "",
        `  - 期望：${item.expectedResult}`,
        item.evidence ? `  - 证据：${item.evidence}` : ""
      ].filter(Boolean)) : ["- 无。"]),
      ""
    ]),
    "## 预期 Changelog",
    "",
    `### ${model.expectedChangelog.version} (${model.expectedChangelog.date})`,
    "",
    model.expectedChangelog.summary,
    "",
    markdownList("Added", model.expectedChangelog.added),
    "",
    markdownList("Changed", model.expectedChangelog.changed),
    "",
    markdownList("Fixed", model.expectedChangelog.fixed),
    "",
    markdownList("Risks", model.expectedChangelog.risks),
    "",
    "## Agent 进度",
    "",
    ...(model.agentProgress.length ? model.agentProgress.map((item) => `- ${item.timestamp} [${item.status}] ${item.taskId}: ${item.summary}`) : ["- 暂无开发进度事件。"]),
    "",
    "## 待确认问题",
    "",
    ...(model.questions.length ? model.questions.map((item) => `- ${item}`) : ["- 暂无。"]),
    "",
    "## Structured Model",
    "",
    modelFenceStart,
    JSON.stringify(model, null, 2),
    "```",
    "",
    "<!-- praxis:project-change-plan:end -->",
    ""
  ].join("\n");
}

function renderProjectChangePlanHtml(model: ProjectChangePlanModel): string {
  const changeCards = model.changeItems.map((item) => `
    <article class="project-change-card" data-praxis-change-id="${escapeHtmlAttr(item.id)}" data-praxis-status="${escapeHtmlAttr(item.status)}">
      <h3>${escapeHtmlText(item.title)}</h3>
      <p>${escapeHtmlText(item.summary)}</p>
      <p>来源：${escapeHtmlText(item.sourceExplorer)} · 燃尽：${item.burnDown.done}/${item.burnDown.total}</p>
      <ul>${item.checklist.map((check) => `<li data-praxis-check-status="${escapeHtmlAttr(check.status)}">${escapeHtmlText(check.text)}</li>`).join("")}</ul>
      ${item.linkedReviewFindingIds.length ? `<p>关联评审问题：${item.linkedReviewFindingIds.map(escapeHtmlText).join(", ")}</p>` : ""}
      ${item.linkedReviewDocs.length ? `<p>评审文档：${item.linkedReviewDocs.map(escapeHtmlText).join(", ")}</p>` : ""}
    </article>`).join("\n");
  const taskRows = model.developmentPlan.map((task) => `
    <article class="project-plan-task" data-praxis-task-id="${escapeHtmlAttr(task.id)}" data-praxis-status="${escapeHtmlAttr(task.status)}" data-praxis-phase="${escapeHtmlAttr(task.phase)}">
      <h3>${escapeHtmlText(task.title)}</h3>
      <p>${escapeHtmlText(task.summary)}</p>
      <p>${escapeHtmlText(task.phase)} · ${escapeHtmlText(task.status)} · ${Math.round(task.progress * 100)}%</p>
      <section><h4>施工 Brief</h4><p>${escapeHtmlText(task.implementationBrief.objective)}</p><p>${escapeHtmlText(task.implementationBrief.approach)}</p></section>
      <section><h4>工作集</h4>${htmlList("必须读取", task.workset.readFiles)}${htmlList("预计写入", task.workset.writeFiles)}${htmlList("相关文档", task.workset.relatedDocs)}${htmlList("验证命令", task.workset.testCommands)}</section>
      <section><h4>验收证据</h4><ul>${(task.acceptanceEvidence.length ? task.acceptanceEvidence : []).map((item) => `<li>${escapeHtmlText(item.description)} · ${escapeHtmlText(item.status)} · ${escapeHtmlText(item.expectedResult)}</li>`).join("") || "<li>无。</li>"}</ul></section>
    </article>`).join("\n");
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    "  <title>项目变更与开发计划</title>",
    "  <style>body{font-family:Inter,system-ui,sans-serif;background:#0c1116;color:#edf2f7}.panel{border:1px solid #263241;border-radius:8px;padding:12px;margin:10px 0;background:#111820}.grid{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:12px}article{border:1px solid #2a394a;border-radius:8px;padding:10px;margin:8px 0;background:#101922}small{color:#8ea0b5}</style>",
    "</head>",
    "<body>",
    '  <main data-praxis-kind="project-change-plan">',
    "    <section class=\"panel\">",
    "      <small>Praxis Project Memory</small>",
    "      <h1>项目变更与开发计划</h1>",
    `      <p>版本：${escapeHtmlText(model.currentVersion)} -> ${escapeHtmlText(model.nextVersion)} (${escapeHtmlText(model.bump)})</p>`,
    `      <p>${escapeHtmlText(model.versionReason)}</p>`,
    "    </section>",
    "    <section class=\"grid\">",
    `      <section class="panel"><h2>项目变更项</h2>${changeCards}</section>`,
    `      <section class="panel"><h2>Agent 开发计划</h2>${taskRows}</section>`,
    `      <section class="panel"><h2>预期 Changelog</h2><h3>${escapeHtmlText(model.expectedChangelog.version)}</h3><p>${escapeHtmlText(model.expectedChangelog.summary)}</p>${htmlList("Added", model.expectedChangelog.added)}${htmlList("Changed", model.expectedChangelog.changed)}${htmlList("Fixed", model.expectedChangelog.fixed)}${htmlList("Risks", model.expectedChangelog.risks)}</section>`,
    "    </section>",
    `    <script type="application/json" data-praxis-snapshot="project-change-plan">${escapeHtmlText(JSON.stringify(model))}</script>`,
    "  </main>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function parseProjectChangePlanModel(content: string): ProjectChangePlanModel | undefined {
  const fence = content.match(/```json praxis-project-change-plan\s*([\s\S]*?)```/i);
  const script = content.match(/<script[^>]*data-praxis-snapshot=["']project-change-plan["'][^>]*>([\s\S]*?)<\/script>/i);
  const raw = fence?.[1] ?? htmlDecode(script?.[1] ?? "");
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as ProjectChangePlanModel;
  } catch {
    return undefined;
  }
}

function burnDownFor(checklist: ProjectChangePlanChecklistItem[]) {
  const total = checklist.length;
  const done = checklist.filter((item) => item.status === "done").length;
  return { total, done, percent: total ? (done / total) * 100 : 0 };
}

function bumpSemver(current: string, bump: ProjectChangePlanBump): string {
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  const major = Number(match?.[1] ?? 0);
  const minor = Number(match?.[2] ?? 0);
  const patch = Number(match?.[3] ?? 0);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return current;
}

function reviewFindingChecklist(finding: ReviewFinding, source?: string): ProjectChangePlanChecklistItem[] {
  return [
    {
      id: `${finding.id}-review-evidence`,
      text: "复核评审问题仍然存在，并记录最新证据。",
      status: "todo",
      source
    },
    {
      id: `${finding.id}-docs-impact`,
      text: "更新受影响的项目、设计、工程或架构文档，说明问题边界和整改方案。",
      status: "todo",
      source: PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH
    },
    {
      id: `${finding.id}-implementation`,
      text: "按计划完成必要的代码、配置或测试修改。",
      status: "todo"
    },
    {
      id: `${finding.id}-verification`,
      text: "运行验证命令并把结果写入计划文档和评审问题文档。",
      status: "todo"
    },
    {
      id: `${finding.id}-review-closeout`,
      text: "重新运行或复核对应评审项，确认问题可被标记为 resolved / mitigated / accepted_risk。",
      status: "todo"
    }
  ];
}

function ensureReviewDevelopmentTasks(
  tasks: ProjectDevelopmentPlanTask[],
  changeItemId: string,
  finding: ReviewFinding,
  generatedAt: string,
  issueDocs: string[] = [],
  evidenceDocs: string[] = []
): ProjectDevelopmentPlanTask[] {
  const reviewDocs = ["docs/review/quality-review.md", ...issueDocs].filter(uniqueFilter);
  const evidenceFiles = evidenceDocs.filter((item) => !item.endsWith(".html")).filter(uniqueFilter);
  const candidateWriteFiles = evidenceFiles.filter((item) => !item.startsWith("docs/"));
  const traceLinks = [finding.id, ...finding.affectedAnchors.map((anchor) => anchor.id)].filter(uniqueFilter);
  const contextNotes = [
    `${finding.severity} ${qualityReviewCategoryLabel(finding.category)}：${finding.summary}`,
    finding.whyItMatters ? `影响：${finding.whyItMatters}` : "",
    finding.suggestedAction ? `建议动作：${finding.suggestedAction}` : "",
    "评审判断可以被 agent 纠偏；如果证据不足，应先更新 review 文档和计划问题，不要直接改代码。"
  ].filter(Boolean);
  const templates: ProjectDevelopmentPlanTask[] = [
    {
      id: `${changeItemId}-docs`,
      title: `核对评审问题：${finding.title}`,
      summary: "读取 docs/review 中的问题证据，确认整改边界，并同步受影响的项目记忆文档。",
      phase: "docs",
      status: "todo",
      progress: 0,
      start: generatedAt.slice(0, 10),
      dependencies: [],
      changeItemIds: [changeItemId],
      deliverables: [...reviewDocs, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH],
      acceptance: [
        "评审问题的证据、影响范围和整改边界已经在 docs 中说明。",
        "如果评审判断不成立，必须记录判伪理由和受影响评审项的回归范围。"
      ],
      implementationBrief: {
        objective: "把评审问题转化为可施工前的事实核对任务。",
        currentBehavior: finding.summary,
        targetBehavior: "评审问题、证据、影响范围和是否需要整改的判断都能在 docs 中复核。",
        approach: "先读取 review issue、category 和证据文件；复核问题是否成立；若成立再进入计划拆解，若不成立则回写判伪理由。",
        constraints: ["评审页面不能直接消除问题。", "所有判断必须落到 docs/review 和项目计划文档。"],
        nonGoals: ["本任务不修改业务代码。"],
        rollbackPlan: "如果证据不足，保持 finding 待确认，并把缺失证据写入计划问题。"
      },
      workset: {
        readFiles: [...reviewDocs, ...evidenceFiles].filter(uniqueFilter),
        writeFiles: [...reviewDocs, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
        relatedDocs: reviewDocs,
        testCommands: [],
        traceLinks,
        contextNotes
      },
      acceptanceEvidence: [
        {
          id: `${changeItemId}-docs-evidence`,
          description: "评审问题成立性、影响范围和整改边界已经写入 review/project 文档。",
          expectedResult: "docs/review 与 docs/project 中能看到明确的证据、判断和下一步。",
          status: "todo"
        }
      ]
    },
    {
      id: `${changeItemId}-plan`,
      title: `编排整改计划：${finding.title}`,
      summary: "把评审问题拆成可验证的开发任务、测试任务和关闭条件。",
      phase: "plan",
      status: "todo",
      progress: 0,
      dependencies: [`${changeItemId}-docs`],
      changeItemIds: [changeItemId],
      deliverables: [PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH],
      acceptance: [
        "计划中包含代码影响、验证方式、风险和预期 changelog。",
        "每个后续施工任务都带有 implementationBrief、workset 和 acceptanceEvidence。"
      ],
      implementationBrief: {
        objective: "把评审问题拆成可执行、可验证、可回写进度的施工任务包。",
        currentBehavior: "评审问题已经进入项目变更项，但还不能直接施工。",
        targetBehavior: "代码、测试、复核任务具备明确工作集、验收证据和依赖关系。",
        approach: "根据 review 文档和证据文件拆分任务；明确候选读写文件、验证命令和关闭条件。",
        constraints: ["不得输出泛化任务。", "不得跳过验证和复核。"],
        nonGoals: ["本任务不直接改代码。"],
        rollbackPlan: "如果无法定位施工范围，阻塞计划并写入 questions，不生成占位代码任务。"
      },
      workset: {
        readFiles: [...reviewDocs, ...evidenceFiles, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
        writeFiles: [PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH],
        relatedDocs: reviewDocs,
        testCommands: [],
        traceLinks,
        contextNotes
      },
      acceptanceEvidence: [
        {
          id: `${changeItemId}-plan-evidence`,
          description: "计划任务包已包含具体读写文件、上下文和验收证据。",
          expectedResult: "施工 agent 能从计划文档理解任务边界和验证方式。",
          status: "todo"
        }
      ]
    },
    {
      id: `${changeItemId}-code`,
      title: `实施评审整改：${finding.title}`,
      summary: "按已核对计划修改源代码、配置、测试或文档，不在 Review Queue 页面直接关闭问题。",
      phase: "code",
      status: "todo",
      progress: 0,
      dependencies: [`${changeItemId}-plan`],
      changeItemIds: [changeItemId],
      deliverables: [...candidateWriteFiles, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
      acceptance: [
        "代码、配置、测试或文档修改严格落在计划工作集内。",
        "修改后的实现能解释评审问题为何被解决或被缓解。",
        "如果发现原评审判断不成立，停止施工并回写判伪理由。"
      ],
      implementationBrief: {
        objective: "按已核对计划实施评审整改。",
        currentBehavior: finding.summary,
        targetBehavior: finding.suggestedAction || "评审问题被代码、配置、测试或文档变更关闭，并保留可复核证据。",
        approach: "优先读取 evidence 和 affected anchor 指向的文件；只修改计划列出的候选文件；必要时先补测试再改实现。",
        constraints: ["不得绕过 docs-first 流程。", "不得扩大到未列入工作集的无关模块。"],
        nonGoals: ["不顺手重构无关代码。", "不在没有证据时改变架构边界。"],
        rollbackPlan: "如果候选文件无法支撑整改，回到计划任务补充工作集，不继续盲改。"
      },
      workset: {
        readFiles: [...reviewDocs, ...evidenceFiles].filter(uniqueFilter),
        writeFiles: candidateWriteFiles,
        relatedDocs: reviewDocs,
        testCommands: defaultReviewTestCommands(),
        traceLinks,
        contextNotes
      },
      acceptanceEvidence: [
        {
          id: `${changeItemId}-code-evidence`,
          description: "代码或配置变更与评审问题的因果关系已经记录。",
          expectedResult: "diff、文档和 review finding 能共同解释问题如何被解决。",
          status: "todo"
        }
      ]
    },
    {
      id: `${changeItemId}-test`,
      title: `验证评审整改：${finding.title}`,
      summary: "运行必要的构建、测试或静态检查，并把结果作为关闭证据回写。",
      phase: "test",
      status: "todo",
      progress: 0,
      dependencies: [`${changeItemId}-code`],
      changeItemIds: [changeItemId],
      deliverables: [PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH, ...reviewDocs].filter(uniqueFilter),
      acceptance: [
        "验证命令、结果和残余风险已经记录。",
        "验证失败时，计划任务状态必须保持 blocked 或 todo，不能关闭 finding。"
      ],
      implementationBrief: {
        objective: "验证评审整改是否真正成立。",
        currentBehavior: "整改尚未形成可复核验证证据。",
        targetBehavior: "构建、测试或专项验证输出被写回计划和评审文档。",
        approach: "运行计划列出的验证命令；记录命令、结果、失败原因和残余风险。",
        constraints: ["不能只写自然语言确认。", "不能用未运行的命令当作证据。"],
        nonGoals: ["不新增无关测试范围。"],
        rollbackPlan: "验证失败时回退到 code 任务并记录失败证据。"
      },
      workset: {
        readFiles: [...reviewDocs, ...candidateWriteFiles, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
        writeFiles: [...reviewDocs, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
        relatedDocs: reviewDocs,
        testCommands: defaultReviewTestCommands(),
        traceLinks,
        contextNotes
      },
      acceptanceEvidence: defaultReviewTestCommands().map((command, index) => ({
        id: `${changeItemId}-test-command-${index + 1}`,
        description: `运行验证命令：${command}`,
        command,
        expectedResult: "命令通过，或失败原因和残余风险被写入计划文档。",
        status: "todo"
      }))
    },
    {
      id: `${changeItemId}-review`,
      title: `复核评审项：${finding.title}`,
      summary: "重新运行相关评审项或人工复核，并根据证据更新评审问题状态。",
      phase: "review",
      status: "todo",
      progress: 0,
      dependencies: [`${changeItemId}-test`],
      changeItemIds: [changeItemId],
      deliverables: reviewDocs,
      acceptance: [
        "评审问题关闭状态有明确证据，不是页面内的消除动作。",
        "必要时触发相关评审项回归，确认纠偏没有影响其他 finding。"
      ],
      implementationBrief: {
        objective: "复核并关闭或重新分类评审问题。",
        currentBehavior: "整改完成后仍需要 review 文档确认。",
        targetBehavior: "finding 状态、关闭理由、证据和回归范围都在 docs/review 中可追溯。",
        approach: "根据验证证据复核 finding；如存在项目理解纠偏，记录回归范围并重新运行相关评审。",
        constraints: ["只有 agent 基于证据才能更新 finding 状态。", "关闭理由必须写入文档。"],
        nonGoals: ["不通过 UI 直接删除或隐藏 finding。"],
        rollbackPlan: "如果回归发现新问题，保持 finding open 并追加新的计划项。"
      },
      workset: {
        readFiles: [...reviewDocs, PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH].filter(uniqueFilter),
        writeFiles: reviewDocs,
        relatedDocs: reviewDocs,
        testCommands: [],
        traceLinks,
        contextNotes
      },
      acceptanceEvidence: [
        {
          id: `${changeItemId}-review-closeout-evidence`,
          description: "review finding 的最终状态、理由和证据已经写入 docs/review。",
          expectedResult: "评审文档能解释 finding 是 resolved、mitigated、accepted_risk 还是 false_positive。",
          status: "todo"
        }
      ]
    }
  ];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const template of templates) {
    const existing = byId.get(template.id);
    byId.set(template.id, existing ? {
      ...existing,
      changeItemIds: [...existing.changeItemIds, changeItemId].filter(uniqueFilter),
      deliverables: [...existing.deliverables, ...template.deliverables].filter(uniqueFilter),
      acceptance: [...existing.acceptance, ...template.acceptance].filter(uniqueFilter)
    } : template);
  }
  return [...byId.values()];
}

function upsertById(items: ProjectChangePlanItem[], nextItem: ProjectChangePlanItem): ProjectChangePlanItem[] {
  const found = items.some((item) => item.id === nextItem.id);
  if (!found) return [nextItem, ...items];
  return items.map((item) => item.id === nextItem.id ? {
    ...item,
    ...nextItem,
    sourceDocuments: [...nextItem.sourceDocuments, ...item.sourceDocuments].filter(uniqueFilter),
    linkedReviewFindingIds: [...nextItem.linkedReviewFindingIds, ...item.linkedReviewFindingIds].filter(uniqueFilter),
    linkedReviewDocs: [...nextItem.linkedReviewDocs, ...item.linkedReviewDocs].filter(uniqueFilter),
    resolutionEvidence: item.resolutionEvidence
  } : item);
}

function bumpForReviewFinding(severity: ReviewSeverity): ProjectChangePlanBump {
  if (severity === "P0" || severity === "P1" || severity === "P2" || severity === "P3") return "patch";
  return "patch";
}

function maxBump(left: ProjectChangePlanBump, right: ProjectChangePlanBump): ProjectChangePlanBump {
  const rank: Record<ProjectChangePlanBump, number> = { none: 0, patch: 1, minor: 2, major: 3 };
  return rank[right] > rank[left] ? right : left;
}

function reviewVersionReason(bump: ProjectChangePlanBump, finding: ReviewFinding): string {
  if (bump === "patch") {
    return `本次变更由 Review Queue 的 ${finding.severity} 评审问题触发，默认按修复型变更进入 patch；如果后续计划识别到新增能力或破坏性影响，版本决策必须在计划文档中升级为 minor 或 major。`;
  }
  return defaultVersionReason(bump, []);
}

function qualityReviewCategoryLabel(category: string): string {
  return category.replaceAll("_", " ");
}

function defaultReviewTestCommands(): string[] {
  return [
    "npm run typecheck",
    "npm run build"
  ];
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "item";
}

function defaultVersionReason(bump: ProjectChangePlanBump, changeItems: ProjectChangePlanItem[]): string {
  if (bump === "major") return "本次变更包含可能破坏既有使用方式或核心工作流的变化，因此按 SemVer 需要 major bump。";
  if (bump === "minor") return "本次变更引入新的产品能力或工作流，但未确认存在破坏性变化，因此按 SemVer 需要 minor bump。";
  if (bump === "patch") return "本次变更主要是修复、文档同步或局部改进，因此按 SemVer 需要 patch bump。";
  if (changeItems.length) return "当前文档变更尚未形成需要版本号变化的明确证据。";
  return "缺少可判断版本变化的文档证据。";
}

function sourceFingerprintFor(sources: ProjectChangePlanSourceDocument[]): string {
  return sources.map((source) => `${source.path}:${Math.round(source.mtimeMs)}:${source.content.length}`).join("|");
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return "";
    throw error;
  }
}

function normalizePlanStatus(value: unknown): ProjectChangePlanStatus {
  if (value === "ready_for_review" || value === "approved" || value === "in_development" || value === "completed") return value;
  return "draft";
}

function normalizeChangeStatus(value: unknown): ProjectChangePlanItemStatus {
  if (value === "approved" || value === "in_progress" || value === "done" || value === "blocked") return value;
  return "candidate";
}

function normalizeTaskStatus(value: unknown): ProjectChangePlanTaskStatus {
  if (value === "doing" || value === "done" || value === "blocked") return value;
  return "todo";
}

function normalizeBump(value: unknown): ProjectChangePlanBump {
  if (value === "major" || value === "minor" || value === "none") return value;
  return "patch";
}

function normalizeExplorer(value: unknown): ProjectChangeSourceExplorer {
  if (value === "model" || value === "design" || value === "engineering" || value === "architecture" || value === "review") return value;
  return "project";
}

function normalizePhase(value: unknown): ProjectDevelopmentPlanTask["phase"] {
  if (value === "docs" || value === "plan" || value === "code" || value === "test" || value === "review" || value === "release") return value;
  return "plan";
}

function clampPercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 1) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function excerptForAgent(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n...[truncated ${value.length - maxLength} chars]`;
}

function markdownList(title: string, items: string[]): string {
  return [`#### ${title}`, "", ...(items.length ? items.map((item) => `- ${item}`) : ["- 无。"])].join("\n");
}

function htmlList(title: string, items: string[]): string {
  return `<h3>${escapeHtmlText(title)}</h3><ul>${(items.length ? items : ["无。"]).map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`;
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

function htmlDecode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function uniqueFilter(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
