import {
  findEdge,
  findNode,
  getIncomingEdges,
  getOutgoingEdges,
  getRelatedNodes,
  type DevelopmentEdge,
  type DevelopmentGraph,
  type DevelopmentGraphCandidate,
  type DevelopmentNode
} from "@praxis/development-graph";

export type SelectionTarget =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

export interface BuiltContext {
  target: SelectionTarget;
  summary: string;
  nodes: DevelopmentNode[];
  edges: DevelopmentEdge[];
  constraints: string[];
  data: Record<string, unknown>;
}

export interface ProjectIntakeContext {
  snapshotSummary: {
    name: string;
    languages: string[];
    manifests: string[];
    docs: string[];
    fileCount: number;
  };
  profile: unknown;
  candidate?: DevelopmentGraphCandidate;
  moduleCandidates: unknown[];
  importRelations: unknown[];
  readmeSummary?: string;
  rules: {
    factCandidateBoundary: string;
    noAstAssumption: string;
    graphGenerationPolicy: string;
  };
}

export interface NodeContext {
  node: DevelopmentNode;
  incomingEdges: DevelopmentEdge[];
  outgoingEdges: DevelopmentEdge[];
  relatedNodes: DevelopmentNode[];
  progress: number;
  blockedReasons: string[];
  memoryEvents: unknown[];
  relevantRules: string[];
}

export interface EdgeContext {
  edge: DevelopmentEdge;
  sourceNode?: DevelopmentNode;
  targetNode?: DevelopmentNode;
  progress: number;
  blockedReason?: string;
  riskLevel: DevelopmentEdge["riskLevel"];
  relatedTasks: DevelopmentNode[];
  relatedMemoryEvents: unknown[];
  relevantRules: string[];
}

export function buildContext(graph: DevelopmentGraph, target: SelectionTarget): BuiltContext {
  if (target.type === "node") {
    const nodeContext = buildNodeContext(graph, target.id);
    return {
      target,
      summary: nodeContext ? `Selected node: ${nodeContext.node.title}` : `Missing node: ${target.id}`,
      nodes: nodeContext ? [nodeContext.node, ...nodeContext.relatedNodes] : [],
      edges: nodeContext ? [...nodeContext.incomingEdges, ...nodeContext.outgoingEdges] : [],
      constraints: ["Only discuss the selected node and directly related edges unless the user expands scope."],
      data: { nodeContext }
    };
  }

  if (target.type === "edge") {
    const edgeContext = buildEdgeContext(graph, target.id);
    return {
      target,
      summary: edgeContext ? `Selected edge: ${edgeContext.edge.title ?? edgeContext.edge.kind}` : `Missing edge: ${target.id}`,
      nodes: [edgeContext?.sourceNode, edgeContext?.targetNode].filter(Boolean) as DevelopmentNode[],
      edges: edgeContext ? [edgeContext.edge] : [],
      constraints: ["Only discuss the selected relation and its one-hop context unless the user expands scope."],
      data: { edgeContext }
    };
  }

  return buildSubgraphContext(graph, target.nodeIds, target.edgeIds);
}

export function buildProjectIntakeContext(snapshot: {
  name: string;
  statistics: { languages: Record<string, number>; fileCount: number };
  manifests: { path: string }[];
  docs: { path: string; title?: string }[];
}, profile: { moduleCandidates?: unknown[] }, candidate?: DevelopmentGraphCandidate): ProjectIntakeContext {
  return {
    snapshotSummary: {
      name: snapshot.name,
      languages: Object.keys(snapshot.statistics.languages),
      manifests: snapshot.manifests.map((manifest) => manifest.path),
      docs: snapshot.docs.map((doc) => doc.path),
      fileCount: snapshot.statistics.fileCount
    },
    profile,
    candidate,
    moduleCandidates: profile.moduleCandidates ?? [],
    importRelations: [],
    readmeSummary: snapshot.docs.find((doc) => doc.path.toLowerCase().endsWith("readme.md"))?.title,
    rules: {
      factCandidateBoundary: "Local scan facts are FACT. Agent interpretations are CANDIDATE or INFERENCE.",
      noAstAssumption: "Scanner uses lightweight text extraction and does not claim AST-level certainty.",
      graphGenerationPolicy: "Do not mark generated graph elements as CONFIRMED until user acceptance."
    }
  };
}

export function buildNodeContext(graph: DevelopmentGraph, nodeId: string): NodeContext | undefined {
  const node = findNode(graph, nodeId);
  if (!node) return undefined;
  const incomingEdges = getIncomingEdges(graph, nodeId);
  const outgoingEdges = getOutgoingEdges(graph, nodeId);
  return {
    node,
    incomingEdges,
    outgoingEdges,
    relatedNodes: getRelatedNodes(graph, nodeId),
    progress: node.progress,
    blockedReasons: [...incomingEdges, ...outgoingEdges].map((edge) => edge.blockedReason).filter(Boolean) as string[],
    memoryEvents: [],
    relevantRules: ["Explain before Plan.", "Plan before Apply.", "Existing source code is not modified automatically in v0.1."]
  };
}

export function buildEdgeContext(graph: DevelopmentGraph, edgeId: string): EdgeContext | undefined {
  const edge = findEdge(graph, edgeId);
  if (!edge) return undefined;
  return {
    edge,
    sourceNode: findNode(graph, edge.source),
    targetNode: findNode(graph, edge.target),
    progress: edge.progress,
    blockedReason: edge.blockedReason,
    riskLevel: edge.riskLevel,
    relatedTasks: graph.nodes.filter((node) => node.kind === "task" && [edge.source, edge.target].some((id) => node.metadata?.targetIds === id)),
    relatedMemoryEvents: [],
    relevantRules: ["Explain only selected edge and one-hop context.", "Graph changes require user confirmation."]
  };
}

export function buildSubgraphContext(graph: DevelopmentGraph, nodeIds: string[], edgeIds: string[]): BuiltContext {
  const nodes = graph.nodes.filter((node) => nodeIds.includes(node.id));
  const edges = graph.edges.filter((edge) => edgeIds.includes(edge.id));
  return {
    target: { type: "subgraph", nodeIds, edgeIds },
    summary: `Selected subgraph with ${nodes.length} nodes and ${edges.length} edges`,
    nodes,
    edges,
    constraints: ["Keep analysis inside the selected subgraph unless the user expands scope."],
    data: { nodes, edges }
  };
}
