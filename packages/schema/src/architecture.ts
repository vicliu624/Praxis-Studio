import type { Confidence } from "./common";
import type { CodeFactEvidenceRef } from "./code-fact";

export type ArchitectureModuleRole =
  | "ui"
  | "application"
  | "domain"
  | "port"
  | "adapter"
  | "infrastructure"
  | "runtime"
  | "model"
  | "projection"
  | "test"
  | "docs"
  | "storage"
  | "tooling"
  | "unknown";

export interface ArchitectureModule {
  id: string;
  name: string;
  path: string;
  role: ArchitectureModuleRole;
  responsibilities: string[];
  sourceMemoryIds: string[];
  evidence: CodeFactEvidenceRef[];
  confidence: Confidence;
  knowledgeKind: "INFERENCE" | "CANDIDATE";
}

export interface ArchitectureDependency {
  id: string;
  sourceModuleId: string;
  targetModuleId: string;
  kind: "depends_on";
  sourceMemoryIds: string[];
  evidence: CodeFactEvidenceRef[];
  confidence: Confidence;
  knowledgeKind: "INFERENCE";
}

export interface ArchitectureModelWarning {
  id: string;
  severity: "info" | "warning";
  summary: string;
}

export interface ArchitectureModelPatch {
  schemaVersion: "praxis.architectureModelPatch.v1";
  root: string;
  generatedAt: string;
  modules: ArchitectureModule[];
  dependencies: ArchitectureDependency[];
  warnings: ArchitectureModelWarning[];
  confidence: Confidence;
}
