import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  applyPlan,
  generateTask,
  importTaskResult,
  readGraph,
  runChat,
  type RuntimeEdge,
  type RuntimeGraph,
  type RuntimeGraphPlan,
  type RuntimeNode
} from "../runtimeClient";

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
  const [plan, setPlan] = useState<RuntimeGraphPlan | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [taskResultInput, setTaskResultInput] = useState(defaultTaskResultInput);
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
    if (mode === "plan") {
      const nextPlan = asGraphPlan(result.structured);
      setPlan(nextPlan);
      setSelectedActionIds(nextPlan?.actions.map((action) => action.id) ?? []);
    }
    setStatus("");
  }

  async function applySelectedActions() {
    if (!plan || !projectRoot || !selectedActionIds.length) return;
    setStatus("Applying selected actions...");
    const result = await applyPlan(projectRoot, plan, selectedActionIds);
    setResponse(JSON.stringify(result, null, 2));
    const loaded = await readGraph(projectRoot);
    onGraphLoaded(loaded);
    setStatus("");
  }

  async function createTask() {
    if (!plan || !projectRoot) return;
    setStatus("Generating TASK.md...");
    const result = await generateTask(projectRoot, plan);
    setResponse(result);
    setStatus("");
  }

  async function importResult() {
    if (!projectRoot) return;
    setStatus("Importing task result...");
    try {
      const parsed = parseTaskResultInput(taskResultInput);
      const result = (await importTaskResult(projectRoot, parsed)) as { progressPlan?: RuntimeGraphPlan };
      setResponse(JSON.stringify(result, null, 2));
      if (result.progressPlan) {
        setPlan(result.progressPlan);
        setSelectedActionIds(result.progressPlan.actions.map((action) => action.id));
      }
    } catch (error) {
      setResponse(error instanceof Error ? error.message : String(error));
    } finally {
      setStatus("");
    }
  }

  function toggleAction(actionId: string) {
    setSelectedActionIds((current) => (current.includes(actionId) ? current.filter((id) => id !== actionId) : [...current, actionId]));
  }

  return (
    <section className="workspace-layout" aria-labelledby="workspace-title">
      <aside className="panel outline-panel">
        <p className="eyebrow">Development Graph</p>
        <h1 id="workspace-title">Workspace</h1>
        <button className="secondary-action full-width" type="button" disabled={!projectRoot} onClick={loadGraph}>
          Load .distinction Graph
        </button>
        <label className="checkbox-row">
          <input type="checkbox" checked={showCodeUnits} onChange={(event) => setShowCodeUnits(event.target.checked)} />
          Show code units
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showRisks} onChange={(event) => setShowRisks(event.target.checked)} />
          Show risks
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showTasks} onChange={(event) => setShowTasks(event.target.checked)} />
          Show tasks
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
          {selected ? <small>{selected.item.id}</small> : null}
          {selected ? (
            <small>
              {Math.round(selected.item.progress * 100)}% - {selected.item.status} - {selected.item.knowledgeKind}
              {selected.type === "edge" ? ` - ${selected.item.riskLevel}` : ""}
            </small>
          ) : null}
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

        {plan ? (
          <section className="plan-preview" aria-labelledby="plan-actions-title">
            <div className="panel-heading tight">
              <h2 id="plan-actions-title">Plan Actions</h2>
              <span className="pill">{selectedActionIds.length} selected</span>
            </div>
            <div className="action-list">
              {plan.actions.map((action) => (
                <label className="action-check" key={action.id}>
                  <input type="checkbox" checked={selectedActionIds.includes(action.id)} onChange={() => toggleAction(action.id)} />
                  <span>
                    <strong>{action.title}</strong>
                    <small>
                      {action.type} · {action.targetEdgeIds[0] ?? action.targetNodeIds[0] ?? "project"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button className="secondary-action full-width" type="button" disabled={!selectedActionIds.length} onClick={applySelectedActions}>
              Apply selected
            </button>
          </section>
        ) : null}

        <section className="task-result-panel" aria-labelledby="task-result-title">
          <h2 id="task-result-title">Import Task Result</h2>
          <textarea value={taskResultInput} onChange={(event) => setTaskResultInput(event.target.value)} />
          <p className="muted-copy compact">Paste JSON, Markdown, or a short external agent summary. Progress suggestions still require preview before apply.</p>
          <button className="secondary-action full-width" type="button" disabled={!projectRoot} onClick={importResult}>
            Import result
          </button>
        </section>

        <pre className="agent-output">{response || "Agent output will appear here."}</pre>
      </aside>

      <section className="panel timeline-panel">
        <div className="panel-heading tight">
          <h2>Trace / Memory Timeline</h2>
          <span className="pill">.distinction/memory</span>
        </div>
        <p className="muted-copy">Runtime calls, plan apply events, task imports, and memory records are persisted to traces.jsonl and changes.md.</p>
      </section>
    </section>
  );
}

const defaultTaskResultInput = JSON.stringify(
  {
    taskId: "TASK-0001",
    status: "partial",
    summary: "External coding agent returned a patch summary and progress suggestion.",
    changedFiles: [],
    testResult: "Not run",
    progressSuggestion: {
      nodeUpdates: [],
      edgeUpdates: []
    },
    memorySuggestion: ""
  },
  null,
  2
);

function asGraphPlan(value: unknown): RuntimeGraphPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as RuntimeGraphPlan;
  return Array.isArray(plan.actions) ? plan : null;
}

function parseTaskResultInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    const trimmed = input.trim();
    const taskId = trimmed.match(/TASK-\d+/i)?.[0]?.toUpperCase() ?? "TASK-0001";
    const lower = trimmed.toLowerCase();
    const status = lower.includes("failed") || lower.includes("failure") ? "failed" : lower.includes("done") || lower.includes("pass") ? "done" : "partial";
    const summary =
      trimmed
        .split(/\r?\n/)
        .map((line) => line.replace(/^[#*\-\s]+/, "").trim())
        .find(Boolean) ?? "External coding agent result imported from text.";
    const changedFiles = Array.from(
      new Set(
        [...trimmed.matchAll(/(?:^|\s)([A-Za-z0-9_.\/\\-]+\.(?:ts|tsx|js|jsx|rs|md|json|yaml|yml|toml|css|html))/g)].map((match) =>
          match[1].replace(/\\/g, "/")
        )
      )
    );
    const testResult = trimmed
      .split(/\r?\n/)
      .find((line) => line.toLowerCase().includes("test"))
      ?.trim();
    return {
      taskId,
      status,
      summary,
      changedFiles,
      testResult,
      memorySuggestion: trimmed
    };
  }
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
