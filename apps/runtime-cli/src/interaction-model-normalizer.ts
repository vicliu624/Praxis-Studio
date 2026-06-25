import {
  InteractionModelCandidateSchema,
  type InteractionModelCandidate
} from "@praxis/schema";

type DesignStoryRelationKind = Exclude<InteractionModelCandidate["relations"][number]["kind"], "actor_participates">;
type UseCaseDrilldownDiagramKind = InteractionModelCandidate["useCaseDrilldowns"][number]["kind"];
type UseCaseDrilldownCoverage = InteractionModelCandidate["useCaseDrilldowns"][number]["coverage"];
export function parseInteractionModelCandidate(content: string, root: string, generatedAt: string): InteractionModelCandidate {
  const parsed = safeJson(content);
  const candidate = isRecord(parsed) && isRecord(parsed.interactionModel) ? parsed.interactionModel : parsed;
  if (!isRecord(candidate)) {
    throw new Error("Design Discovery response did not contain an InteractionModelCandidate object.");
  }
  return InteractionModelCandidateSchema.parse(normalizeInteractionModelCandidate(candidate, root, generatedAt));
}

export function normalizeInteractionModelCandidate(
  raw: Record<string, unknown>,
  root: string,
  generatedAt: string
): Record<string, unknown> {
  const warnings = stringArray(raw.warnings);
  const allIds = new Set<string>();
  let contexts = arrayRecords(raw.contexts).map((item, index) =>
    normalizeDesignContextCandidate(item, index, allIds, warnings, index === 0 ? "system" : "business_module")
  );
  if (!contexts.length) {
    contexts.push(normalizeDesignContextCandidate({
      id: "context:project-design",
      title: "Project Design",
      summary: "Fallback design context created because the agent did not return a context.",
      kind: "system",
      scope: "Project Design",
      responsibility: "Fallback design context created because the agent did not return a context.",
      businessTerms: ["Project Design"]
    }, 0, allIds, warnings, "system"));
    warnings.push("Design Discovery response did not include a context; runtime created a fallback Project Design context.");
  }
  const initialContextIds = new Set(contexts.map((item) => String(item.id)));
  const actors = arrayRecords(raw.actors).map((item, index) => ({
    ...normalizeDesignCandidateBase(item, "actor", index, allIds, warnings),
    type: designActorType(item.type)
  }));
  const externalSystems = arrayRecords(raw.externalSystems).map((item, index) =>
    normalizeDesignCandidateBase(item, "external-system", index, allIds, warnings)
  );
  let useCases = arrayRecords(raw.useCases).map((item, index) => {
    const base = normalizeDesignCandidateBase(item, "use-case", index, allIds, warnings);
    const contextId = stringValue(item.contextId);
    return {
      ...base,
      contextId: contextId && initialContextIds.has(contextId) ? contextId : String(contexts[0]?.id ?? "context:project-design"),
      primaryActorIds: stringArray(item.primaryActorIds),
      supportingActorIds: stringArray(item.supportingActorIds),
      externalSystemIds: stringArray(item.externalSystemIds),
      entryPointIds: stringArray(item.entryPointIds),
      trigger: stringValue(item.trigger),
      preconditions: stringArray(item.preconditions),
      postconditions: stringArray(item.postconditions),
      mainSuccessScenario: nonEmptyStringArray(item.mainSuccessScenario, [stringOr(item.summary, "Candidate scenario needs user review.")]),
      alternativeFlows: stringArray(item.alternativeFlows),
      failureFlows: stringArray(item.failureFlows)
    };
  });
  contexts = normalizeContextParentLinks(contexts, warnings);
  const relations = arrayRecords(raw.relations).flatMap((item, index) => {
    const sourceId = stringValue(item.sourceId);
    const targetId = stringValue(item.targetId);
    if (!sourceId || !targetId) {
      warnings.push(`Dropped relation ${index + 1} because sourceId or targetId was missing.`);
      return [];
    }
    return [{
      ...normalizeDesignTraceability(item, warnings),
      id: normalizeDesignId("relation", item, index, allIds),
      kind: designRelationKind(item.kind),
      sourceId,
      targetId,
      summary: stringOr(item.summary, `${designRelationKind(item.kind)} ${sourceId} -> ${targetId}`),
      status: designCandidateStatus(item.status),
      confidence: designConfidence(item.confidence)
    }];
  });
  const useCaseDrilldowns = ensureUseCaseDrilldownDiagrams(
    arrayRecords(raw.useCaseDrilldowns).flatMap((item, index) =>
      normalizeUseCaseDrilldownDiagram(item, index, useCases, allIds, warnings)
    ),
    useCases,
    allIds
  );
  const questions = normalizeDesignQuestions(raw.questions, allIds);
  return {
    schemaVersion: "praxis.interactionModel.v1",
    root,
    generatedAt: stringOr(raw.generatedAt, generatedAt),
    source: raw.source === "user" || raw.source === "imported" ? raw.source : "agent",
    contexts,
    actors,
    externalSystems,
    useCases,
    relations,
    useCaseDrilldowns,
    questions,
    warnings: unique(warnings.length ? warnings : ["Design Discovery output normalized by runtime before schema validation."])
  };
}

function normalizeUseCaseDrilldownDiagram(
  item: Record<string, unknown>,
  index: number,
  useCases: Record<string, unknown>[],
  allIds: Set<string>,
  warnings: string[]
): Record<string, unknown>[] {
  const useCaseIds = new Set(useCases.map((useCase) => String(useCase.id)));
  const useCaseId = stringValue(item.useCaseId);
  if (!useCaseId || !useCaseIds.has(useCaseId)) {
    warnings.push(`Dropped drilldown diagram ${index + 1} because useCaseId was missing or unknown.`);
    return [];
  }
  const kind = designDrilldownKind(item.kind);
  const useCase = useCases.find((candidate) => candidate.id === useCaseId);
  const title = stringOr(item.title, defaultDrilldownTitle(kind, stringOr(useCase?.title, useCaseId)));
  const summary = stringOr(item.summary, `${title} 的候选设计说明。`);
  const coverage = normalizeUseCaseDrilldownCoverage(item, kind, useCase, summary);
  const fallbackMermaid = fallbackDrilldownMermaid(kind, useCase);
  return [{
    ...normalizeDesignTraceability(item, warnings),
    id: normalizeDesignId(designDrilldownIdPrefix(kind), item, index, allIds),
    useCaseId,
    kind,
    title,
    summary,
    coverage,
    explanation: normalizeUseCaseDrilldownExplanation(item, kind, useCase, coverage, summary),
    status: designCandidateStatus(item.status),
    confidence: designConfidence(item.confidence),
    mermaid: normalizeMermaidSource(item.mermaid, fallbackMermaid)
  }];
}

export function ensureUseCaseDrilldownDiagrams(
  diagrams: Record<string, unknown>[],
  useCases: Record<string, unknown>[],
  allIds: Set<string>
): Record<string, unknown>[] {
  const next = [...diagrams];
  for (const useCase of useCases) {
    const useCaseId = String(useCase.id);
    const kinds = new Set(next.filter((diagram) => diagram.useCaseId === useCaseId).map((diagram) => diagram.kind));
    const requiredKinds: UseCaseDrilldownDiagramKind[] = ["activity", "sequence", "class_collaboration"];
    for (const kind of requiredKinds) {
      if (kinds.has(kind)) continue;
      next.push(defaultDrilldownDiagram(useCase, kind, allIds));
    }
  }
  return next;
}

function defaultDrilldownDiagram(
  useCase: Record<string, unknown>,
  kind: UseCaseDrilldownDiagramKind,
  allIds: Set<string>
): Record<string, unknown> {
  const useCaseId = String(useCase.id);
  const title = defaultDrilldownTitle(kind, stringOr(useCase.title, useCaseId));
  return {
    ...designTraceability("design-discovery:drilldown-default", [
      "该下钻图由 runtime 根据 Use Case 基础字段补出；当前没有足够代码关系证据，不能当作已完成的代码事实解释。"
    ], []),
    id: nextNormalizedDesignId(designDrilldownIdPrefix(kind), `${useCaseId}-${kind}`, 0, allIds),
    useCaseId,
    kind,
    title,
    summary: `${title}，用于解释 Use Case「${stringOr(useCase.title, useCaseId)}」的第一层设计。`,
    coverage: defaultUseCaseDrilldownCoverage(kind, useCase),
    explanation: defaultUseCaseDrilldownExplanation(kind, useCase, defaultUseCaseDrilldownCoverage(kind, useCase)),
    status: "candidate",
    confidence: "medium",
    mermaid: fallbackDrilldownMermaid(kind, useCase)
  };
}

export function normalizeUseCaseDrilldownCoverage(
  item: Record<string, unknown>,
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined,
  fallbackSummary: string
): UseCaseDrilldownCoverage {
  const coverage = isRecord(item.coverage) ? item.coverage : {};
  const defaults = defaultUseCaseDrilldownCoverage(kind, useCase);
  return {
    scenario: stringOr(coverage.scenario ?? item.scenario, defaults.scenario),
    coveredUseCaseFlows: nonEmptyStringArray(coverage.coveredUseCaseFlows ?? item.coveredUseCaseFlows, defaults.coveredUseCaseFlows),
    boundary: stringOr(coverage.boundary ?? item.boundary ?? item.coverageBoundary, defaults.boundary),
    notCovered: nonEmptyStringArray(coverage.notCovered ?? item.notCovered, defaults.notCovered),
    rationale: stringOr(coverage.rationale ?? item.rationale, fallbackSummary || defaults.rationale),
    implementationScope: normalizeUseCaseImplementationScope(coverage.implementationScope ?? item.implementationScope, kind, useCase, item)
  };
}

function defaultUseCaseDrilldownCoverage(
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined
): UseCaseDrilldownCoverage {
  const title = stringOr(useCase?.title, "候选用例");
  return {
    scenario: defaultDrilldownScenario(kind, title),
    coveredUseCaseFlows: defaultCoveredUseCaseFlows(kind, useCase),
    boundary: defaultDrilldownBoundary(kind, title),
    notCovered: defaultDrilldownNotCovered(kind),
    rationale: defaultDrilldownRationale(kind, title),
    implementationScope: defaultUseCaseImplementationScope(kind, useCase, {})
  };
}

export function normalizeUseCaseDrilldownExplanation(
  item: Record<string, unknown>,
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined,
  coverage: UseCaseDrilldownCoverage,
  fallbackSummary: string
): InteractionModelCandidate["useCaseDrilldowns"][number]["explanation"] {
  const explanation = isRecord(item.explanation) ? item.explanation : {};
  const defaults = defaultUseCaseDrilldownExplanation(kind, useCase, coverage);
  const implementation = stringOr(explanation.implementation ?? item.implementationExplanation ?? item.implementation, defaults.implementation);
  return {
    business: stringOr(explanation.business ?? item.businessExplanation ?? item.business, defaults.business),
    uml: stringOr(explanation.uml ?? item.umlExplanation ?? item.uml, defaults.uml),
    design: stringOr(explanation.design ?? item.designExplanation ?? item.design, fallbackSummary || defaults.design),
    implementation: implementation.includes("实现定位以范围锚点为准") ? defaults.implementation : implementation
  };
}

function defaultUseCaseDrilldownExplanation(
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined,
  coverage: UseCaseDrilldownCoverage
): InteractionModelCandidate["useCaseDrilldowns"][number]["explanation"] {
  const title = stringOr(useCase?.title, "候选用例");
  return {
    business: defaultDrilldownBusinessExplanation(kind, title, coverage),
    uml: defaultDrilldownUmlExplanation(kind, title),
    design: defaultDrilldownDesignExplanation(kind, title),
    implementation: defaultDrilldownImplementationExplanation(coverage.implementationScope)
  };
}

function normalizeUseCaseImplementationScope(
  value: unknown,
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined,
  item: Record<string, unknown>
): InteractionModelCandidate["useCaseDrilldowns"][number]["coverage"]["implementationScope"] {
  const record = isRecord(value) ? value : {};
  const rawEvidence = arrayRecords(item.evidence);
  const evidenceFiles = unique(rawEvidence.flatMap((evidence) => stringValue(evidence.filePath) ? [String(evidence.filePath)] : []));
  const evidenceAnchors = evidenceCodeAnchors([...arrayRecords(useCase?.evidence), ...rawEvidence]);
  const defaults = defaultUseCaseImplementationScope(kind, useCase, item);
  return {
    modules: normalizeImplementationModules(nonEmptyStringArray(record.modules ?? item.modules, defaults.modules)),
    entryPoints: nonEmptyStringArray(record.entryPoints ?? item.entryPoints, defaults.entryPoints),
    keyFiles: nonEmptyStringArray(record.keyFiles ?? record.files ?? item.keyFiles, evidenceFiles.length ? evidenceFiles : defaults.keyFiles),
    codeAnchors: humanReadableCodeAnchors(nonEmptyStringArray(record.codeAnchors ?? item.codeAnchors, evidenceAnchors.length ? evidenceAnchors : defaults.codeAnchors)),
    outOfScopeCode: nonEmptyStringArray(record.outOfScopeCode ?? item.outOfScopeCode, defaults.outOfScopeCode)
  };
}

function normalizeImplementationModules(values: string[]): string[] {
  return unique(values.map((value) => {
    const parts = value.split(/[\\/]/).filter(Boolean);
    if (parts[0] === "apps" || parts[0] === "packages") return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    return value;
  }).filter((value) => value.trim().length > 0));
}

function defaultUseCaseImplementationScope(
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined,
  item: Record<string, unknown>
): InteractionModelCandidate["useCaseDrilldowns"][number]["coverage"]["implementationScope"] {
  const sourceSpecPaths = stringArray(useCase?.sourceSpecPaths);
  const codeAnchors = evidenceCodeAnchors([...arrayRecords(useCase?.evidence), ...arrayRecords(item.evidence)]);
  const keyFiles = sourceSpecPaths.filter((item) => isCodeEvidencePath(item));
  return {
    modules: modulesFromDesignPaths(keyFiles),
    entryPoints: stringArray(useCase?.entryPointIds),
    keyFiles,
    codeAnchors,
    outOfScopeCode: defaultDrilldownOutOfScopeCode(kind)
  };
}

function evidenceCodeAnchors(evidence: Record<string, unknown>[]): string[] {
  return unique(evidence.flatMap((item) => {
    const filePath = stringValue(item.filePath);
    if (!filePath || filePath === "." || isInternalCodeAnchor(filePath)) return [];
    const startLine = positiveInteger(item.startLine);
    const endLine = positiveInteger(item.endLine);
    if (!startLine) return [filePath];
    return [`${filePath}#L${startLine}${endLine && endLine !== startLine ? `-L${endLine}` : ""}`];
  }));
}

function humanReadableCodeAnchors(values: string[]): string[] {
  return unique(values.filter((value) => !isInternalCodeAnchor(value)));
}

function isInternalCodeAnchor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^(codegraph|sourcecodefact|source-code-fact):/.test(normalized)
    || /^code:(file|symbol|function|class|edge|call|import|contains):/.test(normalized)
    || /^mem:fact:code/.test(normalized);
}

function isCodeEvidencePath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized === ".") return false;
  if (normalized.startsWith("docs/")) return false;
  if (isInternalCodeAnchor(normalized)) return false;
  return true;
}

function modulesFromDesignPaths(paths: string[]): string[] {
  return unique(paths.flatMap((item) => {
    const parts = item.split(/[\\/]/).filter(Boolean);
    if (parts[0] === "apps" || parts[0] === "packages") return parts.length >= 2 ? [`${parts[0]}/${parts[1]}`] : [parts[0]];
    return parts[0] ? [parts[0]] : [];
  }));
}

function defaultDrilldownOutOfScopeCode(kind: UseCaseDrilldownDiagramKind): string[] {
  if (kind === "activity") return ["底层函数调用链", "DTO/Mapper/Repository 细节"];
  if (kind === "sequence") return ["非当前场景的全部调用链", "未被证据支持的异步/补偿路径"];
  if (kind === "state_machine") return ["页面临时状态", "无业务生命周期语义的技术状态"];
  return ["仓库全量类图", "无 Use Case 职责解释价值的技术类"];
}

function normalizeDesignContextCandidate(
  item: Record<string, unknown>,
  index: number,
  allIds: Set<string>,
  warnings: string[],
  defaultKind: InteractionModelCandidate["contexts"][number]["kind"]
): Record<string, unknown> {
  const base = normalizeDesignCandidateBase(item, "context", index, allIds, warnings);
  const title = stringOr(base.title, `context ${index + 1}`);
  const summary = stringOr(base.summary, `${title} 的候选业务边界。`);
  return {
    ...base,
    kind: designContextKind(item.kind, defaultKind),
    parentContextId: stringValue(item.parentContextId),
    scope: stringOr(item.scope, summary),
    responsibility: stringOr(item.responsibility, summary),
    businessTerms: nonEmptyStringArray(item.businessTerms ?? item.terms ?? item.businessVocabulary, inferBusinessTerms(`${title} ${summary}`))
  };
}

function normalizeContextParentLinks(contexts: Record<string, unknown>[], warnings: string[]): Record<string, unknown>[] {
  const ids = new Set(contexts.map((context) => String(context.id)));
  return contexts.map((context, index) => {
    const parentContextId = stringValue(context.parentContextId);
    const next = {
      ...context,
      kind: designContextKind(context.kind, index === 0 ? "system" : "business_module"),
      scope: stringOr(context.scope, stringOr(context.summary, stringOr(context.title, "候选业务边界"))),
      responsibility: stringOr(context.responsibility, stringOr(context.summary, stringOr(context.title, "候选业务边界职责"))),
      businessTerms: nonEmptyStringArray(context.businessTerms, inferBusinessTerms(`${stringOr(context.title, "")} ${stringOr(context.summary, "")}`))
    };
    if (!parentContextId) return next;
    if (parentContextId === String(context.id) || !ids.has(parentContextId)) {
      warnings.push(`Dropped invalid parentContextId "${parentContextId}" from context "${String(context.id)}".`);
      const withoutParent: Record<string, unknown> = { ...next };
      delete withoutParent.parentContextId;
      return withoutParent;
    }
    return { ...next, parentContextId };
  });
}

function inferBusinessTerms(value: string): string[] {
  const matches = value.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,}/g) ?? [];
  return unique(matches.slice(0, 8));
}

function normalizeDesignCandidateBase(
  item: Record<string, unknown>,
  prefix: string,
  index: number,
  allIds: Set<string>,
  warnings: string[]
): Record<string, unknown> {
  return {
    ...normalizeDesignTraceability(item, warnings),
    id: normalizeDesignId(prefix, item, index, allIds),
    title: stringOr(item.title, `${prefix} ${index + 1}`),
    summary: stringOr(item.summary, `${prefix} candidate recovered by Design Discovery; summary needs user review.`),
    status: designCandidateStatus(item.status),
    confidence: designConfidence(item.confidence)
  };
}

function normalizeDesignTraceability(item: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  return {
    sourceMemoryIds: stringArray(item.sourceMemoryIds),
    sourceModelIds: nonEmptyStringArray(item.sourceModelIds, ["design-discovery"]),
    sourceSpecPaths: stringArray(item.sourceSpecPaths).filter((item) => isCodeEvidencePath(item)),
    sourceCodeFactIds: stringArray(item.sourceCodeFactIds),
    evidence: normalizeDesignEvidenceRefs(item.evidence, warnings),
    questions: designQuestionTextArray(item.questions)
  };
}

function normalizeDesignEvidenceRefs(
  value: unknown,
  warnings: string[]
): InteractionModelCandidate["useCases"][number]["evidence"] {
  const items = Array.isArray(value) ? value : [];
  return items.flatMap((item, index): InteractionModelCandidate["useCases"][number]["evidence"] => {
    if (typeof item === "string") {
      warnings.push(`Evidence ${index + 1} was a free-form inference without code path; runtime kept it as a question instead of evidence.`);
      return [];
    }
    if (!isRecord(item)) return [];
    const filePath = stringValue(item.filePath);
    if (!filePath || !isCodeEvidencePath(filePath)) {
      warnings.push(`Evidence ${index + 1} did not include a code-backed filePath; runtime dropped it from evidence.`);
      return [];
    }
    return [{
      source: designEvidenceSource(item.source),
      filePath,
      startLine: positiveInteger(item.startLine),
      endLine: positiveInteger(item.endLine),
      excerpt: stringValue(item.excerpt),
      summary: stringOr(item.summary, stringOr(item.excerpt, "Agent supplied evidence without a summary.")),
      strength: designEvidenceStrength(item.strength),
      knowledgeKind: designKnowledgeKind(item.knowledgeKind),
      sourceCodeFactId: stringValue(item.sourceCodeFactId)
    }];
  });
}

function normalizeDesignQuestions(value: unknown, allIds: Set<string>): Record<string, unknown>[] {
  const items = Array.isArray(value) ? value : [];
  return items.flatMap((item, index): Record<string, unknown>[] => {
    if (typeof item === "string" && item.trim()) {
      return [{
        id: nextNormalizedDesignId("question", item, index, allIds),
        question: item.trim(),
        severity: "warning"
      }];
    }
    if (!isRecord(item)) return [];
    const question = stringValue(item.question) ?? stringValue(item.summary) ?? stringValue(item.title);
    if (!question) return [];
    return [{
      id: stringValue(item.id) ?? nextNormalizedDesignId("question", question, index, allIds),
      question,
      targetId: stringValue(item.targetId),
      severity: item.severity === "info" ? "info" : "warning"
    }];
  });
}

function designQuestionTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return stringArray(value);
  return unique(value.flatMap((item): string[] => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (isRecord(item)) {
      const question = stringValue(item.question) ?? stringValue(item.summary) ?? stringValue(item.title);
      return question ? [question] : [];
    }
    return [];
  }));
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeDesignId(prefix: string, item: Record<string, unknown>, index: number, allIds: Set<string>): string {
  const id = stringValue(item.id);
  if (id && !allIds.has(id)) {
    allIds.add(id);
    return id;
  }
  return nextNormalizedDesignId(prefix, stringOr(item.title, `${prefix}-${index + 1}`), index, allIds);
}

function nextNormalizedDesignId(prefix: string, value: string, index: number, allIds: Set<string>): string {
  const base = `${prefix}:${designSlug(value || `${prefix}-${index + 1}`)}`;
  let candidate = base;
  let suffix = 2;
  while (allIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  allIds.add(candidate);
  return candidate;
}

function designActorType(value: unknown): "person" | "role" | "system" | "external_system" {
  if (value === "person" || value === "role" || value === "system" || value === "external_system") return value;
  return "role";
}

function designContextKind(value: unknown, fallback: InteractionModelCandidate["contexts"][number]["kind"]): InteractionModelCandidate["contexts"][number]["kind"] {
  if (
    value === "system" ||
    value === "business_module" ||
    value === "business_capability" ||
    value === "bounded_context" ||
    value === "process_area"
  ) {
    return value;
  }
  return fallback;
}

function designCandidateStatus(value: unknown): "candidate" | "confirmed" | "stale" | "conflicted" | "rejected" {
  if (value === "confirmed" || value === "stale" || value === "conflicted" || value === "rejected") return value;
  return "candidate";
}

function designConfidence(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

function designEvidenceSource(value: unknown): "repository_scan" | "codegraph" | "tree_sitter" | "lsp" | "agent_inference" | "user_confirmation" {
  if (value === "repository_scan" || value === "codegraph" || value === "tree_sitter" || value === "lsp" || value === "user_confirmation") return value;
  return "agent_inference";
}

function designEvidenceStrength(value: unknown): "weak" | "medium" | "strong" {
  if (value === "medium" || value === "strong") return value;
  return "weak";
}

function designKnowledgeKind(value: unknown): "FACT" | "INFERENCE" | "CANDIDATE" | "CONFIRMED" {
  if (value === "FACT" || value === "CANDIDATE" || value === "CONFIRMED") return value;
  return "INFERENCE";
}

function designRelationKind(value: unknown): DesignStoryRelationKind | "actor_participates" {
  if (
    value === "actor_participates" ||
    value === "includes" ||
    value === "extends" ||
    value === "depends_on" ||
    value === "triggers" ||
    value === "conflicts_with" ||
    value === "out_of_scope_for"
  ) {
    return value;
  }
  return "depends_on";
}

export function designDrilldownKind(value: unknown): UseCaseDrilldownDiagramKind {
  if (
    value === "activity"
    || value === "sequence"
    || value === "state_machine"
    || value === "class_collaboration"
    || value === "interaction_overview"
    || value === "communication"
    || value === "timing"
    || value === "object_snapshot"
    || value === "composite_structure"
  ) return value;
  return "activity";
}

export function designDrilldownIdPrefix(kind: UseCaseDrilldownDiagramKind): string {
  if (kind === "activity") return "activity";
  if (kind === "sequence") return "sequence";
  if (kind === "state_machine") return "state-machine";
  if (kind === "class_collaboration") return "class-collaboration";
  if (kind === "interaction_overview") return "interaction-overview";
  if (kind === "communication") return "communication";
  if (kind === "timing") return "timing";
  if (kind === "object_snapshot") return "object-snapshot";
  return "composite-structure";
}

function defaultDrilldownTitle(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `Activity Diagram：${useCaseTitle}`;
  if (kind === "sequence") return `Sequence Diagram：${useCaseTitle}主成功场景`;
  if (kind === "state_machine") return `State Machine Diagram：${useCaseTitle}状态生命周期`;
  if (kind === "class_collaboration") return `Class / Structural Collaboration Diagram：${useCaseTitle}`;
  if (kind === "interaction_overview") return `Interaction Overview Diagram：${useCaseTitle}`;
  if (kind === "communication") return `Communication Diagram：${useCaseTitle}`;
  if (kind === "timing") return `Timing Diagram：${useCaseTitle}`;
  if (kind === "object_snapshot") return `Object Diagram：${useCaseTitle}运行时对象快照`;
  return `Composite Structure Diagram：${useCaseTitle}内部结构`;
}

function defaultDrilldownScenario(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `解释 Use Case「${useCaseTitle}」的业务流程、分支、失败路径和决策点。`;
  if (kind === "sequence") return `解释 Use Case「${useCaseTitle}」的主成功交互场景。`;
  if (kind === "state_machine") return `解释 Use Case「${useCaseTitle}」涉及的关键业务对象生命周期。`;
  if (kind === "class_collaboration") return `解释 Use Case「${useCaseTitle}」的结构协作和设计承载关系。`;
  if (kind === "interaction_overview") return `解释 Use Case「${useCaseTitle}」多个交互片段、分支和时序图之间的组合关系。`;
  if (kind === "communication") return `解释 Use Case「${useCaseTitle}」运行时对象之间的消息网络和协作重点。`;
  if (kind === "timing") return `解释 Use Case「${useCaseTitle}」中和时间、超时、重试、轮询或 SLA 相关的状态变化。`;
  if (kind === "object_snapshot") return `解释 Use Case「${useCaseTitle}」关键时刻的运行时对象实例关系。`;
  return `解释 Use Case「${useCaseTitle}」某个复杂结构内部的部件、端口和连接关系。`;
}

function defaultCoveredUseCaseFlows(
  kind: UseCaseDrilldownDiagramKind,
  useCase: Record<string, unknown> | undefined
): string[] {
  const main = stringArray(useCase?.mainSuccessScenario).map((_, index) => `mainSuccessScenario[${index + 1}]`);
  const alternatives = stringArray(useCase?.alternativeFlows).map((_, index) => `alternativeFlows[${index + 1}]`);
  const failures = stringArray(useCase?.failureFlows).map((_, index) => `failureFlows[${index + 1}]`);
  if (kind === "activity") return [...main, ...alternatives.slice(0, 3), ...failures.slice(0, 3)].length
    ? [...main, ...alternatives.slice(0, 3), ...failures.slice(0, 3)]
    : ["Use Case flow coverage needs agent refinement."];
  if (kind === "sequence") return main.length ? main : ["mainSuccessScenario"];
  if (kind === "state_machine") return ["state lifecycle evidence needs agent refinement."];
  if (kind === "class_collaboration") return ["structural collaboration slice for this Use Case"];
  if (kind === "interaction_overview") return [...main, ...alternatives, ...failures].length ? [...main, ...alternatives, ...failures] : ["interaction fragments need agent refinement"];
  if (kind === "timing") return [...main, ...alternatives, ...failures].filter((item) => /超时|重试|轮询|定时|等待|timeout|retry|poll|schedule/i.test(item));
  if (kind === "communication") return main.length ? main : ["runtime message network needs agent refinement"];
  if (kind === "object_snapshot") return ["runtime object snapshot needs agent refinement"];
  return ["composite structure slice for this Use Case"];
}

function defaultDrilldownBoundary(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `覆盖「${useCaseTitle}」可观察业务流程的候选路径，不覆盖底层函数调用细节。`;
  if (kind === "sequence") return `覆盖「${useCaseTitle}」一个明确交互场景中的消息顺序，不等价于完整调用图。`;
  if (kind === "state_machine") return `仅在存在生命周期证据时覆盖「${useCaseTitle}」相关关键业务对象的状态迁移。`;
  if (kind === "class_collaboration") return `覆盖「${useCaseTitle}」实现该故事所需的结构协作切片，不是全量类图。`;
  if (kind === "interaction_overview") return `覆盖「${useCaseTitle}」多个交互片段之间的导航、分支和组合关系，不替代具体 Sequence Diagram。`;
  if (kind === "communication") return `覆盖「${useCaseTitle}」运行时对象消息网络，不替代严格时间顺序。`;
  if (kind === "timing") return `覆盖「${useCaseTitle}」有时间语义证据的对象状态变化，不覆盖普通同步调用。`;
  if (kind === "object_snapshot") return `覆盖「${useCaseTitle}」关键时刻的对象实例关系，不覆盖生命周期全过程。`;
  return `覆盖「${useCaseTitle}」复杂结构内部部件和连接关系，不覆盖全量类图。`;
}

function defaultDrilldownNotCovered(kind: UseCaseDrilldownDiagramKind): string[] {
  if (kind === "activity") return ["完整代码调用链", "仓库级全局流程", "未被证据支持的业务分支"];
  if (kind === "sequence") return ["所有相关函数调用", "所有失败补偿场景", "未被证据支持的异步或回调流程"];
  if (kind === "state_machine") return ["页面临时状态", "技术执行状态", "未被证据支持的状态迁移"];
  if (kind === "class_collaboration") return ["全量类图", "目录结构图", "没有 Use Case 解释价值的 DTO/Mapper/Repository 堆叠"];
  if (kind === "interaction_overview") return ["单张时序图细节", "完整代码调用链", "没有证据的交互片段"];
  if (kind === "communication") return ["严格时间顺序", "全量对象图", "未发生消息的静态依赖"];
  if (kind === "timing") return ["无时间语义的普通流程", "未证实的 SLA", "页面动画或纯 UI 状态"];
  if (kind === "object_snapshot") return ["全生命周期", "全量数据库实体", "未证实的运行时实例"];
  return ["全量类图", "普通包依赖图", "没有内部部件/端口证据的结构"];
}

function defaultDrilldownRationale(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `需要用 Activity Diagram 检查「${useCaseTitle}」是否覆盖主路径、分支和失败路径。`;
  if (kind === "sequence") return `需要用 Sequence Diagram 检查「${useCaseTitle}」的关键参与者、系统入口和外部交互顺序。`;
  if (kind === "state_machine") return `只有存在状态生命周期证据时，才需要用 State Machine Diagram 解释「${useCaseTitle}」。`;
  if (kind === "class_collaboration") return `需要用 Class / Structural Collaboration Diagram 检查「${useCaseTitle}」由哪些结构角色和设计关系承载。`;
  if (kind === "interaction_overview") return `当「${useCaseTitle}」包含多个交互片段或跨场景分支时，需要用 Interaction Overview Diagram 串联这些片段。`;
  if (kind === "communication") return `当「${useCaseTitle}」更需要理解对象消息网络而非严格时间轴时，使用 Communication Diagram。`;
  if (kind === "timing") return `当「${useCaseTitle}」存在超时、重试、轮询、等待窗口或 SLA 证据时，使用 Timing Diagram。`;
  if (kind === "object_snapshot") return `当「${useCaseTitle}」需要解释某个关键时刻的对象实例关系时，使用 Object Diagram。`;
  return `当「${useCaseTitle}」需要解释复杂对象内部部件、端口和连接时，使用 Composite Structure Diagram。`;
}

function defaultDrilldownBusinessExplanation(
  kind: UseCaseDrilldownDiagramKind,
  useCaseTitle: string,
  coverage: UseCaseDrilldownCoverage
): string {
  if (kind === "activity") return `这张 Activity Diagram 说明「${useCaseTitle}」在业务上如何从触发进入流程、经过关键决策点并到达可验证结果；当前候选覆盖 ${coverage.scenario}`;
  if (kind === "sequence") return `这张 Sequence Diagram 说明「${useCaseTitle}」中一个具体交互场景的参与方如何协作完成业务结果；当前候选覆盖 ${coverage.scenario}`;
  if (kind === "state_machine") return `这张 State Machine Diagram 说明「${useCaseTitle}」中关键业务对象生命周期如何变化；当前候选覆盖 ${coverage.scenario}`;
  if (kind === "class_collaboration") return `这张 Class / Structural Collaboration Diagram 说明「${useCaseTitle}」由哪些结构角色承载，以及这些角色为什么足以解释该业务能力。`;
  if (kind === "interaction_overview") return `这张 Interaction Overview Diagram 说明「${useCaseTitle}」如何由多个交互片段、分支或子场景组合完成。`;
  if (kind === "communication") return `这张 Communication Diagram 说明「${useCaseTitle}」运行时对象之间怎样形成消息网络和协作中心。`;
  if (kind === "timing") return `这张 Timing Diagram 说明「${useCaseTitle}」中时间约束、等待、重试或状态变化如何影响业务结果。`;
  if (kind === "object_snapshot") return `这张 Object Diagram 说明「${useCaseTitle}」关键时刻有哪些对象实例及其关系。`;
  return `这张 Composite Structure Diagram 说明「${useCaseTitle}」中复杂结构内部部件、端口和连接如何支撑业务能力。`;
}

function defaultDrilldownUmlExplanation(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `读图时先看开始节点和结束节点，再看菱形决策、分支、失败或补偿节点。节点应表达业务动作，而不是代码调用；如果只有一条直线，说明该图仍缺少分支或失败路径证据。`;
  if (kind === "sequence") return `读图时从左到右识别 actor、系统入口、应用服务、领域对象、端口/适配器和外部系统，再按时间轴向下读取消息、返回、异常和可验证结果。`;
  if (kind === "state_machine") return `读图时先确认被建模的业务对象，再检查初始状态、稳定状态、迁移事件、guard 条件和终态；没有状态字段或生命周期证据时，该图只能保持候选。`;
  if (kind === "class_collaboration") return `读图时重点看类/接口承担的结构职责、依赖方向、接口实现、策略选择和端口适配关系；该图不是全量类图，也不是目录结构图。`;
  if (kind === "interaction_overview") return `读图时把每个节点视为一个交互片段或子场景，重点看片段之间的分支、循环、并行或汇合关系。`;
  if (kind === "communication") return `读图时重点看对象之间的消息编号、消息方向和协作中心；它强调谁与谁通信，不强调严格垂直时间轴。`;
  if (kind === "timing") return `读图时重点看时间轴、对象状态随时间变化、超时窗口、重试间隔或等待条件。`;
  if (kind === "object_snapshot") return `读图时把每个节点视为运行时对象实例，重点看实例之间的链接、聚合或引用关系。`;
  return `读图时重点看结构内部的 parts、ports、connectors 和边界，确认复杂对象如何被内部部件协作支撑。`;
}

function defaultDrilldownDesignExplanation(kind: UseCaseDrilldownDiagramKind, useCaseTitle: string): string {
  if (kind === "activity") return `设计上，这张图用于验证「${useCaseTitle}」的业务流程边界是否清楚，哪些路径需要拆成独立图，哪些缺口需要继续向用户确认。`;
  if (kind === "sequence") return `设计上，这张图用于验证「${useCaseTitle}」的协作顺序、外部交互、回调/补偿/重试边界是否可解释，不把完整调用链误当成业务设计。`;
  if (kind === "state_machine") return `设计上，这张图只在关键业务对象存在稳定生命周期时成立，用来约束状态、事件和非法迁移，避免把 UI 或技术执行状态误当领域状态。`;
  if (kind === "class_collaboration") return `设计上，这张图用于解释「${useCaseTitle}」背后的结构承载方式：应用服务如何编排，领域对象/服务承载哪些规则，接口/端口如何隔离外部系统，是否存在策略、工厂、端口适配器、状态或规格等模式。`;
  if (kind === "interaction_overview") return `设计上，这张图用于避免把复杂 Use Case 压进一张 Sequence Diagram，帮助拆分并关联多个交互片段。`;
  if (kind === "communication") return `设计上，这张图用于识别协作中心、消息扇入/扇出和对象通信责任，补充 Sequence Diagram 的时间轴视角。`;
  if (kind === "timing") return `设计上，这张图用于把时间约束显式化，避免超时、重试、轮询和等待窗口只隐藏在文字或代码中。`;
  if (kind === "object_snapshot") return `设计上，这张图用于解释运行时对象快照，帮助确认聚合边界、实例关系或关键中间态。`;
  return `设计上，这张图用于解释复杂结构内部的部件和连接，补充 Class Diagram 对内部结构表达不足的问题。`;
}

function defaultDrilldownImplementationExplanation(
  scope: InteractionModelCandidate["useCaseDrilldowns"][number]["coverage"]["implementationScope"]
): string {
  const modules = scope.modules.length ? scope.modules.join("、") : "待恢复模块";
  const files = scope.keyFiles.length ? scope.keyFiles.join("、") : "待恢复关键文件";
  const anchors = scope.codeAnchors.length ? scope.codeAnchors.join("、") : "待恢复代码锚点";
  return `实现定位以范围锚点为准：模块 ${modules}，关键文件 ${files}，代码锚点 ${anchors}。这些锚点用于后续人或 AI 定位实现，不表示当前 Use Case 覆盖了全部相关代码。`;
}

export function fallbackDrilldownMermaid(kind: UseCaseDrilldownDiagramKind, useCase: Record<string, unknown> | undefined): string {
  const title = stringOr(useCase?.title, "候选用例");
  if (kind === "sequence") return fallbackSequenceDiagramMermaid(useCase, title);
  if (kind === "state_machine") return fallbackStateMachineDiagramMermaid(title);
  if (kind === "class_collaboration") return fallbackClassCollaborationDiagramMermaid(title);
  if (kind === "communication") return fallbackCommunicationDiagramMermaid(title);
  if (kind === "timing") return fallbackTimingDiagramMermaid(title);
  if (kind === "object_snapshot") return fallbackObjectSnapshotDiagramMermaid(title);
  if (kind === "composite_structure") return fallbackCompositeStructureDiagramMermaid(title);
  if (kind === "interaction_overview") return fallbackInteractionOverviewDiagramMermaid(useCase, title);
  return fallbackActivityDiagramMermaid(useCase, title);
}

export function normalizeMermaidSource(value: unknown, fallback: string): string {
  const source = typeof value === "string" ? value : "";
  const cleaned = stripMermaidCodeFence(source);
  if (cleaned) return `${sanitizeMermaidSource(cleaned).trimEnd()}\n`;
  const cleanedFallback = stripMermaidCodeFence(fallback);
  return cleanedFallback ? `${sanitizeMermaidSource(cleanedFallback).trimEnd()}\n` : `${sanitizeMermaidSource(fallback).trimEnd()}\n`;
}

export function sanitizeMermaidSource(value: string): string {
  const source = stripMermaidCodeFence(value);
  return sanitizeFlowchartNodeIds(normalizeMermaidSequenceBoxSyntax(source));
}

function normalizeMermaidSequenceBoxSyntax(source: string): string {
  if (!source.includes("sequenceDiagram")) return source;
  return source.replace(/^(\s*)end\s+box\s*$/gim, "$1end");
}

function stripMermaidCodeFence(value: string): string {
  let result = value.trim();
  let changed = true;
  while (changed && result) {
    changed = false;
    const fenced = result.match(/^```(?:mermaid|mmd)?[^\n]*\n([\s\S]*?)\n?```\s*$/i);
    if (fenced) {
      result = fenced[1]?.trim() ?? "";
      changed = true;
      continue;
    }
    const lines = result.split(/\r?\n/);
    if (/^```(?:mermaid|mmd)?[^\n]*$/i.test(lines[0]?.trim() ?? "")) {
      result = lines.slice(1).join("\n").trim();
      changed = true;
      continue;
    }
    if ((lines[lines.length - 1]?.trim() ?? "") === "```") {
      result = lines.slice(0, -1).join("\n").trim();
      changed = true;
    }
  }
  return result;
}

function fallbackActivityDiagramMermaid(useCase: Record<string, unknown> | undefined, title: string): string {
  const steps = nonEmptyStringArray(useCase?.mainSuccessScenario, [stringOr(useCase?.summary, `${title} 的主成功路径待补充。`)]);
  const lines = ["flowchart TD", `  startNode([开始：${mermaidText(title)}])`];
  let previous = "startNode";
  steps.forEach((step, index) => {
    const id = `step${index + 1}`;
    lines.push(`  ${id}[${mermaidText(step)}]`);
    lines.push(`  ${previous} --> ${id}`);
    previous = id;
  });
  const alternatives = stringArray(useCase?.alternativeFlows);
  const failures = stringArray(useCase?.failureFlows);
  if (alternatives.length) {
    lines.push(`  altDecision{${mermaidText("存在备选路径？")}}`);
    lines.push(`  ${previous} --> altDecision`);
    lines.push(`  altDecision -->|是| alternativePath[${mermaidText(alternatives[0])}]`);
    lines.push("  altDecision -->|否| successNode");
    lines.push("  alternativePath --> successNode");
  } else {
    lines.push(`  ${previous} --> successNode`);
  }
  if (failures.length) {
    lines.push(`  failurePath[${mermaidText(failures[0])}]`);
    lines.push("  startNode -.异常.-> failurePath");
  }
  lines.push("  successNode([完成])");
  return `${lines.join("\n")}\n`;
}

function fallbackSequenceDiagramMermaid(useCase: Record<string, unknown> | undefined, title: string): string {
  const primaryActors = stringArray(useCase?.primaryActorIds);
  const actor = primaryActors[0] ?? "Actor";
  const useCaseLabel = mermaidText(title);
  const steps = nonEmptyStringArray(useCase?.mainSuccessScenario, [stringOr(useCase?.summary, `${title} 的交互过程待补充。`)]);
  const lines = [
    "sequenceDiagram",
    `  participant A as ${mermaidText(actor)}`,
    "  participant S as System"
  ];
  steps.forEach((step, index) => {
    const from = index % 2 === 0 ? "A" : "S";
    const to = from === "A" ? "S" : "A";
    lines.push(`  ${from}->>${to}: ${mermaidText(step)}`);
  });
  lines.push(`  S-->>A: ${useCaseLabel}完成`);
  return `${lines.join("\n")}\n`;
}

function fallbackStateMachineDiagramMermaid(title: string): string {
  return [
    "stateDiagram-v2",
    "  [*] --> Candidate",
    `  Candidate: ${mermaidText(title)}待确认状态模型`,
    "  Candidate --> Confirmed: 用户确认状态对象与迁移",
    "  Candidate --> Rejected: 证据不足或无关键状态对象",
    "  Confirmed --> [*]",
    "  Rejected --> [*]",
    ""
  ].join("\n");
}

function fallbackClassCollaborationDiagramMermaid(title: string): string {
  const safe = mermaidText(title);
  return [
    "classDiagram",
    "  class Actor",
    "  class UseCaseApplicationService",
    "  class DomainObject",
    "  class Port",
    "  class Adapter",
    `  UseCaseApplicationService : ${safe}`,
    "  Actor --> UseCaseApplicationService",
    "  UseCaseApplicationService --> DomainObject",
    "  UseCaseApplicationService --> Port",
    "  Port <|.. Adapter",
    ""
  ].join("\n");
}

function fallbackInteractionOverviewDiagramMermaid(useCase: Record<string, unknown> | undefined, title: string): string {
  const steps = nonEmptyStringArray(useCase?.mainSuccessScenario, [stringOr(useCase?.summary, `${title} 的交互片段待补充。`)]);
  const lines = ["flowchart TD", `  startNode([开始：${mermaidText(title)}])`];
  let previous = "startNode";
  steps.slice(0, 6).forEach((step, index) => {
    const id = `fragment${index + 1}`;
    lines.push(`  ${id}[[${mermaidText(step)}]]`);
    lines.push(`  ${previous} --> ${id}`);
    previous = id;
  });
  lines.push("  completeNode([交互组合完成])");
  lines.push(`  ${previous} --> completeNode`);
  return `${lines.join("\n")}\n`;
}

function fallbackCommunicationDiagramMermaid(title: string): string {
  return [
    "flowchart LR",
    "  actor[参与者]",
    "  entry[系统入口]",
    "  collaborator[协作对象]",
    "  external[外部系统]",
    `  entry:::focus`,
    `  actor -->|1 ${mermaidText(title)}| entry`,
    "  entry -->|2 请求协作| collaborator",
    "  collaborator -->|3 必要外部交互| external",
    "  external -->|4 返回结果| collaborator",
    "  collaborator -->|5 汇总结果| entry",
    "  entry -->|6 响应| actor",
    "  classDef focus fill:#1d3557,stroke:#60a5fa,color:#fff",
    ""
  ].join("\n");
}

function fallbackTimingDiagramMermaid(title: string): string {
  return [
    "flowchart LR",
    "  startNode([开始])",
    "  waiting[等待 / 处理中]",
    "  timeout{是否超时或需要重试？}",
    "  retry[重试 / 补偿]",
    "  successNode([完成])",
    "  failedNode([失败])",
    `  startNode --> waiting`,
    `  waiting --> timeout`,
    `  timeout -->|否：${mermaidText(title)}完成| successNode`,
    "  timeout -->|是| retry",
    "  retry --> waiting",
    "  retry -.超过限制.-> failedNode",
    ""
  ].join("\n");
}

function fallbackObjectSnapshotDiagramMermaid(title: string): string {
  const safe = mermaidText(title);
  return [
    "classDiagram",
    "  class ActorInstance {",
    "    +role",
    "  }",
    "  class UseCaseSession {",
    `    +snapshot ${safe}`,
    "  }",
    "  class DomainObjectInstance {",
    "    +state candidate",
    "  }",
    "  ActorInstance --> UseCaseSession",
    "  UseCaseSession --> DomainObjectInstance",
    ""
  ].join("\n");
}

function fallbackCompositeStructureDiagramMermaid(title: string): string {
  const safe = mermaidText(title);
  return [
    "classDiagram",
    "  class CompositeBoundary {",
    `    +purpose ${safe}`,
    "  }",
    "  class PartA",
    "  class PartB",
    "  class Port",
    "  CompositeBoundary *-- PartA",
    "  CompositeBoundary *-- PartB",
    "  CompositeBoundary o-- Port",
    "  PartA --> Port",
    "  Port --> PartB",
    ""
  ].join("\n");
}

function mermaidText(value: string): string {
  return value.replace(/["`]/g, "'").replace(/\r?\n/g, " ").trim();
}

const FLOWCHART_RESERVED_NODE_IDS = new Set([
  "end",
  "class",
  "click",
  "default",
  "direction",
  "flowchart",
  "graph",
  "linkstyle",
  "style",
  "subgraph"
]);

function sanitizeFlowchartNodeIds(source: string): string {
  const lines = source.split(/\r?\n/);
  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0)?.trim() ?? "";
  if (!/^(flowchart|graph)\b/i.test(firstMeaningfulLine)) return source;
  const definedIds = new Set<string>();
  for (const line of lines) {
    const id = flowchartDefinitionId(line);
    if (id) definedIds.add(id);
  }
  const replacements = new Map<string, string>();
  for (const id of definedIds) {
    if (!FLOWCHART_RESERVED_NODE_IDS.has(id.toLowerCase())) continue;
    replacements.set(id, nextSafeFlowchartNodeId(id, definedIds, replacements));
  }
  if (!replacements.size) return source;
  return lines.map((line) => rewriteFlowchartLineNodeIds(line, replacements)).join("\n");
}

function flowchartDefinitionId(line: string): string | undefined {
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?=\[|\(|\{|\>)/);
  return match?.[1];
}

function nextSafeFlowchartNodeId(id: string, used: Set<string>, replacements: Map<string, string>): string {
  const base = `${id}Node`;
  let candidate = base;
  let suffix = 2;
  const reserved = FLOWCHART_RESERVED_NODE_IDS;
  while (used.has(candidate) || Array.from(replacements.values()).includes(candidate) || reserved.has(candidate.toLowerCase())) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function rewriteFlowchartLineNodeIds(line: string, replacements: Map<string, string>): string {
  let result = line;
  for (const [from, to] of replacements.entries()) {
    const escaped = escapeRegExp(from);
    result = result.replace(new RegExp(`^(\\s*)${escaped}(\\s*(?=\\[|\\(|\\{|\\>|--|-\\.|==))`), `$1${to}$2`);
    result = result.replace(new RegExp(`((?:-->|---|==>|-\\.->|--[^\\n-]*-->|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`((?:--&gt;|---|==&gt;|-\\.-&gt;|--[^\\n-]*--&gt;|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`^(\\s*(?:style|class|click)\\s+)${escaped}\\b`), `$1${to}`);
    result = result.replace(new RegExp(`,\\s*${escaped}\\b`, "g"), `, ${to}`);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function emptyInteractionModelCandidate(root: string, generatedAt: string): InteractionModelCandidate {
  return {
    schemaVersion: "praxis.interactionModel.v1",
    root,
    generatedAt,
    source: "agent",
    contexts: [],
    actors: [],
    externalSystems: [],
    useCases: [],
    relations: [],
    useCaseDrilldowns: [],
    questions: [],
    warnings: []
  };
}

function designTraceability(
  sourceModelId: string,
  questions: string[],
  evidence: InteractionModelCandidate["useCases"][number]["evidence"]
) {
  return {
    sourceMemoryIds: [],
    sourceModelIds: [sourceModelId],
    sourceSpecPaths: [],
    sourceCodeFactIds: [],
    evidence,
    questions
  };
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return stringValue(value) ?? fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function nonEmptyStringArray(value: unknown, fallback: string[]): string[] {
  const values = stringArray(value);
  return values.length ? values : fallback;
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function designSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "") || "design";
}
