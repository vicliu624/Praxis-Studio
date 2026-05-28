import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useI18n } from "../i18n";
import {
  buildContextPacketForAnchor,
  openProjectDialog,
  readFindingAudit,
  readProjectedGraphViews,
  refreshProjectedGraphViews,
  type RuntimeContextPacketSummary,
  type RuntimeFindingAuditItem,
  type RuntimeFindingAuditResult,
  type RuntimeGraphAnchor,
  type RuntimeProjectedGraphAnnotation,
  type RuntimeProjectedGraphEdge,
  type RuntimeProjectedGraphNode,
  type RuntimeProjectedGraphViewRecord,
  type RuntimeProjectionViewsResult
} from "../runtimeClient";

interface ProjectedGraphInspectorPageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  focusAnchor?: RuntimeGraphAnchor;
  focusToken?: number;
  onOpenReviewFinding?: (findingId: string) => void;
}

type SelectedAnchorTarget =
  | { type: "node"; item: RuntimeProjectedGraphNode; anchor: RuntimeGraphAnchor }
  | { type: "edge"; item: RuntimeProjectedGraphEdge; anchor: RuntimeGraphAnchor }
  | { type: "annotation"; item: RuntimeProjectedGraphAnnotation; anchor: RuntimeGraphAnchor };

export function ProjectedGraphInspectorPage({
  projectRoot,
  onProjectRootChange,
  focusAnchor,
  focusToken,
  onOpenReviewFinding
}: ProjectedGraphInspectorPageProps) {
  const { t } = useI18n();
  const [result, setResult] = useState<RuntimeProjectionViewsResult | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SelectedAnchorTarget | null>(null);
  const [contextPacket, setContextPacket] = useState<RuntimeContextPacketSummary | null>(null);
  const [findingAudit, setFindingAudit] = useState<RuntimeFindingAuditResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectRoot) {
      setResult(null);
      setSelectedViewId(null);
      setSelectedTarget(null);
      setContextPacket(null);
      setFindingAudit(null);
      return;
    }
    void loadViews();
  }, [projectRoot]);

  const records = result?.records ?? [];
  const selectedRecord = records.find((record) => record.view.id === selectedViewId) ?? records[0] ?? null;
  const displayNodes = useMemo(() => (selectedRecord?.view.nodes ?? []).slice(0, 220), [selectedRecord]);
  const nodeById = useMemo(
    () => new Map((selectedRecord?.view.nodes ?? []).map((node) => [node.id, node])),
    [selectedRecord]
  );
  const visibleEdges = useMemo(() => {
    const ids = new Set(displayNodes.map((node) => node.id));
    return (selectedRecord?.view.edges ?? []).filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId));
  }, [displayNodes, selectedRecord]);
  const flowNodes = useMemo(() => buildFlowNodes(displayNodes), [displayNodes]);
  const flowEdges = useMemo(() => buildFlowEdges(visibleEdges), [visibleEdges]);
  const auditForSelectedFinding = useMemo(() => {
    if (selectedTarget?.anchor.kind !== "finding") return null;
    return findingAudit?.findings.find((item) => item.findingId === selectedTarget.anchor.id) ?? null;
  }, [findingAudit, selectedTarget]);

  useEffect(() => {
    if (!focusAnchor || !records.length) return;
    const match = findTargetForAnchor(records, focusAnchor);
    if (!match) return;
    setSelectedViewId(match.record.view.id);
    setSelectedTarget(match.target);
    setContextPacket(null);
  }, [focusAnchor, focusToken, records]);

  async function chooseProjectRoot() {
    const selected = await openProjectDialog(t("projection.openProject"));
    if (selected) onProjectRootChange(selected);
  }

  async function loadViews() {
    if (!projectRoot) return;
    setStatus(t("projection.loading"));
    setError("");
    try {
      const next = await readProjectedGraphViews(projectRoot);
      setResult(next);
      setSelectedViewId((current) => current ?? next.records[0]?.view.id ?? null);
      setSelectedTarget(null);
      setContextPacket(null);
      setFindingAudit(await readFindingAudit(projectRoot).catch(() => null));
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
      const next = await refreshProjectedGraphViews(projectRoot);
      setResult(next);
      setSelectedViewId((current) => current ?? next.records[0]?.view.id ?? null);
      setSelectedTarget(null);
      setContextPacket(null);
      setFindingAudit(await readFindingAudit(projectRoot).catch(() => null));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setStatus("");
    }
  }

  async function inspectContext() {
    if (!projectRoot || !selectedTarget) return;
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
    const edge = selectedRecord?.view.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    setSelectedTarget({ type: "edge", item: edge, anchor: edge.anchor });
    setContextPacket(null);
  }

  function selectAnnotation(annotation: RuntimeProjectedGraphAnnotation) {
    if (!annotation.anchor) return;
    setSelectedTarget({ type: "annotation", item: annotation, anchor: annotation.anchor });
    setContextPacket(null);
  }

  return (
    <section className="projection-inspector-layout" aria-labelledby="projection-title">
      <aside className="panel projection-sidebar">
        <p className="eyebrow">{t("projection.eyebrow")}</p>
        <h1 id="projection-title">{t("projection.title")}</h1>
        <p className="muted-copy">{t("projection.copy")}</p>
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
          <button className="secondary-action" type="button" disabled={!projectRoot || Boolean(status)} onClick={loadViews}>
            {t("projection.loadViews")}
          </button>
        </div>
        <button className="primary-action full-width" type="button" disabled={!projectRoot || Boolean(status)} onClick={refreshViews}>
          {t("projection.regenerateViews")}
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <ViewSummary result={result} />
        <div className="outline-list">
          {records.map((record) => (
            <button
              className={selectedRecord?.view.id === record.view.id ? "outline-item active" : "outline-item"}
              key={`${record.path}:${record.view.id}`}
              type="button"
              onClick={() => {
                setSelectedViewId(record.view.id);
                setSelectedTarget(null);
                setContextPacket(null);
              }}
            >
              <strong>{record.view.id}</strong>
              <span>
                {record.view.kind} / {record.view.authority}
              </span>
              <small>
                {record.view.nodes.length} {t("projection.nodes")} / {record.view.edges.length} {t("projection.edges")} / {record.path}
              </small>
            </button>
          ))}
          {!records.length ? (
            <div className="empty-state compact">
              <strong>{t("projection.noViews")}</strong>
              <span>{t("projection.noViewsCopy")}</span>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="panel graph-workspace-panel projection-graph-panel">
        {selectedRecord ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            minZoom={0.18}
            maxZoom={1.45}
            onNodeClick={(_, node) => selectNode(node.id)}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
          >
            <Background color="#2a394a" gap={24} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} />
            <Controls />
          </ReactFlow>
        ) : (
          <div className="graph-empty">
            <div className="graph-empty-node">{t("projection.projectedGraph")}</div>
            <div className="graph-empty-node muted">{t("projection.anchor")}</div>
            <div className="graph-empty-edge">{t("projection.contextPacket")}</div>
          </div>
        )}
      </section>

      <aside className="panel projection-anchor-panel">
        <div className="panel-heading tight">
          <h2>{t("projection.anchorInspector")}</h2>
          <span className="pill">{selectedRecord?.view.kind ?? "ProjectedGraphView"}</span>
        </div>
        {selectedTarget ? (
          <AnchorInspector
            selected={selectedTarget}
            contextPacket={contextPacket}
            audit={auditForSelectedFinding}
            onInspectContext={inspectContext}
            onOpenReviewFinding={onOpenReviewFinding}
            disabled={Boolean(status)}
          />
        ) : (
          <div className="empty-state compact">
            <strong>{t("projection.noAnchor")}</strong>
            <span>{t("projection.selectAnchor")}</span>
          </div>
        )}

        {selectedRecord?.view.annotations.length ? (
          <section className="projection-annotation-list">
            <h3>{t("projection.annotations")}</h3>
            {selectedRecord.view.annotations.map((annotation) => (
              <button
                className={
                  selectedTarget?.type === "annotation" && selectedTarget.item.id === annotation.id
                    ? "projection-annotation active"
                    : "projection-annotation"
                }
                disabled={!annotation.anchor}
                key={annotation.id}
                type="button"
                onClick={() => selectAnnotation(annotation)}
              >
                <strong>{annotation.summary}</strong>
                <span>
                  {annotation.severity ?? annotation.kind} / {annotation.status ?? "n/a"}
                </span>
                <small>{annotation.sourceFindingId ?? annotation.id}</small>
              </button>
            ))}
          </section>
        ) : null}
      </aside>
    </section>
  );
}

function ViewSummary({ result }: { result: RuntimeProjectionViewsResult | null }) {
  const { t } = useI18n();
  if (!result?.manifest) return null;
  return (
    <section className="projection-summary">
      <div>
        <span>{t("projection.manifestViews")}</span>
        <strong>{result.manifest.views.length}</strong>
      </div>
      <div>
        <span>{t("projection.loadedViews")}</span>
        <strong>{result.records.length}</strong>
      </div>
      <div>
        <span>{t("projection.skippedViews")}</span>
        <strong>{result.skippedPaths.length}</strong>
      </div>
    </section>
  );
}

function AnchorInspector({
  selected,
  contextPacket,
  audit,
  onInspectContext,
  onOpenReviewFinding,
  disabled
}: {
  selected: SelectedAnchorTarget;
  contextPacket: RuntimeContextPacketSummary | null;
  audit: RuntimeFindingAuditItem | null;
  onInspectContext: () => void;
  onOpenReviewFinding?: (findingId: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const summary = selected.item.summary;
  const metadata = selected.item.metadata;
  return (
    <section className="projection-anchor-inspector">
      <dl className="review-meta-grid">
        <div>
          <dt>{t("projection.anchorKind")}</dt>
          <dd>{selected.anchor.kind}</dd>
        </div>
        <div>
          <dt>{t("projection.anchorId")}</dt>
          <dd>{selected.anchor.id}</dd>
        </div>
        {selected.anchor.path ? (
          <div>
            <dt>{t("projection.path")}</dt>
            <dd>{selected.anchor.path}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("projection.source")}</dt>
          <dd>{sourceLabel(selected)}</dd>
        </div>
      </dl>
      {summary ? <p className="projection-anchor-summary">{summary}</p> : null}
      <button className="primary-action full-width" type="button" disabled={disabled} onClick={onInspectContext}>
        {t("projection.buildContext")}
      </button>
      {selected.anchor.kind === "finding" && onOpenReviewFinding ? (
        <button className="secondary-action full-width" type="button" onClick={() => onOpenReviewFinding(selected.anchor.id)}>
          {t("projection.openAuditInReview")}
        </button>
      ) : null}
      {contextPacket ? <ContextPacketCard packet={contextPacket} /> : null}
      {audit ? <FindingAuditMiniCard audit={audit} /> : null}
      {metadata ? (
        <section className="projection-metadata">
          <h3>{t("projection.metadata")}</h3>
          <pre>{JSON.stringify(metadata, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
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
          <dd>{packet.scope.includedPaths.length} paths</dd>
        </div>
        <div>
          <dt>{t("projection.contextFacts")}</dt>
          <dd>{packet.memory.facts.length}</dd>
        </div>
        <div>
          <dt>{t("projection.contextCodeFacts")}</dt>
          <dd>
            {packet.codeFacts.nodes.length} nodes / {packet.codeFacts.edges.length} edges
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

function buildFlowNodes(nodes: RuntimeProjectedGraphNode[]): FlowNode[] {
  const laneCounts = new Map<string, number>();
  return nodes.map((node) => {
    const lane = kindLane(node.kind);
    const index = laneCounts.get(node.kind) ?? 0;
    laneCounts.set(node.kind, index + 1);
    return {
      id: node.id,
      type: "default",
      position: { x: lane * 250, y: index * 108 },
      data: {
        label: (
          <div className="flow-node-label">
            <strong>{node.label}</strong>
            <span>{node.kind}</span>
            <small>{node.anchor.kind}</small>
          </div>
        )
      },
      style: nodeStyle(node)
    };
  });
}

function buildFlowEdges(edges: RuntimeProjectedGraphEdge[]): FlowEdge[] {
  return edges.slice(0, 360).map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    label: edge.kind,
    animated: edge.kind === "affects" || edge.kind === "depends_on" || edge.kind === "calls",
    style: { stroke: edgeColor(edge), strokeWidth: edge.kind === "affects" ? 2.4 : 1.5 },
    labelStyle: { fill: "#b7c4d4", fontSize: 11 },
    labelBgStyle: { fill: "#0f161e", fillOpacity: 0.9 }
  }));
}

function nodeStyle(node: RuntimeProjectedGraphNode): FlowNode["style"] {
  return {
    width: 210,
    border: `1px solid ${nodeBorder(node)}`,
    borderRadius: 8,
    background: nodeBackground(node),
    color: "#edf2f7"
  };
}

function kindLane(kind: string): number {
  if (kind.includes("architecture")) return 0;
  if (kind === "finding") return 1;
  if (kind === "file") return 2;
  if (kind.includes("function") || kind.includes("method") || kind.includes("symbol")) return 3;
  if (kind.includes("memory")) return 4;
  if (kind === "task") return 5;
  if (kind.includes("trace")) return 6;
  return 2;
}

function nodeBorder(node: RuntimeProjectedGraphNode): string {
  if (node.kind === "finding") return "#f97373";
  if (node.kind.includes("memory")) return "#e7a23c";
  if (node.kind.includes("architecture")) return "#6ee7d8";
  if (node.kind === "task") return "#8bb8ff";
  return "#3c4e64";
}

function nodeBackground(node: RuntimeProjectedGraphNode): string {
  if (node.kind === "finding") return "#241212";
  if (node.kind.includes("memory")) return "#17150f";
  if (node.kind.includes("architecture")) return "#10231f";
  if (node.kind === "task") return "#13233a";
  return "#141d27";
}

function edgeColor(edge: RuntimeProjectedGraphEdge): string {
  if (edge.kind === "affects") return "#f97373";
  if (edge.kind === "depends_on" || edge.kind === "calls") return "#6ee7d8";
  if (edge.kind === "evidenced_by") return "#f6c36e";
  if (edge.kind === "includes") return "#8bb8ff";
  return "#526173";
}

function sourceLabel(selected: SelectedAnchorTarget): string {
  if (selected.type === "annotation") return selected.item.sourceFindingId ?? selected.item.kind;
  return `${selected.item.source.type}:${selected.item.source.id}`;
}

function findTargetForAnchor(
  records: RuntimeProjectedGraphViewRecord[],
  anchor: RuntimeGraphAnchor
): { record: RuntimeProjectedGraphViewRecord; target: SelectedAnchorTarget } | null {
  const sortedRecords = [...records].sort((left, right) => viewAnchorPriority(left, anchor) - viewAnchorPriority(right, anchor));
  for (const record of sortedRecords) {
    const node = record.view.nodes.find((item) => graphAnchorMatches(item.anchor, anchor));
    if (node) return { record, target: { type: "node", item: node, anchor: node.anchor } };

    const edge = record.view.edges.find((item) => graphAnchorMatches(item.anchor, anchor));
    if (edge) return { record, target: { type: "edge", item: edge, anchor: edge.anchor } };

    const annotation = record.view.annotations.find((item) => item.anchor && graphAnchorMatches(item.anchor, anchor));
    if (annotation?.anchor) return { record, target: { type: "annotation", item: annotation, anchor: annotation.anchor } };
  }
  return null;
}

function viewAnchorPriority(record: RuntimeProjectedGraphViewRecord, anchor: RuntimeGraphAnchor): number {
  if (anchor.kind === "finding" && record.view.kind === "finding") return 0;
  if (anchor.kind.startsWith("architecture_") && record.view.kind === "architecture_dependency") return 0;
  if (anchor.kind.startsWith("code_fact") && record.view.kind === "code_fact") return 0;
  return 1;
}

function graphAnchorMatches(candidate: RuntimeGraphAnchor, requested: RuntimeGraphAnchor): boolean {
  if (candidate.kind !== requested.kind) return false;
  if (candidate.id !== requested.id) return false;
  if (requested.path && candidate.path && requested.path !== candidate.path) return false;
  return true;
}
