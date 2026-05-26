import { z } from "zod";
import { CodeFactEdgeSchema, CodeFactFileSchema, CodeFactNodeKindSchema, CodeFactNodeSchema, CodeFactProviderInfoSchema, CodeFactWarningSchema } from "./code-fact.schema.js";
import { ContextPacketPurposeSchema, ContextPacketSchema } from "./context-packet.schema.js";
import { ArchitectureFindingSchema } from "./finding.schema.js";
import { GraphAnchorSchema } from "./graph-anchor.schema.js";
import { ProjectedGraphViewKindSchema, ProjectedGraphViewSchema } from "./projected-graph.schema.js";
import type {
  PraxisMcpCodeFactsInput,
  PraxisMcpCodeFactsResult,
  PraxisMcpContextPacketInput,
  PraxisMcpContextPacketResult,
  PraxisMcpFindingsInput,
  PraxisMcpFindingsResult,
  PraxisMcpProjectionViewsInput,
  PraxisMcpProjectionViewsResult,
  PraxisMcpStatusInput,
  PraxisMcpStatusResult
} from "./mcp.js";

export const PraxisMcpToolNameSchema = z.enum([
  "praxis_status",
  "praxis_code_facts",
  "praxis_findings",
  "praxis_projection_views",
  "praxis_context_packet"
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
    readOnly: z.literal(true)
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
