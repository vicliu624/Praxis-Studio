import {
  InteractionModelCandidateSchema,
  type CodeFactGraphSnapshot,
  type CodeUnderstandingSpine,
  type InteractionModelCandidate,
  type MemoryRecord,
  type TraceRecord
} from "@praxis/schema";
import {
  DESIGN_MAP_DOC_RELATIVE_PATH,
  DESIGN_MAP_HTML_RELATIVE_PATH,
  DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH,
  writeUseCaseDiagramDocuments,
  writeUseCaseDiagramsMapDocument,
  writeUseCaseDiagramsMapHtmlDocument
} from "./design-documents.js";
import { normalizeInteractionModelCandidate } from "./interaction-model-normalizer.js";

type Args = Record<string, string | boolean>;
type DesignDiscoveryProgressStatus = "running" | "complete" | "failed";

export interface DesignDiscoveryProjectionResult {
  manifestPath: string;
  useCaseListViewPath: string;
  useCaseViewPaths: string[];
  mermaidPaths: string[];
}

export interface DesignDiscoveryWorkflowDeps {
  readJson(filePath: string): Promise<unknown>;
  readCodeFacts(filePath: string): Promise<CodeFactGraphSnapshot>;
  readOrBuildCodeFacts(root: string, args: Args): Promise<CodeFactGraphSnapshot>;
  readAllMemoryRecords(root: string): Promise<MemoryRecord[]>;
  callDesignDiscoveryAgent(
    root: string,
    codeFacts: CodeFactGraphSnapshot,
    memoryRecords: MemoryRecord[],
    args: Args,
    progress?: { runId: string; stage: string },
    codeUnderstandingSpine?: Record<string, unknown>
  ): Promise<{ model: InteractionModelCandidate; providerSummary: Record<string, unknown> }>;
  buildAndWriteCodeUnderstandingSpineForCodeFacts(
    root: string,
    codeFacts: CodeFactGraphSnapshot,
    generatedAt?: string
  ): Promise<{ spine: CodeUnderstandingSpine; documents: { markdownPath: string; jsonPath: string } }>;
  codeUnderstandingSpineDigest(spine: CodeUnderstandingSpine): Record<string, unknown>;
  writeDesignDiscoveryProgress(
    root: string,
    runId: string,
    stage: string,
    status: DesignDiscoveryProgressStatus,
    detail: string,
    eventPatch?: Record<string, unknown>
  ): Promise<void>;
  projectRelativePath(root: string, filePath: string): string;
  writeInteractionModelCandidate(root: string, model: InteractionModelCandidate): Promise<string>;
  writeDesignUseCaseProjectionViews(root: string, model: InteractionModelCandidate): Promise<DesignDiscoveryProjectionResult>;
  appendChange(root: string, change: { title: string; summary: string; kind: "FACT" | "CANDIDATE" | "CONFIRMED" }): Promise<unknown>;
  appendTrace(root: string, trace: TraceRecord): Promise<unknown>;
}

export interface DesignDiscoveryWorkflowInput {
  root: string;
  args: Args;
  candidatePath?: string;
  progressRunId: string;
  generatedAt: string;
}

export interface DesignDiscoveryWorkflowResult {
  model: InteractionModelCandidate;
  output: Record<string, unknown>;
}

export async function runDesignDiscoveryWorkflow(
  input: DesignDiscoveryWorkflowInput,
  deps: DesignDiscoveryWorkflowDeps
): Promise<DesignDiscoveryWorkflowResult> {
  const { root, args, candidatePath, progressRunId, generatedAt } = input;
  let progressStage = "prepare";
  let model: InteractionModelCandidate;
  let providerSummary: Record<string, unknown> | undefined;
  let codeUnderstandingSpineSummary: CodeUnderstandingSpine["summary"] | undefined;
  let codeUnderstandingSpineDocPath: string | undefined;
  let codeUnderstandingSpineJsonPath: string | undefined;

  await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "检查项目和生成策略。", {
    kind: "runtime_event",
    title: "准备 Design Discovery",
    metadata: [`root: ${root}`, `run: ${progressRunId}`]
  });

  try {
    if (candidatePath) {
      progressStage = "normalize_model";
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "正在导入候选 Interaction Model。", {
        kind: "file_read",
        title: "读取候选模型",
        path: deps.projectRelativePath(root, candidatePath)
      });
      const importedRaw = await deps.readJson(candidatePath);
      if (!isRecord(importedRaw)) throw new Error(`Invalid Interaction Model candidate JSON: ${candidatePath}`);
      const imported = InteractionModelCandidateSchema.parse(normalizeInteractionModelCandidate(importedRaw, root, generatedAt));
      model = InteractionModelCandidateSchema.parse({
        ...imported,
        root,
        source: imported.source === "user" ? "user" : "imported"
      });
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", `已导入 ${model.useCases.length} 个候选用例。`, {
        kind: "validation",
        title: "校验导入模型",
        metadata: designModelCountMetadata(model)
      });
    } else {
      progressStage = "collect_facts";
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "读取仓库扫描和本地代码事实证据。", {
        kind: "command_run",
        title: "运行仓库发现",
        command: "praxis-runtime design:discover"
      });
      const codeFacts = args["code-facts"]
        ? await deps.readCodeFacts(String(args["code-facts"]))
        : await deps.readOrBuildCodeFacts(root, args);
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "本地代码事实已就绪，准备抽取设计候选证据。", {
        kind: "file_read",
        title: args["code-facts"] ? "读取外部代码事实" : "读取或生成本地代码事实",
        path: args["code-facts"] ? deps.projectRelativePath(root, String(args["code-facts"])) : ".distinction/cache/code-fact-graph.json",
        metadata: codeFactGraphMetadata(codeFacts)
      });
      const { spine, documents: spineDocuments } = await deps.buildAndWriteCodeUnderstandingSpineForCodeFacts(root, codeFacts, generatedAt);
      codeUnderstandingSpineSummary = spine.summary;
      codeUnderstandingSpineDocPath = deps.projectRelativePath(root, spineDocuments.markdownPath);
      codeUnderstandingSpineJsonPath = deps.projectRelativePath(root, spineDocuments.jsonPath);
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "Code-First Discovery Spine 已生成，Design / Engineering / Architecture 将共享这份代码理解骨架。", {
        kind: "file_edit",
        title: "生成 Code-First Discovery Spine",
        path: codeUnderstandingSpineDocPath,
        metadata: [
          `behavior slices: ${spine.summary.behaviorSliceCount}`,
          `structural clusters: ${spine.summary.structuralClusterCount}`,
          `runtime boundaries: ${spine.summary.runtimeBoundaryCount}`,
          `unknown gaps: ${spine.summary.unknownGapCount}`
        ]
      });
      progressStage = "agent_thinking";
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "正在从本地仓库证据恢复候选故事、参与者、上下文和用例边界。", {
        kind: "assistant_message",
        title: "Design Discovery Agent"
      });
      const result = await deps.callDesignDiscoveryAgent(
        root,
        codeFacts,
        [],
        args,
        { runId: progressRunId, stage: progressStage },
        deps.codeUnderstandingSpineDigest(spine)
      );
      model = result.model;
      providerSummary = result.providerSummary;
      progressStage = "normalize_model";
      await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", `已将 agent 输出规范化为 ${model.useCases.length} 个候选用例、${model.actors.length} 个参与者、${model.relations.length} 条关系。`, {
        kind: "validation",
        title: "校验 Interaction Model",
        metadata: designModelCountMetadata(model)
      });
    }

    progressStage = "persist_docs";
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", `正在持久化 ${model.useCases.length} 个候选用例图文档。`, {
      kind: "file_edit",
      title: "准备写入设计文档",
      path: DESIGN_MAP_DOC_RELATIVE_PATH,
      metadata: [DESIGN_MAP_HTML_RELATIVE_PATH, `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/*.md`, `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/*.html`]
    });
    const designMapDocPath = await writeUseCaseDiagramsMapDocument(root, model);
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "已写入 Use Case Diagram 地图 Markdown。", {
      kind: "file_edit",
      title: "写入地图 Markdown",
      path: deps.projectRelativePath(root, designMapDocPath)
    });
    const designMapHtmlPath = await writeUseCaseDiagramsMapHtmlDocument(root, model);
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "已写入语义化 HTML 设计地图。", {
      kind: "file_edit",
      title: "写入地图 HTML",
      path: deps.projectRelativePath(root, designMapHtmlPath)
    });
    const useCaseDiagramDocuments = await writeUseCaseDiagramDocuments(
      root,
      model,
      undefined,
      (detail, eventPatch) => deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", detail, eventPatch)
    );
    const useCaseDocumentPaths = [...useCaseDiagramDocuments.markdownPaths, ...useCaseDiagramDocuments.htmlPaths];
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", `已写入 ${useCaseDocumentPaths.length} 份独立 Use Case Diagram 文档。`, {
      kind: "file_edit",
      title: "写入独立用例图文档",
      path: DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH,
      metadata: useCaseDocumentPaths.slice(0, 10).map((filePath) => deps.projectRelativePath(root, filePath))
    });
    const modelPath = await deps.writeInteractionModelCandidate(root, model);
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "已写入 Interaction Model 快照。", {
      kind: "file_edit",
      title: "写入模型快照",
      path: deps.projectRelativePath(root, modelPath)
    });

    progressStage = "project_views";
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", "正在从代码事实生成的 Interaction Model 重建 Design Explorer 投影。", {
      kind: "runtime_event",
      title: "重建 Design Explorer 投影",
        metadata: ["source: local repository evidence", "docs/design: generated projection artifact"]
    });
    const projection = await deps.writeDesignUseCaseProjectionViews(root, model);
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "running", `已生成 ${projection.useCaseViewPaths.length} 个用例图投影视图。`, {
      kind: "file_edit",
      title: "写入投影视图",
      path: deps.projectRelativePath(root, projection.manifestPath),
      metadata: [deps.projectRelativePath(root, projection.useCaseListViewPath), ...projection.useCaseViewPaths.slice(0, 8).map((filePath) => deps.projectRelativePath(root, filePath))]
    });

    await deps.appendChange(root, {
      title: "Design discovery use case candidates persisted",
      summary: `Persisted ${model.contexts.length} context(s), ${model.useCases.length} use case candidate(s), ${model.actors.length} actor(s), and ${model.relations.length} relation(s).`,
      kind: "CANDIDATE"
    }).catch(() => undefined);
    await deps.appendTrace(root, {
      id: `trace-event:design-discovery:${Date.now()}`,
      traceId: `trace:design-discovery:${Date.now()}`,
      timestamp: new Date().toISOString(),
      kind: "design.discovery.completed",
      target: { type: "project", id: "project:root" },
      summary: "Design Discovery produced candidate Use Case Diagram model and projections.",
      data: {
        designMapDocPath,
        designMapHtmlPath,
        useCaseDiagramDocuments,
        modelPath,
        projection,
        provider: providerSummary
      }
    } satisfies TraceRecord).catch(() => undefined);

    progressStage = "complete";
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "complete", `已生成 ${model.useCases.length} 个候选用例图。`, {
      kind: "final_summary",
      title: "Design Discovery 完成",
      metadata: designModelCountMetadata(model)
    });

    return {
      model,
      output: {
        ok: true,
        root,
        designMapDocPath,
        designMapHtmlPath,
        useCaseDiagramDocuments,
        modelPath,
        manifestPath: projection.manifestPath,
        useCaseListViewPath: projection.useCaseListViewPath,
        useCaseViewPaths: projection.useCaseViewPaths,
        mermaidPaths: projection.mermaidPaths,
        contexts: model.contexts.length,
        actors: model.actors.length,
        externalSystems: model.externalSystems.length,
        useCases: model.useCases.length,
        relations: model.relations.length,
        useCaseDrilldowns: model.useCaseDrilldowns.length,
        questions: model.questions.length,
        warnings: model.warnings,
        codeUnderstandingSpineDocPath,
        codeUnderstandingSpineJsonPath,
        codeUnderstandingSpineSummary,
        provider: providerSummary
      }
    };
  } catch (error) {
    await deps.writeDesignDiscoveryProgress(root, progressRunId, progressStage, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}

function codeFactGraphMetadata(snapshot: CodeFactGraphSnapshot): string[] {
  return [
    `files: ${snapshot.files.length}`,
    `nodes: ${snapshot.nodes.length}`,
    `edges: ${snapshot.edges.length}`,
    `provider: ${snapshot.provider}`
  ];
}

function designModelCountMetadata(model: InteractionModelCandidate): string[] {
  return [
    `contexts: ${model.contexts.length}`,
    `actors: ${model.actors.length}`,
    `external systems: ${model.externalSystems.length}`,
    `use cases: ${model.useCases.length}`,
    `relations: ${model.relations.length}`,
    `drilldown diagrams: ${model.useCaseDrilldowns.length}`,
    `questions: ${model.questions.length}`
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
