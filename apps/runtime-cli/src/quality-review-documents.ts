import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ReviewFindingSchema,
  ReviewRunSchema,
  type ReviewCategory,
  type ReviewFinding,
  type ReviewFindingStatus,
  type ReviewEvaluatorRef,
  type ReviewEvidenceRef,
  type ReviewRun,
  type ReviewSeverity
} from "@praxis/schema";

export const QUALITY_REVIEW_DOC_RELATIVE_PATH = "docs/review/quality-review.md";
export const QUALITY_REVIEW_HTML_RELATIVE_PATH = "docs/review/quality-review.html";
export const QUALITY_REVIEW_RUNTIME_PROGRESS_RELATIVE_PATH = "docs/review/.runtime/latest.json";
export const QUALITY_REVIEW_RUNTIME_LOG_DIR_RELATIVE_PATH = "docs/review/.runtime/logs";

export interface QualityReviewCategoryDocument {
  category: ReviewCategory;
  title: string;
  status: "not_run" | "completed" | "failed" | "has_unresolved" | "clear";
  summary: string;
  evaluatorSummary: string;
  findingIds: string[];
  unresolvedFindingIds: string[];
  docPath: string;
  htmlPath: string;
}

export interface QualityReviewIssueDocument {
  findingId: string;
  category: ReviewCategory;
  title: string;
  severity: ReviewSeverity;
  status: ReviewFindingStatus;
  docPath: string;
  htmlPath: string;
}

export interface QualityReviewDocumentModel {
  schemaVersion: "praxis.qualityReviewDocuments.v1";
  root: string;
  generatedAt: string;
  run: ReviewRun;
  categoryOrder: ReviewCategory[];
  categories: QualityReviewCategoryDocument[];
  findings: ReviewFinding[];
  unresolvedFindingIds: string[];
  documents: {
    rootDocPath: string;
    rootHtmlPath: string;
    categories: QualityReviewCategoryDocument[];
    issues: QualityReviewIssueDocument[];
  };
}

export interface WriteQualityReviewDocumentsInput {
  root: string;
  run: ReviewRun;
  findings: ReviewFinding[];
  categoryOrder: ReviewCategory[];
}

export interface WriteQualityReviewDocumentsResult {
  rootDocPath: string;
  rootHtmlPath: string;
  categoryDocuments: QualityReviewCategoryDocument[];
  issueDocuments: QualityReviewIssueDocument[];
  model: QualityReviewDocumentModel;
}

const reviewModelStart = "<!-- praxis:quality-review:model:start -->";
const reviewModelEnd = "<!-- praxis:quality-review:model:end -->";

const categoryTitles: Record<ReviewCategory, string> = {
  foundation_integrity: "文档、知识与项目记忆缺口",
  architecture_boundaries: "架构与模块边界",
  dependencies_coupling: "依赖与耦合",
  build_release: "构建与发布",
  testing_verification: "测试与验证",
  security_secrets: "安全与敏感信息",
  configuration_environment: "配置与环境",
  code_quality_maintainability: "代码质量与可维护性",
  api_contracts_data_flow: "接口契约与数据流",
  performance_resources: "性能与资源",
  documentation_knowledge: "文档、知识与项目记忆缺口"
};

export async function readQualityReviewDocumentModel(root: string): Promise<QualityReviewDocumentModel | undefined> {
  let content: string;
  try {
    content = await readFile(path.join(root, QUALITY_REVIEW_DOC_RELATIVE_PATH), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
  const json = extractBetween(content, reviewModelStart, reviewModelEnd);
  if (!json) return undefined;
  const parsed = JSON.parse(json) as QualityReviewDocumentModel;
  return normalizeQualityReviewDocumentModel(parsed);
}

export async function writeQualityReviewDocuments(input: WriteQualityReviewDocumentsInput): Promise<WriteQualityReviewDocumentsResult> {
  const root = path.resolve(input.root);
  const run = normalizeReviewRunForDocuments(input.run);
  const findings = sortReviewFindings(input.findings.map((finding) => normalizeReviewFindingForDocuments(finding)));
  const categoryOrder = input.categoryOrder.map((category) => displayReviewCategory(category));

  await rm(path.join(root, "docs", "review", "categories"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "review", "issues"), { recursive: true, force: true });

  const categoryDocuments = buildCategoryDocuments(run, findings, categoryOrder);
  const issueDocuments = findings.map((finding) => buildIssueDocument(finding));
  const unresolvedFindingIds = findings.filter((finding) => !isResolvedFindingStatus(finding.status)).map((finding) => finding.id);
  const model: QualityReviewDocumentModel = {
    schemaVersion: "praxis.qualityReviewDocuments.v1",
    root,
    generatedAt: new Date().toISOString(),
    run,
    categoryOrder,
    categories: categoryDocuments,
    findings,
    unresolvedFindingIds,
    documents: {
      rootDocPath: QUALITY_REVIEW_DOC_RELATIVE_PATH,
      rootHtmlPath: QUALITY_REVIEW_HTML_RELATIVE_PATH,
      categories: categoryDocuments,
      issues: issueDocuments
    }
  };

  const rootDocPath = path.join(root, QUALITY_REVIEW_DOC_RELATIVE_PATH);
  const rootHtmlPath = path.join(root, QUALITY_REVIEW_HTML_RELATIVE_PATH);
  await mkdir(path.dirname(rootDocPath), { recursive: true });
  await writeFile(rootDocPath, renderQualityReviewMarkdown(model), "utf8");
  await writeFile(rootHtmlPath, renderQualityReviewHtml(model), "utf8");

  for (const category of categoryDocuments) {
    const categoryFindings = findings.filter((finding) => displayReviewCategory(finding.category) === category.category);
    const categoryDocPath = path.join(root, category.docPath);
    const categoryHtmlPath = path.join(root, category.htmlPath);
    await mkdir(path.dirname(categoryDocPath), { recursive: true });
    await writeFile(categoryDocPath, renderCategoryMarkdown(model, category, categoryFindings), "utf8");
    await writeFile(categoryHtmlPath, renderCategoryHtml(model, category, categoryFindings), "utf8");
  }

  for (const issue of issueDocuments) {
    const finding = findings.find((item) => item.id === issue.findingId);
    if (!finding) continue;
    const issueDocPath = path.join(root, issue.docPath);
    const issueHtmlPath = path.join(root, issue.htmlPath);
    await mkdir(path.dirname(issueDocPath), { recursive: true });
    await writeFile(issueDocPath, renderIssueMarkdown(model, finding, issue), "utf8");
    await writeFile(issueHtmlPath, renderIssueHtml(model, finding, issue), "utf8");
  }

  return {
    rootDocPath: QUALITY_REVIEW_DOC_RELATIVE_PATH,
    rootHtmlPath: QUALITY_REVIEW_HTML_RELATIVE_PATH,
    categoryDocuments,
    issueDocuments,
    model
  };
}

export function qualityReviewCategoryTitle(category: ReviewCategory): string {
  return categoryTitles[displayReviewCategory(category)] ?? category;
}

export function isResolvedFindingStatus(status: ReviewFindingStatus): boolean {
  return status === "dismissed" || status === "mitigated" || status === "resolved" || status === "false_positive" || status === "accepted_risk";
}

function normalizeQualityReviewDocumentModel(value: QualityReviewDocumentModel): QualityReviewDocumentModel {
  const run = normalizeReviewRunForDocuments(value.run);
  const findings = sortReviewFindings((value.findings ?? []).map((finding) => normalizeReviewFindingForDocuments(finding)));
  const categoryOrder = (value.categoryOrder?.length ? value.categoryOrder : run.categories).map((category) => displayReviewCategory(category));
  const categories = value.categories?.length ? value.categories : buildCategoryDocuments(run, findings, categoryOrder);
  const issueDocuments = value.documents?.issues?.length ? value.documents.issues : findings.map((finding) => buildIssueDocument(finding));
  return {
    schemaVersion: "praxis.qualityReviewDocuments.v1",
    root: typeof value.root === "string" ? value.root : run.root,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : run.generatedAt,
    run,
    categoryOrder,
    categories,
    findings,
    unresolvedFindingIds: findings.filter((finding) => !isResolvedFindingStatus(finding.status)).map((finding) => finding.id),
    documents: {
      rootDocPath: value.documents?.rootDocPath ?? QUALITY_REVIEW_DOC_RELATIVE_PATH,
      rootHtmlPath: value.documents?.rootHtmlPath ?? QUALITY_REVIEW_HTML_RELATIVE_PATH,
      categories,
      issues: issueDocuments
    }
  };
}

function normalizeReviewRunForDocuments(input: ReviewRun): ReviewRun {
  const run = ReviewRunSchema.parse(input);
  return ReviewRunSchema.parse({
    ...run,
    source: normalizeReviewAgentSource(run.source),
    evaluatorResults: run.evaluatorResults?.map((result) => ({
      ...result,
      evaluator: normalizeReviewEvaluatorForDocuments(result.evaluator),
      summary: displayEvaluatorSummary(result.summary)
    }))
  } satisfies ReviewRun);
}

function normalizeReviewFindingForDocuments(input: ReviewFinding): ReviewFinding {
  const finding = ReviewFindingSchema.parse(input);
  return ReviewFindingSchema.parse({
    ...finding,
    title: displayReviewText(finding.title),
    summary: displayReviewText(finding.summary),
    whyItMatters: displayReviewText(finding.whyItMatters),
    suggestedAction: displayReviewText(finding.suggestedAction),
    source: finding.source === "codegraph" ? "hybrid" : finding.source,
    evaluator: finding.evaluator ? normalizeReviewEvaluatorForDocuments(finding.evaluator) : undefined,
    evidence: finding.evidence.map(normalizeReviewEvidenceForDocuments)
  } satisfies ReviewFinding);
}

function normalizeReviewEvaluatorForDocuments(evaluator: ReviewEvaluatorRef): ReviewEvaluatorRef {
  return {
    ...evaluator,
    name: displayReviewText(evaluator.name),
    source: normalizeReviewAgentSource(evaluator.source),
    prompt: evaluator.prompt.startsWith("[prompt-registry:")
      ? evaluator.prompt
      : `[prompt-registry:${evaluator.id}]`
  };
}

function normalizeReviewEvidenceForDocuments(evidence: ReviewEvidenceRef): ReviewEvidenceRef {
  const source = evidence.source === "code_fact_graph"
    ? evidence.path ? "file" : "agent"
    : evidence.source;
  return {
    ...evidence,
    source,
    path: evidence.path ? displayReviewPath(evidence.path) : undefined,
    summary: displayReviewText(evidence.summary),
    excerpt: evidence.excerpt ? displayReviewText(evidence.excerpt) : undefined
  };
}

function normalizeReviewAgentSource<T extends ReviewRun["source"] | ReviewEvaluatorRef["source"]>(source: T): T {
  return (source === "pi-agent" ? "agent" : source) as T;
}

function buildCategoryDocuments(run: ReviewRun, findings: ReviewFinding[], categoryOrder: ReviewCategory[]): QualityReviewCategoryDocument[] {
  return categoryOrder.map((category) => {
    const displayCategory = displayReviewCategory(category);
    const categoryFindings = findings.filter((finding) => displayReviewCategory(finding.category) === displayCategory);
    const unresolvedFindingIds = categoryFindings.filter((finding) => !isResolvedFindingStatus(finding.status)).map((finding) => finding.id);
    const evaluatorResult = run.evaluatorResults?.find((item) => displayReviewCategory(item.evaluator.category) === displayCategory);
    const status = evaluatorResult?.status === "failed"
      ? "failed"
      : unresolvedFindingIds.length
        ? "has_unresolved"
        : evaluatorResult?.status === "completed"
          ? "clear"
          : evaluatorResult?.status === "partial"
            ? "completed"
            : "not_run";
    return {
      category: displayCategory,
      title: qualityReviewCategoryTitle(displayCategory),
      status,
      summary: categorySummary(displayCategory, status, categoryFindings.length, unresolvedFindingIds.length),
      evaluatorSummary: evaluatorResult?.summary ?? "本次评审运行没有记录该评审项的执行结果。",
      findingIds: categoryFindings.map((finding) => finding.id),
      unresolvedFindingIds,
      docPath: `docs/review/categories/${safeFilePart(displayCategory)}.md`,
      htmlPath: `docs/review/categories/${safeFilePart(displayCategory)}.html`
    };
  });
}

function buildIssueDocument(finding: ReviewFinding): QualityReviewIssueDocument {
  const idParts = finding.id.split(":").filter(Boolean);
  const indexPart = idParts[idParts.length - 1] ?? "issue";
  const slug = safeFilePart(`${displayReviewCategory(finding.category)}-${finding.severity}-${displayReviewText(finding.title)}-${indexPart}`);
  return {
    findingId: finding.id,
    category: displayReviewCategory(finding.category),
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    docPath: `docs/review/issues/${slug}.md`,
    htmlPath: `docs/review/issues/${slug}.html`
  };
}

function renderQualityReviewMarkdown(model: QualityReviewDocumentModel): string {
  const unresolved = model.findings.filter((finding) => !isResolvedFindingStatus(finding.status));
  return [
    "# 工程评审队列",
    "",
    "这套文档是评审队列的持久来源。十个评审项、已发现问题和待解决问题都记录在这里；界面只渲染这些文档的投影。",
    "",
    "## 元数据",
    "",
    "- 来源：本地仓库评审文档",
    `- 运行状态：${model.run.status}`,
    `- 生成时间：${model.run.generatedAt}`,
    `- 问题总数：${model.findings.length}`,
    `- 待解决问题：${unresolved.length}`,
    "",
    "## 十个评审项",
    "",
    "| 评审项 | 状态 | 待解决 | 全部问题 | 文档 |",
    "| --- | --- | ---: | ---: | --- |",
    ...model.categories.map((category) =>
      `| ${markdownTable(displayReviewText(category.title))} | ${category.status} | ${category.unresolvedFindingIds.length} | ${category.findingIds.length} | [md](${category.docPath}) / [html](${category.htmlPath}) |`
    ),
    "",
    "## 待解决问题",
    "",
    unresolved.length
      ? "| 严重级别 | 评审项 | 问题 | 状态 | 文档 |\n| --- | --- | --- | --- | --- |\n" + unresolved.map((finding) => {
        const issue = model.documents.issues.find((item) => item.findingId === finding.id);
        return `| ${finding.severity} | ${markdownTable(qualityReviewCategoryTitle(finding.category))} | ${markdownTable(displayReviewText(finding.title))} | ${finding.status} | ${issue ? `[md](${issue.docPath}) / [html](${issue.htmlPath})` : finding.id} |`;
      }).join("\n")
      : "当前没有待解决问题。注意：评审项失败不等于健康，失败原因见分类文档。",
    "",
    "## 评审项执行结果",
    "",
    ...model.categories.flatMap((category) => [
      `### ${displayReviewText(category.title)}`,
      "",
      displayReviewText(category.summary),
      "",
      `执行摘要：${displayEvaluatorSummary(category.evaluatorSummary)}`,
      ""
    ]),
    reviewModelStart,
    JSON.stringify(redactEmbeddedReviewModel(model), null, 2),
    reviewModelEnd,
    ""
  ].join("\n");
}

function renderCategoryMarkdown(model: QualityReviewDocumentModel, category: QualityReviewCategoryDocument, findings: ReviewFinding[]): string {
  const unresolved = findings.filter((finding) => !isResolvedFindingStatus(finding.status));
  return [
    `# ${displayReviewText(category.title)}`,
    "",
    "来源：本地仓库评审文档",
    "",
    "## 分类状态",
    "",
    `- 状态：${category.status}`,
    `- 全部问题：${findings.length}`,
    `- 待解决问题：${unresolved.length}`,
    `- 执行摘要：${displayEvaluatorSummary(category.evaluatorSummary)}`,
    "",
    "## 待解决问题",
    "",
    unresolved.length ? renderFindingTable(model, unresolved) : "当前没有待解决问题。",
    "",
    "## 全部问题",
    "",
    findings.length ? findings.map((finding) => renderFindingMarkdownBlock(model, finding)).join("\n\n") : "本评审项没有生成候选问题。如果该评审项失败，请以分类状态和执行摘要为准，不得把空结果解释为健康。",
    ""
  ].join("\n");
}

function renderIssueMarkdown(model: QualityReviewDocumentModel, finding: ReviewFinding, issue: QualityReviewIssueDocument): string {
  return [
    `# ${displayReviewText(finding.title)}`,
    "",
    "来源：本地仓库评审文档",
    "",
    "## 状态",
    "",
    `- 评审项：${qualityReviewCategoryTitle(finding.category)}`,
    `- 严重级别：${finding.severity}`,
    `- 状态：${finding.status}`,
    `- 置信度：${finding.confidence}`,
    `- 知识类型：${finding.knowledgeKind}`,
    `- 更新时间：${finding.updatedAt}`,
    "",
    "## 问题说明",
    "",
    displayReviewText(finding.summary),
    "",
    "## 为什么重要",
    "",
    displayReviewText(finding.whyItMatters),
    "",
    "## 建议处理",
    "",
    displayReviewText(finding.suggestedAction),
    "",
    "## 证据",
    "",
    renderEvidenceMarkdown(finding),
    "",
    "## 影响锚点",
    "",
    finding.affectedAnchors.length ? finding.affectedAnchors.map((anchor) => `- ${markdownInline(displayReviewAnchor(anchor))}`).join("\n") : "- 暂无明确锚点。",
    "",
    `<!-- praxis:quality-review:issue -->`,
    ""
  ].join("\n");
}

function renderFindingTable(model: QualityReviewDocumentModel, findings: ReviewFinding[]): string {
  return [
    "| 严重级别 | 问题 | 状态 | 文档 |",
    "| --- | --- | --- | --- |",
    ...findings.map((finding) => {
      const issue = model.documents.issues.find((item) => item.findingId === finding.id);
      return `| ${finding.severity} | ${markdownTable(displayReviewText(finding.title))} | ${finding.status} | ${issue ? `[md](${issue.docPath}) / [html](${issue.htmlPath})` : finding.id} |`;
    })
  ].join("\n");
}

function renderFindingMarkdownBlock(model: QualityReviewDocumentModel, finding: ReviewFinding): string {
  const issue = model.documents.issues.find((item) => item.findingId === finding.id);
  return [
    `### ${finding.severity} · ${displayReviewText(finding.title)}`,
    "",
    `- 状态：${finding.status}`,
    `- 置信度：${finding.confidence}`,
    issue ? `- 问题文档：[${issue.docPath}](${issue.docPath})` : `- 问题 ID：${finding.id}`,
    "",
    displayReviewText(finding.summary),
    "",
    `建议：${displayReviewText(finding.suggestedAction)}`,
    "",
    "证据：",
    renderEvidenceMarkdown(finding)
  ].join("\n");
}

function renderEvidenceMarkdown(finding: ReviewFinding): string {
  if (!finding.evidence.length) return "- 暂无证据。";
  return finding.evidence.map((evidence) => {
    const pathPart = evidence.path ? ` ${displayReviewPath(evidence.path)}` : evidence.anchor ? ` ${displayReviewAnchor(evidence.anchor)}` : "";
    const excerpt = evidence.excerpt ? `；片段：${displayReviewText(evidence.excerpt)}` : "";
    return `- ${reviewEvidenceSourceLabel(evidence.source)}${pathPart}：${displayReviewText(evidence.summary)}${excerpt}`;
  }).join("\n");
}

function renderQualityReviewHtml(model: QualityReviewDocumentModel): string {
  const unresolved = model.findings.filter((finding) => !isResolvedFindingStatus(finding.status));
  return htmlPage("工程评审队列", [
    `<section class="hero"><p>Praxis Review Queue</p><h1>工程评审队列</h1><p>这套文档是评审队列的持久来源。界面只渲染 docs/review 的投影。</p></section>`,
    `<section><h2>元数据</h2><div class="grid">${[
      metricCard("运行状态", model.run.status),
      metricCard("问题总数", String(model.findings.length)),
      metricCard("待解决问题", String(unresolved.length)),
      metricCard("生成时间", model.run.generatedAt)
    ].join("")}</div></section>`,
    `<section><h2>十个评审项</h2><div class="list">${model.categories.map((category) => categoryCard(category)).join("")}</div></section>`,
    `<section><h2>待解决问题</h2>${unresolved.length ? `<div class="list">${unresolved.map((finding) => findingCard(model, finding)).join("")}</div>` : "<p>当前没有待解决问题。评审项失败不等于健康，失败原因见分类文档。</p>"}</section>`,
    `${reviewModelStart}${escapeHtmlText(JSON.stringify(redactEmbeddedReviewModel(model)))}${reviewModelEnd}`
  ].join("\n"));
}

function renderCategoryHtml(model: QualityReviewDocumentModel, category: QualityReviewCategoryDocument, findings: ReviewFinding[]): string {
  const unresolved = findings.filter((finding) => !isResolvedFindingStatus(finding.status));
  return htmlPage(displayReviewText(category.title), [
    `<section class="hero"><p>Praxis Review Category</p><h1>${escapeHtmlText(displayReviewText(category.title))}</h1><p>${escapeHtmlText(displayReviewText(category.summary))}</p></section>`,
    `<section><h2>分类状态</h2><div class="grid">${[
      metricCard("状态", category.status),
      metricCard("全部问题", String(findings.length)),
      metricCard("待解决问题", String(unresolved.length)),
      metricCard("生成时间", model.run.generatedAt)
    ].join("")}</div><p>${escapeHtmlText(displayEvaluatorSummary(category.evaluatorSummary))}</p></section>`,
    `<section><h2>待解决问题</h2>${unresolved.length ? `<div class="list">${unresolved.map((finding) => findingCard(model, finding)).join("")}</div>` : "<p>当前没有待解决问题。</p>"}</section>`,
    `<section><h2>全部问题</h2>${findings.length ? `<div class="list">${findings.map((finding) => findingCard(model, finding)).join("")}</div>` : "<p>本评审项没有生成候选问题。如果该评审项失败，请以分类状态和执行摘要为准。</p>"}</section>`
  ].join("\n"));
}

function renderIssueHtml(model: QualityReviewDocumentModel, finding: ReviewFinding, issue: QualityReviewIssueDocument): string {
  return htmlPage(displayReviewText(finding.title), [
    `<section class="hero"><p>${escapeHtmlText(qualityReviewCategoryTitle(finding.category))}</p><h1>${escapeHtmlText(displayReviewText(finding.title))}</h1><p>${escapeHtmlText(displayReviewText(finding.summary))}</p></section>`,
    `<section><h2>状态</h2><div class="grid">${[
      metricCard("严重级别", finding.severity),
      metricCard("状态", finding.status),
      metricCard("置信度", finding.confidence),
      metricCard("知识类型", finding.knowledgeKind)
    ].join("")}</div></section>`,
    htmlTextSection("为什么重要", displayReviewText(finding.whyItMatters)),
    htmlTextSection("建议处理", displayReviewText(finding.suggestedAction)),
    `<section><h2>证据</h2>${finding.evidence.length ? `<div class="list">${finding.evidence.map(evidenceCard).join("")}</div>` : "<p>暂无证据。</p>"}</section>`,
    `<section><h2>影响锚点</h2>${finding.affectedAnchors.length ? `<ul>${finding.affectedAnchors.map((anchor) => `<li><code>${escapeHtmlText(displayReviewAnchor(anchor))}</code></li>`).join("")}</ul>` : "<p>暂无明确锚点。</p>"}</section>`,
    `<!-- praxis:quality-review:issue -->`
  ].join("\n"));
}

function categoryCard(category: QualityReviewCategoryDocument): string {
  return [
    `<article class="card">`,
    `<h3>${escapeHtmlText(displayReviewText(category.title))}</h3>`,
    `<p><strong>${escapeHtmlText(category.status)}</strong> · 待解决 ${category.unresolvedFindingIds.length} / 全部 ${category.findingIds.length}</p>`,
    `<p>${escapeHtmlText(displayReviewText(category.summary))}</p>`,
    `<p><a href="${escapeHtmlAttr(category.htmlPath)}">HTML</a> · <a href="${escapeHtmlAttr(category.docPath)}">Markdown</a></p>`,
    `</article>`
  ].join("");
}

function findingCard(model: QualityReviewDocumentModel, finding: ReviewFinding): string {
  const issue = model.documents.issues.find((item) => item.findingId === finding.id);
  return [
    `<article class="card">`,
    `<h3>${escapeHtmlText(finding.severity)} · ${escapeHtmlText(displayReviewText(finding.title))}</h3>`,
    `<p>${escapeHtmlText(qualityReviewCategoryTitle(finding.category))} · ${escapeHtmlText(finding.status)} · ${escapeHtmlText(finding.confidence)}</p>`,
    `<p>${escapeHtmlText(displayReviewText(finding.summary))}</p>`,
    issue ? `<p><a href="${escapeHtmlAttr(issue.htmlPath)}">HTML</a> · <a href="${escapeHtmlAttr(issue.docPath)}">Markdown</a></p>` : "",
    `</article>`
  ].join("");
}

function evidenceCard(evidence: ReviewFinding["evidence"][number]): string {
  return [
    `<article class="card">`,
    `<h3>${escapeHtmlText(reviewEvidenceSourceLabel(evidence.source))}</h3>`,
    evidence.path ? `<p><code>${escapeHtmlText(displayReviewPath(evidence.path))}</code></p>` : "",
    evidence.anchor ? `<p><code>${escapeHtmlText(displayReviewAnchor(evidence.anchor))}</code></p>` : "",
    `<p>${escapeHtmlText(displayReviewText(evidence.summary))}</p>`,
    evidence.excerpt ? `<pre>${escapeHtmlText(displayReviewText(evidence.excerpt))}</pre>` : "",
    `</article>`
  ].join("");
}

function displayReviewText(value: string): string {
  return value
    .replace(/\bPi\b/g, "评审 Agent")
    .replace(/\bpi-agent\b/gi, "评审 Agent")
    .replace(/Code Fact Graph|FACT graph|code[-\s]?fact[-\s]?graph(?:\.json)?|code graph|codegraph|Codegraph|代码事实图/g, "代码证据索引")
    .replace(/repository-snapshot(?:\.json)?/g, "仓库扫描快照")
    .replace(/TASK-result/g, "候选问题")
    .replace(/本地仓库理解工具/g, "本地仓库分析")
    .replace(/worker 上下文/g, "评审上下文")
    .replace(/外部 worker 上下文/g, "外部执行上下文")
    .replace(/外部 worker 提示词/g, "外部执行输入")
    .replace(/worker 注意力/g, "评审关注点")
    .replace(/agent 上下文/g, "评审上下文")
    .replace(/Agent 上下文/g, "评审上下文")
    .replace(/Agent Workspace/g, "评审工作区")
    .replace(/agent prompt/g, "模型输入")
    .replace(/prompt/g, "模型输入")
    .replace(/trace/g, "运行记录")
    .replace(/通过领域层定义的端口\/接口调用/g, "通过经设计确认的接口边界调用")
    .replace(/应用层只依赖领域接口/g, "上层模块只依赖经设计确认的稳定接口")
    .replace(/必须通过领域聚合根/g, "必须先确认正确承载位置后再")
    .replace(/新增领域 Repository/g, "补充经设计确认的持久化边界")
    .replace(/通过领域 Repository 接口替换/g, "通过经设计确认的持久化或查询边界收敛")
    .replace(/领域 Repository 接口/g, "经设计确认的持久化或查询边界")
    .replace(/领域仓储/g, "经设计确认的持久化边界")
    .replace(/领域层接口/g, "经设计确认的接口边界")
    .replace(/review worker/gi, "评审 Agent")
    .replace(/评审\s*worker/g, "评审 Agent")
    .replace(/\bagent\b/g, "评审 Agent")
    .replace(/agent 推断/g, "候选推断")
    .replace(/agent 生成/g, "评审生成")
    .trim();
}

function displayReviewPath(value: string): string {
  return displayReviewText(value)
    .replace(/\.代码证据索引/g, "本地代码索引缓存")
    .replace(/\.distinction[\\/](cache|runtime)/g, "迁移期运行缓存")
    .replace(/\.gitnexus[\\/]?(parse-cache|parsedfile-cache)?/g, "仓库理解缓存");
}

function displayReviewAnchor(anchor: unknown): string {
  return displayReviewPath(JSON.stringify(anchor));
}

function displayEvaluatorSummary(value: string): string {
  return displayReviewText(value)
    .replace(/^评审 Agent\s*生成/, "本评审项生成")
    .replace(/^评审 Agent\s*重新评估生成/, "本评审项重新评估生成")
    .replace(/^评审 Agent\s*已运行但没有返回/, "本评审项没有返回")
    .replace(/^评审 Agent\s*已重新评估该分类/, "本评审项已重新评估")
    .replace(/^评审 Agent\s*分类评估失败/, "本评审项执行失败")
    .replace(/^评审 Agent\s*分类重试失败/, "本评审项重试失败");
}

function reviewEvidenceSourceLabel(source: ReviewFinding["evidence"][number]["source"]): string {
  if (source === "repository_snapshot") return "仓库扫描";
  if (source === "code_fact_graph") return "代码证据";
  if (source === "memory") return "项目记忆";
  if (source === "projection") return "文档投影";
  if (source === "trace") return "执行记录";
  if (source === "file") return "文件证据";
  return "评审复核";
}

function redactEmbeddedReviewModel(model: QualityReviewDocumentModel): QualityReviewDocumentModel {
  const cloned = JSON.parse(JSON.stringify(model)) as QualityReviewDocumentModel;
  for (const result of cloned.run.evaluatorResults ?? []) {
    result.evaluator.prompt = `[prompt-registry:${result.evaluator.id}]`;
    result.summary = displayEvaluatorSummary(result.summary);
  }
  for (const finding of cloned.findings) {
    finding.title = displayReviewText(finding.title);
    finding.summary = displayReviewText(finding.summary);
    finding.whyItMatters = displayReviewText(finding.whyItMatters);
    finding.suggestedAction = displayReviewText(finding.suggestedAction);
    if (finding.evaluator) finding.evaluator.prompt = `[prompt-registry:${finding.evaluator.id}]`;
    finding.evidence = finding.evidence.map((evidence) => ({
      ...evidence,
      summary: displayReviewText(evidence.summary),
      excerpt: evidence.excerpt ? displayReviewText(evidence.excerpt) : undefined
    }));
  }
  for (const category of cloned.categories) {
    category.title = displayReviewText(category.title);
    category.summary = displayReviewText(category.summary);
    category.evaluatorSummary = displayEvaluatorSummary(category.evaluatorSummary);
  }
  return cloned;
}

function htmlTextSection(title: string, content: string): string {
  return `<section><h2>${escapeHtmlText(title)}</h2><p>${escapeHtmlText(content)}</p></section>`;
}

function metricCard(label: string, value: string): string {
  return `<article class="metric"><span>${escapeHtmlText(label)}</span><strong>${escapeHtmlText(value)}</strong></article>`;
}

function htmlPage(title: string, body: string): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    `  <title>${escapeHtmlText(title)}</title>`,
    "  <style>",
    "    body { margin: 0; background: #0b1118; color: #d8e7f7; font: 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    "    main { padding: 24px; }",
    "    section { border: 1px solid #24364a; border-radius: 8px; padding: 16px; margin: 0 0 14px; background: #101923; }",
    "    .hero { background: #132231; }",
    "    h1, h2, h3, p { margin: 0 0 8px; }",
    "    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }",
    "    .metric, .card { border: 1px solid #28415a; border-radius: 8px; padding: 12px; background: #0d1620; }",
    "    .metric span { display: block; color: #91abc7; }",
    "    .metric strong { display: block; font-size: 20px; }",
    "    .list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }",
    "    a { color: #7dd3fc; }",
    "    code, pre { background: #071019; border: 1px solid #26394d; border-radius: 6px; padding: 2px 5px; }",
    "    pre { overflow: auto; padding: 10px; white-space: pre-wrap; }",
    "  </style>",
    "</head>",
    "<body>",
    "<main>",
    body,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function categorySummary(category: ReviewCategory, status: QualityReviewCategoryDocument["status"], total: number, unresolved: number): string {
  if (status === "failed") return `${qualityReviewCategoryTitle(category)}评审项执行失败，失败信息已记录为待处理的评审运行问题；不能把空结果视为健康。`;
  if (unresolved) return `${qualityReviewCategoryTitle(category)}发现 ${unresolved} 个待解决问题，共 ${total} 个问题。`;
  if (total) return `${qualityReviewCategoryTitle(category)}的问题都已进入已处理状态，共 ${total} 个问题。`;
  if (status === "not_run") return `${qualityReviewCategoryTitle(category)}尚未完成评审。`;
  return `${qualityReviewCategoryTitle(category)}本次没有生成候选问题。`;
}

function sortReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const severityRank: Record<ReviewSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return findings.slice().sort((left, right) => {
    return severityRank[left.severity] - severityRank[right.severity]
      || displayReviewCategory(left.category).localeCompare(displayReviewCategory(right.category))
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}

function displayReviewCategory(category: ReviewCategory): ReviewCategory {
  return category === "foundation_integrity" ? "documentation_knowledge" : category;
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/^[a-zA-Z]:[\\/]+/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140)
    || "item";
}

function extractBetween(content: string, start: string, end: string): string | undefined {
  const startIndex = content.indexOf(start);
  if (startIndex < 0) return undefined;
  const afterStart = startIndex + start.length;
  const endIndex = content.indexOf(end, afterStart);
  if (endIndex < 0) return undefined;
  return content.slice(afterStart, endIndex).trim();
}

function markdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function markdownInline(value: string): string {
  return value.replace(/`/g, "\\`").replace(/\r?\n/g, " ");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "ENOENT";
}
