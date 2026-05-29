import type {
  RuntimeCodeFactGraphSnapshot,
  RuntimeEngineeringSourceData,
  RuntimeGraph,
  RuntimeGraphAnchor,
  RuntimeMemoryRecord,
  RuntimeProjectedGraphViewRecord
} from "./runtimeClient";

export type EngineeringDiagramMode =
  | "c4-context"
  | "c4-container"
  | "c4-component"
  | "uml-code"
  | "uml-package"
  | "uml-component"
  | "project-plan";

export interface EngineeringSourceHealthItem {
  id: string;
  label: string;
  status: "ready" | "missing" | "partial";
  summary: string;
}

export interface EngineeringModule {
  id: string;
  name: string;
  path: string;
  role: string;
  confidence: string;
  source: "architecture_model" | "project_profile" | "code_fact_graph";
  responsibilities: string[];
  sourceMemoryIds: string[];
  sourceFiles: number;
  testFiles: number;
  symbols: number;
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "depends_on" | "imports" | "calls" | "references";
  confidence: string;
  source: "architecture_model" | "code_fact_graph";
  summary: string;
  evidenceCount: number;
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringSymbol {
  id: string;
  name: string;
  qualifiedName?: string;
  kind: string;
  moduleId: string;
  path?: string;
  language?: string;
  signature?: string;
  visibility?: "public" | "private" | "protected" | "internal";
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringSymbolMember {
  id: string;
  name: string;
  kind: string;
  signature?: string;
  visibility?: "public" | "private" | "protected" | "internal";
  ownerSymbolId?: string;
  source: "code_fact_graph" | "typescript_ast";
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringUmlRenderModel {
  syntax: "mermaid-class";
  source: string;
  warnings: string[];
  elements: EngineeringUmlElement[];
  typeCount: number;
  memberCount: number;
  relationCount: number;
}

export interface EngineeringSymbolRelation {
  id: string;
  sourceSymbolId: string;
  targetSymbolId: string;
  kind: "dependency" | "generalization" | "realization" | "association";
  label: string;
  confidence: string;
  sourceKind: string;
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringRequirement {
  id: string;
  title: string;
  summary: string;
  status?: string;
  progress?: number;
  source: "development_graph" | "memory";
}

export interface EngineeringPlanItem {
  id: string;
  moduleId: string;
  title: string;
  path: string;
  role: string;
  stage: number;
  dependsOn: string[];
  unlocks: string[];
  progress: number | null;
  status: "spec_missing" | "not_started" | "implementation_seen" | "verified" | "tracked";
  reason: string;
  evidence: string[];
}

export interface EngineeringDiagramNode {
  id: string;
  kind:
    | "person"
    | "software_system"
    | "container"
    | "component"
    | "package"
    | "class"
    | "interface"
    | "function"
    | "requirement"
    | "spec_gap";
  label: string;
  detail?: string;
  path?: string;
  role?: string;
  certainty?: "confirmed" | "inferred" | "insufficient_evidence";
  moduleId?: string;
  anchor?: RuntimeGraphAnchor;
  metadata?: Record<string, unknown>;
}

export interface EngineeringDiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: string;
  label: string;
  confidence?: string;
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringUmlElement {
  id: string;
  name: string;
  kind: string;
  memberCount: number;
  relationCount: number;
  path?: string;
  anchor?: RuntimeGraphAnchor;
}

export interface EngineeringDiagram {
  id: EngineeringDiagramMode;
  title: string;
  summary: string;
  nodes: EngineeringDiagramNode[];
  edges: EngineeringDiagramEdge[];
  uml?: EngineeringUmlRenderModel;
}

export interface EngineeringModel {
  projectName: string;
  root: string;
  modules: EngineeringModule[];
  relationships: EngineeringRelationship[];
  symbols: EngineeringSymbol[];
  symbolMembers: EngineeringSymbolMember[];
  symbolRelations: EngineeringSymbolRelation[];
  requirements: EngineeringRequirement[];
  planItems: EngineeringPlanItem[];
  sourceHealth: EngineeringSourceHealthItem[];
  specGaps: string[];
  warnings: string[];
}

const binaryExtensions = new Set([
  ".dll",
  ".so",
  ".dylib",
  ".exe",
  ".bin",
  ".pdb",
  ".lib",
  ".a",
  ".dat",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".msi"
]);

const sourceLikeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs",
  ".cs",
  ".fs",
  ".vb",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".hpp",
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".md",
  ".csproj",
  ".sln",
  ".xaml",
  ".axaml"
]);

export function deriveEngineeringModel(
  root: string,
  sourceData: RuntimeEngineeringSourceData | null,
  projectionRecords: RuntimeProjectedGraphViewRecord[] = []
): EngineeringModel {
  const projectName = sourceData?.profile?.name || basenameFromPath(root) || "Project";
  const modules = deriveModules(root, sourceData);
  const symbols = deriveSymbols(sourceData?.codeFacts, modules);
  const symbolMembers = deriveSymbolMembers(sourceData?.codeFacts, symbols);
  const relationships = deriveRelationships(sourceData, modules);
  const symbolRelations = deriveSymbolRelations(sourceData?.codeFacts, symbols, symbolMembers);
  const requirements = deriveRequirements(sourceData);
  const planItems = derivePlanItems(modules, relationships, requirements, sourceData?.legacyGraph ?? null);
  const sourceHealth = deriveSourceHealth(sourceData, projectionRecords);
  const specGaps = deriveSpecGaps(sourceData, modules, requirements, projectionRecords);
  const warnings = [
    ...(sourceData?.architecture?.warnings?.map((warning) => warning.summary) ?? []),
    ...(sourceData?.codeFacts?.warnings?.map((warning) => warning.summary) ?? [])
  ];

  return {
    projectName,
    root,
    modules,
    relationships,
    symbols,
    symbolMembers,
    symbolRelations,
    requirements,
    planItems,
    sourceHealth,
    specGaps,
    warnings
  };
}

export function buildEngineeringDiagram(
  model: EngineeringModel,
  mode: EngineeringDiagramMode,
  selectedModuleId?: string | null
): EngineeringDiagram {
  if (mode === "c4-context") return buildC4Context(model);
  if (mode === "c4-container") return buildModuleDiagram(model, "c4-container", selectedModuleId);
  if (mode === "c4-component") return buildComponentDiagram(model, selectedModuleId);
  if (mode === "uml-code") return buildUmlCodeDiagramV2(model, selectedModuleId);
  if (mode === "uml-package") return buildModuleDiagram(model, "uml-package", selectedModuleId);
  if (mode === "uml-component") return buildModuleDiagram(model, "uml-component", selectedModuleId);
  return buildPlanDiagram(model);
}

function deriveModules(root: string, sourceData: RuntimeEngineeringSourceData | null): EngineeringModule[] {
  const modules = new Map<string, EngineeringModule>();
  const architecture = sourceData?.architecture;
  const profile = sourceData?.profile;

  for (const module of architecture?.modules ?? []) {
    if (!module.path || isExcludedPath(module.path)) continue;
    const id = stableModuleId(module.id || module.path);
    modules.set(id, {
      id,
      name: module.name || module.path,
      path: normalizePath(module.path),
      role: module.role || "unknown",
      confidence: module.confidence ?? "medium",
      source: "architecture_model",
      responsibilities: module.responsibilities ?? [],
      sourceMemoryIds: module.sourceMemoryIds ?? [],
      sourceFiles: 0,
      testFiles: 0,
      symbols: 0,
      anchor: { kind: "architecture_module", id: module.id, path: module.path }
    });
  }

  for (const candidate of profile?.moduleCandidates ?? []) {
    if (!candidate.path || isExcludedPath(candidate.path)) continue;
    const id = stableModuleId(candidate.id || candidate.path);
    const existing = modules.get(id) ?? moduleByPath(modules, candidate.path);
    if (existing) {
      existing.sourceFiles = existing.sourceFiles;
      if (existing.source === "architecture_model") continue;
    }
    modules.set(id, {
      id,
      name: candidate.title || candidate.path,
      path: normalizePath(candidate.path),
      role: candidate.kind || "unknown",
      confidence: candidate.confidence || "medium",
      source: "project_profile",
      responsibilities: candidate.evidence ?? [],
      sourceMemoryIds: [],
      sourceFiles: 0,
      testFiles: 0,
      symbols: 0,
      anchor: { kind: "code_fact_node", id: candidate.id, path: candidate.path }
    });
  }

  if (!modules.size) {
    for (const modulePath of inferModulePathsFromCodeFacts(sourceData?.codeFacts)) {
      const id = stableModuleId(`module:${modulePath}`);
      modules.set(id, {
        id,
        name: modulePath,
        path: modulePath,
        role: inferRoleFromPath(modulePath),
        confidence: "medium",
        source: "code_fact_graph",
        responsibilities: [],
        sourceMemoryIds: [],
        sourceFiles: 0,
        testFiles: 0,
        symbols: 0,
        anchor: { kind: "file", id: modulePath, path: modulePath }
      });
    }
  }

  for (const file of sourceData?.codeFacts?.files ?? []) {
    if (!file.path || isExcludedPath(file.path) || !isSourceLikePath(file.path)) continue;
    const owner = moduleForPath(modules, file.path);
    if (!owner) continue;
    owner.sourceFiles += isTestPath(file.path) ? 0 : 1;
    owner.testFiles += isTestPath(file.path) ? 1 : 0;
  }

  const symbols = deriveSymbols(sourceData?.codeFacts, Array.from(modules.values()));
  for (const symbol of symbols) {
    const owner = modules.get(symbol.moduleId);
    if (owner) owner.symbols += 1;
  }

  return Array.from(modules.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function deriveSymbols(codeFacts: RuntimeCodeFactGraphSnapshot | undefined, modules: EngineeringModule[]): EngineeringSymbol[] {
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const moduleLookup = new Map(modules.map((module) => [module.path, module.id]));
  const result: EngineeringSymbol[] = [];
  for (const node of codeFacts?.nodes ?? []) {
    if (!node.filePath || isExcludedPath(node.filePath) || !isSourceLikePath(node.filePath)) continue;
    if (!["class", "interface", "component", "function", "method", "struct", "trait", "namespace", "route", "property", "field", "enum", "enum_member", "type_alias"].includes(node.kind)) continue;
    const module = moduleForPathByLookup(moduleLookup, modules, node.filePath);
    if (!module || !moduleMap.has(module)) continue;
    result.push({
      id: node.id,
      name: node.name || node.qualifiedName || node.id,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      moduleId: module,
      path: node.filePath,
      language: node.language,
      signature: node.signature,
      visibility: node.visibility,
      anchor: { kind: node.kind === "file" ? "file" : "symbol", id: node.id, path: node.filePath }
    });
  }
  return result.sort((left, right) => (left.path ?? "").localeCompare(right.path ?? "") || left.name.localeCompare(right.name));
}

function deriveSymbolMembers(
  codeFacts: RuntimeCodeFactGraphSnapshot | undefined,
  symbols: EngineeringSymbol[]
): EngineeringSymbolMember[] {
  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const typeIds = new Set(symbols.filter((symbol) => umlTypeKinds.has(symbol.kind)).map((symbol) => symbol.id));
  const memberIds = new Set(symbols.filter((symbol) => umlMemberKinds.has(symbol.kind)).map((symbol) => symbol.id));
  const ownerByMemberId = new Map<string, string>();

  for (const edge of codeFacts?.edges ?? []) {
    if (edge.kind !== "contains") continue;
    if (!typeIds.has(edge.sourceId) || !memberIds.has(edge.targetId)) continue;
    ownerByMemberId.set(edge.targetId, edge.sourceId);
  }

  const result = new Map<string, EngineeringSymbolMember>();
  for (const memberId of memberIds) {
    const symbol = symbolById.get(memberId);
    if (!symbol) continue;
    result.set(symbol.id, {
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      signature: symbol.signature,
      visibility: symbol.visibility,
      ownerSymbolId: ownerByMemberId.get(symbol.id),
      source: "code_fact_graph",
      anchor: symbol.anchor
    });
  }

  for (const type of symbols.filter((symbol) => umlTypeKinds.has(symbol.kind))) {
    for (const member of inferTypeScriptMembersFromSignature(type)) {
      result.set(member.id, member);
    }
  }

  return Array.from(result.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function inferTypeScriptMembersFromSignature(type: EngineeringSymbol): EngineeringSymbolMember[] {
  if (!["typescript", "tsx", "javascript", "jsx"].includes((type.language ?? "").toLowerCase())) return [];
  const signature = type.signature ?? "";
  if (!signature || !/^(export\s+)?(interface|type|class)\b/.test(signature.trim())) return [];
  const body = interfaceOrTypeBody(signature);
  if (!body) return [];

  const members: EngineeringSymbolMember[] = [];
  for (const entry of splitTypeMemberEntries(body)) {
    const member = parseTypeMemberEntry(type, entry);
    if (member) members.push(member);
  }
  return members;
}

function interfaceOrTypeBody(signature: string): string {
  const start = signature.indexOf("{");
  const end = signature.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return signature.slice(start + 1, end);
}

function splitTypeMemberEntries(body: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  const closingChars = ")]}>";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const previous = body[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if ("([{<".includes(char)) depth += 1;
    else if (closingChars.includes(char)) depth = Math.max(0, depth - 1);
    if ((char === ";" || char === "\n") && depth === 0) {
      const entry = body.slice(start, index).trim();
      if (entry) entries.push(entry);
      start = index + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) entries.push(tail);
  return entries.map((entry) => entry.replace(/,$/, "").trim()).filter(Boolean);
}

function parseTypeMemberEntry(type: EngineeringSymbol, entry: string): EngineeringSymbolMember | null {
  if (!entry || entry.startsWith("//") || entry.startsWith("/*")) return null;
  const normalized = entry.replace(/\s+/g, " ").trim();
  const methodMatch = normalized.match(/^([A-Za-z_$][\w$]*)\??\s*(<[^>]+>)?\s*\((.*\))\s*:?\s*(.+)?$/);
  if (methodMatch) {
    const name = methodMatch[1];
    return {
      id: `${type.id}:ast-method:${name}`,
      name,
      kind: "method",
      signature: `${name}${methodMatch[2] ?? ""}(${methodMatch[3]}${methodMatch[4] ? `: ${methodMatch[4]}` : ""}`,
      visibility: type.kind === "interface" ? "public" : undefined,
      ownerSymbolId: type.id,
      source: "typescript_ast",
      anchor: type.anchor
    };
  }
  const propertyMatch = normalized.match(/^([A-Za-z_$][\w$]*)\??\s*:\s*(.+)$/);
  if (propertyMatch) {
    const name = propertyMatch[1];
    return {
      id: `${type.id}:ast-property:${name}`,
      name,
      kind: "property",
      signature: `${name}: ${propertyMatch[2]}`,
      visibility: type.kind === "interface" ? "public" : undefined,
      ownerSymbolId: type.id,
      source: "typescript_ast",
      anchor: type.anchor
    };
  }
  return null;
}

function deriveRelationships(sourceData: RuntimeEngineeringSourceData | null, modules: EngineeringModule[]): EngineeringRelationship[] {
  const moduleIds = new Set(modules.map((module) => module.id));
  const byArchitectureId = new Map<string, string>();
  const byPath = new Map<string, string>();
  for (const module of modules) {
    byPath.set(module.path, module.id);
    byArchitectureId.set(module.id, module.id);
    if (module.anchor?.kind === "architecture_module") byArchitectureId.set(module.anchor.id, module.id);
  }

  const result = new Map<string, EngineeringRelationship>();
  for (const dependency of sourceData?.architecture?.dependencies ?? []) {
    const sourceId = byArchitectureId.get(dependency.sourceModuleId) ?? stableModuleId(dependency.sourceModuleId);
    const targetId = byArchitectureId.get(dependency.targetModuleId) ?? stableModuleId(dependency.targetModuleId);
    if (!moduleIds.has(sourceId) || !moduleIds.has(targetId) || sourceId === targetId) continue;
    const id = `rel:architecture:${sourceId}:${targetId}`;
    result.set(id, {
      id,
      sourceId,
      targetId,
      kind: "depends_on",
      confidence: dependency.confidence ?? "medium",
      source: "architecture_model",
      summary: `${moduleName(modules, sourceId)} depends on ${moduleName(modules, targetId)}`,
      evidenceCount: dependency.evidence?.length ?? 0,
      anchor: { kind: "architecture_dependency", id: dependency.id }
    });
  }

  const nodeById = new Map((sourceData?.codeFacts?.nodes ?? []).map((node) => [node.id, node]));
  for (const edge of sourceData?.codeFacts?.edges ?? []) {
    if (!["imports", "calls", "references"].includes(edge.kind)) continue;
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    const sourcePath = sourceNode?.filePath || edge.filePath;
    const targetPath = targetNode?.filePath;
    if (!sourcePath || !targetPath || isExcludedPath(sourcePath) || isExcludedPath(targetPath)) continue;
    const sourceId = moduleForPathByLookup(byPath, modules, sourcePath);
    const targetId = moduleForPathByLookup(byPath, modules, targetPath);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const id = `rel:code:${sourceId}:${targetId}:${edge.kind}`;
    const existing = result.get(id);
    if (existing) {
      existing.evidenceCount += 1;
      continue;
    }
    result.set(id, {
      id,
      sourceId,
      targetId,
      kind: edge.kind as EngineeringRelationship["kind"],
      confidence: confidenceFromNumber(edge.confidence ?? 0.5),
      source: "code_fact_graph",
      summary: `${moduleName(modules, sourceId)} ${edge.kind} ${moduleName(modules, targetId)}`,
      evidenceCount: 1,
      anchor: { kind: "code_fact_edge", id: edge.id, path: edge.filePath }
    });
  }

  return Array.from(result.values()).sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.targetId.localeCompare(right.targetId));
}

function deriveSymbolRelations(
  codeFacts: RuntimeCodeFactGraphSnapshot | undefined,
  symbols: EngineeringSymbol[],
  members: EngineeringSymbolMember[]
): EngineeringSymbolRelation[] {
  const symbolIds = new Set(symbols.map((symbol) => symbol.id));
  const nodeById = new Map((codeFacts?.nodes ?? []).map((node) => [node.id, node]));
  const ownerByMemberId = new Map(members.filter((member) => member.ownerSymbolId).map((member) => [member.id, member.ownerSymbolId as string]));
  const result = new Map<string, EngineeringSymbolRelation>();

  for (const edge of codeFacts?.edges ?? []) {
    if (!symbolIds.has(edge.sourceId) || !symbolIds.has(edge.targetId) || edge.sourceId === edge.targetId) continue;
    const relation = umlRelationKind(edge.kind, nodeById.get(edge.sourceId)?.kind, nodeById.get(edge.targetId)?.kind);
    if (!relation) continue;
    const sourceSymbolId = ownerByMemberId.get(edge.sourceId) ?? edge.sourceId;
    const targetSymbolId = ownerByMemberId.get(edge.targetId) ?? edge.targetId;
    if (!symbolIds.has(sourceSymbolId) || !symbolIds.has(targetSymbolId) || sourceSymbolId === targetSymbolId) continue;
    const id = `uml:${relation.kind}:${sourceSymbolId}:${targetSymbolId}:${edge.kind}`;
    if (result.has(id)) continue;
    result.set(id, {
      id,
      sourceSymbolId,
      targetSymbolId,
      kind: relation.kind,
      label: relation.label,
      confidence: confidenceFromNumber(edge.confidence ?? 0.5),
      sourceKind: edge.kind,
      anchor: { kind: "code_fact_edge", id: edge.id, path: edge.filePath }
    });
  }

  return Array.from(result.values());
}

function umlRelationKind(
  edgeKind: string,
  sourceKind?: string,
  targetKind?: string
): Pick<EngineeringSymbolRelation, "kind" | "label"> | null {
  const normalized = edgeKind.toLowerCase();
  if (normalized === "contains") return null;
  if (["extends", "inherits", "generalizes", "generalization"].includes(normalized)) {
    return { kind: "generalization", label: "inherits" };
  }
  if (["implements", "realizes", "realization"].includes(normalized)) {
    return { kind: "realization", label: "implements" };
  }
  if (["has_property", "property", "field", "association", "type_of", "returns"].includes(normalized)) {
    return { kind: "association", label: "association" };
  }
  if (["imports", "references", "uses", "depends_on", "instantiates"].includes(normalized)) {
    void sourceKind;
    void targetKind;
    return { kind: "dependency", label: "dependency" };
  }
  if (normalized === "calls" && targetKind && ["class", "interface", "struct", "trait", "enum"].includes(targetKind)) {
    return { kind: "dependency", label: "uses" };
  }
  return null;
}

function deriveRequirements(sourceData: RuntimeEngineeringSourceData | null): EngineeringRequirement[] {
  const result = new Map<string, EngineeringRequirement>();
  for (const node of sourceData?.legacyGraph?.nodes ?? []) {
    if (node.kind !== "requirement" && !node.id.startsWith("requirement:")) continue;
    result.set(node.id, {
      id: node.id,
      title: node.title,
      summary: node.description ?? node.title,
      status: node.status,
      progress: clampProgress(node.progress),
      source: "development_graph"
    });
  }

  for (const record of allMemoryRecords(sourceData?.memory)) {
    const haystack = `${record.type} ${record.subject} ${record.predicate} ${record.object ?? ""} ${record.summary}`.toLowerCase();
    if (!/(requirement|需求|spec|规格|acceptance|验收)/.test(haystack)) continue;
    result.set(record.id, {
      id: record.id,
      title: record.summary || record.subject,
      summary: record.object || record.summary,
      status: record.status,
      source: "memory"
    });
  }

  return Array.from(result.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function derivePlanItems(
  modules: EngineeringModule[],
  relationships: EngineeringRelationship[],
  requirements: EngineeringRequirement[],
  legacyGraph: RuntimeGraph | null
): EngineeringPlanItem[] {
  const dependencyMap = new Map<string, Set<string>>();
  const unlockMap = new Map<string, Set<string>>();
  for (const module of modules) {
    dependencyMap.set(module.id, new Set());
    unlockMap.set(module.id, new Set());
  }
  for (const relationship of relationships) {
    dependencyMap.get(relationship.sourceId)?.add(relationship.targetId);
    unlockMap.get(relationship.targetId)?.add(relationship.sourceId);
  }
  const stageByModule = computeStages(modules.map((module) => module.id), dependencyMap);
  const progressByModule = legacyProgressByModule(legacyGraph, modules);
  const hasRequirements = requirements.length > 0;

  return modules.map((module) => {
    const legacyProgress = progressByModule.get(module.id);
    const progress = hasRequirements
      ? legacyProgress ?? estimateModuleProgress(module)
      : null;
    const status: EngineeringPlanItem["status"] = !hasRequirements
      ? "spec_missing"
      : legacyProgress !== undefined
        ? "tracked"
        : module.testFiles > 0
          ? "verified"
          : module.sourceFiles > 0 || module.symbols > 0
            ? "implementation_seen"
            : "not_started";
    return {
      id: `plan:${module.id}`,
      moduleId: module.id,
      title: module.name,
      path: module.path,
      role: module.role,
      stage: stageByModule.get(module.id) ?? 0,
      dependsOn: Array.from(dependencyMap.get(module.id) ?? []),
      unlocks: Array.from(unlockMap.get(module.id) ?? []),
      progress,
      status,
      reason: hasRequirements
        ? progressReason(module, legacyProgress)
        : "缺少可追踪需求/规格，不能把代码存在量等同为完成度。",
      evidence: [
        `${module.sourceFiles} 个源码文件`,
        `${module.symbols} 个代码符号`,
        `${module.testFiles} 个测试文件`,
        module.source === "architecture_model" ? "来自架构模型补丁" : module.source === "project_profile" ? "来自项目画像" : "来自代码事实图"
      ]
    };
  }).sort((left, right) => left.stage - right.stage || left.path.localeCompare(right.path));
}

function deriveSourceHealth(
  sourceData: RuntimeEngineeringSourceData | null,
  projectionRecords: RuntimeProjectedGraphViewRecord[]
): EngineeringSourceHealthItem[] {
  return [
    {
      id: "projectProfile",
      label: "项目画像",
      status: sourceData?.profile ? "ready" : "missing",
      summary: sourceData?.profile
        ? `${sourceData.profile.moduleCandidates.length} 个模块候选，${sourceData.profile.languages.join(", ") || "语言未知"}`
        : "缺少 .distinction/cache/project-profile.json"
    },
    {
      id: "codeFacts",
      label: "代码事实",
      status: sourceData?.codeFacts ? "ready" : "missing",
      summary: sourceData?.codeFacts
        ? `${sourceData.codeFacts.nodes?.length ?? 0} 个节点，${sourceData.codeFacts.edges?.length ?? 0} 条观测关系`
        : "缺少 .distinction/cache/code-fact-graph.json"
    },
    {
      id: "architectureModel",
      label: "架构模型",
      status: sourceData?.architecture?.modules?.length ? "ready" : sourceData?.architecture ? "partial" : "missing",
      summary: sourceData?.architecture
        ? `${sourceData.architecture.modules.length} 个模块，${sourceData.architecture.dependencies.length} 条依赖边`
        : "缺少 .distinction/cache/architecture-model-patch.json"
    },
    {
      id: "requirements",
      label: "需求 / 规格",
      status: deriveRequirements(sourceData).length ? "ready" : "missing",
      summary: deriveRequirements(sourceData).length
        ? `${deriveRequirements(sourceData).length} 条需求/规格记录`
        : "没有找到需求/规格记忆或 DevelopmentGraph 需求节点"
    },
    {
      id: "projections",
      label: "投影视图",
      status: projectionRecords.length ? "ready" : "missing",
      summary: projectionRecords.length ? `已加载 ${projectionRecords.length} 个投影视图` : "没有加载投影视图记录"
    }
  ];
}

function deriveSpecGaps(
  sourceData: RuntimeEngineeringSourceData | null,
  modules: EngineeringModule[],
  requirements: EngineeringRequirement[],
  projectionRecords: RuntimeProjectedGraphViewRecord[]
): string[] {
  const gaps: string[] = [];
  if (!sourceData?.profile) gaps.push("缺少 Project Profile：无法确认项目类型、语言、框架和模块候选。");
  if (!sourceData?.codeFacts) gaps.push("缺少 Code Fact Graph：UML/C4 不能证明来自真实代码。");
  if (!modules.length) gaps.push("缺少可用模块边界：无法构造 C4 Container / UML Package。");
  if (!sourceData?.architecture?.modules?.length) gaps.push("缺少 Architecture Model：当前只能从项目画像或代码路径做临时架构表达。");
  if (!requirements.length) gaps.push("缺少需求/规格：甘特图只能显示模块依赖顺序，不能判断真实完成度。");
  if (!projectionRecords.length) gaps.push("缺少 Projection Views：锚点、ContextPacket 和评审跳转能力不完整。");
  return gaps;
}

function buildC4Context(model: EngineeringModel): EngineeringDiagram {
  const systemId = "system:project";
  const nodes: EngineeringDiagramNode[] = [
    {
      id: systemId,
      kind: "software_system",
      label: model.projectName,
      detail: `${model.modules.length} 个模块来自仓库事实`,
      certainty: model.sourceHealth.some((item) => item.id === "architectureModel" && item.status === "ready") ? "confirmed" : "inferred",
      metadata: { source: "project-profile/code-facts" }
    }
  ];
  const edges: EngineeringDiagramEdge[] = [];

  if (model.modules.some((module) => ["ui", "application"].includes(module.role))) {
    nodes.push({ id: "actor:user", kind: "person", label: "交互用户", detail: "由 UI / application 模块推断", certainty: "inferred" });
    edges.push({ id: "edge:actor:user:system", sourceId: "actor:user", targetId: systemId, kind: "uses", label: "使用" });
  }
  if (model.modules.some((module) => ["runtime", "tooling"].includes(module.role))) {
    nodes.push({ id: "actor:developer", kind: "person", label: "开发者 / 维护者", detail: "由 runtime / tooling 模块推断", certainty: "inferred" });
    edges.push({ id: "edge:actor:developer:system", sourceId: "actor:developer", targetId: systemId, kind: "operates", label: "维护" });
  }

  for (const external of inferExternalSystems(model)) {
    nodes.push({ id: external.id, kind: "software_system", label: external.label, detail: external.detail, certainty: "inferred" });
    edges.push({ id: `edge:${systemId}:${external.id}`, sourceId: systemId, targetId: external.id, kind: "integrates", label: "integrates" });
  }

  return {
    id: "c4-context",
    title: "C4 Context",
    summary: "从项目画像、模块角色和代码/Provider 事实推断系统边界与外部参与者。",
    nodes,
    edges
  };
}

function buildModuleDiagram(model: EngineeringModel, mode: "c4-container" | "uml-package" | "uml-component", selectedModuleId?: string | null): EngineeringDiagram {
  const nodeKind = mode === "uml-package" ? "package" : mode === "uml-component" ? "component" : "container";
  const focusIds = focusedModuleIds(model, selectedModuleId);
  const visibleModules = focusIds ? model.modules.filter((module) => focusIds.has(module.id)) : model.modules;
  const nodes = visibleModules.map<EngineeringDiagramNode>((module) => ({
    id: module.id,
    kind: nodeKind,
    label: module.name,
    detail: moduleDetail(module),
    path: module.path,
    role: module.role,
    certainty: module.source === "architecture_model" ? "confirmed" : "inferred",
    moduleId: module.id,
    anchor: module.anchor,
    metadata: { source: module.source, confidence: module.confidence }
  }));
  const visibleModuleIds = new Set(visibleModules.map((module) => module.id));
  const edges = model.relationships
    .filter((relationship) => visibleModuleIds.has(relationship.sourceId) && visibleModuleIds.has(relationship.targetId))
    .map<EngineeringDiagramEdge>((relationship) => ({
      id: relationship.id,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      kind: relationship.kind,
      label: relationship.kind,
      confidence: relationship.confidence,
      anchor: relationship.anchor
    }));
  const selectedModule = selectedModuleId ? model.modules.find((module) => module.id === selectedModuleId) : null;
  return {
    id: mode,
    title: selectedModule
      ? `${mode === "c4-container" ? "C4 Container" : mode === "uml-package" ? "UML Package" : "UML Component"}: ${selectedModule.name}`
      : mode === "c4-container" ? "C4 Container" : mode === "uml-package" ? "UML Package" : "UML Component",
    summary:
      selectedModule
        ? "围绕选中模块展示直接依赖与被依赖对象，避免全仓库模块堆叠。"
        : mode === "c4-container"
        ? "从模块候选和架构模型派生可运行应用、库和基础设施容器。"
        : mode === "uml-package"
          ? "从架构依赖和跨模块代码事实派生包级依赖。"
          : "使用模块角色和依赖方向表达组件级所有权。",
    nodes,
    edges
  };
}

function buildComponentDiagram(model: EngineeringModel, selectedModuleId?: string | null): EngineeringDiagram {
  const selectedModule = model.modules.find((module) => module.id === selectedModuleId) ?? model.modules.find((module) => model.symbols.some((symbol) => symbol.moduleId === module.id)) ?? model.modules[0];
  if (!selectedModule) {
    return {
      id: "c4-component",
      title: "C4 Component",
      summary: "No module boundary is available.",
      nodes: [],
      edges: []
    };
  }
  const selectedSymbols = model.symbols.filter((symbol) => symbol.moduleId === selectedModule.id).slice(0, 80);
  const nodes: EngineeringDiagramNode[] = [
    {
      id: selectedModule.id,
      kind: "container",
      label: selectedModule.name,
      detail: moduleDetail(selectedModule),
      path: selectedModule.path,
      role: selectedModule.role,
      certainty: selectedModule.source === "architecture_model" ? "confirmed" : "inferred",
      moduleId: selectedModule.id,
      anchor: selectedModule.anchor
    },
    ...selectedSymbols.map<EngineeringDiagramNode>((symbol) => ({
      id: `symbol:${symbol.id}`,
      kind: symbolKind(symbol.kind),
      label: symbol.name,
      detail: symbol.qualifiedName ?? symbol.kind,
      path: symbol.path,
      certainty: "inferred",
      moduleId: selectedModule.id,
      anchor: symbol.anchor,
      metadata: { language: symbol.language, symbolKind: symbol.kind }
    }))
  ];
  const edges: EngineeringDiagramEdge[] = selectedSymbols.slice(0, 60).map((symbol) => ({
    id: `contains:${selectedModule.id}:${symbol.id}`,
    sourceId: selectedModule.id,
    targetId: `symbol:${symbol.id}`,
    kind: "contains",
    label: "contains"
  }));
  return {
    id: "c4-component",
    title: `C4 Component: ${selectedModule.name}`,
    summary: "Components/classes/interfaces inside the selected module, derived from code facts.",
    nodes,
    edges
  };
}

function buildUmlCodeDiagram(model: EngineeringModel, selectedModuleId?: string | null): EngineeringDiagram {
  const selectedModule = model.modules.find((module) => module.id === selectedModuleId) ?? model.modules.find((module) => model.symbols.some((symbol) => symbol.moduleId === module.id)) ?? model.modules[0];
  if (!selectedModule) {
    return {
      id: "uml-code",
      title: "UML Code Diagram",
      summary: "No module boundary is available for a UML code-level diagram.",
      nodes: [],
      edges: []
    };
  }

  const umlSymbols = model.symbols
    .filter((symbol) => symbol.moduleId === selectedModule.id)
    .filter((symbol) => ["class", "interface", "struct", "trait", "function", "method", "route"].includes(symbol.kind))
    .slice(0, 90);
  const symbolNodeIds = new Set(umlSymbols.map((symbol) => `symbol:${symbol.id}`));
  const nodes = umlSymbols.map<EngineeringDiagramNode>((symbol) => ({
    id: `symbol:${symbol.id}`,
    kind: symbolKind(symbol.kind),
    label: symbol.name,
    detail: symbol.qualifiedName ?? symbol.kind,
    path: symbol.path,
    moduleId: selectedModule.id,
    anchor: symbol.anchor,
    certainty: "inferred",
    metadata: {
      umlElement: umlElementName(symbol.kind),
      language: symbol.language,
      symbolKind: symbol.kind
    }
  }));
  const edges = model.symbolRelations
    .filter((relation) => symbolNodeIds.has(`symbol:${relation.sourceSymbolId}`) && symbolNodeIds.has(`symbol:${relation.targetSymbolId}`))
    .slice(0, 140)
    .map<EngineeringDiagramEdge>((relation) => ({
      id: relation.id,
      sourceId: `symbol:${relation.sourceSymbolId}`,
      targetId: `symbol:${relation.targetSymbolId}`,
      kind: relation.kind,
      label: relation.label,
      confidence: relation.confidence,
      anchor: relation.anchor
    }));

  return {
    id: "uml-code",
    title: `UML Code Diagram: ${selectedModule.name}`,
    summary: umlSymbols.length
      ? "代码级 UML 静态结构。只绘制类、接口、函数/操作和源码可证明关系；未证明的设计意图只作为解释，不进入图。"
      : "当前模块没有可绘制的 UML 2.x 代码元素；Praxis 不会用模块或目录伪造类图。",
    nodes,
    edges
  };
}

const umlTypeKinds = new Set(["class", "interface", "struct", "trait", "enum", "component", "type_alias"]);
const umlMemberKinds = new Set(["method", "function", "property", "field", "constant", "variable", "enum_member"]);

interface UmlTypeView {
  symbol: EngineeringSymbol;
  mermaidId: string;
  members: EngineeringSymbolMember[];
}

function buildUmlCodeDiagramV2(model: EngineeringModel, selectedModuleId?: string | null): EngineeringDiagram {
  const selectedModule = model.modules.find((module) => module.id === selectedModuleId) ?? model.modules.find((module) => model.symbols.some((symbol) => symbol.moduleId === module.id)) ?? model.modules[0];
  if (!selectedModule) {
    return {
      id: "uml-code",
      title: "UML Code Diagram",
      summary: "No module boundary is available for a UML code-level diagram.",
      nodes: [],
      edges: []
    };
  }

  const uml = buildMermaidClassDiagram(model, selectedModule);
  const typeSymbols = model.symbols
    .filter((symbol) => symbol.moduleId === selectedModule.id)
    .filter((symbol) => umlTypeKinds.has(symbol.kind))
    .slice(0, 80);
  const typeIds = new Set(typeSymbols.map((symbol) => symbol.id));
  const nodes = typeSymbols.map<EngineeringDiagramNode>((symbol) => {
    const memberCount = model.symbolMembers.filter((member) => member.ownerSymbolId === symbol.id).length;
    const relationCount = model.symbolRelations.filter((relation) => relation.sourceSymbolId === symbol.id || relation.targetSymbolId === symbol.id).length;
    return {
      id: `symbol:${symbol.id}`,
      kind: symbolKind(symbol.kind),
      label: symbol.name,
      detail: symbol.qualifiedName ?? symbol.kind,
      path: symbol.path,
      moduleId: selectedModule.id,
      anchor: symbol.anchor,
      certainty: "inferred",
      metadata: {
        umlElement: umlElementName(symbol.kind),
        language: symbol.language,
        symbolKind: symbol.kind,
        signature: symbol.signature,
        memberCount,
        relationCount
      }
    };
  });
  const edges = model.symbolRelations
    .filter((relation) => typeIds.has(relation.sourceSymbolId) && typeIds.has(relation.targetSymbolId))
    .slice(0, 160)
    .map<EngineeringDiagramEdge>((relation) => ({
      id: relation.id,
      sourceId: `symbol:${relation.sourceSymbolId}`,
      targetId: `symbol:${relation.targetSymbolId}`,
      kind: relation.kind,
      label: relation.label,
      confidence: relation.confidence,
      anchor: relation.anchor
    }));

  return {
    id: "uml-code",
    title: `UML Code Diagram: ${selectedModule.name}`,
    summary: uml.typeCount
      ? `代码级 UML 类图：${uml.typeCount} 个类型、${uml.memberCount} 个成员、${uml.relationCount} 条关系，来自 CodeFactGraph 的真实符号事实。`
      : "当前模块没有可绘制的 UML 2.x 类型事实；Praxis 不会用模块或目录伪造类图。",
    nodes,
    edges,
    uml
  };
}

function buildMermaidClassDiagram(model: EngineeringModel, selectedModule: EngineeringModule): EngineeringUmlRenderModel {
  const moduleSymbols = model.symbols.filter((symbol) => symbol.moduleId === selectedModule.id);
  const types = moduleSymbols.filter((symbol) => umlTypeKinds.has(symbol.kind)).slice(0, 60);
  const warnings: string[] = [];
  if (!types.length) warnings.push("没有发现 class/interface/struct/enum 等类型符号，无法生成真正的 UML 类图。");

  const typeViews = new Map<string, UmlTypeView>();
  const usedMermaidIds = new Set<string>();
  for (const symbol of types) {
    const view = { symbol, mermaidId: mermaidIdentifier(symbol, usedMermaidIds), members: [] as EngineeringSymbolMember[] };
    typeViews.set(symbol.id, view);
  }

  let unattachedMembers = 0;
  for (const member of model.symbolMembers) {
    const view = member.ownerSymbolId ? typeViews.get(member.ownerSymbolId) : undefined;
    if (view && view.members.length < 16) view.members.push(member);
    else if (moduleSymbols.some((symbol) => symbol.id === member.id)) unattachedMembers += 1;
  }
  if (unattachedMembers > 0) warnings.push(`${unattachedMembers} 个方法/属性没有可靠 owner，未放入类图。`);

  const relationLines: string[] = [];
  const relationSymbols = new Set(typeViews.keys());
  for (const relation of model.symbolRelations) {
    if (!relationSymbols.has(relation.sourceSymbolId) || !relationSymbols.has(relation.targetSymbolId)) continue;
    const source = typeViews.get(relation.sourceSymbolId);
    const target = typeViews.get(relation.targetSymbolId);
    if (!source || !target) continue;
    relationLines.push(mermaidRelationLine(source.mermaidId, target.mermaidId, relation));
    if (relationLines.length >= 120) break;
  }

  const lines = typeViews.size ? ["classDiagram", `  namespace ${mermaidNamespaceName(selectedModule.name)} {`] : [];
  for (const view of typeViews.values()) {
    lines.push(`    class ${view.mermaidId} {`);
    const stereotype = mermaidStereotype(view.symbol.kind);
    if (stereotype) lines.push(`      <<${stereotype}>>`);
    for (const member of view.members) {
      const memberLine = mermaidMemberLine(member);
      if (memberLine) lines.push(`      ${memberLine}`);
    }
    lines.push("    }");
  }
  if (typeViews.size) {
    lines.push("  }");
    lines.push(...relationLines);
  }

  return {
    syntax: "mermaid-class",
    source: lines.join("\n"),
    warnings,
    elements: Array.from(typeViews.values()).map((view) => ({
      id: view.symbol.id,
      name: view.symbol.name,
      kind: view.symbol.kind,
      memberCount: view.members.length,
      relationCount: model.symbolRelations.filter((relation) => relation.sourceSymbolId === view.symbol.id || relation.targetSymbolId === view.symbol.id).length,
      path: view.symbol.path,
      anchor: view.symbol.anchor
    })),
    typeCount: typeViews.size,
    memberCount: Array.from(typeViews.values()).reduce((sum, view) => sum + view.members.length, 0),
    relationCount: relationLines.length
  };
}

function mermaidIdentifier(symbol: EngineeringSymbol, used: Set<string>): string {
  const source = symbol.qualifiedName || symbol.name || symbol.id;
  const segments = source
    .split(/[.:/\\#]+/)
    .map((segment) => sanitizeMermaidIdentifierPart(segment))
    .filter(Boolean);
  const base = sanitizeMermaidIdentifier(segments.slice(-4).join("_") || symbol.id || "UmlElement");
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function mermaidNamespaceName(value: string): string {
  return sanitizeMermaidIdentifier(value || "Module");
}

function mermaidStereotype(kind: string): string | undefined {
  if (kind === "interface" || kind === "trait") return "interface";
  if (kind === "struct") return "struct";
  if (kind === "enum") return "enumeration";
  return undefined;
}

function mermaidRelationLine(sourceId: string, targetId: string, relation: EngineeringSymbolRelation): string {
  const label = mermaidLabel(relation.label);
  if (relation.kind === "generalization") return `  ${targetId} <|-- ${sourceId}${label ? ` : ${label}` : ""}`;
  if (relation.kind === "realization") return `  ${targetId} <|.. ${sourceId}${label ? ` : ${label}` : ""}`;
  if (relation.kind === "association") return `  ${sourceId} --> ${targetId}${label ? ` : ${label}` : ""}`;
  return `  ${sourceId} ..> ${targetId}${label ? ` : ${label}` : ""}`;
}

function mermaidMemberLine(member: EngineeringSymbolMember): string {
  const visibility = mermaidVisibility(member.visibility);
  const name = sanitizeMermaidMemberName(member.name);
  if (!name) return "";
  if (member.kind === "method" || member.kind === "function") return `${visibility}${name}()`;
  const typeName = normalizeMemberType(member.signature, member.name);
  return `${visibility}${name}${typeName ? ` : ${typeName}` : ""}`;
}

function normalizeMemberType(signature: string | undefined, memberName: string): string {
  const raw = (signature ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const escapedName = escapeRegExp(memberName);
  const colonMatch = raw.match(new RegExp(`${escapedName}\\??\\s*:\\s*([^=;,){}]+)`));
  const csharpPropertyMatch = raw.match(new RegExp(`\\b([A-Za-z_][\\w.<>?\\[\\], ]*)\\s+${escapedName}\\b`));
  const type = (colonMatch?.[1] ?? csharpPropertyMatch?.[1] ?? "")
    .replace(/\b(public|private|protected|internal|static|readonly|virtual|override|async|sealed|partial|required)\b/g, "")
    .trim();
  return sanitizeMermaidTypeLabel(type);
}

function mermaidVisibility(value: EngineeringSymbolMember["visibility"]): string {
  if (value === "public") return "+";
  if (value === "private") return "-";
  if (value === "protected") return "#";
  if (value === "internal") return "~";
  return "";
}

function mermaidLabel(value: string): string {
  return value.replace(/["<>:{}()[\]|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function sanitizeMermaidIdentifier(value: string): string {
  const sanitized = sanitizeMermaidIdentifierPart(value) || "UmlElement";
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `UML_${sanitized}`;
}

function sanitizeMermaidIdentifierPart(value: string): string {
  return value
    .replace(/`[^`]*`/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeMermaidMemberName(value: string): string {
  const name = value
    .replace(/[`"']/g, "")
    .replace(/\?.*$/, "")
    .replace(/\(.*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) return "";
  return /^[A-Za-z_]/.test(name) ? name : `member_${name}`;
}

function sanitizeMermaidTypeLabel(value: string): string {
  return value
    .replace(/[{};]/g, "")
    .replace(/[<>{}()[\]|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 48);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function focusedModuleIds(model: EngineeringModel, selectedModuleId?: string | null): Set<string> | null {
  if (!selectedModuleId) return null;
  const ids = new Set<string>([selectedModuleId]);
  for (const relationship of model.relationships) {
    if (relationship.sourceId === selectedModuleId) ids.add(relationship.targetId);
    if (relationship.targetId === selectedModuleId) ids.add(relationship.sourceId);
  }
  return ids;
}

function buildPlanDiagram(model: EngineeringModel): EngineeringDiagram {
  const nodes: EngineeringDiagramNode[] = model.planItems.map((item) => ({
    id: item.id,
    kind: item.status === "spec_missing" ? "spec_gap" : "requirement",
    label: item.title,
    detail: item.reason,
    path: item.path,
    role: item.role,
    moduleId: item.moduleId,
    metadata: { stage: item.stage, progress: item.progress, status: item.status }
  }));
  const edges: EngineeringDiagramEdge[] = [];
  for (const item of model.planItems) {
    for (const dependency of item.dependsOn) {
      edges.push({
        id: `plan-edge:${dependency}:${item.moduleId}`,
        sourceId: `plan:${dependency}`,
        targetId: item.id,
        kind: "precedes",
        label: "前置于"
      });
    }
  }
  return {
    id: "project-plan",
    title: "项目计划 / 甘特图",
    summary: "从需求、模块依赖和任务记忆派生模块顺序、依赖方向和完成度置信。",
    nodes,
    edges
  };
}

function inferExternalSystems(model: EngineeringModel): { id: string; label: string; detail: string }[] {
  const haystack = `${model.modules.map((module) => `${module.name} ${module.path} ${module.role}`).join(" ")} ${model.symbols
    .map((symbol) => `${symbol.name} ${symbol.qualifiedName ?? ""}`)
    .join(" ")}`.toLowerCase();
  const result: { id: string; label: string; detail: string }[] = [];
  if (haystack.includes("deepseek") || haystack.includes("openai") || haystack.includes("model-router")) {
    result.push({ id: "external:model-provider", label: "模型提供方", detail: "从模型/Provider 代码事实中检测到。" });
  }
  if (haystack.includes("pi") || haystack.includes("coding-agent")) {
    result.push({ id: "external:coding-worker", label: "外部 Coding Worker", detail: "从 Coding Worker / Pi 集成代码中检测到。" });
  }
  if (haystack.includes("codegraph")) {
    result.push({ id: "external:codegraph", label: "Codegraph", detail: "从 codegraph provider 集成中检测到。" });
  }
  return result;
}

function inferModulePathsFromCodeFacts(codeFacts: RuntimeCodeFactGraphSnapshot | undefined): string[] {
  const paths = new Set<string>();
  for (const file of codeFacts?.files ?? []) {
    if (!file.path || isExcludedPath(file.path) || !isSourceLikePath(file.path)) continue;
    const normalized = normalizePath(file.path);
    const parts = normalized.split("/");
    if (parts[0] === "apps" && parts[1]) paths.add(`apps/${parts[1]}`);
    else if (parts[0] === "packages" && parts[1]) paths.add(`packages/${parts[1]}`);
    else if (/^[A-Za-z0-9_.-]+$/.test(parts[0]) && parts[0]) paths.add(parts[0]);
  }
  return Array.from(paths).sort();
}

function moduleByPath(modules: Map<string, EngineeringModule>, path: string): EngineeringModule | undefined {
  const normalized = normalizePath(path);
  return Array.from(modules.values()).find((module) => module.path === normalized);
}

function moduleForPath(modules: Map<string, EngineeringModule>, path: string): EngineeringModule | undefined {
  const normalized = normalizePath(path);
  return Array.from(modules.values())
    .filter((module) => normalized === module.path || normalized.startsWith(`${module.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function moduleForPathByLookup(pathToId: Map<string, string>, modules: EngineeringModule[], path: string): string | undefined {
  const normalized = normalizePath(path);
  const match = modules
    .filter((module) => normalized === module.path || normalized.startsWith(`${module.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
  return match ? pathToId.get(match.path) ?? match.id : undefined;
}

function stableModuleId(value: string): string {
  return value.startsWith("module:") ? value : `module:${normalizePath(value).replace(/^module:/, "")}`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function isExcludedPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  if (
    /(^|\/)(node_modules|\.git|\.distinction\/runs|\.distinction\/reviews|target|dist|build|bin|obj|coverage|artifacts|publish-docker|release|debug)(\/|$)/.test(
      normalized
    )
  ) {
    return true;
  }
  return binaryExtensions.has(extensionOf(normalized));
}

function isSourceLikePath(path: string): boolean {
  const extension = extensionOf(path.toLowerCase());
  return sourceLikeExtensions.has(extension) || !extension;
}

function isTestPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(__tests__|tests?|specs?)(\/|$)/.test(normalized) || /\.(test|spec)\.[a-z0-9]+$/i.test(normalized);
}

function extensionOf(path: string): string {
  const match = path.match(/(\.[a-z0-9]+)$/i);
  return match?.[1].toLowerCase() ?? "";
}

function inferRoleFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("desktop") || lower.includes("ui") || lower.includes("shell") || lower.includes("main")) return "ui";
  if (lower.includes("runtime") || lower.includes("cli")) return "runtime";
  if (lower.includes("schema") || lower.includes("model") || lower.includes("contract")) return "domain";
  if (lower.includes("provider") || lower.includes("adapter") || lower.includes("tool") || lower.includes("trace")) return "infrastructure";
  if (lower.includes("knowledge") || lower.includes("store")) return "storage";
  if (lower.includes("test")) return "test";
  if (lower.includes("docs")) return "docs";
  return path.startsWith("apps/") ? "application" : "unknown";
}

function moduleName(modules: EngineeringModule[], id: string): string {
  return modules.find((module) => module.id === id)?.name ?? id;
}

function moduleDetail(module: EngineeringModule): string {
  return `${module.role} / ${module.sourceFiles} 个源码文件 / ${module.symbols} 个符号 / ${module.testFiles} 个测试文件`;
}

function symbolKind(kind: string): EngineeringDiagramNode["kind"] {
  if (kind === "class" || kind === "struct") return "class";
  if (kind === "interface" || kind === "trait") return "interface";
  if (kind === "function" || kind === "method" || kind === "route") return "function";
  return "component";
}

function umlElementName(kind: string): string {
  if (kind === "class" || kind === "struct") return "UML Class";
  if (kind === "interface" || kind === "trait") return "UML Interface";
  if (kind === "function" || kind === "method" || kind === "route") return "UML Operation / behavior";
  return "UML Component candidate";
}

function confidenceFromNumber(value: number): string {
  if (value >= 0.8) return "high";
  if (value >= 0.5) return "medium";
  return "low";
}

function allMemoryRecords(memory: RuntimeEngineeringSourceData["memory"] | undefined): RuntimeMemoryRecord[] {
  if (!memory) return [];
  return [...memory.facts, ...memory.inferences, ...memory.candidates, ...memory.confirmations, ...memory.decisions, ...memory.findings];
}

function computeStages(moduleIds: string[], dependencyMap: Map<string, Set<string>>): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (memo.has(id)) return memo.get(id) ?? 0;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const dependencies = Array.from(dependencyMap.get(id) ?? []);
    const stage = dependencies.length ? Math.max(...dependencies.map((dependency) => visit(dependency) + 1)) : 0;
    visiting.delete(id);
    memo.set(id, stage);
    return stage;
  };
  for (const id of moduleIds) visit(id);
  return memo;
}

function legacyProgressByModule(graph: RuntimeGraph | null, modules: EngineeringModule[]): Map<string, number> {
  const result = new Map<string, number>();
  if (!graph) return result;
  for (const module of modules) {
    const match = graph.nodes.find((node) => {
      const metadataPath = typeof node.metadata?.path === "string" ? normalizePath(node.metadata.path) : "";
      return node.id === module.id || normalizePath(node.id).includes(module.path) || metadataPath === module.path || node.title === module.name;
    });
    if (match) result.set(module.id, clampProgress(match.progress));
  }
  return result;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function estimateModuleProgress(module: EngineeringModule): number {
  let progress = 0;
  if (module.sourceFiles > 0) progress += 0.35;
  if (module.symbols > 0) progress += 0.2;
  if (module.testFiles > 0) progress += 0.25;
  if (module.confidence === "high") progress += 0.1;
  return clampProgress(progress);
}

function progressReason(module: EngineeringModule, legacyProgress?: number): string {
  if (legacyProgress !== undefined) return "使用 DevelopmentGraph 中已有进度记录。";
  if (module.testFiles > 0) return "检测到源码和测试文件，但仍需要需求验收映射确认完成度。";
  if (module.sourceFiles > 0 || module.symbols > 0) return "检测到实现代码，但缺少测试/验收证据。";
  return "未检测到该模块下的实现代码。";
}

function basenameFromPath(value: string): string {
  return value.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? value;
}
