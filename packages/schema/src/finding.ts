import type { Confidence, KnowledgeKind } from "./common";
import type { CodeFactEvidenceRef } from "./code-fact";

export type ArchitectureFindingKind = "architecture_dependency_without_evidence" | "package_dependency_cycle";

export interface ArchitectureFinding {
  id: string;
  antiPatternId: ArchitectureFindingKind;
  category: "architecture";
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: Confidence;
  knowledgeKind: KnowledgeKind;
  affectedModuleIds: string[];
  affectedDependencyIds: string[];
  affectedSourcePaths: string[];
  evidence: CodeFactEvidenceRef[];
  suggestedQuestions: string[];
  suggestedPlanActions: string[];
  status: "open" | "acknowledged" | "planned" | "in_progress" | "mitigated" | "resolved" | "false_positive" | "accepted_risk";
  createdAt: string;
  updatedAt: string;
}

export interface ArchitectureFindingReport {
  schemaVersion: "praxis.architectureFindingReport.v1";
  root: string;
  generatedAt: string;
  findings: ArchitectureFinding[];
  detectorIds: string[];
}
