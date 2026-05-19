export type Id = string;

export type KnowledgeKind = "FACT" | "CANDIDATE" | "INFERENCE" | "CONFIRMED";

export type Confidence = "low" | "medium" | "high";

export type Status = "draft" | "active" | "wip" | "blocked" | "done" | "stale" | "deprecated";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface Evidence {
  id: Id;
  kind: KnowledgeKind;
  source: string;
  summary: string;
  confidence: Confidence;
  createdAt: string;
  references?: string[];
}

export function createEvidence(input: Omit<Evidence, "id" | "createdAt"> & { id?: Id; createdAt?: string }): Evidence {
  return {
    id: input.id ?? `evidence:${slugify(input.source)}:${Date.now()}`,
    kind: input.kind,
    source: input.source,
    summary: input.summary,
    confidence: input.confidence,
    createdAt: input.createdAt ?? new Date().toISOString(),
    references: input.references
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
