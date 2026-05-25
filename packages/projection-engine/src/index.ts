import type { ArchitectureDependency, ArchitectureModelPatch, ArchitectureModule } from "@praxis/architecture-modeler";
import type { ArchitectureFinding, ArchitectureFindingReport } from "@praxis/finding-detector";

export type ProjectionStatus = "fresh" | "stale" | "regenerating" | "failed";

export interface ArchitectureDependencyView {
  schemaVersion: "praxis.architectureDependencyView.v1";
  id: string;
  kind: "architecture_dependency";
  root: string;
  generatedAt: string;
  nodes: ArchitectureDependencyViewNode[];
  edges: ArchitectureDependencyViewEdge[];
  annotations: ArchitectureDependencyViewAnnotation[];
}

export interface ArchitectureDependencyViewNode {
  id: string;
  label: string;
  path: string;
  role: string;
  confidence: ArchitectureModule["confidence"];
  knowledgeKind: ArchitectureModule["knowledgeKind"];
  sourceMemoryIds: string[];
}

export interface ArchitectureDependencyViewEdge {
  id: string;
  source: string;
  target: string;
  kind: ArchitectureDependency["kind"];
  confidence: ArchitectureDependency["confidence"];
  knowledgeKind: ArchitectureDependency["knowledgeKind"];
  sourceMemoryIds: string[];
  evidenceCount: number;
  findingIds: string[];
}

export interface ArchitectureDependencyViewAnnotation {
  id: string;
  findingId: string;
  antiPatternId: string;
  severity: ArchitectureFinding["severity"];
  status: ArchitectureFinding["status"];
  targetIds: string[];
  summary: string;
}

export interface ProjectionManifest {
  schemaVersion: "praxis.projectionManifest.v1";
  root: string;
  generatedAt: string;
  views: ProjectionViewRecord[];
}

export interface ProjectionViewRecord {
  id: string;
  kind:
    | "architecture_dependency"
    | "architecture_component"
    | "architecture_context"
    | "uml_class"
    | "project_plan"
    | "memory_map"
    | "trace_graph"
    | "quality_inbox";
  path: string;
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];
  status: ProjectionStatus;
  generatedAt?: string;
  error?: string;
}

export interface ProjectArchitectureDependencyViewInput {
  model: ArchitectureModelPatch;
  findings?: ArchitectureFindingReport;
  generatedAt?: string;
}

export function projectArchitectureDependencyView(input: ProjectArchitectureDependencyViewInput): ArchitectureDependencyView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const findingsByDependency = indexFindingsByDependency(input.findings?.findings ?? []);

  return {
    schemaVersion: "praxis.architectureDependencyView.v1",
    id: "view:architecture:dependency",
    kind: "architecture_dependency",
    root: input.model.root,
    generatedAt,
    nodes: input.model.modules.map(projectModule),
    edges: input.model.dependencies.map((dependency) => projectDependency(dependency, findingsByDependency.get(dependency.id) ?? [])),
    annotations: projectAnnotations(input.findings?.findings ?? [])
  };
}

export function buildProjectionManifest(input: {
  root: string;
  generatedAt?: string;
  dependencyView?: ArchitectureDependencyView;
  dependencyViewPath?: string;
  error?: string;
}): ProjectionManifest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceMemoryIds = unique(input.dependencyView?.edges.flatMap((edge) => edge.sourceMemoryIds) ?? []);
  const sourceFindingIds = unique(input.dependencyView?.annotations.map((annotation) => annotation.findingId) ?? []);

  return {
    schemaVersion: "praxis.projectionManifest.v1",
    root: input.root,
    generatedAt,
    views: [
      {
        id: "view:architecture:dependency",
        kind: "architecture_dependency",
        path: input.dependencyViewPath ?? ".distinction/views/architecture/dependency-view.json",
        sourceMemoryIds,
        sourceModelIds: ["cache:architecture-model-patch"],
        sourceFindingIds,
        sourceTaskIds: [],
        sourceTraceIds: [],
        sourceSpecPaths: [],
        status: input.error ? "failed" : "fresh",
        generatedAt: input.error ? undefined : generatedAt,
        error: input.error
      }
    ]
  };
}

function projectModule(module: ArchitectureModule): ArchitectureDependencyViewNode {
  return {
    id: module.id,
    label: module.name,
    path: module.path,
    role: module.role,
    confidence: module.confidence,
    knowledgeKind: module.knowledgeKind,
    sourceMemoryIds: module.sourceMemoryIds
  };
}

function projectDependency(dependency: ArchitectureDependency, findings: ArchitectureFinding[]): ArchitectureDependencyViewEdge {
  return {
    id: dependency.id,
    source: dependency.sourceModuleId,
    target: dependency.targetModuleId,
    kind: dependency.kind,
    confidence: dependency.confidence,
    knowledgeKind: dependency.knowledgeKind,
    sourceMemoryIds: dependency.sourceMemoryIds,
    evidenceCount: dependency.evidence.length,
    findingIds: findings.map((finding) => finding.id)
  };
}

function projectAnnotations(findings: ArchitectureFinding[]): ArchitectureDependencyViewAnnotation[] {
  return findings.map((finding) => ({
    id: `annotation:${finding.id}`,
    findingId: finding.id,
    antiPatternId: finding.antiPatternId,
    severity: finding.severity,
    status: finding.status,
    targetIds: [...finding.affectedDependencyIds, ...finding.affectedModuleIds],
    summary: finding.summary
  }));
}

function indexFindingsByDependency(findings: ArchitectureFinding[]): Map<string, ArchitectureFinding[]> {
  const result = new Map<string, ArchitectureFinding[]>();
  for (const finding of findings) {
    for (const dependencyId of finding.affectedDependencyIds) {
      const existing = result.get(dependencyId) ?? [];
      existing.push(finding);
      result.set(dependencyId, existing);
    }
  }
  return result;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
