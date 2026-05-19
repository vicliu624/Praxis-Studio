import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { generateTask, readGraph, runChat, type RuntimeEdge, type RuntimeGraph, type RuntimeNode } from "../runtimeClient";

interface DevelopmentGraphWorkspacePageProps {
  projectRoot: string;
  graph: RuntimeGraph | null;
  onGraphLoaded: (graph: RuntimeGraph) => void;
}

type SelectedTarget = { type: "node"; item: RuntimeNode } | { type: "edge"; item: RuntimeEdge };

export function DevelopmentGraphWorkspacePage({ projectRoot, graph, onGraphLoaded }: DevelopmentGraphWorkspacePageProps) {
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [instruction, setInstruction] = useState("Explain the selected target.");
  const [response, setResponse] = useState("");
  const [plan, setPlan] = useState<unknown>(null);
  const [status, setStatus] = useState("");

  const visibleNodes = graph?.nodes.slice(0, 24) ?? [];
  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);
  const edgeById = useMemo(() => new Map((graph?.edges ?? []).map((edge) => [edge.id, edge])), [graph]);
  const flowNodes = useMemo<FlowNode[]>(() => buildFlowNodes(graph?.nodes ?? []), [graph]);
  const flowEdges = useMemo<FlowEdge[]>(() => buildFlowEdges(graph?.edges ?? [], nodeById), [graph, nodeById]);

  async function loadGraph() {
    if (!projectRoot) return;
    setStatus("Loading graph...");
    const loaded = await readGraph(projectRoot);
    onGraphLoaded(loaded);
    setStatus("");
  }

  async function submit(mode: "explain" | "plan") {
    if (!selected || !projectRoot) return;
    setStatus(mode === "plan" ? "Planning..." : "Explaining...");
    const result = await runChat(projectRoot, selected.item.id, mode, instruction);
    setResponse(result.message);
    if (mode === "plan") setPlan(result.structured);
    setStatus("");
  }

  async function createTask() {
    if (!plan || !projectRoot) return;
    setStatus("Generating TASK.md...");
    const result = await generateTask(projectRoot, plan);
    setResponse(result);
    setStatus("");
  }

  return (
    <section className="workspace-layout" aria-labelledby="workspace-title">
      <aside className="panel outline-panel">
        <p className="eyebrow">Development Graph</p>
        <h1 id="workspace-title">Workspace</h1>
        <button className="secondary-action full-width" type="button" disabled={!projectRoot} onClick={loadGraph}>
          Load .distinction Graph
        </button>
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
              <small>{Math.round(node.progress * 100)}%</small>
            </button>
          ))}
          {!graph ? (
            <div className="empty-state compact">
              <strong>No confirmed graph</strong>
              <span>Open a project or create one first.</span>
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
              <div className="graph-empty-node">Project</div>
              <div className="graph-empty-node muted">Node</div>
              <div className="graph-empty-edge">edge progress</div>
            </div>
          )}
        </div>
      </section>

      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <h2>Inspector</h2>
          <span className="pill">Target-bound</span>
        </div>
        <div className="selected-summary">
          <strong>{selected ? selected.item.title ?? selected.item.id : "No target selected"}</strong>
          <span>{selected?.type ?? "Select a node or edge"}</span>
        </div>
        <div className="mode-row" aria-label="Agent mode">
          <button className="active" type="button" disabled={!selected} onClick={() => submit("explain")}>
            Explain
          </button>
          <button type="button" disabled={!selected} onClick={() => submit("plan")}>
            Plan
          </button>
          <button type="button" disabled={!plan} onClick={createTask}>
            Task
          </button>
        </div>
        <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        <button className="primary-action full-width" type="button" disabled={!selected} onClick={() => submit("explain")}>
          Send
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        <pre className="agent-output">{response || "Agent output will appear here."}</pre>
      </aside>
    </section>
  );
}

function buildFlowNodes(nodes: RuntimeNode[]): FlowNode[] {
  const laneCounts = new Map<string, number>();
  return nodes.slice(0, 140).map((node) => {
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
              {Math.round(node.progress * 100)}% {node.knowledgeKind}
            </small>
          </div>
        )
      },
      style: {
        width: 190,
        border: node.kind === "risk" ? "1px solid #f97373" : "1px solid #3c4e64",
        borderRadius: 8,
        background: node.kind === "project" ? "#193229" : "#141d27",
        color: "#edf2f7"
      }
    };
  });
}

function buildFlowEdges(edges: RuntimeEdge[], nodeById: Map<string, RuntimeNode>): FlowEdge[] {
  return edges
    .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
    .slice(0, 220)
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: `${edge.kind} ${Math.round(edge.progress * 100)}%`,
      animated: edge.kind === "depends_on" || edge.riskLevel === "high",
      style: { stroke: edgeColor(edge), strokeWidth: edge.kind === "depends_on" ? 2 : 1.4 },
      labelStyle: { fill: "#b7c4d4", fontSize: 11 },
      labelBgStyle: { fill: "#0f161e", fillOpacity: 0.9 }
    }));
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
  if (edge.riskLevel === "critical" || edge.riskLevel === "high") return "#f97373";
  if (edge.kind === "depends_on") return "#6ee7d8";
  if (edge.kind === "records") return "#f6c36e";
  if (edge.kind === "validates") return "#8bb8ff";
  return "#526173";
}
