import { z } from "zod";
import { ConfidenceSchema } from "./common.schema.js";
import type { ArchitectureDependencyView, ProjectionManifest } from "./projection.js";

export const ProjectionStatusSchema = z.enum(["fresh", "stale", "regenerating", "failed"]);

export const ProjectionViewKindSchema = z.enum([
  "architecture_dependency",
  "architecture_component",
  "architecture_context",
  "code_fact",
  "finding",
  "context",
  "memory",
  "trace",
  "task_plan",
  "uml_class",
  "project_plan",
  "memory_map",
  "trace_graph",
  "quality_inbox"
]);

export const ProjectionAuthoritySchema = z.enum(["review_cache", "durable_model"]);

export const ArchitectureDependencyViewNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  role: z.string().min(1),
  confidence: ConfidenceSchema,
  knowledgeKind: z.enum(["INFERENCE", "CANDIDATE"]),
  sourceMemoryIds: z.array(z.string().min(1))
});

export const ArchitectureDependencyViewEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.literal("depends_on"),
  confidence: ConfidenceSchema,
  knowledgeKind: z.literal("INFERENCE"),
  sourceMemoryIds: z.array(z.string().min(1)),
  evidenceCount: z.number().int().nonnegative(),
  findingIds: z.array(z.string().min(1))
});

export const ArchitectureDependencyViewAnnotationSchema = z.object({
  id: z.string().min(1),
  findingId: z.string().min(1),
  antiPatternId: z.string().min(1),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  status: z.enum(["open", "acknowledged", "planned", "in_progress", "mitigated", "resolved", "false_positive", "accepted_risk"]),
  targetIds: z.array(z.string().min(1)),
  summary: z.string().min(1)
});

export const ArchitectureDependencyViewSchema: z.ZodType<ArchitectureDependencyView> = z.object({
  schemaVersion: z.literal("praxis.architectureDependencyView.v1"),
  id: z.string().min(1),
  kind: z.literal("architecture_dependency"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  nodes: z.array(ArchitectureDependencyViewNodeSchema),
  edges: z.array(ArchitectureDependencyViewEdgeSchema),
  annotations: z.array(ArchitectureDependencyViewAnnotationSchema)
});

export const ProjectionViewRecordSchema = z.object({
  id: z.string().min(1),
  kind: ProjectionViewKindSchema,
  path: z.string().min(1),
  authority: ProjectionAuthoritySchema,
  sourceCachePaths: z.array(z.string().min(1)),
  sourceMemoryIds: z.array(z.string().min(1)),
  sourceModelIds: z.array(z.string().min(1)),
  sourceFindingIds: z.array(z.string().min(1)),
  sourceTaskIds: z.array(z.string().min(1)),
  sourceTraceIds: z.array(z.string().min(1)),
  sourceSpecPaths: z.array(z.string().min(1)),
  status: ProjectionStatusSchema,
  generatedAt: z.string().min(1).optional(),
  error: z.string().min(1).optional()
});

export const ProjectionManifestSchema: z.ZodType<ProjectionManifest> = z.object({
  schemaVersion: z.literal("praxis.projectionManifest.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  views: z.array(ProjectionViewRecordSchema)
});
