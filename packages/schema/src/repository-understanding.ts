import type { Confidence, KnowledgeKind } from "./common";
import type { CodeFactEvidenceRef, CodeFactGraphSnapshot } from "./code-fact";

export type MemoryPatchStatus = "proposed" | "accepted" | "rejected";

export interface MemoryRecord {
  id: string;
  kind: KnowledgeKind;
  type: string;
  subject: string;
  predicate: string;
  object?: string;
  value?: unknown;
  summary: string;
  evidence: CodeFactEvidenceRef[];
  source: "code_fact_graph" | "repository_scan" | "static_analysis" | "agent" | "user";
  confidence: Confidence;
  status: "proposed" | "active" | "stale" | "deprecated";
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPatch {
  id: string;
  operation: "append";
  status: MemoryPatchStatus;
  record: MemoryRecord;
  sourceCodeFactIds: string[];
}

export interface ReviewQuestion {
  id: string;
  question: string;
  targetId?: string;
}

export interface UnderstandingWarning {
  id: string;
  severity: "info" | "warning";
  summary: string;
}

export interface RepositoryUnderstandingPatch {
  schemaVersion: "praxis.repositoryUnderstandingPatch.v1";
  root: string;
  generatedAt: string;
  sourceSnapshot: {
    schemaVersion: CodeFactGraphSnapshot["schemaVersion"];
    generatedAt: string;
    provider: CodeFactGraphSnapshot["provider"];
    statistics: CodeFactGraphSnapshot["statistics"];
  };
  memoryPatches: MemoryPatch[];
  modelPatches: [];
  findingPatches: [];
  reviewQuestions: ReviewQuestion[];
  warnings: UnderstandingWarning[];
  confidence: Confidence;
}
