import { z } from "zod";
import { GraphAnchorSchema } from "./graph-anchor.schema.js";
import type { ReviewEvaluatorRef, ReviewEvidenceRef, ReviewFinding, ReviewRun } from "./quality-review.js";

export const ReviewSeveritySchema = z.enum(["P0", "P1", "P2", "P3"]);

export const ReviewCategorySchema = z.enum([
  "foundation_integrity",
  "architecture_boundaries",
  "dependencies_coupling",
  "build_release",
  "testing_verification",
  "security_secrets",
  "configuration_environment",
  "code_quality_maintainability",
  "api_contracts_data_flow",
  "performance_resources",
  "documentation_knowledge"
]);

export const ReviewFindingStatusSchema = z.enum(["candidate", "confirmed", "dismissed", "needs_more_evidence"]);

const ReviewCategoryCountSchema = z.object({
  foundation_integrity: z.number().int().nonnegative(),
  architecture_boundaries: z.number().int().nonnegative(),
  dependencies_coupling: z.number().int().nonnegative(),
  build_release: z.number().int().nonnegative(),
  testing_verification: z.number().int().nonnegative(),
  security_secrets: z.number().int().nonnegative(),
  configuration_environment: z.number().int().nonnegative(),
  code_quality_maintainability: z.number().int().nonnegative(),
  api_contracts_data_flow: z.number().int().nonnegative(),
  performance_resources: z.number().int().nonnegative(),
  documentation_knowledge: z.number().int().nonnegative()
}).partial();

export const ReviewEvidenceRefSchema: z.ZodType<ReviewEvidenceRef> = z.object({
  source: z.enum(["repository_snapshot", "code_fact_graph", "memory", "projection", "trace", "file", "agent"]),
  path: z.string().min(1).optional(),
  anchor: GraphAnchorSchema.optional(),
  summary: z.string().min(1),
  excerpt: z.string().min(1).optional()
});

export const ReviewEvaluatorRefSchema: z.ZodType<ReviewEvaluatorRef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: ReviewCategorySchema,
  prompt: z.string().min(1),
  source: z.enum(["praxis-heuristic", "pi-agent", "hybrid"])
});

export const ReviewFindingSchema: z.ZodType<ReviewFinding> = z.object({
  schemaVersion: z.literal("praxis.reviewFinding.v1"),
  id: z.string().min(1),
  runId: z.string().min(1),
  category: ReviewCategorySchema,
  severity: ReviewSeveritySchema,
  status: ReviewFindingStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  suggestedAction: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  source: z.enum(["scan", "codegraph", "agent", "hybrid"]),
  evaluator: ReviewEvaluatorRefSchema.optional(),
  knowledgeKind: z.enum(["CANDIDATE", "INFERENCE"]),
  evidence: z.array(ReviewEvidenceRefSchema),
  affectedAnchors: z.array(GraphAnchorSchema),
  traceIds: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const ReviewRunSchema: z.ZodType<ReviewRun> = z.object({
  schemaVersion: z.literal("praxis.reviewRun.v1"),
  id: z.string().min(1),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  source: z.enum(["praxis-heuristic", "pi-agent", "hybrid"]),
  status: z.enum(["completed", "partial", "failed"]),
  categories: z.array(ReviewCategorySchema),
  findingIds: z.array(z.string().min(1)),
  evaluatorResults: z.array(z.object({
    evaluator: ReviewEvaluatorRefSchema,
    status: z.enum(["completed", "partial", "failed"]),
    findingIds: z.array(z.string().min(1)),
    summary: z.string().min(1)
  })).optional(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    bySeverity: z.object({
      P0: z.number().int().nonnegative(),
      P1: z.number().int().nonnegative(),
      P2: z.number().int().nonnegative(),
      P3: z.number().int().nonnegative()
    }),
    byCategory: ReviewCategoryCountSchema
  }),
  traceIds: z.array(z.string().min(1))
});
