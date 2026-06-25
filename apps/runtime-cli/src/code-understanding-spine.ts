import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CodeUnderstandingSpineSchema,
  type BehaviorSlice,
  type BehaviorTriggerKind,
  type CodeFactEdge,
  type CodeFactEvidenceRef,
  type CodeFactFile,
  type CodeFactGraphSnapshot,
  type CodeFactNode,
  type CoverageLedgerItem,
  type CoverageLedgerStatus,
  type EvidenceClaim,
  type RuntimeBoundary,
  type RuntimeBoundaryKind,
  type StructuralCluster,
  type CodeUnderstandingSpine
} from "@praxis/schema";

export const CODE_UNDERSTANDING_SPINE_DOC_RELATIVE_PATH = "docs/code-understanding/code-first-discovery-spine.md";
export const CODE_UNDERSTANDING_SPINE_JSON_RELATIVE_PATH = "docs/code-understanding/code-first-discovery-spine.json";

interface ModuleAccumulator {
  moduleId: string;
  files: CodeFactFile[];
  nodes: CodeFactNode[];
  edgeIds: Set<string>;
  incomingModuleIds: Set<string>;
  outgoingModuleIds: Set<string>;
}

export function buildCodeUnderstandingSpine(
  root: string,
  codeFacts: CodeFactGraphSnapshot,
  generatedAt = new Date().toISOString()
): CodeUnderstandingSpine {
  const activeCodeFacts = filterCodeUnderstandingSourceFacts(codeFacts);
  const nodeById = new Map(activeCodeFacts.nodes.map((node) => [node.id, node]));
  const fileByPath = new Map(activeCodeFacts.files.map((file) => [file.path, file]));
  const outgoingEdgesByNode = groupBy(activeCodeFacts.edges, (edge) => edge.sourceId);
  const incomingEdgesByNode = groupBy(activeCodeFacts.edges, (edge) => edge.targetId);
  const moduleAccumulators = buildModuleAccumulators(activeCodeFacts, nodeById);
  const runtimeBoundaries = buildRuntimeBoundaries(activeCodeFacts, nodeById);
  const behaviorSlices = buildBehaviorSlices(activeCodeFacts, nodeById, fileByPath, outgoingEdgesByNode, incomingEdgesByNode);
  const structuralClusters = buildStructuralClusters(moduleAccumulators, activeCodeFacts.edges, behaviorSlices);
  const evidenceClaims = buildEvidenceClaims(behaviorSlices, structuralClusters, runtimeBoundaries, activeCodeFacts.edges, nodeById);
  const coverageLedger = buildCoverageLedger(activeCodeFacts, behaviorSlices, structuralClusters, runtimeBoundaries);
  const gaps = coverageLedger.filter((item) => item.status === "unknown_gap");
  const spine = {
    schemaVersion: "praxis.codeUnderstandingSpine.v1",
    root,
    generatedAt,
    source: {
      source: "code_facts",
      codeFactGraphGeneratedAt: codeFacts.generatedAt,
      provider: codeFacts.provider
    },
    summary: {
      fileCount: activeCodeFacts.files.length,
      nodeCount: activeCodeFacts.nodes.length,
      edgeCount: activeCodeFacts.edges.length,
      behaviorSliceCount: behaviorSlices.length,
      structuralClusterCount: structuralClusters.length,
      runtimeBoundaryCount: runtimeBoundaries.length,
      evidenceClaimCount: evidenceClaims.length,
      coverageLedgerCount: coverageLedger.length,
      unknownGapCount: gaps.length
    },
    behaviorSlices,
    structuralClusters,
    runtimeBoundaries,
    evidenceClaims,
    coverageLedger,
    reconciliation: {
      designProjectionIds: [],
      engineeringProjectionIds: [],
      architectureProjectionIds: [],
      linkedBehaviorSliceIds: behaviorSlices.map((item) => item.id),
      linkedStructuralClusterIds: structuralClusters.map((item) => item.id),
      linkedRuntimeBoundaryIds: runtimeBoundaries.map((item) => item.id),
      gaps
    }
  } satisfies CodeUnderstandingSpine;
  return CodeUnderstandingSpineSchema.parse(spine);
}

function filterCodeUnderstandingSourceFacts(codeFacts: CodeFactGraphSnapshot): CodeFactGraphSnapshot {
  const files = codeFacts.files.filter((file) => !isGeneratedOrVendorPath(file.path));
  const filePaths = new Set(files.map((file) => file.path));
  const nodes = codeFacts.nodes.filter((node) => filePaths.has(node.filePath) && !isGeneratedOrVendorPath(node.filePath));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = codeFacts.edges.filter((edge) =>
    nodeIds.has(edge.sourceId)
    && nodeIds.has(edge.targetId)
    && !isGeneratedOrVendorPath(edge.filePath ?? "")
  );
  const warnings = codeFacts.warnings.filter((warning) =>
    !isGeneratedOrVendorPath(warning.id)
    && !isGeneratedOrVendorPath(warning.summary)
  );
  return { ...codeFacts, files, nodes, edges, warnings };
}

export async function writeCodeUnderstandingSpineDocuments(
  root: string,
  spine: CodeUnderstandingSpine
): Promise<{ markdownPath: string; jsonPath: string }> {
  const markdownPath = path.join(root, CODE_UNDERSTANDING_SPINE_DOC_RELATIVE_PATH);
  const jsonPath = path.join(root, CODE_UNDERSTANDING_SPINE_JSON_RELATIVE_PATH);
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, renderCodeUnderstandingSpineMarkdown(spine), "utf8");
  await writeFile(jsonPath, JSON.stringify(spine, null, 2) + "\n", "utf8");
  return { markdownPath, jsonPath };
}

export function codeUnderstandingSpineDigest(spine: CodeUnderstandingSpine): Record<string, unknown> {
  return {
    schemaVersion: spine.schemaVersion,
    generatedAt: spine.generatedAt,
    source: spine.source,
    summary: spine.summary,
    behaviorSlices: spine.behaviorSlices.slice(0, 80).map((item) => ({
      id: item.id,
      title: item.title,
      triggerKind: item.triggerKind,
      entrypointNodeId: item.entrypointNodeId,
      moduleId: item.moduleId,
      codeFactIds: item.codeFactIds.slice(0, 24),
      relationIds: item.relationIds.slice(0, 24),
      touchedFilePaths: item.touchedFilePaths.slice(0, 12),
      outgoingModuleIds: item.outgoingModuleIds
    })),
    structuralClusters: spine.structuralClusters.slice(0, 40).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      moduleId: item.moduleId,
      fileCount: item.filePaths.length,
      nodeCount: item.nodeIds.length,
      edgeCount: item.edgeIds.length,
      behaviorSliceIds: item.behaviorSliceIds.slice(0, 20),
      outgoingModuleIds: item.outgoingModuleIds
    })),
    runtimeBoundaries: spine.runtimeBoundaries.slice(0, 40).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      moduleId: item.moduleId,
      filePath: item.filePath
    })),
    coverageSummary: coverageStatusCounts(spine.coverageLedger),
    unknownGaps: spine.reconciliation.gaps.slice(0, 80).map((item) => ({
      id: item.id,
      kind: item.kind,
      targetId: item.targetId,
      targetLabel: item.targetLabel,
      reason: item.reason
    }))
  };
}

function buildBehaviorSlices(
  codeFacts: CodeFactGraphSnapshot,
  nodeById: Map<string, CodeFactNode>,
  fileByPath: Map<string, CodeFactFile>,
  outgoingEdgesByNode: Map<string, CodeFactEdge[]>,
  incomingEdgesByNode: Map<string, CodeFactEdge[]>
): BehaviorSlice[] {
  const candidates = codeFacts.nodes.filter((node) => isEntrypointNode(node, fileByPath.get(node.filePath)));
  return candidates.slice(0, 220).map((node) => {
    const outgoing = outgoingEdgesByNode.get(node.id) ?? [];
    const incoming = incomingEdgesByNode.get(node.id) ?? [];
    const neighborhoodEdges = uniqueBy([...outgoing, ...incoming].slice(0, 60), (edge) => edge.id);
    const neighborNodes = uniqueBy(
      neighborhoodEdges.flatMap((edge) => [nodeById.get(edge.sourceId), nodeById.get(edge.targetId)]).filter(isDefined),
      (item) => item.id
    );
    const touchedFiles = unique([node.filePath, ...neighborNodes.map((item) => item.filePath)].filter((item) => item && item !== "."));
    const outgoingModuleIds = unique(neighborhoodEdges
      .map((edge) => nodeById.get(edge.targetId))
      .filter(isDefined)
      .map((target) => moduleIdForPath(target.filePath))
      .filter((moduleId) => moduleId !== moduleIdForPath(node.filePath)));
    const triggerKind = classifyTriggerKind(node);
    return {
      id: `behavior-slice:${safeId(`${triggerKind}:${node.id}`)}`,
      title: `${triggerKindLabel(triggerKind)}: ${node.qualifiedName || node.name}`,
      triggerKind,
      entrypointNodeId: node.id,
      entrypointName: node.qualifiedName || node.name,
      moduleId: moduleIdForPath(node.filePath),
      codeFactIds: unique([node.id, ...neighborNodes.map((item) => item.id)]),
      relationIds: neighborhoodEdges.map((edge) => edge.id),
      touchedFilePaths: touchedFiles,
      touchedNodeKinds: unique([node.kind, ...neighborNodes.map((item) => item.kind)]),
      outgoingModuleIds,
      evidence: evidenceFromNode(node),
      confidence: behaviorConfidence(triggerKind, neighborhoodEdges.length)
    };
  });
}

function buildModuleAccumulators(
  codeFacts: CodeFactGraphSnapshot,
  nodeById: Map<string, CodeFactNode>
): Map<string, ModuleAccumulator> {
  const modules = new Map<string, ModuleAccumulator>();
  for (const file of codeFacts.files) {
    const moduleId = moduleIdForPath(file.path);
    getModuleAccumulator(modules, moduleId).files.push(file);
  }
  for (const node of codeFacts.nodes) {
    const moduleId = moduleIdForPath(node.filePath);
    getModuleAccumulator(modules, moduleId).nodes.push(node);
  }
  for (const edge of codeFacts.edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source && !target) continue;
    const sourceModuleId = source ? moduleIdForPath(source.filePath) : "unknown";
    const targetModuleId = target ? moduleIdForPath(target.filePath) : "unknown";
    const sourceAccumulator = getModuleAccumulator(modules, sourceModuleId);
    sourceAccumulator.edgeIds.add(edge.id);
    if (sourceModuleId !== targetModuleId) sourceAccumulator.outgoingModuleIds.add(targetModuleId);
    if (target) {
      const targetAccumulator = getModuleAccumulator(modules, targetModuleId);
      targetAccumulator.edgeIds.add(edge.id);
      if (sourceModuleId !== targetModuleId) targetAccumulator.incomingModuleIds.add(sourceModuleId);
    }
  }
  return modules;
}

function buildStructuralClusters(
  modules: Map<string, ModuleAccumulator>,
  edges: CodeFactEdge[],
  behaviorSlices: BehaviorSlice[]
): StructuralCluster[] {
  const behaviorSlicesByModule = groupBy(behaviorSlices, (item) => item.moduleId);
  const edgeIds = new Set(edges.map((edge) => edge.id));
  return Array.from(modules.values())
    .filter((item) => item.files.length || item.nodes.length || item.edgeIds.size)
    .sort((left, right) => right.nodes.length - left.nodes.length || right.files.length - left.files.length)
    .slice(0, 80)
    .map((item) => {
      const moduleBehaviorSlices = behaviorSlicesByModule.get(item.moduleId) ?? [];
      const entrypointIds = moduleBehaviorSlices.map((slice) => slice.entrypointNodeId);
      return {
        id: `structural-cluster:${safeId(item.moduleId)}`,
        title: item.moduleId,
        kind: "module",
        moduleId: item.moduleId,
        filePaths: item.files.map((file) => file.path).slice(0, 120),
        nodeIds: item.nodes.map((node) => node.id).slice(0, 240),
        edgeIds: Array.from(item.edgeIds).filter((id) => edgeIds.has(id)).slice(0, 240),
        entrypointIds,
        behaviorSliceIds: moduleBehaviorSlices.map((slice) => slice.id),
        incomingModuleIds: Array.from(item.incomingModuleIds).filter((moduleId) => moduleId !== item.moduleId).slice(0, 40),
        outgoingModuleIds: Array.from(item.outgoingModuleIds).filter((moduleId) => moduleId !== item.moduleId).slice(0, 40),
        evidence: item.files.slice(0, 5).flatMap((file) => file.evidence.slice(0, 1)),
        confidence: item.nodes.length >= 8 || moduleBehaviorSlices.length ? "high" : item.files.length >= 3 ? "medium" : "low"
      } satisfies StructuralCluster;
    });
}

function buildRuntimeBoundaries(codeFacts: CodeFactGraphSnapshot, nodeById: Map<string, CodeFactNode>): RuntimeBoundary[] {
  const fileNodeByPath = new Map(codeFacts.nodes.filter((node) => node.kind === "file").map((node) => [node.filePath, node]));
  return codeFacts.files
    .filter((file) => classifyRuntimeBoundaryKind(file.path) !== undefined)
    .slice(0, 80)
    .map((file) => {
      const kind = classifyRuntimeBoundaryKind(file.path) ?? "unknown";
      const node = fileNodeByPath.get(file.path) ?? codeFacts.nodes.find((item) => item.filePath === file.path);
      return {
        id: `runtime-boundary:${safeId(`${kind}:${file.path}`)}`,
        title: `${runtimeBoundaryKindLabel(kind)}: ${file.path}`,
        kind,
        moduleId: moduleIdForPath(file.path),
        filePath: file.path,
        sourceCodeFactIds: node ? [node.id] : [],
        evidence: node ? evidenceFromNode(node) : file.evidence,
        confidence: runtimeBoundaryConfidence(kind, nodeById, file.path)
      };
    });
}

function buildEvidenceClaims(
  behaviorSlices: BehaviorSlice[],
  structuralClusters: StructuralCluster[],
  runtimeBoundaries: RuntimeBoundary[],
  edges: CodeFactEdge[],
  nodeById: Map<string, CodeFactNode>
): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  for (const slice of behaviorSlices.slice(0, 160)) {
    claims.push({
      id: `evidence-claim:${safeId(slice.id)}`,
      kind: "behavior",
      summary: `${slice.title} 由入口 ${slice.entrypointName} 和 ${slice.relationIds.length} 条邻近代码关系支撑。`,
      sourceCodeFactIds: slice.codeFactIds.slice(0, 30),
      sourceRelationKinds: unique(slice.relationIds
        .map((id) => edges.find((edge) => edge.id === id)?.kind)
        .filter(isDefined)),
      evidence: slice.evidence,
      strength: slice.confidence === "high" ? "strong" : slice.confidence === "medium" ? "medium" : "weak",
      projectionHints: ["design", "engineering", "architecture"]
    });
  }
  for (const cluster of structuralClusters.slice(0, 80)) {
    claims.push({
      id: `evidence-claim:${safeId(cluster.id)}`,
      kind: "structure",
      summary: `${cluster.title} 聚合 ${cluster.filePaths.length} 个文件、${cluster.nodeIds.length} 个代码节点和 ${cluster.edgeIds.length} 条关系。`,
      sourceCodeFactIds: cluster.nodeIds.slice(0, 40),
      sourceRelationKinds: unique(cluster.edgeIds
        .map((id) => edges.find((edge) => edge.id === id)?.kind)
        .filter(isDefined)),
      evidence: cluster.evidence,
      strength: cluster.confidence === "high" ? "strong" : cluster.confidence === "medium" ? "medium" : "weak",
      projectionHints: ["engineering", "architecture"]
    });
  }
  for (const boundary of runtimeBoundaries) {
    claims.push({
      id: `evidence-claim:${safeId(boundary.id)}`,
      kind: "runtime_boundary",
      summary: `${boundary.title} 表示可观察的运行、构建或部署边界。`,
      sourceCodeFactIds: boundary.sourceCodeFactIds,
      sourceRelationKinds: [],
      evidence: boundary.evidence,
      strength: boundary.confidence === "high" ? "strong" : boundary.confidence === "medium" ? "medium" : "weak",
      projectionHints: ["architecture", "engineering"]
    });
  }
  if (!claims.length) {
    const sampleNode = nodeById.values().next().value as CodeFactNode | undefined;
    claims.push({
      id: "evidence-claim:no-spine-candidates",
      kind: "gap",
      summary: "本地仓库证据没有提供足够入口或结构证据来生成完整 spine。",
      sourceCodeFactIds: sampleNode ? [sampleNode.id] : [],
      sourceRelationKinds: [],
      evidence: sampleNode ? evidenceFromNode(sampleNode) : [],
      strength: "weak",
      projectionHints: ["design", "engineering", "architecture"]
    });
  }
  return claims;
}

function buildCoverageLedger(
  codeFacts: CodeFactGraphSnapshot,
  behaviorSlices: BehaviorSlice[],
  structuralClusters: StructuralCluster[],
  runtimeBoundaries: RuntimeBoundary[]
): CoverageLedgerItem[] {
  const ledger: CoverageLedgerItem[] = [];
  const entrypointNodeIds = new Set(behaviorSlices.map((item) => item.entrypointNodeId));
  const clusterNodeIds = new Set(structuralClusters.flatMap((item) => item.nodeIds));
  const clusterFilePaths = new Set(structuralClusters.flatMap((item) => item.filePaths));
  const clusterEdgeIds = new Set(structuralClusters.flatMap((item) => item.edgeIds));
  const runtimeFilePaths = new Set(runtimeBoundaries.map((item) => item.filePath));

  for (const file of codeFacts.files) {
    const status = coverageStatusForFile(file, clusterFilePaths.has(file.path), runtimeFilePaths.has(file.path));
    ledger.push({
      id: `coverage:file:${safeId(file.path)}`,
      kind: "file",
      targetId: file.id,
      targetLabel: file.path,
      status,
      projectionIds: projectionsForStatus(status, file.path),
      evidence: file.evidence,
      reason: coverageReasonForFile(file, status)
    });
  }
  for (const node of codeFacts.nodes) {
    const status: CoverageLedgerStatus = entrypointNodeIds.has(node.id)
      ? "classified_entrypoint"
      : isGeneratedOrVendorPath(node.filePath)
        ? "generated_or_vendor"
        : isTestPath(node.filePath)
          ? "test_only"
          : clusterNodeIds.has(node.id)
            ? "classified_structural_cluster"
            : node.kind === "project"
              ? "internal_detail"
              : "unknown_gap";
    ledger.push({
      id: `coverage:node:${safeId(node.id)}`,
      kind: entrypointNodeIds.has(node.id) ? "entrypoint" : "symbol",
      targetId: node.id,
      targetLabel: node.qualifiedName || node.name,
      status,
      projectionIds: projectionsForStatus(status, node.filePath),
      evidence: evidenceFromNode(node),
      reason: coverageReasonForNode(node, status)
    });
  }
  for (const edge of codeFacts.edges) {
    const status: CoverageLedgerStatus = clusterEdgeIds.has(edge.id)
      ? "classified_structural_cluster"
      : isGeneratedOrVendorPath(edge.filePath ?? "")
        ? "generated_or_vendor"
        : "internal_detail";
    ledger.push({
      id: `coverage:edge:${safeId(edge.id)}`,
      kind: "edge",
      targetId: edge.id,
      targetLabel: `${edge.sourceId} -${edge.kind}-> ${edge.targetId}`,
      status,
      projectionIds: projectionsForStatus(status, edge.filePath),
      evidence: edge.evidence,
      reason: status === "classified_structural_cluster"
        ? "该关系已被结构聚类覆盖。"
        : "该关系保留为代码事实细节，后续 reconciliation 可提升为 Design/Engineering/Architecture 证据。"
    });
  }
  for (const boundary of runtimeBoundaries) {
    ledger.push({
      id: `coverage:runtime-boundary:${safeId(boundary.id)}`,
      kind: "runtime_boundary",
      targetId: boundary.id,
      targetLabel: boundary.title,
      status: "covered_by_architecture",
      projectionIds: ["architecture"],
      evidence: boundary.evidence,
      reason: "运行/构建边界是 C4 Container/System Context 候选的重要证据。"
    });
  }
  return ledger;
}

function renderCodeUnderstandingSpineMarkdown(spine: CodeUnderstandingSpine): string {
  const coverageCounts = coverageStatusCounts(spine.coverageLedger);
  return [
    "# Code-First Discovery Spine",
    "",
    `生成于：${spine.generatedAt}`,
    `事实来源：${spine.source.source} / ${spine.source.provider.name}`,
    `本地仓库证据：${spine.source.codeFactGraphGeneratedAt}`,
    "",
    "## 定位",
    "",
    "这份 spine 是 Design / Engineering / Architecture 三个 Explorer 的共享代码事实脊柱。它不是需求文档，也不是产品意图；它只描述当前代码事实中可观察的入口、结构、运行边界、证据断言和覆盖缺口。",
    "",
    "## 摘要",
    "",
    `- 文件：${spine.summary.fileCount}`,
    `- 代码节点：${spine.summary.nodeCount}`,
    `- 代码关系：${spine.summary.edgeCount}`,
    `- 行为切片：${spine.summary.behaviorSliceCount}`,
    `- 结构聚类：${spine.summary.structuralClusterCount}`,
    `- 运行/构建边界：${spine.summary.runtimeBoundaryCount}`,
    `- 证据断言：${spine.summary.evidenceClaimCount}`,
    `- 覆盖账本项：${spine.summary.coverageLedgerCount}`,
    `- 未知缺口：${spine.summary.unknownGapCount}`,
    "",
    "## 行为切片",
    "",
    "| ID | 触发 | 入口 | 模块 | 文件 | 关系 | 置信度 |",
    "| --- | --- | --- | --- | ---: | ---: | --- |",
    ...spine.behaviorSlices.slice(0, 80).map((item) => `| ${item.id} | ${item.triggerKind} | ${escapeMarkdownTable(item.entrypointName)} | ${escapeMarkdownTable(item.moduleId)} | ${item.touchedFilePaths.length} | ${item.relationIds.length} | ${item.confidence} |`),
    spine.behaviorSlices.length > 80 ? `| _截断_ | 还剩 ${spine.behaviorSlices.length - 80} 个行为切片 | | | | | |` : "",
    "",
    "## 结构聚类",
    "",
    "| ID | 模块 | 文件 | 节点 | 关系 | 行为切片 | 外部依赖 | 置信度 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...spine.structuralClusters.slice(0, 80).map((item) => `| ${item.id} | ${escapeMarkdownTable(item.moduleId)} | ${item.filePaths.length} | ${item.nodeIds.length} | ${item.edgeIds.length} | ${item.behaviorSliceIds.length} | ${item.outgoingModuleIds.length} | ${item.confidence} |`),
    "",
    "## 运行与构建边界",
    "",
    "| ID | 类型 | 文件 | 模块 | 置信度 |",
    "| --- | --- | --- | --- | --- |",
    ...spine.runtimeBoundaries.map((item) => `| ${item.id} | ${item.kind} | ${escapeMarkdownTable(item.filePath)} | ${escapeMarkdownTable(item.moduleId)} | ${item.confidence} |`),
    "",
    "## 覆盖账本摘要",
    "",
    ...Object.entries(coverageCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## 未知缺口样本",
    "",
    "| 类型 | 目标 | 原因 |",
    "| --- | --- | --- |",
    ...spine.reconciliation.gaps.slice(0, 120).map((item) => `| ${item.kind} | ${escapeMarkdownTable(item.targetLabel)} | ${escapeMarkdownTable(item.reason)} |`),
    "",
    "## 机器模型",
    "",
    `完整 JSON：${CODE_UNDERSTANDING_SPINE_JSON_RELATIVE_PATH}`,
    ""
  ].filter((line) => line !== "").join("\n");
}

function isEntrypointNode(node: CodeFactNode, file?: CodeFactFile): boolean {
  if (node.kind === "route" || node.kind === "component" || node.kind === "export") return true;
  if (node.kind === "file") return isEntrypointPath(node.filePath);
  const haystack = `${node.name} ${node.qualifiedName} ${node.filePath} ${node.signature ?? ""}`.toLowerCase();
  if (/(command|handler|route|endpoint|controller|page|screen|listener|consumer|producer|workflow|orchestr|facade|main|setup|run|execute)/.test(haystack)) return true;
  return Boolean(file && isEntrypointPath(file.path));
}

function isEntrypointPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  return /(src\/pages\/|src\/routes?\/|src-tauri\/src\/main\.rs|\/main\.(ts|tsx|js|jsx|rs)$|\/index\.(ts|tsx|js|jsx)$|commands?|routes?|controllers?|handlers?|listeners?|consumers?|producers?|workflows?|usecases?|tests?|specs?|package\.json|tauri\.conf\.json|vite\.config|tsconfig\.json|cargo\.toml)/.test(normalized);
}

function classifyTriggerKind(node: CodeFactNode): BehaviorTriggerKind {
  const haystack = `${node.kind} ${node.name} ${node.qualifiedName} ${node.filePath} ${node.signature ?? ""}`.toLowerCase();
  if (/(src\/pages\/|component|page|screen|tsx$|jsx$)/.test(haystack)) return "ui_route";
  if (/(command|cli|process\.argv|commander|yargs|bin\/|apps\/runtime-cli)/.test(haystack)) return "cli_command";
  if (/(route|endpoint|controller|api|http)/.test(haystack)) return "api_route";
  if (/(event|listener|consumer|producer|subscribe|publish|handler)/.test(haystack)) return "event_handler";
  if (/(test|spec|\.test\.|\.spec\.)/.test(haystack)) return "test";
  if (/(export|index\.(ts|tsx|js|jsx))/.test(haystack)) return "package_export";
  if (/(package\.json|tauri\.conf|vite\.config|tsconfig|cargo\.toml)/.test(haystack)) return "runtime_config";
  return "unknown";
}

function classifyRuntimeBoundaryKind(filePath: string): RuntimeBoundaryKind | undefined {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  if (normalized.endsWith("tauri.conf.json")) return "desktop_shell";
  if (normalized.endsWith("vite.config.ts") || normalized.endsWith("vite.config.js") || normalized.endsWith("index.html")) return "frontend_app";
  if (normalized === "apps/runtime-cli/package.json" || normalized.includes("runtime-cli/package.json")) return "runtime_cli";
  if (normalized.endsWith("package.json")) return "node_package";
  if (normalized.endsWith("cargo.toml")) return "rust_runtime";
  if (/(tsconfig.*\.json|package-lock\.json|pnpm-lock\.yaml|turbo\.json|rollup\.config|webpack\.config|eslint\.config)/.test(normalized)) return "build_config";
  if (/(vitest\.config|playwright\.config|jest\.config|\.test\.|\.spec\.)/.test(normalized)) return "test_runtime";
  return undefined;
}

function runtimeBoundaryConfidence(kind: RuntimeBoundaryKind, nodeById: Map<string, CodeFactNode>, filePath: string): "low" | "medium" | "high" {
  if (kind === "desktop_shell" || kind === "runtime_cli" || kind === "node_package" || kind === "rust_runtime") return "high";
  if (kind === "frontend_app" || kind === "build_config") return "medium";
  return nodeById.size && filePath ? "medium" : "low";
}

function behaviorConfidence(triggerKind: BehaviorTriggerKind, relationCount: number): "low" | "medium" | "high" {
  if ((triggerKind === "ui_route" || triggerKind === "cli_command" || triggerKind === "api_route") && relationCount >= 2) return "high";
  if (triggerKind !== "unknown") return "medium";
  return relationCount ? "medium" : "low";
}

function coverageStatusForFile(file: CodeFactFile, inCluster: boolean, isRuntimeBoundary: boolean): CoverageLedgerStatus {
  if (isRuntimeBoundary) return "covered_by_architecture";
  if (isGeneratedOrVendorPath(file.path)) return "generated_or_vendor";
  if (isTestPath(file.path)) return "test_only";
  if (inCluster) return "classified_structural_cluster";
  return "unknown_gap";
}

function coverageReasonForFile(file: CodeFactFile, status: CoverageLedgerStatus): string {
  if (status === "covered_by_architecture") return "该文件被识别为运行、构建或部署边界。";
  if (status === "generated_or_vendor") return "该文件属于生成产物、文档产物、缓存或第三方/vendor 区域，不作为当前 code-first discovery 的核心事实。";
  if (status === "test_only") return "该文件属于测试范围，可支撑行为证据，但不是用户可见行为入口本身。";
  if (status === "classified_structural_cluster") return "该文件已被结构聚类覆盖。";
  return `该文件尚未被行为切片、结构聚类或运行边界解释：${file.path}`;
}

function coverageReasonForNode(node: CodeFactNode, status: CoverageLedgerStatus): string {
  if (status === "classified_entrypoint") return "该代码节点已被识别为行为切片入口。";
  if (status === "classified_structural_cluster") return "该代码节点已被结构聚类覆盖。";
  if (status === "generated_or_vendor") return "该代码节点位于生成产物、文档产物、缓存或第三方/vendor 区域。";
  if (status === "test_only") return "该代码节点位于测试范围。";
  if (status === "internal_detail") return "该代码节点当前只作为内部代码事实保留。";
  return `该代码节点尚未被 Design/Engineering/Architecture 投影解释：${node.qualifiedName || node.name}`;
}

function projectionsForStatus(status: CoverageLedgerStatus, filePath?: string): string[] {
  if (status === "classified_entrypoint") return ["design", "engineering"];
  if (status === "classified_structural_cluster") return ["engineering", "architecture"];
  if (status === "covered_by_architecture") return ["architecture"];
  if (status === "test_only") return ["design", "engineering"];
  if (filePath && isEntrypointPath(filePath)) return ["design"];
  return [];
}

function isGeneratedOrVendorPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  return normalized.startsWith("docs/")
    || normalized.startsWith(".distinction/")
    || normalized.includes("/node_modules/")
    || normalized.includes("/dist/")
    || normalized.includes("/target/")
    || normalized.includes("/gen/")
    || normalized.includes(".generated.")
    || normalized.endsWith(".tsbuildinfo")
    || normalized.endsWith("package-lock.json");
}

function isTestPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  return /(^|\/)(tests?|__tests__)\/|(\.test|\.spec)\.(ts|tsx|js|jsx|rs)$/.test(normalized);
}

function evidenceFromNode(node: CodeFactNode): CodeFactEvidenceRef[] {
  return node.evidence.length ? node.evidence.slice(0, 3) : [{
    source: "repository_scan",
    filePath: node.filePath
  }];
}

function getModuleAccumulator(modules: Map<string, ModuleAccumulator>, moduleId: string): ModuleAccumulator {
  const existing = modules.get(moduleId);
  if (existing) return existing;
  const next: ModuleAccumulator = {
    moduleId,
    files: [],
    nodes: [],
    edgeIds: new Set(),
    incomingModuleIds: new Set(),
    outgoingModuleIds: new Set()
  };
  modules.set(moduleId, next);
  return next;
}

function moduleIdForPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "apps" || parts[0] === "packages") return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  if (parts[0] === "docs") return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "docs";
  if (parts[0] === "scripts") return "scripts";
  if (parts[0] === "examples") return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "examples";
  return parts[0] || "repository-root";
}

function triggerKindLabel(kind: BehaviorTriggerKind): string {
  if (kind === "ui_route") return "UI";
  if (kind === "cli_command") return "CLI";
  if (kind === "api_route") return "API";
  if (kind === "event_handler") return "Event";
  if (kind === "test") return "Test";
  if (kind === "package_export") return "Export";
  if (kind === "runtime_config") return "Runtime Config";
  return "Unknown";
}

function runtimeBoundaryKindLabel(kind: RuntimeBoundaryKind): string {
  return kind.replace(/_/g, " ");
}

function coverageStatusCounts(items: CoverageLedgerItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = grouped.get(groupKey);
    if (group) group.push(item);
    else grouped.set(groupKey, [item]);
  }
  return grouped;
}

function unique<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values.filter((value) => value && value.trim())));
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

function safeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
