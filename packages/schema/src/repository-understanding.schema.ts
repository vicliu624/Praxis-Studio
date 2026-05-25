import { z } from "zod";
import { ConfidenceSchema, KnowledgeKindSchema } from "./common.schema.js";
import { CodeFactEvidenceRefSchema, CodeFactProviderInfoSchema, CodeFactStatisticsSchema } from "./code-fact.schema.js";
import type { RepositoryUnderstandingPatch } from "./repository-understanding.js";

export const MemoryPatchStatusSchema = z.enum(["proposed", "accepted", "rejected"]);

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  kind: KnowledgeKindSchema,
  type: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().optional(),
  value: z.unknown().optional(),
  summary: z.string().min(1),
  evidence: z.array(CodeFactEvidenceRefSchema),
  source: z.enum(["code_fact_graph", "repository_scan", "static_analysis", "agent", "user"]),
  confidence: ConfidenceSchema,
  status: z.enum(["proposed", "active", "stale", "deprecated"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const MemoryPatchSchema = z.object({
  id: z.string().min(1),
  operation: z.literal("append"),
  status: MemoryPatchStatusSchema,
  record: MemoryRecordSchema,
  sourceCodeFactIds: z.array(z.string().min(1))
});

export const ReviewQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  targetId: z.string().min(1).optional()
});

export const UnderstandingWarningSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning"]),
  summary: z.string().min(1)
});

export const RepositoryUnderstandingPatchSchema: z.ZodType<RepositoryUnderstandingPatch> = z.object({
  schemaVersion: z.literal("praxis.repositoryUnderstandingPatch.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  sourceSnapshot: z.object({
    schemaVersion: z.literal("praxis.codeFactGraph.v1"),
    generatedAt: z.string().min(1),
    provider: CodeFactProviderInfoSchema,
    statistics: CodeFactStatisticsSchema
  }),
  memoryPatches: z.array(MemoryPatchSchema),
  modelPatches: z.tuple([]),
  findingPatches: z.tuple([]),
  reviewQuestions: z.array(ReviewQuestionSchema),
  warnings: z.array(UnderstandingWarningSchema),
  confidence: ConfidenceSchema
});
