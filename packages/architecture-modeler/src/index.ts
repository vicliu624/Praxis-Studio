import { slugify } from "@praxis/core";
import type {
  ArchitectureDependency,
  ArchitectureModelPatch,
  ArchitectureModelWarning,
  ArchitectureModule,
  ArchitectureModuleRole,
  CodeFactEvidenceRef,
  MemoryRecord
} from "@praxis/schema";

export type {
  ArchitectureDependency,
  ArchitectureModelPatch,
  ArchitectureModelWarning,
  ArchitectureModule,
  ArchitectureModuleRole
} from "@praxis/schema";

export function buildArchitectureModelPatch(root: string, memoryRecords: MemoryRecord[]): ArchitectureModelPatch {
  const fileFacts = memoryRecords.filter((record) => record.kind === "FACT" && record.type === "code.file.exists");
  const importFacts = memoryRecords.filter((record) => record.kind === "FACT" && record.type === "code.import.exists");
  const modules = inferModules(fileFacts);
  const dependencies = inferDependencies(importFacts, modules);
  return {
    schemaVersion: "praxis.architectureModelPatch.v1",
    root,
    generatedAt: new Date().toISOString(),
    modules,
    dependencies,
    warnings: buildWarnings(modules, dependencies),
    confidence: modules.length > 0 ? "medium" : "low"
  };
}

export function inferModules(fileFacts: MemoryRecord[]): ArchitectureModule[] {
  const byPath = new Map<string, { memoryIds: string[]; evidence: CodeFactEvidenceRef[] }>();
  for (const fact of fileFacts) {
    const modulePath = modulePathForFile(fact.subject);
    if (!modulePath) continue;
    const existing = byPath.get(modulePath) ?? { memoryIds: [], evidence: [] };
    existing.memoryIds.push(fact.id);
    existing.evidence.push(...fact.evidence);
    byPath.set(modulePath, existing);
  }

  return Array.from(byPath.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modulePath, source]) => ({
      id: `arch-module:${slugify(modulePath)}`,
      name: modulePath,
      path: modulePath,
      role: inferRole(modulePath),
      responsibilities: [`Owns source files under ${modulePath}.`],
      sourceMemoryIds: unique(source.memoryIds),
      evidence: uniqueEvidence(source.evidence),
      confidence: "medium",
      knowledgeKind: "INFERENCE"
    }));
}

export function inferDependencies(importFacts: MemoryRecord[], modules: ArchitectureModule[]): ArchitectureDependency[] {
  const moduleByPath = new Map(modules.map((module) => [module.path, module]));
  const dependencies = new Map<string, ArchitectureDependency>();

  for (const fact of importFacts) {
    const sourcePath = modulePathForFile(fact.subject);
    const targetPath = modulePathForImport(String(fact.object ?? ""));
    if (!sourcePath || !targetPath || sourcePath === targetPath) continue;
    const source = moduleByPath.get(sourcePath);
    const target = moduleByPath.get(targetPath);
    if (!source || !target) continue;
    const id = `arch-dep:${slugify(`${source.id}:depends_on:${target.id}`)}`;
    const existing = dependencies.get(id);
    if (existing) {
      existing.sourceMemoryIds = unique([...existing.sourceMemoryIds, fact.id]);
      existing.evidence = uniqueEvidence([...existing.evidence, ...fact.evidence]);
      continue;
    }
    dependencies.set(id, {
      id,
      sourceModuleId: source.id,
      targetModuleId: target.id,
      kind: "depends_on",
      sourceMemoryIds: [fact.id],
      evidence: uniqueEvidence(fact.evidence),
      confidence: "medium",
      knowledgeKind: "INFERENCE"
    });
  }

  return Array.from(dependencies.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function buildWarnings(modules: ArchitectureModule[], dependencies: ArchitectureDependency[]): ArchitectureModelWarning[] {
  const warnings: ArchitectureModelWarning[] = [];
  if (!modules.length) {
    warnings.push({
      id: "architecture-model-warning:no-modules",
      severity: "warning",
      summary: "No architecture modules were inferred from accepted memory facts."
    });
  }
  if (!dependencies.length) {
    warnings.push({
      id: "architecture-model-warning:no-dependencies",
      severity: "info",
      summary: "No package-level dependencies were inferred from accepted import facts."
    });
  }
  return warnings;
}

function modulePathForFile(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const appMatch = normalized.match(/^apps\/[^/]+/);
  if (appMatch) return appMatch[0];
  const packageMatch = normalized.match(/^packages\/[^/]+/);
  if (packageMatch) return packageMatch[0];
  if (normalized === "docs" || normalized.startsWith("docs/")) return "docs";
  return undefined;
}

function modulePathForImport(importPath: string): string | undefined {
  const praxisMatch = importPath.match(/^@praxis\/([^/]+)/);
  if (praxisMatch) return `packages/${praxisMatch[1]}`;
  return undefined;
}

function inferRole(modulePath: string): ArchitectureModuleRole {
  const lower = modulePath.toLowerCase();
  if (modulePath === "docs") return "docs";
  if (lower.includes("studio-desktop")) return "ui";
  if (lower.includes("runtime-cli")) return "tooling";
  if (lower.includes("runtime") || lower.includes("agent")) return "runtime";
  if (lower.includes("knowledge") || lower.includes("store")) return "storage";
  if (lower.includes("model")) return "model";
  if (lower.includes("projection")) return "projection";
  if (lower.includes("adapter") || lower.includes("provider")) return "adapter";
  if (lower.includes("tool") || lower.includes("trace")) return "infrastructure";
  if (lower.includes("core") || lower.includes("graph")) return "domain";
  if (modulePath.startsWith("apps/")) return "application";
  return "unknown";
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
