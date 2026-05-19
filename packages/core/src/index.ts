export type Id = string;
export type Status = "draft" | "active" | "wip" | "blocked" | "done" | "stale" | "deprecated";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";
export type KnowledgeKind = "fact" | "candidate" | "inference" | "confirmed";
export interface Evidence { id: Id; kind: KnowledgeKind; source: string; summary: string; confidence: Confidence; createdAt: string; references?: string[]; }
