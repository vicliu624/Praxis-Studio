import { z } from "zod";
import { ConfidenceSchema } from "./common.schema.js";
import { CodeFactEvidenceRefSchema } from "./code-fact.schema.js";
import type { ArchitectureModelPatch } from "./architecture.js";

export const ArchitectureModuleRoleSchema = z.enum([
  "ui",
  "application",
  "domain",
  "port",
  "adapter",
  "infrastructure",
  "runtime",
  "model",
  "projection",
  "test",
  "docs",
  "storage",
  "tooling",
  "unknown"
]);

export const ArchitectureModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  role: ArchitectureModuleRoleSchema,
  responsibilities: z.array(z.string()),
  sourceMemoryIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  confidence: ConfidenceSchema,
  knowledgeKind: z.enum(["INFERENCE", "CANDIDATE"])
});

export const ArchitectureDependencySchema = z.object({
  id: z.string().min(1),
  sourceModuleId: z.string().min(1),
  targetModuleId: z.string().min(1),
  kind: z.literal("depends_on"),
  sourceMemoryIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  confidence: ConfidenceSchema,
  knowledgeKind: z.literal("INFERENCE")
});

export const ArchitectureModelWarningSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning"]),
  summary: z.string().min(1)
});

export const ArchitectureModelPatchSchema: z.ZodType<ArchitectureModelPatch> = z.object({
  schemaVersion: z.literal("praxis.architectureModelPatch.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  modules: z.array(ArchitectureModuleSchema),
  dependencies: z.array(ArchitectureDependencySchema),
  warnings: z.array(ArchitectureModelWarningSchema),
  confidence: ConfidenceSchema
});
