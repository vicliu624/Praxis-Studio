import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderUseCaseDiagramMermaid } from "@praxis/projection-engine";
import type { InteractionModelCandidate } from "@praxis/schema";
import {
  renderDrilldownKindSpecificHtml,
  renderDrilldownKindSpecificMarkdown
} from "./design-drilldown-doc-sections.js";
import { normalizeMermaidSource } from "./interaction-model-normalizer.js";

export const DESIGN_MAP_DOC_RELATIVE_PATH = "docs/design/use-case-diagrams-maps.md";
export const DESIGN_MAP_HTML_RELATIVE_PATH = "docs/design/use-case-diagrams-maps.html";
export const DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH = "docs/design/use-case-diagrams";

const DESIGN_MAP_MANAGED_START = "<!-- praxis:use-case-diagrams-maps:start -->";
const DESIGN_MAP_MANAGED_END = "<!-- praxis:use-case-diagrams-maps:end -->";
const DESIGN_USE_CASE_MANAGED_START = "<!-- praxis:use-case-diagram:start -->";
const DESIGN_USE_CASE_MANAGED_END = "<!-- praxis:use-case-diagram:end -->";
export const DESIGN_INTERACTION_MODEL_START = "<!-- praxis:interaction-model:start -->";
export const DESIGN_INTERACTION_MODEL_END = "<!-- praxis:interaction-model:end -->";

type UseCaseDrilldownDiagramKind = InteractionModelCandidate["useCaseDrilldowns"][number]["kind"];
type DesignVersionBump = "major" | "minor" | "patch" | "none";

export interface DesignVersionDecision {
  schemaVersion: "praxis.designVersionDecision.v1";
  bump: DesignVersionBump;
  currentVersion: string;
  nextVersion: string;
  reason: string;
  semverRule: string;
  atomicCommitScope: string;
  commitSummary: string;
  affectedArtifacts: string[];
  breaking: boolean;
  confidence: "low" | "medium" | "high";
  questions: string[];
}

export interface DesignGitVersionInfo {
  branch: string;
  commit: string;
  shortCommit: string;
  dirty: boolean;
}

export type DesignDiscoveryProgressPublisher = (detail: string, eventPatch: Record<string, unknown>) => Promise<void>;
export async function writeUseCaseDiagramsMapDocument(
  root: string,
  model: InteractionModelCandidate,
  versionDecision?: DesignVersionDecision
): Promise<string> {
  const docPath = path.join(root, DESIGN_MAP_DOC_RELATIVE_PATH);
  const generated = await renderUseCaseDiagramsMapDocument(root, model, versionDecision);
  let nextContent = generated;
  try {
    const existing = await readFile(docPath, "utf8");
    const startIndex = existing.indexOf(DESIGN_MAP_MANAGED_START);
    const endIndex = existing.indexOf(DESIGN_MAP_MANAGED_END);
    if (startIndex >= 0 && endIndex > startIndex) {
      nextContent = [
        existing.slice(0, startIndex).trimEnd(),
        generated.slice(generated.indexOf(DESIGN_MAP_MANAGED_START)).trim(),
        existing.slice(endIndex + DESIGN_MAP_MANAGED_END.length).trimStart()
      ].filter(Boolean).join("\n\n");
      if (!nextContent.endsWith("\n")) nextContent += "\n";
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  await mkdir(path.dirname(docPath), { recursive: true });
  await writeFile(docPath, nextContent, "utf8");
  return docPath;
}

async function renderUseCaseDiagramsMapDocument(
  root: string,
  model: InteractionModelCandidate,
  versionDecision?: DesignVersionDecision
): Promise<string> {
  const projectVersion = await readProjectSemanticVersion(root);
  const gitVersion = await readProjectGitVersion(root);
  const version = versionDecision?.nextVersion ?? projectVersion ?? "0.1.0";
  const changeType = versionDecision ? versionDecision.bump.toUpperCase() : "DISCOVERY";
  const generatedAt = model.generatedAt || new Date().toISOString();
  const contextsById = new Map(model.contexts.map((context) => [context.id, context]));
  const contextPathLabels = buildContextPathLabels(model);
  const drilldownsByUseCase = groupUseCaseDrilldowns(model);
  const lines = [
    "# 用例图地图",
    "",
    DESIGN_MAP_MANAGED_START,
    "",
    "## 元数据",
    "",
    `项目版本：${version}`,
    `设计文档版本：${version}`,
    `Git 分支：${gitVersion.branch}`,
    `Git 提交：${gitVersion.commit}`,
    `Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`,
    `Agent 版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`,
    `更新于：${generatedAt}`,
    `来源：${designModelSourceLabel(model.source)}`,
    "",
    "## 版本策略",
    "",
    "本项目的设计变更使用 agent 控制的语义化版本。",
    "",
    "- agent 在识别真实需求或设计变更后决定版本 bump。",
    "- 用户确认业务语义、兼容性和风险，但不手工选择版本号。",
    "- 每一次版本变化都应对应一个边界清晰的原子化 git commit。",
    "- MAJOR：参与者边界、系统边界、核心故事职责、公开 API 或数据契约发生不兼容变化。",
    "- MINOR：向后兼容地新增用例、参与者、外部系统、流程或设计能力。",
    "- PATCH：向后兼容的问题修复、澄清、证据补充、图布局或非行为性文档修正。",
    "- NONE：纯讨论、被拒绝的输入，或不会写入持久项目/设计/代码/记忆的操作。",
    "",
    "## 业务模块边界",
    "",
    ...renderContextHierarchyMarkdown(model),
    "",
    "## 用例图索引",
    "",
    "| ID | 用例图文档 | 语义 HTML | 下钻 UML | 业务边界路径 | 状态 | 置信度 | 当前版本 | 最近变更 |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- |",
    ...(model.useCases.length
      ? model.useCases.map((useCase) => {
          const contextTitle = contextPathLabels.get(useCase.contextId) ?? contextsById.get(useCase.contextId)?.title ?? useCase.contextId;
          const markdownPath = useCaseDiagramMarkdownRelativePath(useCase.id).replace(/^docs\/design\//, "");
          const htmlPath = useCaseDiagramHtmlRelativePath(useCase.id).replace(/^docs\/design\//, "");
          return `| ${useCase.id} | [${escapeMarkdownTable(useCase.title)}](${markdownPath}) | [HTML](${htmlPath}) | ${drilldownsByUseCase.get(useCase.id)?.length ?? 0} | ${escapeMarkdownTable(contextTitle)} | ${useCase.status} | ${useCase.confidence} | ${version} | ${generatedAt} |`;
        })
      : ["| _无_ | _尚未恢复候选用例图。_ | _不适用_ | _0_ | _不适用_ | _不适用_ | _不适用_ | _不适用_ | _不适用_ |"]),
    "",
    DESIGN_INTERACTION_MODEL_START,
    "<!--",
    "```json",
    JSON.stringify(model, null, 2),
    "```",
    "-->",
    DESIGN_INTERACTION_MODEL_END,
    ""
  ];

  lines.push("## 地图变更记录");
  lines.push("");
  lines.push(`### ${version} - ${generatedAt}`);
  lines.push("");
  lines.push(`变更类型：${changeType}`);
  lines.push(`版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`);
  if (versionDecision) lines.push(`原子提交范围：${versionDecision.atomicCommitScope}`);
  if (versionDecision) lines.push(`提交摘要：${versionDecision.commitSummary}`);
  lines.push(`Git 分支：${gitVersion.branch}`);
  lines.push(`Git 提交：${gitVersion.commit}`);
  lines.push(`Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`);
  lines.push("");
  lines.push(`- 更新用例图地图，并链接 ${model.useCases.length} 个候选用例图独立文档。`);
  lines.push("");
  lines.push(DESIGN_MAP_MANAGED_END);
  lines.push("");
  return lines.join("\n");
}

export async function writeUseCaseDiagramsMapHtmlDocument(
  root: string,
  model: InteractionModelCandidate,
  versionDecision?: DesignVersionDecision
): Promise<string> {
  const htmlPath = path.join(root, DESIGN_MAP_HTML_RELATIVE_PATH);
  let preservedBlocks = new Map<string, string>();
  try {
    const existing = await readFile(htmlPath, "utf8");
    preservedBlocks = extractSemanticHtmlManagedBlocks(existing);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  const nextContent = await renderUseCaseDiagramsMapHtmlDocument(root, model, preservedBlocks, versionDecision);
  await mkdir(path.dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, nextContent, "utf8");
  return htmlPath;
}

export async function writeUseCaseDiagramDocuments(
  root: string,
  model: InteractionModelCandidate,
  versionDecision?: DesignVersionDecision,
  publishProgress?: DesignDiscoveryProgressPublisher
): Promise<{ markdownPaths: string[]; htmlPaths: string[] }> {
  const markdownPaths: string[] = [];
  const htmlPaths: string[] = [];
  const projectVersion = await readProjectSemanticVersion(root);
  const gitVersion = await readProjectGitVersion(root);
  const version = versionDecision?.nextVersion ?? projectVersion ?? "0.1.0";
  const generatedAt = model.generatedAt || new Date().toISOString();
  const contextsById = new Map(model.contexts.map((context) => [context.id, context]));
  const actorsById = new Map(model.actors.map((actor) => [actor.id, actor]));
  const externalSystemsById = new Map(model.externalSystems.map((external) => [external.id, external]));
  const drilldownsByUseCase = groupUseCaseDrilldowns(model);
  const expectedManagedPaths = expectedUseCaseDiagramDocumentPaths(root, model);
  await pruneStaleUseCaseDiagramDocuments(root, expectedManagedPaths, publishProgress);

  for (const useCase of model.useCases) {
    const markdownRelativePath = useCaseDiagramMarkdownRelativePath(useCase.id);
    const htmlRelativePath = useCaseDiagramHtmlRelativePath(useCase.id);
    const markdownPath = path.join(root, markdownRelativePath);
    const htmlPath = path.join(root, htmlRelativePath);
    const context = contextsById.get(useCase.contextId);
    const drilldowns = drilldownsByUseCase.get(useCase.id) ?? [];
    const markdown = renderSingleUseCaseDiagramMarkdownDocument({
      model,
      useCase,
      context,
      actorsById,
      externalSystemsById,
      drilldowns,
      version,
      generatedAt,
      gitVersion,
      versionDecision,
      markdownRelativePath,
      htmlRelativePath
    });
    const html = renderSingleUseCaseDiagramHtmlDocument({
      model,
      useCase,
      context,
      actorsById,
      externalSystemsById,
      drilldowns,
      version,
      generatedAt,
      gitVersion,
      versionDecision,
      markdownRelativePath,
      htmlRelativePath
    });
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, markdown, "utf8");
    await publishProgress?.(`已写入 Use Case Diagram Markdown：${useCase.title}`, {
      kind: "file_edit",
      title: "写入 Use Case Diagram Markdown",
      path: markdownRelativePath,
      metadata: [useCase.id, useCase.status, useCase.confidence]
    });
    await writeFile(htmlPath, html, "utf8");
    await publishProgress?.(`已写入 Use Case Diagram HTML：${useCase.title}`, {
      kind: "file_edit",
      title: "写入 Use Case Diagram HTML",
      path: htmlRelativePath,
      metadata: [useCase.id, useCase.status, useCase.confidence]
    });
    markdownPaths.push(markdownPath);
    htmlPaths.push(htmlPath);
    for (const drilldown of drilldowns) {
      const drilldownMarkdownRelativePath = useCaseDrilldownMarkdownRelativePath(drilldown);
      const drilldownHtmlRelativePath = useCaseDrilldownHtmlRelativePath(drilldown);
      const drilldownMarkdownPath = path.join(root, drilldownMarkdownRelativePath);
      const drilldownHtmlPath = path.join(root, drilldownHtmlRelativePath);
      await mkdir(path.dirname(drilldownMarkdownPath), { recursive: true });
      await writeFile(drilldownMarkdownPath, renderUseCaseDrilldownMarkdownDocument({
        model,
        useCase,
        diagram: drilldown,
        version,
        generatedAt,
        gitVersion,
        versionDecision,
        markdownRelativePath: drilldownMarkdownRelativePath,
        htmlRelativePath: drilldownHtmlRelativePath
      }), "utf8");
      await publishProgress?.(`已写入 ${drilldownKindLabel(drilldown.kind)} Markdown：${drilldown.title}`, {
        kind: "file_edit",
        title: `写入 ${drilldownKindLabel(drilldown.kind)} Markdown`,
        path: drilldownMarkdownRelativePath,
        metadata: [useCase.id, drilldown.id, drilldown.status, drilldown.confidence]
      });
      await writeFile(drilldownHtmlPath, renderUseCaseDrilldownHtmlDocument({
        model,
        useCase,
        diagram: drilldown,
        version,
        generatedAt,
        gitVersion,
        versionDecision,
        markdownRelativePath: drilldownMarkdownRelativePath
      }), "utf8");
      await publishProgress?.(`已写入 ${drilldownKindLabel(drilldown.kind)} HTML：${drilldown.title}`, {
        kind: "file_edit",
        title: `写入 ${drilldownKindLabel(drilldown.kind)} HTML`,
        path: drilldownHtmlRelativePath,
        metadata: [useCase.id, drilldown.id, drilldown.status, drilldown.confidence]
      });
      markdownPaths.push(drilldownMarkdownPath);
      htmlPaths.push(drilldownHtmlPath);
    }
  }
  return { markdownPaths, htmlPaths };
}

function expectedUseCaseDiagramDocumentPaths(root: string, model: InteractionModelCandidate): Set<string> {
  const expected = new Set<string>();
  for (const useCase of model.useCases) {
    expected.add(normalizeAbsolutePath(path.join(root, useCaseDiagramMarkdownRelativePath(useCase.id))));
    expected.add(normalizeAbsolutePath(path.join(root, useCaseDiagramHtmlRelativePath(useCase.id))));
  }
  for (const drilldown of model.useCaseDrilldowns) {
    expected.add(normalizeAbsolutePath(path.join(root, useCaseDrilldownMarkdownRelativePath(drilldown))));
    expected.add(normalizeAbsolutePath(path.join(root, useCaseDrilldownHtmlRelativePath(drilldown))));
  }
  return expected;
}

async function pruneStaleUseCaseDiagramDocuments(
  root: string,
  expectedManagedPaths: Set<string>,
  publishProgress?: DesignDiscoveryProgressPublisher
): Promise<void> {
  const directory = path.join(root, DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH);
  let files: string[];
  try {
    files = await collectFiles(directory);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
  for (const filePath of files) {
    if (!/\.(md|html)$/i.test(filePath)) continue;
    if (expectedManagedPaths.has(normalizeAbsolutePath(filePath))) continue;
    let content = "";
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
    if (!isPraxisManagedUseCaseDocument(content)) continue;
    await rm(filePath, { force: true });
    await publishProgress?.(`已移除过期 Use Case Diagram 文档：${path.relative(root, filePath)}`, {
      kind: "file_edit",
      title: "移除过期设计文档",
      path: path.relative(root, filePath).replace(/\\/g, "/")
    });
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

function isPraxisManagedUseCaseDocument(content: string): boolean {
  return content.includes(DESIGN_USE_CASE_MANAGED_START)
    || (
      content.includes('data-praxis-schema="praxis.semanticDesignHtml.v1"')
      && content.includes(`data-praxis-source-md="${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/`)
    );
}

function normalizeAbsolutePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function groupUseCaseDrilldowns(model: InteractionModelCandidate): Map<string, InteractionModelCandidate["useCaseDrilldowns"]> {
  const grouped = new Map<string, InteractionModelCandidate["useCaseDrilldowns"]>();
  for (const diagram of model.useCaseDrilldowns) {
    const items = grouped.get(diagram.useCaseId) ?? [];
    items.push(diagram);
    grouped.set(diagram.useCaseId, items);
  }
  for (const [useCaseId, items] of grouped.entries()) {
    grouped.set(useCaseId, [...items].sort(compareUseCaseDrilldowns));
  }
  return grouped;
}

function buildContextPathLabels(model: InteractionModelCandidate): Map<string, string> {
  const contextsById = new Map(model.contexts.map((context) => [context.id, context]));
  const labels = new Map<string, string>();
  for (const context of model.contexts) {
    const path = contextPath(model, context.id).map((item) => item.title).join(" / ");
    labels.set(context.id, path || contextsById.get(context.id)?.title || context.id);
  }
  return labels;
}

function contextPath(model: InteractionModelCandidate, contextId: string): InteractionModelCandidate["contexts"] {
  const contextsById = new Map(model.contexts.map((context) => [context.id, context]));
  const result: InteractionModelCandidate["contexts"] = [];
  const visited = new Set<string>();
  let current = contextsById.get(contextId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentContextId ? contextsById.get(current.parentContextId) : undefined;
  }
  return result;
}

function renderContextHierarchyMarkdown(model: InteractionModelCandidate): string[] {
  const childrenByParent = contextChildrenByParent(model);
  const rootContexts = model.contexts.filter((context) => !context.parentContextId);
  if (!rootContexts.length) return ["- 暂无业务边界。"];
  return rootContexts.flatMap((context) => renderContextHierarchyMarkdownNode(context, childrenByParent, 0));
}

function renderContextHierarchyMarkdownNode(
  context: InteractionModelCandidate["contexts"][number],
  childrenByParent: Map<string, InteractionModelCandidate["contexts"]>,
  depth: number
): string[] {
  const indent = "  ".repeat(depth);
  const lines = [
    `${indent}- ${context.title}（${contextKindLabel(context.kind)}）：${escapeMarkdownInline(context.responsibility)}`
  ];
  for (const child of childrenByParent.get(context.id) ?? []) {
    lines.push(...renderContextHierarchyMarkdownNode(child, childrenByParent, depth + 1));
  }
  return lines;
}

function renderContextHierarchyHtml(model: InteractionModelCandidate): string {
  const childrenByParent = contextChildrenByParent(model);
  const rootContexts = model.contexts.filter((context) => !context.parentContextId);
  if (!rootContexts.length) return '    <p class="empty">暂无业务边界。</p>';
  return [
    '    <ol class="context-tree">',
    ...rootContexts.map((context) => renderContextHierarchyHtmlNode(context, childrenByParent, 3)),
    "    </ol>"
  ].join("\n");
}

function renderContextHierarchyHtmlNode(
  context: InteractionModelCandidate["contexts"][number],
  childrenByParent: Map<string, InteractionModelCandidate["contexts"]>,
  depth: number
): string {
  const indent = "  ".repeat(depth);
  const children = childrenByParent.get(context.id) ?? [];
  return [
    `${indent}<li data-praxis-kind="design_context" data-praxis-anchor="${escapeHtmlAttr(context.id)}" data-praxis-context-kind="${escapeHtmlAttr(context.kind)}">`,
    `${indent}  <strong>${escapeHtmlText(context.title)}</strong>`,
    `${indent}  <span>${escapeHtmlText(contextKindLabel(context.kind))}</span>`,
    `${indent}  <p>${escapeHtmlText(context.responsibility)}</p>`,
    children.length ? `${indent}  <ol>` : "",
    ...children.map((child) => renderContextHierarchyHtmlNode(child, childrenByParent, depth + 2)),
    children.length ? `${indent}  </ol>` : "",
    `${indent}</li>`
  ].filter(Boolean).join("\n");
}

function contextChildrenByParent(model: InteractionModelCandidate): Map<string, InteractionModelCandidate["contexts"]> {
  const childrenByParent = new Map<string, InteractionModelCandidate["contexts"]>();
  for (const context of model.contexts) {
    if (!context.parentContextId) continue;
    const children = childrenByParent.get(context.parentContextId) ?? [];
    children.push(context);
    childrenByParent.set(context.parentContextId, children);
  }
  return childrenByParent;
}

function contextKindLabel(kind: InteractionModelCandidate["contexts"][number]["kind"]): string {
  if (kind === "system") return "系统边界";
  if (kind === "business_module") return "业务模块";
  if (kind === "business_capability") return "业务能力";
  if (kind === "bounded_context") return "限界上下文";
  return "过程区域";
}

function compareUseCaseDrilldowns(
  left: InteractionModelCandidate["useCaseDrilldowns"][number],
  right: InteractionModelCandidate["useCaseDrilldowns"][number]
): number {
  return drilldownSortOrder(left.kind) - drilldownSortOrder(right.kind) || left.title.localeCompare(right.title, "zh-CN");
}

function drilldownSortOrder(kind: UseCaseDrilldownDiagramKind): number {
  if (kind === "activity") return 1;
  if (kind === "sequence") return 2;
  if (kind === "state_machine") return 3;
  return 4;
}

function renderUseCaseUmlTreeMarkdown(
  useCase: InteractionModelCandidate["useCases"][number],
  rootHtmlRelativePath: string,
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"]
): string[] {
  const rootLink = rootHtmlRelativePath.replace(/^docs\/design\/use-case-diagrams\//, "");
  const lines = [
    `- Use Case Diagram：[${escapeMarkdownInline(useCase.title)}](${rootLink})`
  ];
  for (const diagram of drilldowns) {
    const link = useCaseDrilldownHtmlRelativePath(diagram).replace(/^docs\/design\/use-case-diagrams\//, "");
    lines.push(`  - ${drilldownKindLabel(diagram.kind)}：[${escapeMarkdownInline(diagram.title)}](${link})`);
  }
  return lines;
}

function renderUseCaseUmlTreeHtml(
  useCase: InteractionModelCandidate["useCases"][number],
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"]
): string {
  const rootPath = useCaseDiagramHtmlRelativePath(useCase.id);
  const root = [
    `      <li data-praxis-uml-node="${escapeHtmlAttr(useCase.id)}" data-praxis-diagram-kind="use_case_diagram" data-praxis-html-path="${escapeHtmlAttr(rootPath)}">`,
    `        <a href="${escapeHtmlAttr(rootPath.replace(/^docs\/design\/use-case-diagrams\//, ""))}">Use Case Diagram：${escapeHtmlText(useCase.title)}</a>`,
    "      </li>"
  ].join("\n");
  const children = drilldowns.map((diagram) => [
    `      <li data-praxis-uml-node="${escapeHtmlAttr(diagram.id)}" data-praxis-parent-use-case="${escapeHtmlAttr(useCase.id)}" data-praxis-diagram-kind="${escapeHtmlAttr(diagram.kind)}" data-praxis-html-path="${escapeHtmlAttr(useCaseDrilldownHtmlRelativePath(diagram))}" data-praxis-coverage-scenario="${escapeHtmlAttr(diagram.coverage.scenario)}" data-praxis-coverage-boundary="${escapeHtmlAttr(diagram.coverage.boundary)}">`,
    `        <a href="${escapeHtmlAttr(useCaseDrilldownHtmlRelativePath(diagram).replace(/^docs\/design\/use-case-diagrams\//, ""))}">${escapeHtmlText(drilldownKindLabel(diagram.kind))}：${escapeHtmlText(diagram.title)}</a>`,
    "      </li>"
  ].join("\n")).join("\n");
  return [
    `    <nav class="uml-tree-layer" data-praxis-kind="annotation" data-praxis-layer="uml_tree" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}">`,
    "      <h3>UML 下钻树</h3>",
    "      <ol>",
    root,
    children,
    "      </ol>",
    "    </nav>"
  ].join("\n");
}

function renderUseCaseDrilldownMarkdownDocument(input: {
  model: InteractionModelCandidate;
  useCase: InteractionModelCandidate["useCases"][number];
  diagram: InteractionModelCandidate["useCaseDrilldowns"][number];
  version: string;
  generatedAt: string;
  gitVersion: DesignGitVersionInfo;
  versionDecision?: DesignVersionDecision;
  markdownRelativePath: string;
  htmlRelativePath: string;
}): string {
  const { model, useCase, diagram, version, generatedAt, gitVersion, versionDecision, markdownRelativePath, htmlRelativePath } = input;
  const changeType = versionDecision ? versionDecision.bump.toUpperCase() : "DISCOVERY";
  const mermaidSource = normalizeMermaidSource(diagram.mermaid, diagram.mermaid).trimEnd();
  const contextPathLabel = buildContextPathLabels(model).get(useCase.contextId) ?? useCase.contextId;
  return [
    `# ${drilldownKindLabel(diagram.kind)}：${diagram.title}`,
    "",
    DESIGN_USE_CASE_MANAGED_START,
    "",
    "## 元数据",
    "",
    `项目版本：${version}`,
    `设计文档版本：${version}`,
    `Git 分支：${gitVersion.branch}`,
    `Git 提交：${gitVersion.commit}`,
    `Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`,
    `Agent 版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`,
    `更新于：${generatedAt}`,
    `来源：${designModelSourceLabel(model.source)}`,
    `父级 Use Case：${useCase.id}`,
    `业务边界路径：${contextPathLabel}`,
    `父级文档：${useCaseDiagramMarkdownRelativePath(useCase.id)}`,
    `Markdown 路径：${markdownRelativePath}`,
    `HTML 路径：${htmlRelativePath}`,
    "",
    ...renderDrilldownKindSpecificMarkdown(diagram),
    "",
    "## Mermaid 图",
    "",
    "```mermaid",
    mermaidSource,
    "```",
    "",
    "## 证据",
    "",
    "| 来源 | 路径 | 行号 | 强度 | 摘要 |",
    "| --- | --- | --- | --- | --- |",
    ...evidenceRows(diagram.evidence),
    "",
    "## 待确认问题",
    "",
    ...listOrNone(diagram.questions),
    "",
    "## 变更记录",
    "",
    `### ${version} - ${generatedAt}`,
    "",
    `变更类型：${changeType}`,
    `版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`,
    versionDecision ? `原子提交范围：${versionDecision.atomicCommitScope}` : "",
    versionDecision ? `提交摘要：${versionDecision.commitSummary}` : "",
    `Git 分支：${gitVersion.branch}`,
    `Git 提交：${gitVersion.commit}`,
    `Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`,
    "",
    "摘要：",
    `- 恢复或更新「${useCase.title}」的 ${drilldownKindLabel(diagram.kind)}。`,
    "",
    DESIGN_USE_CASE_MANAGED_END,
    ""
  ].join("\n");
}

function renderUseCaseDrilldownHtmlDocument(input: {
  model: InteractionModelCandidate;
  useCase: InteractionModelCandidate["useCases"][number];
  diagram: InteractionModelCandidate["useCaseDrilldowns"][number];
  version: string;
  generatedAt: string;
  gitVersion: DesignGitVersionInfo;
  versionDecision?: DesignVersionDecision;
  markdownRelativePath: string;
}): string {
  const { model, useCase, diagram, version, generatedAt, gitVersion, versionDecision, markdownRelativePath } = input;
  const changeType = versionDecision ? versionDecision.bump : "discovery";
  const mermaidSource = normalizeMermaidSource(diagram.mermaid, diagram.mermaid).trimEnd();
  const contextPathLabel = buildContextPathLabels(model).get(useCase.contextId) ?? useCase.contextId;
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtmlText(drilldownKindLabel(diagram.kind))}：${escapeHtmlText(diagram.title)}</title>`,
    "  <style>",
    semanticDesignHtmlCss(),
    "  </style>",
    "</head>",
    "<body>",
    `<article class="praxis-design-map" data-praxis-doc="${escapeHtmlAttr(diagram.kind)}" data-praxis-schema="praxis.semanticDesignHtml.v1" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}" data-praxis-source-md="${escapeHtmlAttr(markdownRelativePath)}">`,
    `  <header class="map-header" data-praxis-kind="${escapeHtmlAttr(drilldownAnchorKind(diagram.kind))}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-layer="base">`,
    "    <p>Praxis Design Explorer</p>",
    `    <h1>${escapeHtmlText(drilldownKindLabel(diagram.kind))}：${escapeHtmlText(diagram.title)}</h1>`,
    `    <span>${escapeHtmlText(contextPathLabel)} · Use Case ${escapeHtmlText(useCase.title)} · 项目版本 ${escapeHtmlText(version)} · Git ${escapeHtmlText(gitVersion.shortCommit)}${gitVersion.dirty ? " dirty" : ""} · 更新于 ${escapeHtmlText(generatedAt)}</span>`,
    "  </header>",
    "",
    `  <section class="diagram-section" data-praxis-kind="${escapeHtmlAttr(drilldownAnchorKind(diagram.kind))}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-parent-use-case="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(diagram.status)}" data-praxis-confidence="${escapeHtmlAttr(diagram.confidence)}">`,
    "    <div class=\"section-heading\">",
    "      <div>",
    `        <p>${escapeHtmlText(contextPathLabel)} / ${escapeHtmlText(useCase.title)}</p>`,
    `        <h2>${escapeHtmlText(diagram.title)}</h2>`,
    "      </div>",
    `      <span>${escapeHtmlText(diagram.status)} · ${escapeHtmlText(diagram.confidence)}</span>`,
    "    </div>",
    `    <p>${escapeHtmlText(diagram.summary)}</p>`,
    renderDrilldownKindSpecificHtml(diagram),
    '    <div class="design-map-grid">',
    `      <div class="base-layer" data-praxis-kind="${escapeHtmlAttr(drilldownAnchorKind(diagram.kind))}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-layer="base">`,
    "        <h3>UML 底图</h3>",
    `        <pre class="mermaid" data-praxis-kind="${escapeHtmlAttr(drilldownAnchorKind(diagram.kind))}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-layer="base"><code>${escapeHtmlText(mermaidSource)}</code></pre>`,
    "      </div>",
    `      <aside class="overlay-layer explanation-layer" data-praxis-kind="annotation" data-praxis-layer="explanation" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-status="${escapeHtmlAttr(diagram.status)}" data-praxis-author="agent">`,
    "        <h3>解释图层</h3>",
    `        <p>${escapeHtmlText(diagram.explanation.design)}</p>`,
    `        <p>${escapeHtmlText(diagram.explanation.implementation)}</p>`,
    "        <p class=\"layer-note\">此图层是 agent 生成的候选设计解释，状态以证据和置信度为准。</p>",
    "      </aside>",
    "    </div>",
    `    <section class="timeline-layer" data-praxis-kind="${escapeHtmlAttr(drilldownAnchorKind(diagram.kind))}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-layer="timeline">`,
    "      <h3>变更记录</h3>",
    `      <article data-praxis-change="${escapeHtmlAttr(changeType)}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-commit-scope="${escapeHtmlAttr(versionDecision?.atomicCommitScope ?? "")}" data-praxis-commit-summary="${escapeHtmlAttr(versionDecision?.commitSummary ?? "")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}">`,
    `        <time datetime="${escapeHtmlAttr(generatedAt)}">${escapeHtmlText(generatedAt)}</time>`,
    `        <span>Git ${escapeHtmlText(gitVersion.shortCommit)} · ${escapeHtmlText(gitVersion.branch)}${gitVersion.dirty ? " · dirty" : ""}</span>`,
    `        <p>${escapeHtmlText(versionDecision ? `${versionDecision.bump.toUpperCase()}: ${versionDecision.reason}` : `恢复或更新 ${drilldownKindLabel(diagram.kind)}。`)}</p>`,
    "      </article>",
    "    </section>",
    "  </section>",
    "</article>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function drilldownKindLabel(kind: UseCaseDrilldownDiagramKind): string {
  if (kind === "activity") return "Activity Diagram";
  if (kind === "sequence") return "Sequence Diagram";
  if (kind === "state_machine") return "State Machine Diagram";
  if (kind === "class_collaboration") return "Class / Structural Collaboration Diagram";
  if (kind === "interaction_overview") return "Interaction Overview Diagram";
  if (kind === "communication") return "Communication Diagram";
  if (kind === "timing") return "Timing Diagram";
  if (kind === "object_snapshot") return "Object Diagram";
  return "Composite Structure Diagram";
}

function drilldownAnchorKind(kind: UseCaseDrilldownDiagramKind): string {
  if (kind === "activity") return "design_activity";
  if (kind === "sequence") return "design_sequence";
  if (kind === "state_machine") return "design_state_machine";
  if (kind === "class_collaboration") return "design_class_collaboration";
  return `design_${kind}`;
}

interface DesignMetricIndexEntry {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  anchor?: string;
  excerpt?: string;
}

interface DesignMetricIndex {
  nodes: DesignMetricIndexEntry[];
  edges: DesignMetricIndexEntry[];
  evidence: DesignMetricIndexEntry[];
  questions: DesignMetricIndexEntry[];
}

function buildUseCaseDesignMetricIndex(input: {
  model: InteractionModelCandidate;
  useCase: InteractionModelCandidate["useCases"][number];
  context: InteractionModelCandidate["contexts"][number] | undefined;
  actorsById: Map<string, InteractionModelCandidate["actors"][number]>;
  externalSystemsById: Map<string, InteractionModelCandidate["externalSystems"][number]>;
}): DesignMetricIndex {
  const { model, useCase, context, actorsById, externalSystemsById } = input;
  const index: DesignMetricIndex = {
    nodes: [],
    edges: [],
    evidence: [],
    questions: []
  };

  const contextPathItems = contextPath(model, useCase.contextId);
  for (const item of contextPathItems.length ? contextPathItems : context ? [context] : []) {
    pushMetricEntry(index.nodes, {
      id: item.id,
      kind: `design_context:${item.kind}`,
      label: item.title,
      detail: item.responsibility || item.summary,
      anchor: item.id
    });
  }
  pushMetricEntry(index.nodes, {
    id: useCase.id,
    kind: "design_use_case",
    label: useCase.title,
    detail: useCase.summary,
    anchor: useCase.id
  });
  for (const actorId of unique([...useCase.primaryActorIds, ...useCase.supportingActorIds])) {
    const actor = actorsById.get(actorId);
    pushMetricEntry(index.nodes, {
      id: actorId,
      kind: actor?.type ? `design_actor:${actor.type}` : "design_actor",
      label: actor?.title ?? actorId,
      detail: actor?.summary,
      anchor: actorId
    });
  }
  for (const externalSystemId of unique(useCase.externalSystemIds)) {
    const external = externalSystemsById.get(externalSystemId);
    pushMetricEntry(index.nodes, {
      id: externalSystemId,
      kind: "design_external_system",
      label: external?.title ?? externalSystemId,
      detail: external?.summary,
      anchor: externalSystemId
    });
  }

  for (let indexOfContext = 1; indexOfContext < contextPathItems.length; indexOfContext += 1) {
    const parent = contextPathItems[indexOfContext - 1];
    const child = contextPathItems[indexOfContext];
    pushMetricEntry(index.edges, {
      id: `contains:${parent.id}:${child.id}`,
      kind: "contains",
      label: `${parent.title} 包含业务边界「${child.title}」`,
      anchor: child.id
    });
  }
  pushMetricEntry(index.edges, {
    id: `contains:${useCase.contextId}:${useCase.id}`,
    kind: "contains",
    label: `${context?.title ?? useCase.contextId} 包含 Use Case「${useCase.title}」`,
    anchor: useCase.id
  });
  for (const actorId of useCase.primaryActorIds) {
    const actor = actorsById.get(actorId);
    pushMetricEntry(index.edges, {
      id: `primary_actor:${actorId}:${useCase.id}`,
      kind: "actor_participates",
      label: `${actor?.title ?? actorId} 作为主要参与者参与「${useCase.title}」`,
      detail: actor?.summary,
      anchor: useCase.id
    });
  }
  for (const actorId of useCase.supportingActorIds) {
    const actor = actorsById.get(actorId);
    pushMetricEntry(index.edges, {
      id: `supporting_actor:${actorId}:${useCase.id}`,
      kind: "actor_participates",
      label: `${actor?.title ?? actorId} 作为协作者参与「${useCase.title}」`,
      detail: actor?.summary,
      anchor: useCase.id
    });
  }
  for (const externalSystemId of useCase.externalSystemIds) {
    const external = externalSystemsById.get(externalSystemId);
    pushMetricEntry(index.edges, {
      id: `external_system:${externalSystemId}:${useCase.id}`,
      kind: "external_system_participates",
      label: `${external?.title ?? externalSystemId} 参与「${useCase.title}」`,
      detail: external?.summary,
      anchor: useCase.id
    });
  }
  for (const relation of model.relations.filter((item) => item.sourceId === useCase.id || item.targetId === useCase.id)) {
    pushMetricEntry(index.edges, {
      id: relation.id,
      kind: relation.kind,
      label: `${designMetricEntityTitle(model, relation.sourceId)} -> ${designMetricEntityTitle(model, relation.targetId)}`,
      detail: relation.summary,
      anchor: relation.sourceId
    });
  }

  for (const [itemIndex, evidence] of useCase.evidence.entries()) {
    const lineRange = evidence.startLine && evidence.endLine
      ? `${evidence.startLine}-${evidence.endLine}`
      : evidence.startLine
        ? String(evidence.startLine)
        : "n/a";
    pushMetricEntry(index.evidence, {
      id: evidence.sourceCodeFactId ?? `${evidence.source}:${evidence.filePath}:${lineRange}:${itemIndex + 1}`,
      kind: `${evidence.knowledgeKind}:${evidence.strength}`,
      label: `${designEvidenceSourceLabel(evidence.source)} · ${evidence.filePath} · ${lineRange}`,
      detail: evidence.summary,
      anchor: useCase.id,
      excerpt: evidence.excerpt
    });
  }
  if (!index.evidence.length) {
    for (const specPath of useCase.sourceSpecPaths) {
      pushMetricEntry(index.evidence, {
        id: specPath,
        kind: "source_spec",
        label: specPath,
        detail: "该规范路径被记录为用例候选证据。",
        anchor: useCase.id
      });
    }
    for (const sourceCodeFactId of useCase.sourceCodeFactIds) {
      pushMetricEntry(index.evidence, {
        id: sourceCodeFactId,
        kind: "source_code_fact",
        label: `本地仓库证据 ${index.evidence.length + 1}`,
        detail: "该本地仓库证据被记录为用例候选依据，具体文件和行号应优先查看证据图层。",
        anchor: useCase.id
      });
    }
  }

  const topLevelQuestions = model.questions
    .filter((question) => !question.targetId || question.targetId === useCase.id)
    .map((question) => question.question);
  for (const [itemIndex, question] of unique([...useCase.questions, ...topLevelQuestions]).entries()) {
    pushMetricEntry(index.questions, {
      id: `question:${useCase.id}:${itemIndex + 1}`,
      kind: "design_question",
      label: question,
      anchor: useCase.id
    });
  }

  return index;
}

function pushMetricEntry(entries: DesignMetricIndexEntry[], entry: DesignMetricIndexEntry): void {
  const id = entry.id.trim();
  const label = entry.label.trim();
  if (!id || !label) return;
  const key = `${entry.kind}:${id}:${label}`;
  if (entries.some((current) => `${current.kind}:${current.id}:${current.label}` === key)) return;
  entries.push({
    ...entry,
    id,
    label,
    detail: entry.detail?.trim() || undefined,
    anchor: entry.anchor?.trim() || undefined,
    excerpt: entry.excerpt?.trim() || undefined
  });
}

function designMetricEntityTitle(model: InteractionModelCandidate, id: string): string {
  return model.useCases.find((item) => item.id === id)?.title
    ?? model.actors.find((item) => item.id === id)?.title
    ?? model.externalSystems.find((item) => item.id === id)?.title
    ?? model.contexts.find((item) => item.id === id)?.title
    ?? id;
}

function renderDesignMetricIndexMarkdown(index: DesignMetricIndex): string[] {
  return [
    "## 设计指标索引",
    "",
    "此章节是 Design Explorer 可解析的指标索引。每个数字都必须能回溯到这里的具体条目，避免 UI 只展示不可解释的计数。",
    "",
    "| 指标 | 数量 | 内容边界 |",
    "| --- | ---: | --- |",
    `| 节点 | ${index.nodes.length} | 参与者、外部系统、上下文和当前用例。 |`,
    `| 关系 | ${index.edges.length} | 当前用例与上下文、参与者、外部系统或其他用例之间的关系。 |`,
    `| 证据 | ${index.evidence.length} | 支撑当前候选用例的文件、源码事实、规范或推断证据。 |`,
    `| 问题 | ${index.questions.length} | 仍需用户确认或后续治理的问题。 |`,
    "",
    "### 节点",
    "",
    ...metricMarkdownList(index.nodes),
    "",
    "### 关系",
    "",
    ...metricMarkdownList(index.edges),
    "",
    "### 证据",
    "",
    ...metricMarkdownList(index.evidence),
    "",
    "### 问题",
    "",
    ...metricMarkdownList(index.questions),
    ""
  ];
}

function renderDesignMetricIndexHtml(index: DesignMetricIndex): string {
  return [
    '    <section class="metric-index-layer" data-praxis-kind="annotation" data-praxis-layer="metric_index" data-praxis-metric-index="use-case">',
    "      <h3>设计指标索引</h3>",
    "      <p>这些指标是 Design Explorer 可探测数字的文档来源。每个计数都必须能回溯到这里的具体条目。</p>",
    '      <div class="metric-index-grid">',
    renderDesignMetricGroupHtml("nodes", "节点", "参与者、外部系统、上下文和当前用例。", index.nodes),
    renderDesignMetricGroupHtml("edges", "关系", "当前用例与上下文、参与者、外部系统或其他用例之间的关系。", index.edges),
    renderDesignMetricGroupHtml("evidence", "证据", "支撑当前候选用例的文件、源码事实、规范或推断证据。", index.evidence),
    renderDesignMetricGroupHtml("questions", "问题", "仍需用户确认或后续治理的问题。", index.questions),
    "      </div>",
    "    </section>"
  ].join("\n");
}

function renderDesignMetricGroupHtml(
  kind: keyof DesignMetricIndex,
  title: string,
  boundary: string,
  entries: DesignMetricIndexEntry[]
): string {
  const items = entries.length
    ? entries.map((entry) => renderDesignMetricItemHtml(kind, entry)).join("")
    : '<li class="empty">无</li>';
  return [
    `        <section class="metric-group" data-praxis-metric-kind="${escapeHtmlAttr(kind)}" data-praxis-metric-count="${entries.length}">`,
    "          <header>",
    `            <span>${escapeHtmlText(title)}</span>`,
    `            <strong>${entries.length}</strong>`,
    "          </header>",
    `          <p>${escapeHtmlText(boundary)}</p>`,
    `          <ol>${items}</ol>`,
    "        </section>"
  ].join("\n");
}

function renderDesignMetricItemHtml(kind: keyof DesignMetricIndex, entry: DesignMetricIndexEntry): string {
  return [
    `            <li data-praxis-metric-kind="${escapeHtmlAttr(kind)}" data-praxis-metric-id="${escapeHtmlAttr(entry.id)}" data-praxis-kind="${escapeHtmlAttr(entry.kind)}" data-praxis-anchor="${escapeHtmlAttr(entry.anchor ?? "")}">`,
    `              <strong>${escapeHtmlText(entry.label)}</strong>`,
    `              <span>${escapeHtmlText(entry.kind)} · ${escapeHtmlText(entry.id)}</span>`,
    entry.detail ? `              <p>${escapeHtmlText(entry.detail)}</p>` : "",
    entry.excerpt ? `              <pre data-praxis-evidence-excerpt="true"><code>${escapeHtmlText(entry.excerpt)}</code></pre>` : "",
    "            </li>"
  ].filter(Boolean).join("\n");
}

function metricMarkdownList(entries: DesignMetricIndexEntry[]): string[] {
  if (!entries.length) return ["- 无"];
  return entries.flatMap((entry) => {
    const suffix = entry.detail ? ` - ${escapeMarkdownInline(entry.detail)}` : "";
    const lines = [`- \`${escapeMarkdownInline(entry.id)}\`（${escapeMarkdownInline(entry.kind)}）：${escapeMarkdownInline(entry.label)}${suffix}`];
    if (entry.excerpt) {
      lines.push("");
      lines.push("  ```text");
      lines.push(...entry.excerpt.split(/\r?\n/).map((line) => `  ${line}`));
      lines.push("  ```");
    }
    return lines;
  });
}

function escapeMarkdownInline(value: string): string {
  return value.replace(/`/g, "'").replace(/\r?\n/g, " ").trim();
}

function renderSingleUseCaseDiagramMarkdownDocument(input: {
  model: InteractionModelCandidate;
  useCase: InteractionModelCandidate["useCases"][number];
  context: InteractionModelCandidate["contexts"][number] | undefined;
  actorsById: Map<string, InteractionModelCandidate["actors"][number]>;
  externalSystemsById: Map<string, InteractionModelCandidate["externalSystems"][number]>;
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"];
  version: string;
  generatedAt: string;
  gitVersion: DesignGitVersionInfo;
  versionDecision?: DesignVersionDecision;
  markdownRelativePath: string;
  htmlRelativePath: string;
}): string {
  const { model, useCase, context, actorsById, externalSystemsById, drilldowns, version, generatedAt, gitVersion, versionDecision, markdownRelativePath, htmlRelativePath } = input;
  const changeType = versionDecision ? versionDecision.bump.toUpperCase() : "DISCOVERY";
  const metricIndex = buildUseCaseDesignMetricIndex({ model, useCase, context, actorsById, externalSystemsById });
  const contextPathLabel = buildContextPathLabels(model).get(useCase.contextId) ?? context?.title ?? useCase.contextId;
  return [
    `# 用例图：${useCase.title}`,
    "",
    DESIGN_USE_CASE_MANAGED_START,
    "",
    "## 元数据",
    "",
    `项目版本：${version}`,
    `设计文档版本：${version}`,
    `Git 分支：${gitVersion.branch}`,
    `Git 提交：${gitVersion.commit}`,
    `Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`,
    `Agent 版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`,
    `更新于：${generatedAt}`,
    `来源：${designModelSourceLabel(model.source)}`,
    `所属地图：../use-case-diagrams-maps.md`,
    `语义 HTML：${path.basename(htmlRelativePath)}`,
    "",
    "## 身份信息",
    "",
    `- ID：${useCase.id}`,
    `- 业务边界路径：${contextPathLabel}`,
    `- 当前边界类型：${context ? contextKindLabel(context.kind) : "未知边界"}`,
    `- 当前边界职责：${context?.responsibility ?? "未知"}`,
    `- 状态：${useCase.status}`,
    `- 置信度：${useCase.confidence}`,
    `- Markdown 路径：${markdownRelativePath}`,
    `- HTML 路径：${htmlRelativePath}`,
    useCase.trigger ? `- 触发条件：${useCase.trigger}` : "",
    "",
    "## 故事摘要",
    "",
    useCase.summary,
    "",
    "## 参与者",
    "",
    ...listOrNone([...useCase.primaryActorIds, ...useCase.supportingActorIds].map((id) => actorLine(id, actorsById.get(id)))),
    "",
    "## 外部系统",
    "",
    ...listOrNone(useCase.externalSystemIds.map((id) => externalSystemLine(id, externalSystemsById.get(id)))),
    "",
    "## UML 下钻地图",
    "",
    ...renderUseCaseUmlTreeMarkdown(useCase, htmlRelativePath, drilldowns),
    "",
    "## Mermaid 用例图",
    "",
    "```mermaid",
    renderSingleUseCaseDiagramMermaid(model, useCase.id).trimEnd(),
    "```",
    "",
    ...renderDesignMetricIndexMarkdown(metricIndex),
    "## 主成功路径",
    "",
    ...numberedOrNone(useCase.mainSuccessScenario),
    "",
    "## 备选路径",
    "",
    ...numberedOrNone(useCase.alternativeFlows),
    "",
    "## 失败路径",
    "",
    ...numberedOrNone(useCase.failureFlows),
    "",
    "## 证据",
    "",
    "| 来源 | 路径 | 行号 | 强度 | 摘要 |",
    "| --- | --- | --- | --- | --- |",
    ...evidenceRows(useCase.evidence),
    "",
    "## 待确认问题",
    "",
    ...listOrNone(useCase.questions),
    "",
    "## 变更记录",
    "",
    `### ${version} - ${generatedAt}`,
    "",
    `变更类型：${changeType}`,
    `版本决策：${formatVersionDecisionForMarkdown(versionDecision)}`,
    versionDecision ? `原子提交范围：${versionDecision.atomicCommitScope}` : "",
    versionDecision ? `提交摘要：${versionDecision.commitSummary}` : "",
    `Git 分支：${gitVersion.branch}`,
    `Git 提交：${gitVersion.commit}`,
    `Git 工作区状态：${gitVersion.dirty ? "dirty" : "clean"}`,
    "",
    "摘要：",
    `- 恢复或更新候选用例图「${useCase.title}」。`,
    "",
    DESIGN_USE_CASE_MANAGED_END,
    ""
  ].join("\n");
}

function renderSingleUseCaseDiagramHtmlDocument(input: {
  model: InteractionModelCandidate;
  useCase: InteractionModelCandidate["useCases"][number];
  context: InteractionModelCandidate["contexts"][number] | undefined;
  actorsById: Map<string, InteractionModelCandidate["actors"][number]>;
  externalSystemsById: Map<string, InteractionModelCandidate["externalSystems"][number]>;
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"];
  version: string;
  generatedAt: string;
  gitVersion: DesignGitVersionInfo;
  versionDecision?: DesignVersionDecision;
  markdownRelativePath: string;
  htmlRelativePath: string;
}): string {
  const { model, useCase, context, actorsById, externalSystemsById, drilldowns, version, generatedAt, gitVersion, versionDecision, markdownRelativePath } = input;
  const changeType = versionDecision ? versionDecision.bump : "discovery";
  const mermaidSource = renderSingleUseCaseDiagramMermaid(model, useCase.id).trimEnd();
  const metricIndex = buildUseCaseDesignMetricIndex({ model, useCase, context, actorsById, externalSystemsById });
  const contextPathLabel = buildContextPathLabels(model).get(useCase.contextId) ?? context?.title ?? useCase.contextId;
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>用例图：${escapeHtmlText(useCase.title)}</title>`,
    "  <style>",
    semanticDesignHtmlCss(),
    "  </style>",
    "</head>",
    "<body>",
    `<article class="praxis-design-map" data-praxis-doc="use-case-diagram" data-praxis-schema="praxis.semanticDesignHtml.v1" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}" data-praxis-source-md="${escapeHtmlAttr(markdownRelativePath)}">`,
    `  <header class="map-header" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="base">`,
    "    <p>Praxis Design Explorer</p>",
    `    <h1>用例图：${escapeHtmlText(useCase.title)}</h1>`,
    `    <span>项目版本 ${escapeHtmlText(version)} · Git ${escapeHtmlText(gitVersion.shortCommit)}${gitVersion.dirty ? " dirty" : ""} · 更新于 ${escapeHtmlText(generatedAt)} · 来源 ${escapeHtmlText(designModelSourceLabel(model.source))}</span>`,
    "  </header>",
    "",
    `  <section id="${escapeHtmlAttr(useCaseDiagramAnchor(useCase.id))}" class="diagram-section" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}" data-praxis-confidence="${escapeHtmlAttr(useCase.confidence)}">`,
    "    <div class=\"section-heading\">",
    "      <div>",
    `        <p>${escapeHtmlText(contextPathLabel)}</p>`,
    `        <h2>${escapeHtmlText(useCase.title)}</h2>`,
    "      </div>",
    `      <span>${escapeHtmlText(useCase.status)} · ${escapeHtmlText(useCase.confidence)}</span>`,
    "    </div>",
    "    <p>",
    escapeHtmlText(useCase.summary),
    "    </p>",
    renderUseCaseUmlTreeHtml(useCase, drilldowns),
    renderDesignMetricIndexHtml(metricIndex),
    '    <div class="design-map-grid">',
    `      <div class="base-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="base">`,
    "        <h3>UML 底图</h3>",
    `        <pre class="mermaid" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="base"><code>${escapeHtmlText(mermaidSource)}</code></pre>`,
    "      </div>",
    renderDefaultExplanationLayer(useCase),
    renderEvidenceLayer(useCase),
    renderCodeMappingLayer(useCase),
    renderQuestionLayer(useCase),
    "    </div>",
    `    <section class="flow-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="timeline">`,
    "      <h3>场景路径</h3>",
    renderHtmlFlowList("主成功路径", useCase.mainSuccessScenario),
    renderHtmlFlowList("备选路径", useCase.alternativeFlows),
    renderHtmlFlowList("失败路径", useCase.failureFlows),
    "    </section>",
    `    <section class="timeline-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="timeline">`,
    "      <h3>变更记录</h3>",
    `      <article data-praxis-change="${escapeHtmlAttr(changeType)}" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-commit-scope="${escapeHtmlAttr(versionDecision?.atomicCommitScope ?? "")}" data-praxis-commit-summary="${escapeHtmlAttr(versionDecision?.commitSummary ?? "")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}">`,
    `        <time datetime="${escapeHtmlAttr(generatedAt)}">${escapeHtmlText(generatedAt)}</time>`,
    `        <span>Git ${escapeHtmlText(gitVersion.shortCommit)} · ${escapeHtmlText(gitVersion.branch)}${gitVersion.dirty ? " · dirty" : ""}</span>`,
    `        <p>${escapeHtmlText(versionDecision ? `${versionDecision.bump.toUpperCase()}: ${versionDecision.reason}` : `恢复或更新候选用例图「${useCase.title}」。`)}</p>`,
    "      </article>",
    "    </section>",
    "  </section>",
    "</article>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

async function renderUseCaseDiagramsMapHtmlDocument(
  root: string,
  model: InteractionModelCandidate,
  preservedBlocks = new Map<string, string>(),
  versionDecision?: DesignVersionDecision
): Promise<string> {
  const projectVersion = await readProjectSemanticVersion(root);
  const gitVersion = await readProjectGitVersion(root);
  const version = versionDecision?.nextVersion ?? projectVersion ?? "0.1.0";
  const changeType = versionDecision ? versionDecision.bump : "none";
  const generatedAt = model.generatedAt || new Date().toISOString();
  const contextsById = new Map(model.contexts.map((context) => [context.id, context]));
  const contextPathLabels = buildContextPathLabels(model);
  const drilldownsByUseCase = groupUseCaseDrilldowns(model);
  const html = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>用例图地图</title>",
    "  <style>",
    semanticDesignHtmlCss(),
    "  </style>",
    "</head>",
    "<body>",
    `<article class="praxis-design-map" data-praxis-doc="use-case-diagrams-map" data-praxis-schema="praxis.semanticDesignHtml.v1" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}" data-praxis-source-md="${escapeHtmlAttr(DESIGN_MAP_DOC_RELATIVE_PATH)}">`,
    '  <header class="map-header" data-praxis-kind="design_context" data-praxis-anchor="design-map:use-case-diagrams" data-praxis-layer="base">',
    "    <p>Praxis Design Explorer</p>",
    "    <h1>用例图地图</h1>",
    `    <span>项目版本 ${escapeHtmlText(version)} · Git ${escapeHtmlText(gitVersion.shortCommit)}${gitVersion.dirty ? " dirty" : ""} · 更新于 ${escapeHtmlText(generatedAt)} · 来源 ${escapeHtmlText(designModelSourceLabel(model.source))}</span>`,
    "  </header>",
    "",
    '  <section class="map-policy" data-praxis-kind="annotation" data-praxis-anchor="design-map:version-policy" data-praxis-layer="timeline">',
    "    <h2>版本策略</h2>",
    "    <ul>",
    "      <li>agent 在识别真实需求或设计变更后决定版本 bump。</li>",
    "      <li>每一次版本变化都应对应一个边界清晰的原子化 git commit。</li>",
    "      <li><strong>MAJOR</strong>：参与者边界、系统边界、核心故事职责、公开 API 或数据契约发生不兼容变化。</li>",
    "      <li><strong>MINOR</strong>：向后兼容地新增用例、参与者、外部系统、流程或设计能力。</li>",
    "      <li><strong>PATCH</strong>：向后兼容的问题修复、澄清、证据补充、图布局或非行为性文档修正。</li>",
    "    </ul>",
    "  </section>",
    "",
    '  <section class="context-index" data-praxis-kind="design_context" data-praxis-anchor="design-map:context-index" data-praxis-layer="base">',
    "    <h2>业务模块边界</h2>",
    renderContextHierarchyHtml(model),
    "  </section>",
    "",
    '  <nav class="diagram-index" data-praxis-kind="annotation" data-praxis-anchor="design-map:use-case-index" data-praxis-layer="base">',
    "    <h2>用例图索引</h2>",
    model.useCases.length
      ? `    <ol>${model.useCases.map((useCase) => renderHtmlIndexItem(useCase, contextsById, contextPathLabels, version, generatedAt, drilldownsByUseCase.get(useCase.id)?.length ?? 0)).join("")}</ol>`
      : '    <p class="empty">尚未恢复候选用例图。</p>',
    "  </nav>",
    "",
    '  <main class="diagram-sections">'
  ];

  for (const useCase of model.useCases) {
    const context = contextsById.get(useCase.contextId);
    const contextPath = contextPathLabels.get(useCase.contextId) ?? context?.title ?? useCase.contextId;
    const anchor = useCaseDiagramAnchor(useCase.id);
    const mermaidSource = renderSingleUseCaseDiagramMermaid(model, useCase.id).trimEnd();
    html.push(
      `    <section id="${escapeHtmlAttr(anchor)}" class="diagram-section" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}" data-praxis-confidence="${escapeHtmlAttr(useCase.confidence)}">`,
      "      <div class=\"section-heading\">",
      "        <div>",
      `          <p>${escapeHtmlText(contextPath)}</p>`,
      `          <h2>${escapeHtmlText(useCase.title)}</h2>`,
      "        </div>",
      `        <span>${escapeHtmlText(useCase.status)} · ${escapeHtmlText(useCase.confidence)}</span>`,
      "      </div>",
      "",
      renderUseCaseUmlTreeHtml(useCase, drilldownsByUseCase.get(useCase.id) ?? []),
      "",
      '      <div class="design-map-grid">',
      `        <div class="base-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="base">`,
      "          <h3>UML 底图</h3>",
      `          <pre class="mermaid" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="base"><code>${escapeHtmlText(mermaidSource)}</code></pre>`,
      "        </div>",
      "",
      `        ${semanticHtmlManagedBlock(useCase.id, "explanation", preservedBlocks, renderDefaultExplanationLayer(useCase))}`,
      `        ${semanticHtmlManagedBlock(useCase.id, "evidence", preservedBlocks, renderEvidenceLayer(useCase))}`,
      `        ${semanticHtmlManagedBlock(useCase.id, "code_mapping", preservedBlocks, renderCodeMappingLayer(useCase))}`,
      `        ${semanticHtmlManagedBlock(useCase.id, "question", preservedBlocks, renderQuestionLayer(useCase))}`,
      "      </div>",
      "",
      `      <section class="flow-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="timeline">`,
      "        <h3>场景路径</h3>",
      renderHtmlFlowList("主成功路径", useCase.mainSuccessScenario),
      renderHtmlFlowList("备选路径", useCase.alternativeFlows),
      renderHtmlFlowList("失败路径", useCase.failureFlows),
      "      </section>",
      "",
      `      <section class="timeline-layer" data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-layer="timeline">`,
      "        <h3>变更记录</h3>",
      `        <article data-praxis-change="${escapeHtmlAttr(changeType)}" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-commit-scope="${escapeHtmlAttr(versionDecision?.atomicCommitScope ?? "")}" data-praxis-commit-summary="${escapeHtmlAttr(versionDecision?.commitSummary ?? "")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}">`,
      `          <time datetime="${escapeHtmlAttr(generatedAt)}">${escapeHtmlText(generatedAt)}</time>`,
      `          <span>Git ${escapeHtmlText(gitVersion.shortCommit)} · ${escapeHtmlText(gitVersion.branch)}${gitVersion.dirty ? " · dirty" : ""}</span>`,
      `          <p>${escapeHtmlText(versionDecision ? `${versionDecision.bump.toUpperCase()}: ${versionDecision.reason}` : `恢复或更新候选用例图「${useCase.title}」。`)}</p>`,
      "        </article>",
      "      </section>",
      "    </section>"
    );
  }

  html.push(
    "  </main>",
    "",
    '  <section class="map-changelog" data-praxis-role="changelog" data-praxis-kind="annotation" data-praxis-anchor="design-map:changelog" data-praxis-layer="timeline">',
    "    <h2>地图变更记录</h2>",
    `    <article data-praxis-change="${escapeHtmlAttr(changeType)}" data-praxis-anchor="design-map:use-case-diagrams" data-praxis-version="${escapeHtmlAttr(version)}" data-praxis-version-bump="${escapeHtmlAttr(changeType)}" data-praxis-version-reason="${escapeHtmlAttr(versionDecision?.reason ?? "本次渲染没有单独的 agent 版本决策。")}" data-praxis-commit-scope="${escapeHtmlAttr(versionDecision?.atomicCommitScope ?? "")}" data-praxis-commit-summary="${escapeHtmlAttr(versionDecision?.commitSummary ?? "")}" data-praxis-git-branch="${escapeHtmlAttr(gitVersion.branch)}" data-praxis-git-commit="${escapeHtmlAttr(gitVersion.commit)}" data-praxis-git-dirty="${gitVersion.dirty ? "true" : "false"}">`,
    `      <time datetime="${escapeHtmlAttr(generatedAt)}">${escapeHtmlText(generatedAt)}</time>`,
    `      <span>Git ${escapeHtmlText(gitVersion.shortCommit)} · ${escapeHtmlText(gitVersion.branch)}${gitVersion.dirty ? " · dirty" : ""}</span>`,
    `      <p>${escapeHtmlText(versionDecision ? `${versionDecision.bump.toUpperCase()}: ${versionDecision.reason}` : `更新用例图地图，并链接 ${model.useCases.length} 个候选用例图独立文档。`)}</p>`,
    "    </article>",
    "  </section>",
    "",
    '  <script type="application/json" data-praxis-snapshot="interaction-model">',
    escapeScriptJson(JSON.stringify(model, null, 2)),
    "  </script>",
    "</article>",
    "</body>",
    "</html>",
    ""
  );
  return html.join("\n");
}

function renderHtmlIndexItem(
  useCase: InteractionModelCandidate["useCases"][number],
  contextsById: Map<string, InteractionModelCandidate["contexts"][number]>,
  contextPathLabels: Map<string, string>,
  version: string,
  generatedAt: string,
  drilldownCount: number
): string {
  const contextTitle = contextPathLabels.get(useCase.contextId) ?? contextsById.get(useCase.contextId)?.title ?? useCase.contextId;
  return [
    `<li data-praxis-kind="use_case" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}" data-praxis-confidence="${escapeHtmlAttr(useCase.confidence)}">`,
    `<a href="#${escapeHtmlAttr(useCaseDiagramAnchor(useCase.id))}">${escapeHtmlText(useCase.title)}</a>`,
    `<a href="${escapeHtmlAttr(useCaseDiagramHtmlRelativePath(useCase.id).replace(/^docs\/design\//, ""))}">独立页面</a>`,
    `<span>${escapeHtmlText(contextTitle)} · 下钻 UML ${drilldownCount} · ${escapeHtmlText(useCase.status)} · ${escapeHtmlText(useCase.confidence)} · ${escapeHtmlText(version)} · ${escapeHtmlText(generatedAt)}</span>`,
    "</li>"
  ].join("");
}

function semanticHtmlManagedBlock(anchor: string, layer: string, preservedBlocks: Map<string, string>, fallback: string): string {
  return preservedBlocks.get(semanticHtmlManagedBlockKey(anchor, layer)) ?? [
    `<!-- praxis:managed:start anchor="${escapeHtmlAttr(anchor)}" layer="${escapeHtmlAttr(layer)}" -->`,
    fallback,
    "<!-- praxis:managed:end -->"
  ].join("\n");
}

function extractSemanticHtmlManagedBlocks(raw: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = /<!-- praxis:managed:start anchor="([^"]+)" layer="([^"]+)" -->([\s\S]*?)<!-- praxis:managed:end -->/g;
  for (const match of raw.matchAll(pattern)) {
    blocks.set(semanticHtmlManagedBlockKey(match[1], match[2]), match[0]);
  }
  return blocks;
}

function semanticHtmlManagedBlockKey(anchor: string, layer: string): string {
  return `${anchor}::${layer}`;
}

function renderDefaultExplanationLayer(useCase: InteractionModelCandidate["useCases"][number]): string {
  return [
    `<aside class="overlay-layer explanation-layer" data-praxis-kind="annotation" data-praxis-layer="explanation" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="candidate" data-praxis-author="agent">`,
    "  <h3>解释图层</h3>",
    `  <p>${escapeHtmlText(useCase.summary || "这个候选用例仍需要补充解释。")}</p>`,
    "  <p class=\"layer-note\">此图层是 agent 生成的候选设计解释，状态以证据和置信度为准。</p>",
    "</aside>"
  ].join("\n");
}

function renderEvidenceLayer(useCase: InteractionModelCandidate["useCases"][number]): string {
  const rows = useCase.evidence.length
    ? useCase.evidence.map((item) => {
        const lines = item.startLine && item.endLine ? `${item.startLine}-${item.endLine}` : item.startLine ? String(item.startLine) : "n/a";
        return `<li><strong>${escapeHtmlText(item.strength)}</strong> ${escapeHtmlText(designEvidenceSourceLabel(item.source))} · ${escapeHtmlText(item.filePath || "no path")} · ${escapeHtmlText(lines)}<span>${escapeHtmlText(item.summary)}</span></li>`;
      }).join("")
    : "<li>暂无直接证据。</li>";
  return [
    `<aside class="overlay-layer evidence-layer" data-praxis-kind="evidence" data-praxis-layer="evidence" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}">`,
    "  <h3>证据图层</h3>",
    `  <ul>${rows}</ul>`,
    "</aside>"
  ].join("\n");
}

function renderCodeMappingLayer(useCase: InteractionModelCandidate["useCases"][number]): string {
  const ids = useCase.sourceCodeFactIds.length
    ? `<li>已关联 ${useCase.sourceCodeFactIds.length} 条本地仓库证据；具体文件、行号和摘要见证据图层。</li>`
    : "<li>暂未关联可展示的本地仓库证据。</li>";
  return [
    `<aside class="overlay-layer code-layer" data-praxis-kind="annotation" data-praxis-layer="code_mapping" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}">`,
    "  <h3>本地仓库证据线索</h3>",
    "  <p class=\"layer-note\">这里记录可追溯的实现证据数量，不表示当前 Use Case 覆盖了全部实现代码。完整调用链、类协作和设计模式承载应进入 Sequence Diagram、Class Collaboration 或实现证据视图。</p>",
    `  <ul>${ids}</ul>`,
    "</aside>"
  ].join("\n");
}

function renderQuestionLayer(useCase: InteractionModelCandidate["useCases"][number]): string {
  const questions = useCase.questions.length
    ? useCase.questions.map((question) => `<li>${escapeHtmlText(question)}</li>`).join("")
    : "<li>这个用例暂未记录待确认问题。</li>";
  return [
    `<aside class="overlay-layer question-layer" data-praxis-kind="question" data-praxis-layer="question" data-praxis-anchor="${escapeHtmlAttr(useCase.id)}" data-praxis-status="${escapeHtmlAttr(useCase.status)}">`,
    "  <h3>问题图层</h3>",
    `  <ul>${questions}</ul>`,
    "</aside>"
  ].join("\n");
}

function renderHtmlFlowList(title: string, values: string[]): string {
  const items = values.length ? values.map((value) => `<li>${escapeHtmlText(value)}</li>`).join("") : "<li>无</li>";
  return `<section><h4>${escapeHtmlText(title)}</h4><ol>${items}</ol></section>`;
}

function formatVersionDecisionForMarkdown(decision: DesignVersionDecision | undefined): string {
  if (!decision) return "none - 本次渲染没有单独的 agent 版本决策";
  return `${decision.bump.toUpperCase()} ${decision.currentVersion} -> ${decision.nextVersion}; ${decision.reason}`;
}

function semanticDesignHtmlCss(): string {
  return `
    :root { color-scheme: dark; --bg: #0f141b; --panel: #151c25; --panel-2: #101720; --border: #2b3a4a; --text: #e8eef6; --muted: #9caaba; --accent: #73b7ff; --ok: #7bd88f; --warn: #ffd166; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, Segoe UI, system-ui, sans-serif; line-height: 1.5; }
    .praxis-design-map { display: grid; gap: 24px; max-width: 1440px; margin: 0 auto; padding: 28px; }
    .map-header, .map-policy, .context-index, .diagram-index, .diagram-section, .map-changelog { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); padding: 18px; }
    .map-header p, .section-heading p, .layer-note, .diagram-index span { color: var(--muted); margin: 0; }
    h1, h2, h3, h4 { margin: 0 0 10px; line-height: 1.2; }
    .context-tree { display: grid; gap: 10px; padding-left: 22px; }
    .context-tree li { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); }
    .context-tree li li { margin-top: 8px; background: #0d141d; }
    .context-tree span, .context-tree p { color: var(--muted); margin: 4px 0 0; }
    .diagram-index ol { display: grid; gap: 10px; padding-left: 22px; }
    .diagram-index li { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); }
    a { color: var(--accent); }
    .diagram-sections { display: grid; gap: 22px; }
    .section-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
    .section-heading span { border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px; color: var(--muted); white-space: nowrap; }
    .design-map-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr); gap: 14px; align-items: start; }
    .base-layer, .overlay-layer, .flow-layer, .timeline-layer, .metric-index-layer, .uml-tree-layer, .semantic-layer { border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); padding: 14px; }
    .semantic-layer { display: grid; gap: 10px; margin: 14px 0; }
    .semantic-layer p, .semantic-layer dd { margin: 0; color: var(--muted); }
    .semantic-layer .layer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .layer-card { border: 1px solid var(--border); border-radius: 8px; background: #0d141d; padding: 10px; overflow-wrap: anywhere; }
    .layer-card ul { margin: 0; padding-left: 18px; }
    .implementation-scope-card dl { display: grid; gap: 6px; margin: 0; }
    .implementation-scope-card dt { color: var(--text); font-weight: 700; }
    .implementation-scope-card dd { margin: 2px 0 0; }
    .uml-tree-layer { margin: 14px 0; }
    .uml-tree-layer ol { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0; padding: 0; }
    .uml-tree-layer li { border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px; background: #0d141d; }
    .uml-tree-layer a { text-decoration: none; }
    .metric-index-layer { margin: 14px 0; display: grid; gap: 10px; }
    .metric-index-layer p { margin: 0; color: var(--muted); }
    .metric-index-grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 10px; }
    .metric-group { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #0d141d; }
    .metric-group header { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .metric-group header strong { font-size: 18px; }
    .metric-group ol { display: grid; gap: 8px; margin: 8px 0 0; padding-left: 18px; }
    .metric-group li { overflow-wrap: anywhere; }
    .metric-group li span, .metric-group li p { display: block; color: var(--muted); font-size: 0.9em; }
    .metric-group pre { max-height: 260px; overflow: auto; margin: 8px 0 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: #080e15; color: #d8e2ee; font-family: SFMono-Regular, Consolas, Liberation Mono, monospace; font-size: 12px; }
    .overlay-layer { display: grid; gap: 8px; }
    .overlay-layer ul { display: grid; gap: 8px; padding-left: 18px; margin: 0; }
    .overlay-layer li span { display: block; color: var(--muted); font-size: 0.9em; }
    .mermaid { overflow: auto; min-height: 220px; max-height: 520px; margin: 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: #0b1016; color: #d8e2ee; font-family: SFMono-Regular, Consolas, Liberation Mono, monospace; font-size: 12px; }
    .flow-layer { margin-top: 14px; display: grid; gap: 12px; }
    .flow-layer section { border-top: 1px solid var(--border); padding-top: 10px; }
    .timeline-layer { margin-top: 14px; }
    [data-praxis-anchor] { scroll-margin-top: 18px; }
    [data-praxis-status="candidate"] { border-color: #7a642f; }
    [data-praxis-status="confirmed"] { border-color: #2f7a4d; }
    @media (max-width: 900px) { .praxis-design-map { padding: 14px; } .design-map-grid, .metric-index-grid { grid-template-columns: 1fr; } .section-heading { display: grid; } }
  `.trim();
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
  return escapeHtmlText(value).replace(/`/g, "&#96;");
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function readProjectSemanticVersion(root: string): Promise<string | undefined> {
  const designDocumentVersion = await readDesignDocumentSemanticVersion(root);
  if (designDocumentVersion) return designDocumentVersion;
  const packageJsonPath = path.join(root, "package.json");
  try {
    const packageJson = await readJson(packageJsonPath);
    const version = isRecord(packageJson) && typeof packageJson.version === "string" ? packageJson.version : undefined;
    return version && isSemver(version) ? version : undefined;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

async function readDesignDocumentSemanticVersion(root: string): Promise<string | undefined> {
  const docPath = path.join(root, DESIGN_MAP_DOC_RELATIVE_PATH);
  try {
    const raw = await readFile(docPath, "utf8");
    const projectVersion = raw.match(/^(?:Project version|项目版本)[:：]\s*(.+)$/m)?.[1]?.trim();
    const designVersion = raw.match(/^(?:Design document version|设计文档版本)[:：]\s*(.+)$/m)?.[1]?.trim();
    const version = semverCore(projectVersion) ?? semverCore(designVersion);
    return version && isSemver(version) ? version : undefined;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

export async function readProjectGitVersion(root: string): Promise<DesignGitVersionInfo> {
  const unknown = {
    branch: "unknown",
    commit: "unknown",
    shortCommit: "unknown",
    dirty: false
  };
  try {
    const [branch, commit, shortCommit, status] = await Promise.all([
      readGitText(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      readGitText(root, ["rev-parse", "HEAD"]),
      readGitText(root, ["rev-parse", "--short=12", "HEAD"]),
      readGitText(root, ["status", "--porcelain"])
    ]);
    return {
      branch: branch || unknown.branch,
      commit: commit || unknown.commit,
      shortCommit: shortCommit || commit.slice(0, 12) || unknown.shortCommit,
      dirty: status.trim().length > 0
    };
  } catch {
    return unknown;
  }
}

async function readGitText(root: string, args: string[]): Promise<string> {
  const result = await spawnBuffered("git", args, {
    cwd: root,
    env: process.env,
    timeoutMs: 8_000
  });
  if (result.exitCode !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function isSemver(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function useCaseDiagramAnchor(useCaseId: string): string {
  return `use-case-diagram-${safeFilePart(useCaseId).toLowerCase()}`;
}

function useCaseDiagramDocumentSlug(useCaseId: string): string {
  return safeFilePart(useCaseId.replace(/^use-case:/, "")).toLowerCase() || useCaseDiagramAnchor(useCaseId);
}

function useCaseDiagramMarkdownRelativePath(useCaseId: string): string {
  return `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/${useCaseDiagramDocumentSlug(useCaseId)}.md`;
}

function useCaseDiagramHtmlRelativePath(useCaseId: string): string {
  return `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/${useCaseDiagramDocumentSlug(useCaseId)}.html`;
}

function useCaseDrilldownMarkdownRelativePath(diagram: InteractionModelCandidate["useCaseDrilldowns"][number]): string {
  const base = `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/${useCaseDiagramDocumentSlug(diagram.useCaseId)}`;
  if (diagram.kind === "activity") return `${base}/activity.md`;
  if (diagram.kind === "sequence") return `${base}/sequences/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "state_machine") return `${base}/state-machines/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "class_collaboration") return `${base}/realization/class-collaboration.md`;
  if (diagram.kind === "interaction_overview") return `${base}/interaction-overviews/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "communication") return `${base}/communications/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "timing") return `${base}/timing/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "object_snapshot") return `${base}/object-snapshots/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
  return `${base}/composite-structures/${useCaseDiagramDocumentSlug(diagram.id)}.md`;
}

function useCaseDrilldownHtmlRelativePath(diagram: InteractionModelCandidate["useCaseDrilldowns"][number]): string {
  return useCaseDrilldownMarkdownRelativePath(diagram).replace(/\.md$/, ".html");
}

function renderSingleUseCaseDiagramMermaid(model: InteractionModelCandidate, useCaseId: string): string {
  const useCase = model.useCases.find((item) => item.id === useCaseId);
  if (!useCase) return renderUseCaseDiagramMermaid(model);
  return renderUseCaseDiagramMermaid({
    ...model,
    useCases: [useCase],
    relations: model.relations.filter((relation) => relation.sourceId === useCaseId && relation.targetId === useCaseId)
  }, useCase.contextId);
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function listOrNone(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- 无"];
}

function numberedOrNone(values: string[]): string[] {
  return values.length ? values.map((value, index) => `${index + 1}. ${value}`) : ["1. 无"];
}

function actorLine(id: string, actor: InteractionModelCandidate["actors"][number] | undefined): string {
  return actor ? `${id} - ${actor.title}` : id;
}

function externalSystemLine(id: string, external: InteractionModelCandidate["externalSystems"][number] | undefined): string {
  return external ? `${id} - ${external.title}` : id;
}

function evidenceRows(evidence: InteractionModelCandidate["useCases"][number]["evidence"]): string[] {
  if (!evidence.length) return ["| _无_ | _不适用_ | _不适用_ | _不适用_ | _暂无直接证据。_ |"];
  return evidence.map((item) => {
    const lines = item.startLine && item.endLine ? `${item.startLine}-${item.endLine}` : item.startLine ? String(item.startLine) : "";
    return `| ${designEvidenceSourceLabel(item.source)} | ${escapeMarkdownTable(item.filePath)} | ${lines || "_n/a_"} | ${item.strength} | ${escapeMarkdownTable(item.summary)} |`;
  });
}

function designModelSourceLabel(source: string): string {
  if (source === "agent") return "Agent 候选分析";
  if (source === "imported") return "导入文档";
  if (source === "user") return "用户描述";
  return "本地仓库证据";
}

function designEvidenceSourceLabel(source: string): string {
  if (source === "repository_scan") return "本地仓库扫描";
  if (source === "codegraph") return "本地仓库证据";
  if (source === "tree_sitter") return "语法结构证据";
  if (source === "lsp") return "语言服务证据";
  if (source === "agent_inference") return "Agent 推断";
  if (source === "user_confirmation") return "用户确认";
  return "本地仓库证据";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "candidate-item";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function semverCore(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function spawnBuffered(
  command: string,
  commandArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`process timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`));
    }, options.timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
