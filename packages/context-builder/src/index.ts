import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  findEdge,
  findNode,
  getIncomingEdges,
  getOutgoingEdges,
  getRelatedNodes,
  type DevelopmentEdge,
  type DevelopmentGraph,
  type DevelopmentGraphCandidate,
  type DevelopmentNode
} from "@praxis/development-graph";
import { readProjectedGraphViewRecords } from "@praxis/projection-engine";
import {
  ArchitectureFindingReportSchema,
  ArchitectureModelPatchSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  MemoryRecordSchema,
  type ArchitectureFinding,
  type ArchitectureModelPatch,
  type CodeFactEdge,
  type CodeFactFile,
  type CodeFactGraphSnapshot,
  type CodeFactNode,
  type ContextPacket,
  type ContextPacketPurpose,
  type GraphAnchor,
  type MemoryRecord,
  type ProjectedGraphAnnotation,
  type ProjectedGraphEdge,
  type ProjectedGraphNode,
  type ProjectedGraphView
} from "@praxis/schema";

export type SelectionTarget =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

export interface BuiltContext {
  target: SelectionTarget;
  summary: string;
  nodes: DevelopmentNode[];
  edges: DevelopmentEdge[];
  constraints: string[];
  data: Record<string, unknown>;
}

export interface BuildContextPacketInput {
  root: string;
  anchor: GraphAnchor;
  purpose: ContextPacketPurpose;
  createdBy?: ContextPacket["trace"]["createdBy"];
  limit?: {
    codeFacts?: number;
    findings?: number;
    memory?: number;
    projectionNodes?: number;
  };
}

export interface ProjectIntakeContext {
  snapshotSummary: {
    name: string;
    languages: string[];
    manifests: string[];
    docs: string[];
    fileCount: number;
  };
  profile: unknown;
  candidate?: DevelopmentGraphCandidate;
  moduleCandidates: unknown[];
  importRelations: unknown[];
  readmeSummary?: string;
  rules: {
    factCandidateBoundary: string;
    noAstAssumption: string;
    graphGenerationPolicy: string;
  };
}

export interface NodeContext {
  node: DevelopmentNode;
  incomingEdges: DevelopmentEdge[];
  outgoingEdges: DevelopmentEdge[];
  relatedNodes: DevelopmentNode[];
  progress: number;
  blockedReasons: string[];
  memoryEvents: unknown[];
  relevantRules: string[];
}

export interface EdgeContext {
  edge: DevelopmentEdge;
  sourceNode?: DevelopmentNode;
  targetNode?: DevelopmentNode;
  progress: number;
  blockedReason?: string;
  riskLevel: DevelopmentEdge["riskLevel"];
  relatedTasks: DevelopmentNode[];
  relatedMemoryEvents: unknown[];
  relevantRules: string[];
}

export function buildContext(graph: DevelopmentGraph, target: SelectionTarget): BuiltContext {
  if (target.type === "node") {
    const nodeContext = buildNodeContext(graph, target.id);
    return {
      target,
      summary: nodeContext ? `Selected node: ${nodeContext.node.title}` : `Missing node: ${target.id}`,
      nodes: nodeContext ? [nodeContext.node, ...nodeContext.relatedNodes] : [],
      edges: nodeContext ? [...nodeContext.incomingEdges, ...nodeContext.outgoingEdges] : [],
      constraints: ["Only discuss the selected node and directly related edges unless the user expands scope."],
      data: { nodeContext }
    };
  }

  if (target.type === "edge") {
    const edgeContext = buildEdgeContext(graph, target.id);
    return {
      target,
      summary: edgeContext ? `Selected edge: ${edgeContext.edge.title ?? edgeContext.edge.kind}` : `Missing edge: ${target.id}`,
      nodes: [edgeContext?.sourceNode, edgeContext?.targetNode].filter(Boolean) as DevelopmentNode[],
      edges: edgeContext ? [edgeContext.edge] : [],
      constraints: ["Only discuss the selected relation and its one-hop context unless the user expands scope."],
      data: { edgeContext }
    };
  }

  return buildSubgraphContext(graph, target.nodeIds, target.edgeIds);
}

export function buildProjectIntakeContext(snapshot: {
  name: string;
  statistics: { languages: Record<string, number>; fileCount: number };
  manifests: { path: string }[];
  docs: { path: string; title?: string }[];
}, profile: { moduleCandidates?: unknown[] }, candidate?: DevelopmentGraphCandidate): ProjectIntakeContext {
  return {
    snapshotSummary: {
      name: snapshot.name,
      languages: Object.keys(snapshot.statistics.languages),
      manifests: snapshot.manifests.map((manifest) => manifest.path),
      docs: snapshot.docs.map((doc) => doc.path),
      fileCount: snapshot.statistics.fileCount
    },
    profile,
    candidate,
    moduleCandidates: profile.moduleCandidates ?? [],
    importRelations: [],
    readmeSummary: snapshot.docs.find((doc) => doc.path.toLowerCase().endsWith("readme.md"))?.title,
    rules: {
      factCandidateBoundary: "Local scan facts are FACT. Agent interpretations are CANDIDATE or INFERENCE.",
      noAstAssumption: "Scanner uses lightweight text extraction and does not claim AST-level certainty.",
      graphGenerationPolicy: "Do not mark generated graph elements as CONFIRMED until user acceptance."
    }
  };
}

export function buildNodeContext(graph: DevelopmentGraph, nodeId: string): NodeContext | undefined {
  const node = findNode(graph, nodeId);
  if (!node) return undefined;
  const incomingEdges = getIncomingEdges(graph, nodeId);
  const outgoingEdges = getOutgoingEdges(graph, nodeId);
  return {
    node,
    incomingEdges,
    outgoingEdges,
    relatedNodes: getRelatedNodes(graph, nodeId),
    progress: node.progress,
    blockedReasons: [...incomingEdges, ...outgoingEdges].map((edge) => edge.blockedReason).filter(Boolean) as string[],
    memoryEvents: [],
    relevantRules: ["Explain before Plan.", "Plan before Apply.", "Existing source code is not modified automatically in v0.1."]
  };
}

export function buildEdgeContext(graph: DevelopmentGraph, edgeId: string): EdgeContext | undefined {
  const edge = findEdge(graph, edgeId);
  if (!edge) return undefined;
  return {
    edge,
    sourceNode: findNode(graph, edge.source),
    targetNode: findNode(graph, edge.target),
    progress: edge.progress,
    blockedReason: edge.blockedReason,
    riskLevel: edge.riskLevel,
    relatedTasks: graph.nodes.filter((node) => node.kind === "task" && [edge.source, edge.target].some((id) => node.metadata?.targetIds === id)),
    relatedMemoryEvents: [],
    relevantRules: ["Explain only selected edge and one-hop context.", "Graph changes require user confirmation."]
  };
}

export function buildSubgraphContext(graph: DevelopmentGraph, nodeIds: string[], edgeIds: string[]): BuiltContext {
  const nodes = graph.nodes.filter((node) => nodeIds.includes(node.id));
  const edges = graph.edges.filter((edge) => edgeIds.includes(edge.id));
  return {
    target: { type: "subgraph", nodeIds, edgeIds },
    summary: `Selected subgraph with ${nodes.length} nodes and ${edges.length} edges`,
    nodes,
    edges,
    constraints: ["Keep analysis inside the selected subgraph unless the user expands scope."],
    data: { nodes, edges }
  };
}

export async function buildContextPacket(input: BuildContextPacketInput): Promise<ContextPacket> {
  const root = path.resolve(input.root);
  const limits = {
    codeFacts: input.limit?.codeFacts ?? 80,
    findings: input.limit?.findings ?? 20,
    memory: input.limit?.memory ?? 40,
    projectionNodes: input.limit?.projectionNodes ?? 80
  };
  const warnings: string[] = [];
  const codeFacts = await readOptionalJson(path.join(root, ".distinction", "cache", "code-fact-graph.json"), CodeFactGraphSnapshotSchema, warnings);
  const architecture = await readOptionalJson(path.join(root, ".distinction", "cache", "architecture-model-patch.json"), ArchitectureModelPatchSchema, warnings);
  const findingReport = await readOptionalJson(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema, warnings);
  const projections = await readProjectedViews(root, warnings);
  const memories = await readMemoryRecords(root, warnings);
  const anchorResolution = resolveAnchor(input.anchor, { codeFacts, findingReport, projections });
  const relatedCodeFacts = collectCodeFacts(input.anchor, anchorResolution, codeFacts, limits.codeFacts);
  const relatedFindings = collectFindings(input.anchor, anchorResolution, findingReport?.findings ?? [], limits.findings);
  const relatedProjections = collectProjectionSlice(input.anchor, anchorResolution, projections, limits.projectionNodes);
  const relatedMemory = collectMemorySlice(memories, anchorResolution.includedPaths, limits.memory);
  const rules = await collectRules(root, warnings);
  const includedPaths = unique([
    ...anchorResolution.includedPaths,
    ...relatedCodeFacts.nodes.map((node) => node.filePath).filter((item) => item && item !== "."),
    ...relatedCodeFacts.relatedFiles.map((file) => file.path),
    ...relatedFindings.flatMap((finding) => finding.affectedSourcePaths)
  ]);

  return ContextPacketSchema.parse({
    schemaVersion: "praxis.contextPacket.v1",
    id: `context-packet:${Date.now()}`,
    root,
    generatedAt: new Date().toISOString(),
    anchor: input.anchor,
    purpose: input.purpose,
    memory: relatedMemory,
    models: {
      architecture: architecture
        ? {
            modules: filterArchitectureModules(architecture, anchorResolution, relatedFindings),
            dependencies: filterArchitectureDependencies(architecture, anchorResolution, relatedFindings),
            warnings: architecture.warnings
          }
        : undefined
    },
    codeFacts: relatedCodeFacts,
    projections: relatedProjections,
    findings: relatedFindings,
    rules,
    scope: {
      includedPaths,
      excludedPaths: [],
      expansionPolicy: "explain_first"
    },
    authority: {
      memoryAuthority: memories.length > 0 ? "durable" : "review_cache",
      projectionAuthority: relatedProjections.views.some((view) => view.authority === "durable_model") ? "durable_model" : "review_cache"
    },
    trace: {
      createdBy: input.createdBy ?? "cli",
      sourceViewId: anchorResolution.sourceViewId
    },
    warnings
  });
}

export function parseGraphAnchor(value: string): GraphAnchor {
  const [kind, ...rest] = value.split(":");
  const rawId = rest.join(":");
  const id = kind === "finding" && !rawId.startsWith("finding:") ? `finding:${rawId}` : rawId;
  if (!kind || !id) throw new Error(`Invalid graph anchor: ${value}`);
  if (kind === "file") return { kind: "file", id, path: id };
  if (kind === "symbol") return { kind: "symbol", id };
  if (kind === "code_fact_node") return { kind: "code_fact_node", id };
  if (kind === "code_fact_edge") return { kind: "code_fact_edge", id };
  if (kind === "architecture_module") return { kind: "architecture_module", id };
  if (kind === "architecture_dependency") return { kind: "architecture_dependency", id };
  if (kind === "finding") return { kind: "finding", id };
  if (kind === "projection_node") return { kind: "projection_node", id };
  if (kind === "projection_edge") return { kind: "projection_edge", id };
  if (kind === "task") return { kind: "task", id };
  if (kind === "trace") return { kind: "trace", id };
  if (kind === "memory") return { kind: "memory", id };
  throw new Error(`Unsupported graph anchor kind: ${kind}`);
}

interface AnchorResolution {
  codeFactNodeIds: string[];
  codeFactEdgeIds: string[];
  findingIds: string[];
  projectionNodeIds: string[];
  projectionEdgeIds: string[];
  architectureModuleIds: string[];
  architectureDependencyIds: string[];
  includedPaths: string[];
  sourceViewId?: string;
}

function resolveAnchor(anchor: GraphAnchor, input: {
  codeFacts?: CodeFactGraphSnapshot;
  findingReport?: { findings: ArchitectureFinding[] };
  projections: ProjectedGraphView[];
}): AnchorResolution {
  const resolution: AnchorResolution = {
    codeFactNodeIds: [],
    codeFactEdgeIds: [],
    findingIds: [],
    projectionNodeIds: [],
    projectionEdgeIds: [],
    architectureModuleIds: [],
    architectureDependencyIds: [],
    includedPaths: anchor.path ? [anchor.path] : []
  };

  if (anchor.kind === "file") {
    resolution.includedPaths.push(anchor.path ?? anchor.id);
    for (const node of input.codeFacts?.nodes ?? []) {
      if (node.filePath === anchor.path || node.filePath === anchor.id) resolution.codeFactNodeIds.push(node.id);
    }
  } else if (anchor.kind === "symbol" || anchor.kind === "code_fact_node") {
    resolution.codeFactNodeIds.push(anchor.id);
    const node = input.codeFacts?.nodes.find((item) => item.id === anchor.id);
    if (node?.filePath && node.filePath !== ".") resolution.includedPaths.push(node.filePath);
  } else if (anchor.kind === "code_fact_edge") {
    resolution.codeFactEdgeIds.push(anchor.id);
    const edge = input.codeFacts?.edges.find((item) => item.id === anchor.id);
    if (edge?.filePath && edge.filePath !== ".") resolution.includedPaths.push(edge.filePath);
    if (edge) {
      for (const nodeId of [edge.sourceId, edge.targetId]) {
        const node = input.codeFacts?.nodes.find((item) => item.id === nodeId);
        if (node?.filePath && node.filePath !== ".") resolution.includedPaths.push(node.filePath);
      }
    }
  } else if (anchor.kind === "finding") {
    resolution.findingIds.push(anchor.id);
    const finding = input.findingReport?.findings.find((item) => item.id === anchor.id);
    if (finding) {
      resolution.architectureModuleIds.push(...finding.affectedModuleIds);
      resolution.architectureDependencyIds.push(...finding.affectedDependencyIds);
      resolution.includedPaths.push(...finding.affectedSourcePaths);
    }
  } else if (anchor.kind === "architecture_module") {
    resolution.architectureModuleIds.push(anchor.id);
  } else if (anchor.kind === "architecture_dependency") {
    resolution.architectureDependencyIds.push(anchor.id);
  } else if (anchor.kind === "projection_node") {
    resolution.projectionNodeIds.push(anchor.id);
    resolveProjectionAnchor(anchor.id, "node", input.projections, resolution);
  } else if (anchor.kind === "projection_edge") {
    resolution.projectionEdgeIds.push(anchor.id);
    resolveProjectionAnchor(anchor.id, "edge", input.projections, resolution);
  }

  return dedupeResolution(resolution);
}

function resolveProjectionAnchor(id: string, type: "node" | "edge", views: ProjectedGraphView[], resolution: AnchorResolution): void {
  for (const view of views) {
    if (type === "node") {
      const node = view.nodes.find((item) => item.id === id);
      if (!node) continue;
      resolution.sourceViewId = view.id;
      addGraphAnchor(node.anchor, resolution);
      if (node.path) resolution.includedPaths.push(node.path);
      return;
    }
    const edge = view.edges.find((item) => item.id === id);
    if (!edge) continue;
    resolution.sourceViewId = view.id;
    addGraphAnchor(edge.anchor, resolution);
    return;
  }
}

function addGraphAnchor(anchor: GraphAnchor, resolution: AnchorResolution): void {
  if (anchor.path) resolution.includedPaths.push(anchor.path);
  if (anchor.kind === "symbol" || anchor.kind === "code_fact_node") resolution.codeFactNodeIds.push(anchor.id);
  else if (anchor.kind === "code_fact_edge") resolution.codeFactEdgeIds.push(anchor.id);
  else if (anchor.kind === "finding") resolution.findingIds.push(anchor.id);
  else if (anchor.kind === "architecture_module") resolution.architectureModuleIds.push(anchor.id);
  else if (anchor.kind === "architecture_dependency") resolution.architectureDependencyIds.push(anchor.id);
}

function collectCodeFacts(anchor: GraphAnchor, resolution: AnchorResolution, graph: CodeFactGraphSnapshot | undefined, limit: number): ContextPacket["codeFacts"] {
  if (!graph) return { nodes: [], edges: [], callers: [], callees: [], impacted: [], relatedFiles: [] };
  const nodeIds = new Set(resolution.codeFactNodeIds);
  const edgeIds = new Set(resolution.codeFactEdgeIds);
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      nodeIds.add(edge.sourceId);
      nodeIds.add(edge.targetId);
    }
    if (nodeIds.has(edge.sourceId) || nodeIds.has(edge.targetId)) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.sourceId);
      nodeIds.add(edge.targetId);
    }
  }
  if (anchor.kind === "finding") {
    for (const node of graph.nodes) {
      if (resolution.includedPaths.includes(node.filePath)) nodeIds.add(node.id);
    }
  }
  const nodes = graph.nodes.filter((node) => nodeIds.has(node.id)).slice(0, limit);
  const keptNodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => edgeIds.has(edge.id) && keptNodeIds.has(edge.sourceId) && keptNodeIds.has(edge.targetId)).slice(0, limit);
  const callers = uniqueNodes(graph.edges.filter((edge) => edge.kind === "calls" && keptNodeIds.has(edge.targetId)).map((edge) => graph.nodes.find((node) => node.id === edge.sourceId)).filter(Boolean) as CodeFactNode[]);
  const callees = uniqueNodes(graph.edges.filter((edge) => edge.kind === "calls" && keptNodeIds.has(edge.sourceId)).map((edge) => graph.nodes.find((node) => node.id === edge.targetId)).filter(Boolean) as CodeFactNode[]);
  const relatedFilePaths = unique(nodes.map((node) => node.filePath).filter((item) => item && item !== "."));
  const relatedFiles = graph.files.filter((file) => relatedFilePaths.includes(file.path));
  return { nodes, edges, callers, callees, impacted: callees, relatedFiles };
}

function collectFindings(anchor: GraphAnchor, resolution: AnchorResolution, findings: ArchitectureFinding[], limit: number): ArchitectureFinding[] {
  const result = findings.filter((finding) => {
    if (resolution.findingIds.includes(finding.id)) return true;
    if (finding.affectedModuleIds.some((id) => resolution.architectureModuleIds.includes(id))) return true;
    if (finding.affectedDependencyIds.some((id) => resolution.architectureDependencyIds.includes(id))) return true;
    if (finding.affectedSourcePaths.some((filePath) => resolution.includedPaths.includes(filePath))) return true;
    return anchor.kind === "finding" && finding.id === anchor.id;
  });
  return result.slice(0, limit);
}

function collectProjectionSlice(anchor: GraphAnchor, resolution: AnchorResolution, views: ProjectedGraphView[], limit: number): ContextPacket["projections"] {
  const relatedViews: ProjectedGraphView[] = [];
  const nodes: ProjectedGraphNode[] = [];
  const edges: ProjectedGraphEdge[] = [];
  const annotations: ProjectedGraphAnnotation[] = [];
  for (const view of views) {
    const viewNodes = view.nodes.filter((node) => isProjectionNodeRelated(node, anchor, resolution)).slice(0, limit);
    const viewNodeIds = new Set(viewNodes.map((node) => node.id));
    const viewEdges = view.edges.filter((edge) => isProjectionEdgeRelated(edge, anchor, resolution, viewNodeIds)).slice(0, limit);
    const viewEdgeIds = new Set(viewEdges.map((edge) => edge.id));
    const viewAnnotations = view.annotations.filter((annotation) => {
      if (annotation.sourceFindingId && resolution.findingIds.includes(annotation.sourceFindingId)) return true;
      if (annotation.targetNodeIds.some((id) => viewNodeIds.has(id))) return true;
      if (annotation.targetEdgeIds.some((id) => viewEdgeIds.has(id))) return true;
      return false;
    });
    if (viewNodes.length || viewEdges.length || viewAnnotations.length) {
      relatedViews.push(view);
      nodes.push(...viewNodes);
      edges.push(...viewEdges);
      annotations.push(...viewAnnotations);
    }
  }
  return { views: relatedViews, nodes, edges, annotations };
}

function isProjectionNodeRelated(node: ProjectedGraphNode, anchor: GraphAnchor, resolution: AnchorResolution): boolean {
  if (resolution.projectionNodeIds.includes(node.id)) return true;
  if (node.anchor.id === anchor.id || node.source.id === anchor.id) return true;
  const nodePath = node.path;
  if (nodePath && resolution.includedPaths.some((filePath) => pathsRelated(nodePath, filePath))) return true;
  if (node.anchor.kind === "finding" && resolution.findingIds.includes(node.anchor.id)) return true;
  if (node.anchor.kind === "architecture_module" && resolution.architectureModuleIds.includes(node.anchor.id)) return true;
  if (node.anchor.kind === "architecture_dependency" && resolution.architectureDependencyIds.includes(node.anchor.id)) return true;
  return false;
}

function isProjectionEdgeRelated(edge: ProjectedGraphEdge, anchor: GraphAnchor, resolution: AnchorResolution, viewNodeIds: Set<string>): boolean {
  if (resolution.projectionEdgeIds.includes(edge.id)) return true;
  if (edge.anchor.id === anchor.id || edge.source.id === anchor.id) return true;
  if (viewNodeIds.has(edge.sourceId) || viewNodeIds.has(edge.targetId)) return true;
  return false;
}

function collectMemorySlice(records: MemoryRecord[], paths: string[], limit: number): ContextPacket["memory"] {
  const related = records
    .filter((record) =>
      paths.some((filePath) => record.subject.includes(filePath) || record.object?.includes(filePath) || record.evidence.some((item) => item.filePath && pathsRelated(item.filePath, filePath)))
    )
    .slice(0, limit);
  return {
    facts: related.filter((record) => record.kind === "FACT"),
    inferences: related.filter((record) => record.kind === "INFERENCE"),
    candidates: related.filter((record) => record.kind === "CANDIDATE"),
    confirmations: related.filter((record) => record.kind === "CONFIRMED"),
    findings: related.filter((record) => record.type.includes("finding")),
    decisions: related.filter((record) => record.type.includes("decision"))
  };
}

function filterArchitectureModules(model: ArchitectureModelPatch, resolution: AnchorResolution, findings: ArchitectureFinding[]) {
  const moduleIds = new Set([...resolution.architectureModuleIds, ...findings.flatMap((finding) => finding.affectedModuleIds)]);
  if (moduleIds.size === 0 && resolution.includedPaths.length) {
    return model.modules.filter((module) => resolution.includedPaths.some((filePath) => pathsRelated(module.path, filePath)));
  }
  return model.modules.filter((module) => moduleIds.has(module.id));
}

function pathsRelated(left: string, right: string): boolean {
  const normalizedLeft = left.replace(/\\/g, "/").replace(/\/+$/g, "");
  const normalizedRight = right.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(`${normalizedRight}/`) || normalizedRight.startsWith(`${normalizedLeft}/`);
}

function filterArchitectureDependencies(model: ArchitectureModelPatch, resolution: AnchorResolution, findings: ArchitectureFinding[]) {
  const dependencyIds = new Set([...resolution.architectureDependencyIds, ...findings.flatMap((finding) => finding.affectedDependencyIds)]);
  const moduleIds = new Set([...resolution.architectureModuleIds, ...findings.flatMap((finding) => finding.affectedModuleIds)]);
  return model.dependencies.filter((dependency) => dependencyIds.has(dependency.id) || moduleIds.has(dependency.sourceModuleId) || moduleIds.has(dependency.targetModuleId));
}

async function readProjectedViews(root: string, warnings: string[]): Promise<ProjectedGraphView[]> {
  try {
    return (await readProjectedGraphViewRecords(root)).map((record) => record.view);
  } catch (error) {
    warnings.push(`Failed to read projected graph views: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function readMemoryRecords(root: string, warnings: string[]): Promise<MemoryRecord[]> {
  const factsPath = path.join(root, ".distinction", "memory", "facts.jsonl");
  try {
    const raw = await readFile(factsPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => MemoryRecordSchema.parse(JSON.parse(line)));
  } catch (error) {
    if (!isMissingFileError(error)) warnings.push(`Failed to read FACT memory: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function collectRules(root: string, warnings: string[]): Promise<ContextPacket["rules"]> {
  const [architectureRules, boundaryRules, aiConstraints] = await Promise.all([
    readRuleLines(path.join(root, ".distinction", "rules", "architecture.md"), warnings),
    readRuleLines(path.join(root, ".distinction", "rules", "boundaries.md"), warnings),
    readRuleLines(path.join(root, ".distinction", "rules", "ai-constraints.md"), warnings)
  ]);
  return {
    architectureRules,
    boundaryRules,
    aiConstraints: aiConstraints.length ? aiConstraints : ["Explain before Plan.", "Plan before Apply.", "Existing source code is not modified automatically in v0.1."],
    playbooks: []
  };
}

async function readRuleLines(filePath: string, warnings: string[]): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    if (!isMissingFileError(error)) warnings.push(`Failed to read rules file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function readOptionalJson<T>(filePath: string, schema: { parse(value: unknown): T }, warnings: string[]): Promise<T | undefined> {
  try {
    return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (!isMissingFileError(error)) warnings.push(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function dedupeResolution(resolution: AnchorResolution): AnchorResolution {
  return {
    ...resolution,
    codeFactNodeIds: unique(resolution.codeFactNodeIds),
    codeFactEdgeIds: unique(resolution.codeFactEdgeIds),
    findingIds: unique(resolution.findingIds),
    projectionNodeIds: unique(resolution.projectionNodeIds),
    projectionEdgeIds: unique(resolution.projectionEdgeIds),
    architectureModuleIds: unique(resolution.architectureModuleIds),
    architectureDependencyIds: unique(resolution.architectureDependencyIds),
    includedPaths: unique(resolution.includedPaths.filter(Boolean))
  };
}

function uniqueNodes(nodes: CodeFactNode[]): CodeFactNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
