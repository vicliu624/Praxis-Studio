import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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
  ContextPacket,
  GraphAnchor,
  InteractionModelCandidate,
  MemoryRecord,
  ProjectArchitectureDependencyViewInput,
  ProjectedGraphAnnotation,
  ProjectedGraphEdge,
  ProjectedGraphNode,
  ProjectedGraphView,
  ProjectionManifest
} from "@praxis/schema";
import { ProjectedGraphViewSchema } from "@praxis/schema";

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

export interface ProjectArchitectureDependencyGraphViewInput extends ProjectArchitectureDependencyViewInput {
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
}

export interface ProjectMemoryGraphViewInput {
  root: string;
  records: MemoryRecord[];
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceMemoryPaths?: string[];
}

export interface TraceProjectionRecord {
  id: string;
  traceId?: string;
  timestamp?: string;
  kind?: string;
  target?: { type?: string; id?: string };
  summary?: string;
  data?: Record<string, unknown>;
}

export interface ProjectTraceGraphViewInput {
  root: string;
  traces: TraceProjectionRecord[];
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceTracePaths?: string[];
}

export interface TaskProjectionRecord {
  id: string;
  title: string;
  path?: string;
  status?: string;
  summary?: string;
  sourceFindingIds?: string[];
}

export interface ProjectTaskPlanGraphViewInput {
  root: string;
  tasks: TaskProjectionRecord[];
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceTaskPaths?: string[];
}

export interface ProjectContextGraphViewInput {
  packet: ContextPacket;
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
}

export interface ProjectDesignUseCaseViewsInput {
  model: InteractionModelCandidate;
  generatedAt?: string;
  authority?: "review_cache" | "durable_model";
  sourceCachePaths?: string[];
  sourceSpecPaths?: string[];
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

export function projectArchitectureDependencyGraphView(input: ProjectArchitectureDependencyGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const findings = input.findings?.findings ?? [];
  const findingsByDependency = indexFindingsByDependency(findings);
  const moduleIds = new Set(input.model.modules.map((module) => module.id));
  const nodes = input.model.modules.map((module) => ({
    id: projectedNodeId("architecture-module", module.id),
    kind: "architecture_module",
    label: module.name,
    source: { type: "model" as const, id: module.id },
    anchor: { kind: "architecture_module" as const, id: module.id, path: module.path },
    path: module.path,
    summary: module.role,
    metadata: {
      role: module.role,
      confidence: module.confidence,
      knowledgeKind: module.knowledgeKind,
      sourceMemoryIds: module.sourceMemoryIds
    }
  }));
  const edges = input.model.dependencies
    .filter((dependency) => moduleIds.has(dependency.sourceModuleId) && moduleIds.has(dependency.targetModuleId))
    .map((dependency) => ({
      id: projectedEdgeId("architecture-dependency", dependency.id),
      kind: dependency.kind,
      sourceId: projectedNodeId("architecture-module", dependency.sourceModuleId),
      targetId: projectedNodeId("architecture-module", dependency.targetModuleId),
      source: { type: "model_dependency" as const, id: dependency.id },
      anchor: { kind: "architecture_dependency" as const, id: dependency.id },
      confidence: dependency.confidence,
      summary: `${dependency.sourceModuleId} ${dependency.kind} ${dependency.targetModuleId}`,
      metadata: {
        knowledgeKind: dependency.knowledgeKind,
        evidenceCount: dependency.evidence.length,
        findingIds: (findingsByDependency.get(dependency.id) ?? []).map((finding) => finding.id),
        sourceMemoryIds: dependency.sourceMemoryIds
      }
    }));
  const annotations = findings.map((finding) => ({
    id: `annotation:${finding.id}`,
    kind: "finding",
    sourceFindingId: finding.id,
    targetNodeIds: finding.affectedModuleIds.map((id) => projectedNodeId("architecture-module", id)),
    targetEdgeIds: finding.affectedDependencyIds.map((id) => projectedEdgeId("architecture-dependency", id)),
    severity: finding.severity,
    status: finding.status,
    summary: finding.summary,
    anchor: { kind: "finding" as const, id: finding.id },
    metadata: {
      antiPatternId: finding.antiPatternId,
      category: finding.category
    }
  }));

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:architecture:dependency-graph",
    kind: "architecture_dependency",
    root: input.model.root,
    generatedAt,
    authority: input.authority ?? "review_cache",
    nodes,
    edges,
    annotations,
    sourceCachePaths: input.sourceCachePaths ?? [
      ".distinction/cache/architecture-model-patch.json",
      ".distinction/cache/architecture-findings.json"
    ],
    sourceMemoryIds: unique([
      ...input.model.modules.flatMap((module) => module.sourceMemoryIds),
      ...input.model.dependencies.flatMap((dependency) => dependency.sourceMemoryIds)
    ]),
    sourceModelIds: [
      ...input.model.modules.map((module) => module.id),
      ...input.model.dependencies.map((dependency) => dependency.id)
    ],
    sourceFindingIds: findings.map((finding) => finding.id),
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: [],
    status: "fresh"
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

export function projectMemoryGraphView(input: ProjectMemoryGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nodeMap = new Map<string, ProjectedGraphNode>();
  const edges: ProjectedGraphEdge[] = [];

  for (const record of input.records) {
    const memoryNode: ProjectedGraphNode = {
      id: projectedNodeId("memory", record.id),
      kind: `memory:${record.kind.toLowerCase()}`,
      label: record.summary,
      source: { type: "memory", id: record.id },
      anchor: { kind: "memory", id: record.id },
      status: record.status,
      summary: `${record.subject} ${record.predicate}${record.object ? ` ${record.object}` : ""}`,
      metadata: {
        type: record.type,
        source: record.source,
        confidence: record.confidence
      }
    };
    nodeMap.set(memoryNode.id, memoryNode);
    for (const evidence of record.evidence) {
      const fileNode = targetFileNode(evidence.filePath);
      nodeMap.set(fileNode.id, fileNode);
      edges.push({
        id: projectedEdgeId("memory-evidence", `${record.id}:${evidence.filePath}`),
        kind: "evidenced_by",
        sourceId: memoryNode.id,
        targetId: fileNode.id,
        source: { type: "memory", id: record.id },
        anchor: { kind: "memory", id: record.id, path: evidence.filePath },
        confidence: record.confidence,
        summary: `${record.id} evidenced by ${evidence.filePath}`,
        metadata: {
          evidenceSource: evidence.source,
          startLine: evidence.startLine,
          endLine: evidence.endLine
        }
      });
    }
  }

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:memory",
    kind: "memory",
    root: input.root,
    generatedAt,
    authority: input.authority ?? "durable_model",
    nodes: Array.from(nodeMap.values()),
    edges,
    annotations: [],
    sourceCachePaths: [],
    sourceMemoryIds: input.records.map((record) => record.id),
    sourceModelIds: [],
    sourceFindingIds: [],
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: input.sourceMemoryPaths ?? [".distinction/memory/*.jsonl"],
    status: "fresh"
  };
}

export function projectTraceGraphView(input: ProjectTraceGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const traces = input.traces;
  const nodes = traces.map((trace) => ({
    id: projectedNodeId("trace", trace.id),
    kind: trace.kind ?? "trace_event",
    label: trace.summary ?? trace.kind ?? trace.id,
    source: { type: "trace" as const, id: trace.id },
    anchor: { kind: "trace" as const, id: trace.id },
    status: trace.kind,
    summary: trace.summary,
    metadata: {
      traceId: trace.traceId,
      timestamp: trace.timestamp,
      target: trace.target,
      data: trace.data
    }
  }));
  const grouped = groupBy(traces, (trace) => trace.traceId ?? "trace");
  const edges: ProjectedGraphEdge[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort((left, right) => String(left.timestamp ?? "").localeCompare(String(right.timestamp ?? "")));
    for (let index = 1; index < ordered.length; index += 1) {
      edges.push({
        id: projectedEdgeId("trace-next", `${ordered[index - 1].id}:${ordered[index].id}`),
        kind: "next",
        sourceId: projectedNodeId("trace", ordered[index - 1].id),
        targetId: projectedNodeId("trace", ordered[index].id),
        source: { type: "trace", id: ordered[index].id },
        anchor: { kind: "trace", id: ordered[index].id },
        summary: "Trace event order"
      });
    }
  }

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:trace",
    kind: "trace",
    root: input.root,
    generatedAt,
    authority: input.authority ?? "durable_model",
    nodes,
    edges,
    annotations: [],
    sourceCachePaths: [],
    sourceMemoryIds: [],
    sourceModelIds: [],
    sourceFindingIds: [],
    sourceTaskIds: [],
    sourceTraceIds: traces.map((trace) => trace.id),
    sourceSpecPaths: input.sourceTracePaths ?? [".distinction/memory/traces.jsonl"],
    status: "fresh"
  };
}

export function projectTaskPlanGraphView(input: ProjectTaskPlanGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nodes = input.tasks.map((task) => ({
    id: projectedNodeId("task", task.id),
    kind: "task",
    label: task.title,
    source: { type: "task" as const, id: task.id },
    anchor: { kind: "task" as const, id: task.id, path: task.path },
    path: task.path,
    status: task.status,
    summary: task.summary,
    metadata: {
      sourceFindingIds: task.sourceFindingIds ?? []
    }
  }));
  const edges = input.tasks.flatMap((task) =>
    (task.sourceFindingIds ?? []).map((findingId) => ({
      id: projectedEdgeId("task-from-finding", `${task.id}:${findingId}`),
      kind: "derived_from_finding",
      sourceId: projectedNodeId("finding", findingId),
      targetId: projectedNodeId("task", task.id),
      source: { type: "task" as const, id: task.id },
      anchor: { kind: "task" as const, id: task.id, path: task.path },
      summary: `${task.id} derived from ${findingId}`
    }))
  );

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:task-plan",
    kind: "task_plan",
    root: input.root,
    generatedAt,
    authority: input.authority ?? "durable_model",
    nodes,
    edges,
    annotations: [],
    sourceCachePaths: [],
    sourceMemoryIds: [],
    sourceModelIds: [],
    sourceFindingIds: unique(input.tasks.flatMap((task) => task.sourceFindingIds ?? [])),
    sourceTaskIds: input.tasks.map((task) => task.id),
    sourceTraceIds: [],
    sourceSpecPaths: input.sourceTaskPaths ?? [".distinction/tasks/*.md"],
    status: "fresh"
  };
}

export function projectContextGraphView(input: ProjectContextGraphViewInput): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const packet = input.packet;
  const contextNode: ProjectedGraphNode = {
    id: projectedNodeId("context", packet.id),
    kind: "context_packet",
    label: packet.id,
    source: { type: "projection", id: packet.id },
    anchor: packet.anchor,
    summary: `ContextPacket for ${packet.anchor.kind}:${packet.anchor.id}`,
    metadata: {
      purpose: packet.purpose,
      createdBy: packet.trace.createdBy
    }
  };
  const nodeMap = new Map<string, ProjectedGraphNode>([[contextNode.id, contextNode]]);
  const edges: ProjectedGraphEdge[] = [];
  const relatedNodes: ProjectedGraphNode[] = [
    ...packet.codeFacts.nodes.map(projectCodeFactNode),
    ...packet.findings.map(projectedFindingNode),
    ...packet.memory.facts.map(projectMemoryRecordNode),
    ...packet.memory.inferences.map(projectMemoryRecordNode),
    ...packet.memory.candidates.map(projectMemoryRecordNode),
    ...packet.memory.confirmations.map(projectMemoryRecordNode)
  ];
  for (const node of relatedNodes) {
    nodeMap.set(node.id, node);
    edges.push({
      id: projectedEdgeId("context-includes", `${packet.id}:${node.id}`),
      kind: "includes",
      sourceId: contextNode.id,
      targetId: node.id,
      source: { type: "projection", id: packet.id },
      anchor: packet.anchor,
      summary: `${packet.id} includes ${node.label}`
    });
  }

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: "view:context",
    kind: "context",
    root: packet.root,
    generatedAt,
    authority: input.authority ?? packet.authority.projectionAuthority,
    nodes: Array.from(nodeMap.values()),
    edges,
    annotations: packet.projections.annotations,
    sourceCachePaths: input.sourceCachePaths ?? [".distinction/cache/context-packet.json"],
    sourceMemoryIds: [
      ...packet.memory.facts.map((record) => record.id),
      ...packet.memory.inferences.map((record) => record.id),
      ...packet.memory.candidates.map((record) => record.id),
      ...packet.memory.confirmations.map((record) => record.id)
    ],
    sourceModelIds: packet.models.architecture
      ? [
          ...packet.models.architecture.modules.map((module) => module.id),
          ...packet.models.architecture.dependencies.map((dependency) => dependency.id)
        ]
      : [],
    sourceFindingIds: packet.findings.map((finding) => finding.id),
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: [],
    status: "fresh"
  };
}

export function projectDesignUseCaseListView(input: ProjectDesignUseCaseViewsInput): ProjectedGraphView {
  return projectDesignUseCaseView(input, {
    id: "view:design:use-case-list",
    kind: "design_use_case_list",
    contextId: undefined
  });
}

export function projectDesignUseCaseGraphViews(input: ProjectDesignUseCaseViewsInput): ProjectedGraphView[] {
  return input.model.contexts.filter((context) => hasUseCaseInContextScope(input.model, context.id)).map((context) =>
    projectDesignUseCaseView(input, {
      id: `view:design:use-case:${context.id}`,
      kind: "design_use_case",
      contextId: context.id
    })
  );
}

export function renderUseCaseDiagramMermaid(model: InteractionModelCandidate, contextId?: string): string {
  const contextById = new Map(model.contexts.map((context) => [context.id, context]));
  const scopeContextIds = contextId ? designContextScopeIds(model, contextId) : new Set(model.contexts.map((context) => context.id));
  const useCases = contextId ? model.useCases.filter((useCase) => scopeContextIds.has(useCase.contextId)) : model.useCases;
  const useCaseIds = new Set(useCases.map((useCase) => useCase.id));
  const actorIds = new Set(useCases.flatMap((useCase) => [...useCase.primaryActorIds, ...useCase.supportingActorIds]));
  const externalSystemIds = new Set(useCases.flatMap((useCase) => useCase.externalSystemIds));
  const lines = ["flowchart LR"];
  const childrenByContext = designContextChildrenByParent(model);
  const visibleContextIds = new Set<string>();
  for (const useCase of useCases) {
    visibleContextIds.add(useCase.contextId);
    for (const ancestorId of designContextAncestorIds(model, useCase.contextId)) visibleContextIds.add(ancestorId);
  }
  if (contextId) {
    visibleContextIds.add(contextId);
    for (const ancestorId of designContextAncestorIds(model, contextId)) visibleContextIds.add(ancestorId);
  }
  const useCasesByContext = groupBy(useCases, (useCase) => useCase.contextId);

  for (const actor of model.actors.filter((item) => actorIds.has(item.id))) {
    lines.push(`  ${mermaidId("actor", actor.id)}["${mermaidLabel(`&laquo;Actor&raquo;<br/>${actor.title}`)}"]`);
  }
  for (const external of model.externalSystems.filter((item) => externalSystemIds.has(item.id))) {
    lines.push(`  ${mermaidId("external", external.id)}["${mermaidLabel(`&laquo;External System&raquo;<br/>${external.title}`)}"]`);
  }
  const rootContextIds = contextId
    ? [designTopContextId(model, contextId)]
    : model.contexts.filter((context) => !context.parentContextId).map((context) => context.id);
  for (const rootContextId of unique(rootContextIds).filter((id) => visibleContextIds.has(id) && contextById.has(id))) {
    renderUseCaseContextBoundary({
      lines,
      contextId: rootContextId,
      contextById,
      childrenByContext,
      visibleContextIds,
      useCasesByContext,
      depth: 1
    });
  }
  for (const [currentContextId, contextUseCases] of useCasesByContext) {
    if (contextById.has(currentContextId)) continue;
    const boundaryId = mermaidId("system", currentContextId || "boundary");
    lines.push(`  subgraph ${boundaryId}["${mermaidLabel(currentContextId || "System Boundary")}"]`);
    for (const useCase of contextUseCases) {
      lines.push(`    ${mermaidId("useCase", useCase.id)}(["${mermaidLabel(useCase.title)}"])`);
    }
    lines.push("  end");
  }
  for (const useCase of useCases) {
    for (const actorId of useCase.primaryActorIds) {
      if (actorIds.has(actorId)) lines.push(`  ${mermaidId("actor", actorId)} --- ${mermaidId("useCase", useCase.id)}`);
    }
    for (const actorId of useCase.supportingActorIds) {
      if (actorIds.has(actorId)) lines.push(`  ${mermaidId("actor", actorId)} --- ${mermaidId("useCase", useCase.id)}`);
    }
    for (const externalId of useCase.externalSystemIds) {
      if (externalSystemIds.has(externalId)) lines.push(`  ${mermaidId("external", externalId)} --- ${mermaidId("useCase", useCase.id)}`);
    }
  }
  for (const relation of model.relations) {
    if (!useCaseIds.has(relation.sourceId) || !useCaseIds.has(relation.targetId)) continue;
    lines.push(`  ${mermaidId("useCase", relation.sourceId)} ${useCaseRelationArrow(relation.kind)} ${mermaidId("useCase", relation.targetId)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderUseCaseContextBoundary(input: {
  lines: string[];
  contextId: string;
  contextById: Map<string, InteractionModelCandidate["contexts"][number]>;
  childrenByContext: Map<string, string[]>;
  visibleContextIds: Set<string>;
  useCasesByContext: Map<string, InteractionModelCandidate["useCases"]>;
  depth: number;
}): void {
  const context = input.contextById.get(input.contextId);
  if (!context) return;
  const contextUseCases = input.useCasesByContext.get(input.contextId) ?? [];
  const childIds = (input.childrenByContext.get(input.contextId) ?? [])
    .filter((childId) => input.visibleContextIds.has(childId) && hasVisibleUseCaseInSubtree(childId, input.childrenByContext, input.useCasesByContext));
  if (!contextUseCases.length && !childIds.length) return;
  const indent = "  ".repeat(input.depth);
  input.lines.push(`${indent}subgraph ${mermaidId("system", input.contextId)}["${mermaidLabel(context.title)}"]`);
  for (const childId of childIds) {
    renderUseCaseContextBoundary({ ...input, contextId: childId, depth: input.depth + 1 });
  }
  for (const useCase of contextUseCases) {
    input.lines.push(`${indent}  ${mermaidId("useCase", useCase.id)}(["${mermaidLabel(useCase.title)}"])`);
  }
  input.lines.push(`${indent}end`);
}

function hasVisibleUseCaseInSubtree(
  contextId: string,
  childrenByContext: Map<string, string[]>,
  useCasesByContext: Map<string, InteractionModelCandidate["useCases"]>
): boolean {
  if ((useCasesByContext.get(contextId) ?? []).length) return true;
  return (childrenByContext.get(contextId) ?? []).some((childId) => hasVisibleUseCaseInSubtree(childId, childrenByContext, useCasesByContext));
}

function useCaseRelationArrow(kind: InteractionModelCandidate["relations"][number]["kind"]): string {
  if (kind === "includes") return `-.->|${mermaidLabel("&laquo;include&raquo;")}|`;
  if (kind === "extends") return `-.->|${mermaidLabel("&laquo;extend&raquo;")}|`;
  if (kind === "depends_on") return `-.->|${mermaidLabel("depends on")}|`;
  if (kind === "triggers") return `-.->|${mermaidLabel("triggers")}|`;
  if (kind === "conflicts_with") return `-.->|${mermaidLabel("conflicts")}|`;
  if (kind === "out_of_scope_for") return `-.->|${mermaidLabel("out of scope")}|`;
  return `---|${mermaidLabel(kind)}|`;
}

function projectDesignUseCaseView(
  input: ProjectDesignUseCaseViewsInput,
  options: { id: string; kind: "design_use_case_list" | "design_use_case"; contextId?: string }
): ProjectedGraphView {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const model = input.model;
  const scopedContextIds = options.contextId ? designContextScopeIds(model, options.contextId) : new Set(model.contexts.map((context) => context.id));
  const visibleContextIds = new Set(scopedContextIds);
  for (const contextId of Array.from(scopedContextIds)) {
    for (const ancestorId of designContextAncestorIds(model, contextId)) visibleContextIds.add(ancestorId);
  }
  const contexts = model.contexts.filter((context) => visibleContextIds.has(context.id));
  const useCases = model.useCases.filter((useCase) => scopedContextIds.has(useCase.contextId));
  const contextIds = new Set(contexts.map((context) => context.id));
  const useCaseIds = new Set(useCases.map((useCase) => useCase.id));
  const actorIds = new Set(useCases.flatMap((useCase) => [...useCase.primaryActorIds, ...useCase.supportingActorIds]));
  const externalSystemIds = new Set(useCases.flatMap((useCase) => useCase.externalSystemIds));
  const actors = model.actors.filter((actor) => actorIds.has(actor.id));
  const externalSystems = model.externalSystems.filter((external) => externalSystemIds.has(external.id));
  const relationCandidates = model.relations.filter((relation) => useCaseIds.has(relation.sourceId) && useCaseIds.has(relation.targetId));
  const drilldownCandidates = model.useCaseDrilldowns.filter((diagram) => useCaseIds.has(diagram.useCaseId));

  const nodes: ProjectedGraphNode[] = [
    ...contexts.map((context) => ({
      id: designNodeId("context", context.id),
      kind: "design_context",
      label: context.title,
      source: { type: "model" as const, id: context.id },
      anchor: { kind: "design_context" as const, id: context.id },
      summary: context.summary,
      status: context.status,
      metadata: {
        ...designMetadata(context),
        contextKind: context.kind,
        parentContextId: context.parentContextId,
        scope: context.scope,
        responsibility: context.responsibility,
        businessTerms: context.businessTerms
      }
    })),
    ...actors.map((actor) => ({
      id: designNodeId("actor", actor.id),
      kind: "design_actor",
      label: actor.title,
      source: { type: "model" as const, id: actor.id },
      anchor: { kind: "design_actor" as const, id: actor.id },
      summary: actor.summary,
      status: actor.status,
      metadata: { ...designMetadata(actor), actorType: actor.type }
    })),
    ...externalSystems.map((external) => ({
      id: designNodeId("external-system", external.id),
      kind: "design_external_system",
      label: external.title,
      source: { type: "model" as const, id: external.id },
      anchor: { kind: "design_external_system" as const, id: external.id },
      summary: external.summary,
      status: external.status,
      metadata: designMetadata(external)
    })),
    ...useCases.map((useCase) => ({
      id: designNodeId("use-case", useCase.id),
      kind: "design_use_case",
      label: useCase.title,
      source: { type: "model" as const, id: useCase.id },
      anchor: { kind: "design_use_case" as const, id: useCase.id },
      summary: useCase.summary,
      status: useCase.status,
      metadata: {
        ...designMetadata(useCase),
        contextId: useCase.contextId,
        trigger: useCase.trigger,
        primaryActorIds: useCase.primaryActorIds,
        supportingActorIds: useCase.supportingActorIds,
        externalSystemIds: useCase.externalSystemIds,
        entryPointIds: useCase.entryPointIds
      }
    })),
    ...drilldownCandidates.map((diagram) => ({
      id: designNodeId(designDrilldownNodeKind(diagram.kind), diagram.id),
      kind: designDrilldownGraphKind(diagram.kind),
      label: diagram.title,
      source: { type: "model" as const, id: diagram.id },
      anchor: { kind: designDrilldownAnchorKind(diagram.kind), id: diagram.id },
      summary: diagram.summary,
      status: diagram.status,
      metadata: {
        ...designMetadata(diagram),
        useCaseId: diagram.useCaseId,
        diagramKind: diagram.kind,
        coverage: diagram.coverage,
        coverageScenario: diagram.coverage.scenario,
        coverageBoundary: diagram.coverage.boundary,
        coverageRationale: diagram.coverage.rationale,
        coveredUseCaseFlows: diagram.coverage.coveredUseCaseFlows,
        notCovered: diagram.coverage.notCovered,
        implementationScope: diagram.coverage.implementationScope,
        explanation: diagram.explanation,
        markdownPath: designDrilldownMarkdownPath(diagram),
        htmlPath: designDrilldownHtmlPath(diagram)
      }
    }))
  ];
  const edges: ProjectedGraphEdge[] = [];

  for (const context of contexts) {
    if (!context.parentContextId || !contextIds.has(context.parentContextId)) continue;
    edges.push({
      id: designEdgeId("context-contains", `${context.parentContextId}:${context.id}`),
      kind: "contains",
      sourceId: designNodeId("context", context.parentContextId),
      targetId: designNodeId("context", context.id),
      source: { type: "model", id: context.id },
      anchor: { kind: "design_context", id: context.id },
      confidence: context.confidence,
      summary: `${context.parentContextId} contains ${context.title}`,
      metadata: { contextKind: context.kind }
    });
  }

  for (const useCase of useCases) {
    if (contextIds.has(useCase.contextId)) {
      edges.push({
        id: designEdgeId("context-contains", `${useCase.contextId}:${useCase.id}`),
        kind: "contains",
        sourceId: designNodeId("context", useCase.contextId),
        targetId: designNodeId("use-case", useCase.id),
        source: { type: "model", id: useCase.id },
        anchor: { kind: "design_use_case", id: useCase.id },
        confidence: useCase.confidence,
        summary: `${useCase.contextId} contains ${useCase.title}`
      });
    }
    for (const actorId of useCase.primaryActorIds) {
      if (!actorIds.has(actorId)) continue;
      edges.push(designParticipationEdge(actorId, useCase, "primary_actor"));
    }
    for (const actorId of useCase.supportingActorIds) {
      if (!actorIds.has(actorId)) continue;
      edges.push(designParticipationEdge(actorId, useCase, "supporting_actor"));
    }
    for (const externalSystemId of useCase.externalSystemIds) {
      if (!externalSystemIds.has(externalSystemId)) continue;
      edges.push({
        id: designEdgeId("external-system-participates", `${externalSystemId}:${useCase.id}`),
        kind: "external_system_participates",
        sourceId: designNodeId("external-system", externalSystemId),
        targetId: designNodeId("use-case", useCase.id),
        source: { type: "model", id: useCase.id },
        anchor: { kind: "design_use_case", id: useCase.id },
        confidence: useCase.confidence,
        summary: `${externalSystemId} participates in ${useCase.title}`,
        metadata: { participation: "external_system" }
      });
    }
  }

  for (const relation of relationCandidates) {
    edges.push({
      id: designEdgeId("relation", relation.id),
      kind: relation.kind,
      sourceId: designNodeId("use-case", relation.sourceId),
      targetId: designNodeId("use-case", relation.targetId),
      source: { type: "model", id: relation.id },
      anchor: { kind: "design_use_case", id: relation.sourceId },
      confidence: relation.confidence,
      summary: relation.summary,
      metadata: designMetadata(relation)
    });
  }

  for (const diagram of drilldownCandidates) {
    edges.push({
      id: designEdgeId("use-case-drilldown", `${diagram.useCaseId}:${diagram.id}`),
      kind: "drilldown",
      sourceId: designNodeId("use-case", diagram.useCaseId),
      targetId: designNodeId(designDrilldownNodeKind(diagram.kind), diagram.id),
      source: { type: "model", id: diagram.id },
      anchor: { kind: designDrilldownAnchorKind(diagram.kind), id: diagram.id },
      confidence: diagram.confidence,
      summary: diagram.summary,
      metadata: {
        useCaseId: diagram.useCaseId,
        diagramKind: diagram.kind
      }
    });
  }

  const annotations = model.questions.map((question) => ({
    id: `annotation:${question.id}`,
    kind: "design_question",
    targetNodeIds: question.targetId ? [designTargetNodeId(question.targetId)].filter(Boolean) : [],
    targetEdgeIds: [],
    severity: designQuestionSeverity(question.severity),
    status: "open",
    summary: question.question,
    anchor: question.targetId ? designTargetAnchor(question.targetId) : undefined
  }));

  return {
    schemaVersion: "praxis.projectedGraphView.v1",
    id: options.id,
    kind: options.kind,
    root: model.root,
    generatedAt,
    authority: input.authority ?? "review_cache",
    nodes,
    edges,
    annotations,
    sourceCachePaths: input.sourceCachePaths ?? [".distinction/cache/design/interaction-model-candidate.json"],
    sourceMemoryIds: unique(designCandidates(model).flatMap((candidate) => candidate.sourceMemoryIds)),
    sourceModelIds: unique(["cache:design-interaction-model", ...designCandidates(model).flatMap((candidate) => candidate.sourceModelIds)]),
    sourceFindingIds: [],
    sourceTaskIds: [],
    sourceTraceIds: [],
    sourceSpecPaths: unique([...(input.sourceSpecPaths ?? []), ...designCandidates(model).flatMap((candidate) => candidate.sourceSpecPaths)]),
    status: "fresh"
  };
}

function designParticipationEdge(actorId: string, useCase: InteractionModelCandidate["useCases"][number], participation: "primary_actor" | "supporting_actor"): ProjectedGraphEdge {
  return {
    id: designEdgeId("actor-participates", `${actorId}:${useCase.id}:${participation}`),
    kind: "actor_participates",
    sourceId: designNodeId("actor", actorId),
    targetId: designNodeId("use-case", useCase.id),
    source: { type: "model", id: useCase.id },
    anchor: { kind: "design_use_case", id: useCase.id },
    confidence: useCase.confidence,
    summary: `${actorId} participates in ${useCase.title}`,
    metadata: { participation }
  };
}

function hasUseCaseInContextScope(model: InteractionModelCandidate, contextId: string): boolean {
  const scopeContextIds = designContextScopeIds(model, contextId);
  return model.useCases.some((useCase) => scopeContextIds.has(useCase.contextId));
}

function designContextScopeIds(model: InteractionModelCandidate, contextId: string): Set<string> {
  const childrenByContext = designContextChildrenByParent(model);
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const childId of childrenByContext.get(id) ?? []) visit(childId);
  };
  visit(contextId);
  return ids;
}

function designContextChildrenByParent(model: InteractionModelCandidate): Map<string, string[]> {
  const childrenByContext = new Map<string, string[]>();
  for (const context of model.contexts) {
    if (!context.parentContextId) continue;
    const next = childrenByContext.get(context.parentContextId) ?? [];
    next.push(context.id);
    childrenByContext.set(context.parentContextId, next);
  }
  return childrenByContext;
}

function designContextAncestorIds(model: InteractionModelCandidate, contextId: string): string[] {
  const contextById = new Map(model.contexts.map((context) => [context.id, context]));
  const ancestors: string[] = [];
  let current = contextById.get(contextId);
  const visited = new Set<string>();
  while (current?.parentContextId && !visited.has(current.parentContextId)) {
    visited.add(current.parentContextId);
    ancestors.unshift(current.parentContextId);
    current = contextById.get(current.parentContextId);
  }
  return ancestors;
}

function designTopContextId(model: InteractionModelCandidate, contextId: string): string {
  const ancestors = designContextAncestorIds(model, contextId);
  return ancestors[0] ?? contextId;
}

function designMetadata(candidate: {
  confidence: string;
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceSpecPaths: string[];
  sourceCodeFactIds: string[];
  evidence: unknown[];
  questions: string[];
}): Record<string, unknown> {
  return {
    confidence: candidate.confidence,
    sourceMemoryIds: candidate.sourceMemoryIds,
    sourceModelIds: candidate.sourceModelIds,
    sourceSpecPaths: candidate.sourceSpecPaths,
    sourceCodeFactIds: candidate.sourceCodeFactIds,
    evidenceCount: candidate.evidence.length,
    questions: candidate.questions
  };
}

function designCandidates(model: InteractionModelCandidate) {
  return [
    ...model.contexts,
    ...model.actors,
    ...model.externalSystems,
    ...model.useCases,
    ...model.relations,
    ...model.useCaseDrilldowns
  ];
}

function designNodeId(kind: string, id: string): string {
  return projectedNodeId(`design-${kind}`, id);
}

function designEdgeId(kind: string, id: string): string {
  return projectedEdgeId(`design-${kind}`, id);
}

function designTargetNodeId(id: string): string {
  if (id.startsWith("actor:")) return designNodeId("actor", id);
  if (id.startsWith("external-system:")) return designNodeId("external-system", id);
  if (id.startsWith("context:")) return designNodeId("context", id);
  if (id.startsWith("activity:")) return designNodeId("activity", id);
  if (id.startsWith("sequence:")) return designNodeId("sequence", id);
  if (id.startsWith("state-machine:")) return designNodeId("state-machine", id);
  if (id.startsWith("class-collaboration:")) return designNodeId("class-collaboration", id);
  return designNodeId("use-case", id);
}

function designTargetAnchor(id: string): GraphAnchor {
  if (id.startsWith("actor:")) return { kind: "design_actor", id };
  if (id.startsWith("external-system:")) return { kind: "design_external_system", id };
  if (id.startsWith("context:")) return { kind: "design_context", id };
  if (id.startsWith("activity:")) return { kind: "design_activity", id };
  if (id.startsWith("sequence:")) return { kind: "design_sequence", id };
  if (id.startsWith("state-machine:")) return { kind: "design_state_machine", id };
  if (id.startsWith("class-collaboration:")) return { kind: "design_class_collaboration", id };
  if (id.startsWith("interaction-overview:")) return { kind: "design_interaction_overview", id };
  if (id.startsWith("communication:")) return { kind: "design_communication", id };
  if (id.startsWith("timing:")) return { kind: "design_timing", id };
  if (id.startsWith("object-snapshot:")) return { kind: "design_object_snapshot", id };
  if (id.startsWith("composite-structure:")) return { kind: "design_composite_structure", id };
  return { kind: "design_use_case", id };
}

function designDrilldownNodeKind(kind: InteractionModelCandidate["useCaseDrilldowns"][number]["kind"]): string {
  if (kind === "activity") return "activity";
  if (kind === "sequence") return "sequence";
  if (kind === "state_machine") return "state-machine";
  if (kind === "class_collaboration") return "class-collaboration";
  return kind.replace(/_/g, "-");
}

function designDrilldownGraphKind(kind: InteractionModelCandidate["useCaseDrilldowns"][number]["kind"]): string {
  if (kind === "activity") return "design_activity";
  if (kind === "sequence") return "design_sequence";
  if (kind === "state_machine") return "design_state_machine";
  if (kind === "class_collaboration") return "design_class_collaboration";
  return `design_${kind}`;
}

function designDrilldownAnchorKind(kind: InteractionModelCandidate["useCaseDrilldowns"][number]["kind"]): GraphAnchor["kind"] {
  if (kind === "activity") return "design_activity";
  if (kind === "sequence") return "design_sequence";
  if (kind === "state_machine") return "design_state_machine";
  if (kind === "class_collaboration") return "design_class_collaboration";
  return `design_${kind}` as GraphAnchor["kind"];
}

function designDrilldownMarkdownPath(diagram: InteractionModelCandidate["useCaseDrilldowns"][number]): string {
  const base = `docs/design/use-case-diagrams/${designUseCaseDocumentSlug(diagram.useCaseId)}`;
  if (diagram.kind === "activity") return `${base}/activity.md`;
  if (diagram.kind === "sequence") return `${base}/sequences/${designUseCaseDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "state_machine") return `${base}/state-machines/${designUseCaseDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "class_collaboration") return `${base}/realization/class-collaboration.md`;
  if (diagram.kind === "interaction_overview") return `${base}/interaction-overviews/${designUseCaseDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "communication") return `${base}/communications/${designUseCaseDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "timing") return `${base}/timing/${designUseCaseDocumentSlug(diagram.id)}.md`;
  if (diagram.kind === "object_snapshot") return `${base}/object-snapshots/${designUseCaseDocumentSlug(diagram.id)}.md`;
  return `${base}/composite-structures/${designUseCaseDocumentSlug(diagram.id)}.md`;
}

function designDrilldownHtmlPath(diagram: InteractionModelCandidate["useCaseDrilldowns"][number]): string {
  return designDrilldownMarkdownPath(diagram).replace(/\.md$/, ".html");
}

function designUseCaseDocumentSlug(value: string): string {
  return value.replace(/^use-case:/, "").replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "diagram";
}

function designQuestionSeverity(severity: "info" | "warning"): "info" | "medium" {
  return severity === "warning" ? "medium" : "info";
}

function mermaidId(prefix: string, id: string): string {
  return `${prefix}_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function mermaidLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

export async function readProjectedGraphViewRecords(root: string): Promise<{ view: ProjectedGraphView; path: string }[]> {
  const viewsRoot = path.join(root, ".distinction", "views");
  const files = await listJsonFiles(viewsRoot);
  const records: { view: ProjectedGraphView; path: string }[] = [];
  for (const file of files) {
    try {
      const view = ProjectedGraphViewSchema.parse(JSON.parse(await readFile(file, "utf8")));
      records.push({ view, path: projectRelativePath(root, file) });
    } catch {
      // Legacy/specialized views are intentionally ignored here.
    }
  }
  return records;
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

function projectMemoryRecordNode(record: MemoryRecord): ProjectedGraphNode {
  return {
    id: projectedNodeId("memory", record.id),
    kind: `memory:${record.kind.toLowerCase()}`,
    label: record.summary,
    source: { type: "memory", id: record.id },
    anchor: { kind: "memory", id: record.id },
    status: record.status,
    summary: `${record.subject} ${record.predicate}${record.object ? ` ${record.object}` : ""}`,
    metadata: {
      type: record.type,
      confidence: record.confidence
    }
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

function groupBy<T>(values: T[], keyOf: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

async function listJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolute);
  }
  return files;
}

function projectRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return filePath.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
