import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { readGraph, type RuntimeEdge, type RuntimeGraph, type RuntimeNode } from "../runtimeClient";
import { AgentChatPanel } from "../chat/AgentChatPanel";
import { useI18n } from "../i18n";

interface DevelopmentGraphWorkspacePageProps {
  projectRoot: string;
  graph: RuntimeGraph | null;
  onGraphLoaded: (graph: RuntimeGraph) => void;
}

type SelectedTarget = { type: "node"; item: RuntimeNode } | { type: "edge"; item: RuntimeEdge };

export function DevelopmentGraphWorkspacePage({ projectRoot, graph, onGraphLoaded }: DevelopmentGraphWorkspacePageProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [showCodeUnits, setShowCodeUnits] = useState(false);
  const [showRisks, setShowRisks] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [status, setStatus] = useState("");

  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);
  const edgeById = useMemo(() => new Map((graph?.edges ?? []).map((edge) => [edge.id, edge])), [graph]);
  const displayNodes = useMemo(
    () =>
      (graph?.nodes ?? []).filter((node) => {
        if (!showCodeUnits && node.kind === "code_unit") return false;
        if (!showRisks && node.kind === "risk") return false;
        if (!showTasks && node.kind === "task") return false;
        return true;
      }),
    [graph, showCodeUnits, showRisks, showTasks]
  );
  const displayNodeIds = useMemo(() => new Set(displayNodes.map((node) => node.id)), [displayNodes]);
  const displayEdges = useMemo(
    () => (graph?.edges ?? []).filter((edge) => displayNodeIds.has(edge.source) && displayNodeIds.has(edge.target)),
    [graph, displayNodeIds]
  );
  const visibleNodes = displayNodes.slice(0, 28);
  const flowNodes = useMemo<FlowNode[]>(() => buildFlowNodes(displayNodes), [displayNodes]);
  const flowEdges = useMemo<FlowEdge[]>(() => buildFlowEdges(displayEdges, nodeById), [displayEdges, nodeById]);

  async function loadGraph() {
    if (!projectRoot) return;
    setStatus(t("workspace.loadingGraph"));
    const loaded = await readGraph(projectRoot);
    onGraphLoaded(loaded);
    setStatus("");
  }

  return (
    <section className="workspace-layout" aria-labelledby="workspace-title">
      <aside className="panel outline-panel">
        <p className="eyebrow">{t("workspace.eyebrow")}</p>
        <h1 id="workspace-title">{t("workspace.title")}</h1>
        <button className="secondary-action full-width" type="button" disabled={!projectRoot} onClick={loadGraph}>
          {t("workspace.loadGraph")}
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        <label className="checkbox-row">
          <input type="checkbox" checked={showCodeUnits} onChange={(event) => setShowCodeUnits(event.target.checked)} />
          {t("workspace.showCodeUnits")}
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showRisks} onChange={(event) => setShowRisks(event.target.checked)} />
          {t("workspace.showRisks")}
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showTasks} onChange={(event) => setShowTasks(event.target.checked)} />
          {t("workspace.showTasks")}
        </label>
        <div className="outline-list">
          {visibleNodes.map((node) => (
            <button
              className={selected?.item.id === node.id ? "outline-item active" : "outline-item"}
              key={node.id}
              type="button"
              onClick={() => setSelected({ type: "node", item: node })}
            >
              <strong>{node.title}</strong>
              <span>{node.kind}</span>
              <small>
                {Math.round(node.progress * 100)}% {node.knowledgeKind} - {node.status}
              </small>
            </button>
          ))}
          {!graph ? (
            <div className="empty-state compact">
              <strong>{t("workspace.noGraph")}</strong>
              <span>{t("workspace.openProjectFirst")}</span>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="panel graph-workspace-panel">
        <div className="flow-shell">
          {graph ? (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.2}
              maxZoom={1.4}
              onNodeClick={(_, node) => {
                const item = nodeById.get(node.id);
                if (item) setSelected({ type: "node", item });
              }}
              onEdgeClick={(_, edge) => {
                const item = edgeById.get(edge.id);
                if (item) setSelected({ type: "edge", item });
              }}
            >
              <Background color="#2a394a" gap={24} />
              <MiniMap pannable zoomable nodeStrokeWidth={2} />
              <Controls />
            </ReactFlow>
          ) : (
            <div className="graph-empty">
              <div className="graph-empty-node">{t("workspace.project")}</div>
              <div className="graph-empty-node muted">{t("workspace.node")}</div>
              <div className="graph-empty-edge">{t("workspace.edgeProgress")}</div>
            </div>
          )}
        </div>
      </section>

      <AgentChatPanel projectRoot={projectRoot} graph={graph} selectedTarget={selected} onGraphChanged={onGraphLoaded} />

      <section className="panel timeline-panel">
        <div className="panel-heading tight">
          <h2>{t("workspace.timeline")}</h2>
          <span className="pill">.distinction/memory</span>
        </div>
        <p className="muted-copy">{t("workspace.timelineCopy")}</p>
      </section>
    </section>
  );
}

function buildFlowNodes(nodes: RuntimeNode[]): FlowNode[] {
  const laneCounts = new Map<string, number>();
  return nodes.slice(0, 160).map((node) => {
    const lane = kindLane(node.kind);
    const index = laneCounts.get(node.kind) ?? 0;
    laneCounts.set(node.kind, index + 1);
    return {
      id: node.id,
      type: "default",
      position: { x: lane * 230, y: index * 104 },
      data: {
        label: (
          <div className="flow-node-label">
            <strong>{node.title}</strong>
            <span>{node.kind}</span>
            <small>
              {Math.round(node.progress * 100)}% {node.knowledgeKind} - {node.status}
            </small>
          </div>
        )
      },
      style: nodeStyle(node)
    };
  });
}

function buildFlowEdges(edges: RuntimeEdge[], nodeById: Map<string, RuntimeNode>): FlowEdge[] {
  return edges.slice(0, 260).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: `${edge.kind} ${Math.round(edge.progress * 100)}% ${edge.riskLevel}`,
    animated: edge.kind === "depends_on" || edge.riskLevel === "high" || edge.riskLevel === "critical",
    style: { stroke: edgeColor(edge), strokeWidth: edge.riskLevel === "critical" || edge.riskLevel === "high" ? 2.4 : 1.5 },
    labelStyle: { fill: "#b7c4d4", fontSize: 11 },
    labelBgStyle: { fill: "#0f161e", fillOpacity: 0.9 },
    ariaLabel: `${nodeById.get(edge.source)?.title ?? edge.source} ${edge.kind} ${nodeById.get(edge.target)?.title ?? edge.target}`
  }));
}

function nodeStyle(node: RuntimeNode): FlowNode["style"] {
  const border = node.kind === "risk" ? "1px solid #f97373" : node.kind === "task" ? "1px solid #f6c36e" : "1px solid #3c4e64";
  const background = node.kind === "project" ? "#193229" : node.kind === "document" ? "#13233a" : "#141d27";
  return {
    width: 190,
    border,
    borderRadius: 8,
    background,
    color: "#edf2f7"
  };
}

function kindLane(kind: string): number {
  if (kind === "project") return 0;
  if (kind === "architecture_component") return 1;
  if (kind === "code_unit") return 2;
  if (kind === "document") return 3;
  if (kind === "test_case") return 4;
  if (kind === "task") return 5;
  if (kind === "risk") return 6;
  return 2;
}

function edgeColor(edge: RuntimeEdge): string {
  if (edge.riskLevel === "critical") return "#ef4444";
  if (edge.riskLevel === "high") return "#f97373";
  if (edge.riskLevel === "medium") return "#f6c36e";
  if (edge.riskLevel === "low") return "#8ea0b5";
  if (edge.kind === "depends_on") return "#6ee7d8";
  if (edge.kind === "records") return "#f6c36e";
  if (edge.kind === "validates") return "#8bb8ff";
  return "#526173";
}
