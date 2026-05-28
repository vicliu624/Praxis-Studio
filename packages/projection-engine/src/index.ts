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
