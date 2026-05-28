import { z } from "zod";
import { CodeFactEdgeSchema, CodeFactFileSchema, CodeFactNodeKindSchema, CodeFactNodeSchema, CodeFactProviderInfoSchema, CodeFactWarningSchema } from "./code-fact.schema.js";
import { ContextPacketPurposeSchema, ContextPacketSchema } from "./context-packet.schema.js";
import { CodingAgentTaskSchema, ExternalAgentResultSchema, PlanPatchSchema } from "./coding-task.schema.js";
import { ArchitectureFindingSchema } from "./finding.schema.js";
import { GraphAnchorSchema } from "./graph-anchor.schema.js";
import { ProjectedGraphViewKindSchema, ProjectedGraphViewSchema } from "./projected-graph.schema.js";
import type {
  PraxisMcpCodeFactsInput,
  PraxisMcpCodeFactsResult,
  PraxisMcpCodeRelationInput,
  PraxisMcpCodeRelationResult,
  PraxisMcpContextPacketInput,
  PraxisMcpContextPacketResult,
  PraxisMcpExplainAnchorInput,
  PraxisMcpExplainAnchorResult,
  PraxisMcpFindingAuditInput,
  PraxisMcpFindingAuditResult,
  PraxisMcpFindingsInput,
  PraxisMcpFindingsResult,
  PraxisMcpGenerateTaskInput,
  PraxisMcpGenerateTaskResult,
  PraxisMcpPlanFromFindingInput,
  PraxisMcpPlanFromFindingResult,
  PraxisMcpProjectionViewsInput,
  PraxisMcpProjectionViewsResult,
  PraxisMcpProjectProfileInput,
  PraxisMcpProjectProfileResult,
  PraxisMcpRecordExternalResultInput,
  PraxisMcpRecordExternalResultResult,
  PraxisMcpStatusInput,
  PraxisMcpStatusResult
} from "./mcp.js";

export const PraxisMcpToolNameSchema = z.enum([
  "praxis_status",
  "praxis_project_profile",
  "praxis_code_facts",
  "praxis_callers",
  "praxis_callees",
  "praxis_impact",
  "praxis_findings",
  "praxis_finding_audit",
  "praxis_projection_views",
  "praxis_context_packet",
  "praxis_explain_anchor",
  "praxis_plan_from_finding",
  "praxis_generate_task",
  "praxis_record_external_result"
]);

const PraxisMcpLimitSchema = z.number().int().positive().max(500);
const PraxisMcpOptionalRootSchema = z.object({ root: z.string().min(1).optional() });

export const PraxisMcpStatusInputSchema: z.ZodType<PraxisMcpStatusInput> = PraxisMcpOptionalRootSchema.strict();

export const PraxisMcpStatusResultSchema: z.ZodType<PraxisMcpStatusResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.statusResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  server: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    readOnly: z.boolean(),
    writePolicy: z.literal("governed_artifacts_only")
  }),
  distinction: z.object({
    exists: z.boolean(),
    path: z.string().min(1),
    cachePath: z.string().min(1),
    memoryPath: z.string().min(1),
    viewsPath: z.string().min(1)
  }),
  cache: z.object({
    codeFacts: z.boolean(),
    findings: z.boolean(),
    projectionManifest: z.boolean(),
    contextPacket: z.boolean()
  }),
  views: z.object({
    codeFacts: z.boolean(),
    findings: z.boolean(),
    projectedGraphViewCount: z.number().int().nonnegative()
  }),
  codeFacts: z
    .object({
      provider: CodeFactProviderInfoSchema,
      files: z.number().int().nonnegative(),
      nodes: z.number().int().nonnegative(),
      edges: z.number().int().nonnegative(),
      warnings: z.array(CodeFactWarningSchema)
    })
    .optional(),
  findings: z
    .object({
      count: z.number().int().nonnegative(),
      open: z.number().int().nonnegative()
    })
    .optional(),
  tools: z.array(PraxisMcpToolNameSchema),
  warnings: z.array(z.string())
});

export const PraxisMcpCodeFactsInputSchema: z.ZodType<PraxisMcpCodeFactsInput> = PraxisMcpOptionalRootSchema.extend({
  path: z.string().min(1).optional(),
  kind: CodeFactNodeKindSchema.optional(),
  name: z.string().min(1).optional(),
  limit: PraxisMcpLimitSchema.optional()
}).strict();

export const PraxisMcpCodeFactsResultSchema: z.ZodType<PraxisMcpCodeFactsResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.codeFactsResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  provider: CodeFactProviderInfoSchema,
  files: z.array(CodeFactFileSchema),
  nodes: z.array(CodeFactNodeSchema),
  edges: z.array(CodeFactEdgeSchema),
  truncated: z.boolean(),
  sourceCachePath: z.string().min(1),
  warnings: z.array(CodeFactWarningSchema)
});

export const PraxisMcpFindingsInputSchema: z.ZodType<PraxisMcpFindingsInput> = PraxisMcpOptionalRootSchema.extend({
  category: z.literal("architecture").optional(),
  status: ArchitectureFindingSchema.shape.status.optional(),
  severity: ArchitectureFindingSchema.shape.severity.optional(),
  limit: PraxisMcpLimitSchema.optional()
}).strict();

export const PraxisMcpFindingsResultSchema: z.ZodType<PraxisMcpFindingsResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.findingsResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  findings: z.array(ArchitectureFindingSchema),
  truncated: z.boolean(),
  sourceCachePath: z.string().min(1)
});

export const PraxisMcpFindingAuditInputSchema: z.ZodType<PraxisMcpFindingAuditInput> = PraxisMcpOptionalRootSchema.extend({
  findingId: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  limit: PraxisMcpLimitSchema.optional()
}).strict();

export const PraxisMcpFindingAuditHistoryEntrySchema = z.object({
  patchId: z.string().min(1),
  patchPath: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional(),
  sourceResultId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  acceptedAt: z.string().min(1).optional(),
  evidenceCount: z.number().int().nonnegative()
});

export const PraxisMcpFindingAuditMemoryRecordSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1).optional(),
  summary: z.string().min(1),
  createdAt: z.string().min(1),
  patchId: z.string().min(1).optional(),
  sourceResultId: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional()
});

export const PraxisMcpFindingAuditTraceEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  timestamp: z.string().min(1),
  summary: z.string().min(1),
  patchId: z.string().min(1).optional(),
  status: z.string().min(1).optional()
});

export const PraxisMcpFindingAuditItemSchema = z.object({
  findingId: z.string().min(1),
  currentlyDetected: z.boolean(),
  detectorState: z.string().min(1),
  currentStatus: z.string().min(1).optional(),
  currentTitle: z.string().min(1).optional(),
  currentSummary: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
  latestAcceptedStatus: z.string().min(1).optional(),
  latestAcceptedAt: z.string().min(1).optional(),
  history: z.array(PraxisMcpFindingAuditHistoryEntrySchema),
  memoryRecords: z.array(PraxisMcpFindingAuditMemoryRecordSchema),
  traces: z.array(PraxisMcpFindingAuditTraceEntrySchema)
});

export const PraxisMcpFindingAuditResultSchema: z.ZodType<PraxisMcpFindingAuditResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.findingAuditResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  findingsPath: z.string().min(1),
  counts: z.object({
    findings: z.number().int().nonnegative(),
    currentlyDetected: z.number().int().nonnegative(),
    historicalOnly: z.number().int().nonnegative(),
    acceptedHistoryEvents: z.number().int().nonnegative()
  }),
  findings: z.array(PraxisMcpFindingAuditItemSchema),
  truncated: z.boolean()
});

export const PraxisMcpProjectionViewsInputSchema: z.ZodType<PraxisMcpProjectionViewsInput> = PraxisMcpOptionalRootSchema.extend({
  kind: ProjectedGraphViewKindSchema.optional(),
  anchor: GraphAnchorSchema.optional(),
  limit: PraxisMcpLimitSchema.optional()
}).strict();

export const PraxisMcpProjectionViewsResultSchema: z.ZodType<PraxisMcpProjectionViewsResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.projectionViewsResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  views: z.array(ProjectedGraphViewSchema),
  truncated: z.boolean(),
  sourceViewPaths: z.array(z.string().min(1))
});

export const PraxisMcpContextPacketInputSchema: z.ZodType<PraxisMcpContextPacketInput> = PraxisMcpOptionalRootSchema.extend({
  anchor: GraphAnchorSchema,
  purpose: ContextPacketPurposeSchema.optional(),
  limit: z
    .object({
      codeFacts: PraxisMcpLimitSchema.optional(),
      findings: PraxisMcpLimitSchema.optional(),
      memory: PraxisMcpLimitSchema.optional(),
      projectionNodes: PraxisMcpLimitSchema.optional()
    })
    .optional()
}).strict();

export const PraxisMcpContextPacketResultSchema: z.ZodType<PraxisMcpContextPacketResult> = ContextPacketSchema;

export const PraxisMcpProjectProfileInputSchema: z.ZodType<PraxisMcpProjectProfileInput> = PraxisMcpOptionalRootSchema.strict();

export const PraxisMcpProjectProfileResultSchema: z.ZodType<PraxisMcpProjectProfileResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.projectProfileResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  profile: z.record(z.unknown()),
  sourceCachePath: z.string().min(1)
});

export const PraxisMcpCodeRelationInputSchema: z.ZodType<PraxisMcpCodeRelationInput> = PraxisMcpOptionalRootSchema.extend({
  symbolId: z.string().min(1),
  depth: z.number().int().positive().max(5).optional(),
  limit: PraxisMcpLimitSchema.optional()
}).strict();

export const PraxisMcpCodeRelationResultSchema: z.ZodType<PraxisMcpCodeRelationResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.codeRelationResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  relation: z.enum(["callers", "callees", "impact"]),
  symbolId: z.string().min(1),
  supported: z.boolean(),
  reason: z.string().min(1).optional(),
  nodes: z.array(CodeFactNodeSchema),
  edges: z.array(CodeFactEdgeSchema),
  truncated: z.boolean(),
  sourceCachePath: z.string().min(1)
});

export const PraxisMcpExplainAnchorInputSchema: z.ZodType<PraxisMcpExplainAnchorInput> = PraxisMcpOptionalRootSchema.extend({
  anchor: GraphAnchorSchema
}).strict();

export const PraxisMcpExplainAnchorResultSchema: z.ZodType<PraxisMcpExplainAnchorResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.explainAnchorResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  anchor: GraphAnchorSchema,
  summary: z.string().min(1),
  contextPacket: ContextPacketSchema
});

export const PraxisMcpPlanFromFindingInputSchema: z.ZodType<PraxisMcpPlanFromFindingInput> = PraxisMcpOptionalRootSchema.extend({
  findingId: z.string().min(1),
  strength: z.enum(["conservative", "balanced", "aggressive"]).optional()
}).strict();

export const PraxisMcpPlanFromFindingResultSchema: z.ZodType<PraxisMcpPlanFromFindingResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.planFromFindingResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  planPatch: PlanPatchSchema,
  path: z.string().min(1)
});

export const PraxisMcpGenerateTaskInputSchema: z.ZodType<PraxisMcpGenerateTaskInput> = PraxisMcpOptionalRootSchema.extend({
  anchor: GraphAnchorSchema.optional(),
  findingId: z.string().min(1).optional(),
  adapter: z.enum(["manual", "codex", "claude-code", "claude-code-best", "opencode"]).optional()
}).strict();

export const PraxisMcpGenerateTaskResultSchema: z.ZodType<PraxisMcpGenerateTaskResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.generateTaskResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  task: CodingAgentTaskSchema,
  taskJsonPath: z.string().min(1),
  taskMarkdownPath: z.string().min(1)
});

export const PraxisMcpRecordExternalResultInputSchema: z.ZodType<PraxisMcpRecordExternalResultInput> = PraxisMcpOptionalRootSchema.extend({
  taskId: z.string().min(1),
  status: z.enum(["done", "partial", "failed"]),
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).optional(),
  testResult: z.string().min(1).optional(),
  evidencePaths: z.array(z.string().min(1)).optional()
}).strict();

export const PraxisMcpRecordExternalResultResultSchema: z.ZodType<PraxisMcpRecordExternalResultResult> = z.object({
  schemaVersion: z.literal("praxis.mcp.recordExternalResultResult.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  result: ExternalAgentResultSchema,
  resultPath: z.string().min(1),
  tracePath: z.string().min(1)
});
