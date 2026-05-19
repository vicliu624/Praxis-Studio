import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createInitialGraph } from "@praxis/local-knowledge";
import { PraxisAgentRuntime } from "@praxis/agent-runtime";
import type { DevelopmentEdge, DevelopmentNode } from "@praxis/development-graph";
import "./styles.css";

function App() {
  const graph = useMemo(() => createInitialGraph(), []);
  const runtime = useMemo(() => new PraxisAgentRuntime(), []);
  const [selectedNode, setSelectedNode] = useState<DevelopmentNode | null>(graph.nodes[1] ?? null);
  const [selectedEdge, setSelectedEdge] = useState<DevelopmentEdge | null>(graph.edges[0] ?? null);
  const [instruction, setInstruction] = useState("这条 records 关系为什么只有 40%，缺什么？");
  const [response, setResponse] = useState("");
  async function runExplain() {
    const target = selectedEdge ? { type: "edge" as const, id: selectedEdge.id } : { type: "node" as const, id: selectedNode?.id ?? graph.nodes[0].id };
    const result = await runtime.run({ mode: "explain", graph, target, instruction, taskType: selectedEdge ? "graph.edge.explain" : "graph.node.explain" });
    setResponse(result.message);
  }
  return <main className="shell"><header className="topbar"><div><h1>Praxis Studio</h1><p>Development Graph + Project Memory</p></div><nav><button>需求</button><button>架构</button><button className="active">开发图谱</button><button>代码</button><button>记忆</button></nav></header><section className="workspace"><aside className="left"><h2>模块导航</h2>{graph.nodes.map((node)=><button key={node.id} className={selectedNode?.id===node.id?"node selected":"node"} onClick={()=>{setSelectedNode(node); setSelectedEdge(null);}}><strong>{node.title}</strong><span>{node.kind}</span><progress value={node.progress} max={1}/></button>)}</aside><section className="graph"><h2>开发图谱：模块进度 + 胶水进度</h2><p className="hint">节点表示模块进度；边表示模块之间胶水/集成进度。</p><div className="graph-canvas">{graph.nodes.map((node,index)=><button key={node.id} className={`graph-node graph-node-${index}`} onClick={()=>{setSelectedNode(node); setSelectedEdge(null);}}><strong>{node.title}</strong><span>{Math.round(node.progress*100)}%</span></button>)}{graph.edges.map((edge)=><button key={edge.id} className={selectedEdge?.id===edge.id?"edge selected-edge":"edge"} onClick={()=>{setSelectedEdge(edge); setSelectedNode(null);}}>{edge.title ?? edge.kind} · {Math.round(edge.progress*100)}%</button>)}</div></section><aside className="right"><h2>当前对象 Chat</h2><p className="context">{selectedEdge?`选中边：${selectedEdge.source} --${selectedEdge.kind}--> ${selectedEdge.target}`:`选中节点：${selectedNode?.title ?? "None"}`}</p><textarea value={instruction} onChange={(event)=>setInstruction(event.target.value)}/><button className="primary" onClick={runExplain}>Explain</button><pre>{response || "AI response will appear here."}</pre></aside></section></main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
