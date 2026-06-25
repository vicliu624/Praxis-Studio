import { z } from "zod";
import { CodeFactEdgeKindSchema, CodeFactEvidenceRefSchema, CodeFactNodeKindSchema, CodeFactProviderInfoSchema } from "./code-fact.schema.js";

export const CodeUnderstandingSpineSourceSchema = z.literal("code_facts");

export const BehaviorTriggerKindSchema = z.enum([
  "ui_route",
  "cli_command",
  "api_route",
  "event_handler",
  "test",
  "package_export",
  "runtime_config",
  "unknown"
]);

export const StructuralClusterKindSchema = z.enum([
  "module",
  "entrypoint_neighborhood",
  "dependency_cluster"
]);

export const RuntimeBoundaryKindSchema = z.enum([
  "desktop_shell",
  "frontend_app",
  "runtime_cli",
  "node_package",
  "rust_runtime",
  "build_config",
  "test_runtime",
  "unknown"
]);

export const EvidenceClaimKindSchema = z.enum([
  "entrypoint",
  "behavior",
  "structure",
  "runtime_boundary",
  "dependency",
  "gap"
]);

export const EvidenceClaimStrengthSchema = z.enum(["weak", "medium", "strong"]);

export const CoverageLedgerKindSchema = z.enum([
  "entrypoint",
  "symbol",
  "file",
  "edge",
  "package",
  "runtime_boundary"
]);

export const CoverageLedgerStatusSchema = z.enum([
  "classified_entrypoint",
  "classified_structural_cluster",
  "covered_by_design",
  "covered_by_engineering",
  "covered_by_architecture",
  "internal_detail",
  "test_only",
  "generated_or_vendor",
  "dead_or_unreachable_candidate",
  "unknown_gap"
]);

export const CodeUnderstandingSpineSourceInfoSchema = z.object({
  source: CodeUnderstandingSpineSourceSchema,
  codeFactGraphGeneratedAt: z.string().min(1),
  provider: CodeFactProviderInfoSchema
});

export const CodeUnderstandingSpineSummarySchema = z.object({
  fileCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  behaviorSliceCount: z.number().int().nonnegative(),
  structuralClusterCount: z.number().int().nonnegative(),
  runtimeBoundaryCount: z.number().int().nonnegative(),
  evidenceClaimCount: z.number().int().nonnegative(),
  coverageLedgerCount: z.number().int().nonnegative(),
  unknownGapCount: z.number().int().nonnegative()
});

export const BehaviorSliceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  triggerKind: BehaviorTriggerKindSchema,
  entrypointNodeId: z.string().min(1),
  entrypointName: z.string().min(1),
  moduleId: z.string().min(1),
  codeFactIds: z.array(z.string().min(1)),
  relationIds: z.array(z.string().min(1)),
  touchedFilePaths: z.array(z.string().min(1)),
  touchedNodeKinds: z.array(CodeFactNodeKindSchema),
  outgoingModuleIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  confidence: z.enum(["low", "medium", "high"])
});

export const StructuralClusterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: StructuralClusterKindSchema,
  moduleId: z.string().min(1),
  filePaths: z.array(z.string().min(1)),
  nodeIds: z.array(z.string().min(1)),
  edgeIds: z.array(z.string().min(1)),
  entrypointIds: z.array(z.string().min(1)),
  behaviorSliceIds: z.array(z.string().min(1)),
  incomingModuleIds: z.array(z.string().min(1)),
  outgoingModuleIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  confidence: z.enum(["low", "medium", "high"])
});

export const RuntimeBoundarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: RuntimeBoundaryKindSchema,
  moduleId: z.string().min(1),
  filePath: z.string().min(1),
  sourceCodeFactIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  confidence: z.enum(["low", "medium", "high"])
});

export const EvidenceClaimSchema = z.object({
  id: z.string().min(1),
  kind: EvidenceClaimKindSchema,
  summary: z.string().min(1),
  sourceCodeFactIds: z.array(z.string().min(1)),
  sourceRelationKinds: z.array(CodeFactEdgeKindSchema),
  evidence: z.array(CodeFactEvidenceRefSchema),
  strength: EvidenceClaimStrengthSchema,
  projectionHints: z.array(z.enum(["design", "engineering", "architecture"]))
});

export const CoverageLedgerItemSchema = z.object({
  id: z.string().min(1),
  kind: CoverageLedgerKindSchema,
  targetId: z.string().min(1),
  targetLabel: z.string().min(1),
  status: CoverageLedgerStatusSchema,
  projectionIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  reason: z.string().min(1)
});

export const CrossPanelReconciliationSchema = z.object({
  designProjectionIds: z.array(z.string().min(1)),
  engineeringProjectionIds: z.array(z.string().min(1)),
  architectureProjectionIds: z.array(z.string().min(1)),
  linkedBehaviorSliceIds: z.array(z.string().min(1)),
  linkedStructuralClusterIds: z.array(z.string().min(1)),
  linkedRuntimeBoundaryIds: z.array(z.string().min(1)),
  gaps: z.array(CoverageLedgerItemSchema)
});

export const CodeUnderstandingSpineSchema = z.object({
  schemaVersion: z.literal("praxis.codeUnderstandingSpine.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  source: CodeUnderstandingSpineSourceInfoSchema,
  summary: CodeUnderstandingSpineSummarySchema,
  behaviorSlices: z.array(BehaviorSliceSchema),
  structuralClusters: z.array(StructuralClusterSchema),
  runtimeBoundaries: z.array(RuntimeBoundarySchema),
  evidenceClaims: z.array(EvidenceClaimSchema),
  coverageLedger: z.array(CoverageLedgerItemSchema),
  reconciliation: CrossPanelReconciliationSchema
});
