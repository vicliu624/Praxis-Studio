import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { type TranslationKey, useI18n } from "../i18n";
import { AgentConversationPanel, type AgentConversationEvent } from "../chat/AgentConversationPanel";
import { ScopedAgentPanel, type ScopedAgentSubmitResult } from "../chat/ScopedAgentPanel";
import { renderSemanticMermaidBlocks, useUmlFullscreenViewer } from "../components/SemanticMermaidRenderer";
import { normalizeInternalTermsInHtmlDocument } from "../components/userFacingText";
import {
  discussEngineeringDiagram,
  readEngineeringDocumentHtml,
  readEngineeringDocumentMarkdown,
  readEngineeringMapMarkdown,
  readEngineeringSemanticHtml,
  runEngineeringDiscovery,
  type RuntimeDiagramDocumentEditResult,
  type RuntimeEngineeringDiagramDiscussionResult,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";

interface EngineeringExplorerPageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  onOpenDesignExplorer: () => void;
}

type EngineeringDocumentState = "idle" | "loading" | "ready" | "missing" | "generating" | "error";

interface EngineeringSelection {
  anchor: string;
  kind?: string;
  status?: string;
  confidence?: string;
  title?: string;
  copy?: string;
  documentHtml?: string;
  drilldowns: EngineeringDiagramLink[];
}

interface EngineeringComplexityModel {
  schemaVersion: "praxis.engineeringComplexityModel.v1";
  generatedAt: string;
  projectVersion: string;
  git?: {
    branch?: string;
    commit?: string;
    shortCommit?: string;
    dirty?: boolean;
  };
  summary: {
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    packageCount: number;
    componentCount: number;
    runtimeFlowCount: number;
    deploymentNodeCount: number;
    hotspotCount: number;
  };
  packages: Array<{ id: string; title: string; path: string; fileCount: number; nodeCount: number; incoming: number; outgoing: number }>;
  components: Array<{
    id: string;
    title: string;
    kind: string;
    filePath: string;
    line?: number;
    reusePressure?: number;
    externalCollaborationPressure?: number;
    fanIn?: number;
    fanOut?: number;
  }>;
  runtimeFlows: Array<{ id: string; title: string; edgeKind: string; sourcePath: string; targetPath: string }>;
  deploymentNodes: Array<{ id: string; title: string; kind: string; filePath: string }>;
  hotspots: Array<{ id: string; title: string; kind: string; targetPath: string; signal?: string; summary: string }>;
}

interface EngineeringMapIndex {
  schemaVersion: "praxis.engineeringMapIndex.v1";
  generatedAt: string;
  projectVersion: string;
  rootDocPath: string;
  rootHtmlPath: string;
  compatibilityDocPath?: string;
  compatibilityHtmlPath?: string;
  git?: {
    branch?: string;
    commit?: string;
    shortCommit?: string;
    dirty?: boolean;
  };
  summary: EngineeringComplexityModel["summary"];
  hierarchy?: EngineeringDiagramHierarchyRule[];
  categories: EngineeringDiagramCategory[];
}

interface EngineeringDiagramHierarchyRule {
  parentKind: string;
  childKinds: string[];
  rationale: string;
}

interface EngineeringDiagramCategory {
  id: string;
  kind: string;
  title: string;
  directory: string;
  mapDocPath: string;
  mapHtmlPath: string;
  summary: string;
  count: number;
  items: EngineeringDiagramDocument[];
}

interface EngineeringDiagramDocument {
  id: string;
  kind: string;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: string;
  confidence: string;
  drilldowns?: EngineeringDiagramLink[];
}

interface EngineeringDiagramLink {
  id: string;
  kind: string;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  relation?: string;
  reason?: string;
}

interface EngineeringDocumentCardReference {
  anchor: string;
  kind: string;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  status?: string;
  confidence?: string;
}

interface EngineeringDiagramElement {
  id: string;
  mermaidId: string;
  label: string;
  kind: string;
  anchor: string;
  summary: string;
  role: string;
  whyItExists: string;
  relationshipMeaning: string;
  drilldownIntent: string;
  businessRelevance: string;
  changeImpact: string;
  evidence: string[];
  risks: string[];
  questions: string[];
  confidence: string;
  drilldowns: EngineeringDiagramLink[];
}

interface EngineeringDiagramDocumentPayload {
  id: string;
  kind: string;
  title: string;
  anchor: string;
  elements?: EngineeringDiagramElement[];
}

interface EngineeringChangelogEntry {
  id: string;
  title: string;
  version: string;
  date: string;
  summary: string;
  git?: string;
}

export function EngineeringExplorerPage({ projectRoot, onOpenDesignExplorer }: EngineeringExplorerPageProps) {
  const { t } = useI18n();
  const [rootSemanticHtml, setRootSemanticHtml] = useState("");
  const [rootMarkdown, setRootMarkdown] = useState("");
  const [semanticHtml, setSemanticHtml] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [activeDocumentPath, setActiveDocumentPath] = useState("");
  const [activeDocumentTitle, setActiveDocumentTitle] = useState("");
  const [activeDocumentLiveUpdating, setActiveDocumentLiveUpdating] = useState(false);
  const [activeDocumentLiveUpdatedAt, setActiveDocumentLiveUpdatedAt] = useState("");
  const [documentState, setDocumentState] = useState<EngineeringDocumentState>(projectRoot ? "loading" : "idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<EngineeringSelection | null>(null);
  const [sideTab, setSideTab] = useState<"uml" | "agent">("uml");
  const mapIndex = useMemo(() => parseEngineeringMapIndex(rootSemanticHtml), [rootSemanticHtml]);
  const model = useMemo(() => parseEngineeringModel(rootSemanticHtml) ?? parseEngineeringModel(semanticHtml), [rootSemanticHtml, semanticHtml]);
  const summary = mapIndex?.summary ?? model?.summary;
  const changelog = useMemo(() => buildEngineeringChangelog(rootMarkdown || markdown, model, mapIndex), [rootMarkdown, markdown, model, mapIndex]);
  const semanticHtmlRef = useRef("");
  const markdownRef = useRef("");

  useEffect(() => {
    if (projectRoot) {
      void loadEngineeringDocuments(projectRoot);
      return;
    }
    setSemanticHtml("");
    setMarkdown("");
    setRootSemanticHtml("");
    setRootMarkdown("");
    setActiveDocumentPath("");
    setActiveDocumentTitle("");
    setActiveDocumentLiveUpdating(false);
    setActiveDocumentLiveUpdatedAt("");
    setDocumentState("idle");
    setStatus("");
    setError("");
    setSelection(null);
  }, [projectRoot]);

  async function loadEngineeringDocuments(root: string) {
    setDocumentState("loading");
    setError("");
    setStatus(t("engineering.loading"));
    setSelection(null);
    try {
      const [html, md] = await Promise.all([
        readEngineeringSemanticHtml(root),
        readEngineeringMapMarkdown(root)
      ]);
      if (!html?.trim() && !md?.trim()) {
        setRootSemanticHtml("");
        setRootMarkdown("");
        setSemanticHtml("");
        setMarkdown("");
        setActiveDocumentPath("");
        setActiveDocumentTitle("");
        setDocumentState("missing");
        setStatus(t("engineering.statusMissing"));
        return;
      }
      const rootHtml = html ?? markdownToFallbackEngineeringHtml(md ?? "");
      setRootSemanticHtml(rootHtml);
      setRootMarkdown(md ?? "");
      setSemanticHtml(rootHtml);
      setMarkdown(md ?? "");
      setActiveDocumentPath("docs/engineering/engineering-maps.html");
      setActiveDocumentTitle(t("engineering.rootMapTitle"));
      setDocumentState("ready");
      setStatus(t("engineering.statusReady"));
    } catch (caught) {
      setDocumentState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(t("engineering.statusError"));
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
      const htmlPath = htmlPathForSemanticDocument(activeDocumentPath);
      const mdPath = markdownPathForSemanticDocument(activeDocumentPath);
      void Promise.all([
        readEngineeringDocumentHtml(projectRoot, htmlPath),
        readEngineeringDocumentMarkdown(projectRoot, mdPath)
      ])
        .then(([html, md]) => {
          if (disposed) return;
          const nextMarkdown = md ?? "";
          const nextHtml = html?.trim() ? html : markdownToFallbackEngineeringHtml(nextMarkdown);
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
          if (isEngineeringRootDocumentPath(activeDocumentPath)) {
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

  async function refreshActiveEngineeringDocument() {
    if (!projectRoot || !activeDocumentPath) return;
    const htmlPath = htmlPathForSemanticDocument(activeDocumentPath);
    const mdPath = markdownPathForSemanticDocument(activeDocumentPath);
    try {
      const [html, md] = await Promise.all([
        readEngineeringDocumentHtml(projectRoot, htmlPath),
        readEngineeringDocumentMarkdown(projectRoot, mdPath)
      ]);
      const nextMarkdown = md ?? "";
      const nextHtml = html?.trim() ? html : markdownToFallbackEngineeringHtml(nextMarkdown);
      semanticHtmlRef.current = nextHtml;
      markdownRef.current = nextMarkdown;
      setSemanticHtml(nextHtml);
      setMarkdown(nextMarkdown);
      if (isEngineeringRootDocumentPath(activeDocumentPath)) {
        setRootSemanticHtml(nextHtml);
        setRootMarkdown(nextMarkdown);
      }
      setActiveDocumentLiveUpdating(true);
      setActiveDocumentLiveUpdatedAt(new Date().toLocaleTimeString());
      window.setTimeout(() => setActiveDocumentLiveUpdating(false), 900);
    } catch {
      // Keep the current projection visible; the polling loop will try again.
    }
  }

  async function generateEngineeringDocuments() {
    if (!projectRoot || documentState === "generating") return;
    setDocumentState("generating");
    setError("");
    setStatus(t("engineering.generating"));
    try {
      const result = await runEngineeringDiscovery(projectRoot);
      setStatus(t("engineering.generated", {
        packages: result.summary.packageCount,
        components: result.summary.componentCount,
        flows: result.summary.runtimeFlowCount,
        hotspots: result.summary.hotspotCount
      }));
      await loadEngineeringDocuments(projectRoot);
    } catch (caught) {
      setDocumentState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(t("engineering.statusError"));
    }
  }

  async function openEngineeringDocument(document: EngineeringDiagramDocument | EngineeringDiagramCategory | "root") {
    if (!projectRoot) return;
    const htmlPath = document === "root" ? mapIndex?.rootHtmlPath ?? "docs/engineering/engineering-maps.html" : "htmlPath" in document ? document.htmlPath : document.mapHtmlPath;
    const mdPath = document === "root" ? mapIndex?.rootDocPath ?? "docs/engineering/engineering-maps.md" : "docPath" in document ? document.docPath : document.mapDocPath;
    const title = document === "root" ? t("engineering.rootMapTitle") : document.title;
    setError("");
    setSelection(null);
    setStatus(t("engineering.loading"));
    const [html, md] = await Promise.all([
      readEngineeringDocumentHtml(projectRoot, htmlPath),
      readEngineeringDocumentMarkdown(projectRoot, mdPath)
    ]);
    if (!html?.trim() && !md?.trim()) {
      setError(`Missing engineering document: ${htmlPath}`);
      setStatus(t("engineering.statusError"));
      return;
    }
    setSemanticHtml(html ?? markdownToFallbackEngineeringHtml(md ?? ""));
    setMarkdown(md ?? "");
    setActiveDocumentPath(htmlPath);
    setActiveDocumentTitle(title);
    setStatus(t("engineering.statusReady"));
    setSideTab("uml");
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
      documentHtml: element.getAttribute("data-praxis-document-html") ?? undefined,
      drilldowns: parseEngineeringDrilldowns(element.getAttribute("data-praxis-drilldowns"))
    });
  }

  async function openEngineeringDrilldown(link: EngineeringDiagramLink) {
    await openEngineeringDocument({
      id: link.id,
      kind: link.kind,
      title: link.title,
      summary: link.summary,
      docPath: link.docPath,
      htmlPath: link.htmlPath,
      anchor: link.anchor,
      status: "candidate",
      confidence: ""
    });
  }

  async function openEngineeringDocumentCard(card: EngineeringDocumentCardReference) {
    await openEngineeringDocument({
      id: card.anchor,
      kind: card.kind,
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
      <div className="engineering-explorer-page">
        <section className="panel engineering-generate-panel">
          <strong>{t("engineering.noProjectTitle")}</strong>
          <span>{t("engineering.noProjectCopy")}</span>
        </section>
      </div>
    );
  }

  const ready = documentState === "ready" && semanticHtml.trim();
  return (
    <div className="engineering-explorer-page">
      <header className="engineering-explorer-header">
        <p className="eyebrow">{t("engineering.eyebrow")}</p>
        <div>
          <h1>{t("engineering.title")}</h1>
          <p>{t("engineering.copy")}</p>
        </div>
      </header>

      <section className="engineering-explorer-workspace">
        <aside className="panel engineering-timeline-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("engineering.changelogTitle")}</h2>
              <p className="muted-copy">{t("engineering.changelogCopy")}</p>
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
            <div className="engineering-empty-note">{t("engineering.changelogEmpty")}</div>
          )}
          <button className="secondary-action compact-action" type="button" onClick={onOpenDesignExplorer}>
            {t("engineering.openBusinessComplexity")}
          </button>
        </aside>

        <main className="engineering-main-panel">
          <section className="engineering-summary-grid">
            <EngineeringMetric label={t("engineering.metricPackages")} value={summary?.packageCount ?? 0} />
            <EngineeringMetric label={t("engineering.metricComponents")} value={summary?.componentCount ?? 0} />
            <EngineeringMetric label={t("engineering.metricRuntimeFlows")} value={summary?.runtimeFlowCount ?? 0} />
            <EngineeringMetric label={t("engineering.metricHotspots")} value={summary?.hotspotCount ?? 0} />
          </section>

          {!ready ? (
            <section className="panel engineering-generate-panel">
              <strong>{documentState === "generating" ? t("engineering.generatingTitle") : t("engineering.generateMissingTitle")}</strong>
              <span>{documentState === "generating" ? t("engineering.generatingCopy") : t("engineering.generateMissingCopy")}</span>
              <button
                className="primary-action"
                type="button"
                disabled={documentState === "generating"}
                onClick={generateEngineeringDocuments}
              >
                {documentState === "generating" ? t("engineering.generating") : t("engineering.generateDocuments")}
              </button>
              {error ? <span className="error-text">{error}</span> : null}
            </section>
          ) : (
            <section className="panel engineering-html-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activeDocumentTitle || t("engineering.mapTitle")}</h2>
                  <p className="muted-copy">{t("engineering.mapCopy")}</p>
                </div>
                <div className="design-document-pills">
                  <span className="pill">{activeDocumentPath || "docs/engineering/engineering-maps.html"}</span>
                  {activeDocumentLiveUpdating || activeDocumentLiveUpdatedAt ? (
                    <span className={`pill design-live-pill ${activeDocumentLiveUpdating ? "is-updating" : ""}`}>
                      {activeDocumentLiveUpdating ? "Agent 正在编辑文档" : `已更新 ${activeDocumentLiveUpdatedAt}`}
                    </span>
                  ) : null}
                </div>
              </div>
              <SemanticEngineeringHtml
                html={semanticHtml}
                liveUpdating={activeDocumentLiveUpdating}
                onSelect={handleSelectAnchor}
                onOpenDrilldown={openEngineeringDrilldown}
                onOpenDocumentCard={openEngineeringDocumentCard}
              />
            </section>
          )}
        </main>

        <aside className="panel engineering-side-panel">
          <div className="engineering-side-tabs" role="tablist" aria-label={t("engineering.sideTitle")}>
            <button
              className={sideTab === "uml" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={sideTab === "uml"}
              onClick={() => setSideTab("uml")}
            >
              {t("engineering.sideTabUml")}
            </button>
            <button
              className={sideTab === "agent" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={sideTab === "agent"}
              onClick={() => setSideTab("agent")}
            >
              {t("engineering.sideTabAgent")}
            </button>
          </div>
          <div className="engineering-side-tab-body">
            {sideTab === "uml" ? (
              <>
                {mapIndex ? (
                  <EngineeringDocumentTree
                    index={mapIndex}
                    activePath={activeDocumentPath}
                    onOpen={openEngineeringDocument}
                  />
                ) : null}
                {selection ? (
                  <EngineeringSelectionDetail selection={selection} />
                ) : (
                  <div className="engineering-empty-note">{t("engineering.noAnchorSelected")}</div>
                )}
                {model ? <EngineeringDimensionList model={model} /> : null}
              </>
            ) : (
              <EngineeringAgentPanel
                projectRoot={projectRoot}
                activeDocumentPath={activeDocumentPath}
                activeDocumentTitle={activeDocumentTitle}
                selection={selection}
                onDocumentsChanged={() => void refreshActiveEngineeringDocument()}
              />
            )}
          </div>
        </aside>
      </section>

      <footer className="engineering-status-bar">
        <span>{t("engineering.statusProject")}: {projectRoot}</span>
        <span>{t("engineering.statusDocs")}: {engineeringDocumentStatusLabel(documentState, t)}</span>
        <span>{status}</span>
      </footer>
    </div>
  );
}

function EngineeringMetric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel engineering-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function EngineeringSelectionDetail({
  selection
}: {
  selection: EngineeringSelection;
}) {
  const { t } = useI18n();
  return (
    <dl className="engineering-selection-detail">
      <div>
        <dt>{t("engineering.anchor")}</dt>
        <dd>{selection.anchor}</dd>
      </div>
      <div>
        <dt>{t("engineering.kind")}</dt>
        <dd>{selection.kind ?? "-"}</dd>
      </div>
      <div>
        <dt>{t("engineering.status")}</dt>
        <dd>{selection.status ?? "-"}</dd>
      </div>
      <div>
        <dt>{t("engineering.confidence")}</dt>
        <dd>{selection.confidence ?? "-"}</dd>
      </div>
      {selection.title ? (
        <div>
          <dt>{t("engineering.selectionTitle")}</dt>
          <dd>{selection.title}</dd>
        </div>
      ) : null}
      {selection.copy ? (
        <div>
          <dt>{t("engineering.selectionCopy")}</dt>
          <dd>{selection.copy}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function EngineeringAgentPanel({
  projectRoot,
  activeDocumentPath,
  activeDocumentTitle,
  selection,
  onDocumentsChanged
}: {
  projectRoot: string;
  activeDocumentPath: string;
  activeDocumentTitle: string;
  selection: EngineeringSelection | null;
  onDocumentsChanged: () => void;
}) {
  const { t } = useI18n();

  async function handleSubmit(text: string, conversationHistory: RuntimeScopedAgentHistoryEntry[]): Promise<ScopedAgentSubmitResult> {
    const result = await discussEngineeringDiagram(
      projectRoot,
      activeDocumentPath || "docs/engineering/engineering-maps.html",
      activeDocumentTitle || "Engineering Maps",
      text,
      selection ?? undefined,
      conversationHistory
    );
    return {
      text: formatEngineeringDiscussionResult(result),
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
      textareaId="engineering-agent-input"
      ariaLabel={t("engineering.agentTitle")}
      scope={{
        id: `engineering:${activeDocumentPath || "maps"}:${selection?.anchor ?? "document"}`,
        title: t("engineering.agentTitle"),
        copy: t("engineering.agentCopy"),
        modeLabel: t("engineering.agentMode"),
        placeholder: t("engineering.agentPlaceholder"),
        inputLabel: t("engineering.agentInputLabel"),
        emptyTitle: t("engineering.agentTitle"),
        emptyCopy: selection ? t("engineering.agentEmptyWithSelection") : t("engineering.agentEmpty"),
        scopeKind: "engineering",
        contextTitle: activeDocumentTitle || "Engineering Maps",
        contextPath: activeDocumentPath
      }}
      onSubmit={handleSubmit}
      onResult={(result) => {
        if (result.documentEdits?.some((edit) => edit.changed && edit.status === "applied")) onDocumentsChanged();
      }}
    />
  );
}

function EngineeringDocumentTree({
  index,
  activePath,
  onOpen
}: {
  index: EngineeringMapIndex;
  activePath: string;
  onOpen: (document: EngineeringDiagramDocument | EngineeringDiagramCategory | "root") => void;
}) {
  const total = index.categories.reduce((sum, category) => sum + category.count, 0);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => activeEngineeringCategoryIds(index, activePath));

  useEffect(() => {
    const activeIds = activeEngineeringCategoryIds(index, activePath);
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
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  return (
    <section className="engineering-document-tree">
      <header>
        <strong>Engineering Maps</strong>
        <button
          className={activePath === index.rootHtmlPath ? "is-active" : ""}
          type="button"
          onClick={() => onOpen("root")}
        >
          Root · {total}
        </button>
      </header>
      <ol>
        {index.categories.map((category) => {
          const expanded = expandedCategoryIds.has(category.id);
          const childListId = `engineering-tree-${category.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
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
                  className={activePath === category.mapHtmlPath ? "engineering-tree-document is-active" : "engineering-tree-document"}
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
                        title={`${engineeringTreeDocumentTitle(item)}\n${engineeringTreeDocumentSummary(item)}`}
                        onClick={() => onOpen(item)}
                      >
                        <span>{engineeringTreeDocumentTitle(item)}</span>
                        <small>{item.confidence}</small>
                        <em>{engineeringTreeDocumentSummary(item)}</em>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function activeEngineeringCategoryIds(index: EngineeringMapIndex, activePath: string): Set<string> {
  if (!activePath.trim()) return new Set();
  return new Set(index.categories.flatMap((category) => (
    activePath === category.mapHtmlPath || category.items.some((item) => item.htmlPath === activePath)
      ? [category.id]
      : []
  )));
}

function engineeringTreeDocumentTitle(item: EngineeringDiagramDocument): string {
  const rawName = stripEngineeringDiagramSuffix(item.title);
  if (item.kind === "package") return `模块边界 · ${rawName}`;
  if (item.kind === "component") return `${componentKindLabelFromTitleOrSummary(item)} · ${shortTechnicalName(rawName)}`;
  if (item.kind === "class_structural") return `结构协作 · ${rawName}`;
  if (item.kind === "sequence") return `动态协作 · ${rawName}`;
  if (item.kind === "deployment") return `${deploymentKindLabelFromSummary(item.summary)} · ${deploymentScopeFromTitle(rawName)}`;
  if (item.kind === "technical_hotspot") {
    return rawName.startsWith("大文件：")
      || rawName.startsWith("被广泛复用的候选对象：")
      || rawName.startsWith("承担外部协作的候选对象：")
      || rawName.startsWith("依赖簇：")
      ? rawName
      : `技术热点 · ${rawName}`;
  }
  if (item.kind === "state_machine") return `状态迁移 · ${rawName}`;
  return rawName || item.title;
}

function engineeringTreeDocumentSummary(item: EngineeringDiagramDocument): string {
  if (item.summary.trim()) return item.summary.trim();
  const rawName = stripEngineeringDiagramSuffix(item.title);
  if (item.kind === "package") return `解释 ${rawName} 的模块边界、依赖方向和可下钻技术对象。`;
  if (item.kind === "component") return `解释 ${rawName} 的技术职责、协作压力和变更影响面。`;
  if (item.kind === "class_structural") return `解释 ${rawName} 内关键对象如何形成结构协作切片。`;
  if (item.kind === "sequence") return `解释 ${rawName} 代表的调用、引用、导入或消息方向。`;
  if (item.kind === "deployment") return `解释 ${rawName} 对启动、构建、配置、部署或发布链路的影响。`;
  if (item.kind === "technical_hotspot") return `解释 ${rawName} 为什么可能提高阅读、修改、测试或回归成本。`;
  return "解释当前技术复杂度图的范围、证据和下钻方向。";
}

function stripEngineeringDiagramSuffix(title: string): string {
  return title
    .replace(/^模块边界[:：]\s*/i, "")
    .replace(/^界面组件[:：]\s*/i, "")
    .replace(/^命令入口[:：]\s*/i, "")
    .replace(/^类型契约[:：]\s*/i, "")
    .replace(/^适配组件[:：]\s*/i, "")
    .replace(/^服务对象[:：]\s*/i, "")
    .replace(/^函数节点[:：]\s*/i, "")
    .replace(/^结构对象[:：]\s*/i, "")
    .replace(/^技术组件[:：]\s*/i, "")
    .replace(/^结构协作[:：]\s*/i, "")
    .replace(/^动态协作[:：]\s*/i, "")
    .replace(/^桌面壳配置[:：]\s*/i, "")
    .replace(/^Rust 运行配置[:：]\s*/i, "")
    .replace(/^包脚本配置[:：]\s*/i, "")
    .replace(/^容器运行配置[:：]\s*/i, "")
    .replace(/^CI 工作流[:：]\s*/i, "")
    .replace(/^前端构建配置[:：]\s*/i, "")
    .replace(/^TypeScript 编译配置[:：]\s*/i, "")
    .replace(/^运行部署配置[:：]\s*/i, "")
    .replace(/\s+Package Diagram$/i, "")
    .replace(/\s+Component Diagram$/i, "")
    .replace(/\s+Class \/ Structural Diagram$/i, "")
    .replace(/\s+Sequence Diagram$/i, "")
    .replace(/\s+Deployment Diagram$/i, "")
    .replace(/\s+Technical Hotspot$/i, "")
    .trim();
}

function componentKindLabelFromTitleOrSummary(item: EngineeringDiagramDocument): string {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  if (haystack.includes("react") || haystack.includes("tsx") || haystack.includes("page") || haystack.includes("component")) return "界面组件";
  if (haystack.includes("command") || haystack.includes("cli")) return "命令入口";
  if (haystack.includes("schema") || haystack.includes("interface") || haystack.includes("type")) return "类型契约";
  if (haystack.includes("provider") || haystack.includes("adapter")) return "适配组件";
  if (haystack.includes("service")) return "服务对象";
  if (haystack.includes("function") || haystack.includes("method")) return "函数节点";
  return "技术组件";
}

function deploymentKindLabelFromSummary(summary: string): string {
  const value = summary.toLowerCase();
  if (value.includes("tauri") || value.includes("桌面壳")) return "桌面壳配置";
  if (value.includes("rust")) return "Rust 运行配置";
  if (value.includes("node") || value.includes("package")) return "包脚本配置";
  if (value.includes("ci")) return "CI 工作流";
  if (value.includes("vite") || value.includes("frontend")) return "前端构建配置";
  if (value.includes("typescript")) return "TypeScript 编译配置";
  if (value.includes("docker") || value.includes("container")) return "容器运行配置";
  return "运行部署配置";
}

function deploymentScopeFromTitle(title: string): string {
  const normalized = title.replace(/\\/g, "/").replace(/\s+·\s+/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return title;
  const fileName = parts.at(-1) ?? "";
  const scope = parts.length > 1 ? parts.slice(0, -1).join("/") : title;
  return fileName ? `${scope} / ${fileName}` : scope;
}

function shortTechnicalName(value: string): string {
  const parts = value.replace(/\\/g, "/").split(/[/.]/).filter(Boolean);
  return parts.at(-1) || value;
}

function componentRelationLabel(value: number, direction: "incoming" | "outgoing"): string {
  if (direction === "incoming") {
    if (value <= 0) return "未观察到明显复用";
    if (value >= 20) return "被多个对象复用";
    return "存在复用线索";
  }
  if (value <= 0) return "未观察到明显外部协作";
  if (value >= 20) return "协调多个外部对象";
  return "存在外部协作线索";
}

function EngineeringDimensionList({ model }: { model: EngineeringComplexityModel }) {
  const { t } = useI18n();
  const sections = [
    { title: t("engineering.metricPackages"), items: model.packages.slice(0, 5).map((item) => `${item.title} · ${item.nodeCount} 个符号`) },
    { title: t("engineering.metricComponents"), items: model.components.slice(0, 5).map((item) => `${item.title} · ${componentRelationLabel(item.reusePressure ?? item.fanIn ?? 0, "incoming")} · ${componentRelationLabel(item.externalCollaborationPressure ?? item.fanOut ?? 0, "outgoing")}`) },
    { title: t("engineering.metricRuntimeFlows"), items: model.runtimeFlows.slice(0, 5).map((item) => `${item.title} · ${item.edgeKind}`) },
    { title: t("engineering.metricHotspots"), items: model.hotspots.slice(0, 5).map((item) => `${item.title} · ${item.signal ?? item.kind}`) }
  ];
  return (
    <div className="engineering-dimension-list">
      {sections.map((section) => (
        <section key={section.title}>
          <strong>{section.title}</strong>
          {section.items.length ? (
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : (
            <span>-</span>
          )}
        </section>
      ))}
    </div>
  );
}

interface EngineeringElementPopoverState {
  element: EngineeringDiagramElement;
  x: number;
  y: number;
  pinned: boolean;
}

function SemanticEngineeringHtml({
  html,
  liveUpdating,
  onSelect,
  onOpenDrilldown,
  onOpenDocumentCard
}: {
  html: string;
  liveUpdating?: boolean;
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onOpenDrilldown: (link: EngineeringDiagramLink) => void;
  onOpenDocumentCard: (document: EngineeringDocumentCardReference) => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizeSemanticHtml(html), [html]);
  const diagramDocument = useMemo(() => parseEngineeringDiagramDocumentPayload(html), [html]);
  const umlFullscreen = useUmlFullscreenViewer(safeHtml);
  const [popover, setPopover] = useState<EngineeringElementPopoverState | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const hoveringElementRef = useRef(false);
  const hoveringPopoverRef = useRef(false);

  function clearCloseTimer() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }

  function openPopover(element: EngineeringDiagramElement, target: Element) {
    clearCloseTimer();
    hoveringElementRef.current = true;
    const rect = target.getBoundingClientRect();
    const maxWidth = 430;
    const maxHeight = 420;
    const x = Math.min(Math.max(12, rect.right + 4), Math.max(12, window.innerWidth - maxWidth - 12));
    const y = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - maxHeight - 12));
    setPopover((current) => current?.pinned
      ? current
      : { element, x, y, pinned: false });
  }

  function scheduleClosePopover() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (hoveringElementRef.current || hoveringPopoverRef.current) return;
      setPopover((current) => current?.pinned ? current : null);
    }, 320);
  }

  function leaveElementPopoverTarget() {
    hoveringElementRef.current = false;
    scheduleClosePopover();
  }

  function enterPopover() {
    hoveringPopoverRef.current = true;
    clearCloseTimer();
  }

  function leavePopover() {
    hoveringPopoverRef.current = false;
    scheduleClosePopover();
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
      renderIdPrefix: "praxis-engineering-map",
      securityLevel: "strict",
      fullscreenLabel: t("design.fullscreenUml"),
      setFullscreenDiagram: (diagram) => umlFullscreen.setFullscreenDiagram(diagram),
      setFullscreenZoom: (zoom) => umlFullscreen.setFullscreenZoom(zoom),
      decorateRendered: ({ rendered }) => {
        attachEngineeringElementMetadata(rendered, diagramDocument?.elements ?? [], {
          onOpen: openPopover,
          onClose: leaveElementPopoverTarget
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
    const documentCard = documentCardReferenceFromTarget(event.target);
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
    const documentCard = documentCardReferenceFromTarget(event.target);
    if (!documentCard) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenDocumentCard(documentCard);
  }

  return (
    <div className="engineering-semantic-host">
      <div
        ref={hostRef}
        className={`semantic-design-html engineering-semantic-html ${liveUpdating ? "is-live-updating" : ""}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
      {umlFullscreen.overlay}
      {popover ? (
        <EngineeringElementDrilldownPopover
          state={popover}
          onMouseEnter={enterPopover}
          onMouseLeave={leavePopover}
          onTogglePinned={() => setPopover((current) => current ? { ...current, pinned: !current.pinned } : current)}
          onOpenDrilldown={onOpenDrilldown}
        />
      ) : null}
    </div>
  );
}

function EngineeringElementDrilldownPopover({
  state,
  onMouseEnter,
  onMouseLeave,
  onTogglePinned,
  onOpenDrilldown
}: {
  state: EngineeringElementPopoverState;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTogglePinned: () => void;
  onOpenDrilldown: (link: EngineeringDiagramLink) => void;
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
          <span>{engineeringKindLabel(state.element.kind)}</span>
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
          <EngineeringPopoverField label="技术角色" value={state.element.role} />
          <EngineeringPopoverField label="为什么出现" value={state.element.whyItExists} />
          <EngineeringPopoverField label="关系意义" value={state.element.relationshipMeaning} />
          <EngineeringPopoverField label="下钻意图" value={state.element.drilldownIntent} />
          <EngineeringPopoverField label="业务关联" value={state.element.businessRelevance} />
          <EngineeringPopoverField label="变更影响" value={state.element.changeImpact} />
          <EngineeringPopoverField label="置信度" value={state.element.confidence} />
        </dl>
        <EngineeringPopoverList title="证据" items={state.element.evidence} />
        <EngineeringPopoverList title="风险" items={state.element.risks} />
        <EngineeringPopoverList title="问题" items={state.element.questions} />
        {state.element.drilldowns.length ? (
          <>
            <strong className="engineering-element-popover-section-title">可下钻 UML</strong>
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
                  <span>{engineeringKindLabel(link.kind)}</span>
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

function documentCardReferenceFromTarget(target: EventTarget | null): EngineeringDocumentCardReference | null {
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
    kind: element.getAttribute("data-praxis-kind")?.trim() || "engineering_document",
    title,
    summary,
    docPath,
    htmlPath,
    status: element.getAttribute("data-praxis-status")?.trim() || undefined,
    confidence: element.getAttribute("data-praxis-confidence")?.trim() || undefined
  };
}

function EngineeringPopoverField({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EngineeringPopoverList({ title, items }: { title: string; items: string[] }) {
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

function attachEngineeringElementMetadata(
  rendered: HTMLElement,
  elements: EngineeringDiagramElement[],
  handlers: {
    onOpen: (element: EngineeringDiagramElement, target: Element) => void;
    onClose: () => void;
  }
) {
  if (!elements.length) return;
  const usedTargets = new Set<Element>();
  for (const element of elements) {
    const target = findMermaidSemanticElement(rendered, element, usedTargets);
    if (!target) continue;
    usedTargets.add(target);
    target.classList.add("engineering-uml-semantic-element");
    target.setAttribute("data-praxis-anchor", element.anchor);
    target.setAttribute("data-praxis-kind", `engineering_${element.kind}_element`);
    target.setAttribute("data-praxis-drilldowns", JSON.stringify(element.drilldowns));
    target.addEventListener("mouseenter", () => handlers.onOpen(element, target));
    target.addEventListener("focusin", () => handlers.onOpen(element, target));
    target.addEventListener("mouseleave", handlers.onClose);
    target.addEventListener("focusout", handlers.onClose);
  }
}

function findMermaidSemanticElement(
  rendered: HTMLElement,
  element: EngineeringDiagramElement,
  usedTargets: Set<Element>
): Element | null {
  const candidates = Array.from(rendered.querySelectorAll("svg g, svg .node, svg .cluster, svg .actor, svg .participant, svg .classGroup"));
  const normalizedMermaidId = normalizeSvgLookupText(element.mermaidId);
  const normalizedLabel = normalizeSvgLookupText(element.label);
  const byId = candidates.find((candidate) =>
    !usedTargets.has(candidate)
    && normalizeSvgLookupText(candidate.id || candidate.getAttribute("id") || "").includes(normalizedMermaidId)
  );
  if (byId) return closestUsefulSvgElement(byId);
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

function parseEngineeringModel(html: string): EngineeringComplexityModel | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.querySelector("#praxis-engineering-complexity-model")?.textContent?.trim();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as EngineeringComplexityModel;
    return value.schemaVersion === "praxis.engineeringComplexityModel.v1" ? value : null;
  } catch {
    return null;
  }
}

function parseEngineeringMapIndex(html: string): EngineeringMapIndex | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.querySelector("#praxis-engineering-map-index")?.textContent?.trim();
  if (raw) {
    try {
      const value = JSON.parse(raw) as EngineeringMapIndex;
      if (value.schemaVersion === "praxis.engineeringMapIndex.v1") return value;
    } catch {
      return fallbackEngineeringMapIndexFromDocument(doc);
    }
  }
  return fallbackEngineeringMapIndexFromDocument(doc);
}

function fallbackEngineeringMapIndexFromDocument(doc: Document): EngineeringMapIndex | null {
  const root = doc.querySelector("[data-praxis-drilldowns]");
  const links = parseEngineeringDrilldowns(root?.getAttribute("data-praxis-drilldowns") ?? null);
  if (!links.length) return null;
  const categories = engineeringCategorySpecs().flatMap((spec): EngineeringDiagramCategory[] => {
    const items = links
      .filter((link) => link.kind === spec.kind)
      .map((link): EngineeringDiagramDocument => ({
        id: link.id,
        kind: link.kind,
        title: link.title,
        summary: link.summary,
        docPath: link.docPath,
        htmlPath: link.htmlPath,
        anchor: link.anchor,
        status: "candidate",
        confidence: "high",
        drilldowns: []
      }));
    if (!items.length) return [];
    return [{
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      directory: spec.directory,
      mapDocPath: `${spec.directory}/${spec.mapFile}.md`,
      mapHtmlPath: `${spec.directory}/${spec.mapFile}.html`,
      summary: spec.summary,
      count: items.length,
      items
    }];
  });
  if (!categories.length) return null;
  const count = (kind: string) => categories.find((category) => category.kind === kind)?.items.length ?? 0;
  return {
    schemaVersion: "praxis.engineeringMapIndex.v1",
    generatedAt: new Date(0).toISOString(),
    projectVersion: documentText(doc, "项目版本") || "0.0.0",
    rootDocPath: "docs/engineering/engineering-maps.md",
    rootHtmlPath: root?.getAttribute("data-praxis-document-path")?.trim() || "docs/engineering/engineering-maps.html",
    summary: {
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      packageCount: count("package"),
      componentCount: count("component"),
      runtimeFlowCount: count("sequence"),
      deploymentNodeCount: count("deployment"),
      hotspotCount: count("technical_hotspot")
    },
    categories
  };
}

function engineeringCategorySpecs(): Array<{
  id: string;
  kind: string;
  title: string;
  directory: string;
  mapFile: string;
  summary: string;
}> {
  return [
    {
      id: "package",
      kind: "package",
      title: "Package Diagrams",
      directory: "docs/engineering/package-diagrams",
      mapFile: "package-diagrams-maps",
      summary: "模块、包和跨模块依赖边界。"
    },
    {
      id: "component",
      kind: "component",
      title: "Component Diagrams",
      directory: "docs/engineering/component-diagrams",
      mapFile: "component-diagrams-maps",
      summary: "关键组件、入口和协作对象。"
    },
    {
      id: "deployment",
      kind: "deployment",
      title: "Deployment Diagrams",
      directory: "docs/engineering/deployment-diagrams",
      mapFile: "deployment-diagrams-maps",
      summary: "运行、构建、部署节点和配置边界。"
    },
    {
      id: "class_structural",
      kind: "class_structural",
      title: "Class / Structural Diagrams",
      directory: "docs/engineering/class-structural-diagrams",
      mapFile: "class-structural-diagrams-maps",
      summary: "结构协作、类关系和模块内部承载。"
    },
    {
      id: "sequence",
      kind: "sequence",
      title: "Sequence Diagrams",
      directory: "docs/engineering/sequence-diagrams",
      mapFile: "sequence-diagrams-maps",
      summary: "动态调用、导入、引用和运行时协作路径。"
    },
    {
      id: "state_machine",
      kind: "state_machine",
      title: "State Machine Diagrams",
      directory: "docs/engineering/state-machine-diagrams",
      mapFile: "state-machine-diagrams-maps",
      summary: "关键技术状态和状态迁移。"
    },
    {
      id: "technical_hotspot",
      kind: "technical_hotspot",
      title: "Technical Hotspots",
      directory: "docs/engineering/technical-hotspots",
      mapFile: "technical-hotspots-maps",
      summary: "可能抬高阅读、修改、测试或回归成本的技术热点。"
    }
  ];
}

function documentText(doc: Document, label: string): string | undefined {
  const text = doc.body.textContent ?? "";
  const match = text.match(new RegExp(`${label}\\s*[:：]\\s*([^\\n\\r]+)`));
  return match?.[1]?.trim();
}

function parseEngineeringDiagramDocumentPayload(html: string): EngineeringDiagramDocumentPayload | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.querySelector("#praxis-engineering-diagram-document")?.textContent?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    return {
      id: stringField(record.id) ?? "",
      kind: stringField(record.kind) ?? "",
      title: stringField(record.title) ?? "",
      anchor: stringField(record.anchor) ?? "",
      elements: parseEngineeringElements(record.elements)
    };
  } catch {
    return null;
  }
}

function parseEngineeringElements(value: unknown): EngineeringDiagramElement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EngineeringDiagramElement[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = stringField(record.id);
    const mermaidId = stringField(record.mermaidId);
    const label = stringField(record.label);
    if (!id || !mermaidId || !label) return [];
    return [{
      id,
      mermaidId,
      label,
      kind: stringField(record.kind) ?? "unknown",
      anchor: stringField(record.anchor) ?? id,
      summary: stringField(record.summary) ?? "",
      role: stringField(record.role) ?? "",
      whyItExists: stringField(record.whyItExists) ?? "",
      relationshipMeaning: stringField(record.relationshipMeaning) ?? "",
      drilldownIntent: stringField(record.drilldownIntent) ?? "",
      businessRelevance: stringField(record.businessRelevance) ?? "",
      changeImpact: stringField(record.changeImpact) ?? "",
      evidence: stringArrayField(record.evidence),
      risks: stringArrayField(record.risks),
      questions: stringArrayField(record.questions),
      confidence: stringField(record.confidence) ?? "",
      drilldowns: parseEngineeringDrilldownsFromUnknown(record.drilldowns)
    }];
  });
}

function parseEngineeringDrilldowns(value: string | null): EngineeringDiagramLink[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return parseEngineeringDrilldownsFromUnknown(parsed);
  } catch {
    return [];
  }
}

function parseEngineeringDrilldownsFromUnknown(value: unknown): EngineeringDiagramLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EngineeringDiagramLink[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = stringField(record.id);
    const title = stringField(record.title);
    const htmlPath = stringField(record.htmlPath);
    const docPath = stringField(record.docPath);
    if (!id || !title || !htmlPath || !docPath) return [];
    return [{
      id,
      kind: stringField(record.kind) || "unknown",
      title,
      summary: stringField(record.summary) || "",
      docPath,
      htmlPath,
      anchor: stringField(record.anchor) || id,
      relation: stringField(record.relation),
      reason: stringField(record.reason)
    }];
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function htmlPathForSemanticDocument(pathValue: string): string {
  return pathValue.endsWith(".md") ? pathValue.replace(/\.md$/i, ".html") : pathValue;
}

function markdownPathForSemanticDocument(pathValue: string): string {
  return pathValue.endsWith(".html") ? pathValue.replace(/\.html$/i, ".md") : pathValue;
}

function isEngineeringRootDocumentPath(pathValue: string): boolean {
  return pathValue === "docs/engineering/engineering-maps.html"
    || pathValue === "docs/engineering/engineering-maps.md"
    || pathValue === "docs/engineering/technical-complexity-maps.html"
    || pathValue === "docs/engineering/technical-complexity-maps.md";
}

function formatEngineeringDiscussionResult(result: RuntimeEngineeringDiagramDiscussionResult): string {
  const parts = [
    result.answer,
    result.guidance,
    result.technicalPerspective ? `Technical perspective: ${result.technicalPerspective}` : "",
    formatEngineeringNamedList("Anchors", result.referencedAnchors),
    formatEngineeringNamedList("Drilldowns", result.suggestedDrilldowns),
    formatEngineeringDocumentEditResults(result.documentEdits),
    formatEngineeringNamedList("Risks", result.risks),
    formatEngineeringNamedList("Questions", result.questions)
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function formatEngineeringDocumentEditResults(values: RuntimeDiagramDocumentEditResult[] | undefined): string {
  if (!values?.length) return "";
  return [
    "Document edits:",
    ...values.map((item) => {
      const state = item.changed ? `${item.status}, changed` : item.status;
      return `- ${item.path} (${item.operation}, ${state}): ${item.message}${item.reason ? ` · ${item.reason}` : ""}`;
    })
  ].join("\n");
}

function formatEngineeringNamedList(title: string, values: string[]): string {
  return values.length ? `${title}:\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

function engineeringKindLabel(kind: string): string {
  if (kind === "package") return "Package";
  if (kind === "component") return "Component";
  if (kind === "deployment") return "Deployment";
  if (kind === "class_structural") return "Class";
  if (kind === "sequence") return "Sequence";
  if (kind === "state_machine") return "State";
  if (kind === "technical_hotspot") return "Hotspot";
  return kind;
}

function buildEngineeringChangelog(
  markdown: string,
  model: EngineeringComplexityModel | null,
  mapIndex: EngineeringMapIndex | null
): EngineeringChangelogEntry[] {
  const entries: EngineeringChangelogEntry[] = [];
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
    const raw = detailLines.join("\n");
    const summary = detailLines.find((line) => line.trim().startsWith("- "))?.replace(/^\s*-\s*/, "").trim() || "Engineering map update.";
    const gitBranch = raw.match(/^Git 分支[:：]\s*(.+)$/m)?.[1]?.trim();
    const gitCommit = raw.match(/^Git 提交[:：]\s*(.+)$/m)?.[1]?.trim();
    entries.push({
      id: `engineering-changelog:${entries.length}:${match[1]}:${match[2]}`,
      title: "Engineering map update",
      version: match[1].trim(),
      date: match[2].trim(),
      summary,
      git: [gitCommit, gitBranch].filter(Boolean).join(" / ")
    });
    index = cursor - 1;
  }
  if (entries.length) return entries;
  if (mapIndex) {
    return [{
      id: "engineering-changelog:index",
      title: "Engineering maps snapshot",
      version: mapIndex.projectVersion,
      date: mapIndex.generatedAt,
      summary: `Recovered ${mapIndex.categories.reduce((sum, category) => sum + category.count, 0)} engineering diagram document(s) across ${mapIndex.categories.length} categories.`,
      git: [mapIndex.git?.shortCommit, mapIndex.git?.branch, mapIndex.git?.dirty ? "dirty" : "clean"].filter(Boolean).join(" / ")
    }];
  }
  if (!model) return [];
  return [{
    id: "engineering-changelog:model",
    title: "Engineering complexity snapshot",
    version: model.projectVersion,
    date: model.generatedAt,
    summary: `Recovered ${model.summary.packageCount} modules, ${model.summary.componentCount} components, ${model.summary.runtimeFlowCount} runtime flows and ${model.summary.hotspotCount} hotspots.`,
    git: [model.git?.shortCommit, model.git?.branch, model.git?.dirty ? "dirty" : "clean"].filter(Boolean).join(" / ")
  }];
}

function markdownToFallbackEngineeringHtml(markdown: string): string {
  return [
    "<main class=\"praxis-engineering-map\">",
    "<section class=\"semantic-layer\">",
    "<h1>技术复杂度地图</h1>",
    `<pre>${escapeHtml(markdown)}</pre>`,
    "</section>",
    "</main>"
  ].join("\n");
}

function engineeringDocumentStatusLabel(
  state: EngineeringDocumentState,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): string {
  if (state === "loading") return t("engineering.statusLoading");
  if (state === "ready") return t("engineering.statusReady");
  if (state === "missing") return t("engineering.statusMissing");
  if (state === "generating") return t("engineering.statusGenerating");
  if (state === "error") return t("engineering.statusError");
  return t("engineering.statusIdle");
}

function sanitizeSemanticHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script:not(#praxis-engineering-complexity-model), iframe, object, embed, link, meta").forEach((element) => element.remove());
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
