import type { GraphAnchor } from "./graph-anchor.js";

export type ReviewSeverity = "P0" | "P1" | "P2" | "P3";

export type ReviewCategory =
  | "foundation_integrity"
  | "architecture_boundaries"
  | "dependencies_coupling"
  | "build_release"
  | "testing_verification"
  | "security_secrets"
  | "configuration_environment"
  | "code_quality_maintainability"
  | "api_contracts_data_flow"
  | "performance_resources"
  | "documentation_knowledge";

export type ReviewFindingStatus = "candidate" | "confirmed" | "dismissed" | "needs_more_evidence";

export type ReviewFindingSource = "scan" | "codegraph" | "agent" | "hybrid";

export type ReviewFindingConfidence = "high" | "medium" | "low";

export interface ReviewEvaluatorRef {
  id: string;
  name: string;
  category: ReviewCategory;
  prompt: string;
  source: "praxis-heuristic" | "pi-agent" | "hybrid";
}

export interface ReviewEvidenceRef {
  source: "repository_snapshot" | "code_fact_graph" | "memory" | "projection" | "trace" | "file" | "agent";
  path?: string;
  anchor?: GraphAnchor;
  summary: string;
  excerpt?: string;
}

export interface ReviewFinding {
  schemaVersion: "praxis.reviewFinding.v1";
  id: string;
  runId: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  status: ReviewFindingStatus;
  title: string;
  summary: string;
  whyItMatters: string;
  suggestedAction: string;
  confidence: ReviewFindingConfidence;
  source: ReviewFindingSource;
  evaluator?: ReviewEvaluatorRef;
  knowledgeKind: "CANDIDATE" | "INFERENCE";
  evidence: ReviewEvidenceRef[];
  affectedAnchors: GraphAnchor[];
  traceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRun {
  schemaVersion: "praxis.reviewRun.v1";
  id: string;
  root: string;
  generatedAt: string;
  source: "praxis-heuristic" | "pi-agent" | "hybrid";
  status: "completed" | "partial" | "failed";
  categories: ReviewCategory[];
  findingIds: string[];
  evaluatorResults?: {
    evaluator: ReviewEvaluatorRef;
    status: "completed" | "partial" | "failed";
    findingIds: string[];
    summary: string;
  }[];
  summary: {
    total: number;
    bySeverity: Record<ReviewSeverity, number>;
    byCategory: Partial<Record<ReviewCategory, number>>;
  };
  traceIds: string[];
}
