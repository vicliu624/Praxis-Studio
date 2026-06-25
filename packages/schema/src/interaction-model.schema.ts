import { z } from "zod";
import { ConfidenceSchema, KnowledgeKindSchema } from "./common.schema.js";
import { CodeFactEvidenceRefSchema } from "./code-fact.schema.js";
import type { InteractionModelCandidate } from "./interaction-model.js";

export const DesignCandidateStatusSchema = z.enum(["candidate", "confirmed", "stale", "conflicted", "rejected"]);

export const DesignEvidenceStrengthSchema = z.enum(["weak", "medium", "strong"]);

export const DesignEvidenceRefSchema = CodeFactEvidenceRefSchema.extend({
  summary: z.string().min(1),
  strength: DesignEvidenceStrengthSchema,
  knowledgeKind: KnowledgeKindSchema,
  sourceCodeFactId: z.string().min(1).optional()
});

export const DesignQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  targetId: z.string().min(1).optional(),
  severity: z.enum(["info", "warning"])
});

const DesignTraceabilitySchema = z.object({
  sourceMemoryIds: z.array(z.string().min(1)),
  sourceModelIds: z.array(z.string().min(1)),
  sourceSpecPaths: z.array(z.string().min(1)),
  sourceCodeFactIds: z.array(z.string().min(1)),
  evidence: z.array(DesignEvidenceRefSchema),
  questions: z.array(z.string().min(1))
});

const CandidateBaseSchema = DesignTraceabilitySchema.extend({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: DesignCandidateStatusSchema,
  confidence: ConfidenceSchema
});

export const DesignContextKindSchema = z.enum([
  "system",
  "business_module",
  "business_capability",
  "bounded_context",
  "process_area"
]);

export const DesignContextCandidateSchema = CandidateBaseSchema.extend({
  kind: DesignContextKindSchema,
  parentContextId: z.string().min(1).optional(),
  scope: z.string().min(1),
  responsibility: z.string().min(1),
  businessTerms: z.array(z.string().min(1))
});

export const ActorCandidateSchema = CandidateBaseSchema.extend({
  type: z.enum(["person", "role", "system", "external_system"])
});

export const ExternalSystemCandidateSchema = CandidateBaseSchema;

export const UseCaseCandidateSchema = CandidateBaseSchema.extend({
  contextId: z.string().min(1),
  primaryActorIds: z.array(z.string().min(1)),
  supportingActorIds: z.array(z.string().min(1)),
  externalSystemIds: z.array(z.string().min(1)),
  entryPointIds: z.array(z.string().min(1)),
  trigger: z.string().min(1).optional(),
  preconditions: z.array(z.string().min(1)),
  postconditions: z.array(z.string().min(1)),
  mainSuccessScenario: z.array(z.string().min(1)),
  alternativeFlows: z.array(z.string().min(1)),
  failureFlows: z.array(z.string().min(1))
});

export const UseCaseRelationKindSchema = z.enum([
  "actor_participates",
  "includes",
  "extends",
  "depends_on",
  "triggers",
  "conflicts_with",
  "out_of_scope_for"
]);

export const UseCaseRelationCandidateSchema = DesignTraceabilitySchema.extend({
  id: z.string().min(1),
  kind: UseCaseRelationKindSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  summary: z.string().min(1),
  status: DesignCandidateStatusSchema,
  confidence: ConfidenceSchema
});

export const UseCaseDrilldownDiagramKindSchema = z.enum([
  "activity",
  "sequence",
  "state_machine",
  "class_collaboration",
  "interaction_overview",
  "communication",
  "timing",
  "object_snapshot",
  "composite_structure"
]);

export const UseCaseImplementationScopeSchema = z.object({
  modules: z.array(z.string().min(1)),
  entryPoints: z.array(z.string().min(1)),
  keyFiles: z.array(z.string().min(1)),
  codeAnchors: z.array(z.string().min(1)),
  outOfScopeCode: z.array(z.string().min(1))
});

export const UseCaseDrilldownCoverageSchema = z.object({
  scenario: z.string().min(1),
  coveredUseCaseFlows: z.array(z.string().min(1)),
  boundary: z.string().min(1),
  notCovered: z.array(z.string().min(1)),
  rationale: z.string().min(1),
  implementationScope: UseCaseImplementationScopeSchema
});

export const UseCaseDrilldownExplanationSchema = z.object({
  business: z.string().min(1),
  uml: z.string().min(1),
  design: z.string().min(1),
  implementation: z.string().min(1)
});

export const UseCaseDrilldownDiagramCandidateSchema = CandidateBaseSchema.extend({
  useCaseId: z.string().min(1),
  kind: UseCaseDrilldownDiagramKindSchema,
  coverage: UseCaseDrilldownCoverageSchema,
  explanation: UseCaseDrilldownExplanationSchema,
  mermaid: z.string().min(1)
});

export const InteractionModelCandidateSchema: z.ZodType<InteractionModelCandidate> = z.object({
  schemaVersion: z.literal("praxis.interactionModel.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  source: z.enum(["agent", "user", "imported"]),
  contexts: z.array(DesignContextCandidateSchema),
  actors: z.array(ActorCandidateSchema),
  externalSystems: z.array(ExternalSystemCandidateSchema),
  useCases: z.array(UseCaseCandidateSchema),
  relations: z.array(UseCaseRelationCandidateSchema),
  useCaseDrilldowns: z.array(UseCaseDrilldownDiagramCandidateSchema),
  questions: z.array(DesignQuestionSchema),
  warnings: z.array(z.string().min(1))
});
