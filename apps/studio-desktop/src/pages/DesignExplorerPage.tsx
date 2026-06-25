import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { type TranslationKey, useI18n } from "../i18n";
import { AgentConversationPanel, type AgentConversationEvent } from "../chat/AgentConversationPanel";
import { ScopedAgentPanel, type ScopedAgentSubmitResult } from "../chat/ScopedAgentPanel";
import { CodeEvidencePreview } from "../components/CodeEvidencePreview";
import { renderSemanticMermaidBlocks, useUmlFullscreenViewer } from "../components/SemanticMermaidRenderer";
import { normalizeInternalTermsInHtmlDocument } from "../components/userFacingText";
import {
  designUseCaseHtmlRelativePath,
  discussDesignDiagram,
  openProjectFileWith,
  runDesignDiscoveryWithProgress,
  readProjectFile,
  readDesignMapMarkdown,
  readDesignSemanticHtml,
  readDesignUseCaseSemanticHtml,
  readProjectedGraphViews,
  refreshDesignViews,
  submitDesignStoryIntake,
  type RuntimeDesignAffectedDocument,
  type RuntimeDesignCurrentUmlContext,
  type RuntimeDesignDiagramDiscussionResult,
  type RuntimeDiagramDocumentEditResult,
  type RuntimeDesignDiscoveryProgress,
  type RuntimeDesignStoryIntakeResult,
  type ProjectFileOpener,
  type RuntimeProjectionViewsResult,
  type RuntimeProjectedGraphNode,
  type RuntimeProjectedGraphViewRecord,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";

interface DesignExplorerPageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  onOpenEngineeringViews: () => void;
}

const designViewKinds = new Set([
  "design_use_case_list",
  "design_use_case",
  "design_activity",
  "design_sequence",
  "design_state_machine",
  "design_class_collaboration",
  "design_interaction_overview",
  "design_communication",
  "design_timing",
  "design_object_snapshot",
  "design_composite_structure",
  "design_pattern_map"
]);

const designDrilldownGraphKinds = new Set([
  "design_activity",
  "design_sequence",
  "design_state_machine",
  "design_class_collaboration",
  "design_interaction_overview",
  "design_communication",
  "design_timing",
  "design_object_snapshot",
  "design_composite_structure"
]);

interface SemanticHtmlSelection {
  anchor: string;
  kind?: string;
  layer?: string;
  status?: string;
  confidence?: string;
  elementId?: string;
}

interface UseCaseDiagramItem {
  id: string;
  title: string;
  summary: string;
  status: string;
  confidence?: string;
  contextId?: string;
  contextTitle?: string;
  evidenceCount: number;
  questionCount: number;
  nodeCount: number;
  edgeCount: number;
  node: RuntimeProjectedGraphNode;
  viewRecord?: RuntimeProjectedGraphViewRecord;
  drilldownNodes: RuntimeProjectedGraphNode[];
}

interface UseCaseUmlTreeNode {
  id: string;
  kind: "use_case_diagram" | "activity" | "sequence" | "state_machine" | "class_collaboration" | string;
  title: string;
  summary?: string;
  coverage?: UseCaseUmlCoverage;
  htmlPath: string;
  status?: string;
  confidence?: string;
  root?: boolean;
}

interface UseCaseUmlCoverage {
  scenario: string;
  coveredUseCaseFlows: string[];
  boundary: string;
  notCovered: string[];
  rationale: string;
  implementationScope?: UseCaseImplementationScope;
}

interface UseCaseImplementationScope {
  modules: string[];
  entryPoints: string[];
  keyFiles: string[];
  codeAnchors: string[];
  outOfScopeCode: string[];
}

interface ImplementationScopeLink {
  id: string;
  label: string;
  raw: string;
  relativePath: string;
  line?: number;
}

interface ImplementationScopeLinkSet {
  links: ImplementationScopeLink[];
  hiddenInternalCount: number;
}

type DesignMetricProbeKind = "nodes" | "edges" | "evidence" | "questions";

interface DesignMetricProbeItem {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  excerpt?: string;
  anchor?: string;
}

interface DesignMetricProbe {
  kind: DesignMetricProbeKind;
  label: string;
  value: number;
  boundary?: string;
  items: DesignMetricProbeItem[];
}

interface DesignChangelogEntry {
  id: string;
  title: string;
  summary: string;
  version: string;
  date: string;
  changeType?: string;
  gitBranch?: string;
  gitCommit?: string;
  gitTreeState?: string;
  commitSummary?: string;
  atomicCommitScope?: string;
  scope: "map" | "use_case" | "metadata";
}

type DesignDocumentState = "idle" | "loading" | "ready" | "missing" | "generating" | "error";

export function DesignExplorerPage({ projectRoot }: DesignExplorerPageProps) {
  const { t } = useI18n();
  const [records, setRecords] = useState<RuntimeProjectedGraphViewRecord[]>([]);
  const [skippedPaths, setSkippedPaths] = useState<string[]>([]);
  const [semanticHtml, setSemanticHtml] = useState("");
  const [designMarkdown, setDesignMarkdown] = useState("");
  const [selectedSemanticAnchor, setSelectedSemanticAnchor] = useState<SemanticHtmlSelection | null>(null);
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string | null>(null);
  const [selectedUseCaseHtml, setSelectedUseCaseHtml] = useState("");
  const [selectedUseCaseHtmlPath, setSelectedUseCaseHtmlPath] = useState("");
  const [selectedUseCaseHtmlLoading, setSelectedUseCaseHtmlLoading] = useState(false);
  const [documentState, setDocumentState] = useState<DesignDocumentState>(projectRoot ? "loading" : "idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [generationProgress, setGenerationProgress] = useState<RuntimeDesignDiscoveryProgress | null>(null);

  useEffect(() => {
    if (projectRoot) {
      void loadDesignViews(projectRoot);
      return;
    }
    setRecords([]);
    setSkippedPaths([]);
    setSemanticHtml("");
    setDesignMarkdown("");
    setSelectedSemanticAnchor(null);
    setSelectedUseCaseId(null);
    setSelectedUseCaseHtml("");
    setSelectedUseCaseHtmlPath("");
    setSelectedUseCaseHtmlLoading(false);
    setDocumentState("idle");
    setStatus("");
    setError("");
    setGenerationProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);

  const designRecords = useMemo(
    () => records.filter((record) => designViewKinds.has(record.view.kind)),
    [records]
  );
  const useCaseListRecord = useMemo(
    () => designRecords.find((record) => record.view.kind === "design_use_case_list"),
    [designRecords]
  );
  const useCaseContextRecords = useMemo(
    () => designRecords.filter((record) => record.view.kind === "design_use_case"),
    [designRecords]
  );
  const useCaseItems = useMemo(
    () => buildUseCaseDiagramItems(useCaseListRecord, useCaseContextRecords, semanticHtml, designMarkdown),
    [designMarkdown, semanticHtml, useCaseListRecord, useCaseContextRecords]
  );
  const selectedUseCase = useMemo(
    () => useCaseItems.find((item) => item.id === selectedUseCaseId) ?? null,
    [selectedUseCaseId, useCaseItems]
  );
  const [activeUmlNodeId, setActiveUmlNodeId] = useState("");
  const [activeUmlHtml, setActiveUmlHtml] = useState("");
  const [activeUmlPath, setActiveUmlPath] = useState("");
  const [activeUmlLoading, setActiveUmlLoading] = useState(false);
  const [activeUmlError, setActiveUmlError] = useState("");
  const [activeUmlLiveUpdating, setActiveUmlLiveUpdating] = useState(false);
  const [activeUmlLiveUpdatedAt, setActiveUmlLiveUpdatedAt] = useState("");
  const activeUmlHtmlRef = useRef("");
  const selectedUseCaseUmlTreeNodes = useMemo(
    () => selectedUseCase ? buildUseCaseUmlTree(selectedUseCase, selectedUseCaseHtmlPath, selectedUseCaseHtml) : [],
    [selectedUseCase, selectedUseCaseHtml, selectedUseCaseHtmlPath]
  );
  const activeUmlNode = useMemo(
    () => selectedUseCaseUmlTreeNodes.find((node) => node.id === activeUmlNodeId) ?? selectedUseCaseUmlTreeNodes[0],
    [activeUmlNodeId, selectedUseCaseUmlTreeNodes]
  );
  const changelogEntries = useMemo(
    () => buildDesignChangelogEntries(designMarkdown, semanticHtml),
    [designMarkdown, semanticHtml]
  );
  const docsBackedDrilldownCounts = useMemo(
    () => countDesignDrilldownsFromDocs(semanticHtml),
    [semanticHtml]
  );
  useEffect(() => {
    if (selectedUseCaseId && !selectedUseCase) setSelectedUseCaseId(null);
  }, [selectedUseCaseId, selectedUseCase]);
  useEffect(() => {
    if (!selectedUseCase) {
      setActiveUmlNodeId("");
      setActiveUmlHtml("");
      setActiveUmlPath("");
      setActiveUmlError("");
      setActiveUmlLoading(false);
      return;
    }
    setActiveUmlNodeId(`${selectedUseCase.id}:use-case-diagram`);
    setActiveUmlHtml(selectedUseCaseHtml);
    setActiveUmlPath(selectedUseCaseHtmlPath);
    setActiveUmlError("");
    setActiveUmlLoading(false);
  }, [selectedUseCase?.id, selectedUseCaseHtml, selectedUseCaseHtmlPath]);
  useEffect(() => {
    let active = true;
    async function loadActiveUmlNode() {
      if (!projectRoot || !selectedUseCase || !activeUmlNode) return;
      setActiveUmlPath(activeUmlNode.htmlPath);
      setActiveUmlError("");
      if (activeUmlNode.root) {
        setActiveUmlHtml(selectedUseCaseHtml);
        setActiveUmlLoading(false);
        return;
      }
      setActiveUmlLoading(true);
      try {
        const candidates = useCaseUmlHtmlPathCandidates(selectedUseCase.id, activeUmlNode);
        let loaded: { path: string; content: string } | undefined;
        for (const candidate of candidates) {
          try {
            loaded = { path: candidate, content: await readProjectFile(projectRoot, candidate) };
            break;
          } catch {
            // Try the next deterministic path candidate. Older projections used a different drilldown slug.
          }
        }
        if (!loaded) throw new Error(`UML document not found: ${candidates.join(" | ")}`);
        if (active) {
          setActiveUmlPath(loaded.path);
          setActiveUmlHtml(loaded.content);
        }
      } catch (error) {
        if (active) {
          setActiveUmlHtml("");
          setActiveUmlError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (active) setActiveUmlLoading(false);
      }
    }
    void loadActiveUmlNode();
    return () => {
      active = false;
    };
  }, [activeUmlNode, projectRoot, selectedUseCase, selectedUseCaseHtml]);
  useEffect(() => {
    activeUmlHtmlRef.current = activeUmlHtml;
  }, [activeUmlHtml]);
  useEffect(() => {
    if (!projectRoot || !selectedUseCase || !activeUmlPath || documentState !== "ready") return undefined;
    let disposed = false;
    let polling = false;
    const interval = window.setInterval(() => {
      if (polling || disposed || activeUmlLoading) return;
      polling = true;
      void readProjectFile(projectRoot, activeUmlPath)
        .then((content) => {
          if (disposed || !content.trim() || content === activeUmlHtmlRef.current) return;
          activeUmlHtmlRef.current = content;
          setActiveUmlHtml(content);
          if (activeUmlNode?.root) setSelectedUseCaseHtml(content);
          setActiveUmlLiveUpdating(true);
          setActiveUmlLiveUpdatedAt(new Date().toLocaleTimeString());
          window.setTimeout(() => {
            if (!disposed) setActiveUmlLiveUpdating(false);
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
  }, [activeUmlLoading, activeUmlNode?.root, activeUmlPath, documentState, projectRoot, selectedUseCase]);

  async function refreshActiveUmlDocument() {
    if (!projectRoot || !selectedUseCase || !activeUmlPath) return;
    try {
      const content = await readProjectFile(projectRoot, activeUmlPath);
      if (!content.trim()) return;
      activeUmlHtmlRef.current = content;
      setActiveUmlHtml(content);
      if (activeUmlNode?.root) setSelectedUseCaseHtml(content);
      setActiveUmlLiveUpdating(true);
      setActiveUmlLiveUpdatedAt(new Date().toLocaleTimeString());
      window.setTimeout(() => setActiveUmlLiveUpdating(false), 900);
    } catch {
      // The polling loop will surface durable file-read failures if the active document disappears.
    }
  }

  useEffect(() => {
    let active = true;
    async function loadSelectedUseCaseHtml() {
      if (!projectRoot || !selectedUseCaseId) {
        setSelectedUseCaseHtml("");
        setSelectedUseCaseHtmlPath("");
        setSelectedUseCaseHtmlLoading(false);
        return;
      }
      const htmlPath = designUseCaseHtmlRelativePath(selectedUseCaseId);
      setSelectedUseCaseHtmlPath(htmlPath);
      setSelectedUseCaseHtmlLoading(true);
      const fallbackHtml = extractUseCaseSectionHtml(semanticHtml, selectedUseCaseId);
      try {
        const html = await readDesignUseCaseSemanticHtml(projectRoot, selectedUseCaseId);
        if (active) setSelectedUseCaseHtml(html?.trim() ? html : fallbackHtml ?? "");
      } catch {
        if (active) setSelectedUseCaseHtml(fallbackHtml ?? "");
      } finally {
        if (active) setSelectedUseCaseHtmlLoading(false);
      }
    }
    void loadSelectedUseCaseHtml();
    return () => {
      active = false;
    };
  }, [projectRoot, selectedUseCaseId, semanticHtml]);
  const designNodeRecords = useCaseContextRecords.flatMap((record) => record.view.nodes);
  const projectedSequenceCount = designNodeRecords.filter((node) => node.kind === "design_sequence").length;
  const projectedClassCollaborationCount = designNodeRecords.filter((node) => node.kind === "design_class_collaboration").length;
  const projectedStateMachineCount = designNodeRecords.filter((node) => node.kind === "design_state_machine").length;
  const sequenceCount = projectedSequenceCount || docsBackedDrilldownCounts.sequence;
  const classCollaborationCount = projectedClassCollaborationCount || docsBackedDrilldownCounts.classCollaboration;
  const stateMachineCount = projectedStateMachineCount || docsBackedDrilldownCounts.stateMachine;
  const isBusy = documentState === "loading" || documentState === "generating";
  const isReady = documentState === "ready" && Boolean(semanticHtml);

  async function loadDesignViews(root = projectRoot) {
    if (!root) return;
    setDocumentState("loading");
    setStatus(t("design.loading"));
    setError("");
    setGenerationProgress(null);
    try {
      let html = await readDesignSemanticHtml(root);
      let markdown = await readDesignMapMarkdown(root);
      let result = await readProjectedGraphViews(root);

      if (!html) {
        if (markdown?.trim()) {
          result = await refreshDesignViews(root);
          html = await readDesignSemanticHtml(root);
          markdown = await readDesignMapMarkdown(root);
        }
      } else if (!hasDesignRecords(result)) {
        const refreshed = await refreshDesignViews(root).catch(() => undefined);
        if (refreshed) result = refreshed;
      }

      setRecords(result.records);
      setSkippedPaths(result.skippedPaths);
      setSemanticHtml(html ?? "");
      setDesignMarkdown(markdown ?? "");
      setSelectedSemanticAnchor(null);
      setSelectedUseCaseId(null);
      setSelectedUseCaseHtml("");
      setSelectedUseCaseHtmlPath("");
      setSelectedUseCaseHtmlLoading(false);
      setDocumentState(html?.trim() ? "ready" : "missing");
      setStatus("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setDocumentState("error");
      setStatus("");
    }
  }

  async function generateDesignDocuments(root = projectRoot) {
    if (!root) return;
    setDocumentState("generating");
    setStatus(t("design.discovering"));
    setError("");
    setGenerationProgress(null);
    try {
      const result = await runDesignDiscoveryWithProgress(root, setGenerationProgress);
      setRecords(result.records);
      setSkippedPaths(result.skippedPaths);
      const html = await readDesignSemanticHtml(root);
      const markdown = await readDesignMapMarkdown(root);
      setSemanticHtml(html ?? "");
      setDesignMarkdown(markdown ?? "");
      setSelectedSemanticAnchor(null);
      setSelectedUseCaseId(null);
      setSelectedUseCaseHtml("");
      setSelectedUseCaseHtmlPath("");
      setSelectedUseCaseHtmlLoading(false);
      setDocumentState(html?.trim() ? "ready" : "missing");
      setStatus("");
    } catch (loadError) {
      setError(formatDesignGenerationError(loadError));
      setDocumentState("error");
      setStatus("");
    }
  }

  function selectSemanticAnchor(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const element = target.closest("[data-praxis-anchor]");
    if (!element) {
      setSelectedSemanticAnchor(null);
      return;
    }
    const anchor = element.getAttribute("data-praxis-anchor");
    if (!anchor) return;
    setSelectedSemanticAnchor({
      anchor,
      kind: element.getAttribute("data-praxis-kind") ?? undefined,
      layer: element.getAttribute("data-praxis-layer") ?? undefined,
      status: element.getAttribute("data-praxis-status") ?? undefined,
      confidence: element.getAttribute("data-praxis-confidence") ?? undefined,
      elementId: element.id || undefined
    });
  }

  return (
    <section className="design-explorer-layout" aria-labelledby="design-title">
      <header className="design-explorer-header">
        <p className="eyebrow">{t("design.eyebrow")}</p>
        <h1 id="design-title">{t("design.title")}</h1>
        <p>{t("design.copy")}</p>
        {error ? <p className="error-text">{error}</p> : null}
      </header>

      {!projectRoot ? (
        <DesignGenerateState
          title={t("design.noProjectTitle")}
          copy={t("design.noProjectCopy")}
        />
      ) : null}

      {projectRoot && (documentState === "missing" || documentState === "error") ? (
        <DesignGenerateState
          title={t("design.generateMissingTitle")}
          copy={t("design.generateMissingCopy")}
          actionLabel={status || t("design.generateDocuments")}
          disabled={isBusy}
          onAction={() => void generateDesignDocuments()}
        />
      ) : null}

      {projectRoot && documentState === "loading" ? (
        <DesignGenerateState title={t("design.loadingTitle")} copy={status || t("design.loading")} />
      ) : null}

      {projectRoot && documentState === "generating" ? (
        <DesignGenerationWorkspace
          title={t("design.generatingTitle")}
          copy={status || t("design.discovering")}
          progress={generationProgress}
        />
      ) : null}

      {isReady ? (
        <div className="design-explorer-workspace">
          <DesignChangelogTimeline entries={changelogEntries} />
          <main className="design-main-column">
            <section className="design-summary-grid">
              <DesignMetric label={t("design.useCaseDiagrams")} value={useCaseItems.length} />
              <DesignMetric label={t("design.sequenceDiagrams")} value={sequenceCount} />
              <DesignMetric label={t("design.classCollaborations")} value={classCollaborationCount} />
              <DesignMetric label={t("design.patternMaps")} value={stateMachineCount} />
            </section>

            {selectedUseCase ? (
              <DesignUseCaseDetail
                projectRoot={projectRoot}
                item={selectedUseCase}
                html={selectedUseCaseHtml}
                htmlLoading={selectedUseCaseHtmlLoading}
                activeUmlNode={activeUmlNode}
                activeUmlHtml={activeUmlHtml}
                activeUmlPath={activeUmlPath}
                activeUmlLoading={activeUmlLoading}
                activeUmlError={activeUmlError}
                activeUmlLiveUpdating={activeUmlLiveUpdating}
                activeUmlLiveUpdatedAt={activeUmlLiveUpdatedAt}
                selectedAnchor={selectedSemanticAnchor}
                onBack={() => {
                  setSelectedUseCaseId(null);
                  setSelectedSemanticAnchor(null);
                }}
                onSelectAnchor={selectSemanticAnchor}
              />
            ) : (
              <DesignUseCaseList
                items={useCaseItems}
                projectedViewCount={designRecords.length}
                skippedPaths={skippedPaths}
                onOpenUseCase={(id) => {
                  setSelectedUseCaseId(id);
                  setSelectedSemanticAnchor(null);
                }}
              />
            )}
          </main>
          <DesignExplorerSidePanel
            projectRoot={projectRoot}
            selectedUseCase={selectedUseCase}
            selectedAnchor={selectedSemanticAnchor}
            umlTreeNodes={selectedUseCaseUmlTreeNodes}
            activeUmlNode={activeUmlNode}
            activeUmlNodeId={activeUmlNode?.id ?? ""}
            onSelectUmlNode={setActiveUmlNodeId}
            onStoryUpdated={() => void loadDesignViews(projectRoot)}
            onDiagramUpdated={() => void refreshActiveUmlDocument()}
          />
        </div>
      ) : null}

      <footer className="design-status-bar" aria-label={t("design.statusBar")}>
        <span>{t("design.statusProject")}: {projectRoot || t("design.noProjectStatus")}</span>
        <span>{t("design.statusDocs")}: {designDocumentStatusLabel(documentState, t)}</span>
      </footer>
    </section>
  );
}

function DesignGenerateState({
  title,
  copy,
  actionLabel,
  disabled,
  onAction,
  progress
}: {
  title: string;
  copy: string;
  actionLabel?: string;
  disabled?: boolean;
  onAction?: () => void;
  progress?: RuntimeDesignDiscoveryProgress | null;
}) {
  const { t } = useI18n();
  const events = useMemo(() => designProgressConversationEvents(progress), [progress]);
  return (
    <section className="design-generate-state">
      <div className="design-generate-card">
        <strong>{title}</strong>
        <p>{copy}</p>
        {progress ? (
          <AgentConversationPanel
            title={t("design.generationThinking")}
            events={events}
            compact
            className="design-generation-conversation"
            emptyTitle={progress.title}
            emptyCopy={progress.detail}
          />
        ) : null}
        {onAction && actionLabel ? (
          <button className="primary-action" type="button" disabled={disabled} onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DesignGenerationWorkspace({
  title,
  copy,
  progress
}: {
  title: string;
  copy: string;
  progress?: RuntimeDesignDiscoveryProgress | null;
}) {
  const { t } = useI18n();
  const events = useMemo(() => designProgressConversationEvents(progress), [progress]);
  const generatedFiles = useMemo(() => designProgressGeneratedFiles(progress), [progress]);
  const activeStep = progress?.steps.find((step) => step.status === "running")
    ?? progress?.steps.find((step) => step.status === "failed")
    ?? progress?.steps.find((step) => step.status === "pending")
    ?? progress?.steps[progress.steps.length - 1];

  return (
    <section className="design-generation-workspace" aria-label={t("design.generationWorkspace")}>
      <aside className="panel design-generation-sidebar">
        <div className="design-generation-heading">
          <span className="eyebrow">{t("design.generationStatus")}</span>
          <strong>{title}</strong>
          <p>{copy}</p>
          {activeStep ? (
            <div className="design-generation-active-step">
              <span>{activeStep.status}</span>
              <strong>{activeStep.title}</strong>
              <p>{progress?.detail || activeStep.detail}</p>
            </div>
          ) : null}
        </div>
        <ol className="design-generation-step-list">
          {(progress?.steps ?? []).map((step) => (
            <li className={`design-generation-step ${step.status}`} key={step.id}>
              <span>{step.status}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      <main className="panel design-generation-main">
        <div className="panel-heading">
          <div>
            <h2>{t("design.generationThinking")}</h2>
            <p className="muted-copy">{t("design.generationThinkingCopy")}</p>
          </div>
          <span className="pill">{progress?.status ?? "pending"}</span>
        </div>
        <AgentConversationPanel
          events={events}
          className="design-generation-conversation"
          emptyTitle={progress?.title ?? title}
          emptyCopy={progress?.detail ?? copy}
        />
      </main>

      <aside className="panel design-generation-files">
        <div className="panel-heading">
          <div>
            <h2>{t("design.generatedFilesTitle")}</h2>
            <p className="muted-copy">{t("design.generatedFilesCopy")}</p>
          </div>
          <span className="pill">{generatedFiles.length}</span>
        </div>
        {generatedFiles.length ? (
          <ol>
            {generatedFiles.map((file) => (
              <li key={`${file.path}:${file.timestamp ?? ""}`}>
                <span>{file.status || "done"}</span>
                <code title={file.path}>{file.path}</code>
                {file.title ? <small>{file.title}</small> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="design-generation-files-empty">{t("design.generatedFilesEmpty")}</div>
        )}
      </aside>
    </section>
  );
}

function DesignChangelogTimeline({ entries }: { entries: DesignChangelogEntry[] }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className="panel design-changelog-panel" aria-label={t("design.changelogTitle")}>
      <div className="design-changelog-heading">
        <div>
          <h2>{t("design.changelogTitle")}</h2>
          <p className="muted-copy">{t("design.changelogCopy")}</p>
        </div>
        <button className="secondary-action compact-action" type="button" onClick={() => setCollapsed((current) => !current)}>
          {collapsed ? t("design.expand") : t("design.collapse")}
        </button>
      </div>
      {!collapsed ? (
        entries.length ? (
          <ol className="design-changelog-list">
            {entries.map((entry, index) => (
              <li className="design-changelog-entry" key={entry.id}>
                <details open={index === 0}>
                  <summary>
                    <span>{entry.title}</span>
                    <small>{entry.date || t("design.timelineUnknownDate")}</small>
                  </summary>
                  <dl>
                    <div>
                      <dt>{t("design.programVersion")}</dt>
                      <dd>{entry.version || "-"}</dd>
                    </div>
                    <div>
                      <dt>{t("design.gitVersion")}</dt>
                      <dd>{formatGitVersion(entry)}</dd>
                    </div>
                    <div>
                      <dt>{t("design.changeType")}</dt>
                      <dd>{entry.changeType ?? entry.scope}</dd>
                    </div>
                    {entry.commitSummary ? (
                      <div>
                        <dt>{t("design.commitSummary")}</dt>
                        <dd>{entry.commitSummary}</dd>
                      </div>
                    ) : null}
                    {entry.atomicCommitScope ? (
                      <div>
                        <dt>{t("design.atomicScope")}</dt>
                        <dd>{entry.atomicCommitScope}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <p>{entry.summary}</p>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <div className="design-changelog-empty">{t("design.changelogEmpty")}</div>
        )
      ) : null}
    </aside>
  );
}

function designProgressConversationEvents(progress: RuntimeDesignDiscoveryProgress | null | undefined): AgentConversationEvent[] {
  if (!progress) return [];
  if (progress.events?.length) {
    return progress.events.map((event, index) => ({
      id: event.id || `design-progress-event-${index}`,
      kind: designConversationKind(event.kind),
      role: event.kind === "assistant_message" ? "assistant" : "runtime",
      title: event.title,
      content: event.content ?? event.detail,
      detail: event.detail,
      status: progressEventStatus(progress, event.stage, event.status),
      timestamp: event.timestamp,
      command: event.command,
      path: event.path,
      metadata: Array.isArray(event.metadata) ? event.metadata : undefined
    }));
  }
  return progress.steps.map((step) => ({
    id: `design-progress-step-${step.id}`,
    kind: "runtime_event",
    role: "runtime",
    title: step.title,
    content: step.detail,
    status: normalizeConversationStatus(step.status),
    timestamp: progress.updatedAt
  }));
}

interface DesignGeneratedFile {
  path: string;
  title?: string;
  status?: string;
  timestamp?: string;
}

function designProgressGeneratedFiles(progress: RuntimeDesignDiscoveryProgress | null | undefined): DesignGeneratedFile[] {
  if (!progress?.events?.length) return [];
  const files: DesignGeneratedFile[] = [];
  const seen = new Set<string>();
  for (const event of progress.events) {
    if (event.kind !== "file_edit") continue;
    const paths = [
      event.path,
      ...(Array.isArray(event.metadata) ? event.metadata.filter(isDesignGeneratedFilePath) : [])
    ].filter((path): path is string => Boolean(path && isDesignGeneratedFilePath(path)));
    for (const filePath of paths) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      files.push({
        path: filePath,
        title: event.title,
        status: event.status,
        timestamp: event.timestamp
      });
    }
  }
  return files;
}

function isDesignGeneratedFilePath(value: string | undefined): value is string {
  if (!value) return false;
  if (value.includes("*") || value.includes("<") || value.includes(">")) return false;
  return value.startsWith("docs/design/")
    || value.startsWith(".distinction/cache/")
    || value.startsWith(".distinction/views/")
    || value.startsWith(".distinction/runtime/");
}

function progressEventStatus(
  progress: RuntimeDesignDiscoveryProgress,
  stage: string | undefined,
  eventStatus: string | undefined
): AgentConversationEvent["status"] {
  const stepStatus = stage ? progress.steps.find((step) => step.id === stage)?.status : undefined;
  if (stepStatus) return normalizeConversationStatus(stepStatus);
  if (progress.status === "complete" && eventStatus === "running") return "done";
  return normalizeConversationStatus(eventStatus);
}

function designConversationKind(value: string | undefined): AgentConversationEvent["kind"] {
  if (
    value === "user_message" ||
    value === "assistant_message" ||
    value === "runtime_event" ||
    value === "tool_call" ||
    value === "command_run" ||
    value === "file_read" ||
    value === "file_edit" ||
    value === "validation" ||
    value === "permission" ||
    value === "plan" ||
    value === "final_summary" ||
    value === "error"
  ) {
    return value;
  }
  return "runtime_event";
}

function normalizeConversationStatus(value: string | undefined): AgentConversationEvent["status"] {
  if (value === "success" || value === "complete") return "done";
  if (value === "running" || value === "failed" || value === "pending" || value === "cancelled" || value === "done") return value;
  return value;
}

function DesignUseCaseList({
  items,
  projectedViewCount,
  skippedPaths,
  onOpenUseCase
}: {
  items: UseCaseDiagramItem[];
  projectedViewCount: number;
  skippedPaths: string[];
  onOpenUseCase: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="panel design-list-panel">
      <div className="panel-heading">
        <div>
          <h2>{t("design.useCaseListTitle")}</h2>
          <p className="muted-copy">{t("design.useCaseListCopy")}</p>
        </div>
        <span className="pill">{projectedViewCount} {t("design.projectedViews")}</span>
      </div>

      {items.length ? (
        <div className="design-use-case-list-rows" role="list">
          {items.map((item, index) => (
            <article className="design-use-case-row" key={item.id} role="listitem">
              <span className="design-use-case-row-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="design-use-case-row-main">
                <div className="design-use-case-row-heading">
                  <strong>{item.title}</strong>
                  <span>{item.contextTitle ?? item.contextId ?? item.id}</span>
                </div>
                <p>{item.summary}</p>
              </div>
              <span className="pill design-use-case-status">{item.status}</span>
              <dl className="design-use-case-row-stats">
                <div>
                  <dt>{t("design.nodes")}</dt>
                  <dd>{item.nodeCount}</dd>
                </div>
                <div>
                  <dt>{t("design.edges")}</dt>
                  <dd>{item.edgeCount}</dd>
                </div>
                <div>
                  <dt>{t("design.evidence")}</dt>
                  <dd>{item.evidenceCount}</dd>
                </div>
                <div>
                  <dt>{t("design.questions")}</dt>
                  <dd>{item.questionCount}</dd>
                </div>
              </dl>
              <button className="secondary-action compact-action" type="button" onClick={() => onOpenUseCase(item.id)}>
                {t("design.openDiagram")}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state design-empty-state">
          <strong>{t("design.emptyTitle")}</strong>
          <span>{t("design.readyButNoProjectionCopy")}</span>
        </div>
      )}

      {skippedPaths.length ? (
        <div className="design-skipped-list">
          <strong>{t("design.skippedViews")}</strong>
          {skippedPaths.slice(0, 6).map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function DesignUseCaseDetail({
  projectRoot,
  item,
  html,
  htmlLoading,
  activeUmlNode,
  activeUmlHtml,
  activeUmlPath,
  activeUmlLoading,
  activeUmlError,
  activeUmlLiveUpdating,
  activeUmlLiveUpdatedAt,
  selectedAnchor,
  onBack,
  onSelectAnchor
}: {
  projectRoot: string;
  item: UseCaseDiagramItem;
  html: string;
  htmlLoading: boolean;
  activeUmlNode: UseCaseUmlTreeNode | undefined;
  activeUmlHtml: string;
  activeUmlPath: string;
  activeUmlLoading: boolean;
  activeUmlError: string;
  activeUmlLiveUpdating: boolean;
  activeUmlLiveUpdatedAt: string;
  selectedAnchor: SemanticHtmlSelection | null;
  onBack: () => void;
  onSelectAnchor: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const { t } = useI18n();
  const [pinnedStat, setPinnedStat] = useState<DesignMetricProbeKind | null>(null);
  const metricProbes = useMemo(
    () => buildDesignMetricProbes(item, html, t),
    [item, html, t]
  );

  useEffect(() => {
    setPinnedStat(null);
  }, [item.id]);

  return (
    <div className="design-detail-stack">
      <section className="panel design-detail-panel">
        <div className="design-detail-heading">
          <button className="secondary-action compact-action" type="button" onClick={onBack}>
            {t("design.backToDesignList")}
          </button>
          <div>
            <span className="muted-copy">{item.contextTitle ?? item.contextId ?? t("design.selectedDiagram")}</span>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
          </div>
          <span className="pill">{item.status}{item.confidence ? ` / ${item.confidence}` : ""}</span>
        </div>
        {activeUmlNode?.coverage ? <UseCaseCoverageSummary projectRoot={projectRoot} coverage={activeUmlNode.coverage} /> : null}
        <dl className="design-story-stats">
          {metricProbes.map((probe) => (
            <DesignStatProbe
              key={probe.kind}
              projectRoot={projectRoot}
              probe={probe}
              pinned={pinnedStat === probe.kind}
              onTogglePinned={() => setPinnedStat((current) => current === probe.kind ? null : probe.kind)}
            />
          ))}
        </dl>
        {item.viewRecord?.view.nodes.length ? (
          <div className="design-node-strip">
            {item.viewRecord.view.nodes.slice(0, 10).map((node) => (
              <span key={node.id}>{node.label}</span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel design-html-panel">
        <div className="panel-heading">
          <div>
            <h2>{activeUmlNode ? `${umlDiagramLabel(activeUmlNode.kind)} ${t("design.document")}` : t("design.useCaseSemanticHtmlTitle")}</h2>
            <p className="muted-copy">{activeUmlNode ? `${umlDiagramLabel(activeUmlNode.kind)} · ${activeUmlNode.title}` : t("design.useCaseSemanticHtmlCopy")}</p>
          </div>
          <div className="design-document-pills">
            {activeUmlLiveUpdatedAt ? (
              <span className={`pill design-live-pill ${activeUmlLiveUpdating ? "is-updating" : ""}`}>
                {activeUmlLiveUpdating ? t("design.liveUpdating") : t("design.liveUpdatedAt", { time: activeUmlLiveUpdatedAt })}
              </span>
            ) : null}
            <span className="pill">{activeUmlPath || "-"}</span>
          </div>
        </div>

        {htmlLoading || activeUmlLoading ? (
          <div className="empty-state design-empty-state">
            <strong>{t("design.loadingTitle")}</strong>
            <span>{activeUmlPath}</span>
          </div>
        ) : activeUmlError ? (
          <div className="empty-state design-empty-state">
            <strong>{t("design.statusError")}</strong>
            <span>{activeUmlError}</span>
          </div>
        ) : activeUmlHtml.trim() ? (
          <div className="design-html-workspace">
            <SemanticDesignHtml html={activeUmlHtml} liveUpdating={activeUmlLiveUpdating} onSelect={onSelectAnchor} />
            <aside className="semantic-selection-panel">
              <strong>{t("design.selectedAnchor")}</strong>
              {selectedAnchor ? (
                <dl>
                  <div>
                    <dt>{t("design.anchor")}</dt>
                    <dd>{selectedAnchor.anchor}</dd>
                  </div>
                  <div>
                    <dt>{t("design.kind")}</dt>
                    <dd>{selectedAnchor.kind ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>{t("design.layer")}</dt>
                    <dd>{selectedAnchor.layer ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>{t("design.status")}</dt>
                    <dd>{selectedAnchor.status ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>{t("design.confidence")}</dt>
                    <dd>{selectedAnchor.confidence ?? "-"}</dd>
                  </div>
                </dl>
              ) : (
                <span>{t("design.noAnchorSelected")}</span>
              )}
              <p>{t("design.agentPatchPending")}</p>
            </aside>
          </div>
        ) : (
          <div className="empty-state design-empty-state">
            <strong>{t("design.useCaseSemanticHtmlMissing")}</strong>
            <span>{activeUmlPath}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function UseCaseUmlTree({
  nodes,
  activeNodeId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  collapsible = true
}: {
  nodes: UseCaseUmlTreeNode[];
  activeNodeId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (id: string) => void;
  collapsible?: boolean;
}) {
  const { t } = useI18n();
  const childCount = Math.max(nodes.length - 1, 0);
  const activeNode = nodes.find((node) => node.id === activeNodeId) ?? nodes[0];
  const isCollapsed = collapsible ? collapsed : false;
  return (
    <nav className={`use-case-uml-tree ${isCollapsed ? "is-collapsed" : ""}`} aria-label="Use Case UML tree">
      <header>
        <div>
          <strong>{t("design.umlDrilldownTreeTitle")}</strong>
          <span>
            {isCollapsed && activeNode
              ? `${t("design.currentUml")}: ${designUmlTreeNodeTitle(activeNode)}`
              : childCount ? t("design.umlDrilldownTreeCopy", { count: childCount }) : t("design.umlDrilldownTreeEmpty")}
          </span>
        </div>
        <div className="use-case-uml-tree-actions">
          <span className="pill">{nodes.length} UML</span>
          {collapsible ? (
            <button className="secondary-action compact-action" type="button" onClick={onToggleCollapsed}>
              {isCollapsed ? t("design.expand") : t("design.collapse")}
            </button>
          ) : null}
        </div>
      </header>
      {isCollapsed ? null : (
        <ol>
          {nodes.map((node) => (
            <li className={node.root ? "root-node" : ""} key={node.id}>
              <button
                className={activeNodeId === node.id ? "is-active" : ""}
                type="button"
                onClick={() => onSelect(node.id)}
                title={`${designUmlTreeNodeTitle(node)}\n${designUmlTreeNodeSummary(node)}`}
              >
                <span className="use-case-uml-kind">{umlDiagramLabel(node.kind)}</span>
                <strong>{designUmlTreeNodeTitle(node)}</strong>
                <span className="use-case-uml-meta">{[node.status, node.confidence].filter(Boolean).join(" / ") || node.htmlPath}</span>
                <em>{designUmlTreeNodeSummary(node)}</em>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

function UseCaseCoverageSummary({ projectRoot, coverage }: { projectRoot: string; coverage: UseCaseUmlCoverage }) {
  const { t } = useI18n();
  const [openTarget, setOpenTarget] = useState<ImplementationScopeLink | null>(null);
  const [openError, setOpenError] = useState("");
  const scope = coverage.implementationScope;
  const keyFileLinks = useMemo(
    () => buildImplementationScopeLinks(scope?.keyFiles ?? [], projectRoot),
    [projectRoot, scope?.keyFiles]
  );
  const codeAnchorLinks = useMemo(
    () => buildImplementationScopeLinks(scope?.codeAnchors ?? [], projectRoot),
    [projectRoot, scope?.codeAnchors]
  );

  useEffect(() => {
    setOpenTarget(null);
    setOpenError("");
  }, [coverage]);

  async function openSelectedTarget(opener: ProjectFileOpener) {
    if (!openTarget) return;
    setOpenError("");
    try {
      await openProjectFileWith(projectRoot, openTarget.relativePath, opener, openTarget.line);
      setOpenTarget(null);
    } catch (caught) {
      setOpenError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="use-case-coverage-summary">
      <div>
        <span>{t("design.coverageTitle")}</span>
        <strong>{coverage.scenario}</strong>
      </div>
      <dl>
        <div>
          <dt>{t("design.coverageBoundary")}</dt>
          <dd>{coverage.boundary}</dd>
        </div>
        <div>
          <dt>{t("design.coverageRationale")}</dt>
          <dd>{coverage.rationale}</dd>
        </div>
      </dl>
      <div className="use-case-coverage-lists">
        <div>
          <span>{t("design.coverageCoveredFlows")}</span>
          <ul>{coverage.coveredUseCaseFlows.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <span>{t("design.coverageNotCovered")}</span>
          <ul>{coverage.notCovered.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
      {scope ? (
        <div className="use-case-implementation-scope">
          <span>{t("design.implementationScope")}</span>
          <dl>
            <div>
              <dt>{t("design.scopeModules")}</dt>
              <dd><ScopeValueList values={scope.modules} /></dd>
            </div>
            <div>
              <dt>{t("design.scopeEntryPoints")}</dt>
              <dd><ScopeValueList values={scope.entryPoints} /></dd>
            </div>
            <div>
              <dt>{t("design.scopeKeyFiles")}</dt>
              <dd>
                <ScopeLinkList
                  items={keyFileLinks.links}
                  hiddenInternalCount={keyFileLinks.hiddenInternalCount}
                  onSelect={(item) => {
                    setOpenError("");
                    setOpenTarget(item);
                  }}
                />
              </dd>
            </div>
            <div>
              <dt>{t("design.scopeCodeAnchors")}</dt>
              <dd>
                <ScopeLinkList
                  items={codeAnchorLinks.links}
                  hiddenInternalCount={codeAnchorLinks.hiddenInternalCount}
                  onSelect={(item) => {
                    setOpenError("");
                    setOpenTarget(item);
                  }}
                />
              </dd>
            </div>
            <div>
              <dt>{t("design.scopeOutOfScopeCode")}</dt>
              <dd><ScopeValueList values={scope.outOfScopeCode} /></dd>
            </div>
          </dl>
          {openTarget ? (
            <div className="implementation-open-chooser" role="dialog" aria-label={t("design.openFileChooserTitle")}>
              <div>
                <span>{t("design.openFileChooserTitle")}</span>
                <strong>{openTarget.label}</strong>
              </div>
              <div className="implementation-open-actions">
                <button className="secondary-action compact-action" type="button" onClick={() => openSelectedTarget("notepad")}>
                  {t("design.openWithNotepad")}
                </button>
                <button className="secondary-action compact-action" type="button" onClick={() => openSelectedTarget("vscode")}>
                  {t("design.openWithVSCode")}
                </button>
                <button className="secondary-action compact-action" type="button" onClick={() => setOpenTarget(null)}>
                  {t("design.cancelOpen")}
                </button>
              </div>
              {openError ? <small>{openError}</small> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ScopeValueList({ values }: { values: string[] }) {
  const items = expandScopeTextValues(values);
  if (!items.length) return <span className="scope-empty">-</span>;
  return (
    <ul className="implementation-scope-list">
      {items.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}
    </ul>
  );
}

function ScopeLinkList({
  items,
  hiddenInternalCount,
  onSelect
}: {
  items: ImplementationScopeLink[];
  hiddenInternalCount: number;
  onSelect: (item: ImplementationScopeLink) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="implementation-scope-link-block">
      {items.length ? (
        <ul className="implementation-scope-list implementation-scope-link-list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item)} title={item.raw}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="scope-empty">-</span>
      )}
      {hiddenInternalCount ? (
        <small>{t("design.scopeInternalAnchorsHidden", { count: hiddenInternalCount })}</small>
      ) : null}
    </div>
  );
}

function expandScopeTextValues(values: string[]): string[] {
  return uniqueTextValues(values.flatMap((value) =>
    value.split(/[，、]/).map((item) => item.trim()).filter(Boolean)
  ));
}

function buildImplementationScopeLinks(values: string[], projectRoot: string): ImplementationScopeLinkSet {
  const links: ImplementationScopeLink[] = [];
  let hiddenInternalCount = 0;
  for (const value of values) {
    if (isInternalCodeAnchor(value)) {
      hiddenInternalCount += 1;
      continue;
    }
    const tokens = extractImplementationReferenceTokens(value);
    if (!tokens.length && value.trim()) {
      const direct = parseImplementationReferenceToken(value.trim(), projectRoot, links.length);
      if (direct) links.push(direct);
      continue;
    }
    for (const token of tokens) {
      const link = parseImplementationReferenceToken(token, projectRoot, links.length);
      if (link) links.push(link);
    }
  }
  return {
    links: dedupeImplementationScopeLinks(links),
    hiddenInternalCount
  };
}

const implementationReferencePattern = /(?:[A-Za-z]:[\\/][^,，、\s)]+|(?:\.{1,2}[\\/])?(?:[\w@.+-]+[\\/])+[\w@.+-]+\.(?:ts|tsx|js|jsx|mjs|cjs|rs|py|java|kt|go|cs|cpp|cxx|cc|h|hpp|css|scss|html|md|json|toml|ya?ml|xml|sql|sh|ps1))(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?|::[\w.$#<>:-]+)?/gi;

function extractImplementationReferenceTokens(value: string): string[] {
  return Array.from(value.matchAll(implementationReferencePattern), (match) => match[0]);
}

function parseImplementationReferenceToken(token: string, projectRoot: string, index: number): ImplementationScopeLink | undefined {
  const cleanToken = token.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/[),.;，。；]+$/g, "");
  if (!cleanToken || isInternalCodeAnchor(cleanToken)) return undefined;
  const withSymbol = cleanToken.match(/^(.*?)(::[^\\/]+)$/);
  const symbol = withSymbol?.[2];
  const withoutSymbol = withSymbol ? withSymbol[1] : cleanToken;
  const withHashLine = withoutSymbol.match(/^(.*?)#L(\d+)(?:-L?(\d+))?$/i);
  const withColonLine = withoutSymbol.match(/^(.*?\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/);
  const pathPart = withHashLine?.[1] ?? withColonLine?.[1] ?? withoutSymbol;
  const line = Number(withHashLine?.[2] ?? withColonLine?.[2] ?? Number.NaN);
  const relativePath = normalizeImplementationRelativePath(pathPart, projectRoot);
  if (!relativePath || isInternalCodeAnchor(relativePath)) return undefined;
  const lineSuffix = Number.isInteger(line) && line > 0
    ? `#L${line}${withHashLine?.[3] || withColonLine?.[3] ? `-L${withHashLine?.[3] ?? withColonLine?.[3]}` : ""}`
    : "";
  const label = `${relativePath}${lineSuffix}${symbol ?? ""}`;
  return {
    id: `${relativePath}:${line || ""}:${symbol ?? ""}:${index}`,
    label,
    raw: cleanToken,
    relativePath,
    line: Number.isInteger(line) && line > 0 ? line : undefined
  };
}

function normalizeImplementationRelativePath(value: string, projectRoot: string): string | undefined {
  const normalizedPath = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.startsWith("../")) return undefined;
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  if (/^[A-Za-z]:\//.test(normalizedPath)) return undefined;
  return normalizedPath;
}

function isInternalCodeAnchor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^(codegraph|sourcecodefact|source-code-fact):/.test(normalized)
    || /^code:(file|symbol|function|class|edge|call|import|contains):/.test(normalized)
    || /^mem:fact:code/.test(normalized);
}

function dedupeImplementationScopeLinks(links: ImplementationScopeLink[]): ImplementationScopeLink[] {
  const seen = new Set<string>();
  const result: ImplementationScopeLink[] = [];
  for (const link of links) {
    const key = `${link.relativePath}:${link.line ?? ""}:${link.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function uniqueTextValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildUseCaseUmlTree(item: UseCaseDiagramItem, htmlPath: string, html = ""): UseCaseUmlTreeNode[] {
  const root: UseCaseUmlTreeNode = {
    id: `${item.id}:use-case-diagram`,
    kind: "use_case_diagram",
    title: item.title,
    summary: item.summary,
    htmlPath,
    status: item.status,
    confidence: item.confidence,
    root: true
  };
  const htmlTreeNodes = parseUseCaseUmlTreeNodesFromHtml(html);
  const htmlChildren = htmlTreeNodes
    .filter((node) => !node.root && node.htmlPath)
    .sort(compareUmlTreeNodes);
  if (htmlChildren.length) return [root, ...htmlChildren];
  const drilldownNodes = item.drilldownNodes.length ? item.drilldownNodes : (item.viewRecord?.view.nodes ?? []);
  const children = drilldownNodes
    .filter((node) => isUseCaseDrilldownNode(node, item.id))
    .map((node): UseCaseUmlTreeNode => ({
      id: node.anchor.id,
      kind: diagramKindFromNode(node),
      title: node.label,
      summary: node.summary,
      coverage: coverageMetadata(node.metadata),
      htmlPath: useCaseUmlNodeHtmlPath(item.id, node),
      status: node.status,
      confidence: stringMetadata(node.metadata, "confidence")
    }))
    .filter((node) => Boolean(node.htmlPath))
    .sort(compareUmlTreeNodes);
  return [root, ...children];
}

function parseUseCaseUmlTreeNodesFromHtml(html: string): UseCaseUmlTreeNode[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>(".uml-tree-layer li[data-praxis-uml-node]"))
    .map((element): UseCaseUmlTreeNode | undefined => {
      const id = element.getAttribute("data-praxis-uml-node")?.trim();
      if (!id) return undefined;
      const kind = element.getAttribute("data-praxis-diagram-kind")?.trim() || "use_case_diagram";
      const linkText = element.querySelector("a")?.textContent?.trim() || id;
      const title = cleanUseCaseUmlTreeLinkTitle(linkText, kind);
      const htmlPath = element.getAttribute("data-praxis-html-path")?.trim() || element.querySelector("a")?.getAttribute("href")?.trim() || "";
      const coverage = {
        scenario: element.getAttribute("data-praxis-coverage-scenario")?.trim() || "-",
        boundary: element.getAttribute("data-praxis-coverage-boundary")?.trim() || "-",
        rationale: element.getAttribute("data-praxis-coverage-rationale")?.trim() || "-",
        coveredUseCaseFlows: [],
        notCovered: []
      } satisfies UseCaseUmlCoverage;
      return {
        id,
        kind,
        title,
        summary: coverage.boundary !== "-" ? coverage.boundary : title,
        coverage: kind === "use_case_diagram" ? undefined : coverage,
        htmlPath: normalizeUseCaseUmlHtmlPath(htmlPath),
        root: kind === "use_case_diagram"
      };
    })
    .filter((node): node is UseCaseUmlTreeNode => Boolean(node));
}

function cleanUseCaseUmlTreeLinkTitle(value: string, kind: string): string {
  return value
    .replace(new RegExp(`^${escapeRegExp(umlDiagramLabel(kind))}\\s*[:：]\\s*`, "i"), "")
    .replace(/^Class \/ Structural Collaboration Diagram\s*[:：]\s*/i, "")
    .trim() || value;
}

function normalizeUseCaseUmlHtmlPath(value: string): string {
  if (!value.trim()) return "";
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("docs/")) return normalized;
  return `docs/design/use-case-diagrams/${normalized.replace(/^use-case-diagrams\//, "")}`;
}

function useCaseUmlNodeHtmlPath(useCaseId: string, node: RuntimeProjectedGraphNode): string {
  return stringMetadata(node.metadata, "htmlPath")
    ?? node.path
    ?? useCaseUmlHtmlPathCandidates(useCaseId, {
      id: node.anchor.id,
      kind: diagramKindFromNode(node),
      htmlPath: ""
    })[0]
    ?? "";
}

function useCaseUmlHtmlPathCandidates(useCaseId: string, node: Pick<UseCaseUmlTreeNode, "id" | "kind" | "htmlPath">): string[] {
  const candidates = new Set<string>();
  if (node.htmlPath) candidates.add(node.htmlPath);
  const base = `docs/design/use-case-diagrams/${designDocumentSlug(useCaseId.replace(/^use-case:/, ""))}`;
  if (node.kind === "activity") {
    candidates.add(`${base}/activity.html`);
  } else if (node.kind === "sequence") {
    const keepPrefix = designDocumentSlug(node.id);
    const stripPrefix = designDocumentSlug(node.id.replace(/^sequence:/, ""));
    candidates.add(`${base}/sequences/${keepPrefix}.html`);
    candidates.add(`${base}/sequences/${stripPrefix}.html`);
  } else if (node.kind === "state_machine") {
    const keepPrefix = designDocumentSlug(node.id);
    const stripPrefix = designDocumentSlug(node.id.replace(/^state-machine:/, "").replace(/^state_machine:/, ""));
    candidates.add(`${base}/state-machines/${keepPrefix}.html`);
    candidates.add(`${base}/state-machines/${stripPrefix}.html`);
  } else if (node.kind === "class_collaboration") {
    candidates.add(`${base}/realization/class-collaboration.html`);
  } else if (node.kind === "interaction_overview") {
    addSluggedDrilldownCandidates(candidates, `${base}/interaction-overviews`, node.id, "interaction-overview", "interaction_overview");
  } else if (node.kind === "communication") {
    addSluggedDrilldownCandidates(candidates, `${base}/communications`, node.id, "communication");
  } else if (node.kind === "timing") {
    addSluggedDrilldownCandidates(candidates, `${base}/timing`, node.id, "timing");
  } else if (node.kind === "object_snapshot") {
    addSluggedDrilldownCandidates(candidates, `${base}/object-snapshots`, node.id, "object-snapshot", "object_snapshot");
  } else if (node.kind === "composite_structure") {
    addSluggedDrilldownCandidates(candidates, `${base}/composite-structures`, node.id, "composite-structure", "composite_structure");
  }
  return Array.from(candidates).filter(Boolean);
}

function addSluggedDrilldownCandidates(candidates: Set<string>, directory: string, id: string, ...prefixes: string[]) {
  candidates.add(`${directory}/${designDocumentSlug(id)}.html`);
  for (const prefix of prefixes) {
    candidates.add(`${directory}/${designDocumentSlug(id.replace(new RegExp(`^${escapeRegExp(prefix)}:`), ""))}.html`);
  }
}

function designDocumentSlug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "diagram";
}

function isUseCaseDrilldownNode(node: RuntimeProjectedGraphNode, useCaseId: string): boolean {
  if (!designDrilldownGraphKinds.has(node.kind)) return false;
  return stringMetadata(node.metadata, "useCaseId") === useCaseId;
}

function diagramKindFromNode(node: RuntimeProjectedGraphNode): UseCaseUmlTreeNode["kind"] {
  const kind = stringMetadata(node.metadata, "diagramKind");
  if (kind) return kind;
  if (node.kind === "design_activity") return "activity";
  if (node.kind === "design_sequence") return "sequence";
  if (node.kind === "design_state_machine") return "state_machine";
  if (node.kind === "design_class_collaboration") return "class_collaboration";
  if (node.kind === "design_interaction_overview") return "interaction_overview";
  if (node.kind === "design_communication") return "communication";
  if (node.kind === "design_timing") return "timing";
  if (node.kind === "design_object_snapshot") return "object_snapshot";
  if (node.kind === "design_composite_structure") return "composite_structure";
  return node.kind;
}

function compareUmlTreeNodes(left: UseCaseUmlTreeNode, right: UseCaseUmlTreeNode): number {
  return umlTreeSortOrder(left.kind) - umlTreeSortOrder(right.kind) || left.title.localeCompare(right.title, "zh-CN");
}

function umlTreeSortOrder(kind: string): number {
  if (kind === "use_case_diagram") return 0;
  if (kind === "activity") return 1;
  if (kind === "sequence") return 2;
  if (kind === "state_machine") return 3;
  if (kind === "class_collaboration") return 4;
  if (kind === "interaction_overview") return 5;
  if (kind === "communication") return 6;
  if (kind === "timing") return 7;
  if (kind === "object_snapshot") return 8;
  if (kind === "composite_structure") return 9;
  return 99;
}

function umlDiagramLabel(kind: string): string {
  if (kind === "use_case_diagram") return "Use Case Diagram";
  if (kind === "activity") return "Activity Diagram";
  if (kind === "sequence") return "Sequence Diagram";
  if (kind === "state_machine") return "State Machine Diagram";
  if (kind === "class_collaboration") return "Class Collaboration";
  if (kind === "interaction_overview") return "Interaction Overview";
  if (kind === "communication") return "Communication Diagram";
  if (kind === "timing") return "Timing Diagram";
  if (kind === "object_snapshot") return "Object Diagram";
  if (kind === "composite_structure") return "Composite Structure";
  return kind.replace(/_/g, " ");
}

function designUmlTreeNodeTitle(node: UseCaseUmlTreeNode): string {
  const rawName = cleanDesignUmlTitle(node.title);
  const scope = cleanDesignUmlTitle(node.coverage?.scenario || rawName);
  if (node.kind === "use_case_diagram") return `用例总览 · ${rawName}`;
  if (node.kind === "activity") return `业务流程 · ${scope}`;
  if (node.kind === "sequence") return `对象交互 · ${scope}`;
  if (node.kind === "state_machine") return `状态迁移 · ${scope}`;
  if (node.kind === "class_collaboration") return `承载结构 · ${scope}`;
  if (node.kind === "interaction_overview") return `交互总览 · ${scope}`;
  if (node.kind === "communication") return `消息网络 · ${scope}`;
  if (node.kind === "timing") return `时间约束 · ${scope}`;
  if (node.kind === "object_snapshot") return `对象快照 · ${scope}`;
  if (node.kind === "composite_structure") return `复合结构 · ${scope}`;
  return rawName;
}

function designUmlTreeNodeSummary(node: UseCaseUmlTreeNode): string {
  const summary = node.summary?.trim();
  const coverage = node.coverage;
  if (summary && !isGenericDesignTreeSummary(summary, node)) return summary;
  if (coverage?.boundary && coverage.boundary !== "-") {
    const rationale = coverage.rationale && coverage.rationale !== "-" ? `；${coverage.rationale}` : "";
    return `${coverage.boundary}${rationale}`;
  }
  if (node.kind === "use_case_diagram") return "解释业务参与者、目标、触发条件和用例边界，是下钻 UML 的入口。";
  if (node.kind === "activity") return "解释该用例的主流程、分支、失败路径和关键决策点。";
  if (node.kind === "sequence") return "解释该用例中对象、组件、外部系统之间的调用顺序和消息语义。";
  if (node.kind === "state_machine") return "解释关键业务对象的生命周期、状态字段、迁移事件和状态约束。";
  if (node.kind === "class_collaboration") return "解释该用例由哪些服务、领域对象、接口、端口、适配器或策略协作承载。";
  if (node.kind === "interaction_overview") return "解释多个交互片段、分支和子场景如何组合完成该用例。";
  if (node.kind === "communication") return "解释运行时对象之间的消息网络、协作中心和通信关系。";
  if (node.kind === "timing") return "解释超时、重试、轮询、等待窗口或 SLA 等时间语义。";
  if (node.kind === "object_snapshot") return "解释关键业务时刻的运行时对象实例及其关系。";
  if (node.kind === "composite_structure") return "解释复杂结构内部的部件、端口、连接和协作边界。";
  return "解释当前业务设计图的范围、证据和可下钻方向。";
}

function cleanDesignUmlTitle(value: string): string {
  return (value || "未命名设计图")
    .replace(/^Use Case Diagram[:：]\s*/i, "")
    .replace(/^Activity Diagram[:：]\s*/i, "")
    .replace(/^Sequence Diagram[:：]\s*/i, "")
    .replace(/^State Machine Diagram[:：]\s*/i, "")
    .replace(/^Class Collaboration[:：]\s*/i, "")
    .replace(/\s+Use Case Diagram$/i, "")
    .replace(/\s+Activity Diagram$/i, "")
    .replace(/\s+Sequence Diagram$/i, "")
    .replace(/\s+State Machine Diagram$/i, "")
    .replace(/\s+Class Collaboration$/i, "")
    .trim() || "未命名设计图";
}

function isGenericDesignTreeSummary(summary: string, node: UseCaseUmlTreeNode): boolean {
  const normalized = summary.toLowerCase();
  return normalized === node.title.toLowerCase()
    || normalized.includes("candidate")
    || normalized.includes("diagram")
    || normalized.includes("当前 use case")
    || normalized.includes("当前用例");
}

function toRuntimeDesignCurrentUml(node: UseCaseUmlTreeNode): RuntimeDesignCurrentUmlContext {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    htmlPath: node.htmlPath,
    status: node.status,
    confidence: node.confidence,
    coverage: node.coverage
  };
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayMetadata(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function coverageMetadata(metadata: Record<string, unknown> | undefined): UseCaseUmlCoverage | undefined {
  const coverage = metadata?.coverage;
  if (coverage && typeof coverage === "object" && !Array.isArray(coverage)) {
    const record = coverage as Record<string, unknown>;
    const scenario = typeof record.scenario === "string" ? record.scenario.trim() : "";
    const boundary = typeof record.boundary === "string" ? record.boundary.trim() : "";
    const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
    const coveredUseCaseFlows = Array.isArray(record.coveredUseCaseFlows)
      ? record.coveredUseCaseFlows.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
      : [];
    const notCovered = Array.isArray(record.notCovered)
      ? record.notCovered.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
      : [];
    const implementationScope = implementationScopeMetadata(record.implementationScope);
    if (scenario || boundary || rationale || coveredUseCaseFlows.length || notCovered.length || implementationScope) {
      return {
        scenario: scenario || stringMetadata(metadata, "coverageScenario") || "-",
        boundary: boundary || stringMetadata(metadata, "coverageBoundary") || "-",
        rationale: rationale || stringMetadata(metadata, "coverageRationale") || "-",
        coveredUseCaseFlows: coveredUseCaseFlows.length ? coveredUseCaseFlows : arrayMetadata(metadata, "coveredUseCaseFlows"),
        notCovered: notCovered.length ? notCovered : arrayMetadata(metadata, "notCovered"),
        implementationScope
      };
    }
  }
  const scenario = stringMetadata(metadata, "coverageScenario");
  const boundary = stringMetadata(metadata, "coverageBoundary");
  const rationale = stringMetadata(metadata, "coverageRationale");
  if (!scenario && !boundary && !rationale) return undefined;
  return {
    scenario: scenario ?? "-",
    boundary: boundary ?? "-",
    rationale: rationale ?? "-",
    coveredUseCaseFlows: arrayMetadata(metadata, "coveredUseCaseFlows"),
    notCovered: arrayMetadata(metadata, "notCovered"),
    implementationScope: implementationScopeMetadata(metadata?.implementationScope)
  };
}

function implementationScopeMetadata(value: unknown): UseCaseImplementationScope | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const scope = {
    modules: stringArrayValue(record.modules),
    entryPoints: stringArrayValue(record.entryPoints),
    keyFiles: stringArrayValue(record.keyFiles),
    codeAnchors: stringArrayValue(record.codeAnchors),
    outOfScopeCode: stringArrayValue(record.outOfScopeCode)
  };
  return Object.values(scope).some((items) => items.length > 0) ? scope : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function DesignStatProbe({
  projectRoot,
  probe,
  pinned,
  onTogglePinned
}: {
  projectRoot: string;
  probe: DesignMetricProbe;
  pinned: boolean;
  onTogglePinned: () => void;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const popoverId = `design-stat-popover-${probe.kind}`;
  const open = pinned || hovered;

  function clearCloseTimer() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }

  function openPopover() {
    clearCloseTimer();
    setHovered(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setHovered(false), 180);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    scheduleClose();
  }

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      className={`design-stat-probe ${pinned ? "is-pinned" : ""} ${open ? "is-open" : ""}`}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onFocus={openPopover}
      onBlur={handleBlur}
    >
      <dt>{probe.label}</dt>
      <dd>
        <button
          className="design-stat-trigger"
          type="button"
          aria-describedby={popoverId}
          aria-expanded={open}
          onClick={onTogglePinned}
        >
          {probe.value}
        </button>
      </dd>
      <div className="design-stat-popover" id={popoverId} role="tooltip">
        <div className="design-stat-popover-heading">
          <strong>{probe.label}</strong>
          <button className="secondary-action compact-action" type="button" onClick={onTogglePinned}>
            {pinned ? t("design.statUnpin") : t("design.statPin")}
          </button>
        </div>
        {probe.boundary ? <p>{probe.boundary}</p> : null}
        {probe.items.length ? (
          <ol>
            {probe.items.map((entry, index) => (
              <li key={`${entry.kind}:${entry.id}:${index}`}>
                <strong>{entry.label}</strong>
                <span>{entry.kind} · {entry.id}</span>
                {entry.detail ? <p>{entry.detail}</p> : null}
                {hasCodeEvidencePreview(entry) ? (
                  <CodeEvidencePreview
                    projectRoot={projectRoot}
                    evidence={entry}
                    triggerLabel={t("design.previewEvidenceExcerpt")}
                    pinLabel={t("design.statPin")}
                    unpinLabel={t("design.statUnpin")}
                    loadingLabel={t("design.codePreviewLoading")}
                    unavailableLabel={t("design.codePreviewUnavailable")}
                    fallbackLabel={t("design.evidenceExcerpt")}
                    maxHeight={220}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <span className="design-stat-empty">{t("design.statEmpty")}</span>
        )}
      </div>
    </div>
  );
}

function hasCodeEvidencePreview(entry: DesignMetricProbeItem): boolean {
  if (entry.excerpt?.trim()) return true;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|rs|py|java|kt|go|cs|cpp|cxx|cc|h|hpp|css|scss|html|md|json|toml|ya?ml|xml|sql|sh|ps1)(?:\b|$|[^\w])/i
    .test([entry.label, entry.detail, entry.id].filter(Boolean).join(" "));
}

function DesignExplorerSidePanel({
  projectRoot,
  selectedUseCase,
  selectedAnchor,
  umlTreeNodes,
  activeUmlNode,
  activeUmlNodeId,
  onSelectUmlNode,
  onStoryUpdated,
  onDiagramUpdated
}: {
  projectRoot: string;
  selectedUseCase: UseCaseDiagramItem | null;
  selectedAnchor: SemanticHtmlSelection | null;
  umlTreeNodes: UseCaseUmlTreeNode[];
  activeUmlNode: UseCaseUmlTreeNode | undefined;
  activeUmlNodeId: string;
  onSelectUmlNode: (id: string) => void;
  onStoryUpdated: () => void;
  onDiagramUpdated: () => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"uml" | "agent">(selectedUseCase ? "uml" : "agent");
  const isDiagramMode = Boolean(selectedUseCase);

  useEffect(() => {
    setActiveTab(selectedUseCase ? "uml" : "agent");
  }, [selectedUseCase?.id]);

  if (!isDiagramMode) {
    return (
      <aside className="panel design-side-panel">
        <DesignAgentPanel
          mode="story"
          projectRoot={projectRoot}
          selectedUseCase={selectedUseCase}
          selectedAnchor={selectedAnchor}
          activeUmlNode={undefined}
          onStoryUpdated={onStoryUpdated}
          onDiagramUpdated={onDiagramUpdated}
          embedded
        />
      </aside>
    );
  }

  return (
    <aside className="panel design-side-panel" aria-label={t("design.sidePanelTitle")}>
      <div className="design-side-tabs" role="tablist" aria-label={t("design.sidePanelTitle")}>
        <button
          className={activeTab === "uml" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "uml"}
          onClick={() => setActiveTab("uml")}
        >
          {t("design.sideTabUml")}
        </button>
        <button
          className={activeTab === "agent" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "agent"}
          onClick={() => setActiveTab("agent")}
        >
          {t("design.sideTabAgent")}
        </button>
      </div>

      <div className="design-side-tab-body">
        {activeTab === "uml" ? (
          <UseCaseUmlTree
            nodes={umlTreeNodes}
            activeNodeId={activeUmlNodeId}
            collapsed={false}
            onToggleCollapsed={() => undefined}
            onSelect={onSelectUmlNode}
            collapsible={false}
          />
        ) : (
          <DesignAgentPanel
            mode="diagram"
            projectRoot={projectRoot}
            selectedUseCase={selectedUseCase}
            selectedAnchor={selectedAnchor}
            activeUmlNode={activeUmlNode}
            onStoryUpdated={onStoryUpdated}
            onDiagramUpdated={onDiagramUpdated}
            embedded
          />
        )}
      </div>
    </aside>
  );
}

function DesignAgentPanel({
  mode,
  projectRoot,
  selectedUseCase,
  selectedAnchor,
  activeUmlNode,
  onStoryUpdated,
  onDiagramUpdated,
  embedded = false
}: {
  mode: "story" | "diagram";
  projectRoot: string;
  selectedUseCase: UseCaseDiagramItem | null;
  selectedAnchor: SemanticHtmlSelection | null;
  activeUmlNode: UseCaseUmlTreeNode | undefined;
  onStoryUpdated: () => void;
  onDiagramUpdated: () => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const isDiagramMode = mode === "diagram";
  const placeholder = isDiagramMode ? t("design.agentDiagramPlaceholder") : t("design.agentStoryPlaceholder");
  const contextTitle = isDiagramMode && activeUmlNode
    ? `${umlDiagramLabel(activeUmlNode.kind)} · ${activeUmlNode.title}`
    : isDiagramMode ? t("design.agentModeDiagram") : t("design.agentModeStory");

  async function handleSubmit(text: string, conversationHistory: RuntimeScopedAgentHistoryEntry[]): Promise<ScopedAgentSubmitResult> {
    if (mode === "story") {
      const result = await submitDesignStoryIntake(projectRoot, text);
      if (result.updated) onStoryUpdated();
      return {
        text: formatStoryIntakeResult(result, t),
        intent: result.intent,
        status: "done",
        provider: result.provider,
        versionProvider: result.versionProvider,
        artifactPaths: [
          result.designMapDocPath,
          result.designMapHtmlPath,
          result.modelPath,
          result.manifestPath,
          result.useCaseListViewPath,
          ...result.useCaseViewPaths,
          ...result.mermaidPaths
        ].filter((path): path is string => Boolean(path))
      };
    }
    if (!selectedUseCase) {
      return {
        text: t("design.agentDiagramEmpty"),
        intent: "needs_selection",
        status: "done"
      };
    }
    const result = await discussDesignDiagram(projectRoot, selectedUseCase.id, text, {
      selectedAnchor: selectedAnchor ?? undefined,
      currentUml: activeUmlNode ? toRuntimeDesignCurrentUml(activeUmlNode) : undefined,
      conversationHistory
    });
    return {
      text: formatDiagramDiscussionResult(result),
      intent: result.intent,
      status: result.ok ? "done" : "failed",
      documentEdits: result.documentEdits,
      provider: result.provider
    };
  }

  return (
    <ScopedAgentPanel
      projectRoot={projectRoot}
      className={`${embedded ? "" : "panel " }design-agent-panel`}
      textareaId="design-agent-input"
      ariaLabel={isDiagramMode ? t("design.agentDiagramTitle") : t("design.agentStoryTitle")}
      scope={{
        id: isDiagramMode
          ? `design:diagram:${selectedUseCase?.id ?? "none"}:${activeUmlNode?.id ?? "none"}`
          : "design:story-intake",
        title: isDiagramMode ? t("design.agentDiagramTitle") : t("design.agentStoryTitle"),
        copy: isDiagramMode ? t("design.agentDiagramCopy") : t("design.agentStoryCopy"),
        modeLabel: contextTitle,
        placeholder,
        inputLabel: t("design.agentInputLabel"),
        emptyTitle: isDiagramMode ? t("design.agentDiagramTitle") : t("design.agentStoryTitle"),
        emptyCopy: isDiagramMode ? t("design.agentDiagramEmpty") : t("design.agentStoryEmpty"),
        scopeKind: "design",
        contextTitle,
        contextPath: activeUmlNode?.htmlPath
      }}
      onSubmit={handleSubmit}
      onResult={(result) => {
        if (result.documentEdits?.some((edit) => edit.changed && edit.status === "applied")) onDiagramUpdated();
      }}
    />
  );
}

function SemanticDesignHtml({
  html,
  liveUpdating,
  onSelect
}: {
  html: string;
  liveUpdating?: boolean;
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const safeHtml = useMemo(() => sanitizeSemanticHtml(html), [html]);
  const umlFullscreen = useUmlFullscreenViewer(safeHtml);
  const fullscreenLabel = t("design.fullscreenUml");

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
      renderIdPrefix: "praxis-design-map",
      securityLevel: "loose",
      fullscreenLabel,
      setFullscreenDiagram: (diagram) => umlFullscreen.setFullscreenDiagram(diagram),
      setFullscreenZoom: (zoom) => umlFullscreen.setFullscreenZoom(zoom)
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
    };
  }, [fullscreenLabel, safeHtml]);

  return (
    <>
      <div
        ref={hostRef}
        className={`semantic-design-html ${liveUpdating ? "is-live-updating" : ""}`}
        onClick={onSelect}
      />
      {umlFullscreen.overlay}
    </>
  );
}

function DesignMetric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel design-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function hasDesignRecords(result: RuntimeProjectionViewsResult): boolean {
  return result.records.some((record) => designViewKinds.has(record.view.kind));
}

function extractUseCaseSectionHtml(mapHtml: string, useCaseId: string): string | undefined {
  if (!mapHtml.trim() || typeof DOMParser === "undefined") return undefined;
  const doc = new DOMParser().parseFromString(mapHtml, "text/html");
  const anchorElements = Array.from(doc.querySelectorAll("[data-praxis-anchor]"));
  const target = anchorElements.find((element) =>
    element.getAttribute("data-praxis-anchor") === useCaseId && element.classList.contains("diagram-section")
  ) ?? anchorElements.find((element) => element.getAttribute("data-praxis-anchor") === useCaseId);
  const section = target?.closest(".diagram-section") ?? target;
  return section?.outerHTML;
}

function buildDesignChangelogEntries(markdown: string, html: string): DesignChangelogEntry[] {
  const markdownEntries = parseMarkdownChangelogEntries(markdown);
  if (markdownEntries.length) return markdownEntries;
  const htmlEntries = parseHtmlChangelogEntries(html);
  if (htmlEntries.length) return htmlEntries;
  const metadata = parseMarkdownMetadata(markdown);
  if (!metadata.projectVersion && !metadata.updatedAt) return [];
  return [{
    id: "design-changelog:metadata",
    title: "Design document snapshot",
    summary: "Design document metadata is available, but no changelog entries were found.",
    version: metadata.projectVersion ?? "",
    date: metadata.updatedAt ?? "",
    gitBranch: metadata.gitBranch,
    gitCommit: metadata.gitCommit,
    gitTreeState: metadata.gitTreeState,
    scope: "metadata"
  }];
}

function parseMarkdownChangelogEntries(markdown: string): DesignChangelogEntry[] {
  if (!markdown.trim()) return [];
  const metadata = parseMarkdownMetadata(markdown);
  const lines = markdown.split(/\r?\n/);
  const entries: DesignChangelogEntry[] = [];
  let currentScope: DesignChangelogEntry["scope"] = "metadata";
  let currentUseCaseTitle = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const useCaseHeading = line.match(/^###\s+(?:Use Case Diagram|用例图)[:：]\s+(.+)$/);
    if (useCaseHeading) {
      currentScope = "use_case";
      currentUseCaseTitle = stripMarkdown(useCaseHeading[1]);
      continue;
    }
    if (line === "## Map Changelog" || line === "## 地图变更记录") {
      currentScope = "map";
      currentUseCaseTitle = "";
      continue;
    }
    const entryHeading = line.match(/^#{3,5}\s+(.+?)\s+-\s+(.+)$/);
    if (!entryHeading || currentScope === "metadata") continue;

    const detailLines: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !lines[cursor].match(/^#{1,5}\s+/)) {
      detailLines.push(lines[cursor]);
      cursor += 1;
    }
    index = cursor - 1;
    const details = parseMarkdownChangelogDetails(detailLines);
    const version = stripMarkdown(entryHeading[1]);
    const date = stripMarkdown(entryHeading[2]);
    entries.push({
      id: `design-changelog:${currentScope}:${entries.length}:${version}:${date}`,
      title: currentScope === "map" ? "Design map update" : `Use Case: ${currentUseCaseTitle || "Untitled"}`,
      summary: details.summary || "Design changelog entry recorded without a summary.",
      version,
      date,
      changeType: details.changeType,
      gitBranch: details.gitBranch ?? metadata.gitBranch,
      gitCommit: details.gitCommit ?? metadata.gitCommit,
      gitTreeState: details.gitTreeState ?? metadata.gitTreeState,
      commitSummary: details.commitSummary,
      atomicCommitScope: details.atomicCommitScope,
      scope: currentScope
    });
  }
  return entries.sort((left, right) => timestampValue(right.date) - timestampValue(left.date));
}

function parseMarkdownMetadata(markdown: string): {
  projectVersion?: string;
  gitBranch?: string;
  gitCommit?: string;
  gitTreeState?: string;
  updatedAt?: string;
} {
  return {
    projectVersion: markdown.match(/^(?:Project version|项目版本)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitBranch: markdown.match(/^(?:Git branch|Git 分支)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitCommit: markdown.match(/^(?:Git commit|Git 提交)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitTreeState: markdown.match(/^(?:Git tree state|Git 工作区状态)[:：]\s*(.+)$/m)?.[1]?.trim(),
    updatedAt: markdown.match(/^(?:Updated at|更新于)[:：]\s*(.+)$/m)?.[1]?.trim()
  };
}

function parseMarkdownChangelogDetails(lines: string[]): {
  changeType?: string;
  gitBranch?: string;
  gitCommit?: string;
  gitTreeState?: string;
  commitSummary?: string;
  atomicCommitScope?: string;
  summary: string;
} {
  const raw = lines.join("\n");
  const summaryLines = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => stripMarkdown(line.replace(/^-\s+/, "")));
  return {
    changeType: raw.match(/^(?:Change type|变更类型)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitBranch: raw.match(/^(?:Git branch|Git 分支)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitCommit: raw.match(/^(?:Git commit|Git 提交)[:：]\s*(.+)$/m)?.[1]?.trim(),
    gitTreeState: raw.match(/^(?:Git tree state|Git 工作区状态)[:：]\s*(.+)$/m)?.[1]?.trim(),
    commitSummary: raw.match(/^(?:Commit summary|提交摘要)[:：]\s*(.+)$/m)?.[1]?.trim(),
    atomicCommitScope: raw.match(/^(?:Atomic commit scope|原子提交范围)[:：]\s*(.+)$/m)?.[1]?.trim(),
    summary: summaryLines.join("\n")
  };
}

function parseHtmlChangelogEntries(html: string): DesignChangelogEntry[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("[data-praxis-change]")).map((element, index) => {
    const version = element.getAttribute("data-praxis-version") ?? "";
    const anchor = element.getAttribute("data-praxis-anchor") ?? "";
    const date = element.querySelector("time")?.getAttribute("datetime") ?? element.querySelector("time")?.textContent?.trim() ?? "";
    const summary = element.querySelector("p")?.textContent?.trim() ?? "Design changelog entry recorded without a summary.";
    const scope: DesignChangelogEntry["scope"] = anchor.startsWith("design-map:") ? "map" : "use_case";
    return {
      id: `design-changelog:html:${index}:${version}:${date}`,
      title: scope === "map" ? "Design map update" : `Use Case: ${anchor || "Untitled"}`,
      summary,
      version,
      date,
      gitBranch: element.getAttribute("data-praxis-git-branch") ?? undefined,
      gitCommit: element.getAttribute("data-praxis-git-commit") ?? undefined,
      gitTreeState: element.getAttribute("data-praxis-git-dirty") === "true" ? "dirty" : "clean",
      changeType: element.getAttribute("data-praxis-version-bump") ?? element.getAttribute("data-praxis-change") ?? undefined,
      commitSummary: element.getAttribute("data-praxis-commit-summary") ?? undefined,
      atomicCommitScope: element.getAttribute("data-praxis-commit-scope") ?? undefined,
      scope
    };
  }).sort((left, right) => timestampValue(right.date) - timestampValue(left.date));
}

function formatGitVersion(entry: DesignChangelogEntry): string {
  const commit = entry.gitCommit && entry.gitCommit !== "unknown" ? entry.gitCommit.slice(0, 12) : entry.gitCommit;
  return [commit, entry.gitBranch, entry.gitTreeState].filter(Boolean).join(" / ") || "-";
}

function stripMarkdown(value: string): string {
  return value.replace(/\[(.*?)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildUseCaseDiagramItems(
  listRecord: RuntimeProjectedGraphViewRecord | undefined,
  contextRecords: RuntimeProjectedGraphViewRecord[],
  semanticHtml: string,
  designMarkdown: string
): UseCaseDiagramItem[] {
  const sourceNodes = listRecord?.view.nodes.filter((node) => node.kind === "design_use_case") ?? [];
  const fallbackNodes = contextRecords.flatMap((record) => record.view.nodes.filter((node) => node.kind === "design_use_case"));
  const nodes = sourceNodes.length ? sourceNodes : fallbackNodes;
  const drilldownNodes = uniqueRuntimeNodes([
    ...(listRecord?.view.nodes ?? []),
    ...contextRecords.flatMap((record) => record.view.nodes)
  ]).filter(isDesignDrilldownGraphNode);
  const seen = new Set<string>();
  const items: UseCaseDiagramItem[] = [];
  for (const node of nodes) {
    const id = node.anchor.kind === "design_use_case" ? node.anchor.id : node.source.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const viewRecord = contextRecords.find((record) =>
      record.view.nodes.some((candidate) => candidate.anchor.kind === "design_use_case" && candidate.anchor.id === id)
    );
    const contextId = metadataString(node, "contextId") ?? viewRecord?.view.nodes.find((candidate) => candidate.kind === "design_context")?.anchor.id;
    const contextTitle = viewRecord?.view.nodes.find((candidate) => candidate.kind === "design_context")?.label;
    const questionCount = metadataStringArray(node, "questions").length
      || viewRecord?.view.annotations.filter((annotation) => annotation.anchor?.id === id || annotation.targetNodeIds.includes(node.id)).length
      || 0;
    const evidenceCount = metadataNumber(node, "evidenceCount")
      ?? viewRecord?.view.sourceMemoryIds.length
      ?? 0;
    const itemDrilldownNodes = drilldownNodes.filter((candidate) => metadataString(candidate, "useCaseId") === id);
    items.push({
      id,
      title: node.label,
      summary: node.summary ?? "",
      status: node.status ?? viewRecord?.view.status ?? "fresh",
      confidence: metadataString(node, "confidence"),
      contextId,
      contextTitle,
      evidenceCount,
      questionCount,
      nodeCount: viewRecord?.view.nodes.length ?? 1,
      edgeCount: viewRecord?.view.edges.length ?? 0,
      node,
      viewRecord,
      drilldownNodes: itemDrilldownNodes
    });
  }
  if (items.length) return items.sort((left, right) => left.title.localeCompare(right.title));
  return buildUseCaseDiagramItemsFromDocs(semanticHtml, designMarkdown);
}

function isDesignDrilldownGraphNode(node: RuntimeProjectedGraphNode): boolean {
  return designDrilldownGraphKinds.has(node.kind);
}

interface DocBackedUseCaseIndexEntry {
  id: string;
  title: string;
  htmlPath?: string;
  summary?: string;
  contextTitle?: string;
  status?: string;
  confidence?: string;
  drilldownCount?: number;
  updatedAt?: string;
}

function buildUseCaseDiagramItemsFromDocs(html: string, markdown: string): UseCaseDiagramItem[] {
  const htmlEntries = parseUseCaseIndexEntriesFromHtml(html);
  const entries = htmlEntries.length ? htmlEntries : parseUseCaseIndexEntriesFromMarkdown(markdown);
  return entries.map((entry) => docBackedUseCaseItem(entry)).sort((left, right) => left.title.localeCompare(right.title));
}

function parseUseCaseIndexEntriesFromHtml(html: string): DocBackedUseCaseIndexEntry[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sections = Array.from(doc.querySelectorAll<HTMLElement>(".diagram-section[data-praxis-kind='use_case'][data-praxis-anchor]"));
  const sectionsByAnchor = new Map(sections.map((section) => [section.getAttribute("data-praxis-anchor") ?? "", section]));
  const indexItems = Array.from(doc.querySelectorAll<HTMLElement>(".diagram-index li[data-praxis-kind='use_case'][data-praxis-anchor]"));
  const sourceItems = indexItems.length ? indexItems : sections;
  const entries: DocBackedUseCaseIndexEntry[] = [];
  const seen = new Set<string>();
  for (const element of sourceItems) {
    const id = element.getAttribute("data-praxis-anchor")?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const section = sectionsByAnchor.get(id) ?? element;
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>("a"));
    const title = links[0]?.textContent?.trim()
      || section.querySelector(".section-heading h2")?.textContent?.trim()
      || id.replace(/^use-case:/, "");
    const htmlPath = normalizeDesignMapHref(
      links.map((link) => link.getAttribute("href") ?? "").find((href) => href.endsWith(".html")) ?? ""
    ) || designUseCaseHtmlRelativePath(id);
    const detailParts = (element.querySelector("span")?.textContent ?? "")
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean);
    const drilldownText = detailParts.find((part) => /下钻\s*UML/i.test(part));
    const summary = section.querySelector(".explanation-layer p")?.textContent?.trim()
      || section.querySelector(".section-heading p")?.textContent?.trim()
      || `Use Case Diagram：${title}`;
    entries.push({
      id,
      title,
      htmlPath,
      summary,
      contextTitle: section.querySelector(".section-heading p")?.textContent?.trim() || detailParts[0],
      status: element.getAttribute("data-praxis-status") ?? section.getAttribute("data-praxis-status") ?? undefined,
      confidence: element.getAttribute("data-praxis-confidence") ?? section.getAttribute("data-praxis-confidence") ?? undefined,
      drilldownCount: drilldownText ? Number(drilldownText.match(/\d+/)?.[0]) : undefined,
      updatedAt: detailParts.find((part) => /\d{4}-\d{2}-\d{2}T/.test(part))
    });
  }
  return entries;
}

function parseUseCaseIndexEntriesFromMarkdown(markdown: string): DocBackedUseCaseIndexEntry[] {
  if (!markdown.trim()) return [];
  const entries: DocBackedUseCaseIndexEntry[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("| use-case:")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const id = cells[0];
    const htmlPath = normalizeDesignMapHref(markdownLinkTarget(cells[2])) || designUseCaseHtmlRelativePath(id);
    entries.push({
      id,
      title: stripMarkdown(cells[1]) || id.replace(/^use-case:/, ""),
      htmlPath,
      summary: `Use Case Diagram：${stripMarkdown(cells[1]) || id.replace(/^use-case:/, "")}`,
      drilldownCount: Number(cells[3]) || undefined,
      contextTitle: stripMarkdown(cells[4]),
      status: stripMarkdown(cells[5]) || undefined,
      confidence: stripMarkdown(cells[6]) || undefined,
      updatedAt: stripMarkdown(cells[8] ?? "")
    });
  }
  return entries;
}

function countDesignDrilldownsFromDocs(html: string): {
  sequence: number;
  classCollaboration: number;
  stateMachine: number;
} {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return { sequence: 0, classCollaboration: 0, stateMachine: 0 };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const drilldownNodes = Array.from(doc.querySelectorAll<HTMLElement>(".uml-tree-layer li[data-praxis-diagram-kind]"));
  return {
    sequence: drilldownNodes.filter((node) => node.getAttribute("data-praxis-diagram-kind") === "sequence").length,
    classCollaboration: drilldownNodes.filter((node) => node.getAttribute("data-praxis-diagram-kind") === "class_collaboration").length,
    stateMachine: drilldownNodes.filter((node) => node.getAttribute("data-praxis-diagram-kind") === "state_machine").length
  };
}

function markdownLinkTarget(value: string): string {
  return value.match(/\[[^\]]+\]\(([^)]+)\)/)?.[1]?.trim() ?? "";
}

function normalizeDesignMapHref(href: string): string | undefined {
  const clean = href.trim().replace(/\\/g, "/");
  if (!clean || clean.startsWith("#") || /^[a-z]+:/i.test(clean)) return undefined;
  const withoutHash = clean.split("#")[0];
  if (withoutHash.startsWith("docs/design/")) return withoutHash;
  if (withoutHash.startsWith("use-case-diagrams/")) return `docs/design/${withoutHash}`;
  return `docs/design/${withoutHash.replace(/^\.\//, "")}`;
}

function docBackedUseCaseItem(entry: DocBackedUseCaseIndexEntry): UseCaseDiagramItem {
  const confidence = entry.confidence || "candidate";
  const status = entry.status || "candidate";
  const node: RuntimeProjectedGraphNode = {
    id: `docs:${entry.id}`,
    kind: "design_use_case",
    label: entry.title,
    source: { type: "durable_document", id: entry.htmlPath || entry.id },
    anchor: { kind: "design_use_case", id: entry.id, path: entry.htmlPath },
    path: entry.htmlPath,
    summary: entry.summary,
    status,
    metadata: {
      confidence,
      contextId: entry.contextTitle,
      sourceSpecPaths: [entry.htmlPath, "docs/design/use-case-diagrams-maps.md"].filter(Boolean),
      drilldownCount: entry.drilldownCount,
      updatedAt: entry.updatedAt
    }
  };
  const drilldownCount = entry.drilldownCount ?? 0;
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary ?? "",
    status,
    confidence,
    contextId: entry.contextTitle,
    contextTitle: entry.contextTitle,
    evidenceCount: 0,
    questionCount: 0,
    nodeCount: 1 + drilldownCount,
    edgeCount: 0,
    node,
    viewRecord: undefined,
    drilldownNodes: []
  };
}

function uniqueRuntimeNodes(nodes: RuntimeProjectedGraphNode[]): RuntimeProjectedGraphNode[] {
  const seen = new Set<string>();
  const uniqueNodes: RuntimeProjectedGraphNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    uniqueNodes.push(node);
  }
  return uniqueNodes;
}

interface DesignMetricProbeGroup {
  count?: number;
  boundary?: string;
  items: DesignMetricProbeItem[];
}

const metricProbeKinds: DesignMetricProbeKind[] = ["nodes", "edges", "evidence", "questions"];

function buildDesignMetricProbes(
  item: UseCaseDiagramItem,
  html: string,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): DesignMetricProbe[] {
  const parsedGroups = parseDesignMetricProbeGroups(html);
  const fallbackGroups = buildFallbackDesignMetricProbeGroups(item, t);
  return metricProbeKinds.map((kind) => {
    const parsed = parsedGroups[kind];
    const fallback = fallbackGroups[kind];
    const hasParsedGroup = parsed.count !== undefined || parsed.items.length > 0;
    const group = hasParsedGroup ? parsed : fallback;
    return {
      kind,
      label: designMetricProbeLabel(kind, t),
      value: group.count ?? group.items.length,
      boundary: group.boundary ?? fallback.boundary,
      items: group.items
    };
  });
}

function parseDesignMetricProbeGroups(html: string): Record<DesignMetricProbeKind, DesignMetricProbeGroup> {
  const groups = emptyDesignMetricProbeGroups();
  if (!html.trim() || typeof DOMParser === "undefined") return groups;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const kind of metricProbeKinds) {
    const groupElement = doc.querySelector(`.metric-group[data-praxis-metric-kind="${kind}"]`);
    const count = groupElement ? Number(groupElement.getAttribute("data-praxis-metric-count")) : NaN;
    groups[kind].count = Number.isFinite(count) ? count : undefined;
    groups[kind].boundary = groupElement ? directChildText(groupElement, "p") : undefined;
    const itemElements = Array.from(
      (groupElement ?? doc).querySelectorAll(`li[data-praxis-metric-kind="${kind}"]`)
    );
    groups[kind].items = itemElements.flatMap((element): DesignMetricProbeItem[] => {
      if (element.classList.contains("empty")) return [];
      const label = element.querySelector("strong")?.textContent?.trim() ?? "";
      if (!label) return [];
      const rawDescriptor = element.querySelector("span")?.textContent?.trim() ?? "";
      const [descriptorKind, descriptorId] = rawDescriptor.split("·").map((part) => part.trim());
      return [{
        id: element.getAttribute("data-praxis-metric-id") ?? descriptorId ?? label,
        kind: element.getAttribute("data-praxis-kind") ?? descriptorKind ?? kind,
        label,
        detail: directChildText(element, "p"),
        excerpt: element.querySelector("[data-praxis-evidence-excerpt]")?.textContent?.trim() || undefined,
        anchor: element.getAttribute("data-praxis-anchor") ?? undefined
      }];
    });
  }
  return groups;
}

function emptyDesignMetricProbeGroups(): Record<DesignMetricProbeKind, DesignMetricProbeGroup> {
  return {
    nodes: { items: [] },
    edges: { items: [] },
    evidence: { items: [] },
    questions: { items: [] }
  };
}

function buildFallbackDesignMetricProbeGroups(
  item: UseCaseDiagramItem,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): Record<DesignMetricProbeKind, DesignMetricProbeGroup> {
  const nodeLabels = new Map<string, string>();
  for (const node of item.viewRecord?.view.nodes ?? []) {
    nodeLabels.set(node.id, node.label);
  }
  const nodes = item.viewRecord?.view.nodes.map((node) => ({
    id: node.anchor.id || node.id,
    kind: node.kind,
    label: node.label,
    detail: node.summary,
    anchor: node.anchor.id
  })) ?? [{
    id: item.id,
    kind: "design_use_case",
    label: item.title,
    detail: item.summary,
    anchor: item.id
  }];
  const edges = item.viewRecord?.view.edges.map((edge) => ({
    id: edge.id,
    kind: edge.kind,
    label: `${nodeLabels.get(edge.sourceId) ?? edge.sourceId} -> ${nodeLabels.get(edge.targetId) ?? edge.targetId}`,
    detail: edge.summary,
    anchor: edge.anchor.id
  })) ?? [];
  const evidence = unique([
    ...metadataStringArray(item.node, "sourceSpecPaths").map((value) => `source_spec:${value}`),
    ...metadataStringArray(item.node, "sourceMemoryIds").map((value) => `source_memory:${value}`),
    ...metadataStringArray(item.node, "sourceModelIds").map((value) => `source_model:${value}`),
    ...metadataStringArray(item.node, "sourceCodeFactIds").map((value) => `source_code_fact:${value}`),
    ...(item.viewRecord?.view.sourceSpecPaths ?? []).map((value) => `source_spec:${value}`),
    ...(item.viewRecord?.view.sourceMemoryIds ?? []).map((value) => `source_memory:${value}`),
    ...(item.viewRecord?.view.sourceModelIds ?? []).map((value) => `source_model:${value}`)
  ]).map((value) => {
    const [kind, ...rest] = value.split(":");
    const label = rest.join(":");
    return {
      id: label,
      kind,
      label,
      detail: t("design.statFallbackEvidence"),
      anchor: item.id
    };
  });
  const questions = unique([
    ...metadataStringArray(item.node, "questions"),
    ...(item.viewRecord?.view.annotations ?? [])
      .filter((annotation) => annotation.anchor?.id === item.id || annotation.targetNodeIds.includes(item.node.id))
      .map((annotation) => annotation.summary)
  ]).map((question, index) => ({
    id: `question:${item.id}:${index + 1}`,
    kind: "design_question",
    label: question,
    anchor: item.id
  }));
  return {
    nodes: { count: item.nodeCount, boundary: t("design.statNodesBoundary"), items: nodes },
    edges: { count: item.edgeCount, boundary: t("design.statEdgesBoundary"), items: edges },
    evidence: { count: item.evidenceCount, boundary: t("design.statEvidenceBoundary"), items: evidence },
    questions: { count: item.questionCount, boundary: t("design.statQuestionsBoundary"), items: questions }
  };
}

function designMetricProbeLabel(
  kind: DesignMetricProbeKind,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): string {
  if (kind === "nodes") return t("design.nodes");
  if (kind === "edges") return t("design.edges");
  if (kind === "evidence") return t("design.evidence");
  return t("design.questions");
}

function directChildText(element: Element, tagName: string): string | undefined {
  const child = Array.from(element.children).find((candidate) => candidate.tagName.toLowerCase() === tagName);
  const value = child?.textContent?.trim();
  return value || undefined;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function metadataString(node: RuntimeProjectedGraphNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataNumber(node: RuntimeProjectedGraphNode, key: string): number | undefined {
  const value = node.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataStringArray(node: RuntimeProjectedGraphNode, key: string): string[] {
  const value = node.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function formatStoryIntakeResult(
  result: RuntimeDesignStoryIntakeResult,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): string {
  const parts = [
    result.summary,
    result.accepted ? `${t("design.agentUpdatedDocs")} ${result.addedUseCaseIds.length}` : result.reason,
    formatVersionDecision(result.versionDecision),
    result.guidance,
    formatNamedList("Missing", result.missingParts),
    formatNamedList("Questions", result.questions)
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function formatVersionDecision(decision: RuntimeDesignStoryIntakeResult["versionDecision"]): string {
  if (!decision) return "";
  return [
    "Version decision:",
    `- ${decision.currentVersion} -> ${decision.nextVersion} (${String(decision.bump).toUpperCase()})`,
    `- ${decision.reason}`,
    `- Commit: ${decision.commitSummary}`,
    `- Atomic scope: ${decision.atomicCommitScope}`
  ].filter((line) => line.trim().length > 0).join("\n");
}

function formatDiagramDiscussionResult(result: RuntimeDesignDiagramDiscussionResult): string {
  const parts = [
    result.answer,
    result.guidance,
    formatNamedList("Anchors", result.referencedAnchors),
    formatNamedList("Operations", result.suggestedOperations),
    formatAffectedDocuments(result.affectedDocuments),
    formatDocumentEditResults(result.documentEdits),
    formatNamedList("Risks", result.risks),
    formatNamedList("Questions", result.questions)
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function formatDocumentEditResults(values: RuntimeDiagramDocumentEditResult[] | undefined): string {
  if (!values?.length) return "";
  return [
    "Document edits:",
    ...values.map((item) => {
      const state = item.changed ? `${item.status}, changed` : item.status;
      return `- ${item.path} (${item.operation}, ${state}): ${item.message}${item.reason ? ` · ${item.reason}` : ""}`;
    })
  ].join("\n");
}

function formatAffectedDocuments(values: RuntimeDesignAffectedDocument[] | undefined): string {
  if (!values?.length) return "";
  return [
    "Linked documents:",
    ...values.map((item) => {
      const status = item.update === "must_update" ? "must update" : item.update === "no_change" ? "no change" : "review";
      return `- ${item.path} (${item.kind}, ${status}): ${item.reason}`;
    })
  ].join("\n");
}

function formatNamedList(title: string, values: string[]): string {
  return values.length ? `${title}:\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

function formatDesignGenerationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.includes("\"path\"") && trimmed.includes("\"message\"")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const issues = parsed
          .filter((item): item is { path?: unknown[]; message?: string } => Boolean(item) && typeof item === "object")
          .slice(0, 8)
          .map((item) => {
            const path = Array.isArray(item.path) ? item.path.join(".") : "unknown";
            return `${path}: ${item.message ?? "invalid value"}`;
          });
        if (issues.length) {
          return [
            "Design Discovery returned an interaction model that did not match the required schema.",
            "The runtime now normalizes recoverable candidate output; rerun Design Discovery after updating.",
            formatNamedList("Schema issues", issues)
          ].join("\n\n");
        }
      }
    } catch {
      return raw;
    }
  }
  return raw;
}

function designDocumentStatusLabel(
  state: DesignDocumentState,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
): string {
  if (state === "loading") return t("design.statusLoading");
  if (state === "ready") return t("design.statusReady");
  if (state === "missing") return t("design.statusMissing");
  if (state === "generating") return t("design.statusGenerating");
  if (state === "error") return t("design.statusError");
  return t("design.statusIdle");
}

function sanitizeSemanticHtml(html: string): string {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
