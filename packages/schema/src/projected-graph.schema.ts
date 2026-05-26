import { z } from "zod";
import { ConfidenceSchema } from "./common.schema.js";
import { GraphAnchorSchema } from "./graph-anchor.schema.js";
import { ProjectionStatusSchema } from "./projection.schema.js";
import type { ProjectedGraphView } from "./projected-graph.js";

export const ProjectedGraphViewKindSchema = z.enum([
  "architecture_dependency",
  "architecture_component",
  "code_fact",
  "finding",
  "context",
  "task_plan",
  "trace",
  "memory"
]);

export const ProjectedGraphAuthoritySchema = z.enum(["review_cache", "durable_model"]);

export const ProjectedGraphSourceSchema = z.object({
  type: z.enum(["code_fact", "code_fact_edge", "memory", "model", "model_dependency", "finding", "task", "trace", "projection"]),
  id: z.string().min(1)
});

export const ProjectedGraphNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  source: ProjectedGraphSourceSchema,
  anchor: GraphAnchorSchema,
  path: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ProjectedGraphEdgeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  source: ProjectedGraphSourceSchema,
  anchor: GraphAnchorSchema,
  confidence: ConfidenceSchema.optional(),
  summary: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ProjectedGraphAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  sourceFindingId: z.string().min(1).optional(),
  targetNodeIds: z.array(z.string().min(1)),
  targetEdgeIds: z.array(z.string().min(1)),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  status: z.string().min(1).optional(),
  summary: z.string().min(1),
  anchor: GraphAnchorSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ProjectedGraphViewSchema: z.ZodType<ProjectedGraphView> = z.object({
  schemaVersion: z.literal("praxis.projectedGraphView.v1"),
  id: z.string().min(1),
  kind: ProjectedGraphViewKindSchema,
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  authority: ProjectedGraphAuthoritySchema,
  nodes: z.array(ProjectedGraphNodeSchema),
  edges: z.array(ProjectedGraphEdgeSchema),
  annotations: z.array(ProjectedGraphAnnotationSchema),
  sourceCachePaths: z.array(z.string().min(1)),
  sourceMemoryIds: z.array(z.string().min(1)),
  sourceModelIds: z.array(z.string().min(1)),
  sourceFindingIds: z.array(z.string().min(1)),
  sourceTaskIds: z.array(z.string().min(1)),
  sourceTraceIds: z.array(z.string().min(1)),
  sourceSpecPaths: z.array(z.string().min(1)),
  status: ProjectionStatusSchema,
  error: z.string().min(1).optional()
});
