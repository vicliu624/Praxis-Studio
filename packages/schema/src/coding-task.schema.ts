import { z } from "zod";
import { CodeFactEvidenceRefSchema } from "./code-fact.schema.js";
import { ArchitectureFindingSchema } from "./finding.schema.js";
import { MemoryPatchSchema } from "./repository-understanding.schema.js";
import type { CodingAgentTask, ExternalAgentResult, FindingStatusPatch, MemorySuggestionPatch, PlanPatch } from "./coding-task.js";

export const CodingAgentTaskSchema: z.ZodType<CodingAgentTask> = z.object({
  schemaVersion: z.literal("praxis.codingAgentTask.v1"),
  id: z.string().min(1),
  sourceFindingIds: z.array(z.string().min(1)),
  sourceContextPacketId: z.string().min(1).optional(),
  goal: z.string().min(1),
  nonGoals: z.array(z.string().min(1)),
  allowedPaths: z.array(z.string().min(1)),
  forbiddenPaths: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string().min(1)),
  expectedOutputs: z.array(z.string().min(1)),
  riskNotes: z.array(z.string().min(1)),
  createdAt: z.string().min(1)
});

export const PlanPatchSchema: z.ZodType<PlanPatch> = z.object({
  schemaVersion: z.literal("praxis.planPatch.v1"),
  id: z.string().min(1),
  sourceFindingId: z.string().min(1).optional(),
  sourceContextPacketId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  strength: z.enum(["conservative", "balanced", "aggressive"]),
  steps: z.array(z.string().min(1)),
  createdAt: z.string().min(1)
});

export const FindingStatusPatchSchema: z.ZodType<FindingStatusPatch> = z.object({
  schemaVersion: z.literal("praxis.findingStatusPatch.v1"),
  id: z.string().min(1),
  sourceResultId: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional(),
  findingId: z.string().min(1),
  status: ArchitectureFindingSchema.shape.status,
  summary: z.string().min(1),
  rationale: z.string().min(1).optional(),
  evidence: z.array(CodeFactEvidenceRefSchema),
  createdAt: z.string().min(1)
});

export const MemorySuggestionPatchSchema: z.ZodType<MemorySuggestionPatch> = z.object({
  schemaVersion: z.literal("praxis.memorySuggestionPatch.v1"),
  id: z.string().min(1),
  sourceResultId: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional(),
  summary: z.string().min(1),
  memoryPatches: z.array(MemoryPatchSchema),
  createdAt: z.string().min(1)
});

export const ExternalAgentResultSchema: z.ZodType<ExternalAgentResult> = z.object({
  schemaVersion: z.literal("praxis.externalAgentResult.v1"),
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(["done", "partial", "failed"]),
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)),
  testResult: z.string().min(1).optional(),
  evidence: z.array(CodeFactEvidenceRefSchema),
  memorySuggestions: z.array(MemorySuggestionPatchSchema),
  findingStatusSuggestions: z.array(FindingStatusPatchSchema),
  createdAt: z.string().min(1)
});
