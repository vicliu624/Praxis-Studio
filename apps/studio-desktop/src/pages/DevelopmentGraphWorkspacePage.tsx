import { useMemo, useState } from "react";
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
  const visibleEdges = graph?.edges.slice(0, 32) ?? [];
  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);

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
        <div className="graph-list">
          {visibleEdges.map((edge) => (
            <button
              className={selected?.item.id === edge.id ? "graph-edge-card active" : "graph-edge-card"}
              key={edge.id}
              type="button"
              onClick={() => setSelected({ type: "edge", item: edge })}
            >
              <strong>{edge.kind}</strong>
              <span>{nodeById.get(edge.source)?.title ?? edge.source}</span>
              <span>{nodeById.get(edge.target)?.title ?? edge.target}</span>
              <small>{Math.round(edge.progress * 100)}% · {edge.knowledgeKind}</small>
            </button>
          ))}
          {!graph ? (
            <div className="graph-empty">
              <div className="graph-empty-node">Project</div>
              <div className="graph-empty-node muted">Node</div>
              <div className="graph-empty-edge">edge progress</div>
            </div>
          ) : null}
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
