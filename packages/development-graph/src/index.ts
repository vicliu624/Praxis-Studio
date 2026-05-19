import type { Evidence, Id, RiskLevel, Status } from "@praxis/core";
export type DevelopmentNodeKind = "product_intent" | "requirement" | "feature" | "architecture_component" | "task" | "code_unit" | "test_case" | "memory_event" | "risk" | "decision";
export type DevelopmentEdgeKind = "contains" | "depends_on" | "constrains" | "implements" | "validates" | "impacts" | "blocks" | "records" | "derived_from" | "conflicts_with" | "replaces" | "temporary_for";
export interface DevelopmentNode { id: Id; kind: DevelopmentNodeKind; title: string; description?: string; status: Status; progress: number; tags?: string[]; evidence?: Evidence[]; metadata?: Record<string, unknown>; }
export interface DevelopmentEdge { id: Id; source: Id; target: Id; kind: DevelopmentEdgeKind; title?: string; description?: string; status: Status; progress: number; riskLevel: RiskLevel; blockedReason?: string; evidence?: Evidence[]; metadata?: Record<string, unknown>; }
export interface DevelopmentGraph { id: Id; title: string; nodes: DevelopmentNode[]; edges: DevelopmentEdge[]; updatedAt: string; }
export function createEmptyGraph(title = "Praxis Project"): DevelopmentGraph { return { id: "graph:default", title, nodes: [], edges: [], updatedAt: new Date().toISOString() }; }
