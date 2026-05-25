import { z } from "zod";
import { ConfidenceSchema, KnowledgeKindSchema } from "./common.schema.js";
import { CodeFactEvidenceRefSchema } from "./code-fact.schema.js";
import type { ArchitectureFindingReport } from "./finding.js";

export const ArchitectureFindingKindSchema = z.enum(["architecture_dependency_without_evidence", "package_dependency_cycle"]);

export const ArchitectureFindingSchema = z.object({
  id: z.string().min(1),
  antiPatternId: ArchitectureFindingKindSchema,
  category: z.literal("architecture"),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  confidence: ConfidenceSchema,
  knowledgeKind: KnowledgeKindSchema,
  affectedModuleIds: z.array(z.string().min(1)),
  affectedDependencyIds: z.array(z.string().min(1)),
  affectedSourcePaths: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema),
  suggestedQuestions: z.array(z.string().min(1)),
  suggestedPlanActions: z.array(z.string().min(1)),
  status: z.enum(["open", "acknowledged", "planned", "in_progress", "mitigated", "resolved", "false_positive", "accepted_risk"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const ArchitectureFindingReportSchema: z.ZodType<ArchitectureFindingReport> = z.object({
  schemaVersion: z.literal("praxis.architectureFindingReport.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  findings: z.array(ArchitectureFindingSchema),
  detectorIds: z.array(z.string().min(1))
});
