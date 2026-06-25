import type { Confidence, KnowledgeKind } from "./common";
import type { CodeFactEvidenceRef } from "./code-fact";

export type DesignCandidateStatus = "candidate" | "confirmed" | "stale" | "conflicted" | "rejected";

export type DesignEvidenceStrength = "weak" | "medium" | "strong";

export interface DesignEvidenceRef extends CodeFactEvidenceRef {
  summary: string;
  strength: DesignEvidenceStrength;
  knowledgeKind: KnowledgeKind;
  sourceCodeFactId?: string;
}

export interface DesignQuestion {
  id: string;
  question: string;
  targetId?: string;
  severity: "info" | "warning";
}

export interface DesignTraceability {
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceSpecPaths: string[];
  sourceCodeFactIds: string[];
  evidence: DesignEvidenceRef[];
  questions: string[];
}

export type DesignContextKind = "system" | "business_module" | "business_capability" | "bounded_context" | "process_area";

export interface DesignContextCandidate extends DesignTraceability {
  id: string;
  title: string;
  summary: string;
  kind: DesignContextKind;
  parentContextId?: string;
  scope: string;
  responsibility: string;
  businessTerms: string[];
  status: DesignCandidateStatus;
  confidence: Confidence;
}

export interface ActorCandidate extends DesignTraceability {
  id: string;
  title: string;
  summary: string;
  type: "person" | "role" | "system" | "external_system";
  status: DesignCandidateStatus;
  confidence: Confidence;
}

export interface ExternalSystemCandidate extends DesignTraceability {
  id: string;
  title: string;
  summary: string;
  status: DesignCandidateStatus;
  confidence: Confidence;
}

export interface UseCaseCandidate extends DesignTraceability {
  id: string;
  contextId: string;
  title: string;
  summary: string;
  status: DesignCandidateStatus;
  confidence: Confidence;
  primaryActorIds: string[];
  supportingActorIds: string[];
  externalSystemIds: string[];
  entryPointIds: string[];
  trigger?: string;
  preconditions: string[];
  postconditions: string[];
  mainSuccessScenario: string[];
  alternativeFlows: string[];
  failureFlows: string[];
}

export type UseCaseRelationKind =
  | "actor_participates"
  | "includes"
  | "extends"
  | "depends_on"
  | "triggers"
  | "conflicts_with"
  | "out_of_scope_for";

export interface UseCaseRelationCandidate extends DesignTraceability {
  id: string;
  kind: UseCaseRelationKind;
  sourceId: string;
  targetId: string;
  summary: string;
  status: DesignCandidateStatus;
  confidence: Confidence;
}

export type UseCaseDrilldownDiagramKind =
  | "activity"
  | "sequence"
  | "state_machine"
  | "class_collaboration"
  | "interaction_overview"
  | "communication"
  | "timing"
  | "object_snapshot"
  | "composite_structure";

export interface UseCaseDrilldownCoverage {
  scenario: string;
  coveredUseCaseFlows: string[];
  boundary: string;
  notCovered: string[];
  rationale: string;
  implementationScope: UseCaseImplementationScope;
}

export interface UseCaseImplementationScope {
  modules: string[];
  entryPoints: string[];
  keyFiles: string[];
  codeAnchors: string[];
  outOfScopeCode: string[];
}

export interface UseCaseDrilldownExplanation {
  business: string;
  uml: string;
  design: string;
  implementation: string;
}

export interface UseCaseDrilldownDiagramCandidate extends DesignTraceability {
  id: string;
  useCaseId: string;
  kind: UseCaseDrilldownDiagramKind;
  title: string;
  summary: string;
  coverage: UseCaseDrilldownCoverage;
  explanation: UseCaseDrilldownExplanation;
  status: DesignCandidateStatus;
  confidence: Confidence;
  mermaid: string;
}

export interface InteractionModelCandidate {
  schemaVersion: "praxis.interactionModel.v1";
  root: string;
  generatedAt: string;
  source: "agent" | "user" | "imported";
  contexts: DesignContextCandidate[];
  actors: ActorCandidate[];
  externalSystems: ExternalSystemCandidate[];
  useCases: UseCaseCandidate[];
  relations: UseCaseRelationCandidate[];
  useCaseDrilldowns: UseCaseDrilldownDiagramCandidate[];
  questions: DesignQuestion[];
  warnings: string[];
}
