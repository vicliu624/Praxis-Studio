import type { CodeFactEvidenceRef } from "./code-fact";
import type { MemoryPatch } from "./repository-understanding";

export interface CodingAgentTask {
  schemaVersion: "praxis.codingAgentTask.v1";
  id: string;
  sourceFindingIds: string[];
  sourceContextPacketId?: string;
  goal: string;
  nonGoals: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  expectedOutputs: string[];
  riskNotes: string[];
  createdAt: string;
}

export interface PlanPatch {
  schemaVersion: "praxis.planPatch.v1";
  id: string;
  sourceFindingId?: string;
  sourceContextPacketId?: string;
  title: string;
  summary: string;
  strength: "conservative" | "balanced" | "aggressive";
  steps: string[];
  createdAt: string;
}

export interface FindingStatusPatch {
  schemaVersion: "praxis.findingStatusPatch.v1";
  id: string;
  sourceResultId?: string;
  sourceTaskId?: string;
  findingId: string;
  status: "open" | "acknowledged" | "planned" | "in_progress" | "mitigated" | "resolved" | "false_positive" | "accepted_risk";
  summary: string;
  rationale?: string;
  evidence: CodeFactEvidenceRef[];
  createdAt: string;
}

export interface MemorySuggestionPatch {
  schemaVersion: "praxis.memorySuggestionPatch.v1";
  id: string;
  sourceResultId?: string;
  sourceTaskId?: string;
  summary: string;
  memoryPatches: MemoryPatch[];
  createdAt: string;
}

export interface ExternalAgentResult {
  schemaVersion: "praxis.externalAgentResult.v1";
  id: string;
  taskId: string;
  status: "done" | "partial" | "failed";
  summary: string;
  changedFiles: string[];
  testResult?: string;
  evidence: CodeFactEvidenceRef[];
  memorySuggestions: MemorySuggestionPatch[];
  findingStatusSuggestions: FindingStatusPatch[];
  createdAt: string;
}
