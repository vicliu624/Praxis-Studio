import { z } from "zod";
import { ArchitectureDependencySchema, ArchitectureModuleSchema, ArchitectureModelWarningSchema } from "./architecture.schema.js";
import { CodeFactEdgeSchema, CodeFactFileSchema, CodeFactNodeSchema } from "./code-fact.schema.js";
import { ArchitectureFindingSchema } from "./finding.schema.js";
import { GraphAnchorSchema } from "./graph-anchor.schema.js";
import { ProjectedGraphAnnotationSchema, ProjectedGraphEdgeSchema, ProjectedGraphNodeSchema, ProjectedGraphViewSchema } from "./projected-graph.schema.js";
import { MemoryRecordSchema } from "./repository-understanding.schema.js";
import type { ContextPacket } from "./context-packet.js";

export const ContextPacketPurposeSchema = z.enum(["explain", "plan", "task", "review", "governance", "external_agent"]);

export const ArchitectureModelSliceSchema = z.object({
  modules: z.array(ArchitectureModuleSchema),
  dependencies: z.array(ArchitectureDependencySchema),
  warnings: z.array(ArchitectureModelWarningSchema)
});

export const ContextPacketSchema: z.ZodType<ContextPacket> = z.object({
  schemaVersion: z.literal("praxis.contextPacket.v1"),
  id: z.string().min(1),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  anchor: GraphAnchorSchema,
  purpose: ContextPacketPurposeSchema,
  memory: z.object({
    facts: z.array(MemoryRecordSchema),
    inferences: z.array(MemoryRecordSchema),
    candidates: z.array(MemoryRecordSchema),
    confirmations: z.array(MemoryRecordSchema),
    findings: z.array(MemoryRecordSchema),
    decisions: z.array(MemoryRecordSchema)
  }),
  models: z.object({
    architecture: ArchitectureModelSliceSchema.optional()
  }),
  codeFacts: z.object({
    nodes: z.array(CodeFactNodeSchema),
    edges: z.array(CodeFactEdgeSchema),
    callers: z.array(CodeFactNodeSchema),
    callees: z.array(CodeFactNodeSchema),
    impacted: z.array(CodeFactNodeSchema),
    relatedFiles: z.array(CodeFactFileSchema)
  }),
  projections: z.object({
    views: z.array(ProjectedGraphViewSchema),
    nodes: z.array(ProjectedGraphNodeSchema),
    edges: z.array(ProjectedGraphEdgeSchema),
    annotations: z.array(ProjectedGraphAnnotationSchema)
  }),
  findings: z.array(ArchitectureFindingSchema),
  rules: z.object({
    architectureRules: z.array(z.string()),
    boundaryRules: z.array(z.string()),
    aiConstraints: z.array(z.string()),
    playbooks: z.array(z.string())
  }),
  scope: z.object({
    includedPaths: z.array(z.string().min(1)),
    excludedPaths: z.array(z.string().min(1)),
    expansionPolicy: z.enum(["forbidden", "explain_first", "allowed_with_trace"])
  }),
  authority: z.object({
    memoryAuthority: z.enum(["durable", "review_cache", "mixed"]),
    projectionAuthority: z.enum(["review_cache", "durable_model"])
  }),
  trace: z.object({
    createdBy: z.enum(["cli", "desktop", "mcp", "agent_runtime"]),
    sourceViewId: z.string().min(1).optional()
  }),
  warnings: z.array(z.string())
});
