import { clamp, type Confidence, type Evidence, type KnowledgeKind, type RiskLevel, type Status } from "@praxis/core";

export type DevelopmentNodeKind =
  | "project"
  | "product_intent"
  | "requirement"
  | "feature"
  | "architecture_component"
  | "task"
  | "code_unit"
  | "test_case"
  | "memory_event"
  | "risk"
  | "decision"
  | "document";

export type DevelopmentEdgeKind =
  | "contains"
  | "depends_on"
  | "constrains"
  | "implements"
  | "validates"
  | "impacts"
  | "blocks"
  | "records"
  | "derived_from"
  | "conflicts_with"
  | "replaces"
  | "temporary_for";

export interface DevelopmentNode {
  id: string;
  kind: DevelopmentNodeKind;
  title: string;
  description?: string;
  status: Status;
  progress: number;
  confidence: Confidence;
  knowledgeKind: KnowledgeKind;
  tags?: string[];
  evidence?: Evidence[];
  metadata?: Record<string, unknown>;
}

export interface DevelopmentEdge {
  id: string;
  source: string;
  target: string;
  kind: DevelopmentEdgeKind;
  title?: string;
  description?: string;
  status: Status;
  progress: number;
  riskLevel: RiskLevel;
  blockedReason?: string;
  confidence: Confidence;
  knowledgeKind: KnowledgeKind;
  evidence?: Evidence[];
  metadata?: Record<string, unknown>;
}

export interface DevelopmentGraph {
  id: string;
  title: string;
  rootPath?: string;
  nodes: DevelopmentNode[];
  edges: DevelopmentEdge[];
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface GraphAssumption {
  id: string;
  summary: string;
  confidence: Confidence;
  evidence?: Evidence[];
}

export interface GraphWarning {
  id: string;
  severity: "low" | "medium" | "high";
  summary: string;
  targetId?: string;
}

export interface GraphQuestion {
  id: string;
  question: string;
  targetId?: string;
}

export interface DevelopmentGraphCandidate {
  graph: DevelopmentGraph;
  generatedAt: string;
  source: "repository_scan" | "product_intent" | "ai_assisted" | "user_edited";
  confidence: Confidence;
  assumptions: GraphAssumption[];
  warnings: GraphWarning[];
  unresolvedQuestions: GraphQuestion[];
}

export function createEmptyGraph(title = "Praxis Project", rootPath?: string): DevelopmentGraph {
  return {
    id: "graph:default",
    title,
    rootPath,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString()
  };
}

export function findNode(graph: DevelopmentGraph, id: string): DevelopmentNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

export function findEdge(graph: DevelopmentGraph, id: string): DevelopmentEdge | undefined {
  return graph.edges.find((edge) => edge.id === id);
}

export function getIncomingEdges(graph: DevelopmentGraph, nodeId: string): DevelopmentEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}

export function getOutgoingEdges(graph: DevelopmentGraph, nodeId: string): DevelopmentEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId);
}

export function getRelatedNodes(graph: DevelopmentGraph, nodeId: string): DevelopmentNode[] {
  const ids = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === nodeId) ids.add(edge.target);
    if (edge.target === nodeId) ids.add(edge.source);
  }
  return graph.nodes.filter((node) => ids.has(node.id));
}

export function dedupeEdges(edges: DevelopmentEdge[]): DevelopmentEdge[] {
  const seen = new Set<string>();
  const result: DevelopmentEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}|${edge.kind}|${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}

export function normalizeProgress(value: number): number {
  return Number(clamp(Number.isFinite(value) ? value : 0, 0, 1).toFixed(2));
}
