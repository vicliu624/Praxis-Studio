import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import mermaid from "mermaid";
import "@xyflow/react/dist/style.css";
import {
  buildEngineeringDiagram,
  deriveEngineeringModel,
  type EngineeringDiagram,
  type EngineeringDiagramEdge,
  type EngineeringDiagramMode,
  type EngineeringDiagramNode,
  type EngineeringModel,
  type EngineeringPlanItem
} from "../engineeringModel";
import { type TranslationKey, useI18n } from "../i18n";
import {
  buildContextPacketForAnchor,
  openProjectDialog,
  readEngineeringSourceData,
  readFindingAudit,
  readProjectedGraphViews,
  refreshProjectedGraphViews,
  type RuntimeContextPacketSummary,
  type RuntimeEngineeringSourceData,
  type RuntimeFindingAuditItem,
  type RuntimeFindingAuditResult,
  type RuntimeGraphAnchor,
  type RuntimeProjectedGraphViewRecord,
  type RuntimeProjectionViewsResult
} from "../runtimeClient";

interface ProjectedGraphInspectorPageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  initialMode?: EngineeringDiagramMode;
  scope?: "architecture" | "plan";
  focusAnchor?: RuntimeGraphAnchor;
  focusToken?: number;
  onOpenReviewFinding?: (findingId: string) => void;
  onOpenAssistantDraft?: (text: string, mode?: "explain" | "plan") => void;
}

type SelectedEngineeringTarget =
  | { type: "node"; item: EngineeringDiagramNode; anchor?: RuntimeGraphAnchor }
  | { type: "edge"; item: EngineeringDiagramEdge; anchor?: RuntimeGraphAnchor };

type C4Depth = "context" | "container" | "component" | "code";

interface ProjectionProblemDraft {
  title: string;
  summary: string;
  suggestedAction: string;
  evidence?: string[];
}

export function ProjectedGraphInspectorPage({
  projectRoot,
  onProjectRootChange,
  initialMode = "c4-context",
  scope = "architecture",
  focusAnchor,
  focusToken,
  onOpenReviewFinding,
  onOpenAssistantDraft
}: ProjectedGraphInspectorPageProps) {
  const { t } = useI18n();
  const initialC4Depth = scope === "architecture" ? "context" : depthFromMode(initialMode);
  const [projectionResult, setProjectionResult] = useState<RuntimeProjectionViewsResult | null>(null);
  const [sourceData, setSourceData] = useState<RuntimeEngineeringSourceData | null>(null);
  const [mode, setMode] = useState<EngineeringDiagramMode>(scope === "plan" ? "project-plan" : initialMode === "project-plan" ? "c4-context" : initialMode);
  const [c4Depth, setC4Depth] = useState<C4Depth>(initialC4Depth);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SelectedEngineeringTarget | null>(null);
  const [contextPacket, setContextPacket] = useState<RuntimeContextPacketSummary | null>(null);
  const [findingAudit, setFindingAudit] = useState<RuntimeFindingAuditResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [refreshingPlanModuleId, setRefreshingPlanModuleId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setProjectionResult(null);
      setSourceData(null);
      setSelectedModuleId(null);
      setSelectedTarget(null);
      setContextPacket(null);
      setFindingAudit(null);
      return;
    }
    void loadEngineeringViews();
  }, [projectRoot]);

  useEffect(() => {
    if (scope !== "architecture") return;
    setC4Depth("context");
    setSelectedModuleId(null);
    setSelectedTarget(null);
    setContextPacket(null);
  }, [scope, projectRoot]);

  useEffect(() => {
    if (scope === "plan") {
      setMode("project-plan");
      return;
    }
    setMode(modeFromDepth(c4Depth));
  }, [scope, c4Depth]);

  const projectionRecords = projectionResult?.records ?? [];
  const model = useMemo<EngineeringModel>(
    () => deriveEngineeringModel(projectRoot, sourceData, projectionRecords),
    [projectRoot, sourceData, projectionRecords]
  );
  const diagram = useMemo<EngineeringDiagram>(
    () => buildEngineeringDiagram(model, mode, selectedModuleId),
    [model, mode, selectedModuleId]
  );
  const nodeById = useMemo(() => new Map(diagram.nodes.map((node) => [node.id, node])), [diagram]);
  const edgeById = useMemo(() => new Map(diagram.edges.map((edge) => [edge.id, edge])), [diagram]);
  const flowNodes = useMemo(() => buildFlowNodes(diagram, mode), [diagram, mode]);
  const flowEdges = useMemo(() => buildFlowEdges(diagram.edges), [diagram.edges]);
  const auditForSelectedFinding = useMemo(() => {
    if (selectedTarget?.anchor?.kind !== "finding") return null;
    return findingAudit?.findings.find((item) => item.findingId === selectedTarget.anchor?.id) ?? null;
  }, [findingAudit, selectedTarget]);

  useEffect(() => {
    if (!focusAnchor || !diagram.nodes.length) return;
    const match = findTargetForAnchor(diagram, focusAnchor);
    if (!match) return;
    setSelectedTarget(match);
    setContextPacket(null);
  }, [focusAnchor, focusToken, diagram]);

  async function chooseProjectRoot() {
    const selected = await openProjectDialog(t("projection.openProject"));
    if (selected) onProjectRootChange(selected);
  }

  async function loadEngineeringViews() {
    if (!projectRoot) return;
    setStatus(t("projection.loading"));
    setError("");
    try {
      const [nextProjection, nextSourceData, nextAudit] = await Promise.all([
        readProjectedGraphViews(projectRoot).catch(() => ({ manifest: null, records: [], skippedPaths: [] })),
        readEngineeringSourceData(projectRoot),
        readFindingAudit(projectRoot).catch(() => null)
      ]);
      setProjectionResult(nextProjection);
      setSourceData(nextSourceData);
      setFindingAudit(nextAudit);
      setSelectedTarget(null);
      setContextPacket(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setStatus("");
    }
  }

  async function refreshViews() {
    if (!projectRoot) return;
    setStatus(t("projection.regenerating"));
    setError("");
    try {
      const refreshed = await refreshProjectedGraphViews(projectRoot).catch(() => ({ manifest: null, records: [], skippedPaths: [] }));
      const [nextSourceData, nextAudit] = await Promise.all([
        readEngineeringSourceData(projectRoot),
        readFindingAudit(projectRoot).catch(() => null)
      ]);
      setProjectionResult(refreshed);
      setSourceData(nextSourceData);
      setFindingAudit(nextAudit);
      setSelectedTarget(null);
      setContextPacket(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setStatus("");
    }
  }

  async function inspectContext() {
    if (!projectRoot || !selectedTarget?.anchor) return;
    const draft = buildSelectedTargetAssistantDraft(projectRoot, scope, c4Depth, diagram, selectedTarget);
    if (onOpenAssistantDraft) {
      onOpenAssistantDraft(draft, "explain");
      return;
    }
    setStatus(t("projection.buildingContext"));
    setError("");
    try {
      const packet = await buildContextPacketForAnchor(projectRoot, selectedTarget.anchor, "explain");
      setContextPacket(packet);
    } catch (packetError) {
      setError(packetError instanceof Error ? packetError.message : String(packetError));
    } finally {
      setStatus("");
    }
  }

  function selectNode(nodeId: string) {
    const node = nodeById.get(nodeId);
    if (!node) return;
    setSelectedTarget({ type: "node", item: node, anchor: node.anchor });
    setContextPacket(null);
  }

  function selectEdge(edgeId: string) {
    const edge = edgeById.get(edgeId);
    if (!edge) return;
    setSelectedTarget({ type: "edge", item: edge, anchor: edge.anchor });
    setContextPacket(null);
  }

  function drillIntoNode(nodeId: string) {
    if (scope !== "architecture") return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    selectNode(nodeId);
    if (c4Depth === "context" && node.kind === "software_system" && node.id === "system:project") {
      setC4Depth("container");
      setSelectedTarget(null);
      return;
    }
    if (c4Depth === "container" && node.moduleId) {
      setSelectedModuleId(node.moduleId);
      setC4Depth("component");
      return;
    }
    if (c4Depth === "component" && node.moduleId) {
      setSelectedModuleId(node.moduleId);
      setC4Depth("code");
    }
  }

  function selectArchitectureModule(moduleId: string) {
    setSelectedModuleId(moduleId);
    setContextPacket(null);
    if (c4Depth === "context") {
      setC4Depth("container");
      setSelectedTarget(null);
      return;
    }
    if (c4Depth === "container" || c4Depth === "component" || c4Depth === "code") {
      setSelectedTarget(null);
      return;
    }
    const moduleNode = diagram.nodes.find((node) => node.moduleId === moduleId) ?? diagram.nodes.find((node) => node.id === moduleId);
    if (moduleNode) setSelectedTarget({ type: "node", item: moduleNode, anchor: moduleNode.anchor });
    else setSelectedTarget(null);
  }

  function openProblemDraft(problem: ProjectionProblemDraft) {
    if (!onOpenAssistantDraft) return;
    onOpenAssistantDraft(buildProjectionProblemAssistantDraft(projectRoot, scope, problem), "plan");
  }

  function selectPlanModule(moduleId: string) {
    setSelectedModuleId(moduleId);
    setSelectedTarget(null);
    setContextPacket(null);
  }

  async function refreshPlanModule(moduleId: string) {
    setRefreshingPlanModuleId(moduleId);
    setStatus(t("projection.refreshingPlanItem"));
    try {
      await refreshViews();
      setSelectedModuleId(moduleId);
    } finally {
      setRefreshingPlanModuleId(null);
    }
  }

  return (
    <section className={`projection-inspector-layout ${scope === "plan" ? "plan-scope" : "architecture-scope"}`} aria-labelledby="projection-title">
      <aside className="panel projection-sidebar">
        <p className="eyebrow">{scope === "plan" ? t("projection.planEyebrow") : t("projection.eyebrow")}</p>
        <h1 id="projection-title">{scope === "plan" ? t("projection.planTitle") : t("projection.title")}</h1>
        <p className="muted-copy">
          {scope === "plan"
            ? t("projection.planCopy")
            : t("projection.architectureCopy")}
        </p>
        <div className="review-project-row">
          <input
            className="path-input"
            value={projectRoot}
            onChange={(event) => onProjectRootChange(event.target.value)}
            placeholder={t("projection.projectRootPlaceholder")}
          />
          <button className="secondary-action" type="button" onClick={chooseProjectRoot}>
            {t("projection.browse")}
          </button>
          <button className="secondary-action" type="button" disabled={!projectRoot || Boolean(status)} onClick={loadEngineeringViews}>
            {t("projection.loadViews")}
          </button>
        </div>
        <button className="primary-action full-width" type="button" disabled={!projectRoot || Boolean(status)} onClick={refreshViews}>
          {t("projection.regenerateViews")}
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? (
          <InlineProblemAction
            title={scope === "plan" ? "计划/甘特图刷新失败" : "UML/C4 视图刷新失败"}
            summary={error}
            actionLabel="交给 Assistant 处理"
            onAction={onOpenAssistantDraft ? () => openProblemDraft({
              title: scope === "plan" ? "计划/甘特图刷新失败" : "UML/C4 视图刷新失败",
              summary: error,
              suggestedAction: scope === "plan"
                ? "检查项目接入、需求/规格记忆、Projection Views 生成链路，并修复导致计划完成度无法刷新的问题。"
                : "检查 CodeGraph provider、intake、代码事实缓存和 UML/C4 图生成链路，并修复导致视图无法刷新的问题。"
            }) : undefined}
          />
        ) : null}

        {scope === "architecture" ? (
          <C4Breadcrumb depth={c4Depth} model={model} selectedModuleId={selectedModuleId} onNavigate={(nextDepth) => {
            setC4Depth(nextDepth);
            if (nextDepth === "context") {
              setSelectedModuleId(null);
              setSelectedTarget(null);
            }
            if (nextDepth === "container") setSelectedTarget(null);
            setContextPacket(null);
          }} />
        ) : null}

        <SourceHealthList
          model={model}
          projectionRecords={projectionRecords}
          onOpenProblemDraft={onOpenAssistantDraft ? openProblemDraft : undefined}
        />
        <SpecGapList gaps={model.specGaps} onOpenProblemDraft={onOpenAssistantDraft ? openProblemDraft : undefined} />
        <ModuleOutline
          model={model}
          mode={mode}
          depth={scope === "architecture" ? c4Depth : undefined}
          selectedModuleId={selectedModuleId}
          onSelectModule={scope === "architecture" ? selectArchitectureModule : selectPlanModule}
        />
      </aside>

      {scope === "plan" ? (
        <PlanCompletionBoard
          model={model}
          selectedModuleId={selectedModuleId}
          refreshingModuleId={refreshingPlanModuleId}
          onSelectModule={selectPlanModule}
          onRefreshModule={(moduleId) => void refreshPlanModule(moduleId)}
          onOpenProblemDraft={onOpenAssistantDraft ? openProblemDraft : undefined}
        />
      ) : (
        <section className="panel graph-workspace-panel projection-graph-panel">
          <div className="engineering-diagram-header with-breadcrumb">
            <div>
              <C4Breadcrumb depth={c4Depth} model={model} selectedModuleId={selectedModuleId} onNavigate={(nextDepth) => {
                setC4Depth(nextDepth);
                if (nextDepth === "context") {
                  setSelectedModuleId(null);
                  setSelectedTarget(null);
                }
                if (nextDepth === "container") setSelectedTarget(null);
                setContextPacket(null);
              }} />
              <strong>{diagram.title}</strong>
              <span>{diagram.summary}</span>
            </div>
            <div className="engineering-diagram-actions">
              <span className="pill">{diagram.nodes.length} {t("projection.nodes")} / {diagram.edges.length} {t("projection.edges")}</span>
              <button className="text-button" type="button" disabled={!projectRoot || Boolean(status)} onClick={refreshViews}>
                {status ? t("projection.refreshing") : t("projection.refreshDiagram")}
              </button>
            </div>
          </div>
          {mode === "uml-code" ? (
            <MermaidClassDiagram diagram={diagram} />
          ) : diagram.nodes.length ? (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.16}
              maxZoom={1.45}
              onNodeClick={(_, node) => selectNode(node.id)}
              onNodeDoubleClick={(_, node) => drillIntoNode(node.id)}
              onEdgeClick={(_, edge) => selectEdge(edge.id)}
            >
              <Background color="#2a394a" gap={24} />
              <MiniMap pannable zoomable nodeStrokeWidth={2} />
              <Controls />
            </ReactFlow>
          ) : (
            <div className="graph-empty">
              <div className="graph-empty-node">{t("projection.noArchitectureModel")}</div>
              <div className="graph-empty-node muted">{t("projection.runIntakeFirst")}</div>
              <div className="graph-empty-edge">{t("projection.codeDerivedOnly")}</div>
              {onOpenAssistantDraft ? (
                <button
                  className="secondary-action graph-empty-action"
                  type="button"
                  onClick={() => openProblemDraft({
                    title: "UML/C4 画布没有可绘制内容",
                    summary: `当前 ${diagramModeLabel(mode, t)} 没有节点。通常是 CodeGraph 没有生成符号事实、项目接入没有刷新，或当前层级缺少选中的 Container/Component。`,
                    suggestedAction: "使用 CodeGraph 重新生成 code-fact-graph，确认 .distinction/cache/code-fact-graph.json 中包含 class/interface/function/method 等符号，并修复 C4 层级到 UML Code Diagram 的数据映射。"
                  })}
                >
                  交给 Assistant 处理
                </button>
              ) : null}
            </div>
          )}
        </section>
      )}

      {scope === "architecture" ? (
        <aside className="panel projection-anchor-panel">
          <div className="panel-heading tight">
            <h2>{t("projection.viewExplanation")}</h2>
            <span className="pill">{diagramModeLabel(mode, t)}</span>
          </div>
          <ModelExplanationPanel model={model} diagram={diagram} depth={c4Depth} selectedModuleId={selectedModuleId} selectedTarget={selectedTarget} />
          {selectedTarget ? (
            <EngineeringAnchorInspector
              selected={selectedTarget}
              contextPacket={contextPacket}
              audit={auditForSelectedFinding}
              onInspectContext={inspectContext}
              onOpenReviewFinding={onOpenReviewFinding}
              disabled={Boolean(status) || !selectedTarget.anchor}
            />
          ) : (
            <div className="empty-state compact">
              <strong>{t("projection.noAnchor")}</strong>
              <span>{t("projection.selectOrDrill")}</span>
            </div>
          )}
        </aside>
      ) : null}
    </section>
  );
}

function SourceHealthList({
  model,
  projectionRecords,
  onOpenProblemDraft
}: {
  model: EngineeringModel;
  projectionRecords: RuntimeProjectedGraphViewRecord[];
  onOpenProblemDraft?: (problem: ProjectionProblemDraft) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="engineering-source-list">
      <h3>{t("projection.sourceBasis")}</h3>
      {model.sourceHealth.map((item) => (
        <div className={`engineering-source-item ${item.status}`} key={item.id}>
          <strong>{item.label}</strong>
          <span>{item.summary}</span>
          {item.status !== "ready" && onOpenProblemDraft ? (
            <button
              className="text-button inline-fix-button"
              type="button"
              onClick={() => onOpenProblemDraft({
                title: `${item.label} 未就绪`,
                summary: item.summary,
                suggestedAction: "检查项目接入、CodeGraph 索引和投影视图生成链路，补齐缺失的仓库事实后刷新当前页面。"
              })}
            >
              交给 Assistant 处理
            </button>
          ) : null}
        </div>
      ))}
      {projectionRecords.some((record) => record.view.kind === "memory" || record.view.kind === "code_fact") ? (
        <p className="engineering-boundary-note">{t("projection.rawFactsHidden")}</p>
      ) : null}
    </section>
  );
}

function SpecGapList({ gaps, onOpenProblemDraft }: { gaps: string[]; onOpenProblemDraft?: (problem: ProjectionProblemDraft) => void }) {
  const { t } = useI18n();
  if (!gaps.length) return null;
  return (
    <section className="engineering-gap-list">
      <h3>{t("projection.specGaps")}</h3>
      {gaps.map((gap) => (
        <span key={gap}>
          <strong>规格缺口</strong>
          {gap}
          {onOpenProblemDraft ? (
            <button
              className="text-button inline-fix-button"
              type="button"
              onClick={() => onOpenProblemDraft({
                title: "工程视图规格/事实缺口",
                summary: gap,
                suggestedAction: "补齐缺失的项目事实、规格或投影视图，让 UML/C4 和计划完成度都能从真实仓库事实与项目记忆生成。"
              })}
            >
              交给 Assistant 处理
            </button>
          ) : null}
        </span>
      ))}
    </section>
  );
}

function C4Breadcrumb({
  depth,
  model,
  selectedModuleId,
  onNavigate
}: {
  depth: C4Depth;
  model: EngineeringModel;
  selectedModuleId: string | null;
  onNavigate: (depth: C4Depth) => void;
}) {
  const { t } = useI18n();
  const selectedModule = model.modules.find((module) => module.id === selectedModuleId) ?? null;
  const items: { depth: C4Depth; label: string; disabled?: boolean }[] = [
    { depth: "context", label: "Context" },
    { depth: "container", label: "Container" },
    { depth: "component", label: selectedModule ? `Component: ${selectedModule.name}` : "Component", disabled: !selectedModule && (depth === "context" || depth === "container") },
    { depth: "code", label: selectedModule ? `Code: ${selectedModule.name}` : "Code Diagram", disabled: !selectedModule }
  ];
  return (
    <nav className="c4-breadcrumb" aria-label={t("projection.c4Breadcrumb")}>
      {items.map((item, index) => (
        <span key={item.depth} className="c4-breadcrumb-item">
          {index > 0 ? <span className="c4-breadcrumb-separator">/</span> : null}
          <button
            className={item.depth === depth ? "active" : ""}
            disabled={item.disabled}
            type="button"
            onClick={() => onNavigate(item.depth)}
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

function ModuleOutline({
  model,
  mode,
  depth,
  selectedModuleId,
  onSelectModule
}: {
  model: EngineeringModel;
  mode: EngineeringDiagramMode;
  depth?: C4Depth;
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string) => void;
}) {
  const { t } = useI18n();
  const architectureHint =
    depth === "context"
      ? "点击模块会进入 Container 层并聚焦它的直接关系；双击项目系统节点也能进入 Container 层。"
      : depth === "container"
        ? "点击模块会切换聚焦容器；双击画布容器进入它的 Component 层。"
        : depth === "component"
          ? "点击左侧模块会切换容器；双击画布组件进入 UML Code Diagram。"
          : depth === "code"
            ? "当前是选中容器的 UML 代码结构；刷新会重新读取当前仓库事实。"
            : "";
  return (
    <div className="outline-list">
      <h3 className="outline-heading">{mode === "project-plan" ? t("projection.planItems") : t("projection.modules")}</h3>
      {architectureHint ? <p className="outline-help">{architectureHint}</p> : null}
      {model.modules.map((module) => (
        <button
          className={selectedModuleId === module.id ? "outline-item active" : "outline-item"}
          key={module.id}
          type="button"
          onClick={() => onSelectModule(module.id)}
        >
          <strong>{module.name}</strong>
          <span>{module.role} / {module.path}</span>
          <small>
            {t("projection.moduleStats", { sources: module.sourceFiles, symbols: module.symbols, tests: module.testFiles })}
            {" / "}
            {moduleSourceLabel(module.source)}
          </small>
          <small>{moduleSourceHelp(module.source)}</small>
        </button>
      ))}
      {!model.modules.length ? (
        <div className="empty-state compact">
          <strong>{t("projection.noModules")}</strong>
          <span>{t("projection.noModulesCopy")}</span>
        </div>
      ) : null}
    </div>
  );
}

function EngineeringAnchorInspector({
  selected,
  contextPacket,
  audit,
  onInspectContext,
  onOpenReviewFinding,
  disabled
}: {
  selected: SelectedEngineeringTarget;
  contextPacket: RuntimeContextPacketSummary | null;
  audit: RuntimeFindingAuditItem | null;
  onInspectContext: () => void;
  onOpenReviewFinding?: (findingId: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const anchor = selected.anchor;
  const summary = selected.type === "node" ? selected.item.detail : selected.item.label;
  return (
    <section className="projection-anchor-inspector">
      <dl className="review-meta-grid">
        <div>
          <dt>{t("projection.selectedType")}</dt>
          <dd>{selected.type === "node" ? selected.item.kind : selected.item.kind}</dd>
        </div>
        <div>
          <dt>{t("projection.source")}</dt>
          <dd>{anchor ? `${anchor.kind}:${anchor.id}` : t("projection.derivedNoAnchor")}</dd>
        </div>
        {selected.type === "node" && selected.item.path ? (
          <div>
            <dt>{t("projection.path")}</dt>
            <dd>{selected.item.path}</dd>
          </div>
        ) : null}
        {selected.type === "edge" ? (
          <div>
            <dt>{t("projection.relationship")}</dt>
            <dd>
              {selected.item.sourceId} -&gt; {selected.item.targetId}
            </dd>
          </div>
        ) : null}
      </dl>
      {summary ? <p className="projection-anchor-summary">{summary}</p> : null}
      <button className="primary-action full-width" type="button" disabled={disabled} onClick={onInspectContext}>
        让 Assistant 解释当前对象
      </button>
      {anchor?.kind === "finding" && onOpenReviewFinding ? (
        <button className="secondary-action full-width" type="button" onClick={() => onOpenReviewFinding(anchor.id)}>
          {t("projection.openAuditInReview")}
        </button>
      ) : null}
      {contextPacket ? <ContextPacketCard packet={contextPacket} /> : null}
      {audit ? <FindingAuditMiniCard audit={audit} /> : null}
      {selected.type === "node" && selected.item.metadata ? (
        <section className="projection-metadata">
          <h3>{t("projection.metadata")}</h3>
          <dl className="metadata-list">
            {Object.entries(selected.item.metadata).map(([key, value]) => (
              <div key={key}>
                <dt>{metadataLabel(key, t)}</dt>
                <dd>{metadataValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </section>
  );
}

function ModelExplanationPanel({
  model,
  diagram,
  depth,
  selectedModuleId,
  selectedTarget
}: {
  model: EngineeringModel;
  diagram: EngineeringDiagram;
  depth: C4Depth;
  selectedModuleId: string | null;
  selectedTarget: SelectedEngineeringTarget | null;
}) {
  const { t } = useI18n();
  const selectedModule = selectedModuleId ? model.modules.find((module) => module.id === selectedModuleId) : null;
  const explanation = modelLayerExplanation(depth, model, diagram, selectedModule?.name);
  const selectionText = selectedTarget ? selectedTarget.item.label : t("projection.noSelectionSummary");
  return (
    <section className="agent-explanation-panel">
      <div className="agent-explanation-header">
        <strong>{explanation.title}</strong>
        <span>{explanation.subtitle}</span>
      </div>
      <p className="agent-explanation-copy">{explanation.body}</p>
      <p className="muted-copy">{t("projection.currentSelection", { target: selectionText })}</p>
      <div className="certainty-legend">
        <span><strong>{t("projection.confirmedLabel")}</strong>{t("projection.confirmedHelp")}</span>
        <span><strong>{t("projection.inferredLabel")}</strong>{t("projection.inferredHelp")}</span>
        <span><strong>{t("projection.insufficientLabel")}</strong>{t("projection.insufficientHelp")}</span>
      </div>
    </section>
  );
}

function PlanCompletionBoard({
  model,
  selectedModuleId,
  refreshingModuleId,
  onSelectModule,
  onRefreshModule,
  onOpenProblemDraft
}: {
  model: EngineeringModel;
  selectedModuleId: string | null;
  refreshingModuleId: string | null;
  onSelectModule: (moduleId: string) => void;
  onRefreshModule: (moduleId: string) => void;
  onOpenProblemDraft?: (problem: ProjectionProblemDraft) => void;
}) {
  const { t } = useI18n();
  const stages = groupPlanItemsByStage(model.planItems);
  return (
    <section className="panel plan-completion-board">
      <div className="plan-board-header">
        <div>
          <strong>{t("projection.planBoardTitle")}</strong>
          <span>{t("projection.planBoardCopy")}</span>
        </div>
        <span className="pill">{model.requirements.length ? t("projection.requirementsFound") : t("projection.requirementsMissing")}</span>
      </div>
      {stages.length ? (
        <div className="plan-stage-list">
          {stages.map((stage) => (
            <section className="plan-stage" key={stage.stage}>
              <h3>{t("projection.stage")} {stage.stage + 1}</h3>
              <div className="plan-stage-items">
                {stage.items.map((item) => {
                  const refreshing = refreshingModuleId === item.moduleId;
                  return (
                    <article
                      className={selectedModuleId === item.moduleId ? `plan-item-card ${item.status} active` : `plan-item-card ${item.status}`}
                      key={item.id}
                      aria-busy={refreshing}
                    >
                      <button className="plan-item-main" type="button" disabled={refreshing} onClick={() => onSelectModule(item.moduleId)}>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.path}</span>
                        </div>
                        <span className="plan-progress">{item.progress === null ? t("projection.specMissingShort") : `${Math.round(item.progress * 100)}%`}</span>
                        <p>{item.reason}</p>
                        <small>{t("projection.planDependencySummary", { dependencies: item.dependsOn.length, unlocks: item.unlocks.length })}</small>
                      </button>
                      <button className="text-button plan-card-refresh" type="button" disabled={refreshing} onClick={() => onRefreshModule(item.moduleId)}>
                        {refreshing ? t("projection.refreshing") : t("projection.refreshPlanItem")}
                      </button>
                      {item.status === "spec_missing" && onOpenProblemDraft ? (
                        <button
                          className="text-button plan-card-fix"
                          type="button"
                          disabled={refreshing}
                          onClick={() => onOpenProblemDraft({
                            title: `计划完成度缺少规格：${item.title}`,
                            summary: item.reason,
                            suggestedAction: "检查该模块是否有需求、验收标准、任务记忆和完成度证据；补齐规格后重新生成计划/完成度视图。",
                            evidence: [
                              `模块路径：${item.path}`,
                              `依赖数量：${item.dependsOn.length}`,
                              `后续解锁：${item.unlocks.length}`,
                              ...item.evidence
                            ]
                          })}
                        >
                          交给 Assistant 处理
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <strong>{t("projection.noPlan")}</strong>
          <span>{t("projection.noPlanCopy")}</span>
          {onOpenProblemDraft ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => onOpenProblemDraft({
                title: "计划/甘特图没有可展示内容",
                summary: "当前没有模块计划项。通常是项目接入未生成模块边界、需求/规格记忆缺失，或投影视图没有刷新成功。",
                suggestedAction: "检查 project-profile、architecture-model、requirements/memory 和 project:view 生成链路，恢复后刷新计划/完成度页面。"
              })}
            >
              交给 Assistant 处理
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function InlineProblemAction({
  title,
  summary,
  actionLabel,
  onAction
}: {
  title: string;
  summary: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div className="inline-problem-action" role="alert">
      <strong>{title}</strong>
      <span>{summary}</span>
      {onAction ? (
        <button className="secondary-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function MermaidClassDiagram({ diagram }: { diagram: EngineeringDiagram }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const source = diagram.uml?.source ?? "";

  useEffect(() => {
    let active = true;
    setError("");
    setSvg("");
    if (!source.trim()) {
      return () => {
        active = false;
      };
    }
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "dark",
      flowchart: { htmlLabels: true },
      class: { htmlLabels: true }
    });
    const id = `praxis-uml-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, source)
      .then((result) => {
        if (active) setSvg(result.svg);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      active = false;
    };
  }, [source]);

  return (
    <div className="uml-render-surface">
      {diagram.uml?.warnings.length ? (
        <div className="uml-warning-list">
          {diagram.uml.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
      {!source.trim() ? (
        <div className="graph-empty">
          <div className="graph-empty-node">没有可绘制的 UML 类图</div>
          <div className="graph-empty-node muted">当前层级缺少 class / interface / struct / enum 符号事实。请刷新 CodeGraph 项目接入后再进入 Code Diagram。</div>
        </div>
      ) : error ? (
        <div className="graph-empty">
          <div className="graph-empty-node">UML 渲染失败</div>
          <div className="graph-empty-node muted">{error}</div>
        </div>
      ) : svg ? (
        <>
          <div className="uml-svg-host" dangerouslySetInnerHTML={{ __html: svg }} />
          {diagram.uml?.elements.length ? (
            <div className="uml-element-strip">
              {diagram.uml.elements.slice(0, 18).map((element) => (
                <span key={element.id}>
                  <strong>{element.name}</strong>
                  {element.kind} / {element.memberCount} members / {element.relationCount} relations
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="graph-empty">
          <div className="graph-empty-node">正在渲染 UML 类图</div>
          <div className="graph-empty-edge">Mermaid classDiagram</div>
        </div>
      )}
    </div>
  );
}

function buildProjectionProblemAssistantDraft(projectRoot: string, scope: "architecture" | "plan", problem: ProjectionProblemDraft): string {
  const pageName = scope === "plan" ? "计划/甘特图" : "UML/C4 工程视图";
  return [
    `请修复 Praxis Studio 的 ${pageName} 中出现的问题。`,
    "",
    `项目路径：${projectRoot || "(未选择项目)"}`,
    `问题：${problem.title}`,
    `现象：${problem.summary}`,
    "",
    "建议处理方向：",
    problem.suggestedAction,
    "",
    ...(problem.evidence?.length ? ["相关证据：", ...problem.evidence.map((item) => `- ${item}`), ""] : []),
    "请先解释根因，再给出计划；如果需要修改 Praxis Studio 代码，请列出会修改的文件和验证方式。不要自动提交。"
  ].join("\n");
}

function buildSelectedTargetAssistantDraft(
  projectRoot: string,
  scope: "architecture" | "plan",
  depth: C4Depth,
  diagram: EngineeringDiagram,
  selected: SelectedEngineeringTarget
): string {
  const target = selected.item;
  const anchorText = selected.anchor ? `${selected.anchor.kind}:${selected.anchor.id}${selected.anchor.path ? ` (${selected.anchor.path})` : ""}` : "无锚点，仅为派生图形元素";
  const relationText = selected.type === "edge" ? `\n关系：${selected.item.sourceId} -> ${selected.item.targetId}` : "";
  const targetDetail = selected.type === "node" ? selected.item.detail : selected.item.label;
  const targetPath = selected.type === "node" ? selected.item.path : undefined;
  return [
    "请基于当前工程视图解释这个对象，并判断是否需要整改。",
    "",
    `项目路径：${projectRoot || "(未选择项目)"}`,
    `页面：${scope === "plan" ? "计划/甘特图" : "UML/C4 工程视图"}`,
    `层级：${scope === "plan" ? "Plan / Completion" : depth}`,
    `图：${diagram.title}`,
    `对象：${target.label}`,
    `类型：${selected.type === "node" ? selected.item.kind : selected.item.kind}`,
    `锚点：${anchorText}${relationText}`,
    targetDetail ? `说明：${targetDetail}` : "",
    targetPath ? `路径：${targetPath}` : "",
    "",
    "请用用户当前语言回答。先解释它在项目中的职责和上下游，再指出当前图谱/代码事实是否可信；如果发现问题，给出可执行的修复计划。不要自动发送或提交。"
  ].filter(Boolean).join("\n");
}

function depthFromMode(mode: EngineeringDiagramMode): C4Depth {
  if (mode === "c4-container") return "container";
  if (mode === "c4-component") return "component";
  if (mode === "uml-code") return "code";
  return "context";
}

function modeFromDepth(depth: C4Depth): EngineeringDiagramMode {
  if (depth === "container") return "c4-container";
  if (depth === "component") return "c4-component";
  if (depth === "code") return "uml-code";
  return "c4-context";
}

function modelLayerExplanation(
  depth: C4Depth,
  model: EngineeringModel,
  diagram: EngineeringDiagram,
  selectedModuleName?: string
): { title: string; subtitle: string; body: string } {
  const hasConfirmedArchitecture = model.sourceHealth.some((item) => item.id === "architectureModel" && item.status === "ready");
  const sourceNote = hasConfirmedArchitecture ? "其中一部分边界来自已确认架构模型。" : "当前主要是扫描推断，确认前不要当作最终模块所有权。";
  const nodeSummary = `${diagram.nodes.length} 个节点、${diagram.edges.length} 条关系`;
  if (depth === "context") {
    return {
      title: "C4 Context",
      subtitle: "系统边界与外部参与者",
      body: `这一层只回答“这个项目作为一个系统，和谁发生关系”。当前视图来自仓库扫描、项目画像和代码事实，共包含 ${nodeSummary}。${sourceNote} 双击项目系统节点会进入 Container 层。`
    };
  }
  if (depth === "container") {
    return {
      title: "C4 Container",
      subtitle: "可部署/可运行/可拥有的主要容器",
      body: `这一层把系统拆成主要模块或容器，重点看职责边界和依赖方向。当前包含 ${nodeSummary}。单击只查看对象，双击某个容器才进入它的 Component 层。`
    };
  }
  if (depth === "component") {
    return {
      title: selectedModuleName ? `C4 Component: ${selectedModuleName}` : "C4 Component",
      subtitle: "容器内部组件与主要协作关系",
      body: `这一层解释选中容器内部的组件、接口和关键代码符号。当前包含 ${nodeSummary}。双击组件可以进入 UML Code Diagram；证据不足的节点表示还不能把它当成稳定设计事实。`
    };
  }
  return {
    title: selectedModuleName ? `UML Code Diagram: ${selectedModuleName}` : "UML Code Diagram",
    subtitle: "UML 2.x 静态结构与可见设计线索",
    body: `这一层展示代码事实中可见的类、接口、函数和它们的依赖、继承、实现或关联关系。当前包含 ${nodeSummary}。这里不会猜测设计模式；只有代码事实足够时，才应把模式判断写入解释或评审。`
  };
}

function groupPlanItemsByStage(items: EngineeringPlanItem[]): { stage: number; items: EngineeringPlanItem[] }[] {
  const byStage = new Map<number, EngineeringPlanItem[]>();
  for (const item of items) {
    const bucket = byStage.get(item.stage) ?? [];
    bucket.push(item);
    byStage.set(item.stage, bucket);
  }
  return Array.from(byStage.entries())
    .sort(([left], [right]) => left - right)
    .map(([stage, stageItems]) => ({
      stage,
      items: stageItems.sort((left, right) => left.path.localeCompare(right.path))
    }));
}

function planStatusLabel(status: EngineeringPlanItem["status"]): string {
  if (status === "spec_missing") return "规格缺口";
  if (status === "tracked") return "已被项目计划跟踪";
  if (status === "verified") return "有测试/验证线索";
  if (status === "implementation_seen") return "看到实现，但缺验证";
  return "尚未看到实现";
}

function moduleSourceLabel(source: EngineeringModel["modules"][number]["source"]): string {
  if (source === "architecture_model") return "已确认架构事实";
  if (source === "project_profile") return "扫描推断，待确认";
  return "代码事实推断，待确认";
}

function moduleSourceHelp(source: EngineeringModel["modules"][number]["source"]): string {
  if (source === "architecture_model") return "这个边界来自架构模型或项目记忆，可以作为当前工程视图的可靠事实。";
  if (source === "project_profile") return "Praxis 根据目录、工程文件或包清单推断出这个边界，确认前不要当作最终模块所有权。";
  return "Praxis 从代码事实中临时归纳出这个边界，说明缺少更明确的架构/项目记忆。";
}

function metadataLabel(key: string, t: (key: TranslationKey) => string): string {
  if (key === "source") return t("projection.metadataSource");
  if (key === "confidence") return t("projection.metadataConfidence");
  if (key === "language") return t("projection.metadataLanguage");
  if (key === "symbolKind") return t("projection.metadataSymbolKind");
  if (key === "umlElement") return t("projection.metadataUmlElement");
  if (key === "status") return t("projection.status");
  if (key === "stage") return t("projection.stage");
  if (key === "progress") return t("projection.completion");
  return key;
}

function metadataValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(metadataValue).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, entryValue]) => `${key}: ${metadataValue(entryValue)}`).join("; ");
  return "无";
}

function ContextPacketCard({ packet }: { packet: RuntimeContextPacketSummary }) {
  const { t } = useI18n();
  return (
    <section className="projection-context-card">
      <h3>{t("projection.contextPacket")}</h3>
      <dl className="review-meta-grid">
        <div>
          <dt>ID</dt>
          <dd>{packet.id}</dd>
        </div>
        <div>
          <dt>{t("projection.contextScope")}</dt>
          <dd>{packet.scope.includedPaths.length} {t("projection.paths")}</dd>
        </div>
        <div>
          <dt>{t("projection.contextFacts")}</dt>
          <dd>{packet.memory.facts.length}</dd>
        </div>
        <div>
          <dt>{t("projection.contextCodeFacts")}</dt>
          <dd>
            {packet.codeFacts.nodes.length} {t("projection.nodes")} / {packet.codeFacts.edges.length} {t("projection.edges")}
          </dd>
        </div>
        <div>
          <dt>{t("projection.contextFindings")}</dt>
          <dd>{packet.findings.length}</dd>
        </div>
        <div>
          <dt>{t("projection.contextViews")}</dt>
          <dd>{packet.projections.views.length}</dd>
        </div>
      </dl>
      {packet.scope.includedPaths.length ? (
        <div className="projection-chip-list">
          {packet.scope.includedPaths.slice(0, 8).map((filePath) => (
            <span key={filePath}>{filePath}</span>
          ))}
        </div>
      ) : null}
      {packet.warnings.length ? (
        <div className="projection-warning-list">
          {packet.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FindingAuditMiniCard({ audit }: { audit: RuntimeFindingAuditItem }) {
  const { t } = useI18n();
  return (
    <section className="projection-context-card">
      <h3>{t("projection.findingAudit")}</h3>
      <dl className="review-meta-grid">
        <div>
          <dt>{t("projection.detectorState")}</dt>
          <dd>{audit.detectorState}</dd>
        </div>
        <div>
          <dt>{t("projection.currentStatus")}</dt>
          <dd>{audit.currentStatus ?? "n/a"}</dd>
        </div>
        <div>
          <dt>{t("projection.latestAccepted")}</dt>
          <dd>{audit.latestAcceptedStatus ?? "n/a"}</dd>
        </div>
        <div>
          <dt>{t("projection.auditHistory")}</dt>
          <dd>{audit.history.length}</dd>
        </div>
      </dl>
    </section>
  );
}

function buildFlowNodes(diagram: EngineeringDiagram, mode: EngineeringDiagramMode): FlowNode[] {
  const laneCounts = new Map<string, number>();
  return diagram.nodes.map((node) => {
    const lane = nodeLane(node.kind, mode);
    const index = laneCounts.get(String(lane)) ?? 0;
    laneCounts.set(String(lane), index + 1);
    const certainty = nodeCertaintyView(node);
    return {
      id: node.id,
      type: "default",
      position: { x: lane * 270, y: index * 118 },
      data: {
        label: (
          <div className="flow-node-label">
            <strong>{node.label}</strong>
            <span>{node.role ?? node.kind}</span>
            {certainty ? <em className={`certainty-label ${certainty.className}`}>{certainty.label}</em> : null}
            {certainty ? <small className="certainty-help">{certainty.help}</small> : null}
            {node.detail ? <small>{node.detail}</small> : null}
          </div>
        )
      },
      style: nodeStyle(node)
    };
  });
}

function nodeCertaintyView(node: EngineeringDiagramNode): { label: string; help: string; className: string } | null {
  if (node.kind === "spec_gap" || node.metadata?.status === "spec_missing") {
    return {
      label: "规格缺口",
      help: "缺少需求或项目记忆支撑，不能当成已完成设计。",
      className: "insufficient_evidence"
    };
  }
  if (node.certainty === "confirmed") {
    return {
      label: "已确认",
      help: "来自已确认项目记忆或显式架构事实。",
      className: "confirmed"
    };
  }
  if (node.certainty === "inferred") {
    return {
      label: "待确认",
      help: "由扫描结果推断出来，确认前只是候选理解。",
      className: "inferred"
    };
  }
  if (node.certainty === "insufficient_evidence") {
    return {
      label: "证据不足",
      help: "源码事实不足，当前只能提示缺口。",
      className: "insufficient_evidence"
    };
  }
  return null;
}

function buildFlowEdges(edges: EngineeringDiagramEdge[]): FlowEdge[] {
  return edges.slice(0, 420).map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    label: edge.label,
    animated: edge.kind === "depends_on" || edge.kind === "precedes" || edge.kind === "calls",
    style: { stroke: edgeColor(edge), strokeWidth: edge.kind === "precedes" ? 2.2 : 1.5 },
    labelStyle: { fill: "#b7c4d4", fontSize: 11 },
    labelBgStyle: { fill: "#0f161e", fillOpacity: 0.9 }
  }));
}

function nodeStyle(node: EngineeringDiagramNode): FlowNode["style"] {
  const status = String(node.metadata?.status ?? "");
  return {
    width: node.kind === "software_system" ? 250 : 220,
    border: `1px solid ${nodeBorder(node, status)}`,
    borderRadius: node.kind === "package" ? 4 : 8,
    background: nodeBackground(node, status),
    color: "#edf2f7"
  };
}

function nodeLane(kind: EngineeringDiagramNode["kind"], mode: EngineeringDiagramMode): number {
  if (mode === "c4-context") {
    if (kind === "person") return 0;
    if (kind === "software_system") return 1;
    return 2;
  }
  if (kind === "container" || kind === "package") return 0;
  if (kind === "component") return 1;
  if (kind === "interface") return 2;
  if (kind === "class") return 3;
  if (kind === "function") return 4;
  return 1;
}

function nodeBorder(node: EngineeringDiagramNode, status: string): string {
  if (status === "spec_missing" || node.kind === "spec_gap") return "#f97373";
  if (status === "verified") return "#6ee7d8";
  if (node.kind === "software_system") return "#e7a23c";
  if (node.kind === "person") return "#8bb8ff";
  if (node.kind === "interface") return "#6ee7d8";
  if (node.kind === "package") return "#9ca3af";
  return "#3c4e64";
}

function nodeBackground(node: EngineeringDiagramNode, status: string): string {
  if (status === "spec_missing" || node.kind === "spec_gap") return "#241212";
  if (status === "verified") return "#10231f";
  if (node.kind === "software_system") return "#1f1a10";
  if (node.kind === "person") return "#13233a";
  if (node.kind === "interface") return "#10231f";
  return "#141d27";
}

function edgeColor(edge: EngineeringDiagramEdge): string {
  if (edge.kind === "precedes") return "#f6c36e";
  if (edge.kind === "imports" || edge.kind === "depends_on") return "#6ee7d8";
  if (edge.kind === "calls") return "#8bb8ff";
  return "#526173";
}

function diagramModeLabel(mode: EngineeringDiagramMode, t: (key: TranslationKey) => string): string {
  if (mode === "c4-context") return "C4 Context";
  if (mode === "c4-container") return "C4 Container";
  if (mode === "c4-component") return "C4 Component";
  if (mode === "uml-code") return "UML Code Diagram";
  if (mode === "uml-package") return "UML Package";
  if (mode === "uml-component") return "UML Component";
  return t("projection.planEyebrow");
}

function findTargetForAnchor(diagram: EngineeringDiagram, anchor: RuntimeGraphAnchor): SelectedEngineeringTarget | null {
  const node = diagram.nodes.find((item) => item.anchor && graphAnchorMatches(item.anchor, anchor));
  if (node) return { type: "node", item: node, anchor: node.anchor };
  const edge = diagram.edges.find((item) => item.anchor && graphAnchorMatches(item.anchor, anchor));
  if (edge) return { type: "edge", item: edge, anchor: edge.anchor };
  return null;
}

function graphAnchorMatches(candidate: RuntimeGraphAnchor, requested: RuntimeGraphAnchor): boolean {
  if (candidate.kind !== requested.kind) return false;
  if (candidate.id !== requested.id) return false;
  if (requested.path && candidate.path && requested.path !== candidate.path) return false;
  return true;
}
