import type { CodeFactEdgeKind, CodeFactEvidenceRef, CodeFactNodeKind, CodeFactProviderInfo } from "./code-fact.js";

export type CodeUnderstandingSpineSource = "code_facts";

export type BehaviorTriggerKind =
  | "ui_route"
  | "cli_command"
  | "api_route"
  | "event_handler"
  | "test"
  | "package_export"
  | "runtime_config"
  | "unknown";

export type StructuralClusterKind =
  | "module"
  | "entrypoint_neighborhood"
  | "dependency_cluster";

export type RuntimeBoundaryKind =
  | "desktop_shell"
  | "frontend_app"
  | "runtime_cli"
  | "node_package"
  | "rust_runtime"
  | "build_config"
  | "test_runtime"
  | "unknown";

export type EvidenceClaimKind =
  | "entrypoint"
  | "behavior"
  | "structure"
  | "runtime_boundary"
  | "dependency"
  | "gap";

export type EvidenceClaimStrength = "weak" | "medium" | "strong";

export type CoverageLedgerKind =
  | "entrypoint"
  | "symbol"
  | "file"
  | "edge"
  | "package"
  | "runtime_boundary";

export type CoverageLedgerStatus =
  | "classified_entrypoint"
  | "classified_structural_cluster"
  | "covered_by_design"
  | "covered_by_engineering"
  | "covered_by_architecture"
  | "internal_detail"
  | "test_only"
  | "generated_or_vendor"
  | "dead_or_unreachable_candidate"
  | "unknown_gap";

export interface CodeUnderstandingSpineSourceInfo {
  source: CodeUnderstandingSpineSource;
  codeFactGraphGeneratedAt: string;
  provider: CodeFactProviderInfo;
}

export interface CodeUnderstandingSpineSummary {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  behaviorSliceCount: number;
  structuralClusterCount: number;
  runtimeBoundaryCount: number;
  evidenceClaimCount: number;
  coverageLedgerCount: number;
  unknownGapCount: number;
}

export interface BehaviorSlice {
  id: string;
  title: string;
  triggerKind: BehaviorTriggerKind;
  entrypointNodeId: string;
  entrypointName: string;
  moduleId: string;
  codeFactIds: string[];
  relationIds: string[];
  touchedFilePaths: string[];
  touchedNodeKinds: CodeFactNodeKind[];
  outgoingModuleIds: string[];
  evidence: CodeFactEvidenceRef[];
  confidence: "low" | "medium" | "high";
}

export interface StructuralCluster {
  id: string;
  title: string;
  kind: StructuralClusterKind;
  moduleId: string;
  filePaths: string[];
  nodeIds: string[];
  edgeIds: string[];
  entrypointIds: string[];
  behaviorSliceIds: string[];
  incomingModuleIds: string[];
  outgoingModuleIds: string[];
  evidence: CodeFactEvidenceRef[];
  confidence: "low" | "medium" | "high";
}

export interface RuntimeBoundary {
  id: string;
  title: string;
  kind: RuntimeBoundaryKind;
  moduleId: string;
  filePath: string;
  sourceCodeFactIds: string[];
  evidence: CodeFactEvidenceRef[];
  confidence: "low" | "medium" | "high";
}

export interface EvidenceClaim {
  id: string;
  kind: EvidenceClaimKind;
  summary: string;
  sourceCodeFactIds: string[];
  sourceRelationKinds: CodeFactEdgeKind[];
  evidence: CodeFactEvidenceRef[];
  strength: EvidenceClaimStrength;
  projectionHints: Array<"design" | "engineering" | "architecture">;
}

export interface CoverageLedgerItem {
  id: string;
  kind: CoverageLedgerKind;
  targetId: string;
  targetLabel: string;
  status: CoverageLedgerStatus;
  projectionIds: string[];
  evidence: CodeFactEvidenceRef[];
  reason: string;
}

export interface CrossPanelReconciliation {
  designProjectionIds: string[];
  engineeringProjectionIds: string[];
  architectureProjectionIds: string[];
  linkedBehaviorSliceIds: string[];
  linkedStructuralClusterIds: string[];
  linkedRuntimeBoundaryIds: string[];
  gaps: CoverageLedgerItem[];
}

export interface CodeUnderstandingSpine {
  schemaVersion: "praxis.codeUnderstandingSpine.v1";
  root: string;
  generatedAt: string;
  source: CodeUnderstandingSpineSourceInfo;
  summary: CodeUnderstandingSpineSummary;
  behaviorSlices: BehaviorSlice[];
  structuralClusters: StructuralCluster[];
  runtimeBoundaries: RuntimeBoundary[];
  evidenceClaims: EvidenceClaim[];
  coverageLedger: CoverageLedgerItem[];
  reconciliation: CrossPanelReconciliation;
}
