import type {
  ArchitectureDependency,
  ArchitectureDependencyView,
  ArchitectureDependencyViewAnnotation,
  ArchitectureDependencyViewEdge,
  ArchitectureDependencyViewNode,
  ArchitectureFinding,
  ArchitectureFindingReport,
  ArchitectureModelPatch,
  ArchitectureModule,
  CodeFactGraphSnapshot,
  CodeFactNode,
  GraphAnchor,
  ProjectArchitectureDependencyViewInput,
  ProjectedGraphAnnotation,
  ProjectedGraphEdge,
  ProjectedGraphNode,
  ProjectedGraphView,
  ProjectionManifest
} from "@praxis/schema";

export type {
  ArchitectureDependencyView,
  ArchitectureDependencyViewAnnotation,
  ArchitectureDependencyViewEdge,
  ArchitectureDependencyViewNode,
  ProjectedGraphView,
  ProjectedGraphNode,
  ProjectedGraphEdge,
  ProjectedGraphAnnotation,
  ProjectArchitectureDependencyViewInput,
  ProjectionManifest,
  ProjectionStatus,
  ProjectionViewRecord
} from "@praxis/schema";

export interface ProjectCodeFactGraphViewInput {
  codeFacts: CodeFactGraphSnapshot;
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
}

export interface ProjectFindingsGraphViewInput {
  findings: ArchitectureFindingReport;
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
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
  projectedViews?: { view: ProjectedGraphView; path: string }[];
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
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
      ...(input.dependencyView
        ? [
            {
              id: "view:architecture:dependency",
              kind: "architecture_dependency" as const,
              path: input.dependencyViewPath ?? ".distinction/views/architecture/dependency-view.json",
              authority: input.authority ?? "review_cache",
              sourceCachePaths: input.sourceCachePaths ?? [
                ".distinction/cache/architecture-model-patch.json",
                ".distinction/cache/architecture-findings.json"
              ],
              sourceMemoryIds,
              sourceModelIds: ["cache:architecture-model-patch"],
              sourceFindingIds,
              sourceTaskIds: [],
              sourceTraceIds: [],
              sourceSpecPaths: [],
              status: input.error ? "failed" as const : "fresh" as const,
              generatedAt: input.error ? undefined : generatedAt,
              error: input.error
            }
          ]
        : []),
      ...(input.projectedViews ?? []).map(({ view, path }) => ({
        id: view.id,
        kind: view.kind,
        path,
        authority: view.authority,
        sourceCachePaths: view.sourceCachePaths,
        sourceMemoryIds: view.sourceMemoryIds,
        sourceModelIds: view.sourceModelIds,
        sourceFindingIds: view.sourceFindingIds,
        sourceTaskIds: view.sourceTaskIds,
        sourceTraceIds: view.sourceTraceIds,
        sourceSpecPaths: view.sourceSpecPaths,
        status: view.status,
        generatedAt: view.status === "fresh" ? view.generatedAt : undefined,
        error: view.error
      }))
    ]
  };
}

export function projectCodeFactGraphView(input: ProjectCodeFactGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nodeIds = new Set(input.codeFacts.nodes.map((node) => node.id));
  const nodes = input.codeFacts.nodes.map(projectCodeFactNode);
  const edges = input.codeFacts.edges
    .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
    .map((edge) => ({
      id: projectedEdgeId("code-fact", edge.id),
      kind: edge.kind,
      sourceId: projectedNodeId("code-fact", edge.sourceId),
      targetId: projectedNodeId("code-fact", edge.targetId),
      source: { type: "code_fact_edge" as const, id: edge.id },
      anchor: { kind: "code_fact_edge" as const, id: edge.id, path: edge.filePath },
      confidence: confidenceFromNumber(edge.confidence),
      summary: `${edge.kind}: ${edge.sourceId} -> ${edge.targetId}`,
      metadata: {
        filePath: edge.filePath,
        range: edge.range,
        evidenceCount: edge.evidence.length
      }
    }));

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:code-facts",
    kind: "code_fact",
    root: input.codeFacts.root,
    generatedAt,
    authority: input.authority ?? "review_cache",
    nodes,
    edges,
    annotations: [],
    sourceCachePaths: input.sourceCachePaths ?? [".distinction/cache/code-fact-graph.json"],
    sourceMemoryIds: [],
    sourceModelIds: [],
    sourceFindingIds: [],
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: [],
    status: "fresh"
  };
}

export function projectFindingsGraphView(input: ProjectFindingsGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nodeMap = new Map<string, ProjectedGraphNode>();
  const edges: ProjectedGraphEdge[] = [];
  const annotations: ProjectedGraphAnnotation[] = [];

  for (const finding of input.findings.findings) {
    const findingNode = projectedFindingNode(finding);
    nodeMap.set(findingNode.id, findingNode);
    const targets = [
      ...finding.affectedModuleIds.map((id) => targetNode("architecture_module", id)),
      ...finding.affectedDependencyIds.map((id) => targetNode("architecture_dependency", id)),
      ...finding.affectedSourcePaths.map((filePath) => targetFileNode(filePath))
    ];

    for (const target of targets) {
      nodeMap.set(target.id, target);
      edges.push({
        id: projectedEdgeId("finding-affects", `${finding.id}:${target.id}`),
        kind: "affects",
        sourceId: findingNode.id,
        targetId: target.id,
        source: { type: "finding", id: finding.id },
        anchor: { kind: "finding", id: finding.id },
        confidence: finding.confidence,
        summary: `${finding.id} affects ${target.label}`,
        metadata: {
          antiPatternId: finding.antiPatternId,
          severity: finding.severity
        }
      });
    }

    annotations.push({
      id: `annotation:${finding.id}`,
      kind: "finding",
      sourceFindingId: finding.id,
      targetNodeIds: targets.map((target) => target.id),
      targetEdgeIds: [],
      severity: finding.severity,
      status: finding.status,
      summary: finding.summary,
      anchor: { kind: "finding", id: finding.id },
      metadata: {
        antiPatternId: finding.antiPatternId,
        category: finding.category
      }
    });
  }

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:findings",
    kind: "finding",
    root: input.findings.root,
    generatedAt,
    authority: input.authority ?? "review_cache",
    nodes: Array.from(nodeMap.values()),
    edges,
    annotations,
    sourceCachePaths: input.sourceCachePaths ?? [".distinction/cache/architecture-findings.json"],
    sourceMemoryIds: [],
    sourceModelIds: [],
    sourceFindingIds: input.findings.findings.map((finding) => finding.id),
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: [],
    status: "fresh"
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

function projectCodeFactNode(node: CodeFactNode): ProjectedGraphNode {
  return {
    id: projectedNodeId("code-fact", node.id),
    kind: node.kind,
    label: node.name,
    source: { type: "code_fact", id: node.id },
    anchor: codeFactNodeAnchor(node),
    path: node.filePath === "." ? undefined : node.filePath,
    summary: node.qualifiedName,
    metadata: {
      qualifiedName: node.qualifiedName,
      language: node.language,
      range: node.range,
      evidenceCount: node.evidence.length
    }
  };
}

function codeFactNodeAnchor(node: CodeFactNode): GraphAnchor {
  if (node.kind === "file") return { kind: "file", id: node.id, path: node.filePath };
  if (node.kind === "project") return { kind: "code_fact_node", id: node.id };
  return { kind: "symbol", id: node.id, path: node.filePath };
}

function projectedFindingNode(finding: ArchitectureFinding): ProjectedGraphNode {
  return {
    id: projectedNodeId("finding", finding.id),
    kind: "finding",
    label: finding.title,
    source: { type: "finding", id: finding.id },
    anchor: { kind: "finding", id: finding.id },
    status: finding.status,
    summary: finding.summary,
    metadata: {
      antiPatternId: finding.antiPatternId,
      severity: finding.severity,
      confidence: finding.confidence,
      knowledgeKind: finding.knowledgeKind
    }
  };
}

function targetNode(kind: "architecture_module" | "architecture_dependency", id: string): ProjectedGraphNode {
  return {
    id: projectedNodeId(kind, id),
    kind,
    label: id,
    source: { type: kind === "architecture_module" ? "model" : "model_dependency", id },
    anchor: { kind, id }
  };
}

function targetFileNode(filePath: string): ProjectedGraphNode {
  return {
    id: projectedNodeId("file", filePath),
    kind: "file",
    label: filePath.split(/[\\/]/).pop() ?? filePath,
    source: { type: "code_fact", id: filePath },
    anchor: { kind: "file", id: filePath, path: filePath },
    path: filePath
  };
}

function projectedNodeId(prefix: string, id: string): string {
  return `projection-node:${prefix}:${id}`;
}

function projectedEdgeId(prefix: string, id: string): string {
  return `projection-edge:${prefix}:${id}`;
}

function confidenceFromNumber(value: number): "low" | "medium" | "high" {
  if (value >= 0.8) return "high";
  if (value >= 0.5) return "medium";
  return "low";
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
