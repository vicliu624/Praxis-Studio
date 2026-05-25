import { slugify } from "@praxis/core";
import type {
  ArchitectureDependency,
  ArchitectureFinding,
  ArchitectureFindingKind,
  ArchitectureFindingReport,
  ArchitectureModelPatch,
  ArchitectureModule,
  CodeFactEvidenceRef
} from "@praxis/schema";

export type { ArchitectureFinding, ArchitectureFindingKind, ArchitectureFindingReport } from "@praxis/schema";

export function detectArchitectureFindings(model: ArchitectureModelPatch): ArchitectureFindingReport {
  const generatedAt = new Date().toISOString();
  const modulesById = new Map(model.modules.map((module) => [module.id, module]));
  const findings = [
    ...detectDependenciesWithoutEvidence(model.dependencies, modulesById, generatedAt),
    ...detectPackageCycles(model, modulesById, generatedAt)
  ];

  return {
    schemaVersion: "praxis.architectureFindingReport.v1",
    root: model.root,
    generatedAt,
    findings,
    detectorIds: ["architecture-dependency-without-evidence", "package-dependency-cycle"]
  };
}

function detectDependenciesWithoutEvidence(
  dependencies: ArchitectureDependency[],
  modulesById: Map<string, ArchitectureModule>,
  now: string
): ArchitectureFinding[] {
  return dependencies
    .filter((dependency) => dependency.sourceMemoryIds.length === 0 || dependency.evidence.length === 0)
    .map((dependency) => {
      const source = modulesById.get(dependency.sourceModuleId);
      const target = modulesById.get(dependency.targetModuleId);
      return finding({
        id: `finding:${slugify(`dependency-without-evidence:${dependency.id}`)}`,
        antiPatternId: "architecture_dependency_without_evidence",
        title: `Dependency lacks evidence: ${source?.name ?? dependency.sourceModuleId} -> ${target?.name ?? dependency.targetModuleId}`,
        summary: "An architecture dependency was inferred without source memory ids or evidence references.",
        severity: "high",
        affectedModuleIds: [dependency.sourceModuleId, dependency.targetModuleId],
        affectedDependencyIds: [dependency.id],
        affectedSourcePaths: sourcePaths(dependency.evidence),
        evidence: dependency.evidence,
        suggestedQuestions: ["Which code fact or memory record justifies this dependency?"],
        suggestedPlanActions: ["Regenerate the architecture model from accepted FACT memory or remove the unsupported dependency."],
        now
      });
    });
}

function detectPackageCycles(
  model: ArchitectureModelPatch,
  modulesById: Map<string, ArchitectureModule>,
  now: string
): ArchitectureFinding[] {
  const findings: ArchitectureFinding[] = [];
  const adjacency = new Map<string, ArchitectureDependency[]>();
  for (const dependency of model.dependencies) {
    const list = adjacency.get(dependency.sourceModuleId) ?? [];
    list.push(dependency);
    adjacency.set(dependency.sourceModuleId, list);
  }

  const emitted = new Set<string>();
  for (const module of model.modules) {
    visit(module.id, module.id, [], new Set<string>());
  }
  return findings;

  function visit(startId: string, currentId: string, path: ArchitectureDependency[], visiting: Set<string>): void {
    if (visiting.has(currentId)) return;
    visiting.add(currentId);
    for (const dependency of adjacency.get(currentId) ?? []) {
      if (dependency.targetModuleId === startId) {
        const cycle = [...path, dependency];
        const key = canonicalCycleKey(cycle);
        if (emitted.has(key)) continue;
        emitted.add(key);
        const affectedModuleIds = unique(cycle.flatMap((item) => [item.sourceModuleId, item.targetModuleId]));
        const names = affectedModuleIds.map((id) => modulesById.get(id)?.name ?? id);
        findings.push(
          finding({
            id: `finding:${slugify(`package-cycle:${key}`)}`,
            antiPatternId: "package_dependency_cycle",
            title: `Package dependency cycle: ${names.join(" -> ")}`,
            summary: "Package-level dependencies form a cycle and may make architecture boundaries harder to evolve.",
            severity: "medium",
            affectedModuleIds,
            affectedDependencyIds: cycle.map((item) => item.id),
            affectedSourcePaths: unique(cycle.flatMap((item) => sourcePaths(item.evidence))),
            evidence: uniqueEvidence(cycle.flatMap((item) => item.evidence)),
            suggestedQuestions: ["Which module should own the shared abstraction that currently creates this cycle?"],
            suggestedPlanActions: ["Introduce or identify a stable dependency direction before generating remediation tasks."],
            now
          })
        );
        continue;
      }
      visit(startId, dependency.targetModuleId, [...path, dependency], new Set(visiting));
    }
  }
}

function finding(input: {
  id: string;
  antiPatternId: ArchitectureFindingKind;
  title: string;
  summary: string;
  severity: ArchitectureFinding["severity"];
  affectedModuleIds: string[];
  affectedDependencyIds: string[];
  affectedSourcePaths: string[];
  evidence: CodeFactEvidenceRef[];
  suggestedQuestions: string[];
  suggestedPlanActions: string[];
  now: string;
}): ArchitectureFinding {
  return {
    id: input.id,
    antiPatternId: input.antiPatternId,
    category: "architecture",
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    confidence: "medium",
    knowledgeKind: "INFERENCE",
    affectedModuleIds: unique(input.affectedModuleIds),
    affectedDependencyIds: unique(input.affectedDependencyIds),
    affectedSourcePaths: unique(input.affectedSourcePaths),
    evidence: uniqueEvidence(input.evidence),
    suggestedQuestions: input.suggestedQuestions,
    suggestedPlanActions: input.suggestedPlanActions,
    status: "open",
    createdAt: input.now,
    updatedAt: input.now
  };
}

function canonicalCycleKey(cycle: ArchitectureDependency[]): string {
  return cycle
    .map((dependency) => dependency.id)
    .sort()
    .join(":");
}

function sourcePaths(evidence: CodeFactEvidenceRef[]): string[] {
  return evidence.map((item) => item.filePath).filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueEvidence(values: CodeFactEvidenceRef[]): CodeFactEvidenceRef[] {
  const seen = new Set<string>();
  const result: CodeFactEvidenceRef[] = [];
  for (const value of values) {
    const key = `${value.source}:${value.filePath}:${value.startLine ?? ""}:${value.endLine ?? ""}:${value.excerpt ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
