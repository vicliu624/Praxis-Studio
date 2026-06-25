import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeFactEdge, CodeFactGraphSnapshot, CodeFactNode, CodeUnderstandingSpine } from "@praxis/schema";
import { readProjectGitVersion, readProjectSemanticVersion, type DesignGitVersionInfo } from "./design-documents.js";

export const ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH = "docs/engineering/engineering-maps.md";
export const ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH = "docs/engineering/engineering-maps.html";
export const ENGINEERING_COMPAT_MAP_DOC_RELATIVE_PATH = "docs/engineering/technical-complexity-maps.md";
export const ENGINEERING_COMPAT_MAP_HTML_RELATIVE_PATH = "docs/engineering/technical-complexity-maps.html";
export const ENGINEERING_MAP_DOC_RELATIVE_PATH = ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH;
export const ENGINEERING_MAP_HTML_RELATIVE_PATH = ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH;
export const ENGINEERING_MAP_MANAGED_START = "<!-- praxis:engineering-maps:start -->";
export const ENGINEERING_MAP_MANAGED_END = "<!-- praxis:engineering-maps:end -->";
export const ENGINEERING_MODEL_START = "<!-- praxis:engineering-complexity-model:start -->";
export const ENGINEERING_MODEL_END = "<!-- praxis:engineering-complexity-model:end -->";

type EngineeringDiagramKind =
  | "package"
  | "component"
  | "deployment"
  | "class_structural"
  | "sequence"
  | "state_machine"
  | "technical_hotspot";

interface EngineeringMapIndex {
  schemaVersion: "praxis.engineeringMapIndex.v1";
  generatedAt: string;
  projectVersion: string;
  git: DesignGitVersionInfo;
  rootDocPath: string;
  rootHtmlPath: string;
  compatibilityDocPath: string;
  compatibilityHtmlPath: string;
  summary: EngineeringComplexityModel["summary"];
  codeUnderstandingSpine?: EngineeringCodeUnderstandingSpineRef;
  hierarchy: EngineeringDiagramHierarchyRule[];
  categories: EngineeringDiagramCategory[];
}

interface EngineeringDiagramHierarchyRule {
  parentKind: EngineeringDiagramKind;
  childKinds: EngineeringDiagramKind[];
  rationale: string;
}

interface EngineeringDiagramCategory {
  id: string;
  kind: EngineeringDiagramKind;
  title: string;
  directory: string;
  mapDocPath: string;
  mapHtmlPath: string;
  summary: string;
  count: number;
  items: EngineeringDiagramDocument[];
}

interface EngineeringDiagramDocument {
  id: string;
  kind: EngineeringDiagramKind;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: "candidate";
  confidence: "high" | "medium" | "low";
  mermaidKind: "flowchart" | "sequenceDiagram" | "classDiagram" | "stateDiagram-v2";
  mermaid: string;
  readingGuide: string[];
  technicalAnalysis: string[];
  businessRelation: string[];
  governanceNotes: string[];
  coverage: string[];
  evidencePaths: string[];
  questions: string[];
  scope: EngineeringDiagramScope;
  drilldowns: EngineeringDiagramLink[];
  elements?: EngineeringDiagramElement[];
}

interface EngineeringDiagramScope {
  packageId?: string;
  filePath?: string;
  sourcePath?: string;
  targetPath?: string;
  targetPackageId?: string;
  sourceName?: string;
  targetName?: string;
}

interface EngineeringDiagramLink {
  id: string;
  kind: EngineeringDiagramKind;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  relation:
    | "contains"
    | "realized_by"
    | "dynamic_flow"
    | "runtime_node"
    | "risk_detail"
    | "structural_context"
    | "source_or_target"
    | "parent_boundary";
  reason: string;
}

interface EngineeringDiagramElement {
  id: string;
  mermaidId: string;
  label: string;
  kind: EngineeringDiagramKind | "file" | "reuse_signal" | "collaboration_signal" | "runtime_kind" | "sequence_message";
  anchor: string;
  summary: string;
  role: string;
  whyItExists: string;
  relationshipMeaning: string;
  drilldownIntent: string;
  businessRelevance: string;
  changeImpact: string;
  evidence: string[];
  risks: string[];
  questions: string[];
  confidence: "high" | "medium" | "low";
  drilldowns: EngineeringDiagramLink[];
}

type EngineeringDiagramElementKind = EngineeringDiagramElement["kind"];

interface EngineeringElementExplanation {
  summary: string;
  role: string;
  whyItExists: string;
  relationshipMeaning: string;
  drilldownIntent: string;
  businessRelevance: string;
  changeImpact: string;
  evidence: string[];
  risks: string[];
  questions: string[];
  confidence: "high" | "medium" | "low";
}

export interface EngineeringComplexityModel {
  schemaVersion: "praxis.engineeringComplexityModel.v1";
  root: string;
  generatedAt: string;
  source: "code_facts";
  projectVersion: string;
  git: DesignGitVersionInfo;
  summary: {
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    packageCount: number;
    componentCount: number;
    runtimeFlowCount: number;
    deploymentNodeCount: number;
    hotspotCount: number;
  };
  codeUnderstandingSpine?: EngineeringCodeUnderstandingSpineRef;
  packages: EngineeringPackage[];
  components: EngineeringComponent[];
  structuralSlices: EngineeringStructuralSlice[];
  runtimeFlows: EngineeringRuntimeFlow[];
  deploymentNodes: EngineeringDeploymentNode[];
  hotspots: EngineeringHotspot[];
}

export interface EngineeringCodeUnderstandingSpineRef {
  docPath: string;
  jsonPath: string;
  summary: CodeUnderstandingSpine["summary"];
  behaviorSliceIds: string[];
  structuralClusterIds: string[];
  runtimeBoundaryIds: string[];
}

export interface EngineeringPackage {
  id: string;
  title: string;
  path: string;
  fileCount: number;
  nodeCount: number;
  incoming: number;
  outgoing: number;
  dependencies: string[];
  evidencePaths: string[];
  confidence: "high" | "medium" | "low";
}

export interface EngineeringComponent {
  id: string;
  sourceNodeId: string;
  title: string;
  kind: string;
  filePath: string;
  line?: number;
  fanIn: number;
  fanOut: number;
  packageId: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface EngineeringStructuralSlice {
  id: string;
  title: string;
  sliceId: string;
  packageId: string;
  structuralContext: string;
  summary: string;
  components: EngineeringComponent[];
  relations: EngineeringStructuralRelation[];
  evidencePaths: string[];
  confidence: "high" | "medium" | "low";
}

export interface EngineeringStructuralRelation {
  sourceNodeId: string;
  targetNodeId: string;
  kind: CodeFactEdge["kind"];
  label: string;
  evidencePath?: string;
}

export interface EngineeringRuntimeFlow {
  id: string;
  title: string;
  source: string;
  target: string;
  sourcePath: string;
  targetPath: string;
  edgeKind: string;
  packagePath: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface EngineeringDeploymentNode {
  id: string;
  title: string;
  kind: string;
  filePath: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface EngineeringHotspot {
  id: string;
  title: string;
  kind: "large_file" | "high_fan_in" | "high_fan_out" | "dependency_cluster" | "warning";
  targetPath: string;
  score: number;
  summary: string;
  evidencePaths: string[];
  confidence: "high" | "medium" | "low";
}

interface ModuleAccumulator {
  id: string;
  title: string;
  path: string;
  files: Set<string>;
  nodes: Set<string>;
  incoming: Set<string>;
  outgoing: Set<string>;
  dependencies: Set<string>;
}

export async function buildEngineeringComplexityModel(
  root: string,
  codeFacts: CodeFactGraphSnapshot,
  generatedAt = new Date().toISOString(),
  codeUnderstandingSpine?: CodeUnderstandingSpine
): Promise<EngineeringComplexityModel> {
  const engineeringCodeFacts = filterEngineeringDiscoveryCodeFacts(codeFacts);
  const projectVersion = await readProjectSemanticVersion(root) ?? "0.1.0";
  const git = await readProjectGitVersion(root);
  const nodeById = new Map(engineeringCodeFacts.nodes.map((node) => [node.id, node]));
  const moduleAccumulators = buildModuleAccumulators(engineeringCodeFacts, nodeById);
  const packages = Array.from(moduleAccumulators.values())
    .map((item) => moduleAccumulatorToPackage(item))
    .sort((left, right) => right.nodeCount - left.nodeCount || right.fileCount - left.fileCount)
    .slice(0, 18);
  const allComponents = buildComponents(engineeringCodeFacts, nodeById);
  const components = allComponents.slice(0, 24);
  const structuralSlices = buildStructuralSlices(allComponents, engineeringCodeFacts).slice(0, 18);
  const runtimeFlows = buildRuntimeFlows(engineeringCodeFacts, nodeById).slice(0, 18);
  const deploymentNodes = buildDeploymentNodes(engineeringCodeFacts).slice(0, 16);
  const hotspots = buildHotspots(engineeringCodeFacts, moduleAccumulators, nodeById).slice(0, 18);
  return {
    schemaVersion: "praxis.engineeringComplexityModel.v1",
    root,
    generatedAt,
    source: "code_facts",
    projectVersion,
    git,
    summary: {
      fileCount: engineeringCodeFacts.files.length,
      nodeCount: engineeringCodeFacts.nodes.length,
      edgeCount: engineeringCodeFacts.edges.length,
      packageCount: packages.length,
      componentCount: components.length,
      runtimeFlowCount: runtimeFlows.length,
      deploymentNodeCount: deploymentNodes.length,
      hotspotCount: hotspots.length
    },
    codeUnderstandingSpine: codeUnderstandingSpine ? engineeringSpineRef(codeUnderstandingSpine) : undefined,
    packages,
    components,
    structuralSlices,
    runtimeFlows,
    deploymentNodes,
    hotspots
  };
}

function engineeringSpineRef(spine: CodeUnderstandingSpine): EngineeringCodeUnderstandingSpineRef {
  return {
    docPath: "docs/code-understanding/code-first-discovery-spine.md",
    jsonPath: "docs/code-understanding/code-first-discovery-spine.json",
    summary: spine.summary,
    behaviorSliceIds: spine.behaviorSlices.map((item) => item.id),
    structuralClusterIds: spine.structuralClusters.map((item) => item.id),
    runtimeBoundaryIds: spine.runtimeBoundaries.map((item) => item.id)
  };
}

function filterEngineeringDiscoveryCodeFacts(codeFacts: CodeFactGraphSnapshot): CodeFactGraphSnapshot {
  const files = codeFacts.files.filter((file) => !isGeneratedOrNonSourcePath(file.path));
  const nodes = codeFacts.nodes.filter((node) => !isGeneratedOrNonSourcePath(node.filePath));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = codeFacts.edges.filter((edge) =>
    nodeIds.has(edge.sourceId)
    && nodeIds.has(edge.targetId)
    && !isGeneratedOrNonSourcePath(edge.filePath ?? "")
  );
  const warnings = codeFacts.warnings.filter((warning) =>
    !isGeneratedOrNonSourcePath(warning.id)
    && !isGeneratedOrNonSourcePath(warning.summary)
  );
  return { ...codeFacts, files, nodes, edges, warnings };
}

function isGeneratedOrNonSourcePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  return normalized === "docs"
    || normalized.startsWith("docs/")
    || normalized === "doc"
    || normalized.startsWith("doc/")
    || normalized.startsWith("documentation/")
    || first.startsWith(".")
    || parts.length === 1 && /\.[a-z0-9]+$/i.test(first)
    || ["artifacts", "target", "dist", "build", "coverage", "node_modules", "tmp", "temp", "test", "tests", "integration-test", "scripts", "history"].includes(first)
    || normalized.startsWith(".distinction/")
    || normalized.includes("/node_modules/")
    || normalized.includes("/dist/")
    || normalized.includes(".generated.")
    || normalized.endsWith(".tsbuildinfo");
}

export async function writeEngineeringComplexityDocuments(
  root: string,
  model: EngineeringComplexityModel
): Promise<{
  markdownPath: string;
  htmlPath: string;
  compatibilityMarkdownPath: string;
  compatibilityHtmlPath: string;
  diagramDocumentCount: number;
}> {
  const categories = buildEngineeringDiagramCategories(model);
  const index = buildEngineeringMapIndex(model, categories);
  const markdownPath = path.join(root, ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH);
  const htmlPath = path.join(root, ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH);
  const compatibilityMarkdownPath = path.join(root, ENGINEERING_COMPAT_MAP_DOC_RELATIVE_PATH);
  const compatibilityHtmlPath = path.join(root, ENGINEERING_COMPAT_MAP_HTML_RELATIVE_PATH);
  await clearManagedEngineeringDocuments(root);
  const files = [
    { filePath: markdownPath, content: renderEngineeringRootMapMarkdown(index) },
    { filePath: htmlPath, content: renderEngineeringRootMapHtml(index, model) },
    { filePath: compatibilityMarkdownPath, content: renderEngineeringCompatibilityMarkdown(index) },
    { filePath: compatibilityHtmlPath, content: renderEngineeringCompatibilityHtml(index, model) },
    ...categories.flatMap((category) => [
      { filePath: path.join(root, category.mapDocPath), content: renderEngineeringCategoryMapMarkdown(category, index) },
      { filePath: path.join(root, category.mapHtmlPath), content: renderEngineeringCategoryMapHtml(category, index) },
      ...category.items.flatMap((item) => [
        { filePath: path.join(root, item.docPath), content: renderEngineeringDiagramDocumentMarkdown(item, category, index) },
        { filePath: path.join(root, item.htmlPath), content: renderEngineeringDiagramDocumentHtml(item, category, index) }
      ])
    ])
  ];
  for (const file of files) {
    await mkdir(path.dirname(file.filePath), { recursive: true });
    await writeFile(file.filePath, file.content, "utf8");
  }
  return {
    markdownPath,
    htmlPath,
    compatibilityMarkdownPath,
    compatibilityHtmlPath,
    diagramDocumentCount: categories.reduce((sum, category) => sum + category.items.length, 0)
  };
}

async function clearManagedEngineeringDocuments(root: string): Promise<void> {
  const managedPaths = [
    ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH,
    ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH,
    ENGINEERING_COMPAT_MAP_DOC_RELATIVE_PATH,
    ENGINEERING_COMPAT_MAP_HTML_RELATIVE_PATH,
    "docs/engineering/package-diagrams",
    "docs/engineering/component-diagrams",
    "docs/engineering/deployment-diagrams",
    "docs/engineering/class-structural-diagrams",
    "docs/engineering/sequence-diagrams",
    "docs/engineering/state-machine-diagrams",
    "docs/engineering/technical-hotspots"
  ];
  for (const relativePath of managedPaths) {
    await rm(path.join(root, relativePath), { recursive: true, force: true });
  }
}

function buildModuleAccumulators(
  codeFacts: CodeFactGraphSnapshot,
  nodeById: Map<string, CodeFactNode>
): Map<string, ModuleAccumulator> {
  const modules = new Map<string, ModuleAccumulator>();
  for (const file of codeFacts.files) {
    const moduleId = moduleIdForPath(file.path);
    const item = getModuleAccumulator(modules, moduleId);
    item.files.add(file.path);
  }
  for (const node of codeFacts.nodes) {
    const moduleId = moduleIdForPath(node.filePath);
    const item = getModuleAccumulator(modules, moduleId);
    item.nodes.add(node.id);
    if (node.filePath && node.filePath !== ".") item.files.add(node.filePath);
  }
  for (const edge of codeFacts.edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    const sourceModule = moduleIdForPath(source?.filePath ?? edge.filePath ?? ".");
    const targetModule = moduleIdForPath(target?.filePath ?? edge.filePath ?? ".");
    if (sourceModule === targetModule) continue;
    const sourceItem = getModuleAccumulator(modules, sourceModule);
    const targetItem = getModuleAccumulator(modules, targetModule);
    sourceItem.outgoing.add(edge.id);
    sourceItem.dependencies.add(targetModule);
    targetItem.incoming.add(edge.id);
  }
  return modules;
}

function getModuleAccumulator(modules: Map<string, ModuleAccumulator>, id: string): ModuleAccumulator {
  const existing = modules.get(id);
  if (existing) return existing;
  const item = {
    id,
    title: id,
    path: id,
    files: new Set<string>(),
    nodes: new Set<string>(),
    incoming: new Set<string>(),
    outgoing: new Set<string>(),
    dependencies: new Set<string>()
  };
  modules.set(id, item);
  return item;
}

function moduleAccumulatorToPackage(item: ModuleAccumulator): EngineeringPackage {
  const edgeCount = item.incoming.size + item.outgoing.size;
  return {
    id: `engineering:package:${safeId(item.id)}`,
    title: item.title,
    path: item.path,
    fileCount: item.files.size,
    nodeCount: item.nodes.size,
    incoming: item.incoming.size,
    outgoing: item.outgoing.size,
    dependencies: Array.from(item.dependencies).slice(0, 10),
    evidencePaths: Array.from(item.files).slice(0, 8),
    confidence: edgeCount > 0 || item.nodes.size > 0 ? "high" : "medium"
  };
}

function buildComponents(codeFacts: CodeFactGraphSnapshot, nodeById: Map<string, CodeFactNode>): EngineeringComponent[] {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of codeFacts.edges) {
    fanOut.set(edge.sourceId, (fanOut.get(edge.sourceId) ?? 0) + 1);
    fanIn.set(edge.targetId, (fanIn.get(edge.targetId) ?? 0) + 1);
  }
  const acceptedKinds = new Set(["class", "struct", "interface", "trait", "component", "function", "method", "route"]);
  const components = codeFacts.nodes
    .filter((node) => acceptedKinds.has(node.kind))
    .map((node) => {
      const incoming = fanIn.get(node.id) ?? 0;
      const outgoing = fanOut.get(node.id) ?? 0;
      return {
        id: `engineering:component:${safeId(`${node.kind}:${node.qualifiedName || node.name}:${node.filePath}:${node.range?.startLine ?? ""}`)}`,
        sourceNodeId: node.id,
        title: node.qualifiedName || node.name,
        kind: node.kind,
        filePath: node.filePath,
        line: node.range?.startLine,
        fanIn: incoming,
        fanOut: outgoing,
        packageId: moduleIdForPath(node.filePath),
        summary: componentSummary(node, incoming, outgoing),
        confidence: node.evidence.length ? "high" : "medium"
      } satisfies EngineeringComponent;
    });
  return dedupeEngineeringComponents(components)
    .sort((left, right) => (right.fanIn + right.fanOut) - (left.fanIn + left.fanOut) || left.title.localeCompare(right.title, "zh-CN"));
}

function dedupeEngineeringComponents(components: EngineeringComponent[]): EngineeringComponent[] {
  const byKey = new Map<string, EngineeringComponent>();
  for (const component of components) {
    const key = [
      normalizePathForCompare(component.filePath),
      component.kind,
      readableClassName(component.title).toLowerCase()
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, component);
      continue;
    }
    if ((component.fanIn + component.fanOut) > (existing.fanIn + existing.fanOut)) {
      byKey.set(key, component);
    }
  }
  return Array.from(byKey.values());
}

function buildStructuralSlices(components: EngineeringComponent[], codeFacts: CodeFactGraphSnapshot): EngineeringStructuralSlice[] {
  const bySlice = new Map<string, EngineeringComponent[]>();
  for (const component of components) {
    if (!isClassStructuralComponent(component)) continue;
    if (isTestLikePath(component.filePath)) continue;
    const sliceId = structuralSliceIdForPath(component.filePath);
    if (!sliceId || isCoarseStructuralSlice(sliceId, component.packageId)) continue;
    const list = bySlice.get(sliceId) ?? [];
    list.push(component);
    bySlice.set(sliceId, list);
  }

  return Array.from(bySlice.entries())
    .map(([sliceId, list]) => {
      const componentsForSlice = dedupeStructuralComponents(list)
        .sort((left, right) => structuralComponentRank(right) - structuralComponentRank(left) || left.title.localeCompare(right.title, "zh-CN"))
        .slice(0, 14);
      const packageId = componentsForSlice[0]?.packageId ?? moduleIdForPath(sliceId);
      const structuralContext = structuralContextFromSlice(sliceId);
      return {
        id: `engineering:structural-slice:${safeId(sliceId)}`,
        title: structuralSliceTitle(sliceId, structuralContext),
        sliceId,
        packageId,
        structuralContext,
        summary: structuralSliceSummary(sliceId, structuralContext, componentsForSlice),
        components: componentsForSlice,
        relations: structuralRelationsForSlice(componentsForSlice, codeFacts),
        evidencePaths: Array.from(new Set(componentsForSlice.map((component) => codeAnchorText(component.filePath, component.line)))).slice(0, 10),
        confidence: componentsForSlice.some((component) => component.confidence === "high") ? "high" : "medium"
      } satisfies EngineeringStructuralSlice;
    })
    .filter((slice) => slice.components.length >= 2)
    .sort((left, right) => structuralSliceRank(right) - structuralSliceRank(left) || left.title.localeCompare(right.title, "zh-CN"));
}

function structuralRelationsForSlice(components: EngineeringComponent[], codeFacts: CodeFactGraphSnapshot): EngineeringStructuralRelation[] {
  const nodeIds = new Set(components.map((component) => component.sourceNodeId));
  const acceptedKinds = new Set<CodeFactEdge["kind"]>(["extends", "implements", "instantiates", "references"]);
  const relations: EngineeringStructuralRelation[] = [];
  for (const edge of codeFacts.edges) {
    if (!acceptedKinds.has(edge.kind)) continue;
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) continue;
    if (edge.sourceId === edge.targetId) continue;
    relations.push({
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      kind: edge.kind,
      label: structuralRelationLabel(edge.kind),
      evidencePath: edge.evidence[0]?.filePath ?? edge.filePath
    });
  }
  return dedupeStructuralRelations(relations).slice(0, 18);
}

function dedupeStructuralRelations(relations: EngineeringStructuralRelation[]): EngineeringStructuralRelation[] {
  const seen = new Set<string>();
  const result: EngineeringStructuralRelation[] = [];
  for (const relation of relations) {
    const key = `${relation.sourceNodeId}:${relation.kind}:${relation.targetNodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(relation);
  }
  return result;
}

function structuralRelationLabel(kind: CodeFactEdge["kind"]): string {
  if (kind === "extends") return "继承";
  if (kind === "implements") return "实现";
  if (kind === "instantiates") return "创建";
  if (kind === "references") return "引用";
  return "关联";
}

function isClassStructuralComponent(component: EngineeringComponent): boolean {
  return ["class", "interface", "trait", "struct", "enum", "type_alias"].includes(component.kind);
}

function structuralComponentRank(component: EngineeringComponent): number {
  const kindWeight = component.kind === "interface" ? 18 : component.kind === "class" ? 16 : component.kind === "enum" ? 10 : 8;
  return kindWeight + Math.min(component.fanIn + component.fanOut, 80);
}

function structuralSliceRank(slice: EngineeringStructuralSlice): number {
  const normalized = slice.sliceId.toLowerCase();
  const layerWeight = slice.packageId.startsWith("domain-layer")
    ? 120
    : slice.packageId.startsWith("application-layer")
      ? 90
      : slice.packageId.startsWith("infra-")
        ? 35
        : 20;
  const contextWeight = slice.structuralContext === "结构切片" ? -20 : 45;
  const lowValuePenalty = normalized.includes("/db/entities/") || normalized.includes("/vo/") ? -45 : 0;
  return layerWeight + contextWeight + lowValuePenalty + slice.components.length * 6 + slice.components.reduce((sum, component) => sum + Math.min(component.fanIn + component.fanOut, 40), 0);
}

function dedupeStructuralComponents(components: EngineeringComponent[]): EngineeringComponent[] {
  const byClassName = new Map<string, EngineeringComponent>();
  for (const component of components) {
    const key = `${readableClassName(component.title)}:${component.filePath}`.toLowerCase();
    const existing = byClassName.get(key);
    if (!existing || structuralComponentRank(component) > structuralComponentRank(existing)) {
      byClassName.set(key, component);
    }
  }
  return Array.from(byClassName.values());
}

function structuralSliceIdForPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const moduleId = moduleIdForPath(normalized);
  const parts = normalized.split("/").filter(Boolean);
  const sourceIndex = javaSourceRootIndex(parts);
  if (sourceIndex >= 0) {
    const packageParts = stripJavaOrgPrefix(parts.slice(sourceIndex + 3, -1));
    const semanticParts = packageParts.slice(0, structuralJavaSliceDepth(packageParts));
    return semanticParts.length ? `${moduleId}/${semanticParts.join("/")}` : moduleId;
  }
  const moduleParts = moduleId.split("/");
  const rest = parts.slice(moduleParts.length, -1);
  const semanticParts = rest.filter((part) => !["src", "main", "test", "tests", "__tests__"].includes(part.toLowerCase())).slice(0, 3);
  return semanticParts.length ? `${moduleId}/${semanticParts.join("/")}` : moduleId;
}

function javaSourceRootIndex(parts: string[]): number {
  for (let index = 0; index < parts.length - 2; index += 1) {
    if (parts[index] === "src" && parts[index + 1] === "main" && parts[index + 2] === "java") return index;
  }
  return -1;
}

function stripJavaOrgPrefix(parts: string[]): string[] {
  const etcIndex = parts.findIndex((part, index) => part === "etc" && index <= 5);
  if (etcIndex >= 0) return parts.slice(etcIndex + 1);
  const comIndex = parts.findIndex((part) => part === "com");
  if (comIndex === 0 && parts.length > 4) return parts.slice(4);
  return parts;
}

function structuralJavaSliceDepth(parts: string[]): number {
  if (parts.length <= 2) return parts.length;
  const head = parts.slice(0, 4).join("/");
  if (head.startsWith("domain/model/etc")) return Math.min(4, parts.length);
  if (head.startsWith("domain/common/ddd")) return Math.min(4, parts.length);
  if (head.startsWith("domain/common")) return Math.min(3, parts.length);
  if (head.startsWith("domain/vo")) return Math.min(2, parts.length);
  if (head.startsWith("as/")) return Math.min(3, parts.length);
  if (head.startsWith("infra/driven/db/entities")) return Math.min(5, parts.length);
  if (head.startsWith("infra/driven")) return Math.min(4, parts.length);
  if (head.startsWith("infra/")) return Math.min(3, parts.length);
  return Math.min(3, parts.length);
}

function isCoarseStructuralSlice(sliceId: string, packageId: string): boolean {
  const normalized = sliceId.replace(/\\/g, "/");
  return normalized === packageId || normalized.split("/").length <= packageId.split("/").length;
}

function structuralContextFromSlice(sliceId: string): string {
  const normalized = sliceId.replace(/\\/g, "/").toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "domain" || part === "domain-layer")) return "领域结构切片";
  if (parts.some((part) => part === "application" || part === "application-layer" || part === "as")) return "应用协作切片";
  if (parts.some((part) => part === "infra" || part.startsWith("infra-"))) return "基础设施适配切片";
  if (parts.some((part) => part === "ui" || part === "web" || part === "frontend")) return "用户界面切片";
  if (parts.some((part) => part === "test" || part === "tests" || part.includes("test"))) return "测试支撑切片";
  const tail = parts.at(-1);
  return tail ? `结构切片 ${tail}` : "结构切片";
}

function structuralSliceTitle(sliceId: string, structuralContext: string): string {
  const tail = sliceId.split("/").slice(1).join("/");
  return `结构协作：${structuralContext} · ${tail || sliceId}`;
}

function structuralSliceSummary(sliceId: string, structuralContext: string, components: EngineeringComponent[]): string {
  const names = components.slice(0, 5).map((component) => readableClassName(component.title)).join("、");
  return `解释 ${sliceId} 这一结构切片中类、接口、组件或值对象如何共同承担${structuralContext}中的结构职责；候选对象包括 ${names || "暂无"}。`;
}

function buildRuntimeFlows(codeFacts: CodeFactGraphSnapshot, nodeById: Map<string, CodeFactNode>): EngineeringRuntimeFlow[] {
  const flows = codeFacts.edges
    .filter((edge) => edge.kind === "calls")
    .flatMap((edge) => {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      if (!source || !target || !source.filePath || !target.filePath) return [];
      const confidence = edge.confidence >= 0.85 ? "high" : edge.confidence >= 0.55 ? "medium" : "low";
      return [{
        id: `engineering:runtime-flow:${safeId(`${source.qualifiedName || source.name}:${target.qualifiedName || target.name}:${source.filePath}:${target.filePath}`)}`,
        title: `${source.name || source.qualifiedName} -> ${target.name || target.qualifiedName}`,
        source: source.qualifiedName || source.name,
        target: target.qualifiedName || target.name,
        sourcePath: source.filePath,
        targetPath: target.filePath,
        edgeKind: edge.kind,
        packagePath: moduleIdForPath(source.filePath),
        summary: `${source.filePath} 中的 ${source.name} ${edge.kind} ${target.filePath} 中的 ${target.name}。`,
        confidence
      } satisfies EngineeringRuntimeFlow];
    });
  return dedupeRuntimeFlows(flows)
    .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence));
}

function dedupeRuntimeFlows(flows: EngineeringRuntimeFlow[]): EngineeringRuntimeFlow[] {
  const byKey = new Map<string, EngineeringRuntimeFlow>();
  for (const flow of flows) {
    const key = [
      normalizePathForCompare(flow.sourcePath),
      normalizePathForCompare(flow.targetPath),
      flow.source.toLowerCase(),
      flow.target.toLowerCase(),
      flow.packagePath
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || confidenceRank(flow.confidence) > confidenceRank(existing.confidence)) {
      byKey.set(key, flow);
    }
  }
  return Array.from(byKey.values());
}

function buildDeploymentNodes(codeFacts: CodeFactGraphSnapshot): EngineeringDeploymentNode[] {
  const candidates = codeFacts.files.filter((file) => isDeploymentOrRuntimeFile(file.path));
  return candidates.map((file) => ({
    id: `engineering:deployment:${safeId(file.path)}`,
    title: deploymentTitle(file.path),
    kind: deploymentKind(file.path),
    filePath: file.path,
    summary: deploymentSummary(file.path),
    confidence: "high"
  }));
}

function buildHotspots(
  codeFacts: CodeFactGraphSnapshot,
  modules: Map<string, ModuleAccumulator>,
  nodeById: Map<string, CodeFactNode>
): EngineeringHotspot[] {
  const hotspots: EngineeringHotspot[] = [];
  for (const file of [...codeFacts.files].sort((left, right) => right.lineCount - left.lineCount).slice(0, 8)) {
    if (file.lineCount < 180) continue;
    hotspots.push({
      id: `engineering:hotspot:large-file:${safeId(file.path)}`,
      title: `大文件：${file.path}`,
      kind: "large_file",
      targetPath: file.path,
      score: file.lineCount,
      summary: `该文件约 ${file.lineCount} 行，可能形成阅读、变更和评审负担。`,
      evidencePaths: [file.path],
      confidence: "high"
    });
  }
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of codeFacts.edges) {
    fanOut.set(edge.sourceId, (fanOut.get(edge.sourceId) ?? 0) + 1);
    fanIn.set(edge.targetId, (fanIn.get(edge.targetId) ?? 0) + 1);
  }
  for (const [nodeId, count] of [...fanIn.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)) {
    const node = nodeById.get(nodeId);
    if (!node || count < 6) continue;
    hotspots.push({
      id: `engineering:hotspot:reuse-pressure:${safeId(`${node.qualifiedName || node.name}:${node.filePath}:${node.range?.startLine ?? ""}`)}`,
      title: `被广泛复用的候选对象：${node.qualifiedName || node.name}`,
      kind: "high_fan_in",
      targetPath: node.filePath,
      score: count,
      summary: `该符号被多处代码引用或调用，可能是共享核心、隐式接口或变更扩散点。`,
      evidencePaths: [codeAnchor(node)],
      confidence: "high"
    });
  }
  for (const [nodeId, count] of [...fanOut.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)) {
    const node = nodeById.get(nodeId);
    if (!node || count < 8) continue;
    hotspots.push({
      id: `engineering:hotspot:external-collaboration-pressure:${safeId(`${node.qualifiedName || node.name}:${node.filePath}:${node.range?.startLine ?? ""}`)}`,
      title: `承担外部协作的候选对象：${node.qualifiedName || node.name}`,
      kind: "high_fan_out",
      targetPath: node.filePath,
      score: count,
      summary: `该符号连接多个外部对象或能力，可能承担编排、聚合或过宽责任。`,
      evidencePaths: [codeAnchor(node)],
      confidence: "high"
    });
  }
  for (const item of [...modules.values()].sort((left, right) => right.outgoing.size - left.outgoing.size).slice(0, 5)) {
    if (item.outgoing.size < 8) continue;
    hotspots.push({
      id: `engineering:hotspot:dependency-cluster:${safeId(item.id)}`,
      title: `依赖簇：${item.id}`,
      kind: "dependency_cluster",
      targetPath: item.path,
      score: item.outgoing.size,
      summary: `该模块依赖多个外部边界，当前按候选技术耦合中心处理；图中只保留仓库证据已经观察到的依赖方向和边界。`,
      evidencePaths: Array.from(item.files).slice(0, 5),
      confidence: "medium"
    });
  }
  for (const warning of codeFacts.warnings.slice(0, 5)) {
    hotspots.push({
      id: `engineering:hotspot:warning:${safeId(warning.id)}`,
      title: warning.id,
      kind: "warning",
      targetPath: ".distinction/cache/repository-facts.json",
      score: warning.severity === "warning" ? 2 : 1,
      summary: warning.summary,
      evidencePaths: [".distinction/cache/repository-facts.json"],
      confidence: "medium"
    });
  }
  return hotspots.sort((left, right) => right.score - left.score);
}

function buildEngineeringMapIndex(
  model: EngineeringComplexityModel,
  categories: EngineeringDiagramCategory[]
): EngineeringMapIndex {
  return {
    schemaVersion: "praxis.engineeringMapIndex.v1",
    generatedAt: model.generatedAt,
    projectVersion: model.projectVersion,
    git: model.git,
    rootDocPath: ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH,
    rootHtmlPath: ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH,
    compatibilityDocPath: ENGINEERING_COMPAT_MAP_DOC_RELATIVE_PATH,
    compatibilityHtmlPath: ENGINEERING_COMPAT_MAP_HTML_RELATIVE_PATH,
    summary: model.summary,
    codeUnderstandingSpine: undefined,
    hierarchy: engineeringDiagramHierarchyRules(),
    categories
  };
}

function buildEngineeringDiagramCategories(model: EngineeringComplexityModel): EngineeringDiagramCategory[] {
  const packageItems = dedupeEngineeringDocuments(model.packages.map((item) => engineeringPackageDiagram(item)));
  const componentItems = dedupeEngineeringDocuments(model.components.map((item) => engineeringComponentDiagram(item)));
  const deploymentItems = dedupeEngineeringDocuments(model.deploymentNodes.map((item) => engineeringDeploymentDiagram(item)));
  const classStructuralItems = dedupeEngineeringDocuments(buildClassStructuralDiagramDocuments(model));
  const sequenceItems = dedupeEngineeringDocuments(model.runtimeFlows.map((item) => engineeringSequenceDiagram(item)));
  const stateMachineItems: EngineeringDiagramDocument[] = [];
  const hotspotItems = dedupeEngineeringDocuments(model.hotspots.map((item) => engineeringHotspotDocument(item)));
  const categories = [
    engineeringCategory("package", "Package Diagrams", "package-diagrams", "模块、包和跨模块依赖边界。", packageItems),
    engineeringCategory("component", "Component Diagrams", "component-diagrams", "关键技术组件、入口和协作对象。", componentItems),
    engineeringCategory("deployment", "Deployment Diagrams", "deployment-diagrams", "运行、构建、桌面壳、CI 和部署节点。", deploymentItems),
    engineeringCategory("class_structural", "Class / Structural Diagrams", "class-structural-diagrams", "按业务/技术语境恢复的结构协作切片，不按顶层 layer 或关系数量凑图。", classStructuralItems),
    engineeringCategory("sequence", "Sequence Diagrams", "sequence-diagrams", "由真实调用关系恢复的运行时协作片段。", sequenceItems),
    engineeringCategory("state_machine", "State Machine Diagrams", "state-machine-diagrams", "仅在代码事实表明存在明确状态语义时生成。", stateMachineItems),
    engineeringCategory("technical_hotspot", "Technical Hotspots", "technical-hotspots", "大文件、被广泛复用对象、外部协作对象、依赖簇和扫描告警。", hotspotItems)
  ];
  connectEngineeringDiagramDrilldowns(categories);
  connectEngineeringDiagramElementDrilldowns(categories);
  return categories;
}

function dedupeEngineeringDocuments(items: EngineeringDiagramDocument[]): EngineeringDiagramDocument[] {
  const byKey = new Map<string, EngineeringDiagramDocument>();
  for (const item of items) {
    const key = `${item.kind}:${item.docPath}:${item.title}`.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || confidenceRank(item.confidence) > confidenceRank(existing.confidence)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function engineeringDiagramHierarchyRules(): EngineeringDiagramHierarchyRule[] {
  return [
    {
      parentKind: "package",
      childKinds: ["component", "class_structural", "sequence", "deployment", "technical_hotspot"],
      rationale: "Package Diagram 是技术复杂度的顶层工程边界；它可以下钻到该边界内的关键组件、结构协作、运行链路、运行配置和复杂度热点。"
    },
    {
      parentKind: "class_structural",
      childKinds: ["component", "sequence", "technical_hotspot"],
      rationale: "Class / Structural Diagram 解释一个可命名业务/技术语境中的结构协作；它可以继续下钻到具体组件、动态交互片段和结构风险。"
    },
    {
      parentKind: "component",
      childKinds: ["sequence", "class_structural", "technical_hotspot"],
      rationale: "Component Diagram 是关键技术对象视角；它可以下钻到该对象参与的调用片段、所在结构切片和相关热点。"
    },
    {
      parentKind: "sequence",
      childKinds: ["component", "class_structural", "technical_hotspot"],
      rationale: "Sequence Diagram 是动态协作视角；它可以反向定位参与组件、所在结构边界和可能的运行风险。"
    },
    {
      parentKind: "deployment",
      childKinds: ["package", "component", "technical_hotspot"],
      rationale: "Deployment Diagram 是运行/构建节点视角；它可以下钻到对应包、入口组件和运行配置热点。"
    },
    {
      parentKind: "technical_hotspot",
      childKinds: ["package", "component", "class_structural", "sequence"],
      rationale: "Technical Hotspot 是风险视角；它需要反向链接到产生复杂度的边界、组件、结构或调用片段。"
    }
  ];
}

function connectEngineeringDiagramDrilldowns(categories: EngineeringDiagramCategory[]): void {
  const allItems = categories.flatMap((category) => category.items);
  const byKind = new Map<EngineeringDiagramKind, EngineeringDiagramDocument[]>();
  for (const item of allItems) {
    byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  }

  for (const item of allItems) {
    const links: EngineeringDiagramLink[] = [];
    if (item.kind === "package") {
      const packageId = item.scope.packageId;
      pushLinks(item, links, relatedItems(byKind.get("component"), (candidate) => candidate.scope.packageId === packageId).slice(0, 8), "contains", `打开这些 Component Diagram，是为了确认 ${packageId} 内哪些具体对象承担入口、编排、适配、契约或共享能力，并查看它们的被引用/调用关系与对外依赖关系是否让模块边界变脆。`);
      pushLinks(item, links, relatedItems(byKind.get("class_structural"), (candidate) => samePathFamily(candidate.scope.filePath, packageId)).slice(0, 5), "structural_context", `打开结构协作图，是为了查看 ${packageId} 内哪些细粒度业务/技术语境真的形成类、接口或值对象协作；如果没有共同语境，就不应被解释成 Class Diagram。`);
      pushLinks(item, links, relatedItems(byKind.get("sequence"), (candidate) => candidate.scope.packageId === packageId).slice(0, 6), "dynamic_flow", `打开这些 Sequence Diagram，是为了追问 ${packageId} 内哪些依赖关系真的形成运行时协作、消息传递或调用链，而不是只停留在 import 关系上。`);
      pushLinks(item, links, relatedItems(byKind.get("deployment"), (candidate) => samePathFamily(candidate.scope.filePath, packageId)).slice(0, 4), "runtime_node", `打开运行/构建节点，是为了确认 ${packageId} 的复杂度是否被 package.json、Cargo、Tauri 配置或启动脚本放大，并区分源码职责和运行时装配职责。`);
      pushLinks(item, links, relatedItems(byKind.get("technical_hotspot"), (candidate) => candidate.scope.packageId === packageId || samePathFamily(candidate.scope.filePath, packageId)).slice(0, 4), "risk_detail", `打开热点图，是为了定位 ${packageId} 中最可能拖慢理解、变更和评审的文件或符号，并判断是否需要拆分、隔离或补充测试。`);
    } else if (item.kind === "component") {
      pushLinks(item, links, relatedItems(byKind.get("sequence"), (candidate) =>
        samePath(candidate.scope.sourcePath, item.scope.filePath)
        || samePath(candidate.scope.targetPath, item.scope.filePath)
        || samePackage(candidate, item)
      ).slice(0, 5), "dynamic_flow", `打开 Sequence Diagram，是为了把 ${item.title} 放进具体调用片段里，看它是发起者、被调用者、转换器还是旁路依赖。`);
      pushLinks(item, links, relatedItems(byKind.get("class_structural"), (candidate) => samePackage(candidate, item)).slice(0, 2), "structural_context", `打开结构协作图，是为了确认 ${item.title} 附近还有哪些对象共同完成职责，避免把单个组件误读成完整架构。`);
      pushLinks(item, links, relatedItems(byKind.get("technical_hotspot"), (candidate) =>
        samePath(candidate.scope.filePath, item.scope.filePath) || samePackage(candidate, item)
      ).slice(0, 3), "risk_detail", `打开热点图，是为了检查 ${item.title} 的文件、调用关系或邻近模块是否已经形成变更风险。`);
    } else if (item.kind === "class_structural") {
      pushLinks(item, links, relatedItems(byKind.get("component"), (candidate) => samePathFamily(candidate.scope.filePath, item.scope.filePath ?? item.scope.packageId)).slice(0, 10), "realized_by", `打开组件图，是为了把 ${item.title} 的结构对象落到具体文件锚点，确认它们是不是同一业务/技术语境下的领域对象、接口、策略、适配器或共享支撑。`);
      pushLinks(item, links, relatedItems(byKind.get("sequence"), (candidate) => samePathFamily(candidate.scope.sourcePath, item.scope.filePath ?? item.scope.packageId) || samePathFamily(candidate.scope.targetPath, item.scope.filePath ?? item.scope.packageId)).slice(0, 6), "dynamic_flow", `打开 Sequence Diagram，是为了验证 ${item.title} 中的结构关系是否真的参与调用顺序、消息流或异步协作，而不是仅仅同目录。`);
      pushLinks(item, links, relatedItems(byKind.get("technical_hotspot"), (candidate) => samePathFamily(candidate.scope.filePath, item.scope.filePath ?? item.scope.packageId)).slice(0, 4), "risk_detail", `打开热点图，是为了检查 ${item.title} 所在切片里哪些对象或文件可能造成修改扩散。`);
    } else if (item.kind === "sequence") {
      pushLinks(item, links, relatedItems(byKind.get("component"), (candidate) =>
        samePath(candidate.scope.filePath, item.scope.sourcePath)
        || samePath(candidate.scope.filePath, item.scope.targetPath)
      ).slice(0, 6), "source_or_target", `打开组件图，是为了确认 ${item.title} 这段动态协作里的源端/目标端对象各自承担什么技术职责。`);
      pushLinks(item, links, relatedItems(byKind.get("class_structural"), (candidate) => samePackage(candidate, item)).slice(0, 2), "structural_context", `打开结构协作图，是为了解释 ${item.title} 背后的对象关系，避免只看调用顺序却看不出职责边界。`);
      pushLinks(item, links, relatedItems(byKind.get("technical_hotspot"), (candidate) =>
        samePath(candidate.scope.filePath, item.scope.sourcePath)
        || samePath(candidate.scope.filePath, item.scope.targetPath)
        || samePackage(candidate, item)
      ).slice(0, 3), "risk_detail", `打开热点图，是为了判断 ${item.title} 这段调用是否经过大文件、过宽编排或高耦合节点。`);
    } else if (item.kind === "deployment") {
      pushLinks(item, links, relatedItems(byKind.get("package"), (candidate) => samePathFamily(item.scope.filePath, candidate.scope.packageId)).slice(0, 4), "parent_boundary", `打开包图，是为了确认 ${item.title} 所在的运行/构建配置属于哪个工程边界，以及它影响哪些源码模块。`);
      pushLinks(item, links, relatedItems(byKind.get("component"), (candidate) => samePathFamily(candidate.scope.filePath, item.scope.filePath)).slice(0, 4), "contains", `打开组件图，是为了查看 ${item.title} 相关配置或运行节点最终装配了哪些入口、adapter 或共享对象。`);
      pushLinks(item, links, relatedItems(byKind.get("technical_hotspot"), (candidate) => samePathFamily(candidate.scope.filePath, item.scope.filePath)).slice(0, 3), "risk_detail", `打开热点图，是为了检查 ${item.title} 附近是否有配置膨胀、生成物过大或运行入口过度集中。`);
    } else if (item.kind === "technical_hotspot") {
      pushLinks(item, links, relatedItems(byKind.get("package"), (candidate) => samePackage(candidate, item) || samePathFamily(item.scope.filePath, candidate.scope.packageId)).slice(0, 3), "parent_boundary", `打开包图，是为了判断 ${item.title} 是局部热点，还是已经影响整个 package/module 的边界稳定性。`);
      pushLinks(item, links, relatedItems(byKind.get("component"), (candidate) => samePath(candidate.scope.filePath, item.scope.filePath)).slice(0, 5), "realized_by", `打开组件图，是为了定位 ${item.title} 的风险由哪个入口、编排器、adapter 或共享对象触发。`);
      pushLinks(item, links, relatedItems(byKind.get("class_structural"), (candidate) => samePackage(candidate, item)).slice(0, 2), "structural_context", `打开结构协作图，是为了看 ${item.title} 是否源于对象职责混杂、边界过宽或共享核心过载。`);
      pushLinks(item, links, relatedItems(byKind.get("sequence"), (candidate) => samePackage(candidate, item)).slice(0, 4), "dynamic_flow", `打开 Sequence Diagram，是为了确认 ${item.title} 是否位于关键调用链、异步路径或失败补偿路径上。`);
    }
    item.drilldowns = dedupeDiagramLinks(links).filter((link) => link.id !== item.id).slice(0, 14);
  }
}

function connectEngineeringDiagramElementDrilldowns(categories: EngineeringDiagramCategory[]): void {
  const allItems = categories.flatMap((category) => category.items);
  const byKind = new Map<EngineeringDiagramKind, EngineeringDiagramDocument[]>();
  for (const item of allItems) {
    byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  }
  const packageItems = byKind.get("package") ?? [];
  const componentItems = byKind.get("component") ?? [];
  const classItems = byKind.get("class_structural") ?? [];
  const sequenceItems = byKind.get("sequence") ?? [];
  const hotspotItems = byKind.get("technical_hotspot") ?? [];

  for (const item of allItems) {
    if (item.kind === "package") {
      const elements: EngineeringDiagramElement[] = [
        engineeringElement(
          item,
          "package_node",
          item.scope.packageId ?? item.title,
          "package",
          packageCenterElementExplanation(item),
          item.drilldowns
        )
      ];
      for (const dependency of packageDependenciesFromMermaid(item.mermaid)) {
        const dependencyPackage = packageItems.find((candidate) => candidate.scope.packageId === dependency);
        const dependencyLinks = dependencyPackage
          ? [diagramLink(dependencyPackage, "parent_boundary", "打开该依赖 package 自己的 Package Diagram。", item), ...dependencyPackage.drilldowns.slice(0, 8)]
          : [];
        elements.push(engineeringElement(
          item,
          packageDependencyMermaidId(item, dependency),
          dependency,
          "package",
          packageDependencyElementExplanation(item, dependency, dependencyPackage),
          dedupeDiagramLinks(dependencyLinks),
          dependencyPackage?.anchor ?? `engineering:package:${safeId(dependency)}`
        ));
      }
      item.elements = elements;
      continue;
    }

    if (item.kind === "component") {
      const packageDiagram = packageItems.find((candidate) => candidate.scope.packageId === item.scope.packageId);
      const classDiagram = classItems.find((candidate) => samePackage(candidate, item));
      item.elements = [
        engineeringElement(
          item,
          "package_node",
          item.scope.packageId ?? "package",
          "package",
          componentPackageElementExplanation(item, packageDiagram),
          dedupeDiagramLinks([
            ...(packageDiagram ? [diagramLink(packageDiagram, "parent_boundary", "打开组件所属 package 的 Package Diagram。", item)] : []),
            ...(classDiagram ? [diagramLink(classDiagram, "structural_context", "查看该组件所属模块的结构协作图。", item)] : [])
          ]),
          packageDiagram?.anchor ?? `engineering:package:${safeId(item.scope.packageId ?? "")}`
        ),
        engineeringElement(
          item,
          "file_node",
          item.scope.filePath ?? "file",
          "file",
          componentFileElementExplanation(item),
          item.drilldowns,
          `${item.anchor}:file`
        ),
        engineeringElement(item, "component_node", componentTitleFromDiagramTitle(item.title), "component", componentCenterElementExplanation(item), item.drilldowns),
        engineeringElement(
          item,
          "incomingRelations",
          "被引用/调用关系",
          "reuse_signal",
          componentRelationMetricElementExplanation(item, "incoming"),
          item.drilldowns.filter((link) => link.kind === "sequence" || link.kind === "technical_hotspot"),
          `${item.anchor}:incoming-relations`
        ),
        engineeringElement(
          item,
          "outgoingRelations",
          "对外依赖/调用关系",
          "collaboration_signal",
          componentRelationMetricElementExplanation(item, "outgoing"),
          item.drilldowns.filter((link) => link.kind === "sequence" || link.kind === "technical_hotspot"),
          `${item.anchor}:outgoing-relations`
        )
      ];
      continue;
    }

    if (item.kind === "class_structural") {
      const componentsInPackage = componentItems.filter((candidate) => samePackage(candidate, item));
      if (item.elements?.length) {
        item.elements = item.elements.map((element) => {
          const component = componentsInPackage.find((candidate) => componentTitleFromDiagramTitle(candidate.title) === element.label);
          return {
            ...element,
            drilldowns: dedupeDiagramLinks([
              ...element.drilldowns,
              ...(component ? [diagramLink(component, "realized_by", "打开该结构对象对应的 Component Diagram。", item), ...component.drilldowns] : [])
            ])
          };
        });
      } else {
        item.elements = componentsInPackage.slice(0, 12).map((component) => engineeringElement(
          component,
          mermaidClassId(componentTitleFromDiagramTitle(component.title)),
          componentTitleFromDiagramTitle(component.title),
          "component",
          classStructuralElementExplanation(item, component),
          [diagramLink(component, "realized_by", "打开该结构对象对应的 Component Diagram。", item), ...component.drilldowns]
        ));
      }
      continue;
    }

    if (item.kind === "sequence") {
      const sourceComponents = componentItems.filter((candidate) => samePath(candidate.scope.filePath, item.scope.sourcePath));
      const targetComponents = componentItems.filter((candidate) => samePath(candidate.scope.filePath, item.scope.targetPath));
      const classDiagram = classItems.find((candidate) => samePackage(candidate, item));
      item.elements = [
        engineeringElement(
          item,
          "Source",
          item.scope.sourceName ?? "Source",
          "component",
          sequenceParticipantElementExplanation(item, "source"),
          dedupeDiagramLinks([
            ...sourceComponents.slice(0, 4).map((component) => diagramLink(component, "source_or_target", "打开来源参与者对应的 Component Diagram。", item)),
            ...(classDiagram ? [diagramLink(classDiagram, "structural_context", "查看该 sequence 所属模块的结构上下文。", item)] : [])
          ]),
          `${item.anchor}:source`
        ),
        engineeringElement(
          item,
          "Target",
          item.scope.targetName ?? "Target",
          "component",
          sequenceParticipantElementExplanation(item, "target"),
          dedupeDiagramLinks([
            ...targetComponents.slice(0, 4).map((component) => diagramLink(component, "source_or_target", "打开目标参与者对应的 Component Diagram。", item)),
            ...(classDiagram ? [diagramLink(classDiagram, "structural_context", "查看该 sequence 所属模块的结构上下文。", item)] : [])
          ]),
          `${item.anchor}:target`
        )
      ];
      continue;
    }

    if (item.kind === "technical_hotspot") {
      const packageDiagram = packageItems.find((candidate) => samePackage(candidate, item));
      const componentsForFile = componentItems.filter((candidate) => samePath(candidate.scope.filePath, item.scope.filePath));
      item.elements = [
        engineeringElement(
          item,
          "target",
          item.scope.filePath ?? item.title,
          "file",
          hotspotTargetElementExplanation(item),
          dedupeDiagramLinks([
            ...(packageDiagram ? [diagramLink(packageDiagram, "parent_boundary", "打开该热点所属 package 的 Package Diagram。", item)] : []),
            ...componentsForFile.slice(0, 6).map((component) => diagramLink(component, "realized_by", "打开该热点附近的 Component Diagram。", item))
          ]),
          `${item.anchor}:target`
        ),
        engineeringElement(item, "hotspot", item.title, "technical_hotspot", hotspotCenterElementExplanation(item), item.drilldowns)
      ];
      continue;
    }

    item.elements = [];
  }
}

function engineeringElement(
  item: EngineeringDiagramDocument,
  mermaidId: string,
  label: string,
  kind: EngineeringDiagramElementKind,
  explanation: EngineeringElementExplanation,
  drilldowns: EngineeringDiagramLink[],
  anchor = item.anchor
): EngineeringDiagramElement {
  return {
    id: `${item.id}:element:${safeId(label)}`,
    mermaidId,
    label,
    kind,
    anchor,
    ...explanation,
    drilldowns: dedupeDiagramLinks(drilldowns)
  };
}

function packageCenterElementExplanation(item: EngineeringDiagramDocument): EngineeringElementExplanation {
  const packageId = item.scope.packageId ?? item.title;
  const outgoing = coverageValue(item, "依赖或调用外部模块");
  const incoming = coverageValue(item, "被其他模块依赖或调用");
  return {
    summary: `${packageId} 是当前 Package Diagram 的中心工程边界，用来观察它自身规模、依赖方向和可下钻技术复杂度。`,
    role: `技术组织边界：它把 ${packageId} 下的文件、符号和跨模块关系聚合成一个可讨论的工程单元。`,
    whyItExists: `本地仓库证据在 ${packageId} 下观察到足够文件、符号或跨模块关系，因此它值得被提升为软件结构模型中的 package 级入口。`,
    relationshipMeaning: `图中从 ${packageId} 指向其它节点的箭头表示当前边界依赖外部 package/module；被其他模块依赖或调用${incoming ? ` ${incoming} 次` : ""}、依赖或调用外部模块${outgoing ? ` ${outgoing} 次` : ""}，用于判断它更像稳定复用边界还是编排/桥接边界。`,
    drilldownIntent: `下钻该节点可以继续查看 ${packageId} 内的关键组件、结构协作切片、运行链路、部署节点和复杂度热点，从而理解这个工程边界如何承载功能变化。`,
    businessRelevance: `该节点不是业务故事本身，但组织/过程模型中落到 ${packageId} 的 Use Case 可以把这里作为技术承载边界引用。当前关联仍是 CANDIDATE。`,
    changeImpact: `修改 ${packageId} 的公共入口、依赖方向或目录边界，可能影响引用它的组件图、sequence 片段、部署配置和相关业务故事的验证路径。`,
    evidence: evidenceLines(item, [`package scope: ${packageId}`, ...item.coverage]),
    risks: [
      "如果只把该节点当作目录名，会遗漏它作为稳定工程边界的职责判断。",
      "如果依赖外部模块的迹象持续增加，可能说明该边界承担过多编排或桥接职责。"
    ],
    questions: item.questions.length ? item.questions : ["当前仓库证据尚未把该 package 明确 Trace 到某个 Use Case；因此业务关联保持候选。"],
    confidence: item.confidence
  };
}

function packageDependencyElementExplanation(
  current: EngineeringDiagramDocument,
  dependency: string,
  dependencyPackage: EngineeringDiagramDocument | undefined
): EngineeringElementExplanation {
  const currentPackage = current.scope.packageId ?? current.title;
  const relationHint = packageDependencyRelationHint(currentPackage, dependency);
  return {
    summary: `${dependency} 是 ${currentPackage} 当前观察到的外部技术边界依赖；它说明当前模块不是孤立实现，而是需要借助另一组工程能力完成职责。`,
    role: relationHint.role,
    whyItExists: `本地仓库证据在 ${currentPackage} 与 ${dependency} 之间观察到跨模块事实关系，因此该依赖被放入 Package Diagram，而不是只藏在代码 import/call 里。`,
    relationshipMeaning: relationHint.meaning,
    drilldownIntent: dependencyPackage
      ? `下钻 ${dependency} 可以查看它自己的 Package Diagram，再继续进入其组件、结构、sequence 或热点，判断当前依赖究竟落在入口、运行时、工具注册、模型适配还是基础设施边界。`
      : `当前尚未生成 ${dependency} 的独立 Package Diagram；这表示它不在本轮可解释 package 范围内，本文只把它作为外部依赖边界保留。`,
    businessRelevance: `${currentPackage} 如果承载用户可见能力，那么对 ${dependency} 的依赖可能是该能力的运行机制、扩展点或治理约束。该业务关联需要由组织/过程模型的 Use Case 证据确认。`,
    changeImpact: `修改 ${dependency} 的公共接口、路径或运行方式，可能让 ${currentPackage} 的调用链、打包入口、agent 工作流或 UI 行为发生连锁变化。`,
    evidence: evidenceLines(current, [
      `dependency edge: ${currentPackage} -> ${dependency}`,
      ...(dependencyPackage?.evidencePaths ?? [])
    ]),
    risks: [
      "跨模块依赖只能证明技术关系，不能直接证明业务关系。",
      "如果该依赖只是因为实现方便而存在，未来变更可能形成边界漂移或隐式公共工具箱。"
    ],
    questions: [
      `当前证据尚未证明 ${currentPackage} 依赖 ${dependency} 与某个 Use Case、runtime command 或配置决策直接相关。`,
      `当前依赖方向按仓库事实记录为候选，尚未发现架构决策文档证明它是稳定边界。`
    ],
    confidence: dependencyPackage?.confidence ?? "medium"
  };
}

function componentPackageElementExplanation(
  item: EngineeringDiagramDocument,
  packageDiagram: EngineeringDiagramDocument | undefined
): EngineeringElementExplanation {
  const packageId = item.scope.packageId ?? "unknown package";
  return {
    summary: `${packageId} 是 ${item.title} 所属的 package/module 边界，用来判断该组件是局部实现细节还是跨模块协作点。`,
    role: "组件归属边界：它定义当前组件默认应该服务的工程上下文。",
    whyItExists: `组件不能脱离 package 解释；同一个符号如果位于不同 package，可能代表完全不同的职责、所有权和变更影响面。`,
    relationshipMeaning: `${packageId} -> ${item.title} 表示该组件由这个技术边界承载；它的角色必须由入口、调用、导出、测试或配置证据来解释，而不是只由目录位置解释。`,
    drilldownIntent: packageDiagram
      ? `下钻 package 可以查看 ${packageId} 的跨模块依赖、结构协作和热点，从边界层解释该组件为何出现在这里。`
      : `当前没有可打开的 package 图，因此 ${packageId} 只作为路径边界显示，不作为已解释的模块职责。`,
    businessRelevance: `如果 ${item.title} 被业务 Use Case 调用，那么 ${packageId} 是该业务能力的候选技术落点。`,
    changeImpact: `迁移或重命名该 package 可能改变组件导入路径、下钻索引和 Use Case 对技术承载边界的引用。`,
    evidence: evidenceLines(item, [`component package: ${packageId}`, ...item.coverage]),
    risks: ["组件职责可能被路径误导；仍需结合调用、导入、导出、入口和测试等代码证据判断真实角色。"],
    questions: [`当前仓库证据尚未证明 ${item.title} 属于 ${packageId} 的稳定职责，暂按候选归属处理。`],
    confidence: item.confidence
  };
}

function componentFileElementExplanation(item: EngineeringDiagramDocument): EngineeringElementExplanation {
  const filePath = item.scope.filePath ?? "unknown file";
  return {
    summary: `${filePath} 是当前组件的证据文件，说明 ${item.title} 的技术职责可以追溯到具体代码位置。`,
    role: "代码证据锚点：它让组件解释可以回到具体文件，而不是停留在抽象图形上。",
    whyItExists: `软件结构模型必须把每个组件图绑定到可验证文件，否则 UI 只是投影而不是可追溯解释。`,
    relationshipMeaning: `文件节点连接组件节点，表示该组件的实现、入口或符号事实来自这个文件。`,
    drilldownIntent: "下钻该文件相关的组件、sequence 或 hotspot，可以检查该文件是否只是实现细节，还是已经成为多个能力共用的技术枢纽。",
    businessRelevance: businessHintFromPath(filePath),
    changeImpact: `修改 ${filePath} 可能影响该组件图、相关 sequence、热点判断，以及引用该组件的业务下钻文档。`,
    evidence: evidenceLines(item, [filePath, ...item.evidencePaths]),
    risks: ["文件路径只能说明位置，不能单独证明业务职责。"],
    questions: [`当前文件锚点只能证明位置；如果同文件出现多个入口或职责，需在组件/sequence 文档中拆开解释。`],
    confidence: item.confidence
  };
}

function componentCenterElementExplanation(item: EngineeringDiagramDocument): EngineeringElementExplanation {
  const filePath = item.scope.filePath ?? "unknown file";
  return {
    summary: `${componentTitleFromDiagramTitle(item.title)} 是当前 Component Diagram 的中心技术对象；这张图用它来解释职责、协作压力和下钻路径。`,
    role: componentRoleFromSummary(item.summary),
    whyItExists: `本地仓库证据将它识别为关键组件或符号，且它具有可定位文件 ${filePath}、被引用/调用关系和对外依赖/调用关系。`,
    relationshipMeaning: `package、file、被引用/调用关系和对外依赖/调用关系都围绕该组件组织，用来判断它是入口、编排者、共享能力还是风险集中点。`,
    drilldownIntent: "下钻该组件可以进入它参与的 sequence、所属结构切片或附近热点，回答“它如何工作、谁调用它、它调用谁”。",
    businessRelevance: componentBusinessRelationHint(item),
    changeImpact: `修改 ${componentTitleFromDiagramTitle(item.title)} 可能影响 ${filePath} 中的入口逻辑、调用关系和引用它的业务/工程文档。`,
    evidence: evidenceLines(item, [filePath, ...item.coverage]),
    risks: ["协作压力高不必然代表设计问题；必须结合业务入口、测试和变更频率判断。"],
    questions: item.questions.length ? item.questions : [`当前证据尚未证明 ${componentTitleFromDiagramTitle(item.title)} 是单一职责还是聚合入口，暂按候选组件解释。`],
    confidence: item.confidence
  };
}

function componentRelationMetricElementExplanation(item: EngineeringDiagramDocument, direction: "incoming" | "outgoing"): EngineeringElementExplanation {
  const isIncoming = direction === "incoming";
  const metricName = isIncoming ? "被复用/被依赖迹象" : "外部协作/编排迹象";
  return {
    summary: `${metricName}用于解释它在技术网络中的复用程度或编排程度；这里只展示含义，不把内部计数当作用户结论。`,
    role: isIncoming ? "复用压力线索：帮助识别共享核心、公共接口或高回归风险点。" : "编排压力线索：帮助识别编排中心、聚合入口或耦合扩散点。",
    whyItExists: `单看组件名称无法判断复杂度，${metricName} 把本地仓库关系证据转译为用户可理解的协作压力。`,
    relationshipMeaning: isIncoming
      ? `其它组件、文件或符号依赖当前组件；关系越多，修改它越可能影响更多调用方。`
      : `当前组件依赖其它组件、文件或符号；关系越多，越可能承担较宽的协调职责。`,
    drilldownIntent: "下钻相关 sequence 或 hotspot，可以把抽象数字落到具体调用片段、文件和风险位置。",
    businessRelevance: "如果该组件支撑用户可见能力，这个关系指标会影响业务变更的验证成本和回归风险。",
    changeImpact: isIncoming
      ? "重构被大量对象引用/调用的组件需要谨慎处理兼容性、调用方迁移和测试覆盖。"
      : "降低过多对外依赖通常意味着拆分编排职责、引入接口边界或把适配逻辑移到更合适的位置。",
    evidence: evidenceLines(item, item.coverage),
    risks: ["关系指标来自本地仓库分析，可能受扫描粒度、生成文件或 import 噪声影响。"],
    questions: [`当前证据无法完全区分这些关系中的运行时调用、类型引用、导出聚合或生成物噪声，因此只作为候选协作压力。`],
    confidence: item.confidence
  };
}

function classStructuralElementExplanation(
  parent: EngineeringDiagramDocument,
  component: EngineeringDiagramDocument
): EngineeringElementExplanation {
  const componentName = componentTitleFromDiagramTitle(component.title);
  return {
    summary: `${componentName} 是 ${parent.scope.packageId ?? parent.title} 结构切片中的关键对象，用来解释该模块内部职责如何分布。`,
    role: componentRoleFromSummary(component.summary),
    whyItExists: `它被选入 Class / Structural Diagram，是因为本地仓库证据显示它和同一结构语境中的对象存在可解释关系，或者它代表该语境中的关键结构角色。`,
    relationshipMeaning: `它和同图其它对象共同构成候选结构协作切片；这不是全量类图，而是帮助识别入口、编排、共享核心、接口或适配器的视角。`,
    drilldownIntent: `下钻 ${componentName} 可以打开对应 Component Diagram，并继续查看它参与的 sequence 或热点。`,
    businessRelevance: `如果某个 Use Case 的 Class Collaboration 文档引用 ${componentName}，它应被解释为该业务能力的候选技术承载对象。`,
    changeImpact: `修改 ${componentName} 可能改变 ${parent.scope.packageId ?? parent.title} 内的结构协作方式，并影响相关组件图和 sequence 解释。`,
    evidence: evidenceLines(component, [component.scope.filePath ?? "", ...component.evidencePaths, ...component.coverage]),
    risks: ["当前结构角色来自仓库证据推断，不能直接确认领域模型或设计模式。"],
    questions: [`当前证据只说明 ${componentName} 是候选结构对象；它的精确角色必须由接口、继承、组合、调用或 Use Case Trace 证据决定。`],
    confidence: component.confidence
  };
}

function classStructuralComponentElementExplanation(
  parent: EngineeringDiagramDocument,
  slice: EngineeringStructuralSlice,
  component: EngineeringComponent
): EngineeringElementExplanation {
  const componentName = readableClassName(component.title);
  const role = structuralRoleFromComponent(component);
  return {
    summary: `${componentName} 属于 ${slice.sliceId} 结构切片，用来解释「${slice.structuralContext}」中的一个结构职责，而不是因为它在 ${slice.packageId} 中关系数量高才被放入图。`,
    role,
    whyItExists: `它位于 ${component.filePath}，并且和同切片其它类/接口处在同一源码语境；该语境比顶层目录 ${slice.packageId} 更接近真实业务或架构边界。`,
    relationshipMeaning: "图中的同切片关系表示候选结构协作边界；只有存在接口实现、继承、组合、策略或端口证据时，才应进一步标注为明确设计关系。",
    drilldownIntent: `下钻 ${componentName} 应验证它在 Component、Sequence、Use Case Class Collaboration 中承担的具体角色，避免孤立类名被误读成业务解释。`,
    businessRelevance: `${componentName} 是「${slice.structuralContext}」候选技术承载对象；当前文档通过 Trace/Refine 链接说明它服务的触发条件、流程或规则，证据不足时会降低置信度或缩小覆盖范围。`,
    changeImpact: `修改 ${componentName} 可能影响 ${slice.sliceId} 内的结构说明，并应同步检查相关 Design/Engineering/Architecture 文档是否仍一致。`,
    evidence: [
      codeAnchorText(component.filePath, component.line),
      `结构切片：${slice.sliceId}`,
      `对象类型：${component.kind}`,
      `候选语境：${slice.structuralContext}`
    ],
    risks: ["当前切片来自本地仓库证据和路径语境推断；图中对象必须能解释同一个结构语境，否则生成流程会拆分或降级。"],
    questions: [],
    confidence: component.confidence
  };
}

function structuralRoleFromComponent(component: EngineeringComponent): string {
  const name = readableClassName(component.title);
  const haystack = `${name} ${component.filePath}`.toLowerCase();
  if (component.kind === "interface" || component.kind === "trait") return "接口/端口契约：它定义结构边界或替换点；实现类和调用方必须以代码锚点或下钻图呈现。";
  if (component.kind === "enum") return "状态/类型枚举：它可能约束流程、状态或策略分支；使用场景必须由 Activity、State Machine 或 Sequence 证据呈现。";
  if (/strategy|policy|specification/.test(haystack)) return "策略/规则对象：它可能承载可替换业务规则或通道差异。";
  if (/repository|dao|mapper/.test(haystack)) return "持久化/数据访问边界：它应解释数据落点，而不是混入领域结构核心。";
  if (/provider|client|gateway|adapter/.test(haystack)) return "外部系统适配对象：它解释技术边界和外部依赖。";
  if (/service|command|handler/.test(haystack)) return "应用/领域服务对象：它可能承担编排、命令处理或领域操作。";
  if (/event|message|record/.test(haystack)) return "事件/消息对象：它可能承载状态变化、审计或异步协作语义。";
  if (/exception|error/.test(haystack)) return "异常/失败语义对象：它解释业务或技术失败如何被表达。";
  if (/money|amount|id|value|context/.test(haystack)) return "值对象/上下文对象：它提供跨流程复用的值语义或上下文语义。";
  return "结构对象：它的职责必须结合 Use Case、Sequence 或 Component 下钻证据解释，不能只靠名称或目录判断。";
}

function sequenceParticipantElementExplanation(item: EngineeringDiagramDocument, side: "source" | "target"): EngineeringElementExplanation {
  const isSource = side === "source";
  const name = isSource ? item.scope.sourceName ?? "Source" : item.scope.targetName ?? "Target";
  const pathValue = isSource ? item.scope.sourcePath : item.scope.targetPath;
  const opposite = isSource ? item.scope.targetName ?? "Target" : item.scope.sourceName ?? "Source";
  return {
    summary: `${name} 是当前 Sequence Diagram 的${isSource ? "来源" : "目标"}参与者，用来解释 ${item.summary}`,
    role: isSource ? "消息发起/依赖方：它触发或引用目标能力。" : "消息接收/被依赖方：它提供被当前片段引用或调用的能力。",
    whyItExists: `本地仓库证据在 ${item.scope.sourcePath ?? "unknown"} 与 ${item.scope.targetPath ?? "unknown"} 之间观察到 ${coverageValue(item, "交互类型") || "关系"}，因此 ${name} 被放入 sequence。`,
    relationshipMeaning: isSource
      ? `${name} -> ${opposite} 表示当前片段的依赖方向；如果关系只是 import，它只能说明静态依赖，不能直接证明运行时顺序。`
      : `${opposite} -> ${name} 表示目标能力被当前片段依赖；需要结合调用证据确认它是运行时调用、类型引用还是静态导入。`,
    drilldownIntent: `下钻 ${name} 可以查看对应 Component Diagram 或结构上下文，判断这个参与者在更大技术边界中的职责。`,
    businessRelevance: "业务 Use Case 的执行过程可能落到多个 sequence 片段上；当前片段只是候选技术步骤，需要组织/过程模型证据确认业务含义。",
    changeImpact: `修改 ${pathValue ?? name} 可能改变该 sequence 的依赖关系、调用证据和相关组件/结构图的解释。`,
    evidence: evidenceLines(item, [pathValue ?? "", ...item.coverage]),
    risks: ["单条 sequence 片段不足以证明完整调用链或业务主成功路径。"],
    questions: [`当前关系类型需要按证据区分运行时调用、静态 import、类型引用或配置引用；若只是静态关系，本图不应被解释成真实调用顺序。`],
    confidence: item.confidence
  };
}

function hotspotTargetElementExplanation(item: EngineeringDiagramDocument): EngineeringElementExplanation {
  const target = item.scope.filePath ?? item.title;
  return {
    summary: `${target} 是当前热点指向的具体文件、模块或目标位置，所有热点解释必须能回到这个证据锚点。`,
    role: "热点证据目标：它承载复杂度信号，而不是抽象风险标签。",
    whyItExists: `本地仓库证据或仓库扫描在 ${target} 观察到复杂度信号，因此它被放入 Technical Hotspot Diagram。`,
    relationshipMeaning: `target -> hotspot 表示该位置产生或承载当前复杂度提醒；它需要反向关联到 package、component、结构或 sequence 才能判断真实影响。`,
    drilldownIntent: "下钻目标位置可以查看所属 package 或附近 component，确认热点是否影响真实业务能力和可维护性。",
    businessRelevance: `如果 ${target} 被 Use Case 证据引用，那么该热点会提高对应业务变更的阅读、验证或回归成本。`,
    changeImpact: `治理 ${target} 可能影响文件结构、导入路径、测试覆盖和语义化版本记录。`,
    evidence: evidenceLines(item, [target, ...item.evidencePaths, ...item.coverage]),
    risks: ["热点目标不等于缺陷；需要确认它是否真的影响高频业务变化或关键运行路径。"],
    questions: [`当前热点只说明 ${target} 存在复杂度信号；若证据来自生成文件、聚合导出或扫描噪声，应降级或移除。`],
    confidence: item.confidence
  };
}

function hotspotCenterElementExplanation(item: EngineeringDiagramDocument): EngineeringElementExplanation {
  return {
    summary: `${item.title} 是当前技术复杂度热点，用来提醒治理前先理解影响面，而不是立即重构。`,
    role: "候选风险/治理入口：它把复杂度信号转化为可讨论的工程问题。",
    whyItExists: `该热点由本地仓库事实生成，说明某个文件、模块或依赖簇可能让理解、修改或验证成本升高。`,
    relationshipMeaning: "热点节点连接目标位置，表示风险来自具体工程事实；它需要和 package/component/sequence 交叉阅读。",
    drilldownIntent: "下钻热点相关的 package、component 或 sequence，可以确认它影响的是边界、对象、调用链还是运行配置。",
    businessRelevance: "技术热点会间接影响业务交付：它可能让某些 Use Case 的变更成本、验证成本和回归风险上升。",
    changeImpact: "治理热点应拆成可验证的原子提交，并同步记录语义化版本、Git 版本和文档变更。",
    evidence: evidenceLines(item, [...item.evidencePaths, ...item.coverage]),
    risks: ["不要把热点当作已确认缺陷；先确认业务影响和证据质量。"],
    questions: item.questions.length ? item.questions : ["当前仅记录候选热点的证据和影响面，不把它自动升级为治理任务。"],
    confidence: item.confidence
  };
}

function packageDependenciesFromMermaid(mermaid: string): string[] {
  const dependencies: string[] = [];
  for (const line of mermaid.split(/\r?\n/)) {
    const match = line.match(/^\s+[A-Za-z0-9_]+\["(.+?)"\]\s*$/);
    if (!match) continue;
    const label = match[1].replace(/\\"/g, "\"");
    if (!label || label === "未观察到跨模块依赖") continue;
    dependencies.push(label);
  }
  return dependencies.slice(1);
}

function componentTitleFromDiagramTitle(title: string): string {
  return title.replace(/\s+Component Diagram$/i, "");
}

function coverageValue(item: EngineeringDiagramDocument, label: string): string | undefined {
  const normalizedLabel = label.toLowerCase();
  const line = item.coverage.find((entry) => {
    const normalized = entry.toLowerCase();
    return normalized.startsWith(`${normalizedLabel}：`) || normalized.startsWith(`${normalizedLabel}:`);
  });
  if (!line) return undefined;
  return line.replace(/^[^：:]+[：:]\s*/, "").trim();
}

function evidenceLines(item: EngineeringDiagramDocument, extra: string[] = []): string[] {
  const seen = new Set<string>();
  const lines = [...extra, ...item.evidencePaths]
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
  return lines.length ? lines.slice(0, 8) : ["当前解释来自本地仓库候选事实，但没有可展示的更细证据路径。"];
}

function packageDependencyRelationHint(
  currentPackage: string,
  dependency: string
): { role: string; meaning: string } {
  const current = currentPackage.toLowerCase();
  const target = dependency.toLowerCase();
  if (current.includes("studio-desktop") && target.includes("runtime-cli")) {
    return {
      role: "桌面 UI 到 runtime command 的运行边界：用户操作通过桌面端进入受控 runtime 命令层。",
      meaning: `${currentPackage} -> ${dependency} 通常意味着 UI 不直接执行工程扫描、设计发现或评审逻辑，而是委托 runtime 层承载长任务、文件访问和工程命令。`
    };
  }
  if (target.includes("tool-registry")) {
    return {
      role: "治理工具边界：写入、文件操作或受控工程动作应经过工具注册与权限约束。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前能力可能需要受控工具调用，而不是随意绕过项目治理规则。`
    };
  }
  if (target.includes("prompt-registry")) {
    return {
      role: "提示词过程边界：agent 行为由外部可维护 prompt procedure 约束。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前能力把模型行为抽离到 prompt registry，避免提示词散落在 UI 或命令实现中。`
    };
  }
  if (target.includes("model-router") || target.includes("provider-")) {
    return {
      role: "模型路由/供应商边界：模型选择、供应商调用和任务类型路由被集中治理。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前能力需要模型调用，但模型接入不应泄漏到业务 UI 或任意模块。`
    };
  }
  if (target.includes("schema")) {
    return {
      role: "契约边界：跨包共享的数据结构、文档模型或图谱模型通过 schema 约束。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前模块需要遵守共享契约，修改 schema 可能扩散到多个 Explorer、runtime 或 MCP 工具。`
    };
  }
  if (target.includes("mcp-server")) {
    return {
      role: "外部工具集成边界：工程能力可能被暴露给 MCP 工具或外部 agent。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前模块和工具生态存在接口关系，需要关注工具契约、权限和 trace。`
    };
  }
  if (target.includes("coding-agent-adapter")) {
    return {
      role: "外部 coding worker 适配边界：Praxis 负责图、记忆和进度，外部 agent 只是 worker。",
      meaning: `${currentPackage} 依赖 ${dependency} 说明当前能力可能触发外部 coding agent，但不应把项目记忆或设计权威交给 worker。`
    };
  }
  if (current.includes("apps/") && target.includes("packages/")) {
    return {
      role: "应用层到共享包能力边界：应用入口复用 packages 中的可治理能力。",
      meaning: `${currentPackage} -> ${dependency} 表示应用层借助共享工程能力完成用户可见功能，变更时需要同时看 UI 入口和包内契约。`
    };
  }
  return {
    role: "跨模块技术依赖边界：当前 package 需要另一个 package/module 提供能力、契约、配置或运行支撑。",
    meaning: `${currentPackage} -> ${dependency} 表示本地仓库证据观察到跨模块关系；它解释技术依赖方向，但不直接证明业务流程。`
  };
}

function componentRoleFromSummary(summary: string): string {
  const normalized = summary.toLowerCase();
  if (normalized.includes("route") || normalized.includes("page") || normalized.includes("wizard")) return "用户入口或 UI 触发组件：它更靠近用户操作进入工程能力的地方。";
  if (normalized.includes("command")) return "runtime command 或命令入口：它把外部请求转成受控工程操作。";
  if (normalized.includes("client")) return "客户端/适配器边界：它负责把调用转交给 runtime、provider 或外部系统。";
  if (normalized.includes("schema") || normalized.includes("type")) return "契约或类型边界：它约束跨模块数据结构和调用协议。";
  if (normalized.includes("agent")) return "agent 工作流节点：它参与模型调用、上下文构建、任务分派或结果解释。";
  if (normalized.includes("registry")) return "注册表/治理边界：它集中维护可用能力、路由或受控操作。";
  return "关键技术对象：它需要结合复用迹象、外部协作迹象、文件位置和下钻图判断具体职责。";
}

function componentBusinessRelationHint(item: EngineeringDiagramDocument): string {
  const filePath = item.scope.filePath ?? "";
  return [
    `${componentTitleFromDiagramTitle(item.title)} 不是业务用例，但可能是业务能力落地时经过的技术节点。`,
    businessHintFromPath(filePath),
    "如果组织/过程模型的 Use Case 下钻图引用它，应在业务文档中说明它承担入口、编排、领域规则、适配器还是基础设施职责。"
  ].join(" ");
}

function relatedItems(
  items: EngineeringDiagramDocument[] | undefined,
  predicate: (item: EngineeringDiagramDocument) => boolean
): EngineeringDiagramDocument[] {
  return (items ?? []).filter(predicate);
}

function pushLinks(
  parent: EngineeringDiagramDocument,
  links: EngineeringDiagramLink[],
  items: EngineeringDiagramDocument[],
  relation: EngineeringDiagramLink["relation"],
  reason: string
): void {
  links.push(...items.map((item) => diagramLink(item, relation, reason, parent)));
}

function diagramLink(
  item: EngineeringDiagramDocument,
  relation: EngineeringDiagramLink["relation"],
  reason: string,
  parent?: EngineeringDiagramDocument
): EngineeringDiagramLink {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    docPath: item.docPath,
    htmlPath: item.htmlPath,
    anchor: item.anchor,
    relation,
    reason: parent ? drilldownReason(parent, item, relation, reason) : reason
  };
}

function drilldownReason(
  parent: EngineeringDiagramDocument,
  child: EngineeringDiagramDocument,
  relation: EngineeringDiagramLink["relation"],
  fallback: string
): string {
  const parentTitle = cleanDiagramTitle(parent.title);
  const childTitle = cleanDiagramTitle(child.title);
  const parentPackage = parent.scope.packageId ?? parent.scope.filePath ?? parentTitle;
  const childPackage = child.scope.packageId ?? child.scope.filePath ?? childTitle;
  if (parent.kind === "package") {
    if (child.kind === "package") {
      return `打开 ${childPackage} 自己的包级边界，检查 ${parentPackage} 依赖它时借用的是运行命令、共享能力、治理工具、模型适配还是基础设施职责。`;
    }
    if (child.kind === "component") {
      return `打开 ${childTitle} 是为了确认 ${parentPackage} 内部哪一个具体对象承担入口、编排、适配、契约或共享职责。重点查看代码锚点 ${child.scope.filePath ?? childPackage}，以及它的被引用/调用关系和对外依赖/调用关系是否意味着变更会扩散。`;
    }
    if (child.kind === "class_structural") {
      return `打开 ${childTitle} 是为了从对象协作角度解释 ${parentPackage}：哪些对象像入口，哪些像编排核心，哪些像适配/共享边界；它帮助判断复杂度来自职责分布，而不只是文件数量。`;
    }
    if (child.kind === "sequence") {
      return `打开这条 sequence 是为了把 ${parentPackage} 的静态依赖还原成一段可读协作：${child.scope.sourceName ?? child.scope.sourcePath ?? "source"} -> ${child.scope.targetName ?? child.scope.targetPath ?? "target"}。重点判断这是 import、调用、引用还是消息方向，以及它是否真的影响运行路径。`;
    }
    if (child.kind === "deployment") {
      return `查看 ${childTitle} 如何影响 ${parentPackage} 的运行、构建、打包或本地开发验证路径。`;
    }
    if (child.kind === "technical_hotspot") {
      return `查看 ${childTitle} 这个复杂度信号是否会抬高 ${parentPackage} 的阅读、修改、测试或回归成本。`;
    }
  }
  if (parent.kind === "component") {
    if (child.kind === "sequence") {
      return `打开这条 sequence 是为了确认 ${parentTitle} 在 ${child.scope.sourceName ?? child.scope.sourcePath ?? "source"} -> ${child.scope.targetName ?? child.scope.targetPath ?? "target"} 中的角色：它是在发起协作、接收调用、做编排，还是只暴露被依赖能力。`;
    }
    if (child.kind === "class_structural") {
      return `打开结构切片是为了把 ${parentTitle} 放回所属模块，看它周围还有哪些对象共同承担入口、编排、适配或共享职责，避免把单个组件误读成完整设计。`;
    }
    if (child.kind === "technical_hotspot") {
      return `查看 ${childTitle} 是否说明 ${parentTitle} 附近存在变更影响面、文件规模或协作压力风险。`;
    }
    if (child.kind === "package") {
      return `回到 ${childPackage} 的包级边界，确认 ${parentTitle} 是否属于这个模块的稳定职责。`;
    }
  }
  if (parent.kind === "class_structural") {
    if (child.kind === "component") {
      return `打开 ${childTitle} 的组件视角，是为了验证结构图里的对象角色是否有文件锚点 ${child.scope.filePath ?? childPackage}、被引用/调用关系和下游关系证据支撑。`;
    }
    if (child.kind === "sequence") {
      return `打开这条 sequence 是为了检查结构切片中的对象是否真的在 ${child.scope.sourceName ?? child.scope.sourcePath ?? "source"} -> ${child.scope.targetName ?? child.scope.targetPath ?? "target"} 中发生协作，避免只凭静态结构判断设计。`;
    }
    if (child.kind === "technical_hotspot") {
      return `查看该结构边界中的热点，确认复杂度集中在哪个对象、文件或关系簇上。`;
    }
  }
  if (parent.kind === "sequence") {
    if (child.kind === "component") {
      return `打开 ${childTitle} 的组件图，查看当前 sequence 参与者的真实职责、文件锚点和关系压力。`;
    }
    if (child.kind === "class_structural") {
      return `查看当前 sequence 所属模块的静态结构，确认这段消息关系背后的对象协作边界。`;
    }
    if (child.kind === "technical_hotspot") {
      return `查看这段动态协作附近的热点，判断调用或引用片段是否靠近高风险文件、组件或模块。`;
    }
  }
  if (parent.kind === "deployment") {
    if (child.kind === "package") {
      return `回到 ${childPackage} 的 package 边界，确认该运行/构建节点属于哪个工程模块以及会影响哪些代码区域。`;
    }
    if (child.kind === "component") {
      return `查看 ${childTitle} 是否是该运行/构建配置触发、包装或依赖的关键组件。`;
    }
    if (child.kind === "technical_hotspot") {
      return `查看该运行/构建节点附近的热点，确认配置、脚本或产物是否增加发布和验证风险。`;
    }
  }
  if (parent.kind === "technical_hotspot") {
    if (child.kind === "package") {
      return `回到 ${childPackage} 的包级边界，判断热点是否只是局部文件问题，还是影响整个模块治理。`;
    }
    if (child.kind === "component") {
      return `查看 ${childTitle} 是否是热点直接影响的组件，从具体职责和调用关系判断治理优先级。`;
    }
    if (child.kind === "class_structural") {
      return `查看热点所在模块的结构切片，确认复杂度是否来自对象职责分布或边界混淆。`;
    }
    if (child.kind === "sequence") {
      return `查看热点附近的动态协作片段，判断复杂度是否会影响真实运行链路。`;
    }
  }
  if (relation === "parent_boundary") return `回到 ${childTitle} 的上层边界，确认当前图的解释是否落在正确工程范围内。`;
  if (relation === "dynamic_flow") return `查看 ${childTitle} 的动态协作细节，把静态结构还原到具体调用、引用或消息方向。`;
  if (relation === "risk_detail") return `查看 ${childTitle} 的复杂度风险细节，确认它是否影响当前图的变更成本。`;
  return fallback;
}

function cleanDiagramTitle(title: string): string {
  return title
    .replace(/\s+Package Diagram$/i, "")
    .replace(/\s+Component Diagram$/i, "")
    .replace(/\s+Class \/ Structural Diagram$/i, "")
    .replace(/\s+Sequence Diagram$/i, "")
    .replace(/\s+Deployment Diagram$/i, "")
    .replace(/\s+Technical Hotspot$/i, "")
    .trim();
}

function dedupeDiagramLinks(links: EngineeringDiagramLink[]): EngineeringDiagramLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.id)) return false;
    seen.add(link.id);
    return true;
  });
}

function samePackage(left: EngineeringDiagramDocument, right: EngineeringDiagramDocument): boolean {
  return Boolean(left.scope.packageId && right.scope.packageId && left.scope.packageId === right.scope.packageId);
}

function samePath(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && normalizePathForCompare(left) === normalizePathForCompare(right));
}

function samePathFamily(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}/`)
    || normalizedRight.startsWith(`${normalizedLeft}/`);
}

function normalizePathForCompare(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function engineeringCategory(
  kind: EngineeringDiagramKind,
  title: string,
  directoryName: string,
  summary: string,
  items: EngineeringDiagramDocument[]
): EngineeringDiagramCategory {
  const directory = `docs/engineering/${directoryName}`;
  return {
    id: `engineering:category:${kind}`,
    kind,
    title,
    directory,
    mapDocPath: `${directory}/${directoryName}-maps.md`,
    mapHtmlPath: `${directory}/${directoryName}-maps.html`,
    summary,
    count: items.length,
    items
  };
}

function engineeringPackageDiagram(item: EngineeringPackage): EngineeringDiagramDocument {
  const slug = diagramSlug(item.title);
  const base = `docs/engineering/package-diagrams/${slug}/package-diagram`;
  return {
    id: `engineering:diagram:package:${slug}`,
    kind: "package",
    title: `模块边界：${item.title}`,
    summary: `解释 ${item.title} 的包/模块边界、文件数量、符号数量和跨模块依赖。`,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: item.id,
    status: "candidate",
    confidence: item.confidence,
    mermaidKind: "flowchart",
    mermaid: renderSinglePackageMermaid(item),
    readingGuide: packageReadingGuide(item),
    technicalAnalysis: packageTechnicalAnalysis(item),
    businessRelation: packageBusinessRelation(item),
    governanceNotes: packageGovernanceNotes(item),
    coverage: [
      `模块路径：${item.path}`,
      `文件数：${item.fileCount}`,
      `符号数：${item.nodeCount}`,
      `被其他模块依赖或调用：${item.incoming}`,
      `依赖或调用外部模块：${item.outgoing}`
    ],
    evidencePaths: item.evidencePaths,
    questions: item.dependencies.length ? [] : ["当前仓库证据没有观察到跨模块依赖；因此该模块暂按相对独立边界处理，置信度保持为候选。"],
    scope: { packageId: item.path, filePath: item.path },
    drilldowns: []
  };
}

function engineeringComponentDiagram(item: EngineeringComponent): EngineeringDiagramDocument {
  const slug = diagramSlug(`${item.packageId}-${item.title}`);
  const base = `docs/engineering/component-diagrams/${slug}/component-diagram`;
  return {
    id: `engineering:diagram:component:${slug}`,
    kind: "component",
    title: `${engineeringComponentTitlePrefix(item)}：${item.title}`,
    summary: item.summary,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: item.id,
    status: "candidate",
    confidence: item.confidence,
    mermaidKind: "flowchart",
    mermaid: renderSingleComponentMermaid(item),
    readingGuide: componentReadingGuide(item),
    technicalAnalysis: componentTechnicalAnalysis(item),
    businessRelation: componentBusinessRelation(item),
    governanceNotes: componentGovernanceNotes(item),
    coverage: [
      `组件类型：${item.kind}`,
      `所属模块：${item.packageId}`,
      `代码锚点：${codeAnchorText(item.filePath, item.line)}`,
      relationEvidenceText(item, "被复用/被依赖迹象"),
      relationEvidenceText(item, "外部协作/编排迹象")
    ],
    evidencePaths: [codeAnchorText(item.filePath, item.line)],
    questions: item.fanIn + item.fanOut > 20 ? ["该组件协作压力较高；当前文档按候选编排中心或公共接口处理，并通过下钻图说明它的职责证据。"] : [],
    scope: { packageId: item.packageId, filePath: item.filePath },
    drilldowns: []
  };
}

function engineeringDeploymentDiagram(item: EngineeringDeploymentNode): EngineeringDiagramDocument {
  const slug = diagramSlug(`${item.kind}-${item.title}`);
  const base = `docs/engineering/deployment-diagrams/${slug}/deployment-diagram`;
  return {
    id: `engineering:diagram:deployment:${slug}`,
    kind: "deployment",
    title: `${deploymentKindLabel(item.kind)}：${deploymentScopeTitle(item.filePath)}`,
    summary: item.summary,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: item.id,
    status: "candidate",
    confidence: item.confidence,
    mermaidKind: "flowchart",
    mermaid: renderSingleDeploymentMermaid(item),
    readingGuide: deploymentReadingGuide(item),
    technicalAnalysis: deploymentTechnicalAnalysis(item),
    businessRelation: deploymentBusinessRelation(item),
    governanceNotes: deploymentGovernanceNotes(item),
    coverage: [
      `运行节点类型：${item.kind}`,
      `证据文件：${item.filePath}`
    ],
    evidencePaths: [item.filePath],
    questions: [],
    scope: { packageId: moduleIdForPath(item.filePath), filePath: item.filePath },
    drilldowns: []
  };
}

function buildClassStructuralDiagramDocuments(model: EngineeringComplexityModel): EngineeringDiagramDocument[] {
  return model.structuralSlices
    .slice(0, 18)
    .map((slice) => {
      const slug = diagramSlug(slice.sliceId);
      const base = `docs/engineering/class-structural-diagrams/${slug}/class-structural-diagram`;
      const document: EngineeringDiagramDocument = {
        id: `engineering:diagram:class-structural:${slug}`,
        kind: "class_structural",
        title: slice.title,
        summary: slice.summary,
        docPath: `${base}.md`,
        htmlPath: `${base}.html`,
        anchor: `engineering:class-structural:${slug}`,
        status: "candidate",
        confidence: slice.confidence,
        mermaidKind: "classDiagram",
        mermaid: renderClassStructuralMermaid(slice),
        readingGuide: classStructuralReadingGuide(slice),
        technicalAnalysis: classStructuralTechnicalAnalysis(slice),
        businessRelation: classStructuralBusinessRelation(slice),
        governanceNotes: classStructuralGovernanceNotes(slice),
        coverage: [
          `结构切片：${slice.sliceId}`,
          `候选业务/技术语境：${slice.structuralContext}`,
          `所属工程边界：${slice.packageId}`,
          `候选结构对象数：${slice.components.length}`,
          `候选结构关系数：${slice.relations.length}`,
          ...slice.components.slice(0, 8).map((component) => `对象：${classDiagramDisplayName(component)} (${component.kind})`)
        ],
        evidencePaths: slice.evidencePaths,
        questions: ["该结构切片来自本地仓库证据；当前未发现足够 Trace 证据把它绑定到唯一业务故事，因此只作为软件结构模型候选视角。"],
        scope: { packageId: slice.packageId, filePath: slice.sliceId },
        drilldowns: []
      };
      document.elements = slice.components.slice(0, 12).map((component) => engineeringElement(
        document,
        mermaidClassId(classDiagramDisplayName(component)),
        classDiagramDisplayName(component),
        "component",
        classStructuralComponentElementExplanation(document, slice, component),
        []
      ));
      return document;
    });
}

function engineeringSequenceDiagram(item: EngineeringRuntimeFlow): EngineeringDiagramDocument {
  const slug = diagramSlug(`${item.source}-${item.edgeKind}-${item.target}`);
  const base = `docs/engineering/sequence-diagrams/${slug}/sequence-diagram`;
  return {
    id: `engineering:diagram:sequence:${slug}`,
    kind: "sequence",
    title: `动态协作：${item.source} ${sequenceEdgeLabel(item.edgeKind)} ${item.target}`,
    summary: item.summary,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: item.id,
    status: "candidate",
    confidence: item.confidence,
    mermaidKind: "sequenceDiagram",
    mermaid: renderSingleSequenceMermaid(item),
    readingGuide: sequenceReadingGuide(item),
    technicalAnalysis: sequenceTechnicalAnalysis(item),
    businessRelation: sequenceBusinessRelation(item),
    governanceNotes: sequenceGovernanceNotes(item),
    coverage: [
      `交互类型：${item.edgeKind}`,
      `来源：${item.sourcePath}`,
      `目标：${item.targetPath}`,
      `所属模块：${item.packagePath}`
    ],
    evidencePaths: [item.sourcePath, item.targetPath],
    questions: item.edgeKind === "import" ? ["当前证据只是 import 关系，不能证明运行时顺序；因此该图仅作为静态依赖投影，不作为真正 Sequence 调用链。"] : [],
    scope: {
      packageId: item.packagePath,
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      targetPackageId: moduleIdForPath(item.targetPath),
      sourceName: item.source,
      targetName: item.target
    },
    drilldowns: []
  };
}

function engineeringHotspotDocument(item: EngineeringHotspot): EngineeringDiagramDocument {
  const slug = diagramSlug(`${hotspotSlugKind(item.kind)}-${item.title}`);
  const base = `docs/engineering/technical-hotspots/${slug}/technical-hotspot`;
  return {
    id: `engineering:diagram:technical-hotspot:${slug}`,
    kind: "technical_hotspot",
    title: `${item.title} 技术热点`,
    summary: item.summary,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: item.id,
    status: "candidate",
    confidence: item.confidence,
    mermaidKind: "flowchart",
    mermaid: renderSingleHotspotMermaid(item),
    readingGuide: hotspotReadingGuide(item),
    technicalAnalysis: hotspotTechnicalAnalysis(item),
    businessRelation: hotspotBusinessRelation(item),
    governanceNotes: hotspotGovernanceNotes(item),
    coverage: [
      `热点类型：${hotspotKindLabel(item.kind)}`,
      `目标：${item.targetPath}`,
      `复杂度信号：${hotspotSignalLabel(item)}`
    ],
    evidencePaths: item.evidencePaths,
    questions: ["该热点只是候选复杂度信号；当前文档只记录影响面和证据位置，不把它升级为已确认缺陷。"],
    scope: { packageId: moduleIdForPath(item.targetPath), filePath: item.targetPath },
    drilldowns: []
  };
}

function packageReadingGuide(item: EngineeringPackage): string[] {
  return [
    `这张 Package Diagram 以 ${item.title} 为中心，展示它作为工程模块边界时观察到的文件规模、符号规模和跨模块依赖。`,
    "图中的箭头表示本地仓库证据观察到的跨模块关系，主要用于理解技术依赖方向；它不是业务流程顺序，也不是运行时消息时序。",
    item.dependencies.length
      ? `当前观察到的主要外部依赖包括：${item.dependencies.slice(0, 6).join("、")}。`
      : "当前没有观察到明确的外部模块依赖，这可能表示模块相对独立，也可能表示扫描粒度尚不足。"
  ];
}

function packageTechnicalAnalysis(item: EngineeringPackage): string[] {
  const pressure = item.outgoing > item.incoming ? "依赖外部模块更多" : item.incoming > item.outgoing ? "被其他模块依赖更多" : "复用迹象和外部协作迹象相对接近";
  return [
    `${item.title} 当前包含 ${item.fileCount} 个文件和 ${item.nodeCount} 个符号，属于软件结构模型识别出的技术组织边界。`,
    `跨模块关系呈现为：被其它模块引用或调用 ${item.incoming} 次，主动依赖或调用外部模块 ${item.outgoing} 次，因此它${pressure}。`,
    item.outgoing > 30
      ? "较多外部依赖可能说明该模块承担编排、聚合或桥接多处能力的职责；当前按候选技术耦合中心处理。"
      : "当前对外依赖未形成明显异常，但仍应结合具体业务入口判断依赖方向是否稳定。"
  ];
}

function packageBusinessRelation(item: EngineeringPackage): string[] {
  return [
    `${item.title} 不是业务故事本身，而是业务能力落地时可能经过的技术边界。`,
    `如果组织/过程模型中某个 Use Case 的证据、入口或下钻图落在 ${item.path}，该 Use Case 应当反向链接到这张 Package Diagram，说明业务故事由哪个工程模块承载。`,
    "当前关联仍是 CANDIDATE：这里只能根据仓库证据解释技术边界，不能替代组织/过程模型对业务故事、参与者和业务目标的确认。"
  ];
}

function packageGovernanceNotes(item: EngineeringPackage): string[] {
  return [
    "新增功能时，优先确认它属于该模块的稳定职责，而不是因为调用方便而落入该模块。",
    item.outgoing > 30
      ? "如果未来多次变更都增加该模块的外部依赖，应考虑拆分端口、适配器或应用服务边界。"
      : "保持该模块的依赖方向可解释，避免形成隐式公共工具箱。",
    "当业务 Use Case 文档引用该模块时，应在 Use Case 下钻文档中记录具体入口、调用链或配置证据。"
  ];
}

function componentReadingGuide(item: EngineeringComponent): string[] {
  return [
    `这张 Component Diagram 关注 ${item.title} 这个 ${item.kind}，展示它所在文件、所属模块以及复用迹象、外部协作迹象。`,
    "复用迹象用于判断它是否是共享核心或公共接口；外部协作迹象用于判断它是否承担编排、聚合或桥接职责。",
    `代码锚点是 ${codeAnchorText(item.filePath, item.line)}。`
  ];
}

function componentTechnicalAnalysis(item: EngineeringComponent): string[] {
  const role = item.fanOut > item.fanIn ? "更像编排者或聚合入口" : item.fanIn > item.fanOut ? "更像共享接口、公共能力或被复用对象" : "复用与外部协作迹象相对接近";
  return [
    `${item.title} 在当前仓库证据中呈现为：${relationEvidenceText(item, "被复用/被依赖迹象")}，${relationEvidenceText(item, "外部协作/编排迹象")}，因此它在技术结构中${role}。`,
    item.fanOut > 80
      ? "过多对外依赖往往意味着该组件连接过多职责，阅读、测试和变更影响面都会扩大。"
      : item.fanIn > 80
        ? "被大量对象引用或调用往往意味着该组件是共享核心，任何修改都需要谨慎评估兼容性。"
        : "当前协作压力需要结合具体业务入口判断，单独数字不足以确认设计问题。",
    `所属模块 ${item.packageId} 决定了它更适合作为局部实现细节还是跨模块协作点。`
  ];
}

function relationEvidenceText(item: EngineeringComponent, label: string): string {
  const count = label.includes("复用") ? item.fanIn : item.fanOut;
  const direction = label.includes("复用") ? "incoming" : "outgoing";
  return `${label}：${relationTextFromCount(count, direction)}`;
}

function componentBusinessRelation(item: EngineeringComponent): string[] {
  return [
    `${item.title} 可能是某些业务故事执行过程中的技术节点，但它本身不是业务用例。`,
    businessHintFromPath(item.filePath),
    "如果某个 Use Case 的 Activity、Sequence 或 Class Collaboration 图引用该组件，应在组织/过程模型中明确它承担的是入口、编排、领域规则、适配器还是基础设施职责。"
  ];
}

function componentGovernanceNotes(item: EngineeringComponent): string[] {
  return [
    "在修改该组件前，优先查找它被哪些 Use Case 下钻文档引用，避免只看局部代码而忽略业务语义。",
    item.fanIn + item.fanOut > 120
      ? "该组件协作压力较高，应在对应 Sequence Diagram 或 Class / Structural Diagram 中解释具体协作边界。"
      : "可以把该组件作为技术解释锚点，但不要把它直接等同于业务能力。",
    "如果该组件承载业务规则，应把规则写回组织/过程模型或对应领域文档，而不仅保留在仓库证据中。"
  ];
}

function deploymentReadingGuide(item: EngineeringDeploymentNode): string[] {
  return [
    `这张 Deployment Diagram 关注 ${item.title}，证据来自 ${item.filePath}。`,
    "它解释的是工程如何被构建、运行、打包、发布或接入 CI，而不是业务流程图。",
    `节点类型被识别为 ${item.kind}，用于判断它属于桌面壳、Node 包、Rust 运行时、前端构建还是 CI/部署配置。`
  ];
}

function deploymentTechnicalAnalysis(item: EngineeringDeploymentNode): string[] {
  return [
    item.summary,
    "部署/运行配置是技术复杂度的重要来源，因为它影响本地开发、打包、发布和跨环境一致性。",
    "如果这里发生变化，应同时检查对应的构建命令、桌面权限、运行时依赖和安装包产物。"
  ];
}

function deploymentBusinessRelation(item: EngineeringDeploymentNode): string[] {
  return [
    "Deployment Diagram 与业务故事的关系通常是间接的：它决定业务能力能否被正确构建、运行、发布和交付给用户。",
    "当某个业务 Use Case 依赖桌面能力、文件权限、外部命令或模型配置时，应把对应的 deployment/runtime node 作为工程约束引用到该 Use Case 的下钻文档。",
    "如果组织/过程模型中没有 Use Case 证据引用该节点，它只保留为部署/运行约束，不写成业务结论。"
  ];
}

function deploymentGovernanceNotes(item: EngineeringDeploymentNode): string[] {
  return [
    "修改运行或部署配置时，应记录程序版本、Git 版本和影响范围，避免用户只能从 diff 中理解变化。",
    "如果配置变化会改变用户可见能力，应同步更新组织/过程模型中的相关 Use Case 或产品文档。",
    "对 Tauri、CI、打包脚本和 runtime package 的变化，应优先补充验证命令和安装包验证结果。"
  ];
}

function classStructuralReadingGuide(slice: EngineeringStructuralSlice): string[] {
  return [
    `这张 Class / Structural Diagram 聚焦 ${slice.sliceId} 这一结构切片，而不是整个 ${slice.packageId} 顶层目录。`,
    `它只放入类、接口、枚举或结构类型；方法级高引用对象会进入 Component/Hotspot，不再混入结构协作图。`,
    `候选语境是「${slice.structuralContext}」。读图时先确认这些对象是否共同承载同一个业务能力、共享支撑机制或适配边界。`,
    slice.relations.length
      ? `图中已绘制 ${slice.relations.length} 条类级关系，主要来自继承、接口实现、创建或引用证据。`
      : "当前没有足够类级关系证据，因此图只保留候选切片对象，并降低为结构候选视角。"
  ];
}

function classStructuralTechnicalAnalysis(slice: EngineeringStructuralSlice): string[] {
  const interfaceCount = slice.components.filter((component) => component.kind === "interface" || component.kind === "trait").length;
  const classCount = slice.components.filter((component) => component.kind === "class" || component.kind === "struct").length;
  return [
    `${slice.sliceId} 当前包含 ${classCount} 个类/结构和 ${interfaceCount} 个接口/trait 候选对象。`,
    slice.relations.length ? `当前观察到 ${slice.relations.length} 条类级结构关系。` : "当前缺少类级关系证据，不能把同目录对象直接解释成稳定协作。",
    "这张图的解释目标是结构职责和边界：哪些对象像领域模型、哪些对象像接口契约、哪些对象像策略/适配器或共享支撑。",
    "如果图中对象只是同目录但没有共同业务语境或结构关系，生成流程必须拆分或降级为 Component/Hotspot，而不是继续保留为 Class / Structural Diagram。"
  ];
}

function classStructuralBusinessRelation(slice: EngineeringStructuralSlice): string[] {
  return [
    `该图候选关联「${slice.structuralContext}」，应该回连到组织/过程模型中对应 Use Case 的 Class Collaboration、Activity 或 Sequence 下钻图。`,
    "软件结构模型不能只说“这里有很多类”，而要说明这些类如何让业务变化更容易或更困难。",
    `候选对象包括：${slice.components.slice(0, 6).map((item) => readableClassName(item.title)).join("、") || "暂无"}。`
  ];
}

function classStructuralGovernanceNotes(slice: EngineeringStructuralSlice): string[] {
  return [
    "不要把顶层 layer、目录名或关系数量当作结构图的解释对象；结构图必须围绕可命名的业务/技术语境。",
    "当某个对象脱离当前语境、没有关系说明或只是高引用工具类时，应从该图移除，转入 Component/Hotspot 或共享支撑切片。",
    `变更 ${slice.sliceId} 时，同步维护它和相关 Use Case、Component、Sequence 的引用关系。`
  ];
}

function sequenceReadingGuide(item: EngineeringRuntimeFlow): string[] {
  return [
    `这张 Sequence Diagram 聚焦 ${item.source} 调用 ${item.target} 的技术协作片段。`,
    "它描述的是一个局部运行片段，不一定等同于完整业务流程。",
    "当前关系来自本地调用证据；若没有 Use Case Trace，它只表示局部协作片段，不直接等同于主成功场景、回调、补偿或失败路径。"
  ];
}

function sequenceTechnicalAnalysis(item: EngineeringRuntimeFlow): string[] {
  return [
    `${item.sourcePath} 与 ${item.targetPath} 之间存在 ${item.edgeKind} 关系，所属技术边界是 ${item.packagePath}。`,
    "Sequence Diagram 用于解释运行时或协作顺序，适合承接那些从 Package/Component 图看不清的动态行为。",
    "如果未来证据显示存在异步消息、回调、超时或失败补偿，应为同一业务/技术场景拆出多张 sequence，而不是塞进一张大图。"
  ];
}

function sequenceBusinessRelation(item: EngineeringRuntimeFlow): string[] {
  return [
    "业务 Use Case 的主成功路径、失败路径和回调路径最终会落到若干技术 sequence 片段上。",
    `当前片段可能解释某个业务故事中的技术执行步骤；如果没有 Use Case Trace，它只作为软件结构模型中的局部协作片段。`,
    "如果它被确认属于某个 Use Case，应在 docs/design 对应下钻 Sequence Diagram 中链接到这份工程 sequence 文档。"
  ];
}

function sequenceGovernanceNotes(item: EngineeringRuntimeFlow): string[] {
  return [
    "不要只根据单条关系判断完整调用链；需要结合前后游关系补全场景。",
    "当 sequence 涉及外部系统、模型调用、文件写入或 Git 操作时，应补充失败路径和重试/补偿说明。",
    "如果该 sequence 支撑用户可见功能，应同步维护组织/过程模型的业务下钻图。"
  ];
}

function hotspotReadingGuide(item: EngineeringHotspot): string[] {
  return [
    `这张技术热点图解释 ${item.title}，热点类型是 ${hotspotKindLabel(item.kind)}。`,
    "热点是软件结构模型中的候选提醒：它提示复杂度集中点，但不直接等同于缺陷或必须整改项。",
    `目标位置是 ${item.targetPath}，当前复杂度信号是：${hotspotSignalLabel(item)}。`
  ];
}

function hotspotTechnicalAnalysis(item: EngineeringHotspot): string[] {
  return [
    item.summary,
    item.kind === "large_file"
      ? "大文件会提高阅读、评审、冲突合并和局部修改的成本，尤其不利于 agent 精准定位上下文。"
      : item.kind === "high_fan_in"
        ? "被多个对象依赖意味着该目标修改时更容易产生兼容性和回归风险。"
        : item.kind === "high_fan_out"
          ? "依赖多个外部对象意味着该目标可能承担了过宽的编排或聚合职责。"
          : "该热点反映了依赖聚集或扫描异常，需要结合上下文判断真实影响。",
    "热点分析需要和 Package、Component、Sequence 图交叉阅读，避免把单一指标误判为设计结论。"
  ];
}

function hotspotKindLabel(kind: EngineeringHotspot["kind"]): string {
  if (kind === "large_file") return "大文件";
  if (kind === "high_fan_in") return "被广泛复用的候选对象";
  if (kind === "high_fan_out") return "承担外部协作的候选对象";
  if (kind === "dependency_cluster") return "依赖聚集边界";
  return "仓库扫描提醒";
}

function hotspotSlugKind(kind: EngineeringHotspot["kind"]): string {
  if (kind === "large_file") return "large-file";
  if (kind === "high_fan_in") return "reuse-pressure";
  if (kind === "high_fan_out") return "collaboration-pressure";
  if (kind === "dependency_cluster") return "dependency-cluster";
  return "repository-warning";
}

function hotspotSignalLabel(item: EngineeringHotspot): string {
  if (item.kind === "large_file") return `约 ${item.score} 行代码或文档`;
  if (item.kind === "high_fan_in") return "被多处代码引用或调用";
  if (item.kind === "high_fan_out") return "连接多个外部对象或能力";
  if (item.kind === "dependency_cluster") return "依赖多个外部工程边界";
  return "本地仓库扫描发现需要解释的工程信号";
}

function hotspotBusinessRelation(item: EngineeringHotspot): string[] {
  return [
    "技术热点会间接影响业务交付：它可能让某些 Use Case 的变更成本、验证成本和回归风险升高。",
    `如果 ${item.targetPath} 被某个 Use Case 的证据引用，那么这个热点应出现在该 Use Case 的风险或治理说明中。`,
    "如果组织/过程模型没有 Use Case 证据引用该热点，它只作为工程治理候选，不作为业务风险结论。"
  ];
}

function hotspotGovernanceNotes(item: EngineeringHotspot): string[] {
  return [
    "不要因为热点存在就立即重构；先确认它影响了哪些业务故事、哪些变更频率最高、哪些测试覆盖最薄弱。",
    "如果决定治理，应把治理目标拆成可验证的原子提交，并记录语义化版本变化。",
    "治理完成后，应重新生成软件结构模型文档，确认复杂度候选点是否被解释或缓解，并把结论写入 changelog。"
  ];
}

function businessHintFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/pages/")) return "它位于页面层，更可能靠近用户操作入口或业务故事的 UI 触发点。";
  if (normalized.includes("runtime-cli")) return "它位于 runtime-cli，更可能靠近 Praxis 自身的工程操作、命令入口或 agent 工作流。";
  if (normalized.includes("/packages/")) return "它位于 packages 工作区，更可能是多个业务/工程入口复用的技术能力。";
  if (normalized.includes("src-tauri")) return "它位于 Tauri/Rust 桌面壳附近，业务关联通常体现为桌面权限、文件访问、命令调用或打包运行约束。";
  return "从路径上无法直接判断业务角色，需要结合组织/过程模型的 Use Case 证据确认。";
}

function renderEngineeringRootMapMarkdown(index: EngineeringMapIndex): string {
  return [
    "# Engineering Maps",
    "",
    ENGINEERING_MAP_MANAGED_START,
    "",
    "## 定位",
    "",
    "软件结构模型的根索引。这里仅负责导航、聚合和版本时间线；具体 UML 与工程解释必须落在各图种目录和具体 diagram 文档中。",
    "",
    "## 元数据",
    "",
    `项目版本：${index.projectVersion}`,
    `Git 分支：${index.git.branch}`,
    `Git 提交：${index.git.commit}`,
    `Git 工作区状态：${index.git.dirty ? "dirty" : "clean"}`,
    `更新于：${index.generatedAt}`,
    "",
    "## 图种索引",
    "",
    "| 图种 | 数量 | Maps | 说明 |",
    "| --- | ---: | --- | --- |",
    ...index.categories.map((category) =>
      `| ${escapeMarkdownTable(category.title)} | ${category.count} | [${escapeMarkdownTable(category.mapDocPath)}](${category.mapDocPath}) | ${escapeMarkdownTable(engineeringCategoryCardExplanation(category))} |`
    ),
    "",
    "## UML 下钻层级规则",
    "",
    ...index.hierarchy.flatMap((rule) => [
      `### ${rule.parentKind}`,
      "",
      `- 可下钻图种：${rule.childKinds.join("、")}`,
      `- 原因：${rule.rationale}`,
      ""
    ]),
    "## 目录树",
    "",
    ...index.categories.flatMap((category) => [
      `### ${category.title}`,
      "",
      ...(category.items.length ? category.items.map((item) =>
      `- [${escapeMarkdownTable(item.title)}](${item.docPath}) - ${escapeMarkdownTable(engineeringDiagramCardExplanation(item))}`
      ) : ["- 当前没有基于证据生成的具体图。"]),
      ""
    ]),
    "## 地图变更记录",
    "",
    `### ${index.projectVersion} - ${index.generatedAt}`,
    "",
    "变更类型：DISCOVERY",
    `Git 分支：${index.git.branch}`,
    `Git 提交：${index.git.commit}`,
    `Git 工作区状态：${index.git.dirty ? "dirty" : "clean"}`,
    "",
    `- 更新软件结构模型根索引，并拆分 ${index.categories.reduce((sum, category) => sum + category.count, 0)} 个具体工程图文档。`,
    "",
    ENGINEERING_MAP_MANAGED_END,
    ""
  ].join("\n");
}

function renderEngineeringRootMapHtml(index: EngineeringMapIndex, model: EngineeringComplexityModel): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <title>Engineering Maps</title>",
    "</head>",
    "<body>",
    `<main class="praxis-engineering-map" data-praxis-anchor="engineering-map:root" data-praxis-kind="engineering_root_map" data-praxis-status="candidate" data-praxis-confidence="high">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Software Structure Model</p>",
    "    <h1>Engineering Maps</h1>",
    "    <p>根索引只负责软件结构文档树、版本和导航；具体 UML 与解释位于各图种目录。</p>",
    "    <div class=\"meta-row\">",
    `      <span>项目版本：${escapeHtmlText(index.projectVersion)}</span>`,
    `      <span>Git：${escapeHtmlText(index.git.shortCommit)} / ${escapeHtmlText(index.git.branch)} / ${index.git.dirty ? "dirty" : "clean"}</span>`,
    `      <span>更新于：<time datetime="${escapeHtmlAttr(index.generatedAt)}">${escapeHtmlText(index.generatedAt)}</time></span>`,
    "    </div>",
    "  </header>",
    renderHtmlMetricIndex(model),
    "  <section class=\"semantic-layer engineering-root-tree\" data-praxis-anchor=\"engineering:document-tree\" data-praxis-kind=\"engineering_document_tree\">",
    "    <h2>软件结构模型文档树</h2>",
    "    <p>每个图种拥有自己的 maps 文档；每张具体图拥有独立 markdown/html 文档。</p>",
    "    <div class=\"layer-grid\">",
    ...index.categories.map((category) => renderEngineeringCategoryCard(category)),
    "    </div>",
    "  </section>",
    `  <script type="application/json" id="praxis-engineering-map-index">${escapeScriptJson(JSON.stringify(index))}</script>`,
    `  <script type="application/json" id="praxis-engineering-complexity-model">${escapeScriptJson(JSON.stringify(engineeringModelUiProjection(model)))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function engineeringModelUiProjection(model: EngineeringComplexityModel): unknown {
  return {
    schemaVersion: model.schemaVersion,
    root: model.root,
    generatedAt: model.generatedAt,
    source: "repository_evidence",
    projectVersion: model.projectVersion,
    git: model.git,
    summary: model.summary,
    packages: model.packages.map((item) => ({
      id: `engineering:package:${safeId(item.path)}`,
      title: item.title,
      path: item.path,
      fileCount: item.fileCount,
      nodeCount: item.nodeCount,
      incoming: item.incoming,
      outgoing: item.outgoing
    })),
    components: model.components.map((item) => ({
      id: `engineering:component:${safeId(`${item.packageId}:${item.title}:${item.filePath}:${item.line ?? ""}`)}`,
      title: item.title,
      kind: item.kind,
      filePath: item.filePath,
      line: item.line,
      reusePressure: item.fanIn,
      externalCollaborationPressure: item.fanOut
    })),
    runtimeFlows: model.runtimeFlows.map((item) => ({
      id: `engineering:runtime-flow:${safeId(`${item.sourcePath}:${item.targetPath}:${item.edgeKind}`)}`,
      title: item.title,
      edgeKind: item.edgeKind,
      sourcePath: item.sourcePath,
      targetPath: item.targetPath
    })),
    deploymentNodes: model.deploymentNodes.map((item) => ({
      id: `engineering:deployment:${safeId(`${item.kind}:${item.filePath}`)}`,
      title: item.title,
      kind: item.kind,
      filePath: item.filePath
    })),
    hotspots: model.hotspots.map((item) => ({
      id: `engineering:hotspot:${safeId(`${hotspotSlugKind(item.kind)}:${item.targetPath}`)}`,
      title: item.title,
      kind: hotspotKindLabel(item.kind),
      targetPath: item.targetPath,
      signal: hotspotSignalLabel(item),
      summary: item.summary
    }))
  };
}

function renderEngineeringCompatibilityMarkdown(index: EngineeringMapIndex): string {
  return [
    "# Technical Complexity Maps",
    "",
    "> 兼容入口：软件结构模型的长期权威入口已经迁移到 `docs/engineering/engineering-maps.md`，并由 `docs/models/models-map.md` 统一索引。",
    "",
    `- 根索引：[${ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH}](${ENGINEERING_ROOT_MAP_DOC_RELATIVE_PATH})`,
    `- 根 HTML：[${ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH}](${ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH})`,
    "",
    "## 图种索引",
    "",
    ...index.categories.map((category) => `- ${category.title}: ${category.count} 个文档，maps: ${category.mapDocPath}`),
    ""
  ].join("\n");
}

function renderEngineeringCompatibilityHtml(index: EngineeringMapIndex, model: EngineeringComplexityModel): string {
  return renderEngineeringRootMapHtml(index, model).replace("<title>Engineering Maps</title>", "<title>Technical Complexity Maps Compatibility</title>");
}

function renderEngineeringCategoryMapMarkdown(category: EngineeringDiagramCategory, index: EngineeringMapIndex): string {
  return [
    `# ${category.title}`,
    "",
    `根索引：[${index.rootDocPath}](../engineering-maps.md)`,
    "",
    `说明：${category.summary}`,
    "",
    "| Diagram | Confidence | Document | HTML | Summary |",
    "| --- | --- | --- | --- | --- |",
    ...(category.items.length ? category.items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${item.confidence} | [md](${relativeLinkFrom(category.mapDocPath, item.docPath)}) | [html](${relativeLinkFrom(category.mapDocPath, item.htmlPath)}) | ${escapeMarkdownTable(engineeringDiagramCardExplanation(item))} |`
    ) : ["| _无_ | - | - | - | 当前没有基于证据生成的具体图。 |"]),
    "",
    "## 地图变更记录",
    "",
    `### ${index.projectVersion} - ${index.generatedAt}`,
    "",
    `- 更新 ${category.title} maps，当前包含 ${category.count} 个具体文档。`,
    ""
  ].join("\n");
}

function renderEngineeringCategoryMapHtml(category: EngineeringDiagramCategory, index: EngineeringMapIndex): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    `  <title>${escapeHtmlText(category.title)}</title>`,
    "</head>",
    "<body>",
    `<main class="praxis-engineering-map" data-praxis-anchor="${escapeHtmlAttr(category.id)}" data-praxis-kind="engineering_category_map" data-praxis-status="candidate" data-praxis-confidence="high">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Software Structure Model</p>",
    `    <h1>${escapeHtmlText(category.title)}</h1>`,
    `    <p>${escapeHtmlText(category.summary)}</p>`,
    "  </header>",
    "  <section class=\"semantic-layer engineering-category-items\" data-praxis-anchor=\"engineering:category-items\" data-praxis-kind=\"engineering_category_items\">",
    "    <div class=\"layer-grid\">",
    ...(category.items.length ? category.items.map((item) => renderEngineeringDiagramCard(item)) : ["      <p>当前没有基于证据生成的具体图。</p>"]),
    "    </div>",
    "  </section>",
    `  <script type="application/json" id="praxis-engineering-map-index">${escapeScriptJson(JSON.stringify({ ...index, categories: [category] }))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderEngineeringDiagramDocumentMarkdown(
  item: EngineeringDiagramDocument,
  category: EngineeringDiagramCategory,
  index: EngineeringMapIndex
): string {
  return [
    `# ${item.title}`,
    "",
    `图种：${category.title}`,
    `状态：${item.status}`,
    `置信度：${item.confidence}`,
    `项目版本：${index.projectVersion}`,
    `Git：${index.git.shortCommit} / ${index.git.branch} / ${index.git.dirty ? "dirty" : "clean"}`,
    `更新于：${index.generatedAt}`,
    "",
    "## 定位",
    "",
    item.summary,
    "",
    "## 图的读法",
    "",
    ...renderMarkdownBullets(item.readingGuide),
    "",
    "## 技术复杂度分析",
    "",
    ...renderMarkdownBullets(item.technicalAnalysis),
    "",
    "## 与业务复杂度的关联",
    "",
    ...renderMarkdownBullets(item.businessRelation),
    "",
    "## 治理建议",
    "",
    ...renderMarkdownBullets(item.governanceNotes),
    "",
    "## UML / 技术图",
    "",
    "```mermaid",
    item.mermaid,
    "```",
    "",
    "## 覆盖范围",
    "",
    ...(item.coverage.length ? item.coverage.map((line) => `- ${line}`) : ["- 当前文档未记录覆盖范围。"]),
    "",
    "## 图内语义元素下钻",
    "",
    ...(item.elements?.length ? item.elements.flatMap((element) => [
      `### ${element.label}`,
      "",
      `- 元素类型：${element.kind}`,
      `- 说明：${element.summary}`,
      `- 技术角色：${element.role}`,
      `- 为什么出现：${element.whyItExists}`,
      `- 关系意义：${element.relationshipMeaning}`,
      `- 下钻意图：${element.drilldownIntent}`,
      `- 业务关联：${element.businessRelevance}`,
      `- 变更影响：${element.changeImpact}`,
      `- 置信度：${element.confidence}`,
      ...(element.evidence.length ? ["- 证据：", ...element.evidence.map((line) => `  - ${line}`)] : ["- 证据：当前没有更细证据。"]),
      ...(element.risks.length ? ["- 风险：", ...element.risks.map((line) => `  - ${line}`)] : ["- 风险：暂无。"]),
      ...(element.questions.length ? ["- 问题：", ...element.questions.map((line) => `  - ${line}`)] : ["- 问题：暂无。"]),
      ...(element.drilldowns.length
        ? element.drilldowns.map((link) => `- 下钻：[${escapeMarkdownTable(link.title)}](${relativeLinkFrom(item.docPath, link.docPath)}) - ${escapeMarkdownTable(link.reason)}`)
        : ["- 下钻：当前没有根据证据关联到更细图。"]),
      ""
    ]) : ["- 当前文档未记录图内元素级下钻。", ""]),
    "## 可下钻 UML",
    "",
    ...(item.drilldowns.length ? item.drilldowns.map((link) => `- [${escapeMarkdownTable(link.title)}](${relativeLinkFrom(item.docPath, link.docPath)}) - ${escapeMarkdownTable(link.reason)}`) : ["- 当前没有根据证据关联到更细图。"]),
    "",
    "## 证据",
    "",
    ...(item.evidencePaths.length ? item.evidencePaths.map((line) => `- ${line}`) : ["- 当前没有可列出的证据路径。"]),
    "",
    "## 问题",
    "",
    ...(item.questions.length ? item.questions.map((line) => `- ${line}`) : ["- 暂无未决问题。"]),
    "",
    "## 变更记录",
    "",
    `### ${index.projectVersion} - ${index.generatedAt}`,
    "",
    `- 从本地仓库证据生成 ${item.title}。`,
    ""
  ].join("\n");
}

function renderEngineeringDiagramDocumentHtml(
  item: EngineeringDiagramDocument,
  category: EngineeringDiagramCategory,
  index: EngineeringMapIndex
): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    `  <title>${escapeHtmlText(item.title)}</title>`,
    "</head>",
    "<body>",
    `<main class="praxis-engineering-map" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}" data-praxis-kind="engineering_${item.kind}_diagram" data-praxis-status="${item.status}" data-praxis-confidence="${item.confidence}" data-praxis-document-path="${escapeHtmlAttr(item.htmlPath)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(item.drilldowns))}">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Software Structure Model</p>",
    `    <h1>${escapeHtmlText(item.title)}</h1>`,
    `    <p>${escapeHtmlText(item.summary)}</p>`,
    "    <div class=\"meta-row\">",
    `      <span>${escapeHtmlText(category.title)}</span>`,
    `      <span>${escapeHtmlText(item.status)} / ${escapeHtmlText(item.confidence)}</span>`,
    `      <span>${escapeHtmlText(index.projectVersion)} · ${escapeHtmlText(index.git.shortCommit)} / ${escapeHtmlText(index.git.branch)}</span>`,
    "    </div>",
    "  </header>",
    renderHtmlListSection("engineering:reading-guide", "图的读法", item.readingGuide),
    renderHtmlListSection("engineering:technical-analysis", "技术复杂度分析", item.technicalAnalysis),
    renderHtmlListSection("engineering:business-relation", "与业务复杂度的关联", item.businessRelation),
    renderHtmlListSection("engineering:governance-notes", "治理建议", item.governanceNotes),
    "  <section class=\"semantic-layer diagram-section\" data-praxis-anchor=\"engineering:diagram-body\" data-praxis-kind=\"engineering_diagram_body\">",
    "    <h2>UML / 技术图</h2>",
    `    <pre class="mermaid" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}:uml" data-praxis-kind="engineering_${item.kind}_uml" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(item.drilldowns))}">${escapeHtmlText(item.mermaid)}</pre>`,
    "  </section>",
    renderHtmlListSection("engineering:coverage", "覆盖范围", item.coverage),
    renderHtmlElementDrilldownData(item),
    renderHtmlDrilldownSection(item),
    renderHtmlListSection("engineering:evidence", "证据", item.evidencePaths),
    renderHtmlListSection("engineering:questions", "问题", item.questions.length ? item.questions : ["暂无未决问题。"]),
    `  <script type="application/json" id="praxis-engineering-diagram-document">${escapeScriptJson(JSON.stringify(item))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderEngineeringCategoryCard(category: EngineeringDiagramCategory): string {
  const cardSummary = engineeringCategoryCardExplanation(category);
  return [
    `      <article class="layer-card document-entry-card" role="link" tabindex="0" data-praxis-anchor="${escapeHtmlAttr(category.id)}" data-praxis-kind="engineering_category" data-praxis-document-title="${escapeHtmlAttr(category.title)}" data-praxis-document-summary="${escapeHtmlAttr(cardSummary)}" data-praxis-document-md="${escapeHtmlAttr(category.mapDocPath)}" data-praxis-document-html="${escapeHtmlAttr(category.mapHtmlPath)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(category.items.slice(0, 12).map((item) => diagramLink(item, "contains", engineeringDiagramCardExplanation(item)))))}">`,
    `        <h3>${escapeHtmlText(category.title)}</h3>`,
    `        <p>${escapeHtmlText(category.count)} diagrams · ${escapeHtmlText(category.directory)}</p>`,
    `        <p>${escapeHtmlText(cardSummary)}</p>`,
    "      </article>"
  ].join("\n");
}

function renderEngineeringDiagramCard(item: EngineeringDiagramDocument): string {
  const cardSummary = engineeringDiagramCardExplanation(item);
  return [
    `      <article class="layer-card document-entry-card" role="link" tabindex="0" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}" data-praxis-kind="engineering_${item.kind}_diagram" data-praxis-status="${item.status}" data-praxis-confidence="${item.confidence}" data-praxis-document-title="${escapeHtmlAttr(item.title)}" data-praxis-document-summary="${escapeHtmlAttr(cardSummary)}" data-praxis-document-md="${escapeHtmlAttr(item.docPath)}" data-praxis-document-html="${escapeHtmlAttr(item.htmlPath)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(item.drilldowns))}">`,
    `        <h3>${escapeHtmlText(item.title)}</h3>`,
    `        <p>${escapeHtmlText(item.confidence)} · ${escapeHtmlText(engineeringKindDisplayName(item.kind))}</p>`,
    `        <p>${escapeHtmlText(cardSummary)}</p>`,
    "      </article>"
  ].join("\n");
}

function engineeringCategoryCardExplanation(category: EngineeringDiagramCategory): string {
  if (category.kind === "package") {
    return `进入包/模块边界看板，按工程目录查看 ${category.count} 个模块如何承担入口、契约、适配、共享能力、运行装配或基础设施职责，并继续下钻到组件、结构、sequence、部署节点和技术热点。`;
  }
  if (category.kind === "component") {
    return `进入组件看板，查看 ${category.count} 个关键类、函数、React 组件、命令入口或接口对象的职责、被引用/调用关系、对外依赖/调用关系、所属模块和可下钻风险。`;
  }
  if (category.kind === "class_structural") {
    return `进入结构协作看板，按可命名业务/技术语境查看类、接口和值对象如何形成领域模型、策略、端口、适配或共享支撑；它不是按顶层 layer 或关系数量生成的类名列表。`;
  }
  if (category.kind === "sequence") {
    return `进入 Sequence 看板，查看 ${category.count} 条由本地仓库证据观察到的真实调用片段，用动态协作视角补足静态结构图。静态 import/reference 不会被当作时序图。`;
  }
  if (category.kind === "deployment") {
    return `进入运行/部署节点看板，查看构建配置、桌面壳、CLI、包管理、CI 或本地运行入口如何影响工程的启动、打包和交付路径。`;
  }
  if (category.kind === "technical_hotspot") {
    return `进入技术热点看板，查看大文件、被广泛复用对象、外部协作对象、依赖簇或扫描告警为什么会增加阅读、修改、测试和回归成本。`;
  }
  if (category.kind === "state_machine") {
    return `进入状态机看板；只有证据表明确实存在关键状态字段、枚举或迁移语义时才会生成，避免为凑 UML 虚构状态机。`;
  }
  return category.summary;
}

function engineeringDiagramCardExplanation(item: EngineeringDiagramDocument): string {
  const name = cleanDiagramTitle(item.title);
  const drilldownSummary = engineeringDiagramCardDrilldownSummary(item);
  let summary: string;
  if (item.kind === "package") {
    const packageId = item.scope.packageId ?? name;
    summary = `打开 ${packageId} 的包级图，先确认它是什么工程边界，再用文件规模、符号规模、跨模块引用方向和下钻图判断它是入口模块、共享能力、runtime 支撑还是基础设施边界。`;
  } else if (item.kind === "component") {
    const filePath = item.scope.filePath ?? item.scope.packageId ?? "未知文件";
    summary = `打开 ${name} 的组件图，查看它位于 ${filePath} 的哪类技术对象、承担什么职责、被引用/调用关系和对外依赖/调用关系是否形成变更压力，以及它与结构图、sequence 和热点的关系。`;
  } else if (item.kind === "class_structural") {
    const slice = item.scope.filePath ?? item.scope.packageId ?? name;
    summary = `打开 ${name}，查看 ${slice} 中类、接口和值对象是否共同解释一个业务能力、共享支撑机制或适配边界；如果不能解释共同语境，这张图就应该拆分或降级。`;
  } else if (item.kind === "sequence") {
    const source = item.scope.sourceName ?? item.scope.sourcePath ?? "来源";
    const target = item.scope.targetName ?? item.scope.targetPath ?? "目标";
    summary = `打开 ${source} 到 ${target} 的动态协作片段，检查这次调用在相关组件、结构切片和业务下钻中承担什么运行职责。`;
  } else if (item.kind === "deployment") {
    const filePath = item.scope.filePath ?? name;
    summary = `打开 ${name} 的运行/部署节点图，查看 ${filePath} 如何参与启动、构建、配置、桌面壳、CLI、包管理或发布链路。`;
  } else if (item.kind === "technical_hotspot") {
    const target = item.scope.filePath ?? item.scope.packageId ?? name;
    summary = `打开 ${name} 的热点图，查看 ${target} 为什么可能抬高阅读、修改、测试或回归成本，并反向定位相关 package、component、structure 或 sequence。`;
  } else if (item.kind === "state_machine") {
    summary = `打开 ${name} 的状态机图，核对状态字段、状态枚举、迁移事件和失败路径是否都有代码证据支撑。`;
  } else {
    summary = item.summary;
  }
  return drilldownSummary ? `${summary} ${drilldownSummary}` : summary;
}

function engineeringDiagramCardDrilldownSummary(item: EngineeringDiagramDocument): string {
  if (!item.drilldowns.length) return "";
  const counts = new Map<EngineeringDiagramKind, number>();
  for (const link of item.drilldowns) {
    counts.set(link.kind, (counts.get(link.kind) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries())
    .map(([kind, count]) => `${count} 个 ${engineeringKindDisplayName(kind)}`)
    .slice(0, 4);
  return parts.length ? `可继续下钻到 ${parts.join("、")}。` : "";
}

function engineeringKindDisplayName(kind: EngineeringDiagramKind): string {
  if (kind === "package") return "Package Diagram";
  if (kind === "component") return "Component Diagram";
  if (kind === "deployment") return "Deployment Diagram";
  if (kind === "class_structural") return "Class / Structural Diagram";
  if (kind === "sequence") return "Sequence Diagram";
  if (kind === "state_machine") return "State Machine Diagram";
  if (kind === "technical_hotspot") return "Technical Hotspot";
  return kind;
}

function renderHtmlDrilldownSection(item: EngineeringDiagramDocument): string {
  return [
    `  <section class="semantic-layer engineering-drilldowns" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}:drilldowns" data-praxis-kind="engineering_drilldown_options" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(item.drilldowns))}">`,
    "    <h2>可下钻 UML</h2>",
    item.drilldowns.length
      ? "    <div class=\"layer-grid\">"
      : "    <p>当前没有根据证据关联到更细图。</p>",
    ...(item.drilldowns.length ? item.drilldowns.map((link) => [
      `      <article role="link" tabindex="0" class="layer-card document-entry-card" data-praxis-anchor="${escapeHtmlAttr(link.anchor)}" data-praxis-kind="engineering_drilldown_link" data-praxis-document-title="${escapeHtmlAttr(link.title)}" data-praxis-document-summary="${escapeHtmlAttr(link.reason)}" data-praxis-document-md="${escapeHtmlAttr(link.docPath)}" data-praxis-document-html="${escapeHtmlAttr(link.htmlPath)}">`,
      `        <strong>${escapeHtmlText(link.title)}</strong>`,
      `        <span>${escapeHtmlText(link.kind)} · ${escapeHtmlText(link.relation)}</span>`,
      `        <p>${escapeHtmlText(link.reason)}</p>`,
      link.summary ? `        <small>${escapeHtmlText(link.summary)}</small>` : "",
      "      </article>"
    ].join("\n")) : []),
    item.drilldowns.length ? "    </div>" : "",
    "  </section>"
  ].join("\n");
}

function renderHtmlElementDrilldownData(item: EngineeringDiagramDocument): string {
  return [
    `  <section class="semantic-layer engineering-element-drilldowns" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}:element-drilldowns" data-praxis-kind="engineering_element_drilldown_index">`,
    "    <h2>图内语义元素下钻</h2>",
    item.elements?.length
      ? "    <ol>"
      : "    <p>当前文档未记录图内元素级下钻。</p>",
    ...(item.elements?.length ? item.elements.map((element) => [
      `      <li data-praxis-anchor="${escapeHtmlAttr(element.anchor)}" data-praxis-kind="engineering_uml_element" data-praxis-mermaid-id="${escapeHtmlAttr(element.mermaidId)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(element.drilldowns))}">`,
      `        <strong>${escapeHtmlText(element.label)}</strong>`,
      `        <span>${escapeHtmlText(element.kind)}</span>`,
      `        <p>${escapeHtmlText(element.summary)}</p>`,
      "        <dl>",
      htmlElementDefinition("技术角色", element.role),
      htmlElementDefinition("为什么出现", element.whyItExists),
      htmlElementDefinition("关系意义", element.relationshipMeaning),
      htmlElementDefinition("下钻意图", element.drilldownIntent),
      htmlElementDefinition("业务关联", element.businessRelevance),
      htmlElementDefinition("变更影响", element.changeImpact),
      htmlElementDefinition("置信度", element.confidence),
      "        </dl>",
      renderHtmlInlineList("证据", element.evidence),
      renderHtmlInlineList("风险", element.risks),
      renderHtmlInlineList("问题", element.questions),
      "      </li>"
    ].join("\n")) : []),
    item.elements?.length ? "    </ol>" : "",
    "  </section>"
  ].join("\n");
}

function renderHtmlListSection(anchor: string, title: string, items: string[]): string {
  return [
    `  <section class="semantic-layer" data-praxis-anchor="${escapeHtmlAttr(anchor)}" data-praxis-kind="engineering_document_section">`,
    `    <h2>${escapeHtmlText(title)}</h2>`,
    "    <ul>",
    ...(items.length ? items.map((item) => `      <li>${escapeHtmlText(item)}</li>`) : ["      <li>-</li>"]),
    "    </ul>",
    "  </section>"
  ].join("\n");
}

function htmlElementDefinition(label: string, value: string): string {
  return `          <div><dt>${escapeHtmlText(label)}</dt><dd>${escapeHtmlText(value || "-")}</dd></div>`;
}

function renderHtmlInlineList(label: string, items: string[]): string {
  return [
    `        <section><h3>${escapeHtmlText(label)}</h3>`,
    items.length ? "          <ul>" : "          <p>-</p>",
    ...(items.length ? items.map((item) => `            <li>${escapeHtmlText(item)}</li>`) : []),
    items.length ? "          </ul>" : "",
    "        </section>"
  ].join("\n");
}

function renderMarkdownBullets(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- 暂无。"];
}

function renderSinglePackageMermaid(item: EngineeringPackage): string {
  const nodeId = "package_node";
  const lines = [
    "flowchart LR",
    `  ${nodeId}["${escapeMermaidLabel(item.title)}"]`
  ];
  for (const [index, dependency] of item.dependencies.slice(0, 8).entries()) {
    const depId = `dependency_${index + 1}`;
    lines.push(`  ${depId}["${escapeMermaidLabel(dependency)}"]`);
    lines.push(`  ${nodeId} --> ${depId}`);
  }
  if (!item.dependencies.length) lines.push(`  ${nodeId} --- isolated["未观察到跨模块依赖"]`);
  return lines.join("\n");
}

function packageDependencyMermaidId(item: EngineeringDiagramDocument, dependency: string): string {
  const dependencies = packageDependenciesFromMermaid(item.mermaid);
  const index = dependencies.findIndex((candidate) => candidate === dependency);
  return index >= 0 ? `dependency_${index + 1}` : `dependency_${safeId(dependency).replace(/[^A-Za-z0-9_]+/g, "_")}`;
}

function renderSingleComponentMermaid(item: EngineeringComponent): string {
  const componentId = "component_node";
  const packageId = "package_node";
  const fileId = "file_node";
  return [
    "flowchart LR",
    `  ${packageId}["${escapeMermaidLabel(item.packageId)}"]`,
    `  ${fileId}["${escapeMermaidLabel(codeAnchorText(item.filePath, item.line))}"]`,
    `  ${componentId}["${escapeMermaidLabel(`${item.kind}: ${item.title}`)}"]`,
    `  ${packageId} --> ${fileId}`,
    `  ${fileId} --> ${componentId}`,
    `  ${componentId} --> outgoingRelations["${escapeMermaidLabel(relationNodeLabel(item, "outgoing"))}"]`,
    `  incomingRelations["${escapeMermaidLabel(relationNodeLabel(item, "incoming"))}"] --> ${componentId}`
  ].join("\n");
}

function renderSingleDeploymentMermaid(item: EngineeringDeploymentNode): string {
  return [
    "flowchart TB",
    `  config["${escapeMermaidLabel(item.filePath)}"]`,
    `  runtime["${escapeMermaidLabel(item.title)}"]`,
    `  kind["${escapeMermaidLabel(item.kind)}"]`,
    "  config --> runtime",
    "  runtime --> kind"
  ].join("\n");
}

function renderClassStructuralMermaid(slice: EngineeringStructuralSlice): string {
  const lines = ["classDiagram"];
  const selected = slice.components.slice(0, 12);
  const classIds = classDiagramIdMap(selected);
  for (const component of selected) {
    const classId = classIds.get(component) ?? mermaidClassId(readableClassName(component.title));
    lines.push(`  class ${classId}["${escapeMermaidSequenceLabel(classDiagramDisplayName(component))}"] {`);
    lines.push(`    <<${escapeMermaidSequenceLabel(component.kind)}>>`);
    lines.push("  }");
  }
  for (const relation of renderableClassStructuralRelations(slice, selected, classIds)) {
    lines.push(`  ${relation.source} ${relation.operator} ${relation.target} : ${escapeMermaidSequenceLabel(relation.label)}`);
  }
  if (selected.length && !lines.some((line) => line.includes("..|>") || line.includes("--|>") || line.includes("..>"))) {
    const first = classIds.get(selected[0]) ?? mermaidClassId(readableClassName(selected[0].title));
    lines.push(`  note for ${first} "${escapeMermaidSequenceLabel(`${slice.structuralContext}，关系需由下钻证据确认`)}"`);
  }
  return lines.join("\n");
}

function classDiagramIdMap(components: EngineeringComponent[]): Map<EngineeringComponent, string> {
  const used = new Map<string, number>();
  const result = new Map<EngineeringComponent, string>();
  for (const component of components) {
    const base = mermaidClassId(readableClassName(component.title));
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    result.set(component, count === 0 ? base : `${base}_${count + 1}`);
  }
  return result;
}

function classDiagramDisplayName(component: EngineeringComponent): string {
  const rawName = readableClassName(component.title);
  if (!/^C_/i.test(rawName)) return rawName;
  const fileClass = path.basename(component.filePath, path.extname(component.filePath));
  const compactClass = fileClass.replace(/[^A-Za-z0-9_$]/g, "").toLowerCase();
  const parts = rawName.replace(/^C_/i, "").split("_").filter(Boolean);
  if (!parts.length) return fileClass || rawName;
  if (compactClass && parts[0].toLowerCase() === compactClass) {
    const member = parts.slice(1).join("_");
    return member ? `${fileClass}.${member}` : fileClass;
  }
  return fileClass || rawName.replace(/^C_/i, "");
}

function renderableClassStructuralRelations(
  slice: EngineeringStructuralSlice,
  components: EngineeringComponent[],
  classIds: Map<EngineeringComponent, string>
): Array<{ source: string; operator: "..|>" | "--|>" | "..>" | "-->"; target: string; label: string }> {
  const byNodeId = new Map(components.map((component) => [component.sourceNodeId, component]));
  const relations = slice.relations.flatMap((relation) => {
    const sourceComponent = byNodeId.get(relation.sourceNodeId);
    const targetComponent = byNodeId.get(relation.targetNodeId);
    const source = sourceComponent ? classIds.get(sourceComponent) : undefined;
    const target = targetComponent ? classIds.get(targetComponent) : undefined;
    if (!source || !target) return [];
    return [{
      source,
      operator: relationOperator(relation.kind),
      target,
      label: relation.label
    }];
  });
  return relations.length ? relations.slice(0, 16) : inferClassStructuralRelations(components, classIds);
}

function relationOperator(kind: CodeFactEdge["kind"]): "..|>" | "--|>" | "..>" | "-->" {
  if (kind === "implements") return "..|>";
  if (kind === "extends") return "--|>";
  if (kind === "instantiates") return "-->";
  return "..>";
}

function inferClassStructuralRelations(
  components: EngineeringComponent[],
  classIds: Map<EngineeringComponent, string>
): Array<{ source: string; operator: "..|>"; target: string; label: string }> {
  const interfaces = components.filter((component) => component.kind === "interface" || component.kind === "trait");
  const concrete = components.filter((component) => component.kind === "class" || component.kind === "struct");
  const relations: Array<{ source: string; operator: "..|>"; target: string; label: string }> = [];
  for (const item of concrete) {
    const itemName = readableClassName(item.title).replace(/Impl$/, "");
    for (const contract of interfaces) {
      const contractName = readableClassName(contract.title);
      if (item === contract || itemName === contractName) continue;
      if (itemName.endsWith(contractName) || itemName.includes(contractName)) {
        const source = classIds.get(item);
        const target = classIds.get(contract);
        if (source && target) relations.push({ source, operator: "..|>", target, label: "实现/承载契约" });
      }
    }
  }
  return relations.slice(0, 12);
}

function renderSingleSequenceMermaid(item: EngineeringRuntimeFlow): string {
  return [
    "sequenceDiagram",
    `  participant Source as ${escapeMermaidSequenceLabel(item.source)}`,
    `  participant Target as ${escapeMermaidSequenceLabel(item.target)}`,
    `  Source->>Target: ${escapeMermaidSequenceLabel(item.edgeKind)}`,
    `  Note over Source,Target: ${escapeMermaidSequenceLabel(item.packagePath)}`
  ].join("\n");
}

function renderSingleHotspotMermaid(item: EngineeringHotspot): string {
  const signal = hotspotSignalLabel(item);
  return [
    "flowchart LR",
    `  target["${escapeMermaidLabel(item.targetPath)}"]`,
    `  hotspot["${escapeMermaidLabel(hotspotKindLabel(item.kind))}"]`,
    `  signal["${escapeMermaidLabel(signal)}"]`,
    "  target --> hotspot",
    "  hotspot --> signal"
  ].join("\n");
}

function diagramSlug(value: string): string {
  const slug = value
    .replace(/\\/g, "/")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "diagram";
  if (slug.length <= 96) return slug;
  return `${slug.slice(0, 84).replace(/-+$/g, "")}-${stableShortHash(slug)}`;
}

function stableShortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function mermaidClassId(value: string): string {
  const candidate = value
    .replace(/\s+Component Diagram$/i, "")
    .replace(/[#:]+/g, "_")
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_") || "ClassNode";
  const readable = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  return /^[A-Za-z_$]/.test(readable) ? readable : `Class_${readable}`;
}

function relativeLinkFrom(fromPath: string, toPath: string): string {
  const relative = path.posix.relative(path.posix.dirname(fromPath.replace(/\\/g, "/")), toPath.replace(/\\/g, "/"));
  return relative || path.posix.basename(toPath);
}

function renderEngineeringComplexityMarkdown(model: EngineeringComplexityModel): string {
  return [
    "# 技术复杂度地图",
    "",
    ENGINEERING_MAP_MANAGED_START,
    "",
    "## 元数据",
    "",
    `项目版本：${model.projectVersion}`,
    `工程文档版本：${model.projectVersion}`,
    `Git 分支：${model.git.branch}`,
    `Git 提交：${model.git.commit}`,
    `Git 工作区状态：${model.git.dirty ? "dirty" : "clean"}`,
    `更新于：${model.generatedAt}`,
    `来源：${model.source}`,
    "",
    "## 定位",
    "",
    "软件结构模型专注解释工程中的 Package、Component、运行链路、部署节点和复杂度候选点，以及它们如何支撑或约束业务能力。它不替代组织/过程模型的业务故事解释。",
    "",
    "## 技术复杂度索引",
    "",
    "| 维度 | 数量 | 解释 |",
    "| --- | ---: | --- |",
    `| Package / Module | ${model.summary.packageCount} | 技术组织边界和跨模块依赖。 |`,
    `| Component | ${model.summary.componentCount} | 关键类、函数、接口、组件和入口。 |`,
    `| Runtime Flow | ${model.summary.runtimeFlowCount} | 调用、引用、导入形成的运行或协作链路。 |`,
    `| Deployment / Runtime Node | ${model.summary.deploymentNodeCount} | 构建、运行、桌面壳、包管理、CI 或部署入口。 |`,
    `| Technical Hotspot | ${model.summary.hotspotCount} | 复用压力、外部协作压力、大文件、依赖簇或扫描告警。 |`,
    "",
    "## Package / Module Map",
    "",
    "```mermaid",
    renderPackageMermaid(model),
    "```",
    "",
    ...renderPackageMarkdown(model.packages),
    "",
    "## Component Collaboration Map",
    "",
    "```mermaid",
    renderComponentMermaid(model),
    "```",
    "",
    ...renderComponentMarkdown(model.components),
    "",
    "## Runtime Flow Map",
    "",
    "```mermaid",
    renderRuntimeFlowMermaid(model),
    "```",
    "",
    ...renderRuntimeFlowMarkdown(model.runtimeFlows),
    "",
    "## Deployment / Runtime Map",
    "",
    "```mermaid",
    renderDeploymentMermaid(model),
    "```",
    "",
    ...renderDeploymentMarkdown(model.deploymentNodes),
    "",
    "## Technical Hotspots",
    "",
    ...renderHotspotMarkdown(model.hotspots),
    "",
    "## 地图变更记录",
    "",
    `### ${model.projectVersion} - ${model.generatedAt}`,
    "",
    "变更类型：DISCOVERY",
    `Git 分支：${model.git.branch}`,
    `Git 提交：${model.git.commit}`,
    `Git 工作区状态：${model.git.dirty ? "dirty" : "clean"}`,
    "",
    `- 更新技术复杂度地图：${model.summary.packageCount} 个模块，${model.summary.componentCount} 个组件，${model.summary.runtimeFlowCount} 条运行链路，${model.summary.hotspotCount} 个技术热点。`,
    "",
    ENGINEERING_MAP_MANAGED_END,
    ""
  ].join("\n");
}

function renderEngineeringComplexityHtml(model: EngineeringComplexityModel): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <title>Engineering Complexity Map</title>",
    "</head>",
    "<body>",
    `<main class="praxis-engineering-map" data-praxis-anchor="engineering-map:root" data-praxis-kind="engineering_complexity_map" data-praxis-status="candidate" data-praxis-confidence="high">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Software Structure Model</p>",
    "    <h1>技术复杂度地图</h1>",
    "    <p>从本地仓库证据恢复软件结构模型：Package、Component、运行链路、部署节点和复杂度候选点。组织/过程模型解释业务故事；软件结构模型解释技术结构、运行机制和工程约束。</p>",
    "    <div class=\"meta-row\">",
    `      <span>项目版本：${escapeHtmlText(model.projectVersion)}</span>`,
    `      <span>Git：${escapeHtmlText(model.git.shortCommit)} / ${escapeHtmlText(model.git.branch)} / ${model.git.dirty ? "dirty" : "clean"}</span>`,
    `      <span>更新于：<time datetime="${escapeHtmlAttr(model.generatedAt)}">${escapeHtmlText(model.generatedAt)}</time></span>`,
    "    </div>",
    "  </header>",
    renderHtmlMetricIndex(model),
    renderHtmlDiagramSection("engineering:package-map", "Package / Module Map", "技术组织边界、跨模块依赖和包级复杂度。", renderPackageMermaid(model), renderPackageCards(model.packages)),
    renderHtmlDiagramSection("engineering:component-map", "Component Collaboration Map", "关键组件、接口、函数、类和技术协作热点。", renderComponentMermaid(model), renderComponentCards(model.components)),
    renderHtmlDiagramSection("engineering:runtime-flow-map", "Runtime Flow Map", "调用、引用、导入形成的运行链路或技术协作链路。", renderRuntimeFlowMermaid(model), renderRuntimeFlowCards(model.runtimeFlows)),
    renderHtmlDiagramSection("engineering:deployment-map", "Deployment / Runtime Map", "构建、运行、部署、桌面壳、包管理和 CI 入口。", renderDeploymentMermaid(model), renderDeploymentCards(model.deploymentNodes)),
    renderHtmlHotspots(model.hotspots),
    `  <script type="application/json" id="praxis-engineering-complexity-model">${escapeScriptJson(JSON.stringify(engineeringModelUiProjection(model)))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderHtmlMetricIndex(model: EngineeringComplexityModel): string {
  const metrics = [
    ["Package / Module", model.summary.packageCount, "技术组织边界"],
    ["Component", model.summary.componentCount, "关键技术对象"],
    ["Runtime Flow", model.summary.runtimeFlowCount, "运行协作链路"],
    ["Deployment", model.summary.deploymentNodeCount, "运行和部署入口"],
    ["Hotspot", model.summary.hotspotCount, "技术复杂度热点"]
  ];
  return [
    "  <section class=\"metric-index-layer\" data-praxis-anchor=\"engineering:metric-index\" data-praxis-kind=\"engineering_metric_index\">",
    "    <h2>技术复杂度索引</h2>",
    "    <div class=\"metric-index-grid\">",
    ...metrics.map(([label, value, summary]) => [
      `      <article class="metric-group" data-praxis-anchor="engineering:metric:${safeId(String(label))}" data-praxis-metric-kind="${safeId(String(label))}" data-praxis-metric-count="${value}">`,
      `        <header><strong>${escapeHtmlText(String(label))}</strong><span>${value}</span></header>`,
      `        <p>${escapeHtmlText(String(summary))}</p>`,
      "      </article>"
    ].join("\n")),
    "    </div>",
    "  </section>"
  ].join("\n");
}

function renderHtmlDiagramSection(anchor: string, title: string, copy: string, mermaid: string, cards: string): string {
  return [
    `  <section class="semantic-layer diagram-section" data-praxis-anchor="${escapeHtmlAttr(anchor)}" data-praxis-kind="engineering_diagram">`,
    `    <h2>${escapeHtmlText(title)}</h2>`,
    `    <p>${escapeHtmlText(copy)}</p>`,
    `    <pre class="mermaid" data-praxis-anchor="${escapeHtmlAttr(anchor)}:uml">${escapeHtmlText(mermaid)}</pre>`,
    "    <div class=\"layer-grid\">",
    cards,
    "    </div>",
    "  </section>"
  ].join("\n");
}

function renderPackageCards(items: EngineeringPackage[]): string {
  return (items.length ? items : []).map((item) => [
    `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(item.id)}" data-praxis-kind="engineering_package" data-praxis-status="candidate" data-praxis-confidence="${item.confidence}">`,
    `        <h3>${escapeHtmlText(item.title)}</h3>`,
    `        <p>${escapeHtmlText(item.fileCount)} 个文件 / ${escapeHtmlText(item.nodeCount)} 个符号 / 外部依赖 ${escapeHtmlText(item.outgoing)} / 被外部引用 ${escapeHtmlText(item.incoming)}</p>`,
    `        <p>${escapeHtmlText(item.dependencies.length ? `依赖：${item.dependencies.join("、")}` : "未观察到跨模块依赖。")}</p>`,
    "      </article>"
  ].join("\n")).join("\n") || "      <p>暂无 Package / Module 记录。</p>";
}

function renderComponentCards(items: EngineeringComponent[]): string {
  return (items.length ? items : []).map((item) => [
    `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(item.id)}" data-praxis-kind="engineering_component" data-praxis-status="candidate" data-praxis-confidence="${item.confidence}">`,
    `        <h3>${escapeHtmlText(item.title)}</h3>`,
    `        <p>${escapeHtmlText(item.kind)} · ${escapeHtmlText(codeAnchorText(item.filePath, item.line))}</p>`,
    `        <p>${escapeHtmlText(item.summary)}</p>`,
    "      </article>"
  ].join("\n")).join("\n") || "      <p>暂无 Component 记录。</p>";
}

function renderRuntimeFlowCards(items: EngineeringRuntimeFlow[]): string {
  return (items.length ? items : []).map((item) => [
    `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(item.id)}" data-praxis-kind="engineering_runtime_flow" data-praxis-status="candidate" data-praxis-confidence="${item.confidence}">`,
    `        <h3>${escapeHtmlText(item.title)}</h3>`,
    `        <p>${escapeHtmlText(item.edgeKind)} · ${escapeHtmlText(item.packagePath)}</p>`,
    `        <p>${escapeHtmlText(item.summary)}</p>`,
    "      </article>"
  ].join("\n")).join("\n") || "      <p>暂无 Runtime Flow 记录。</p>";
}

function renderDeploymentCards(items: EngineeringDeploymentNode[]): string {
  return (items.length ? items : []).map((item) => [
    `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(item.id)}" data-praxis-kind="engineering_deployment" data-praxis-status="candidate" data-praxis-confidence="${item.confidence}">`,
    `        <h3>${escapeHtmlText(item.title)}</h3>`,
    `        <p>${escapeHtmlText(item.kind)} · ${escapeHtmlText(item.filePath)}</p>`,
    `        <p>${escapeHtmlText(item.summary)}</p>`,
    "      </article>"
  ].join("\n")).join("\n") || "      <p>暂无 Deployment / Runtime 记录。</p>";
}

function renderHtmlHotspots(items: EngineeringHotspot[]): string {
  return [
    "  <section class=\"semantic-layer\" data-praxis-anchor=\"engineering:hotspots\" data-praxis-kind=\"engineering_hotspots\">",
    "    <h2>Technical Hotspots</h2>",
    "    <p>这些热点是从本地仓库证据中恢复出的候选技术复杂度，不等于已经确认的问题。</p>",
    "    <div class=\"layer-grid\">",
    ...(items.length ? items.map((item) => [
      `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(item.id)}" data-praxis-kind="engineering_hotspot" data-praxis-status="candidate" data-praxis-confidence="${item.confidence}">`,
      `        <h3>${escapeHtmlText(item.title)}</h3>`,
      `        <p>${escapeHtmlText(hotspotKindLabel(item.kind))} · ${escapeHtmlText(hotspotSignalLabel(item))}</p>`,
      `        <p>${escapeHtmlText(item.summary)}</p>`,
      "      </article>"
    ].join("\n")) : ["      <p>暂无技术热点。</p>"]),
    "    </div>",
    "  </section>"
  ].join("\n");
}

function renderPackageMarkdown(items: EngineeringPackage[]): string[] {
  return [
    "| Package / Module | Files | Symbols | 复用线索 | 外部协作线索 | Dependencies | Evidence |",
    "| --- | ---: | ---: | --- | --- | --- | --- |",
    ...(items.length ? items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${item.fileCount} | ${item.nodeCount} | ${escapeMarkdownTable(relationTextFromCount(item.incoming, "incoming"))} | ${escapeMarkdownTable(relationTextFromCount(item.outgoing, "outgoing"))} | ${escapeMarkdownTable(item.dependencies.join("、") || "-")} | ${escapeMarkdownTable(item.evidencePaths.join("、") || "-")} |`
    ) : ["| _无_ | 0 | 0 | - | - | - | - |"])
  ];
}

function renderComponentMarkdown(items: EngineeringComponent[]): string[] {
  return [
    "| Component | Kind | Anchor | 被复用/被依赖迹象 | 外部协作/编排迹象 | Package | Summary |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
    ...(items.length ? items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${item.kind} | ${escapeMarkdownTable(codeAnchorText(item.filePath, item.line))} | ${relationNodeLabel(item, "incoming")} | ${relationNodeLabel(item, "outgoing")} | ${escapeMarkdownTable(item.packageId)} | ${escapeMarkdownTable(item.summary)} |`
    ) : ["| _无_ | - | - | 0 | 0 | - | - |"])
  ];
}

function renderRuntimeFlowMarkdown(items: EngineeringRuntimeFlow[]): string[] {
  return [
    "| Flow | Kind | Source | Target | Package | Summary |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(items.length ? items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${item.edgeKind} | ${escapeMarkdownTable(item.sourcePath)} | ${escapeMarkdownTable(item.targetPath)} | ${escapeMarkdownTable(item.packagePath)} | ${escapeMarkdownTable(item.summary)} |`
    ) : ["| _无_ | - | - | - | - | - |"])
  ];
}

function renderDeploymentMarkdown(items: EngineeringDeploymentNode[]): string[] {
  return [
    "| Runtime Node | Kind | Evidence | Summary |",
    "| --- | --- | --- | --- |",
    ...(items.length ? items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${item.kind} | ${escapeMarkdownTable(item.filePath)} | ${escapeMarkdownTable(item.summary)} |`
    ) : ["| _无_ | - | - | - |"])
  ];
}

function renderHotspotMarkdown(items: EngineeringHotspot[]): string[] {
  return [
    "| Hotspot | 类型 | Target | 复杂度信号 | Summary | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(items.length ? items.map((item) =>
      `| ${escapeMarkdownTable(item.title)} | ${hotspotKindLabel(item.kind)} | ${escapeMarkdownTable(item.targetPath)} | ${escapeMarkdownTable(hotspotSignalLabel(item))} | ${escapeMarkdownTable(item.summary)} | ${escapeMarkdownTable(item.evidencePaths.join("、") || "-")} |`
    ) : ["| _无_ | - | - | 0 | - | - |"])
  ];
}

function renderPackageMermaid(model: EngineeringComplexityModel): string {
  const items = model.packages.slice(0, 10);
  const lines = ["flowchart LR"];
  if (!items.length) return "flowchart LR\n  empty[\"暂无 Package / Module\"]";
  for (const item of items) lines.push(`  ${mermaidNodeId(item.id)}["${escapeMermaidLabel(item.title)}"]`);
  const itemIds = new Set(items.map((item) => item.path));
  for (const item of items) {
    for (const dep of item.dependencies.slice(0, 4)) {
      if (!itemIds.has(dep)) continue;
      lines.push(`  ${mermaidNodeId(item.id)} --> ${mermaidNodeId(`engineering:package:${safeId(dep)}`)}`);
    }
  }
  return lines.join("\n");
}

function renderComponentMermaid(model: EngineeringComplexityModel): string {
  const items = model.components.slice(0, 8);
  const lines = ["flowchart LR"];
  if (!items.length) return "flowchart LR\n  empty[\"暂无 Component\"]";
  const ids = new Map(items.map((item, index) => [item.id, `component_${index + 1}`]));
  for (const item of items) {
    lines.push(`  ${ids.get(item.id)}["${escapeMermaidLabel(`${item.kind}: ${item.title}`)}"]`);
  }
  for (const flow of model.runtimeFlows.slice(0, 12)) {
    const source = items.find((item) => item.title === flow.source || item.title.endsWith(`.${flow.source}`));
    const target = items.find((item) => item.title === flow.target || item.title.endsWith(`.${flow.target}`));
    const sourceId = source ? ids.get(source.id) : undefined;
    const targetId = target ? ids.get(target.id) : undefined;
    if (sourceId && targetId && sourceId !== targetId) lines.push(`  ${sourceId} --> ${targetId}`);
  }
  return lines.join("\n");
}

function renderRuntimeFlowMermaid(model: EngineeringComplexityModel): string {
  const flows = model.runtimeFlows.slice(0, 7);
  if (!flows.length) return "sequenceDiagram\n  participant Empty as 暂无 Runtime Flow";
  const participants = new Map<string, string>();
  for (const flow of flows) {
    if (!participants.has(flow.source)) participants.set(flow.source, `P${participants.size + 1}`);
    if (!participants.has(flow.target)) participants.set(flow.target, `P${participants.size + 1}`);
  }
  const lines = ["sequenceDiagram"];
  for (const [name, id] of participants) lines.push(`  participant ${id} as ${escapeMermaidSequenceLabel(name)}`);
  for (const flow of flows) {
    lines.push(`  ${participants.get(flow.source)}->>${participants.get(flow.target)}: ${escapeMermaidSequenceLabel(flow.edgeKind)}`);
  }
  return lines.join("\n");
}

function renderDeploymentMermaid(model: EngineeringComplexityModel): string {
  const items = model.deploymentNodes.slice(0, 10);
  const lines = ["flowchart TB"];
  if (!items.length) return "flowchart TB\n  empty[\"暂无 Deployment / Runtime Node\"]";
  for (const item of items) lines.push(`  ${mermaidNodeId(item.id)}["${escapeMermaidLabel(`${item.kind}: ${item.title}`)}"]`);
  return lines.join("\n");
}

function moduleIdForPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) return "root";
  if ((parts[0] === "apps" || parts[0] === "packages") && parts[1]) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "docs") return parts[1] && !parts[1].includes(".") ? `docs/${parts[1]}` : "docs";
  if (parts[0].startsWith(".")) return parts[0];
  return parts[0];
}

function isTestLikePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(test|tests|__tests__)\/|(\.test|\.spec)\.(ts|tsx|js|jsx|java|rs)$/.test(normalized)
    || normalized.includes("/src/test/")
    || normalized.includes("/src/it/")
    || normalized.includes("/src/integration-test/");
}

function readableClassName(value: string): string {
  const normalized = value.replace(/\$/g, "::");
  return normalized
    .split("::")
    .map((part) => {
      const pieces = part.split(".").filter(Boolean);
      return pieces.at(-1) ?? part;
    })
    .join("::")
    .replace(/[^\w:]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "") || "ClassNode";
}

function componentSummary(node: CodeFactNode, fanIn: number, fanOut: number): string {
  const direction = fanIn >= fanOut ? relationTextFromCount(fanIn, "incoming") : relationTextFromCount(fanOut, "outgoing");
  return `${node.kind} 位于 ${codeAnchorText(node.filePath, node.range?.startLine)}，${direction}，用于解释技术协作和变更影响面。`;
}

function relationTextFromCount(count: number, direction: "incoming" | "outgoing"): string {
  if (direction === "incoming") {
    if (count <= 0) return "当前未观察到明显复用线索";
    if (count >= 20) return "被多个对象复用或依赖";
    return "存在局部复用或依赖线索";
  }
  if (count <= 0) return "当前未观察到明显外部协作线索";
  if (count >= 20) return "协调多个外部对象或能力";
  return "存在局部外部协作线索";
}

function relationNodeLabel(item: EngineeringComponent, direction: "incoming" | "outgoing"): string {
  const count = direction === "incoming" ? item.fanIn : item.fanOut;
  if (direction === "incoming") {
    if (count <= 0) return "未观察到明显复用";
    if (count >= 20) return "被多个对象复用";
    return "存在复用线索";
  }
  if (count <= 0) return "未观察到明显外部协作";
  if (count >= 20) return "协调多个外部对象";
  return "存在外部协作线索";
}

function isDeploymentOrRuntimeFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("package.json")
    || normalized.endsWith("cargo.toml")
    || normalized.endsWith("tauri.conf.json")
    || normalized.endsWith("vite.config.ts")
    || normalized.endsWith("vite.config.js")
    || normalized.endsWith("dockerfile")
    || normalized.includes("docker-compose")
    || normalized.startsWith(".github/workflows/")
    || normalized.endsWith("tsconfig.json")
    || normalized.endsWith("pnpm-lock.yaml")
    || normalized.endsWith("package-lock.json");
}

function deploymentKind(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("tauri.conf.json")) return "desktop_shell";
  if (normalized.endsWith("cargo.toml")) return "rust_runtime";
  if (normalized.endsWith("package.json")) return "node_package";
  if (normalized.includes("docker")) return "container";
  if (normalized.startsWith(".github/workflows/")) return "ci";
  if (normalized.includes("vite.config")) return "frontend_build";
  if (normalized.includes("tsconfig")) return "typescript_build";
  return "runtime_config";
}

function deploymentTitle(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 3 && (parts[0] === "apps" || parts[0] === "packages")) return `${parts[0]}/${parts[1]} · ${parts.at(-1)}`;
  return filePath;
}

function deploymentSummary(filePath: string): string {
  const kind = deploymentKind(filePath);
  if (kind === "desktop_shell") return "Tauri 桌面壳配置，决定桌面应用、权限、构建和发布边界。";
  if (kind === "rust_runtime") return "Rust/Tauri 或原生运行时包配置，影响桌面端编译和运行。";
  if (kind === "node_package") return "Node/package workspace 配置，影响脚本、依赖和构建入口。";
  if (kind === "ci") return "CI 工作流入口，影响验证、发布和工程治理自动化。";
  if (kind === "frontend_build") return "前端构建配置，影响开发服务器、打包入口、资源处理和运行时注入。";
  if (kind === "typescript_build") return "TypeScript 编译配置，影响类型边界、路径别名、构建目标和工程约束。";
  if (kind === "container") return "容器运行配置，影响本地集成、服务依赖、端口、镜像和部署可复现性。";
  return "运行、构建或部署相关配置文件。";
}

function engineeringComponentTitlePrefix(item: EngineeringComponent): string {
  const kind = item.kind.toLowerCase();
  const haystack = `${item.title} ${item.filePath}`.toLowerCase();
  if (haystack.includes(".tsx") || haystack.includes("page") || haystack.includes("component")) return "界面组件";
  if (haystack.includes("command") || haystack.includes("/cli") || haystack.includes("\\cli")) return "命令入口";
  if (kind === "interface" || kind === "trait" || haystack.includes("schema") || haystack.includes("type")) return "类型契约";
  if (haystack.includes("adapter") || haystack.includes("provider")) return "适配组件";
  if (haystack.includes("service")) return "服务对象";
  if (kind === "function" || kind === "method") return "函数节点";
  if (kind === "class" || kind === "struct") return "结构对象";
  return "技术组件";
}

function deploymentKindLabel(kind: string): string {
  if (kind === "desktop_shell") return "桌面壳配置";
  if (kind === "rust_runtime") return "Rust 运行配置";
  if (kind === "node_package") return "包脚本配置";
  if (kind === "container") return "容器运行配置";
  if (kind === "ci") return "CI 工作流";
  if (kind === "frontend_build") return "前端构建配置";
  if (kind === "typescript_build") return "TypeScript 编译配置";
  return "运行部署配置";
}

function deploymentScopeTitle(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) ?? normalized;
  if (parts.length >= 2) {
    const root = parts[0] === "apps" || parts[0] === "packages"
      ? parts.slice(0, 2).join("/")
      : parts.slice(0, -1).join("/");
    return `${root} / ${fileName}`;
  }
  return normalized;
}

function sequenceEdgeLabel(kind: string): string {
  if (kind === "calls") return "调用";
  if (kind === "references") return "引用";
  if (kind === "imports") return "导入";
  return kind;
}

function codeAnchor(node: CodeFactNode): string {
  return codeAnchorText(node.filePath, node.range?.startLine);
}

function codeAnchorText(filePath: string, line?: number): string {
  return line ? `${filePath}#L${line}` : filePath;
}

function confidenceRank(confidence: "high" | "medium" | "low"): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "item";
}

function mermaidNodeId(value: string): string {
  return `n_${safeId(value).replace(/[^A-Za-z0-9_]+/g, "_")}`;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, "'");
}

function escapeMermaidSequenceLabel(value: string): string {
  return value.replace(/[\r\n:;]/g, " ").replace(/"/g, "'");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function escapeHtmlText(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/`/g, "&#96;");
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
