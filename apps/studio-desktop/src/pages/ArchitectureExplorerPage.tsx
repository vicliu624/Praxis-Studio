import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useI18n } from "../i18n";
import { AgentConversationPanel, type AgentConversationEvent } from "../chat/AgentConversationPanel";
import { ScopedAgentPanel, type ScopedAgentSubmitResult } from "../chat/ScopedAgentPanel";
import { renderSemanticMermaidBlocks, useUmlFullscreenViewer } from "../components/SemanticMermaidRenderer";
import { normalizeInternalTermsInHtmlDocument } from "../components/userFacingText";
import {
  discussArchitectureDiagram,
  readArchitectureDocumentHtml,
  readArchitectureDocumentMarkdown,
  readArchitectureMapMarkdown,
  readArchitectureSemanticHtml,
  runArchitectureDiscovery,
  type RuntimeDiagramDocumentEditResult,
  type RuntimeArchitectureDiagramDiscussionResult,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";

interface ArchitectureExplorerPageProps {
  projectRoot: string;
  onOpenDesignExplorer: () => void;
  onOpenEngineeringExplorer: () => void;
}

type ArchitectureDocumentState = "idle" | "loading" | "ready" | "missing" | "generating" | "error";
type ArchitectureC4Level = "system_context" | "container" | "component" | "code";

interface ArchitectureC4MapIndex {
  schemaVersion: "praxis.architectureC4MapIndex.v1";
  generatedAt: string;
  projectVersion: string;
  rootDocPath: string;
  rootHtmlPath: string;
  git?: {
    branch?: string;
    commit?: string;
    shortCommit?: string;
    dirty?: boolean;
  };
  summary: {
    systemContextCount: number;
    containerCount: number;
    componentViewCount: number;
    codeViewCount: number;
  };
  tree?: ArchitectureC4TreeNode[];
  categories: ArchitectureC4Category[];
}

interface ArchitectureC4TreeNode {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: string;
  confidence: string;
  children: ArchitectureC4TreeNode[];
}

interface ArchitectureC4Category {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  directory: string;
  summary: string;
  count: number;
  items: ArchitectureC4Document[];
}

interface ArchitectureC4Document {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: string;
  confidence: string;
  drilldowns?: ArchitectureC4Link[];
}

interface ArchitectureC4Link {
  id: string;
  level: ArchitectureC4Level | string;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  relation?: string;
  reason?: string;
}

interface ArchitectureSelection {
  anchor: string;
  kind?: string;
  status?: string;
  confidence?: string;
  title?: string;
  copy?: string;
  drilldowns: ArchitectureC4Link[];
}

interface ArchitectureDocumentCardReference {
  anchor: string;
  kind: string;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  status?: string;
  confidence?: string;
}

interface ArchitectureC4Element {
  id: string;
  label: string;
  level: string;
  anchor: string;
  summary: string;
  responsibility: string;
  boundary: string;
  relationshipMeaning: string;
  whyThisLevel: string;
  drilldownIntent: string;
  evidence: string[];
  confidence: string;
  drilldowns: ArchitectureC4Link[];
}

interface ArchitectureDocumentPayload {
  id: string;
  level: string;
  title: string;
  anchor: string;
  elements: ArchitectureC4Element[];
}

interface ArchitectureChangelogEntry {
  id: string;
  title: string;
  version: string;
  date: string;
  summary: string;
  git?: string;
}

export function ArchitectureExplorerPage({
  projectRoot,
  onOpenDesignExplorer,
  onOpenEngineeringExplorer
}: ArchitectureExplorerPageProps) {
  const [rootSemanticHtml, setRootSemanticHtml] = useState("");
  const [rootMarkdown, setRootMarkdown] = useState("");
  const [semanticHtml, setSemanticHtml] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [activeDocumentPath, setActiveDocumentPath] = useState("");
  const [activeDocumentTitle, setActiveDocumentTitle] = useState("");
  const [activeDocumentLiveUpdating, setActiveDocumentLiveUpdating] = useState(false);
  const [activeDocumentLiveUpdatedAt, setActiveDocumentLiveUpdatedAt] = useState("");
  const [documentState, setDocumentState] = useState<ArchitectureDocumentState>(projectRoot ? "loading" : "idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<ArchitectureSelection | null>(null);
  const [sideTab, setSideTab] = useState<"c4" | "agent">("c4");
  const mapIndex = useMemo(() => parseArchitectureMapIndex(rootSemanticHtml), [rootSemanticHtml]);
  const summary = mapIndex?.summary;
  const changelog = useMemo(() => buildArchitectureChangelog(rootMarkdown || markdown, mapIndex), [rootMarkdown, markdown, mapIndex]);
  const semanticHtmlRef = useRef("");
  const markdownRef = useRef("");

  useEffect(() => {
    if (projectRoot) {
      void loadArchitectureDocuments(projectRoot);
      return;
    }
    setRootSemanticHtml("");
    setRootMarkdown("");
    setSemanticHtml("");
    setMarkdown("");
    setActiveDocumentPath("");
    setActiveDocumentTitle("");
    setActiveDocumentLiveUpdating(false);
    setActiveDocumentLiveUpdatedAt("");
    setDocumentState("idle");
    setStatus("");
    setError("");
    setSelection(null);
  }, [projectRoot]);

  async function loadArchitectureDocuments(root: string) {
    setDocumentState("loading");
    setError("");
    setStatus("正在读取 Architecture 文档");
    setSelection(null);
    try {
      const [html, md] = await Promise.all([
        readArchitectureSemanticHtml(root),
        readArchitectureMapMarkdown(root)
      ]);
      if (!html?.trim() && !md?.trim()) {
        setRootSemanticHtml("");
        setRootMarkdown("");
        setSemanticHtml("");
        setMarkdown("");
        setActiveDocumentPath("");
        setActiveDocumentTitle("");
        setDocumentState("missing");
        setStatus("docs/architecture/c4 尚未生成");
        return;
      }
      const rootHtml = html ?? markdownToFallbackArchitectureHtml(md ?? "");
      setRootSemanticHtml(rootHtml);
      setRootMarkdown(md ?? "");
      setSemanticHtml(rootHtml);
      setMarkdown(md ?? "");
      setActiveDocumentPath("docs/architecture/c4/c4-model-maps.html");
      setActiveDocumentTitle("C4 Model Maps");
      setDocumentState("ready");
      setStatus("已载入生成的 Architecture 视图");
    } catch (caught) {
      setDocumentState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Architecture 文档读取失败");
    }
  }

  useEffect(() => {
    semanticHtmlRef.current = semanticHtml;
  }, [semanticHtml]);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    if (!projectRoot || !activeDocumentPath || documentState !== "ready") return undefined;
    let disposed = false;
    let polling = false;
    const interval = window.setInterval(() => {
      if (polling || disposed) return;
      polling = true;
      const htmlPath = htmlPathForArchitectureDocument(activeDocumentPath);
      const mdPath = markdownPathForArchitectureDocument(activeDocumentPath);
      void Promise.all([
        readArchitectureDocumentHtml(projectRoot, htmlPath),
        readArchitectureDocumentMarkdown(projectRoot, mdPath)
      ])
        .then(([html, md]) => {
          if (disposed) return;
          const nextMarkdown = md ?? "";
          const nextHtml = html?.trim() ? html : markdownToFallbackArchitectureHtml(nextMarkdown);
          const htmlChanged = nextHtml.trim() && nextHtml !== semanticHtmlRef.current;
          const markdownChanged = nextMarkdown !== markdownRef.current;
          if (!htmlChanged && !markdownChanged) return;
          if (htmlChanged) {
            semanticHtmlRef.current = nextHtml;
            setSemanticHtml(nextHtml);
          }
          if (markdownChanged) {
            markdownRef.current = nextMarkdown;
            setMarkdown(nextMarkdown);
          }
          if (isArchitectureRootDocumentPath(activeDocumentPath)) {
            if (htmlChanged) setRootSemanticHtml(nextHtml);
            if (markdownChanged) setRootMarkdown(nextMarkdown);
          }
          setActiveDocumentLiveUpdating(true);
          setActiveDocumentLiveUpdatedAt(new Date().toLocaleTimeString());
          window.setTimeout(() => {
            if (!disposed) setActiveDocumentLiveUpdating(false);
          }, 900);
        })
        .catch(() => undefined)
        .finally(() => {
          polling = false;
        });
    }, 900);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [activeDocumentPath, documentState, projectRoot]);

  async function refreshActiveArchitectureDocument() {
    if (!projectRoot || !activeDocumentPath) return;
    const htmlPath = htmlPathForArchitectureDocument(activeDocumentPath);
    const mdPath = markdownPathForArchitectureDocument(activeDocumentPath);
    try {
      const [html, md] = await Promise.all([
        readArchitectureDocumentHtml(projectRoot, htmlPath),
        readArchitectureDocumentMarkdown(projectRoot, mdPath)
      ]);
      const nextMarkdown = md ?? "";
      const nextHtml = html?.trim() ? html : markdownToFallbackArchitectureHtml(nextMarkdown);
      semanticHtmlRef.current = nextHtml;
      markdownRef.current = nextMarkdown;
      setSemanticHtml(nextHtml);
      setMarkdown(nextMarkdown);
      if (isArchitectureRootDocumentPath(activeDocumentPath)) {
        setRootSemanticHtml(nextHtml);
        setRootMarkdown(nextMarkdown);
      }
      setActiveDocumentLiveUpdating(true);
      setActiveDocumentLiveUpdatedAt(new Date().toLocaleTimeString());
      window.setTimeout(() => setActiveDocumentLiveUpdating(false), 900);
    } catch {
      // Keep the current projection visible; the polling loop will retry.
    }
  }

  async function generateArchitectureDocuments() {
    if (!projectRoot || documentState === "generating") return;
    setDocumentState("generating");
    setError("");
    setStatus("正在生成 C4 架构文档");
    try {
      const result = await runArchitectureDiscovery(projectRoot);
      setStatus(`已生成 ${result.diagramDocumentCount ?? 0} 份 C4 文档`);
      await loadArchitectureDocuments(projectRoot);
    } catch (caught) {
      setDocumentState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Architecture 文档生成失败");
    }
  }

  async function openArchitectureDocument(document: ArchitectureC4Document | ArchitectureC4Category | "root") {
    if (!projectRoot) return;
    const categoryFirstItem = document !== "root" && "items" in document ? document.items[0] : undefined;
    const htmlPath = document === "root"
      ? mapIndex?.rootHtmlPath ?? "docs/architecture/c4/c4-model-maps.html"
      : "htmlPath" in document
        ? document.htmlPath
        : categoryFirstItem?.htmlPath ?? mapIndex?.rootHtmlPath ?? "docs/architecture/c4/c4-model-maps.html";
    const mdPath = document === "root"
      ? mapIndex?.rootDocPath ?? "docs/architecture/c4/c4-model-maps.md"
      : "docPath" in document
        ? document.docPath
        : categoryFirstItem?.docPath ?? mapIndex?.rootDocPath ?? "docs/architecture/c4/c4-model-maps.md";
    const title = document === "root" ? "C4 Model Maps" : "items" in document ? categoryFirstItem?.title ?? document.title : document.title;
    setError("");
    setSelection(null);
    setStatus("正在载入 C4 文档");
    const [html, md] = await Promise.all([
      readArchitectureDocumentHtml(projectRoot, htmlPath),
      readArchitectureDocumentMarkdown(projectRoot, mdPath)
    ]);
    if (!html?.trim() && !md?.trim()) {
      setError(`Missing architecture document: ${htmlPath}`);
      setStatus("Architecture 文档读取失败");
      return;
    }
    setSemanticHtml(html ?? markdownToFallbackArchitectureHtml(md ?? ""));
    setMarkdown(md ?? "");
    setActiveDocumentPath(htmlPath);
    setActiveDocumentTitle(title);
    setStatus("已载入生成的 Architecture 视图");
    setSideTab("c4");
  }

  function handleSelectAnchor(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element
      ? event.target.closest("[data-praxis-anchor]")
      : null;
    if (!target) return;
    const element = target as HTMLElement;
    setSelection({
      anchor: element.getAttribute("data-praxis-anchor") ?? "",
      kind: element.getAttribute("data-praxis-kind") ?? undefined,
      status: element.getAttribute("data-praxis-status") ?? undefined,
      confidence: element.getAttribute("data-praxis-confidence") ?? undefined,
      title: element.querySelector("h1, h2, h3, h4")?.textContent?.trim() ?? undefined,
      copy: directChildText(element, "p"),
      drilldowns: parseArchitectureDrilldowns(element.getAttribute("data-praxis-drilldowns"))
    });
  }

  async function openArchitectureDrilldown(link: ArchitectureC4Link) {
    await openArchitectureDocument({
      id: link.id,
      level: architectureLevelFromLink(link.level),
      title: link.title,
      summary: link.summary,
      docPath: link.docPath,
      htmlPath: link.htmlPath,
      anchor: link.anchor,
      status: "candidate",
      confidence: ""
    });
  }

  async function openArchitectureDocumentCard(card: ArchitectureDocumentCardReference) {
    await openArchitectureDocument({
      id: card.anchor,
      level: architectureLevelFromKind(card.kind),
      title: card.title,
      summary: card.summary,
      docPath: card.docPath,
      htmlPath: card.htmlPath,
      anchor: card.anchor,
      status: card.status ?? "candidate",
      confidence: card.confidence ?? ""
    });
  }

  if (!projectRoot) {
    return (
      <div className="engineering-explorer-page architecture-explorer-page">
        <section className="panel engineering-generate-panel">
          <strong>还没有选中项目</strong>
          <span>Architecture Explorer 需要先生成基于本地仓库证据的 C4 展示产物。</span>
        </section>
      </div>
    );
  }

  const ready = documentState === "ready" && semanticHtml.trim();
  return (
    <div className="engineering-explorer-page architecture-explorer-page">
      <header className="engineering-explorer-header">
        <p className="eyebrow">架构分层解释</p>
        <div>
          <h1>Architecture Explorer</h1>
          <p>这里从 C4 Model 视角解释系统架构层级。Design Explorer 解释业务复杂度；Engineering Explorer 解释技术复杂度。</p>
        </div>
      </header>

      <section className="engineering-explorer-workspace">
        <aside className="panel engineering-timeline-panel">
          <div className="panel-heading">
            <div>
              <h2>架构变更</h2>
              <p className="muted-copy">C4 展示产物的程序版本、Git 版本和生成时间线。</p>
            </div>
          </div>
          {changelog.length ? (
            <ol className="engineering-timeline-list">
              {changelog.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <time>{entry.date}</time>
                  <span>{entry.version}</span>
                  <p>{entry.summary}</p>
                  {entry.git ? <small>{entry.git}</small> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div className="engineering-empty-note">暂无 Architecture changelog。</div>
          )}
          <button className="secondary-action compact-action" type="button" onClick={onOpenDesignExplorer}>
            打开 Design Explorer
          </button>
          <button className="secondary-action compact-action" type="button" onClick={onOpenEngineeringExplorer}>
            打开 Engineering Explorer
          </button>
        </aside>

        <main className="engineering-main-panel">
          <section className="engineering-summary-grid">
            <ArchitectureMetric label="System Context" value={summary?.systemContextCount ?? 0} />
            <ArchitectureMetric label="Container" value={summary?.containerCount ?? 0} />
            <ArchitectureMetric label="Component" value={summary?.componentViewCount ?? 0} />
            <ArchitectureMetric label="Code View" value={summary?.codeViewCount ?? 0} />
          </section>

          {!ready ? (
            <section className="panel engineering-generate-panel">
              <strong>{documentState === "generating" ? "正在生成 C4 架构文档" : "还没有 C4 架构文档"}</strong>
              <span>{documentState === "generating" ? "正在从本地仓库证据恢复 System Context、Container、Component 和 Code View。" : "点击生成按钮后，Praxis 会写入由本地仓库证据生成的 C4 展示产物。"}</span>
              <button
                className="primary-action"
                type="button"
                disabled={documentState === "generating"}
                onClick={generateArchitectureDocuments}
              >
                {documentState === "generating" ? "生成中" : "生成 C4 文档"}
              </button>
              {error ? <span className="error-text">{error}</span> : null}
            </section>
          ) : (
            <section className="panel engineering-html-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activeDocumentTitle || "C4 Model Maps"}</h2>
                  <p className="muted-copy">从本地仓库证据生成的 C4 展示产物渲染。点击卡片或图内元素可以查看架构锚点与下钻路径。</p>
                </div>
                <div className="design-document-pills">
                  <span className="pill">{activeDocumentPath || "docs/architecture/c4/c4-model-maps.html"}</span>
                  {activeDocumentLiveUpdating || activeDocumentLiveUpdatedAt ? (
                    <span className={`pill design-live-pill ${activeDocumentLiveUpdating ? "is-updating" : ""}`}>
                      {activeDocumentLiveUpdating ? "Agent 正在编辑文档" : `已更新 ${activeDocumentLiveUpdatedAt}`}
                    </span>
                  ) : null}
                </div>
              </div>
              <SemanticArchitectureHtml
                html={semanticHtml}
                liveUpdating={activeDocumentLiveUpdating}
                onSelect={handleSelectAnchor}
                onOpenDrilldown={openArchitectureDrilldown}
                onOpenDocumentCard={openArchitectureDocumentCard}
              />
            </section>
          )}
        </main>

        <aside className="panel engineering-side-panel">
          <div className="engineering-side-tabs" role="tablist" aria-label="Architecture side panel">
            <button
              className={sideTab === "c4" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={sideTab === "c4"}
              onClick={() => setSideTab("c4")}
            >
              C4 下钻
            </button>
            <button
              className={sideTab === "agent" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={sideTab === "agent"}
              onClick={() => setSideTab("agent")}
            >
              Agent
            </button>
          </div>
          <div className="engineering-side-tab-body">
            {sideTab === "c4" ? (
              <>
                {mapIndex ? (
                  <ArchitectureDocumentTree
                    index={mapIndex}
                    activePath={activeDocumentPath}
                    onOpen={openArchitectureDocument}
                  />
                ) : null}
                {selection ? (
                  <ArchitectureSelectionDetail selection={selection} onOpenDrilldown={openArchitectureDrilldown} />
                ) : (
                  <div className="engineering-empty-note">选择 C4 文档、卡片或图内元素后，这里会显示架构锚点。</div>
                )}
              </>
            ) : (
              <ArchitectureAgentPanel
                projectRoot={projectRoot}
                activeDocumentPath={activeDocumentPath}
                activeDocumentTitle={activeDocumentTitle}
                selection={selection}
                onDocumentsChanged={() => void refreshActiveArchitectureDocument()}
              />
            )}
          </div>
        </aside>
      </section>

      <footer className="engineering-status-bar">
        <span>项目: {projectRoot}</span>
        <span>文档: {architectureDocumentStatusLabel(documentState)}</span>
        <span>{status}</span>
      </footer>
    </div>
  );
}

function ArchitectureMetric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel engineering-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function ArchitectureSelectionDetail({
  selection,
  onOpenDrilldown
}: {
  selection: ArchitectureSelection;
  onOpenDrilldown: (link: ArchitectureC4Link) => void;
}) {
  return (
    <dl className="engineering-selection-detail">
      <div>
        <dt>锚点</dt>
        <dd>{selection.anchor}</dd>
      </div>
      <div>
        <dt>类型</dt>
        <dd>{selection.kind ?? "-"}</dd>
      </div>
      <div>
        <dt>状态</dt>
        <dd>{selection.status ?? "-"}</dd>
      </div>
      <div>
        <dt>置信度</dt>
        <dd>{selection.confidence ?? "-"}</dd>
      </div>
      {selection.title ? (
        <div>
          <dt>标题</dt>
          <dd>{selection.title}</dd>
        </div>
      ) : null}
      {selection.copy ? (
        <div>
          <dt>说明</dt>
          <dd>{selection.copy}</dd>
        </div>
      ) : null}
      {selection.drilldowns.length ? (
        <div>
          <dt>可下钻</dt>
          <dd>
            <ol className="architecture-drilldown-link-list">
              {selection.drilldowns.map((link) => (
                <li key={link.id}>
                  <button type="button" onClick={() => onOpenDrilldown(link)}>
                    {link.title}
                  </button>
                </li>
              ))}
            </ol>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function ArchitectureAgentPanel({
  projectRoot,
  activeDocumentPath,
  activeDocumentTitle,
  selection,
  onDocumentsChanged
}: {
  projectRoot: string;
  activeDocumentPath: string;
  activeDocumentTitle: string;
  selection: ArchitectureSelection | null;
  onDocumentsChanged: () => void;
}) {
  async function handleSubmit(text: string, conversationHistory: RuntimeScopedAgentHistoryEntry[]): Promise<ScopedAgentSubmitResult> {
    const result = await discussArchitectureDiagram(
      projectRoot,
      activeDocumentPath || "docs/architecture/c4/c4-model-maps.html",
      activeDocumentTitle || "C4 Model Maps",
      text,
      selection ?? undefined,
      conversationHistory
    );
    return {
      text: formatArchitectureDiscussionResult(result),
      intent: result.intent,
      status: result.ok ? "done" : "failed",
      documentEdits: result.documentEdits,
      provider: result.provider
    };
  }

  return (
    <ScopedAgentPanel
      projectRoot={projectRoot}
      className="engineering-agent-panel"
      textareaId="architecture-agent-input"
      ariaLabel="Architecture Agent"
      scope={{
        id: `architecture:${activeDocumentPath || "maps"}:${selection?.anchor ?? "document"}`,
        title: "架构 Agent",
        copy: "只围绕当前 C4 架构层级、边界、锚点和下钻路径讨论。",
        modeLabel: "C4 架构",
        placeholder: "询问当前 C4 图、架构边界、Container/Component/Code 下钻...",
        inputLabel: "消息",
        emptyTitle: "架构 Agent",
        emptyCopy: selection ? "询问当前架构锚点、边界或下钻路径。" : "选择 C4 锚点后，可以让 Agent 解释架构层级。",
        scopeKind: "architecture",
        contextTitle: activeDocumentTitle || "C4 Model Maps",
        contextPath: activeDocumentPath
      }}
      onSubmit={handleSubmit}
      onResult={(result) => {
        if (result.documentEdits?.some((edit) => edit.changed && edit.status === "applied")) onDocumentsChanged();
      }}
    />
  );
}

function ArchitectureDocumentTree({
  index,
  activePath,
  onOpen
}: {
  index: ArchitectureC4MapIndex;
  activePath: string;
  onOpen: (document: ArchitectureC4Document | ArchitectureC4Category | "root") => void;
}) {
  const hasTree = Boolean(index.tree?.length);
  const total = hasTree
    ? countArchitectureTreeNodes(index.tree ?? [])
    : index.categories.reduce((sum, category) => sum + category.count, 0);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => activeArchitectureTreeIds(index, activePath));

  useEffect(() => {
    const activeIds = activeArchitectureTreeIds(index, activePath);
    if (activePath === index.rootHtmlPath) {
      setExpandedCategoryIds(new Set());
      return;
    }
    if (!activeIds.size) return;
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      for (const id of activeIds) next.add(id);
      return next;
    });
  }, [activePath, index]);

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <section className="engineering-document-tree">
      <header>
        <strong>C4 Model</strong>
        <button
          className={activePath === index.rootHtmlPath ? "is-active" : ""}
          type="button"
          onClick={() => onOpen("root")}
        >
          Root · {total}
        </button>
      </header>
      {hasTree ? (
        <ol>
          {(index.tree ?? []).map((node) => (
            <ArchitectureTreeNodeItem
              activePath={activePath}
              expandedIds={expandedCategoryIds}
              key={node.id}
              node={node}
              onOpen={onOpen}
              onToggle={toggleCategory}
            />
          ))}
        </ol>
      ) : (
        <ol>
          {index.categories.map((category) => {
          const expanded = expandedCategoryIds.has(category.id);
          const childListId = `architecture-tree-${category.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
          return (
            <li className={expanded ? "is-expanded" : ""} key={category.id}>
              <div className="engineering-tree-category-row">
                <button
                  className="engineering-tree-toggle"
                  type="button"
                  disabled={!category.items.length}
                  aria-controls={childListId}
                  aria-expanded={expanded}
                  title={expanded ? "Collapse" : "Expand"}
                  onClick={() => toggleCategory(category.id)}
                >
                  <span aria-hidden="true">{expanded ? "-" : "+"}</span>
                </button>
                <button
                  className={category.items.some((item) => item.htmlPath === activePath) ? "engineering-tree-document is-active" : "engineering-tree-document"}
                  type="button"
                  onClick={() => onOpen(category)}
                >
                  <span>{category.title}</span>
                  <small>{category.count}</small>
                </button>
              </div>
              {category.items.length && expanded ? (
                <ol id={childListId}>
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <button
                        className={activePath === item.htmlPath ? "is-active" : ""}
                        type="button"
                        title={`${architectureTreeDocumentTitle(item)}\n${architectureTreeDocumentSummary(item)}`}
                        onClick={() => onOpen(item)}
                      >
                        <span>{architectureTreeDocumentTitle(item)}</span>
                        <small>{item.confidence}</small>
                        <em>{architectureTreeDocumentSummary(item)}</em>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
          })}
        </ol>
      )}
    </section>
  );
}

function ArchitectureTreeNodeItem({
  node,
  activePath,
  expandedIds,
  onToggle,
  onOpen
}: {
  node: ArchitectureC4TreeNode;
  activePath: string;
  expandedIds: Set<string>;
  onToggle: (nodeId: string) => void;
  onOpen: (document: ArchitectureC4Document) => void;
}) {
  const expanded = expandedIds.has(node.id);
  const childListId = `architecture-tree-${node.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
  const isActive = node.htmlPath === activePath;
  const hasActiveChild = architectureTreeContainsPath(node.children, activePath);
  return (
    <li className={expanded ? "is-expanded" : ""}>
      <div className="engineering-tree-category-row">
        <button
          className="engineering-tree-toggle"
          type="button"
          disabled={!node.children.length}
          aria-controls={childListId}
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Expand"}
          onClick={() => onToggle(node.id)}
        >
          <span aria-hidden="true">{expanded ? "-" : "+"}</span>
        </button>
        <button
          className={isActive || hasActiveChild ? "engineering-tree-document is-active" : "engineering-tree-document"}
          type="button"
          title={`${architectureTreeDocumentTitle(node)}\n${architectureTreeDocumentSummary(node)}`}
          onClick={() => onOpen(node)}
        >
          <span>{architectureTreeDocumentTitle(node)}</span>
          <small>{isActive ? node.confidence : c4LevelLabel(node.level)}</small>
          <em>{architectureTreeDocumentSummary(node)}</em>
        </button>
      </div>
      {node.children.length && expanded ? (
        <ol id={childListId}>
          {node.children.map((child) => (
            <ArchitectureTreeNodeItem
              activePath={activePath}
              expandedIds={expandedIds}
              key={child.id}
              node={child}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

interface ArchitectureElementPopoverState {
  element: ArchitectureC4Element;
  x: number;
  y: number;
  pinned: boolean;
}

function SemanticArchitectureHtml({
  html,
  liveUpdating,
  onSelect,
  onOpenDrilldown,
  onOpenDocumentCard
}: {
  html: string;
  liveUpdating?: boolean;
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onOpenDrilldown: (link: ArchitectureC4Link) => void;
  onOpenDocumentCard: (document: ArchitectureDocumentCardReference) => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizeArchitectureHtml(html), [html]);
  const diagramDocument = useMemo(() => parseArchitectureDocumentPayload(html), [html]);
  const umlFullscreen = useUmlFullscreenViewer(safeHtml);
  const [popover, setPopover] = useState<ArchitectureElementPopoverState | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const hoveringElementRef = useRef(false);
  const hoveringPopoverRef = useRef(false);

  function clearCloseTimer() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }

  function openPopover(element: ArchitectureC4Element, target: Element) {
    clearCloseTimer();
    hoveringElementRef.current = true;
    const rect = target.getBoundingClientRect();
    const maxWidth = 430;
    const maxHeight = 420;
    const x = Math.min(Math.max(12, rect.right + 4), Math.max(12, window.innerWidth - maxWidth - 12));
    const y = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - maxHeight - 12));
    setPopover((current) => current?.pinned ? current : { element, x, y, pinned: false });
  }

  function scheduleClosePopover() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (hoveringElementRef.current || hoveringPopoverRef.current) return;
      setPopover((current) => current?.pinned ? current : null);
    }, 320);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const scrollTop = host.scrollTop;
    const scrollLeft = host.scrollLeft;
    const nextHost = document.createElement("div");
    nextHost.innerHTML = safeHtml;
    const blocks = Array.from(nextHost.querySelectorAll("pre.mermaid"));
    void renderSemanticMermaidBlocks({
      blocks,
      renderIdPrefix: "praxis-architecture-c4",
      securityLevel: "strict",
      fullscreenLabel: t("design.fullscreenUml"),
      setFullscreenDiagram: (diagram) => umlFullscreen.setFullscreenDiagram(diagram),
      setFullscreenZoom: (zoom) => umlFullscreen.setFullscreenZoom(zoom),
      decorateRendered: ({ rendered }) => {
        attachArchitectureElementMetadata(rendered, diagramDocument?.elements ?? [], {
          onOpen: openPopover,
          onClose: () => {
            hoveringElementRef.current = false;
            scheduleClosePopover();
          }
        });
      }
    }).then(() => {
      if (!active) return;
      host.replaceChildren(...Array.from(nextHost.childNodes));
      window.requestAnimationFrame(() => {
        if (!active) return;
        host.scrollTop = scrollTop;
        host.scrollLeft = scrollLeft;
      });
    });
    return () => {
      active = false;
      clearCloseTimer();
    };
  }, [safeHtml, diagramDocument]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const documentCard = architectureDocumentCardReferenceFromTarget(event.target);
    if (documentCard) {
      event.preventDefault();
      event.stopPropagation();
      onOpenDocumentCard(documentCard);
      return;
    }
    onSelect(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const documentCard = architectureDocumentCardReferenceFromTarget(event.target);
    if (!documentCard) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenDocumentCard(documentCard);
  }

  return (
    <div className="engineering-semantic-host architecture-semantic-host">
      <div
        ref={hostRef}
        className={`semantic-design-html engineering-semantic-html architecture-semantic-html ${liveUpdating ? "is-live-updating" : ""}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
      {umlFullscreen.overlay}
      {popover ? (
        <ArchitectureElementPopover
          state={popover}
          onMouseEnter={() => {
            hoveringPopoverRef.current = true;
            clearCloseTimer();
          }}
          onMouseLeave={() => {
            hoveringPopoverRef.current = false;
            scheduleClosePopover();
          }}
          onTogglePinned={() => setPopover((current) => current ? { ...current, pinned: !current.pinned } : current)}
          onOpenDrilldown={onOpenDrilldown}
        />
      ) : null}
    </div>
  );
}

function ArchitectureElementPopover({
  state,
  onMouseEnter,
  onMouseLeave,
  onTogglePinned,
  onOpenDrilldown
}: {
  state: ArchitectureElementPopoverState;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTogglePinned: () => void;
  onOpenDrilldown: (link: ArchitectureC4Link) => void;
}) {
  return (
    <div
      className={`engineering-element-popover${state.pinned ? " is-pinned" : ""}`}
      style={{ left: state.x, top: state.y }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header>
        <div>
          <strong>{state.element.label}</strong>
          <span>{c4LevelLabel(state.element.level)}</span>
        </div>
        <button
          type="button"
          aria-label={state.pinned ? "Unpin" : "Pin"}
          title={state.pinned ? "Unpin" : "Pin"}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned();
          }}
        >
          📌
        </button>
      </header>
      <div className="engineering-element-popover-body">
        {state.element.summary ? <p>{state.element.summary}</p> : null}
        <dl className="engineering-element-popover-fields">
          <ArchitecturePopoverField label="责任" value={state.element.responsibility} />
          <ArchitecturePopoverField label="边界" value={state.element.boundary} />
          <ArchitecturePopoverField label="关系意义" value={state.element.relationshipMeaning} />
          <ArchitecturePopoverField label="为什么属于该层" value={state.element.whyThisLevel} />
          <ArchitecturePopoverField label="下钻意图" value={state.element.drilldownIntent} />
          <ArchitecturePopoverField label="置信度" value={state.element.confidence} />
        </dl>
        <ArchitecturePopoverList title="证据" items={state.element.evidence} />
        {state.element.drilldowns.length ? (
          <>
            <strong className="engineering-element-popover-section-title">可下钻 C4</strong>
            <ol>
              {state.element.drilldowns.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDrilldown(link);
                    }}
                  >
                    <span>{c4LevelLabel(link.level)}</span>
                    <strong>{link.title}</strong>
                    {link.reason ? <small>{link.reason}</small> : null}
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ArchitecturePopoverField({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ArchitecturePopoverList({ title, items }: { title: string; items: string[] }) {
  const visible = items.filter((item) => item.trim().length > 0).slice(0, 6);
  if (!visible.length) return null;
  return (
    <section className="engineering-element-popover-list">
      <strong>{title}</strong>
      <ul>
        {visible.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function attachArchitectureElementMetadata(
  rendered: HTMLElement,
  elements: ArchitectureC4Element[],
  handlers: {
    onOpen: (element: ArchitectureC4Element, target: Element) => void;
    onClose: () => void;
  }
) {
  if (!elements.length) return;
  const usedTargets = new Set<Element>();
  for (const element of elements) {
    const target = findMermaidElementByLabel(rendered, element, usedTargets);
    if (!target) continue;
    usedTargets.add(target);
    target.classList.add("engineering-uml-semantic-element");
    target.setAttribute("data-praxis-anchor", element.anchor);
    target.setAttribute("data-praxis-kind", `architecture_${element.level}_element`);
    target.setAttribute("data-praxis-confidence", element.confidence);
    target.setAttribute("data-praxis-drilldowns", JSON.stringify(element.drilldowns));
    target.addEventListener("mouseenter", () => handlers.onOpen(element, target));
    target.addEventListener("focusin", () => handlers.onOpen(element, target));
    target.addEventListener("mouseleave", handlers.onClose);
    target.addEventListener("focusout", handlers.onClose);
  }
}

function findMermaidElementByLabel(
  rendered: HTMLElement,
  element: ArchitectureC4Element,
  usedTargets: Set<Element>
): Element | null {
  const candidates = Array.from(rendered.querySelectorAll("svg g, svg .node, svg .cluster, svg .actor, svg .participant, svg .classGroup"));
  const normalizedLabel = normalizeSvgLookupText(element.label);
  const byText = candidates.find((candidate) =>
    !usedTargets.has(candidate)
    && normalizedLabel
    && normalizeSvgLookupText(candidate.textContent ?? "").includes(normalizedLabel)
  );
  return byText ? closestUsefulSvgElement(byText) : null;
}

function closestUsefulSvgElement(element: Element): Element {
  return element.closest("g.node, g.cluster, g.actor, g.participant, g.classGroup, g") ?? element;
}

function normalizeSvgLookupText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}/_.:-]+/gu, "")
    .toLowerCase()
    .trim();
}

function parseArchitectureMapIndex(html: string): ArchitectureC4MapIndex | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.querySelector("#praxis-architecture-c4-index")?.textContent?.trim();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ArchitectureC4MapIndex;
    return value.schemaVersion === "praxis.architectureC4MapIndex.v1" ? value : null;
  } catch {
    return null;
  }
}

function parseArchitectureDocumentPayload(html: string): ArchitectureDocumentPayload | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.querySelector("#praxis-architecture-c4-document")?.textContent?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    return {
      id: stringField(record.id) ?? "",
      level: stringField(record.level) ?? "",
      title: stringField(record.title) ?? "",
      anchor: stringField(record.anchor) ?? "",
      elements: parseArchitectureElements(record.elements)
    };
  } catch {
    return null;
  }
}

function parseArchitectureElements(value: unknown): ArchitectureC4Element[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ArchitectureC4Element[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = stringField(record.id);
    const label = stringField(record.label);
    if (!id || !label) return [];
    return [{
      id,
      label,
      level: stringField(record.level) ?? "unknown",
      anchor: stringField(record.anchor) ?? id,
      summary: stringField(record.summary) ?? "",
      responsibility: stringField(record.responsibility) ?? "",
      boundary: stringField(record.boundary) ?? "",
      relationshipMeaning: stringField(record.relationshipMeaning) ?? "",
      whyThisLevel: stringField(record.whyThisLevel) ?? "",
      drilldownIntent: stringField(record.drilldownIntent) ?? "",
      evidence: stringArrayField(record.evidence),
      confidence: stringField(record.confidence) ?? "",
      drilldowns: parseArchitectureDrilldownsFromUnknown(record.drilldowns)
    }];
  });
}

function parseArchitectureDrilldowns(value: string | null): ArchitectureC4Link[] {
  if (!value?.trim()) return [];
  try {
    return parseArchitectureDrilldownsFromUnknown(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
}

function parseArchitectureDrilldownsFromUnknown(value: unknown): ArchitectureC4Link[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ArchitectureC4Link[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = stringField(record.id);
    const title = stringField(record.title);
    const htmlPath = stringField(record.htmlPath);
    const docPath = stringField(record.docPath);
    if (!id || !title || !htmlPath || !docPath) return [];
    return [{
      id,
      level: stringField(record.level) ?? "unknown",
      title,
      summary: stringField(record.summary) ?? "",
      docPath,
      htmlPath,
      anchor: stringField(record.anchor) ?? id,
      relation: stringField(record.relation),
      reason: stringField(record.reason)
    }];
  });
}

function architectureDocumentCardReferenceFromTarget(target: EventTarget | null): ArchitectureDocumentCardReference | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest("[data-praxis-document-html]") as HTMLElement | null;
  if (!element) return null;
  const htmlPath = element.getAttribute("data-praxis-document-html")?.trim();
  if (!htmlPath) return null;
  const docPath = element.getAttribute("data-praxis-document-md")?.trim()
    || htmlPath.replace(/\.html(?:#.*)?$/i, ".md");
  const title = element.getAttribute("data-praxis-document-title")?.trim()
    || element.querySelector("h1, h2, h3, h4, strong")?.textContent?.trim()
    || docPath;
  const summary = element.getAttribute("data-praxis-document-summary")?.trim()
    || directChildText(element, "p")
    || "";
  return {
    anchor: element.getAttribute("data-praxis-anchor")?.trim() || title,
    kind: element.getAttribute("data-praxis-kind")?.trim() || "architecture_document",
    title,
    summary,
    docPath,
    htmlPath,
    status: element.getAttribute("data-praxis-status")?.trim() || undefined,
    confidence: element.getAttribute("data-praxis-confidence")?.trim() || undefined
  };
}

function activeArchitectureTreeIds(index: ArchitectureC4MapIndex, activePath: string): Set<string> {
  if (!activePath.trim()) return new Set();
  if (index.tree?.length) return activeArchitectureTreeNodeIds(index.tree, activePath);
  return new Set(index.categories.flatMap((category) => (
    category.items.some((item) => item.htmlPath === activePath) ? [category.id] : []
  )));
}

function activeArchitectureTreeNodeIds(nodes: ArchitectureC4TreeNode[], activePath: string): Set<string> {
  const result = new Set<string>();
  for (const node of nodes) {
    const childIds = activeArchitectureTreeNodeIds(node.children, activePath);
    if (node.htmlPath === activePath || childIds.size) {
      result.add(node.id);
      for (const id of childIds) result.add(id);
    }
  }
  return result;
}

function architectureTreeContainsPath(nodes: ArchitectureC4TreeNode[], activePath: string): boolean {
  return nodes.some((node) => node.htmlPath === activePath || architectureTreeContainsPath(node.children, activePath));
}

function countArchitectureTreeNodes(nodes: ArchitectureC4TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countArchitectureTreeNodes(node.children), 0);
}

function architectureTreeDocumentTitle(document: ArchitectureC4Document | ArchitectureC4TreeNode): string {
  const rawName = cleanArchitectureDocumentTitle(document.title);
  if (document.level === "system_context") return `系统上下文 · ${rawName}`;
  if (document.level === "container") return `容器边界 · ${rawName}`;
  if (document.level === "component") return `组件职责 · ${rawName}`;
  if (document.level === "code") return `代码锚点 · ${rawName}`;
  return `${c4LevelLabel(document.level)} · ${rawName}`;
}

function architectureTreeDocumentSummary(document: ArchitectureC4Document | ArchitectureC4TreeNode): string {
  const summary = document.summary?.trim();
  if (summary && !isGenericArchitectureTreeSummary(summary, document)) return summary;
  if (document.level === "system_context") return "解释系统与用户、外部系统、上游下游之间的职责边界和交互方向。";
  if (document.level === "container") return "解释可部署/可运行容器的责任、技术选型、通信关系和边界风险。";
  if (document.level === "component") return "解释容器内部关键组件的职责切分、协作关系和可替换边界。";
  if (document.level === "code") return "解释架构组件落到代码层的关键锚点、文件位置和实现约束。";
  return "解释当前架构图的层级、边界、证据和下钻方向。";
}

function cleanArchitectureDocumentTitle(value: string): string {
  return (value || "未命名架构图")
    .replace(/^系统上下文[:：]\s*/i, "")
    .replace(/^容器边界[:：]\s*/i, "")
    .replace(/^组件职责[:：]\s*/i, "")
    .replace(/^代码锚点[:：]\s*/i, "")
    .replace(/^System Context[:：]\s*/i, "")
    .replace(/^Container[:：]\s*/i, "")
    .replace(/^Component[:：]\s*/i, "")
    .replace(/^Code[:：]\s*/i, "")
    .replace(/\s+System Context$/i, "")
    .replace(/\s+Container Diagram$/i, "")
    .replace(/\s+Component Diagram$/i, "")
    .replace(/\s+Code Diagram$/i, "")
    .replace(/\s+C4 Diagram$/i, "")
    .trim() || "未命名架构图";
}

function isGenericArchitectureTreeSummary(summary: string, document: ArchitectureC4Document | ArchitectureC4TreeNode): boolean {
  const normalized = summary.toLowerCase();
  return normalized === document.title.toLowerCase()
    || normalized.includes("candidate")
    || normalized.includes("c4")
    || normalized.includes("diagram")
    || normalized.includes("候选锚点")
    || normalized.includes("不代表完整代码结构");
}

function htmlPathForArchitectureDocument(pathValue: string): string {
  return pathValue.endsWith(".md") ? pathValue.replace(/\.md$/i, ".html") : pathValue;
}

function markdownPathForArchitectureDocument(pathValue: string): string {
  return pathValue.endsWith(".html") ? pathValue.replace(/\.html$/i, ".md") : pathValue;
}

function isArchitectureRootDocumentPath(pathValue: string): boolean {
  return pathValue === "docs/architecture/c4/c4-model-maps.html"
    || pathValue === "docs/architecture/c4/c4-model-maps.md";
}

function formatArchitectureDiscussionResult(result: RuntimeArchitectureDiagramDiscussionResult): string {
  const parts = [
    result.answer,
    result.guidance,
    result.architecturePerspective ? `Architecture perspective: ${result.architecturePerspective}` : "",
    formatArchitectureNamedList("Anchors", result.referencedAnchors),
    formatArchitectureNamedList("Drilldowns", result.suggestedDrilldowns),
    formatArchitectureDocumentEditResults(result.documentEdits),
    formatArchitectureNamedList("Risks", result.risks),
    formatArchitectureNamedList("Questions", result.questions)
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function formatArchitectureDocumentEditResults(values: RuntimeDiagramDocumentEditResult[] | undefined): string {
  if (!values?.length) return "";
  return [
    "Document edits:",
    ...values.map((item) => {
      const state = item.changed ? `${item.status}, changed` : item.status;
      return `- ${item.path} (${item.operation}, ${state}): ${item.message}${item.reason ? ` · ${item.reason}` : ""}`;
    })
  ].join("\n");
}

function formatArchitectureNamedList(title: string, values: string[]): string {
  return values.length ? `${title}:\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

function buildArchitectureChangelog(markdown: string, mapIndex: ArchitectureC4MapIndex | null): ArchitectureChangelogEntry[] {
  const entries: ArchitectureChangelogEntry[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(/^###\s+(.+?)\s+-\s+(.+)$/);
    if (!match) continue;
    const detailLines: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !lines[cursor].match(/^#{1,5}\s+/)) {
      detailLines.push(lines[cursor]);
      cursor += 1;
    }
    const summary = detailLines.find((line) => line.trim().startsWith("- "))?.replace(/^\s*-\s*/, "").trim() || "Architecture C4 map update.";
    entries.push({
      id: `architecture-changelog:${entries.length}:${match[1]}:${match[2]}`,
      title: "Architecture C4 update",
      version: match[1].trim(),
      date: match[2].trim(),
      summary
    });
    index = cursor - 1;
  }
  if (entries.length) return entries;
  if (!mapIndex) return [];
  return [{
    id: "architecture-changelog:index",
    title: "Architecture C4 snapshot",
    version: mapIndex.projectVersion,
    date: mapIndex.generatedAt,
    summary: `Recovered ${mapIndex.categories.reduce((sum, category) => sum + category.count, 0)} C4 document(s) across ${mapIndex.categories.length} levels.`,
    git: [mapIndex.git?.shortCommit, mapIndex.git?.branch, mapIndex.git?.dirty ? "dirty" : "clean"].filter(Boolean).join(" / ")
  }];
}

function markdownToFallbackArchitectureHtml(markdown: string): string {
  return [
    "<main class=\"praxis-architecture-map\">",
    "<section class=\"semantic-layer\">",
    "<h1>C4 Model Maps</h1>",
    `<pre>${escapeHtml(markdown)}</pre>`,
    "</section>",
    "</main>"
  ].join("\n");
}

function architectureDocumentStatusLabel(state: ArchitectureDocumentState): string {
  if (state === "loading") return "载入中";
  if (state === "ready") return "已载入生成视图";
  if (state === "missing") return "缺少 docs/architecture/c4";
  if (state === "generating") return "生成中";
  if (state === "error") return "错误";
  return "空闲";
}

function architectureLevelFromLink(level: string): ArchitectureC4Level {
  return architectureLevelFromKind(level);
}

function architectureLevelFromKind(kind: string): ArchitectureC4Level {
  if (kind.includes("system")) return "system_context";
  if (kind.includes("container")) return "container";
  if (kind.includes("component")) return "component";
  if (kind.includes("code")) return "code";
  return "component";
}

function c4LevelLabel(level: string): string {
  if (level === "system_context") return "System Context";
  if (level === "container") return "Container";
  if (level === "component") return "Component";
  if (level === "code") return "Code";
  if (level === "person") return "Person";
  if (level === "external_system") return "External System";
  if (level === "repository") return "Repository";
  if (level === "project_memory") return "Generated Artifacts";
  return level;
}

function sanitizeArchitectureHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, meta").forEach((element) => element.remove());
  doc.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "href" || name === "src" || name === "xlink:href") && value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  normalizeInternalTermsInHtmlDocument(doc);
  return doc.body.innerHTML;
}

function directChildText(element: Element, selector: string): string | undefined {
  const child = Array.from(element.children).find((candidate) => candidate.matches(selector));
  return child?.textContent?.trim() || undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
