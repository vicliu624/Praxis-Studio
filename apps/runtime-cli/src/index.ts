#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchitectureModelPatch, type ArchitectureModelPatch } from "@praxis/architecture-modeler";
import { buildCodeFactGraphSnapshot, type CodeFactProviderSource } from "@praxis/code-fact-graph";
import { detectArchitectureFindings, type ArchitectureFindingReport } from "@praxis/finding-detector";
import {
  buildProjectionManifest,
  projectArchitectureDependencyGraphView,
  projectArchitectureDependencyView,
  projectCodeFactGraphView,
  projectContextGraphView,
  projectDesignUseCaseGraphViews,
  projectDesignUseCaseListView,
  projectFindingsGraphView,
  projectMemoryGraphView,
  readProjectedGraphViewRecords,
  renderUseCaseDiagramMermaid,
  projectTaskPlanGraphView,
  projectTraceGraphView,
  type TaskProjectionRecord,
  type TraceProjectionRecord
} from "@praxis/projection-engine";
import {
  acceptedFactRecordsFromPatch,
  buildRepositoryUnderstandingPatch,
  proposedFactRecordsFromPatchForPreview,
  type RepositoryUnderstandingPatch
} from "@praxis/repository-understanding";
import { scanRepository } from "@praxis/repository-scanner";
import { profileProject } from "@praxis/project-profiler";
import {
  ArchitectureDependencyViewSchema,
  ArchitectureFindingReportSchema,
  ArchitectureModelPatchSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  ExternalAgentResultSchema,
  FindingStatusPatchSchema,
  InteractionModelCandidateSchema,
  MemorySuggestionPatchSchema,
  MemoryRecordSchema,
  ProjectedGraphViewSchema,
  ProjectionManifestSchema,
  RepositoryUnderstandingPatchSchema,
  ReviewFindingSchema,
  ReviewCategorySchema,
  ReviewRunSchema,
  TraceRecordSchema,
  type ArchitectureFinding,
  type CodeFactEvidenceRef,
  type CodeFactGraphSnapshot,
  type ExternalAgentResult,
  type FindingStatusPatch,
  type GraphAnchor,
  type InteractionModelCandidate,
  type MemoryRecord,
  type MemoryPatch,
  type MemorySuggestionPatch,
  type ProjectedGraphView,
  type ReviewCategory,
  type ReviewEvaluatorRef,
  type ReviewEvidenceRef,
  type ReviewFinding,
  type ReviewRun,
  type ReviewSeverity,
  type TraceRecord
} from "@praxis/schema";
import { generateDevelopmentGraphCandidate } from "@praxis/graph-generator";
import {
  appendMessage,
  createSessionForTarget,
  getChatSessionPaths,
  loadSessions,
  readMessages,
  readSession,
  readSessionTranscript,
  type ChatMessage,
  type ChatTarget,
  type NewChatMessage,
  type PermissionRequestView,
  type ToolCallView
} from "@praxis/chat-session";
import { buildContext, buildContextPacket, parseGraphAnchor, type SelectionTarget } from "@praxis/context-builder";
import {
  appendChange,
  appendFactRecords,
  appendTrace,
  getLocalKnowledgePaths,
  initializeLocalKnowledge,
  readDevelopmentGraph,
  readFactRecords,
  writeCodingTask,
  writeDevelopmentGraph
} from "@praxis/local-knowledge";
import { PraxisAgentRuntime } from "@praxis/agent-runtime";
import { ManualAdapter, createCodingAgentTask } from "@praxis/coding-agent-adapter";
import { applyNewProjectPlan, createNewProjectPlan, type NewProjectPlan } from "@praxis/project-wizard";
import {
  findEdge,
  findNode,
  normalizeProgress,
  type DevelopmentEdge,
  type DevelopmentGraph,
  type DevelopmentGraphCandidate,
  type DevelopmentNode
} from "@praxis/development-graph";
import { isGraphPlan, type GraphPlan, type PlanAction } from "@praxis/plan-model";
import { loadModelConfig, resolveModelRoute } from "@praxis/model-router";
import { createProvider } from "@praxis/provider-deepseek";
import { getPrompt, reviewPromptNameForCategory } from "@praxis/prompt-registry";
import { AgentLoop, persistRun, type AgentConversationMessage, type AgentRun, type AgentStep, type AgentTerminalReason } from "@praxis/agent-loop";
import { ToolRegistry } from "@praxis/tool-registry";
import { registerAgentTools } from "@praxis/agent-loop/tools";
import { startMcpServer } from "@praxis/mcp-server";
import {
  DESIGN_MAP_DOC_RELATIVE_PATH,
  DESIGN_MAP_HTML_RELATIVE_PATH,
  DESIGN_INTERACTION_MODEL_END,
  DESIGN_INTERACTION_MODEL_START,
  DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH,
  readProjectGitVersion,
  readProjectSemanticVersion,
  writeUseCaseDiagramDocuments,
  writeUseCaseDiagramsMapDocument,
  writeUseCaseDiagramsMapHtmlDocument,
  type DesignVersionDecision
} from "./design-documents.js";
import {
  designDrilldownIdPrefix,
  designDrilldownKind,
  emptyInteractionModelCandidate,
  ensureUseCaseDrilldownDiagrams,
  fallbackDrilldownMermaid,
  normalizeInteractionModelCandidate,
  normalizeUseCaseDrilldownCoverage,
  normalizeUseCaseDrilldownExplanation,
  parseInteractionModelCandidate
} from "./interaction-model-normalizer.js";
import { runDesignDiscoveryWorkflow } from "./design-discovery-workflow.js";
import {
  buildEngineeringComplexityModel,
  ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH,
  writeEngineeringComplexityDocuments
} from "./engineering-documents.js";
import {
  ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH,
  buildArchitectureC4Model,
  writeArchitectureC4Documents
} from "./architecture-documents.js";
import {
  UML_MODEL_ROOT_HTML_RELATIVE_PATH,
  buildUmlModelRegistry,
  writeUmlModelRegistryDocuments
} from "./model-documents.js";
import {
  buildCodeUnderstandingSpine,
  codeUnderstandingSpineDigest,
  writeCodeUnderstandingSpineDocuments
} from "./code-understanding-spine.js";
import {
  PROJECT_OVERVIEW_DOC_RELATIVE_PATH,
  PROJECT_TIMELINE_DOC_RELATIVE_PATH,
  normalizeProjectOverviewDraft,
  projectOverviewAgentPayload,
  projectOverviewDocumentsExist,
  readProjectOverviewSourceDocuments,
  writeProjectOverviewDocuments
} from "./project-overview-documents.js";
import {
  PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH,
  PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH,
  approveProjectChangePlan,
  normalizeProjectChangePlanModel,
  projectChangePlanAgentPayload,
  readProjectChangePlan,
  readProjectChangePlanSources,
  reviewFindingChangeItemId,
  upsertReviewFindingChangeItem,
  writeProjectChangePlanDocuments
} from "./project-change-plan-documents.js";
import {
  QUALITY_REVIEW_DOC_RELATIVE_PATH,
  QUALITY_REVIEW_HTML_RELATIVE_PATH,
  QUALITY_REVIEW_RUNTIME_LOG_DIR_RELATIVE_PATH,
  QUALITY_REVIEW_RUNTIME_PROGRESS_RELATIVE_PATH,
  isResolvedFindingStatus,
  readQualityReviewDocumentModel,
  writeQualityReviewDocuments
} from "./quality-review-documents.js";

type Args = Record<string, string | boolean>;
type AgentEngineKind = "pi" | "legacy";
type PiBuiltinToolName = "read" | "grep" | "find" | "ls" | "bash" | "edit" | "write";
type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
const DESIGN_DISCOVERY_PROGRESS_RELATIVE_PATH = ".distinction/runtime/design-discovery-progress.json";
const MEMORY_RECORD_FILES = [
  "facts.jsonl",
  "inferences.jsonl",
  "candidates.jsonl",
  "confirmations.jsonl",
  "decisions.jsonl",
  "findings.jsonl"
];

interface JsonSchema<T> {
  parse(value: unknown): T;
}

interface CodingAgentResultInput {
  taskId: string;
  status: "done" | "partial" | "failed";
  summary: string;
  changedFiles: string[];
  testResult?: string;
  progressSuggestion?: {
    nodeUpdates?: { nodeId: string; progress: number }[];
    edgeUpdates?: { edgeId: string; progress: number }[];
  };
  memorySuggestion?: string;
}

type DesignStoryIntakeIntent = "new_story" | "insufficient_story" | "not_new_story";
type DesignDiagramDiscussionIntent = "explain" | "operate" | "propose_patch" | "out_of_scope" | "needs_selection";
type EngineeringDiagramDiscussionIntent = "explain" | "drilldown" | "governance" | "out_of_scope" | "needs_selection";
type ArchitectureDiagramDiscussionIntent = "explain" | "drilldown" | "boundary" | "out_of_scope" | "needs_selection";
type ReviewFindingDiscussionIntent =
  | "explain_review_finding"
  | "create_project_change"
  | "mark_finding_false_positive"
  | "clarify_review_scope"
  | "out_of_scope"
  | "needs_selection";
type DesignStoryRelationKind = Exclude<InteractionModelCandidate["relations"][number]["kind"], "actor_participates">;
type UseCaseDrilldownDiagramKind = InteractionModelCandidate["useCaseDrilldowns"][number]["kind"];
type UseCaseDrilldownCoverage = InteractionModelCandidate["useCaseDrilldowns"][number]["coverage"];
type DesignVersionBump = "major" | "minor" | "patch" | "none";

interface DesignStoryRelationInput {
  kind: DesignStoryRelationKind;
  targetTitle: string;
  summary: string;
}

interface DesignStoryDrilldownDiagramInput {
  kind: UseCaseDrilldownDiagramKind;
  title: string;
  summary: string;
  coverage: UseCaseDrilldownCoverage;
  explanation: InteractionModelCandidate["useCaseDrilldowns"][number]["explanation"];
  mermaid?: string;
  questions: string[];
}

interface DesignStoryCandidateInput {
  title: string;
  summary: string;
  contextTitle: string;
  contextSummary: string;
  primaryActors: string[];
  supportingActors: string[];
  externalSystems: string[];
  trigger?: string;
  preconditions: string[];
  mainSuccessScenario: string[];
  alternativeFlows: string[];
  failureFlows: string[];
  postconditions: string[];
  questions: string[];
  relations: DesignStoryRelationInput[];
  drilldownDiagrams: DesignStoryDrilldownDiagramInput[];
}

interface DesignStoryIntakeResult {
  schemaVersion: "praxis.designStoryIntakeResult.v1";
  intent: DesignStoryIntakeIntent;
  accepted: boolean;
  summary: string;
  reason: string;
  guidance: string;
  missingParts: string[];
  questions: string[];
  stories: DesignStoryCandidateInput[];
}

interface DesignDiagramDiscussionResult {
  schemaVersion: "praxis.designDiagramDiscussionResult.v1";
  intent: DesignDiagramDiscussionIntent;
  answer: string;
  guidance: string;
  referencedAnchors: string[];
  suggestedOperations: string[];
  affectedDocuments: DesignDiscussionAffectedDocument[];
  documentEdits: DiagramDocumentEdit[];
  risks: string[];
  questions: string[];
}

interface DesignDiscussionAffectedDocument {
  path: string;
  kind: string;
  reason: string;
  update: "must_update" | "review" | "no_change";
}

interface EngineeringDiagramDiscussionResult {
  schemaVersion: "praxis.engineeringDiagramDiscussionResult.v1";
  intent: EngineeringDiagramDiscussionIntent;
  answer: string;
  guidance: string;
  technicalPerspective: string;
  referencedAnchors: string[];
  suggestedDrilldowns: string[];
  documentEdits: DiagramDocumentEdit[];
  risks: string[];
  questions: string[];
}

interface ArchitectureDiagramDiscussionResult {
  schemaVersion: "praxis.architectureDiagramDiscussionResult.v1";
  intent: ArchitectureDiagramDiscussionIntent;
  answer: string;
  guidance: string;
  architecturePerspective: string;
  referencedAnchors: string[];
  suggestedDrilldowns: string[];
  documentEdits: DiagramDocumentEdit[];
  risks: string[];
  questions: string[];
}

interface ReviewFindingDiscussionPlanAction {
  shouldCreateOrUpdate: boolean;
  reason: string;
  expectedChangeSummary: string;
}

interface ReviewFindingStatusDecision {
  shouldUpdate: boolean;
  status: Extract<ReviewFinding["status"], "false_positive" | "needs_more_evidence">;
  reason: string;
  evidenceSummary: string;
  updatedSuggestedAction: string;
}

interface ReviewFindingRegressionAction {
  shouldCreate: boolean;
  reason: string;
  correctedUnderstanding: string;
  affectedCategories: ReviewCategory[];
  affectedFindingIds: string[];
  recommendedReviewScope: string;
}

interface ReviewFindingDiscussionResult {
  schemaVersion: "praxis.reviewFindingDiscussionResult.v1";
  intent: ReviewFindingDiscussionIntent;
  answer: string;
  guidance: string;
  referencedDocuments: string[];
  planAction: ReviewFindingDiscussionPlanAction;
  statusDecision: ReviewFindingStatusDecision;
  regressionAction: ReviewFindingRegressionAction;
  risks: string[];
  questions: string[];
}

interface ReviewFindingDiscussionContext {
  schemaVersion: "praxis.reviewFindingDiscussionContext.v1";
  rootReviewPath: string;
  rootReviewHtmlPath: string;
  finding: ReviewFinding;
  issueDocument?: {
    docPath?: string;
    htmlPath?: string;
    excerpt: string;
  };
  categoryDocument?: {
    category?: string;
    docPath?: string;
    htmlPath?: string;
    excerpt: string;
  };
  rootReviewExcerpt: string;
  projectChangePlan?: {
    exists: boolean;
    stale: boolean;
    markdownRelativePath: string;
    htmlRelativePath: string;
    relatedChangeItemId: string;
    relatedChangeItemStatus?: string;
  };
}

type DiagramDocumentEditOperation = "replace_text" | "replace_between_markers" | "append_section" | "replace_document";
type DiagramDocumentEditStatus = "applied" | "skipped" | "rejected" | "failed";

interface DiagramDocumentEdit {
  path: string;
  operation: DiagramDocumentEditOperation;
  reason: string;
  oldText?: string;
  newText?: string;
  startMarker?: string;
  endMarker?: string;
  content?: string;
  createIfMissing?: boolean;
}

interface DiagramDocumentEditResult {
  path: string;
  operation: DiagramDocumentEditOperation;
  status: DiagramDocumentEditStatus;
  changed: boolean;
  message: string;
  reason?: string;
  bytesWritten?: number;
}

interface EngineeringDiagramDiscussionContext {
  schemaVersion: "praxis.engineeringDiagramContext.v1";
  rootMapPath: string;
  currentDocumentPath: string;
  currentDocumentTitle?: string;
  currentDocumentHtmlExcerpt: string;
  currentDocumentMarkdownExcerpt: string;
  mapIndexExcerpt: string;
  repositoryEvidence: DesignRepositoryEvidenceContext;
  selectedAnchor?: unknown;
}

interface ArchitectureDiagramDiscussionContext {
  schemaVersion: "praxis.architectureDiagramContext.v1";
  rootMapPath: string;
  currentDocumentPath: string;
  currentDocumentTitle?: string;
  currentDocumentHtmlExcerpt: string;
  currentDocumentMarkdownExcerpt: string;
  mapIndexExcerpt: string;
  repositoryEvidence: DesignRepositoryEvidenceContext;
  selectedAnchor?: unknown;
}

interface ScopedAgentConversationHistoryEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  scopeId: string;
  scopeTitle: string;
  scopeKind?: string;
  contextTitle?: string;
  contextPath?: string;
  intent?: string;
  status?: string;
}

interface DesignCurrentUmlContext {
  id: string;
  kind: string;
  title: string;
  summary?: string;
  htmlPath: string;
  markdownPath: string;
  status?: string;
  confidence?: string;
  coverage?: unknown;
  currentDocumentHtmlExcerpt: string;
  currentDocumentMarkdownExcerpt: string;
}

interface DesignLinkedDocumentExcerpt {
  path: string;
  relationship: DesignLinkedDocumentContext["relationship"];
  title: string;
  kind: string;
  markdownExcerpt: string;
  htmlExcerpt: string;
}

interface DesignLinkedDocumentContext {
  id: string;
  kind: string;
  title: string;
  htmlPath?: string;
  markdownPath?: string;
  relationship: "current_uml" | "parent_use_case" | "sibling_uml" | "map_index";
  updateReason: string;
}

interface DesignRepositoryEvidenceNode {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  range?: { startLine: number; endLine: number };
  signature?: string;
  docSummary?: string;
  evidence: CodeFactEvidenceRef[];
  matchReason: string;
}

interface DesignRepositoryEvidenceEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  filePath?: string;
  evidence: CodeFactEvidenceRef[];
}

interface DesignRepositoryEvidenceFileExcerpt {
  path: string;
  reason: string;
  excerpt: string;
}

interface DesignRepositoryEvidenceContext {
  source: "local_code_facts" | "unavailable";
  queryTerms: string[];
  matchingNodes: DesignRepositoryEvidenceNode[];
  relatedEdges: DesignRepositoryEvidenceEdge[];
  fileExcerpts: DesignRepositoryEvidenceFileExcerpt[];
  limitations: string[];
}

interface DesignDiagramDiscussionContext {
  schemaVersion: "praxis.designDiagramContext.v1";
  targetUseCase: InteractionModelCandidate["useCases"][number];
  targetUseCaseDrilldowns: InteractionModelCandidate["useCaseDrilldowns"];
  currentUml: DesignCurrentUmlContext;
  linkedDocuments: DesignLinkedDocumentContext[];
  linkedDocumentExcerpts: DesignLinkedDocumentExcerpt[];
  repositoryEvidence: DesignRepositoryEvidenceContext;
  context?: InteractionModelCandidate["contexts"][number];
  contextUseCases: InteractionModelCandidate["useCases"];
  actors: InteractionModelCandidate["actors"];
  externalSystems: InteractionModelCandidate["externalSystems"];
  relations: InteractionModelCandidate["relations"];
  questions: InteractionModelCandidate["questions"];
  selectedAnchor?: unknown;
  sourceSpecPaths: string[];
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  try {
    if (command === "scan") return await commandScan(args);
    if (command === "code-facts") return await commandCodeFacts(args);
    if (command === "profile") return await commandProfile(args);
    if (command === "generate-graph") return await commandGenerateGraph(args);
    if (command === "intake") return await commandIntake(args);
    if (command === "project:overview") return await commandProjectOverview(args);
    if (command === "project:change-plan") return await commandProjectChangePlan(args);
    if (command === "project:change-plan-discuss") return await commandProjectChangePlanDiscuss(args);
    if (command === "project:change-plan:approve") return await commandProjectChangePlanApprove(args);
    if (command === "understand") return await commandUnderstand(args);
    if (command === "accept-understanding") return await commandAcceptUnderstanding(args);
    if (command === "model-architecture") return await commandModelArchitecture(args);
    if (command === "detect-findings") return await commandDetectFindings(args);
    if (command === "code-understanding:spine") return await commandCodeUnderstandingSpine(args);
    if (command === "design:discover") return await commandDesignDiscover(args);
    if (command === "design:story-intake") return await commandDesignStoryIntake(args);
    if (command === "design:diagram-discuss") return await commandDesignDiagramDiscuss(args);
    if (command === "models:discover") return await commandModelsDiscover(args);
    if (command === "engineering:discover") return await commandEngineeringDiscover(args);
    if (command === "engineering:diagram-discuss") return await commandEngineeringDiagramDiscuss(args);
    if (command === "architecture:discover") return await commandArchitectureDiscover(args);
    if (command === "architecture:diagram-discuss") return await commandArchitectureDiagramDiscuss(args);
    if (command === "review-queue") return await commandReviewQueue(args);
    if (command === "review-progress") return await commandReviewProgress(args);
    if (command === "review-run") return await commandReviewRun(args);
    if (command === "review-finding-refresh") return await commandReviewFindingRefresh(args);
    if (command === "review-finding-plan") return await commandReviewFindingPlan(args);
    if (command === "review:finding-discuss") return await commandReviewFindingDiscuss(args);
    if (command === "project-tree") return await commandProjectTree(args);
    if (command === "finding-audit") return await commandFindingAudit(args);
    if (command === "accept-external-result") return await commandAcceptExternalResult(args);
    if (command === "accept-memory-suggestion") return await commandAcceptMemorySuggestion(args);
    if (command === "accept-finding-status") return await commandAcceptFindingStatus(args);
    if (command === "project:view") return await commandProjectView(args, rest);
    if (command === "context-packet") return await commandContextPacket(args);
    if (command === "serve") return await commandServe(args);
    if (command === "init-memory") return await commandInitMemory(args);
    if (command === "chat") return await commandChat(args);
    if (command === "chat-session-create") return await commandChatSessionCreate(args);
    if (command === "chat-session-list") return await commandChatSessionList(args);
    if (command === "chat-session-read") return await commandChatSessionRead(args);
    if (command === "chat-send") return await commandChatSend(args);
    if (command === "agent-run") return await commandAgentRun(args);
    if (command === "generate-task") return await commandGenerateTask(args);
    if (command === "apply-plan") return await commandApplyPlan(args);
    if (command === "import-task-result") return await commandImportTaskResult(args);
    if (command === "create-project-plan") return await commandCreateProjectPlan(args);
    if (command === "create-project") return await commandCreateProject(args);
    throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function commandServe(args: Args): Promise<void> {
  if (args.mcp !== true) throw new Error("Unsupported serve mode. Use: praxis-runtime serve --mcp --path <project>");
  const root = typeof args.path === "string" ? args.path : required(args, "root");
  await startMcpServer({ root: path.resolve(root) });
}

async function commandScan(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = await scanRepository({ root });
  await maybeWriteJson(args, "out", snapshot);
  outputJson({ ok: true, fileCount: snapshot.files.length, root: snapshot.root });
}

async function commandProjectTree(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const depth = Math.max(1, Math.min(numberArg(args, "depth") ?? 4, 8));
  const maxEntries = Math.max(50, Math.min(numberArg(args, "max-entries") ?? 900, 5000));
  const snapshotPath = path.join(root, ".distinction", "cache", "repository-snapshot.json");
  let snapshot = args.cached === true ? await tryReadJsonFile(snapshotPath) : undefined;
  let source: "filesystem" | "cache" = "cache";
  let warning: string | undefined;
  if (!snapshot) {
    try {
      snapshot = await scanRepository({
        root,
        includeHidden: args["include-hidden"] !== false,
        maxFiles: Math.max(12_000, maxEntries * 3),
        maxFileSizeBytes: 256_000,
        ignore: projectTreeIgnoreNames(args)
      });
      source = "filesystem";
    } catch (err) {
      snapshot = await tryReadJsonFile(snapshotPath);
      warning = err instanceof Error ? err.message : String(err);
      source = "cache";
    }
  }
  const fileEntries: ProjectTreeFileEntry[] = [];
  const directoryEntries: ProjectTreeDirectoryEntry[] = [];
  if (isRecord(snapshot) && Array.isArray(snapshot.files)) {
    for (const rawFile of snapshot.files) {
      if (!isRecord(rawFile)) continue;
      const filePath = optionalString(rawFile.path);
      if (!filePath) continue;
      fileEntries.push({
        path: filePath,
        language: optionalString(rawFile.language),
        roleHint: optionalString(rawFile.roleHint),
        lineCount: typeof rawFile.lineCount === "number" ? rawFile.lineCount : undefined,
        sizeBytes: typeof rawFile.sizeBytes === "number" ? rawFile.sizeBytes : undefined
      });
    }
  }
  if (isRecord(snapshot) && Array.isArray(snapshot.directories)) {
    for (const rawDirectory of snapshot.directories) {
      if (!isRecord(rawDirectory)) continue;
      const directoryPath = optionalString(rawDirectory.path);
      if (!directoryPath) continue;
      directoryEntries.push({
        path: directoryPath,
        roleHint: optionalString(rawDirectory.roleHint)
      });
    }
  }
  const tree = buildProjectTree(fileEntries, directoryEntries, depth, maxEntries);
  const result = {
    ...tree,
    source,
    scannedAt: isRecord(snapshot) ? optionalString(snapshot.scannedAt) : undefined,
    totalDirectories: directoryEntries.length,
    warning
  };
  await maybeWriteJson(args, "out", result);
  outputJson(result);
}

async function commandCodeFacts(args: Args): Promise<void> {
  const root = required(args, "root");
  const snapshot = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );
  await maybeWriteJson(args, "out", snapshot);
  if (args["write-cache"] === true) {
    const cachePath = path.join(path.resolve(root), ".distinction", "cache", "code-fact-graph.json");
    await writeJson(cachePath, snapshot, CodeFactGraphSnapshotSchema);
  }
  outputJson({
    ok: true,
    root: snapshot.root,
    provider: snapshot.provider,
    files: snapshot.statistics.fileCount,
    nodes: snapshot.statistics.nodeCount,
    edges: snapshot.statistics.edgeCount,
    warnings: snapshot.warnings
  });
}

async function commandProfile(args: Args): Promise<void> {
  const snapshot = await readJson(required(args, "snapshot"));
  const profile = await profileProject(snapshot);
  await maybeWriteJson(args, "out", profile);
  outputJson({ ok: true, modules: profile.moduleCandidates.length, projectKinds: profile.projectKinds });
}

async function commandGenerateGraph(args: Args): Promise<void> {
  const snapshot = await readJson(required(args, "snapshot"));
  const profile = await readJson(required(args, "profile"));
  const candidate = generateDevelopmentGraphCandidate({ snapshot, profile });
  await maybeWriteJson(args, "out", candidate);
  outputJson({
    ok: true,
    flow: "legacy_development_graph",
    legacy: true,
    nextFlow: "Use intake -> model-architecture -> detect-findings -> project:view for the v0.1 projection pipeline.",
    nodes: candidate.graph.nodes.length,
    edges: candidate.graph.edges.length,
    warnings: candidate.warnings.length
  });
}

async function commandIntake(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const snapshot = await scanRepository({ root });
  const codeFacts = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );

  await writeJson(path.join(resolvedRoot, ".distinction", "cache", "repository-snapshot.json"), snapshot);
  const codeFactsPath = path.join(resolvedRoot, ".distinction", "cache", "code-fact-graph.json");
  await writeJson(codeFactsPath, codeFacts, CodeFactGraphSnapshotSchema);

  const profile = await profileProject(snapshot);
  const profilePath = path.join(resolvedRoot, ".distinction", "cache", "project-profile.json");
  await writeJson(profilePath, profile);

  const understanding = RepositoryUnderstandingPatchSchema.parse(buildRepositoryUnderstandingPatch(codeFacts));
  const understandingPath = path.join(resolvedRoot, ".distinction", "cache", "repository-understanding-patch.json");
  await writeJson(understandingPath, understanding, RepositoryUnderstandingPatchSchema);

  const previewFacts = proposedFactRecordsFromPatchForPreview(understanding);
  const architecture = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(resolvedRoot, previewFacts));
  const architecturePath = path.join(resolvedRoot, ".distinction", "cache", "architecture-model-patch.json");
  await writeJson(architecturePath, architecture, ArchitectureModelPatchSchema);

  const findings = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(architecture));
  const findingsPath = path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");
  await writeJson(findingsPath, findings, ArchitectureFindingReportSchema);

  outputJson({
    ok: true,
    root: resolvedRoot,
    reviewOnly: true,
    provider: codeFacts.provider,
    cache: {
      repositorySnapshot: path.relative(resolvedRoot, path.join(resolvedRoot, ".distinction", "cache", "repository-snapshot.json")),
      codeFacts: path.relative(resolvedRoot, codeFactsPath),
      projectProfile: path.relative(resolvedRoot, profilePath),
      repositoryUnderstandingPatch: path.relative(resolvedRoot, understandingPath),
      architectureModelPatch: path.relative(resolvedRoot, architecturePath),
      architectureFindings: path.relative(resolvedRoot, findingsPath)
    },
    summary: {
      files: snapshot.files.length,
      codeFactNodes: codeFacts.statistics.nodeCount,
      codeFactEdges: codeFacts.statistics.edgeCount,
      memoryPatches: understanding.memoryPatches.length,
      modules: architecture.modules.length,
      dependencies: architecture.dependencies.length,
      findings: findings.findings.length
    },
    next: "Run praxis-runtime accept-understanding --root <path> to persist FACT memory."
  });
}

async function commandInitMemory(args: Args): Promise<void> {
  const root = required(args, "root");
  const candidate = (await readJson(required(args, "candidate"))) as DevelopmentGraphCandidate;
  await initializeLocalKnowledge(root, candidate);
  outputJson({
    ok: true,
    flow: "legacy_development_graph",
    legacy: true,
    nextFlow: "Use project:view outputs under .distinction/views/ for new projection cache.",
    distinction: path.join(path.resolve(root), ".distinction")
  });
}

async function commandChat(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const target = required(args, "target");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const instruction = String(args.instruction ?? (mode === "plan" ? "Generate plan" : "Explain selected target"));
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const runtime = new PraxisAgentRuntime();
  const targetObject = target.startsWith("edge:") ? { type: "edge" as const, id: target } : { type: "node" as const, id: target };
  const result = await runtime.run({
    mode,
    projectRoot,
    graph,
    target: targetObject,
    instruction,
    taskType: targetObject.type === "edge" ? (mode === "plan" ? "graph.edge.plan" : "graph.edge.explain") : mode === "plan" ? "graph.node.plan" : "graph.node.explain"
  });
  await maybeWriteJson(args, "out", result.structured ?? result);
  outputJson(result);
}

async function commandAgentRun(args: Args): Promise<void> {
  const engine = resolveAgentEngineKind(args);
  if (engine === "legacy") return await commandAgentRunLegacy(args);
  return await commandAgentRunPi(args);
}

async function commandAgentRunLegacy(args: Args): Promise<void> {
  console.error("[agent-run] Starting agent run...");
  const projectRoot = required(args, "project-root");
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const instruction = String(args.instruction ?? args.message ?? "Explain the selected target.");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const requestedSessionId = typeof args.session === "string" ? args.session : undefined;
  const existingSession = requestedSessionId ? await readSession(projectRoot, requestedSessionId) : undefined;
  const session = existingSession ?? await createSessionForTarget(projectRoot, target, {
    title: sessionTitleForTarget(graph, target),
    mode: chatModeFromArgs(args)
  });

  const priorMessages = await readMessages(projectRoot, session.id);
  const sharedConversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));

  // Save user message to session first (so it appears in transcript)
  await appendMessage(projectRoot, {
    sessionId: session.id,
    role: "user",
    content: instruction
  });

  const registry = new ToolRegistry();
  registerAgentTools(registry);
  console.error(`[agent-run] Session ${session.id}, mode=${mode}, instruction="${instruction.slice(0,60)}"`);

  const loop = new AgentLoop();
  console.error("[agent-run] Starting agent loop...");
  const result = await loop.run({
    projectRoot,
    sessionId: session.id,
    target: selectionTargetFromChatTarget(graph, target),
    mode,
    instruction,
    graph,
    registry,
    conversationHistory: agentConversationHistoryForRuntime(sharedConversationHistory, priorMessages),
    maxToolCalls: mode === "explain" ? 18 : 24,
    onStep: async (step: AgentStep) => {
      if (step.kind === "tool_call") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "tool",
          content: `[${step.toolStatus}] ${step.toolName}: ${step.toolInputSummary ?? ""}`,
          toolCall: {
            id: step.id,
            name: step.toolName ?? "unknown",
            status: (step.toolStatus as "pending" | "running" | "success" | "failed") ?? "running",
            inputSummary: step.toolInputSummary ?? "",
            outputSummary: step.toolOutputSummary,
            riskLevel: step.toolRiskLevel ?? "read"
          }
        });
      } else if (step.kind === "tool_result") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "tool",
          content: `[${step.toolStatus}] ${step.toolName}: ${step.toolOutputSummary ?? ""}`,
          toolCall: {
            id: step.toolCallId ?? step.id,
            name: step.toolName ?? "unknown",
            status: (step.toolStatus as "pending" | "running" | "success" | "failed") ?? "success",
            inputSummary: "",
            outputSummary: step.toolOutputSummary,
            riskLevel: step.toolRiskLevel ?? "read"
          }
        });
      } else if (step.kind === "model_response" && step.reasoningContent) {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "system",
          content: `Reasoning: ${step.reasoningContent?.slice(0, 2000) ?? ""}`,
          structured: { reasoning: { content: step.reasoningContent, durationMs: step.reasoningDurationMs } }
        });
      } else if (step.kind === "context_compaction") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "system",
          content: step.transitionReason === "reactive_compact_retry"
            ? "Context was compacted after a prompt-too-long error; the agent is retrying with a summarized history."
            : "Older conversation history was compacted into a summary for this agent run.",
          structured: {
            compaction: {
              reason: step.transitionReason,
              compactedMessageCount: step.compactedMessageCount,
              compactedChars: step.compactedChars,
              summary: step.compactSummary
            }
          }
        });
      } else if (step.kind === "error") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "error",
          content: step.errorMessage ?? "Agent run failed.",
          status: "failed"
        });
      } else if (step.kind === "permission_request") {
        await appendMessage(projectRoot, {
          sessionId: session.id,
          role: "permission",
          content: step.permissionDescription ?? "Permission required.",
          permissionRequest: {
            id: step.permissionId ?? `perm-${Date.now()}`,
            title: step.permissionTitle ?? "Permission Required",
            description: step.permissionDescription ?? "",
            actionType: (step.permissionActionType as PermissionRequestView["actionType"]) ?? "tool_call",
            affectedPaths: step.permissionAffectedPaths ?? [],
            affectedNodeIds: [],
            affectedEdgeIds: [],
            options: (step.permissionOptions as { id: "approve" | "reject" | "modify"; label: string }[]) ?? [
              { id: "approve" as const, label: "Approve once" },
              { id: "reject" as const, label: "Reject" }
            ]
          }
        });
      }
    },
    onPermissionRequired: async (step: AgentStep) => {
      const decision = await waitForPermissionDecision(projectRoot, step.permissionId ?? "");
      await appendMessage(projectRoot, {
        sessionId: session.id,
        role: "result",
        content: decision === "approve"
          ? `Permission approved: ${step.toolName ?? "tool"}`
          : decision === "modify"
            ? `Permission modification requested: ${step.toolName ?? "tool"}`
            : `Permission rejected: ${step.toolName ?? "tool"}`,
        structured: { permissionId: step.permissionId, decision, toolName: step.toolName }
      });
      return decision;
    }
  });

  if (result.run.status === "completed") {
    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "assistant",
      content: result.finalMessage,
      structured: result.finalStructured,
      traceIds: result.run.steps.filter((s) => s.kind === "model_response").map((s) => s.id)
    });
  } else if (!result.run.steps.some((step) => step.kind === "error" && step.errorMessage === result.finalMessage)) {
    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "error",
      content: result.finalMessage,
      status: result.run.status === "cancelled" ? "cancelled" : "failed",
      structured: { runStatus: result.run.status }
    });
  }

  console.error(`[agent-run] Run completed: status=${result.run.status}, steps=${result.run.steps.length}`);
  const runPath = await persistRun(projectRoot, result.run);

  outputJson({
    ok: true,
    sessionId: session.id,
    runId: result.run.id,
    runPath,
    logPaths: agentLogPaths(projectRoot, session.id, runPath),
    runStatus: result.run.status,
    terminalReason: result.terminalReason,
    transitions: result.run.transitions,
    stepCount: result.run.steps.length,
    finalMessage: result.finalMessage,
    finalStructured: result.finalStructured
  });
}

async function commandAgentRunPi(args: Args): Promise<void> {
  console.error("[agent-run] Starting Pi agent run...");
  const projectRoot = path.resolve(required(args, "project-root"));
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const instruction = String(args.instruction ?? args.message ?? "Explain the selected target.");
  const mode = (args.mode === "plan" ? "plan" : "explain") as "explain" | "plan";
  const requestedTools = resolvePiToolAllowlist(args);
  const requestedSessionId = typeof args.session === "string" ? args.session : undefined;
  const existingSession = requestedSessionId ? await readSession(projectRoot, requestedSessionId) : undefined;
  const session = existingSession ?? await createSessionForTarget(projectRoot, target, {
    title: sessionTitleForTarget(graph, target),
    mode: chatModeFromArgs(args)
  });
  const priorMessages = await readMessages(projectRoot, session.id);
  const sharedConversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));

  await appendMessage(projectRoot, {
    sessionId: session.id,
    role: "user",
    content: instruction
  });

  const run = createExternalAgentRun({
    projectRoot,
    sessionId: session.id,
    target: selectionTargetFromChatTarget(graph, target),
    mode,
    instruction,
    engine: "pi"
  });
  const traceId = `trace:${run.id}`;

  await appendAgentTrace(projectRoot, {
    traceId,
    kind: "agent.pi.started",
    target: run.target,
    summary: `Pi worker started for ${mode}.`,
    data: {
      sessionId: session.id,
      target,
      tools: requestedTools
    }
  });

  const startStep = createExternalAgentStep(run, "command_result", {
    toolName: "pi",
    toolRiskLevel: "read",
    toolStatus: "running",
    toolInputSummary: `Pi worker starting in ${mode} mode. Tools: ${requestedTools.join(", ")}`,
    toolOutputSummary: "Waiting for Pi to inspect the project and return a response."
  });
  run.steps.push(startStep);
  await appendMessage(projectRoot, {
    sessionId: session.id,
    role: "tool",
    content: `[running] pi: ${startStep.toolInputSummary}`,
    toolCall: {
      id: startStep.id,
      name: "pi",
      status: "running",
      inputSummary: startStep.toolInputSummary ?? "Pi worker starting.",
      outputSummary: startStep.toolOutputSummary,
      riskLevel: "read"
    },
    structured: {
      engine: "pi",
      agentStep: startStep,
      note: "This is the visible Pi worker process. Private model chain-of-thought is not exposed."
    },
    traceIds: [traceId, startStep.id]
  });

  try {
    const seenPiToolIds = new Set<string>();
    const piToolInputSummaries = new Map<string, string>();
    const appendPiEvent = async (event: PiJsonEvent) => {
      const toolView = piToolViewFromEvent(event);
      if (!toolView) return;
      const previousInputSummary = piToolInputSummaries.get(toolView.id);
      if (previousInputSummary && toolView.inputSummary.trim() === `${toolView.name}:`) {
        toolView.inputSummary = previousInputSummary;
      }
      if (toolView.inputSummary.trim() !== `${toolView.name}:`) {
        piToolInputSummaries.set(toolView.id, toolView.inputSummary);
      }
      seenPiToolIds.add(toolView.id);
      const eventStep = createExternalAgentStep(run, toolView.status === "success" || toolView.status === "failed" ? "tool_result" : "tool_call", {
        toolName: toolView.name,
        toolInput: piEventValue(event, "args"),
        toolOutput: piEventValue(event, "result") ?? piEventValue(event, "partialResult"),
        toolRiskLevel: toolView.riskLevel,
        toolStatus: toolView.status,
        toolInputSummary: toolView.inputSummary,
        toolOutputSummary: toolView.outputSummary,
        toolCallId: toolView.id
      });
      run.steps.push(eventStep);
      await appendMessage(projectRoot, {
        sessionId: session.id,
        role: "tool",
        content: `[${toolView.status}] ${toolView.name}: ${toolView.outputSummary ?? toolView.inputSummary}`,
        toolCall: toolView,
        structured: {
          engine: "pi",
          piEventType: event.type,
          agentStep: eventStep,
          visibleProcess: true,
          note: "Observable Pi tool event. Private model chain-of-thought is not exposed."
        },
        traceIds: [traceId, toolView.id, eventStep.id]
      });
    };

    const pi = await runPiWorker({
      projectRoot,
      graph,
      target,
      mode,
      instruction,
      priorMessages,
      sharedConversationHistory,
      args,
      traceId,
      onEvent: appendPiEvent
    });

    const finalMessage = normalizePiFinalMessage(pi.stdout);
    const commandStep = createExternalAgentStep(run, "command_result", {
      commandLine: pi.commandLine,
      commandStdout: summarizeForRun(pi.stdout, 6000),
      commandStderr: summarizeForRun(pi.stderr, 3000),
      commandExitCode: pi.exitCode,
      toolName: "pi",
      toolRiskLevel: "read",
      toolStatus: "success",
      toolOutputSummary: `Pi completed in ${Math.round(pi.durationMs / 1000)}s.`
    });
    run.steps.push(commandStep);

    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "tool",
      content: `[success] pi: ${commandStep.toolOutputSummary}`,
      toolCall: {
        id: startStep.id,
        name: "pi",
        status: "success",
        inputSummary: summarizeForRun(pi.commandLine, 900),
        outputSummary: `${commandStep.toolOutputSummary} Response: ${finalMessage.length} chars.`,
        riskLevel: "read"
      },
      structured: {
        engine: "pi",
        agentStep: commandStep,
        modelRoute: pi.modelRoute,
        tools: pi.tools,
        piEventCount: pi.eventCount,
        piToolCalls: seenPiToolIds.size,
        diagnostics: pi.diagnostics,
        durationMs: pi.durationMs
      },
      traceIds: [traceId, startStep.id, commandStep.id]
    });

    const responseStep = createExternalAgentStep(run, "model_response", {
      modelContent: finalMessage,
      modelStructured: safeJson(finalMessage)
    });
    run.steps.push(responseStep);
    finishExternalAgentRun(run, "completed", "completed");

    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "assistant",
      content: finalMessage,
      structured: {
        engine: "pi",
        modelRoute: pi.modelRoute,
        tools: pi.tools,
        codegraphTools: isPiCodeGraphEnabled(args),
        piEventCount: pi.eventCount,
        piToolCalls: seenPiToolIds.size,
        diagnostics: pi.diagnostics,
        durationMs: pi.durationMs,
        note: "Pi output is treated as CANDIDATE/INFERENCE until accepted by Praxis/user."
      },
      traceIds: [traceId, responseStep.id]
    });

    await appendAgentTrace(projectRoot, {
      traceId,
      kind: "agent.pi.completed",
      target: run.target,
      summary: `Pi worker completed with ${finalMessage.length} chars.`,
      data: {
        sessionId: session.id,
        provider: pi.provider,
        model: pi.model,
        tools: pi.tools,
        codegraphTools: isPiCodeGraphEnabled(args),
        piEventCount: pi.eventCount,
        piToolCalls: seenPiToolIds.size,
        diagnostics: pi.diagnostics,
        durationMs: pi.durationMs
      }
    });

    console.error(`[agent-run] Pi run completed: status=${run.status}, steps=${run.steps.length}`);
    const runPath = await persistRun(projectRoot, run);
    outputJson({
      ok: true,
      engine: "pi",
      sessionId: session.id,
      runId: run.id,
      runPath,
      logPaths: agentLogPaths(projectRoot, session.id, runPath),
      runStatus: run.status,
      terminalReason: run.terminalReason,
      transitions: run.transitions,
      stepCount: run.steps.length,
      finalMessage,
      finalStructured: responseStep.modelStructured
    });
  } catch (error) {
    const errorMessage = sanitizePiOutput(error instanceof Error ? error.message : String(error));
    const errorStep = createExternalAgentStep(run, "error", { errorMessage });
    run.steps.push(errorStep);
    finishExternalAgentRun(run, "failed", isPromptTooLongMessage(errorMessage) ? "prompt_too_long" : "model_error", errorMessage);

    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "tool",
      content: `[failed] pi: ${errorMessage.slice(0, 600)}`,
      toolCall: {
        id: startStep.id,
        name: "pi",
        status: "failed",
        inputSummary: startStep.toolInputSummary ?? "Pi worker failed.",
        outputSummary: errorMessage.slice(0, 1200),
        riskLevel: "read"
      },
      structured: {
        engine: "pi",
        agentStep: errorStep,
        diagnostics: piFailureDiagnostics(errorMessage)
      },
      traceIds: [traceId, startStep.id, errorStep.id]
    });

    await appendMessage(projectRoot, {
      sessionId: session.id,
      role: "error",
      content: piFailureMessage(errorMessage),
      status: "failed",
      structured: {
        engine: "pi",
        diagnostics: piFailureDiagnostics(errorMessage)
      }
    });

    await appendAgentTrace(projectRoot, {
      traceId,
      kind: "agent.pi.failed",
      target: run.target,
      summary: `Pi worker failed: ${errorMessage.slice(0, 200)}`,
      data: {
        sessionId: session.id,
        error: errorMessage
      }
    });

    console.error(`[agent-run] Pi run failed: ${errorMessage}`);
    const runPath = await persistRun(projectRoot, run);
    outputJson({
      ok: false,
      engine: "pi",
      sessionId: session.id,
      runId: run.id,
      runPath,
      logPaths: agentLogPaths(projectRoot, session.id, runPath),
      runStatus: run.status,
      terminalReason: run.terminalReason,
      transitions: run.transitions,
      stepCount: run.steps.length,
      finalMessage: piFailureMessage(errorMessage)
    });
    process.exitCode = 1;
  }
}

async function commandChatSessionCreate(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const session = await createSessionForTarget(projectRoot, target, {
    title: sessionTitleForTarget(graph, target),
    mode: chatModeFromArgs(args)
  });
  outputJson({ ok: true, session, messages: await readMessages(projectRoot, session.id) });
}

async function waitForPermissionDecision(projectRoot: string, permissionId: string): Promise<"approve" | "reject" | "modify"> {
  if (!permissionId) return "reject";
  const responsePath = path.join(projectRoot, ".distinction", `.perm-${permissionId}.json`);
  const startedAt = Date.now();
  const timeoutMs = 60 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const raw = await readFile(responsePath, "utf8");
      await rm(responsePath, { force: true });
      const parsed = JSON.parse(raw) as { status?: string; approval?: string };
      const value = String(parsed.approval ?? parsed.status ?? "").toLowerCase();
      if (value === "approved" || value === "approve") return "approve";
      if (value === "modify") return "modify";
      return "reject";
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Permission request timed out: ${permissionId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatHistoryForAgent(messages: ChatMessage[]): AgentConversationMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: chatHistoryContent(message)
    }))
    .filter((message) => message.content.trim().length > 0);
}

function agentConversationHistoryForRuntime(
  sharedHistory: ScopedAgentConversationHistoryEntry[],
  sessionMessages: ChatMessage[]
): AgentConversationMessage[] {
  return [
    ...scopedHistoryForAgent(sharedHistory),
    ...chatHistoryForAgent(sessionMessages)
  ].slice(-40);
}

function scopedHistoryForAgent(entries: ScopedAgentConversationHistoryEntry[]): AgentConversationMessage[] {
  return entries.slice(-32).map((entry) => ({
    role: entry.role,
    content: scopedHistoryContent(entry)
  })).filter((message) => message.content.trim().length > 0);
}

function scopedHistoryContent(entry: ScopedAgentConversationHistoryEntry): string {
  const scope = [
    entry.scopeKind ? `scope=${entry.scopeKind}` : "scope=global",
    entry.scopeTitle,
    entry.contextTitle,
    entry.intent ? `intent=${entry.intent}` : undefined,
    entry.status ? `status=${entry.status}` : undefined,
    entry.contextPath ? `path=${entry.contextPath}` : undefined
  ].filter(Boolean).join(" | ");
  return [`[Shared Praxis agent history: ${scope}]`, entry.text].join("\n");
}

function chatHistoryContent(message: ChatMessage): string {
  const sections = [message.content];
  if (message.toolCall) {
    sections.push(`Tool ${message.toolCall.name} ${message.toolCall.status}: ${message.toolCall.outputSummary ?? message.toolCall.inputSummary}`);
  }
  if (message.permissionRequest) {
    sections.push(`Permission ${message.permissionRequest.id}: ${message.permissionRequest.actionType} (${message.permissionRequest.title})`);
  }
  if (message.plan) {
    sections.push([
      `Plan ${message.plan.id}: ${message.plan.summary}`,
      ...message.plan.actions.map((action) => `- ${action.id}: ${action.title}`)
    ].join("\n"));
  }
  if (message.task) {
    sections.push(`Coding task ${message.task.id}: ${message.task.title}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

interface PiWorkerRunOptions {
  projectRoot: string;
  graph: DevelopmentGraph;
  target: ChatTarget;
  mode: "explain" | "plan";
  instruction: string;
  priorMessages: ChatMessage[];
  sharedConversationHistory: ScopedAgentConversationHistoryEntry[];
  args: Args;
  traceId: string;
  onEvent?: (event: PiJsonEvent) => Promise<void> | void;
}

interface PiWorkerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  commandLine: string;
  provider: string;
  model: string;
  modelRoute: string;
  tools: string[];
  diagnostics: string[];
  rawStdout?: string;
  eventCount?: number;
}

type PiJsonEvent = Record<string, unknown> & { type?: string };

interface PiJsonWorkerLaunchOptions {
  projectRoot: string;
  args: Args;
  mode: "explain" | "plan";
  target: ChatTarget;
  prompt: string;
  thinking?: string;
  timeoutMs: number;
  tools?: string[];
  onStart?: (metadata: {
    route: { provider: string; model: string };
    tools: string[];
    diagnostics: string[];
  }) => Promise<void> | void;
  onJson?: (event: PiJsonEvent, assistantText?: string) => Promise<void> | void;
}

interface PiJsonWorkerLaunchResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  eventCount: number;
  assistantText: string;
  diagnostics: string[];
  commandLine: string;
  provider: string;
  model: string;
  modelRoute: string;
  tools: string[];
}

interface PiRuntimeSettings {
  provider?: string;
  model?: string;
  thinking?: PiThinkingLevel;
  tools?: string;
  codeGraph?: boolean;
  allowRead?: boolean;
  allowShell?: boolean;
  allowWrite?: boolean;
  timeoutMs?: number;
  reviewThinking?: PiThinkingLevel;
  reviewTimeoutMs?: number;
}

const legacyDefaultPiTools = "read,grep,find,ls,codegraph_query,codegraph_context,codegraph_relations,bash,edit,write";
const defaultPiTools = [
  "praxis_status",
  "praxis_context_packet",
  "praxis_projection_views",
  "praxis_code_facts",
  "praxis_findings",
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write"
].join(",");

const defaultPiRuntimeSettings = {
  provider: "deepseek",
  model: "deepseek-v4-pro",
  thinking: "high",
  tools: defaultPiTools,
  codeGraph: true,
  allowRead: true,
  allowShell: true,
  allowWrite: true,
  timeoutMs: 300_000,
  reviewThinking: "high",
  reviewTimeoutMs: 0
} satisfies Required<PiRuntimeSettings>;

const piCodeGraphTools = new Set(["codegraph_query", "codegraph_context", "codegraph_relations"]);
const minimumPiNodeVersion = { major: 22, minor: 19, patch: 0 };
const minimumPiNodeVersionLabel = `${minimumPiNodeVersion.major}.${minimumPiNodeVersion.minor}.${minimumPiNodeVersion.patch}`;

interface PiReviewPromptRunInput {
  root: string;
  args: Args;
  runId: string;
  category: ReviewCategory;
  evaluator: ReviewEvaluatorRef;
  prompt: string;
  timeoutMs: number;
  progressPath?: string;
  progressBase?: ReviewProgressSnapshot;
}

interface ResolvedPiCli {
  cliPath: string;
  source: string;
  diagnostics: string[];
}

interface ResolvedPiNode {
  nodePath: string;
  version: string;
  source: string;
  diagnostics: string[];
}

function resolveAgentEngineKind(args: Args): AgentEngineKind {
  const raw = String(args.engine ?? process.env.PRAXIS_AGENT_ENGINE ?? "pi").trim().toLowerCase();
  if (raw === "legacy" || raw === "praxis") return "legacy";
  if (raw === "pi" || raw === "default") return "pi";
  throw new Error(`Unsupported agent engine: ${raw}. Use "pi" or "legacy".`);
}

async function runPiWorker(options: PiWorkerRunOptions): Promise<PiWorkerRunResult> {
  const prompt = buildPiWorkerPrompt(options);
  const startedAt = Date.now();
  const launched = await launchPiJsonWorker({
    projectRoot: options.projectRoot,
    args: options.args,
    mode: options.mode,
    target: options.target,
    prompt,
    timeoutMs: piTimeoutMsArg(options.args, ["pi-timeout-ms"], 180_000),
    onJson: async (event) => {
      await options.onEvent?.(event);
    }
  });

  const cleanStdout = sanitizePiOutput(launched.assistantText);
  const cleanStderr = sanitizePiOutput(launched.stderr);
  if (launched.exitCode !== 0) {
    const detail = [cleanStderr, cleanStdout, summarizeForRun(launched.stdout, 3000)].filter(Boolean).join("\n\n").trim();
    throw new Error(formatPiFailureDetail(detail || `Pi exited with code ${launched.exitCode}.`, launched.diagnostics));
  }
  if (!cleanStdout.trim()) {
    throw new Error(formatPiFailureDetail("Pi completed without producing an assistant response. The JSON event stream did not contain a final assistant message.", launched.diagnostics));
  }

  return {
    stdout: cleanStdout,
    stderr: cleanStderr,
    exitCode: launched.exitCode,
    durationMs: Date.now() - startedAt,
    commandLine: launched.commandLine,
    provider: launched.provider,
    model: launched.model,
    modelRoute: launched.modelRoute,
    tools: launched.tools,
    diagnostics: launched.diagnostics,
    rawStdout: launched.stdout,
    eventCount: launched.eventCount
  };
}

async function launchPiJsonWorker(options: PiJsonWorkerLaunchOptions): Promise<PiJsonWorkerLaunchResult> {
  const piCli = await resolvePiCliPath(options.args);
  const piNode = await resolvePiNode(options.args);
  const modelRoute = await resolvePiModelRoute(options.projectRoot, options.mode, options.target, options.args);
  const tools = options.tools ?? resolvePiToolAllowlist(options.args);
  const codeGraphExtension = shouldEnablePiCodeGraphExtension(options.args, tools) ? resolvePiCodeGraphExtensionPath() : undefined;
  const praxisExtension = resolvePiPraxisExtensionPath();
  const piArgs = [
    piCli.cliPath,
    "--mode",
    "json",
    "--provider",
    modelRoute.provider,
    "--model",
    modelRoute.model,
    "--thinking",
    options.thinking ?? modelRoute.thinking,
    "--system-prompt",
    piSystemPrompt(),
    "--no-session",
    "--no-extensions",
    "--extension",
    praxisExtension,
    ...(codeGraphExtension ? ["--extension", codeGraphExtension] : []),
    "--tools",
    tools.join(","),
    "-p",
    options.prompt
  ];

  const env = await piWorkerEnv(options.projectRoot, modelRoute.provider);
  env.PRAXIS_PI_PROJECT_ROOT = options.projectRoot;
  const diagnostics = piRuntimeDiagnostics(piCli, piNode, modelRoute, env);
  await options.onStart?.({
    route: modelRoute,
    tools,
    diagnostics
  });
  let assistantText = "";
  try {
    const spawned = await spawnStreamingJson(piNode.nodePath, piArgs, {
      cwd: options.projectRoot,
      env,
      timeoutMs: options.timeoutMs,
      onJson: async (event) => {
        const eventAssistantText = piAssistantTextFromEvent(event);
        if (eventAssistantText) assistantText = eventAssistantText;
        await options.onJson?.(event, eventAssistantText);
      }
    });
    return {
      ...spawned,
      assistantText,
      diagnostics,
      commandLine: renderCommandLine(piNode.nodePath, piArgs),
      provider: modelRoute.provider,
      model: modelRoute.model,
      modelRoute: `${modelRoute.provider}/${modelRoute.model}`,
      tools
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(formatPiFailureDetail(detail, diagnostics));
  }
}

async function resolvePiCliPath(args: Args): Promise<ResolvedPiCli> {
  const explicit = stringArg(args, "pi-cli") ?? process.env.PRAXIS_PI_CLI_PATH;
  if (explicit) {
    const cliPath = path.resolve(explicit);
    if (await exists(cliPath)) {
      return {
        cliPath,
        source: "explicit",
        diagnostics: [`Pi CLI resolved from ${stringArg(args, "pi-cli") ? "--pi-cli" : "PRAXIS_PI_CLI_PATH"}: ${cliPath}`]
      };
    }
    throw new Error(formatPiCliResolutionFailure([`Explicit Pi CLI path does not exist: ${cliPath}`]));
  }

  const attempts: string[] = [];
  try {
    const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const cliPath = path.join(path.dirname(entry), "cli.js");
    attempts.push(`ESM package export resolved to ${entry}; checking ${cliPath}`);
    if (await exists(cliPath)) {
      return {
        cliPath,
        source: "package-export",
        diagnostics: [`Pi CLI resolved from ESM package export: ${cliPath}`]
      };
    }
  } catch (error) {
    attempts.push(`ESM package export failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const cliPath of piCliCandidatePaths()) {
    attempts.push(`Checking ${cliPath}`);
    if (await exists(cliPath)) {
      return {
        cliPath,
        source: "node-modules-candidate",
        diagnostics: [`Pi CLI resolved from local node_modules: ${cliPath}`]
      };
    }
  }

  throw new Error(formatPiCliResolutionFailure(attempts));
}

async function resolvePiNode(args: Args): Promise<ResolvedPiNode> {
  const argExplicit = stringArg(args, "pi-node");
  if (argExplicit) {
    return await resolveExplicitPiNode(argExplicit, "--pi-node");
  }

  const diagnostics: string[] = [];
  const envExplicit = process.env.PRAXIS_PI_NODE_PATH ?? process.env.PRAXIS_RUNTIME_NODE_PATH;
  if (envExplicit) {
    const source = process.env.PRAXIS_PI_NODE_PATH ? "PRAXIS_PI_NODE_PATH" : "PRAXIS_RUNTIME_NODE_PATH";
    const checked = await checkPiNodeCandidate(normalizeExecutableCandidate(envExplicit), source);
    diagnostics.push(...checked.diagnostics);
    if (checked.node) {
      return {
        ...checked.node,
        diagnostics
      };
    }
    diagnostics.push(`Pi Node environment candidate from ${source} was rejected; Praxis will continue with bundled/current runtime candidates.`);
  }

  for (const candidate of piNodeCandidatePaths()) {
    const checked = await checkPiNodeCandidate(candidate, "bundled-runtime");
    diagnostics.push(...checked.diagnostics);
    if (checked.node) return { ...checked.node, diagnostics };
  }

  const current = await checkPiNodeCandidate(process.execPath, "current-runtime");
  diagnostics.push(...current.diagnostics);
  if (current.node) return { ...current.node, diagnostics };

  throw new Error(formatPiNodeResolutionFailure(diagnostics));
}

async function resolveExplicitPiNode(raw: string, source: string): Promise<ResolvedPiNode> {
  const nodePath = normalizeExecutableCandidate(raw);
  const checked = await checkPiNodeCandidate(nodePath, source);
  if (checked.node) {
    return {
      ...checked.node,
      diagnostics: [`Pi Node resolved from ${source}: ${nodePath}`, ...checked.diagnostics]
    };
  }
  throw new Error(formatPiNodeResolutionFailure([`Explicit Pi Node from ${source} is not usable: ${nodePath}`, ...checked.diagnostics]));
}

function piNodeCandidatePaths(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", process.platform === "win32" ? "node.exe" : "node"),
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", process.platform === "win32" ? "node.exe" : "node")
  ];
  return Array.from(new Set(candidates));
}

async function checkPiNodeCandidate(nodePath: string, source: string): Promise<{ node?: ResolvedPiNode; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  if (!isCommandName(nodePath) && !(await exists(nodePath))) {
    diagnostics.push(`Pi Node candidate skipped (${source}): ${nodePath} does not exist.`);
    return { diagnostics };
  }
  const version = nodeVersion(nodePath);
  if (!version) {
    diagnostics.push(`Pi Node candidate skipped (${source}): ${nodePath} could not report a Node version.`);
    return { diagnostics };
  }
  if (!isPiNodeVersionCompatible(version)) {
    diagnostics.push(`Pi Node candidate skipped (${source}): ${nodePath} reports ${version}, but Pi requires Node ${minimumPiNodeVersionLabel} or newer.`);
    return { diagnostics };
  }
  diagnostics.push(`Pi Node candidate accepted (${source}): ${nodePath} (${version}).`);
  return {
    node: {
      nodePath,
      version,
      source,
      diagnostics: []
    },
    diagnostics
  };
}

function normalizeExecutableCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (isCommandName(trimmed)) return trimmed;
  return path.resolve(trimmed);
}

function isCommandName(value: string): boolean {
  return Boolean(value) && !path.isAbsolute(value) && !value.includes("/") && !value.includes("\\");
}

function nodeVersion(nodePath: string): string | undefined {
  const result = spawnSync(nodePath, ["-v"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return undefined;
  const version = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\s+/)[0];
  return /^v\d+\.\d+\.\d+$/.test(version) ? version : undefined;
}

function isPiNodeVersionCompatible(version: string): boolean {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return false;
  if (major !== minimumPiNodeVersion.major) return major > minimumPiNodeVersion.major;
  if (minor !== minimumPiNodeVersion.minor) return minor > minimumPiNodeVersion.minor;
  return patch >= minimumPiNodeVersion.patch;
}

function formatPiNodeResolutionFailure(diagnostics: string[]): string {
  return [
    "Pi engine is unavailable because Praxis could not find a compatible Node.js runtime for the Pi coding agent.",
    "",
    `The installed Pi dependency declares Node >=${minimumPiNodeVersionLabel}. Older Node versions can fail while loading Pi dependencies before the evaluator starts.`,
    "",
    "Diagnostics:",
    ...diagnostics.map((line) => `- ${line}`),
    "",
    "Recovery: set PRAXIS_PI_NODE_PATH to a compatible node.exe, or install a newer Node.js runtime."
  ].join("\n");
}

async function resolvePiModelRoute(projectRoot: string, mode: "explain" | "plan", target: ChatTarget, args: Args) {
  const settings = await loadPiRuntimeSettings();
  const provider = stringArg(args, "pi-provider") ?? process.env.PRAXIS_PI_PROVIDER ?? settings.provider ?? "deepseek";
  const explicitModel = stringArg(args, "pi-model") ?? process.env.PRAXIS_PI_MODEL ?? settings.model;
  const config = await loadModelConfig(projectRoot);
  const taskType = target.type === "edge"
    ? (mode === "plan" ? "graph.edge.plan" : "graph.edge.explain")
    : (mode === "plan" ? "graph.node.plan" : "graph.node.explain");
  const route = resolveModelRoute(config, taskType);
  const model = explicitModel ?? (route.provider === provider ? route.model : provider === "deepseek" ? route.model : undefined) ?? "deepseek-v4-pro";
  return {
    provider,
    model,
    thinking: piThinkingLevelArg(args, route.reasoningEffort, settings)
  };
}

function resolvePiToolAllowlist(args: Args): string[] {
  const settings = loadPiRuntimeSettingsSync();
  const raw = normalizePiToolsSetting(stringArg(args, "pi-tools") ?? process.env.PRAXIS_PI_TOOLS ?? settings.tools);
  const tools = normalizePiToolList(raw, isPiCodeGraphEnabled(args));
  const denied = deniedPiTools(tools, settings);
  if (denied.length) throw new Error(`Pi tool allowlist includes disabled tool(s): ${denied.join(", ")}. Enable the matching Pi permission in Model Settings first.`);
  return tools.length ? tools : normalizePiToolList(defaultPiRuntimeSettings.tools, false);
}

const reviewPiToolAllowlist = new Set([
  "praxis_status",
  "praxis_context_packet",
  "praxis_projection_views",
  "praxis_code_facts",
  "praxis_findings",
  "read",
  "grep",
  "find",
  "ls",
  "codegraph_query",
  "codegraph_context",
  "codegraph_relations"
]);

function resolvePiReviewToolAllowlist(args: Args): string[] {
  const requested = resolvePiToolAllowlist(args).filter((tool) => reviewPiToolAllowlist.has(tool));
  if (requested.length) return requested;
  return normalizePiToolList(
    [
      "praxis_status",
      "praxis_context_packet",
      "praxis_code_facts",
      "read",
      "grep",
      "find",
      "ls",
      "codegraph_context"
    ].join(","),
    isPiCodeGraphEnabled(args)
  ).filter((tool) => reviewPiToolAllowlist.has(tool));
}

function shouldEnablePiCodeGraphExtension(args: Args, tools: string[]): boolean {
  return isPiCodeGraphEnabled(args) && tools.some((tool) => piCodeGraphTools.has(tool));
}

function isPiCodeGraphEnabled(args: Args): boolean {
  const settings = loadPiRuntimeSettingsSync();
  const raw = stringArg(args, "pi-codegraph") ?? process.env.PRAXIS_PI_CODEGRAPH;
  if (raw !== undefined) return raw !== "0" && raw !== "false" && raw !== "off";
  return settings.codeGraph !== false;
}

function resolvePiCodeGraphExtensionPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "pi-codegraph-extension.js");
}

function resolvePiPraxisExtensionPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "pi-praxis-extension.js");
}

function piCliCandidatePaths(): string[] {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const candidates = [
    path.resolve(runtimeDir, "..", "..", "..", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
    path.resolve(runtimeDir, "..", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
    path.resolve(cwd, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js")
  ];
  return Array.from(new Set(candidates));
}

function piRuntimeDiagnostics(piCli: ResolvedPiCli, piNode: ResolvedPiNode, route: { provider: string; model: string }, env: NodeJS.ProcessEnv): string[] {
  const provider = route.provider;
  const providerKey = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const providerEnv = `${providerKey}_API_KEY`;
  return [
    ...piCli.diagnostics,
    ...piNode.diagnostics,
    `Pi CLI source: ${piCli.source}`,
    `Pi Node source: ${piNode.source}`,
    `Pi Node executable: ${piNode.nodePath}`,
    `Pi Node version: ${piNode.version}`,
    `Pi provider: ${provider}`,
    `Pi model: ${route.model}`,
    `Pi Praxis MCP bridge: enabled`,
    `Runtime Node executable: ${process.execPath}`,
    `Runtime Node version: ${process.version}`,
    `${providerEnv}: ${env[providerEnv] ? "present" : "missing"}`,
    `PI_OFFLINE: ${env.PI_OFFLINE ?? "unset"}`,
    `PI_TELEMETRY: ${env.PI_TELEMETRY ?? "unset"}`
  ];
}

function formatPiCliResolutionFailure(attempts: string[]): string {
  return [
    "Pi engine is unavailable because the Pi CLI entrypoint could not be resolved.",
    "",
    "Praxis looked for @earendil-works/pi-coding-agent as the selected Agent Engine dependency, but did not find a runnable dist/cli.js.",
    "This is a Praxis/Pi environment problem and is intentionally not hidden by falling back to the legacy AgentLoop.",
    "",
    "Diagnostics:",
    ...attempts.map((attempt) => `- ${attempt}`),
    "",
    "Expected dependency: @earendil-works/pi-coding-agent",
    "Recovery: run npm install from the Praxis Studio repository root, then rebuild runtime-cli and desktop."
  ].join("\n");
}

function formatPiFailureDetail(detail: string, diagnostics: string[]): string {
  return [
    detail,
    "",
    "Pi runtime diagnostics:",
    ...diagnostics.map((line) => `- ${line}`),
    "",
    "Praxis did not fall back to the legacy AgentLoop; Pi is the selected Agent Engine for this run."
  ].join("\n");
}

function piSystemPrompt(): string {
  return [
    "You are Pi running as Praxis Studio's Agent Engine / Coding Worker.",
    "",
    "Praxis owns project graph, project memory, trace, progress, and permissions.",
    "Use enabled praxis_* tools first when a task is graph-, memory-, finding-, design-, or anchor-scoped; they provide compact Praxis-owned context.",
    "Use repository tools such as read/grep/find/ls and repository evidence tools after Praxis context has narrowed the scope, or when Praxis context is missing.",
    "Do not pretend a tool was used.",
    "Do not expose private chain-of-thought. User-visible progress should be observable actions, tool calls, and concise status.",
    "Answer in the user's language unless they explicitly request another language.",
    "Treat repository observations as FACT. Treat conclusions as CANDIDATE/INFERENCE until Praxis/user confirms them.",
    "When code changes are requested and write tools are enabled, make precise changes and summarize changed files and verification."
  ].join("\n");
}

function piFailureDiagnostics(errorMessage: string): string[] {
  const lines = errorMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  return lines.length ? lines : [errorMessage.slice(0, 1000)];
}

function loadPiRuntimeSettingsSync(): PiRuntimeSettings {
  const settings = loadRuntimeSettingsRecordSync();
  if (!settings) return { ...defaultPiRuntimeSettings };
  return normalizePiRuntimeSettings(settings);
}

async function loadPiRuntimeSettings(): Promise<PiRuntimeSettings> {
  const settings = await loadRuntimeSettingsRecord();
  if (!settings) return { ...defaultPiRuntimeSettings };
  return normalizePiRuntimeSettings(settings);
}

let cachedRuntimeSettings: Record<string, unknown> | null | undefined;

function loadRuntimeSettingsRecordSync(): Record<string, unknown> | null {
  if (cachedRuntimeSettings !== undefined) return cachedRuntimeSettings;
  const inline = process.env.PRAXIS_MODEL_SETTINGS_JSON?.trim();
  if (inline) {
    cachedRuntimeSettings = safeJsonRecord(inline);
    return cachedRuntimeSettings;
  }
  const configuredPath = process.env.PRAXIS_MODEL_SETTINGS_PATH?.trim();
  for (const candidate of [configuredPath, path.join(os.homedir(), ".praxis-studio", "model-settings.json")].filter((item): item is string => Boolean(item))) {
    try {
      cachedRuntimeSettings = safeJsonRecord(requireNodeFsReadFileSync(candidate));
      return cachedRuntimeSettings;
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  cachedRuntimeSettings = null;
  return null;
}

async function loadRuntimeSettingsRecord(): Promise<Record<string, unknown> | null> {
  return loadRuntimeSettingsRecordSync();
}

function requireNodeFsReadFileSync(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function normalizePiRuntimeSettings(settings: Record<string, unknown>): PiRuntimeSettings {
  const thinking = piThinkingSetting(settings.piThinking);
  const reviewThinking = piThinkingSetting(settings.reviewPiThinking);
  const reviewTimeoutMs = reviewPiTimeoutSetting(settings.reviewPiTimeoutMs);
  return {
    provider: stringValue(settings.piProvider) ?? defaultPiRuntimeSettings.provider,
    model: stringValue(settings.piModel) ?? defaultPiRuntimeSettings.model,
    thinking: thinking ?? defaultPiRuntimeSettings.thinking,
    tools: normalizePiToolsSetting(settings.piTools),
    codeGraph: booleanValue(settings.piCodeGraph) ?? defaultPiRuntimeSettings.codeGraph,
    allowRead: booleanValue(settings.piAllowRead) ?? defaultPiRuntimeSettings.allowRead,
    allowShell: booleanValue(settings.piAllowShell) ?? defaultPiRuntimeSettings.allowShell,
    allowWrite: booleanValue(settings.piAllowWrite) ?? defaultPiRuntimeSettings.allowWrite,
    timeoutMs: positiveNumberValue(settings.piTimeoutMs) ?? defaultPiRuntimeSettings.timeoutMs,
    reviewThinking: reviewThinking ?? defaultPiRuntimeSettings.reviewThinking,
    reviewTimeoutMs
  };
}

function reviewPiTimeoutSetting(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  if (parsed === undefined || !Number.isFinite(parsed)) return defaultPiRuntimeSettings.reviewTimeoutMs;
  if (parsed === 300_000) return defaultPiRuntimeSettings.reviewTimeoutMs;
  return parsed > 0 ? parsed : 0;
}

function normalizePiToolsSetting(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return defaultPiRuntimeSettings.tools;
  return raw === legacyDefaultPiTools ? defaultPiRuntimeSettings.tools : raw;
}

function normalizePiToolList(raw: string | undefined, includeCodeGraph: boolean): string[] {
  const tools = (raw || defaultPiRuntimeSettings.tools)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tool of tools) {
    if (!includeCodeGraph && piCodeGraphTools.has(tool)) continue;
    if (seen.has(tool)) continue;
    seen.add(tool);
    normalized.push(tool);
  }
  if (includeCodeGraph) {
    for (const tool of piCodeGraphTools) {
      if (!seen.has(tool)) normalized.push(tool);
    }
  }
  return normalized;
}

function deniedPiTools(tools: string[], settings: PiRuntimeSettings): string[] {
  const allowRead = settings.allowRead !== false;
  const allowShell = settings.allowShell === true;
  const allowWrite = settings.allowWrite === true;
  const readTools = new Set([
    "read",
    "grep",
    "find",
    "ls",
    "codegraph_query",
    "codegraph_context",
    "codegraph_relations",
    "praxis_status",
    "praxis_project_profile",
    "praxis_code_facts",
    "praxis_callers",
    "praxis_callees",
    "praxis_impact",
    "praxis_findings",
    "praxis_finding_audit",
    "praxis_projection_views",
    "praxis_context_packet",
    "praxis_explain_anchor"
  ]);
  const governedWriteTools = new Set(["praxis_plan_from_finding", "praxis_generate_task", "praxis_record_external_result"]);
  return tools.filter((tool) => {
    if (readTools.has(tool)) return !allowRead;
    if (governedWriteTools.has(tool)) return !allowWrite;
    if (tool === "bash") return !allowShell;
    if (tool === "edit" || tool === "write") return !allowWrite;
    return false;
  });
}

function isPiThinkingLevel(value: unknown): value is PiThinkingLevel {
  return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function piThinkingSetting(value: unknown): PiThinkingLevel | undefined {
  return isPiThinkingLevel(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function positiveNumberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function piThinkingLevelArg(args: Args, effort: "low" | "medium" | "high" | undefined, settings = loadPiRuntimeSettingsSync()): PiThinkingLevel {
  const value = stringArg(args, "pi-thinking") ?? process.env.PRAXIS_PI_THINKING;
  if (isPiThinkingLevel(value)) return value;
  if (settings.thinking) return settings.thinking;
  if (effort === "high") return "high";
  if (effort === "low") return "low";
  return "medium";
}

function piTimeoutMsArg(args: Args, keys: string[], fallbackMs: number): number {
  for (const key of keys) {
    const parsed = numberArg(args, key);
    if (parsed === undefined) continue;
    if (parsed === 0) return 0;
    if (parsed < 1_000) throw new Error(`Invalid timeout for --${key}: ${parsed}. Timeout must be at least 1000ms.`);
    return parsed;
  }
  return loadPiRuntimeSettingsSync().timeoutMs ?? fallbackMs;
}

function reviewPiTimeoutMsArg(args: Args, fallbackMs: number): number {
  const direct = timeoutMsArg(args, ["review-pi-timeout-ms", "pi-timeout-ms"], -1);
  if (direct !== -1) return direct;
  return loadPiRuntimeSettingsSync().reviewTimeoutMs ?? loadPiRuntimeSettingsSync().timeoutMs ?? fallbackMs;
}

async function piWorkerEnv(projectRoot: string, provider: string): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_TELEMETRY: process.env.PI_TELEMETRY ?? "0"
  };
  delete env.PI_OFFLINE;
  delete env.PI_SKIP_VERSION_CHECK;
  const config = await loadModelConfig(projectRoot);
  const providerKey = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const providerEnv = `${providerKey}_API_KEY`;
  if (!env[providerEnv]) {
    const providerConfig = config.providers[provider];
    const configuredEnv = providerConfig?.apiKeyEnv?.trim();
    if (configuredEnv && env[configuredEnv]) env[providerEnv] = env[configuredEnv];
    if (!env[providerEnv] && providerConfig?.apiKey?.trim()) env[providerEnv] = providerConfig.apiKey.trim();
  }
  return env;
}

function buildPiWorkerPrompt(options: PiWorkerRunOptions): string {
  const targetSummary = describeChatTarget(options.graph, options.target);
  const graphSummary = summarizeGraphForWorker(options.graph, options.target);
  const history = summarizeAgentHistoryForWorker(options.sharedConversationHistory, options.priorMessages);
  const enabledTools = resolvePiToolAllowlist(options.args);
  const canShell = enabledTools.includes("bash");
  const canWrite = enabledTools.includes("edit") || enabledTools.includes("write");
  const modeInstruction = options.mode === "plan"
    ? "Produce a candidate plan. Do not claim implementation was performed."
    : "Explain the selected target using repo evidence. Do not produce an implementation plan unless the user explicitly asks.";
  return [
    "You are running as a Pi worker inside Praxis Studio.",
    "",
    "## Authority Boundary",
    "- Pi owns operational repository exploration for this run: inspect AGENTS.md/CLAUDE.md, files, package metadata, and available read-only context as needed.",
    "- Praxis owns Development Graph, Project Memory, Trace, permissions, progress, and confirmation.",
    canWrite
      ? "- Source writes are enabled by Praxis settings for this run. When the user explicitly asks for implementation, use edit/write precisely and report changed paths."
      : "- Do not write, edit, delete, move, or generate files in this run because write tools are not enabled.",
    canShell
      ? "- Shell is enabled by Praxis settings for this run. Use it when it is the right tool; keep commands scoped to the project and report important output."
      : "- Do not run shell commands because bash is not enabled. Use only the enabled read and repository evidence tools.",
    "- Treat direct repository observations as FACT evidence. Treat your conclusions as CANDIDATE or INFERENCE until Praxis/user confirms them.",
    "- Existing source code must only be modified in response to an explicit user implementation/fix request and only through enabled tools.",
    "- Prefer praxis_context_packet, praxis_projection_views, praxis_code_facts, and praxis_findings before broad read/grep when the selected target has an anchor or known Praxis memory.",
    "- Repository evidence tools are optional read-only context tools. If the repository evidence index is unavailable, fall back to read/grep/find.",
    `- Enabled repository tool families for this run: ${enabledTools.some((tool) => piCodeGraphTools.has(tool)) ? "Praxis context, file search, repository evidence" : "Praxis context, file search"}.`,
    "- Answer in the user's language.",
    "",
    "## Current Praxis Target",
    targetSummary,
    "",
    "## Graph Hint",
    graphSummary,
    "",
    history ? `## Recent Chat\n${history}\n` : "",
    "## Task",
    modeInstruction,
    "",
    "User instruction:",
    options.instruction
  ].filter(Boolean).join("\n");
}

function summarizeAgentHistoryForWorker(
  sharedHistory: ScopedAgentConversationHistoryEntry[],
  sessionMessages: ChatMessage[]
): string {
  const shared = sharedHistory
    .slice(-24)
    .map((entry) => `${entry.role} [${sharedHistoryLabel(entry)}]: ${entry.text.slice(0, 1200)}`);
  const session = summarizeChatHistoryForWorker(sessionMessages);
  return [
    shared.length ? ["Shared global Praxis agent history:", ...shared].join("\n\n") : "",
    session ? `Current Praxis Assistant session transcript:\n${session}` : ""
  ].filter(Boolean).join("\n\n");
}

function sharedHistoryLabel(entry: ScopedAgentConversationHistoryEntry): string {
  return [
    entry.scopeKind || "global",
    entry.scopeTitle,
    entry.contextTitle,
    entry.intent ? `intent=${entry.intent}` : undefined,
    entry.status ? `status=${entry.status}` : undefined
  ].filter(Boolean).join(" | ");
}

function describeChatTarget(graph: DevelopmentGraph, target: ChatTarget): string {
  if (target.type === "project") return `Project: ${graph.title || path.basename(graph.rootPath ?? "")}`;
  if (target.type === "node") {
    const node = findNode(graph, target.id);
    return [
      `Node: ${target.id}`,
      node?.title ? `Title: ${node.title}` : undefined,
      node?.kind ? `Kind: ${node.kind}` : undefined,
      node?.description ? `Description: ${node.description}` : undefined
    ].filter(Boolean).join("\n");
  }
  if (target.type === "edge") {
    const edge = findEdge(graph, target.id);
    if (!edge) return `Edge: ${target.id}`;
    const source = findNode(graph, edge.source);
    const destination = findNode(graph, edge.target);
    return [
      `Edge: ${target.id}`,
      `Kind: ${edge.kind}`,
      edge.title ? `Title: ${edge.title}` : undefined,
      `Source: ${edge.source}${source?.title ? ` (${source.title})` : ""}`,
      `Target: ${edge.target}${destination?.title ? ` (${destination.title})` : ""}`,
      edge.description ? `Description: ${edge.description}` : undefined
    ].filter(Boolean).join("\n");
  }
  return `Subgraph: ${target.nodeIds.length} node(s), ${target.edgeIds.length} edge(s)`;
}

function summarizeGraphForWorker(graph: DevelopmentGraph, target: ChatTarget): string {
  const selectedNodeIds = target.type === "node"
    ? [target.id]
    : target.type === "edge"
      ? graph.edges.filter((edge) => edge.id === target.id).flatMap((edge) => [edge.source, edge.target])
      : target.type === "subgraph"
        ? target.nodeIds
        : graph.nodes.slice(0, 12).map((node) => node.id);
  const selected = new Set(selectedNodeIds);
  const nodes = graph.nodes
    .filter((node) => selected.has(node.id))
    .slice(0, 16)
    .map((node) => `- ${node.id}: ${node.title} [${node.kind}, ${node.knowledgeKind}]`);
  const edges = graph.edges
    .filter((edge) => selected.has(edge.source) || selected.has(edge.target) || (target.type === "edge" && edge.id === target.id))
    .slice(0, 20)
    .map((edge) => `- ${edge.id}: ${edge.source} --${edge.kind}--> ${edge.target} [${edge.knowledgeKind}]`);
  return [
    `Graph: ${graph.title || graph.id}`,
    `Nodes: ${graph.nodes.length}; Edges: ${graph.edges.length}`,
    nodes.length ? ["Selected/nearby nodes:", ...nodes].join("\n") : undefined,
    edges.length ? ["Selected/nearby edges:", ...edges].join("\n") : undefined,
    "This graph hint is not a complete context packet. Use praxis_context_packet or other praxis_* tools first when a concrete anchor is available, then explore the repository only for missing evidence."
  ].filter(Boolean).join("\n");
}

function summarizeChatHistoryForWorker(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 1200)}`)
    .join("\n\n");
}

function createExternalAgentRun(input: {
  projectRoot: string;
  sessionId: string;
  target: SelectionTarget;
  mode: "explain" | "plan";
  instruction: string;
  engine: AgentEngineKind;
}): AgentRun {
  const runId = `run-${input.engine}-${Date.now()}-${randomUUID().slice(0, 8)}-${slug(input.instruction.slice(0, 40))}`;
  return {
    id: runId,
    projectRoot: input.projectRoot,
    sessionId: input.sessionId,
    status: "running",
    target: input.target,
    mode: input.mode,
    instruction: input.instruction,
    steps: [],
    transitions: [{ reason: "next_turn", timestamp: new Date().toISOString(), detail: `${input.engine} engine selected.` }],
    startedAt: new Date().toISOString()
  };
}

function createExternalAgentStep(run: AgentRun, kind: AgentStep["kind"], fields: Partial<AgentStep> = {}): AgentStep {
  const sequence = run.steps.length + 1;
  return {
    id: `step-${run.id}-${String(sequence).padStart(3, "0")}`,
    runId: run.id,
    sequence,
    timestamp: new Date().toISOString(),
    kind,
    ...fields
  };
}

function finishExternalAgentRun(
  run: AgentRun,
  status: AgentRun["status"],
  terminalReason: AgentTerminalReason,
  error?: string
): void {
  run.status = status;
  run.terminalReason = terminalReason;
  run.finishedAt = new Date().toISOString();
  if (error) run.error = error;
  run.transitions.push({ reason: terminalReason, timestamp: new Date().toISOString() });
}

async function appendAgentTrace(
  projectRoot: string,
  input: {
    traceId: string;
    kind: string;
    target: SelectionTarget;
    summary: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  await appendTraceRecord(
    projectRoot,
    TraceRecordSchema.parse({
      schemaVersion: "praxis.traceRecord.v1",
      id: `trace-event:${safeFilePart(input.kind)}:${Date.now()}`,
      traceId: input.traceId,
      timestamp: new Date().toISOString(),
      kind: input.kind,
      target: traceTargetFromSelectionTarget(input.target),
      summary: input.summary,
      data: input.data
    } satisfies TraceRecord)
  ).catch(() => undefined);
}

function traceTargetFromSelectionTarget(target: SelectionTarget): TraceRecord["target"] {
  if (target.type === "node" || target.type === "edge") return { type: target.type, id: target.id };
  return { type: "subgraph" };
}

function spawnBuffered(
  command: string,
  commandArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs > 0
      ? setTimeout(() => {
        settled = true;
        child.kill();
        reject(new Error(`Pi worker timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`));
      }, options.timeoutMs)
      : undefined;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function spawnStreamingJson(
  command: string,
  commandArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; onJson: (event: PiJsonEvent) => Promise<void> | void }
): Promise<{ stdout: string; stderr: string; exitCode: number; eventCount: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let eventCount = 0;
    let callbackChain = Promise.resolve();
    let settled = false;
    const timeout = options.timeoutMs > 0
      ? setTimeout(() => {
        settled = true;
        child.kill();
        reject(new Error(`Pi worker timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`));
      }, options.timeoutMs)
      : undefined;
    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const parsed = safeJson(trimmed);
      if (!isRecord(parsed)) return;
      eventCount++;
      callbackChain = callbackChain.then(() => options.onJson(parsed as PiJsonEvent));
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      lineBuffer += chunk;
      let newlineIndex = lineBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = lineBuffer.indexOf("\n");
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (lineBuffer.trim()) handleLine(lineBuffer);
      callbackChain
        .then(() => resolve({ stdout, stderr, exitCode: code ?? 1, eventCount }))
        .catch(reject);
    });
  });
}

function renderCommandLine(command: string, args: string[]): string {
  const safeArgs = args.map((arg) => (arg.length > 240 ? `${arg.slice(0, 240)}...` : arg));
  return [command, ...safeArgs].map(quoteCommandArg).join(" ");
}

function quoteCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function sanitizePiOutput(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").trim();
}

function normalizePiFinalMessage(stdout: string): string {
  const content = sanitizePiOutput(stdout);
  return content || "Pi completed without a text response.";
}

function piAssistantTextFromEvent(event: PiJsonEvent): string | undefined {
  if ((event.type === "message_update" || event.type === "message_end" || event.type === "message_start") && isRecord(event.message)) {
    return piMessageText(event.message);
  }
  if (event.type === "agent_end" && Array.isArray(event.messages)) {
    return lastAssistantTextFromMessages(event.messages);
  }
  if (isRecord(event.message)) return piMessageText(event.message);
  return undefined;
}

function piMessageText(message: Record<string, unknown>): string | undefined {
  if (message.role !== "assistant") return undefined;
  return textFromPiContent(message.content);
}

function lastAssistantTextFromMessages(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== "assistant") continue;
    const text = textFromPiContent(message.content);
    if (text) return text;
  }
  return undefined;
}

function textFromPiContent(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (isRecord(part) && part.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
  return text || undefined;
}

function piToolViewFromEvent(event: PiJsonEvent): ToolCallView | null {
  if (event.type !== "tool_execution_start" && event.type !== "tool_execution_update" && event.type !== "tool_execution_end") return null;
  const name = String(event.toolName ?? "unknown");
  const id = String(event.toolCallId ?? `${name}:${Date.now()}`);
  const status: ToolCallView["status"] = event.type === "tool_execution_end" ? (event.isError ? "failed" : "success") : "running";
  const inputSummary = summarizePiToolInput(name, event.args);
  const outputSource = event.type === "tool_execution_update" ? event.partialResult : event.result;
  const outputSummary = outputSource === undefined ? undefined : summarizeForRun(piContentSummary(outputSource), 1200);
  return {
    id,
    name,
    status,
    inputSummary,
    outputSummary,
    riskLevel: piToolRiskLevel(name)
  };
}

function summarizePiToolInput(name: string, input: unknown): string {
  if (isRecord(input)) {
    const pathValue = stringValue(input.path) ?? stringValue(input.file_path) ?? stringValue(input.filePath);
    if (pathValue) return `${name}: ${pathValue}`;
    const pattern = stringValue(input.pattern) ?? stringValue(input.query);
    if (pattern) return `${name}: ${pattern}`;
    const command = stringValue(input.command);
    if (command) return `${name}: ${command.slice(0, 240)}`;
  }
  return `${name}: ${summarizeForRun(piContentSummary(input), 320)}`;
}

function piContentSummary(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(piContentSummary).filter(Boolean).join("\n");
  if (isRecord(value)) {
    if (Array.isArray(value.content)) return piContentSummary(value.content);
    if (typeof value.text === "string") return value.text;
    if (typeof value.output === "string") return value.output;
    if (typeof value.error === "string") return value.error;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function piToolRiskLevel(name: string): ToolCallView["riskLevel"] {
  if (name === "bash") return "shell";
  if (name === "edit" || name === "write") return "write_source";
  if (name.toLowerCase().includes("network")) return "network";
  return "read";
}

function piEventValue(event: PiJsonEvent, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(event, key) ? event[key] : undefined;
}

function summarizeForRun(value: string, limit: number): string {
  const clean = sanitizePiOutput(value);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n...[truncated ${clean.length - limit} chars]`;
}

function piFailureMessage(errorMessage: string): string {
  const note = "Praxis did not fall back to the previous AgentLoop automatically.";
  if (errorMessage.includes("Praxis did not fall back")) return `Pi agent engine failed: ${errorMessage}`;
  return [
    `Pi agent engine failed: ${errorMessage}`,
    "",
    `${note} Fix the Pi environment, or explicitly choose --engine legacy / PRAXIS_AGENT_ENGINE=legacy if you want to test the old worker.`
  ].join("\n");
}

function isPromptTooLongMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("prompt") && normalized.includes("too long")
    || normalized.includes("context") && normalized.includes("length")
    || normalized.includes("maximum context")
    || normalized.includes("context window")
    || normalized.includes("413");
}

function stringArg(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function commandChatSessionList(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  outputJson({ ok: true, sessions: await loadSessions(projectRoot) });
}

async function commandChatSessionRead(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const sessionId = required(args, "session");
  outputJson({ ok: true, ...(await readSessionTranscript(projectRoot, sessionId)), logPaths: agentLogPaths(projectRoot, sessionId) });
}

async function commandChatSend(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const target = chatTargetFromArgs(args);
  const session =
    typeof args.session === "string" && (await readSession(projectRoot, args.session))
      ? (await readSession(projectRoot, args.session))!
      : await createSessionForTarget(projectRoot, target, { title: sessionTitleForTarget(graph, target), mode: chatModeFromArgs(args) });
  const sessionId = session.id;
  const runtimeTarget = selectionTargetFromChatTarget(graph, target);
  const message = String(args.message ?? "");
  const intent = inferChatIntent(message, args.intent ?? args.mode);

  if (typeof args.approval === "string") {
    return await handlePermissionResponse({ projectRoot, graph, sessionId, target: runtimeTarget, message, approval: args.approval, args });
  }

  const appended: ChatMessage[] = [];
  appended.push(
    await appendMessage(projectRoot, {
      sessionId,
      role: "user",
      content: message || quickInstructionForIntent(intent),
      structured: { intent, target }
    })
  );

  try {
    if (intent === "apply") {
      const latest = latestPlan(await readMessages(projectRoot, sessionId));
      if (!latest) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "assistant",
            content: "I need a plan in this session before I can request Apply approval."
          })
        );
        return await outputChatSendResult(projectRoot, sessionId, appended);
      }
      const selectedActionIds = actionIdsFromArgs(args) ?? latest.actions.map((action) => action.id);
      const permission = permissionRequestForPlan(latest, selectedActionIds);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "permission",
          content: "Praxis needs confirmation before applying selected plan actions.",
          permissionRequest: permission,
          structured: { plan: latest, selectedActionIds }
        })
      );
      return await outputChatSendResult(projectRoot, sessionId, appended, { pendingPermission: permission, plan: latest });
    }

    if (intent === "generate_task") {
      const latest = latestPlan(await readMessages(projectRoot, sessionId));
      if (!latest) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "assistant",
            content: "Generate a plan first, then I can turn it into a controlled coding task."
          })
        );
        return await outputChatSendResult(projectRoot, sessionId, appended);
      }
      appended.push(await appendMessage(projectRoot, toolMessage(sessionId, "GenerateCodingTask", "Use latest graph plan", "Writing .distinction task file.", "write_docs")));
      const taskResult = await generateTaskFromPlan(projectRoot, latest);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "result",
          content: `Generated ${taskResult.task.id} at ${taskResult.taskPath}`,
          task: taskResult.task,
          structured: taskResult
        })
      );
      return await outputChatSendResult(projectRoot, sessionId, appended, taskResult);
    }

    if (intent === "import_result") {
      appended.push(
        await appendMessage(projectRoot, toolMessage(sessionId, "ImportTaskResult", "Normalize external agent result", "Recording task result candidate.", "write_memory"))
      );
      const resultInput = parseTaskResultMessage(message);
      const importResult = await importTaskResultPayload(projectRoot, resultInput);
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "result",
          content: `Imported result for ${resultInput.taskId}.`,
          structured: importResult,
          plan: importResult.progressPlan
        })
      );
      if (importResult.progressPlan) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "result",
            content: "Progress suggestions are ready for review before Apply.",
            plan: importResult.progressPlan
          })
        );
      }
      return await outputChatSendResult(projectRoot, sessionId, appended, importResult);
    }

    const context = buildContext(graph, runtimeTarget);
    appended.push(await appendMessage(projectRoot, toolMessage(sessionId, "BuildTargetContext", targetSummary(target), context.summary, "read")));

    const mode = intent === "plan" ? "plan" : "explain";
    const runtime = new PraxisAgentRuntime();
    const result = await runtime.run({
      mode,
      projectRoot,
      graph,
      target: runtimeTarget,
      instruction: message || quickInstructionForIntent(intent),
      taskType: taskTypeForTarget(runtimeTarget, mode)
    });
    appended.push(
      await appendMessage(projectRoot, toolMessage(sessionId, "AgentRuntime", `${mode} selected target`, `Used ${result.selectedModel}`, "network", [result.traceId]))
    );

    if (mode === "plan") {
      const plan = isGraphPlan(result.structured) ? result.structured : undefined;
      appended.push(
        await appendMessage(projectRoot, {
          sessionId,
          role: "assistant",
          content: plan?.summary ?? result.message,
          structured: result.structured,
          traceIds: [result.traceId]
        })
      );
      if (plan) {
        appended.push(
          await appendMessage(projectRoot, {
            sessionId,
            role: "result",
            content: `Plan created with ${plan.actions.length} action(s).`,
            plan,
            traceIds: [result.traceId]
          })
        );
      }
      return await outputChatSendResult(projectRoot, sessionId, appended, { plan });
    }

    appended.push(
      await appendMessage(projectRoot, {
        sessionId,
        role: "assistant",
        content: readableAssistantContent(result.message, result.structured),
        structured: result.structured,
        traceIds: [result.traceId]
      })
    );
    return await outputChatSendResult(projectRoot, sessionId, appended);
  } catch (error) {
    appended.push(
      await appendMessage(projectRoot, {
        sessionId,
        role: "error",
        content: error instanceof Error ? error.message : String(error),
        status: "failed"
      })
    );
    return await outputChatSendResult(projectRoot, sessionId, appended);
  }
}

async function commandGenerateTask(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const plan = (await readJson(required(args, "plan"))) as GraphPlan;
  const result = await generateTaskFromPlan(projectRoot, plan);
  outputJson({ ok: true, ...result });
}

async function generateTaskFromPlan(projectRoot: string, plan: GraphPlan): Promise<{ taskPath: string; task: ReturnType<typeof createCodingAgentTask> }> {
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const draft = plan.codingTasks[0];
  const action = plan.actions.find((item) => item.type === "create_coding_task" || item.type === "create_task");
  const context = buildCodingTaskContext(graph, plan, action);
  const task = createCodingAgentTask({
    id: "TASK-0001",
    title: draft?.title ?? "Controlled coding task",
    instruction: plan.summary,
    source: {
      planId: plan.id,
      targetNodeIds: context.targetNodeIds,
      targetEdgeIds: context.targetEdgeIds
    },
    context: {
      architectureContext: context.architectureContext,
      graphContext: context.graphContext,
      memoryContext: context.memoryContext,
      constraints: ["Existing source code must not be modified by Praxis v0.1 Apply."]
    },
    scope: {
      relatedFiles: context.relatedFiles,
      allowedPaths: unique([...(draft?.allowedPaths ?? []), ...context.allowedPaths]),
      forbiddenPaths: draft?.forbiddenPaths ?? ["apps/studio-desktop/src"]
    },
    acceptanceCriteria: draft?.acceptanceCriteria ?? [],
    verificationCommands: ["npm run build", "npm run typecheck"]
  });
  const prepared = await new ManualAdapter().prepare(task);
  const taskPath = await writeCodingTask(projectRoot, { id: task.id, markdown: prepared.markdown ?? "" });
  await appendChange(projectRoot, {
    title: `Generated ${task.id}`,
    summary: `Generated controlled coding task from ${plan.id} for ${context.targetEdgeIds.length} edge(s) and ${context.targetNodeIds.length} node(s).`,
    kind: "CANDIDATE"
  });
  await appendTrace(projectRoot, {
    id: `trace-event:task:${Date.now()}`,
    traceId: `trace:task:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "task.generated",
    target: context.targetEdgeIds[0]
      ? { type: "edge", id: context.targetEdgeIds[0] }
      : context.targetNodeIds[0]
        ? { type: "node", id: context.targetNodeIds[0] }
        : { type: "project" },
    summary: `Generated ${task.id}`,
    data: { taskPath, planId: plan.id, targetNodeIds: context.targetNodeIds, targetEdgeIds: context.targetEdgeIds }
  });
  return { taskPath, task };
}

async function commandApplyPlan(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const plan = (await readJson(required(args, "plan"))) as GraphPlan;
  const actionIds = typeof args.actions === "string" ? new Set(args.actions.split(",").map((item) => item.trim()).filter(Boolean)) : undefined;
  const graph = await readRuntimeDevelopmentGraph(projectRoot);
  const result = await applyPlanActions(projectRoot, graph, plan, actionIds);
  outputJson({ ok: true, ...result });
}

async function commandImportTaskResult(args: Args): Promise<void> {
  const projectRoot = required(args, "project-root");
  const result = (await readJson(required(args, "result"))) as CodingAgentResultInput;
  outputJson({ ok: true, ...(await importTaskResultPayload(projectRoot, result)) });
}

async function readRuntimeDevelopmentGraph(projectRoot: string): Promise<DevelopmentGraph> {
  const root = path.resolve(projectRoot);
  try {
    return await readDevelopmentGraph(root);
  } catch (error) {
    if (!isMissingLegacyDevelopmentGraphError(error)) throw error;
    return await readFoundationDevelopmentGraphFallback(root);
  }
}

function isMissingLegacyDevelopmentGraphError(error: unknown): boolean {
  if (isMissingFileError(error)) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.replace(/\\/g, "/");
  return message.includes(".distinction/graph/") && (message.includes("nodes.json") || message.includes("edges.json"));
}

async function readFoundationDevelopmentGraphFallback(root: string): Promise<DevelopmentGraph> {
  const projectedRecords = await readProjectedGraphViewRecords(root);
  if (projectedRecords.length > 0) {
    return developmentGraphFromProjectedViews(root, projectedRecords.map((record) => record.view));
  }

  const codeFacts = await tryReadJsonWithSchema(path.join(root, ".distinction", "cache", "code-fact-graph.json"), CodeFactGraphSnapshotSchema);
  if (codeFacts) return developmentGraphFromCodeFacts(root, codeFacts);

  return minimalFoundationDevelopmentGraph(root, "No legacy DevelopmentGraph or Foundation projection cache was found. Run intake and project:view to populate project intelligence.");
}

function minimalFoundationDevelopmentGraph(root: string, description?: string): DevelopmentGraph {
  return {
    id: "graph:foundation:fallback",
    title: `${path.basename(root) || "Project"} Foundation Graph`,
    rootPath: root,
    updatedAt: new Date().toISOString(),
    metadata: {
      foundationFallback: true,
      source: "empty_foundation_fallback",
      readOnly: true
    },
    nodes: [
      {
        id: "project:foundation",
        kind: "project",
        title: path.basename(root) || "Project",
        description,
        status: "active",
        progress: 0,
        confidence: "medium",
        knowledgeKind: "FACT",
        metadata: {
          path: root,
          foundationFallback: true
        }
      }
    ],
    edges: []
  };
}

function developmentGraphFromProjectedViews(root: string, views: ProjectedGraphView[]): DevelopmentGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalFoundationDevelopmentGraph(root, "Synthesized from Foundation ProjectedGraphView cache because legacy .distinction/graph is absent.");
  graph.metadata = {
    ...(graph.metadata ?? {}),
    source: "projected_graph_views",
    projectedViewIds: views.map((view) => view.id),
    projectedViewKinds: Array.from(new Set(views.map((view) => view.kind)))
  };

  const nodeIdByViewNode = new Map<string, string>();
  const seenNodes = new Set(graph.nodes.map((node) => node.id));
  const seenEdges = new Set<string>();
  let truncatedNodes = 0;
  let truncatedEdges = 0;

  for (const view of views) {
    for (const projectedNode of view.nodes) {
      const graphNodeId = foundationProjectionNodeId(view.id, projectedNode.id);
      nodeIdByViewNode.set(`${view.id}\u0000${projectedNode.id}`, graphNodeId);
      if (seenNodes.has(graphNodeId)) continue;
      if (graph.nodes.length >= nodeLimit) {
        truncatedNodes += 1;
        continue;
      }
      seenNodes.add(graphNodeId);
      graph.nodes.push({
        id: graphNodeId,
        kind: developmentNodeKindFromProjection(projectedNode.kind, projectedNode.anchor.kind),
        title: projectedNode.label || projectedNode.id,
        description: projectedNode.summary,
        status: statusFromString(projectedNode.status),
        progress: 0,
        confidence: view.authority === "durable_model" ? "high" : "medium",
        knowledgeKind: view.authority === "durable_model" ? "CONFIRMED" : "INFERENCE",
        tags: ["foundation", "projection", view.kind],
        metadata: {
          foundationFallback: true,
          projectionViewId: view.id,
          projectionViewKind: view.kind,
          projectionNodeId: projectedNode.id,
          anchor: projectedNode.anchor,
          source: projectedNode.source,
          path: projectedNode.path,
          projectedGraphMetadata: projectedNode.metadata
        }
      });
    }
  }

  for (const node of graph.nodes.slice(1, 41)) {
    const edgeId = `foundation-root:${node.id}`;
    seenEdges.add(edgeId);
    graph.edges.push({
      id: edgeId,
      source: "project:foundation",
      target: node.id,
      kind: "contains",
      title: "Contains",
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: "medium",
      knowledgeKind: "INFERENCE",
      metadata: { foundationFallback: true, synthetic: true }
    });
  }

  for (const view of views) {
    for (const projectedEdge of view.edges) {
      const source = nodeIdByViewNode.get(`${view.id}\u0000${projectedEdge.sourceId}`);
      const target = nodeIdByViewNode.get(`${view.id}\u0000${projectedEdge.targetId}`);
      if (!source || !target) {
        truncatedEdges += 1;
        continue;
      }
      const graphEdgeId = foundationProjectionEdgeId(view.id, projectedEdge.id);
      if (seenEdges.has(graphEdgeId)) continue;
      if (graph.edges.length >= edgeLimit) {
        truncatedEdges += 1;
        continue;
      }
      seenEdges.add(graphEdgeId);
      graph.edges.push({
        id: graphEdgeId,
        source,
        target,
        kind: developmentEdgeKindFromProjection(projectedEdge.kind),
        title: projectedEdge.kind,
        description: projectedEdge.summary,
        status: "active",
        progress: 0,
        riskLevel: projectedEdge.kind.includes("conflict") ? "medium" : "none",
        confidence: projectedEdge.confidence ?? "medium",
        knowledgeKind: view.authority === "durable_model" ? "CONFIRMED" : "INFERENCE",
        metadata: {
          foundationFallback: true,
          projectionViewId: view.id,
          projectionViewKind: view.kind,
          projectionEdgeId: projectedEdge.id,
          anchor: projectedEdge.anchor,
          source: projectedEdge.source,
          projectedGraphMetadata: projectedEdge.metadata
        }
      });
    }
  }

  graph.metadata = {
    ...(graph.metadata ?? {}),
    truncatedNodes,
    truncatedEdges
  };
  return graph;
}

function developmentGraphFromCodeFacts(root: string, snapshot: CodeFactGraphSnapshot): DevelopmentGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalFoundationDevelopmentGraph(root, "Synthesized from CodeFactGraphSnapshot cache because legacy .distinction/graph is absent.");
  graph.metadata = {
    ...(graph.metadata ?? {}),
    source: "code_fact_graph_snapshot",
    provider: snapshot.provider,
    readOnly: true
  };

  const selectedNodes = snapshot.nodes.filter((node) => node.kind !== "project").slice(0, nodeLimit - 1);
  const idMap = new Map<string, string>();
  for (const node of selectedNodes) {
    const graphNodeId = foundationCodeFactNodeId(node.id);
    idMap.set(node.id, graphNodeId);
    graph.nodes.push({
      id: graphNodeId,
      kind: developmentNodeKindFromProjection(node.kind, node.kind === "file" ? "file" : "symbol"),
      title: node.name || node.qualifiedName || node.id,
      description: node.qualifiedName,
      status: "active",
      progress: 0,
      confidence: "high",
      knowledgeKind: "FACT",
      tags: ["foundation", "code-fact", node.kind],
      metadata: {
        foundationFallback: true,
        codeFactNodeId: node.id,
        path: node.filePath,
        language: node.language,
        range: node.range
      }
    });
  }

  for (const node of graph.nodes.slice(1, 41)) {
    graph.edges.push({
      id: `foundation-root:${node.id}`,
      source: "project:foundation",
      target: node.id,
      kind: "contains",
      title: "Contains",
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: "high",
      knowledgeKind: "FACT",
      metadata: { foundationFallback: true, synthetic: true }
    });
  }

  let truncatedEdges = 0;
  for (const edge of snapshot.edges) {
    const source = idMap.get(edge.sourceId);
    const target = idMap.get(edge.targetId);
    if (!source || !target) {
      truncatedEdges += 1;
      continue;
    }
    if (graph.edges.length >= edgeLimit) {
      truncatedEdges += 1;
      continue;
    }
    graph.edges.push({
      id: foundationCodeFactEdgeId(edge.id),
      source,
      target,
      kind: developmentEdgeKindFromProjection(edge.kind),
      title: edge.kind,
      status: "active",
      progress: 0,
      riskLevel: "none",
      confidence: confidenceFromNumber(edge.confidence),
      knowledgeKind: "FACT",
      metadata: {
        foundationFallback: true,
        codeFactEdgeId: edge.id,
        filePath: edge.filePath,
        range: edge.range
      }
    });
  }

  graph.metadata = {
    ...(graph.metadata ?? {}),
    truncatedNodes: Math.max(0, snapshot.nodes.length - selectedNodes.length - 1),
    truncatedEdges
  };
  return graph;
}

function foundationProjectionNodeId(viewId: string, nodeId: string): string {
  return `projection:${viewId}:${nodeId}`;
}

function foundationProjectionEdgeId(viewId: string, edgeId: string): string {
  return `projection:${viewId}:${edgeId}`;
}

function foundationCodeFactNodeId(nodeId: string): string {
  return `code-fact:${nodeId}`;
}

function foundationCodeFactEdgeId(edgeId: string): string {
  return `code-fact:${edgeId}`;
}

function developmentNodeKindFromProjection(kind: string, anchorKind?: string): DevelopmentNode["kind"] {
  if (anchorKind === "finding" || kind.includes("finding") || kind.includes("risk")) return "risk";
  if (anchorKind === "task" || kind.includes("task")) return "task";
  if (anchorKind === "trace" || anchorKind === "memory" || kind.includes("trace") || kind.includes("memory")) return "memory_event";
  if (anchorKind === "architecture_module" || kind.includes("architecture") || kind.includes("module")) return "architecture_component";
  if (anchorKind === "file" || anchorKind === "symbol" || kind.includes("file") || kind.includes("function") || kind.includes("class")) return "code_unit";
  if (kind.includes("decision")) return "decision";
  if (kind.includes("document") || kind.includes("spec")) return "document";
  return "code_unit";
}

function developmentEdgeKindFromProjection(kind: string): DevelopmentEdge["kind"] {
  if (kind === "contains" || kind === "owns") return "contains";
  if (kind === "implements") return "implements";
  if (kind === "impacts" || kind === "affects") return "impacts";
  if (kind === "blocks") return "blocks";
  if (kind === "conflicts_with") return "conflicts_with";
  if (kind === "derived_from") return "derived_from";
  if (kind === "validates") return "validates";
  if (kind === "records" || kind.includes("finding") || kind.includes("trace") || kind.includes("memory")) return "records";
  return "depends_on";
}

function statusFromString(value: string | undefined): DevelopmentNode["status"] {
  if (value === "draft" || value === "active" || value === "wip" || value === "blocked" || value === "done" || value === "stale" || value === "deprecated") {
    return value;
  }
  return "active";
}

function confidenceFromNumber(value: number): DevelopmentEdge["confidence"] {
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

function isFoundationFallbackGraph(graph: DevelopmentGraph): boolean {
  return graph.metadata?.foundationFallback === true;
}

async function importTaskResultPayload(projectRoot: string, result: CodingAgentResultInput): Promise<{ resultPath: string; progressPlan?: GraphPlan }> {
  const normalized = normalizeTaskResultInput(result);
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.tasksDir, { recursive: true });
  const resultPath = path.join(paths.tasksDir, `${safeFilePart(normalized.taskId)}.result.json`);
  await writeFile(resultPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  const progressPlan = progressPlanFromTaskResult(normalized);
  if (progressPlan) {
    await mkdir(paths.reportsDir, { recursive: true });
    await writeFile(path.join(paths.reportsDir, `${normalized.taskId}.progress-preview.json`), `${JSON.stringify(progressPlan, null, 2)}\n`, "utf8");
  }

  await appendChange(projectRoot, {
    title: `Imported result for ${normalized.taskId}`,
    summary: `${normalized.status}: ${normalized.summary}`,
    kind: "CANDIDATE"
  });
  await appendTrace(projectRoot, {
    id: `trace-event:task-result:${Date.now()}`,
    traceId: `trace:task-result:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "memory.recorded",
    target: { type: "project" },
    summary: `Imported task result ${normalized.taskId}`,
    data: { taskId: normalized.taskId, status: normalized.status, resultPath, progressPlan }
  });

  return { resultPath, progressPlan };
}

type ChatIntent = "explain" | "plan" | "generate_task" | "apply" | "import_result";

async function handlePermissionResponse(input: {
  projectRoot: string;
  graph: DevelopmentGraph;
  sessionId: string;
  target: SelectionTarget;
  message: string;
  approval: string;
  args: Args;
}): Promise<void> {
  const appended: ChatMessage[] = [];
  const approval = input.approval.toLowerCase();
  const userContent =
    input.message ||
    (approval === "approve" ? "Approved selected actions." : approval === "reject" ? "Rejected apply request." : "Modify apply request.");
  appended.push(
    await appendMessage(input.projectRoot, {
      sessionId: input.sessionId,
      role: "user",
      content: userContent,
      structured: { approval }
    })
  );

  try {
    const messages = await readMessages(input.projectRoot, input.sessionId);
    const permissionId = typeof input.args["permission-id"] === "string" ? input.args["permission-id"] : undefined;
    const permissionMessage = [...messages]
      .reverse()
      .find((message) => message.role === "permission" && (!permissionId || message.permissionRequest?.id === permissionId));
    if (!permissionMessage) throw new Error("No pending permission request was found in this chat session.");
    const plan = planFromMessage(permissionMessage) ?? latestPlan(messages);
    if (!plan) throw new Error("Permission request does not contain an applyable plan.");

    if (approval === "reject") {
      appended.push(
        await appendMessage(input.projectRoot, {
          sessionId: input.sessionId,
          role: "result",
          content: "Apply request rejected. No graph or memory changes were written.",
          structured: { permissionId: permissionMessage.permissionRequest?.id, rejected: true }
        })
      );
      return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
    }

    if (approval === "modify") {
      appended.push(
        await appendMessage(input.projectRoot, {
          sessionId: input.sessionId,
          role: "assistant",
          content: "Tell me which actions to keep, remove, or change, and I will prepare a revised Apply request.",
          structured: { permissionId: permissionMessage.permissionRequest?.id, modifyRequested: true }
        })
      );
      return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
    }

    if (approval !== "approve") throw new Error(`Unknown approval response: ${input.approval}`);
    const selectedActionIds = actionIdsFromArgs(input.args) ?? selectedActionIdsFromPermission(permissionMessage) ?? plan.actions.map((action) => action.id);
    const actionIdSet = new Set(selectedActionIds);
    const result = await applyPlanActions(input.projectRoot, input.graph, plan, actionIdSet);
    appended.push(
      await appendMessage(
        input.projectRoot,
        toolMessage(input.sessionId, "ApplyPlan", `${selectedActionIds.length} selected action(s)`, "Graph and memory apply completed.", "write_memory")
      )
    );
    appended.push(
      await appendMessage(input.projectRoot, {
        sessionId: input.sessionId,
        role: "result",
        content: [
          `Applied ${result.appliedActions.length} action(s).`,
          result.skippedActions.length ? `Skipped ${result.skippedActions.length} action(s).` : "",
          result.graphUpdated ? "Development Graph updated." : "No graph fields changed."
        ]
          .filter(Boolean)
          .join(" "),
        structured: { ...result, permissionId: permissionMessage.permissionRequest?.id, selectedActionIds }
      })
    );
    return await outputChatSendResult(input.projectRoot, input.sessionId, appended, result);
  } catch (error) {
    appended.push(
      await appendMessage(input.projectRoot, {
        sessionId: input.sessionId,
        role: "error",
        content: error instanceof Error ? error.message : String(error),
        status: "failed"
      })
    );
    return await outputChatSendResult(input.projectRoot, input.sessionId, appended);
  }
}

async function outputChatSendResult(projectRoot: string, sessionId: string, appendedMessages: ChatMessage[], extra: Record<string, unknown> = {}): Promise<void> {
  const transcript = await readSessionTranscript(projectRoot, sessionId);
  outputJson({ ok: true, sessionId, appendedMessages, ...transcript, logPaths: agentLogPaths(projectRoot, sessionId), ...extra });
}

function agentLogPaths(projectRoot: string, sessionId: string, runPath?: string) {
  const root = path.resolve(projectRoot);
  const chatPaths = getChatSessionPaths(root);
  return {
    chatSessionsIndex: chatPaths.sessionsIndexPath,
    chatTranscript: path.join(chatPaths.sessionsDir, `${sessionId}.jsonl`),
    runsIndex: path.join(root, ".distinction", "runs", "runs.jsonl"),
    runPath,
    traces: path.join(root, ".distinction", "memory", "traces.jsonl")
  };
}

function chatTargetFromArgs(args: Args): ChatTarget {
  if (typeof args["target-json"] === "string") {
    const parsed = JSON.parse(args["target-json"]) as ChatTarget;
    if (parsed.type === "project" || parsed.type === "node" || parsed.type === "edge" || parsed.type === "subgraph") return parsed;
  }

  const rawTarget = typeof args.target === "string" ? args.target : "";
  const rawType = typeof args["target-type"] === "string" ? args["target-type"] : "";
  const targetType = rawType || (rawTarget.startsWith("edge:") ? "edge" : rawTarget ? "node" : "project");
  if (targetType === "project") return { type: "project" };
  if (targetType === "node" || targetType === "edge") {
    const id = String(args["target-id"] ?? rawTarget);
    if (!id) throw new Error(`Missing --target-id for ${targetType} chat target.`);
    return { type: targetType, id };
  }
  throw new Error(`Unsupported chat target type: ${targetType}`);
}

function chatModeFromArgs(args: Args): "explain" | "plan" | "apply" | "task" {
  if (args.mode === "plan") return "plan";
  if (args.mode === "apply") return "apply";
  if (args.mode === "task" || args.intent === "generate_task") return "task";
  return "explain";
}

function selectionTargetFromChatTarget(graph: DevelopmentGraph, target: ChatTarget): SelectionTarget {
  if (target.type === "node" || target.type === "edge" || target.type === "subgraph") return target;
  const nodeIds = graph.nodes.slice(0, 18).map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  const edgeIds = graph.edges
    .filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
    .slice(0, 24)
    .map((edge) => edge.id);
  return { type: "subgraph", nodeIds, edgeIds };
}

function sessionTitleForTarget(graph: DevelopmentGraph, target: ChatTarget): string {
  if (target.type === "node") return findNode(graph, target.id)?.title ?? target.id;
  if (target.type === "edge") {
    const edge = findEdge(graph, target.id);
    if (!edge) return target.id;
    const source = findNode(graph, edge.source)?.title ?? edge.source;
    const destination = findNode(graph, edge.target)?.title ?? edge.target;
    return `${source} -> ${destination}`;
  }
  if (target.type === "subgraph") return `Subgraph (${target.nodeIds.length}/${target.edgeIds.length})`;
  return graph.title || "Project chat";
}

function inferChatIntent(message: string, explicit: string | boolean | undefined): ChatIntent {
  if (explicit === "plan") return "plan";
  if (explicit === "task" || explicit === "generate_task") return "generate_task";
  if (explicit === "apply") return "apply";
  if (explicit === "import_result") return "import_result";
  if (explicit === "explain") return "explain";

  const lower = message.toLowerCase();
  if (message.includes("生成任务") || lower.includes("generate task") || lower.includes("task")) return "generate_task";
  if (message.includes("应用") || message.includes("执行") || lower.includes("apply")) return "apply";
  if (message.includes("导入") || message.includes("结果") || lower.includes("import result") || lower.includes("task result")) return "import_result";
  if (message.includes("计划") || lower.includes("plan") || lower.includes("next step")) return "plan";
  return "explain";
}

function quickInstructionForIntent(intent: ChatIntent): string {
  if (intent === "plan") return "Plan next steps for the selected target.";
  if (intent === "generate_task") return "Generate a controlled coding task from the latest plan.";
  if (intent === "apply") return "Prepare an Apply permission request for the latest plan.";
  if (intent === "import_result") return "Import an external coding agent result.";
  return "Explain the selected target.";
}

function toolMessage(
  sessionId: string,
  name: string,
  inputSummary: string,
  outputSummary: string,
  riskLevel: ToolCallView["riskLevel"],
  traceIds?: string[]
): NewChatMessage {
  const toolCall: ToolCallView = {
    id: `tool-${Date.now()}-${slug(name)}`,
    name,
    status: "success",
    inputSummary,
    outputSummary,
    riskLevel
  };
  return {
    sessionId,
    role: "tool",
    content: `${name}: ${outputSummary}`,
    toolCall,
    traceIds
  };
}

function taskTypeForTarget(target: SelectionTarget, mode: "explain" | "plan") {
  if (target.type === "edge") return mode === "plan" ? "graph.edge.plan" : "graph.edge.explain";
  return mode === "plan" ? "graph.node.plan" : "graph.node.explain";
}

function latestPlan(messages: ChatMessage[]): GraphPlan | undefined {
  for (const message of [...messages].reverse()) {
    const plan = planFromMessage(message);
    if (plan) return plan;
  }
  return undefined;
}

function planFromMessage(message?: ChatMessage): GraphPlan | undefined {
  if (!message) return undefined;
  if (isGraphPlan(message.plan)) return message.plan;
  if (isRecord(message.structured) && isGraphPlan(message.structured.plan)) return message.structured.plan;
  if (isGraphPlan(message.structured)) return message.structured;
  return undefined;
}

function selectedActionIdsFromPermission(message: ChatMessage): string[] | undefined {
  if (!isRecord(message.structured) || !Array.isArray(message.structured.selectedActionIds)) return undefined;
  const values = message.structured.selectedActionIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
  return values.length ? values : undefined;
}

function actionIdsFromArgs(args: Args): string[] | undefined {
  if (typeof args.actions !== "string") return undefined;
  const values = args.actions
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function permissionRequestForPlan(plan: GraphPlan, selectedActionIds: string[]): PermissionRequestView {
  const selected = plan.actions.filter((action) => selectedActionIds.includes(action.id));
  const actions = selected.length ? selected : plan.actions;
  return {
    id: `permission-${Date.now()}`,
    title: "Apply selected plan actions",
    description: plan.summary,
    actionType: "apply_plan",
    affectedPaths: unique(actions.flatMap(pathsForAction)),
    affectedNodeIds: unique(actions.flatMap((action) => action.targetNodeIds)),
    affectedEdgeIds: unique(actions.flatMap((action) => action.targetEdgeIds)),
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
      { id: "modify", label: "Modify" }
    ]
  };
}

function pathsForAction(action: PlanAction): string[] {
  if (action.type === "update_edge" || action.type === "update_edge_progress") {
    return [".distinction/graph/edges.json", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "update_node_progress") {
    return [".distinction/graph/nodes.json", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "create_task" || action.type === "create_coding_task") {
    return [".distinction/tasks/*.md", ".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
  }
  if (action.type === "write_report") {
    return [".distinction/reports/*.md", ".distinction/memory/traces.jsonl"];
  }
  return [".distinction/memory/changes.md", ".distinction/memory/traces.jsonl"];
}

function targetSummary(target: ChatTarget): string {
  if (target.type === "project") return "Project";
  if (target.type === "subgraph") return `Subgraph with ${target.nodeIds.length} node(s) and ${target.edgeIds.length} edge(s)`;
  return `${target.type}: ${target.id}`;
}

function readableAssistantContent(message: string, structured: unknown): string {
  if (isRecord(structured) && typeof structured.summary === "string") return structured.summary;
  return message;
}

function parseTaskResultMessage(message: string): CodingAgentResultInput {
  const trimmed = message.trim();
  const parsed = safeJson(trimmed);
  if (isRecord(parsed) && typeof parsed.taskId === "string") return normalizeTaskResultInput(parsed as unknown as CodingAgentResultInput);

  const taskId = trimmed.match(/TASK-\d+/i)?.[0]?.toUpperCase() ?? "TASK-0001";
  const lower = trimmed.toLowerCase();
  const status = lower.includes("failed") || lower.includes("failure") ? "failed" : lower.includes("done") || lower.includes("pass") ? "done" : "partial";
  const summary =
    trimmed
      .split(/\r?\n/)
      .map((line) => line.replace(/^[#*\-\s]+/, "").trim())
      .find(Boolean) ?? "External coding agent result imported from chat.";
  const changedFiles = Array.from(
    new Set(
      [...trimmed.matchAll(/(?:^|\s)([A-Za-z0-9_.\/\\-]+\.(?:ts|tsx|js|jsx|rs|md|json|yaml|yml|toml|css|html))/g)].map((match) =>
        match[1].replace(/\\/g, "/")
      )
    )
  );
  const testResult = trimmed
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes("test"))
    ?.trim();
  return { taskId, status, summary, changedFiles, testResult, memorySuggestion: trimmed };
}

async function applyPlanActions(projectRoot: string, graph: DevelopmentGraph, plan: GraphPlan, actionIds?: Set<string>) {
  const selectedActions = plan.actions.filter((action) => !actionIds || actionIds.has(action.id));
  const appliedActions: { id: string; type: string; summary: string }[] = [];
  const skippedActions: { id: string; type: string; reason: string }[] = [];
  let graphChanged = false;

  for (const action of selectedActions) {
    let graphChangedByAction = false;
    if (!isSupportedApplyAction(action)) {
      skippedActions.push({ id: action.id, type: action.type, reason: "Action is not supported by v0.1 limited Apply." });
      continue;
    }
    if (isFoundationFallbackGraph(graph) && isDevelopmentGraphMutationAction(action)) {
      skippedActions.push({
        id: action.id,
        type: action.type,
        reason: "Foundation projection fallback graph is read-only; rerun projection commands instead of writing legacy .distinction/graph."
      });
      continue;
    }
    if (action.type === "update_edge") {
      const edge = action.targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).find(Boolean) as DevelopmentEdge | undefined;
      if (!edge) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target edge was not found." });
        continue;
      }
      edge.blockedReason = stringOr(action.data?.blockedReason, action.description || plan.summary);
      edge.metadata = {
        ...(edge.metadata ?? {}),
        lastAppliedPlanId: plan.id,
        lastAppliedActionId: action.id,
        appliedBy: "user-confirmed"
      };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${edge.id}` });
    } else if (action.type === "update_node_progress") {
      const progress = progressFromAction(action);
      const node = action.targetNodeIds.map((nodeId) => findNode(graph, nodeId)).find(Boolean) as DevelopmentNode | undefined;
      if (!node || progress === undefined) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target node or progress was not found." });
        continue;
      }
      node.progress = progress;
      node.metadata = { ...(node.metadata ?? {}), lastAppliedPlanId: plan.id, lastAppliedActionId: action.id, appliedBy: "user-confirmed" };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${node.id} progress to ${Math.round(progress * 100)}%` });
    } else if (action.type === "update_edge_progress") {
      const progress = progressFromAction(action);
      const edge = action.targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).find(Boolean) as DevelopmentEdge | undefined;
      if (!edge || progress === undefined) {
        skippedActions.push({ id: action.id, type: action.type, reason: "Target edge or progress was not found." });
        continue;
      }
      edge.progress = progress;
      edge.metadata = { ...(edge.metadata ?? {}), lastAppliedPlanId: plan.id, lastAppliedActionId: action.id, appliedBy: "user-confirmed" };
      graphChanged = true;
      graphChangedByAction = true;
      appliedActions.push({ id: action.id, type: action.type, summary: `Updated ${edge.id} progress to ${Math.round(progress * 100)}%` });
    } else if (action.type === "create_memory_event") {
      await appendChange(projectRoot, {
        title: action.title,
        summary: `${action.description}\n\nPlan: ${plan.summary}`,
        kind: "CONFIRMED"
      });
      appliedActions.push({ id: action.id, type: action.type, summary: "Recorded memory event." });
    } else if (action.type === "create_decision") {
      await appendDecision(projectRoot, action, plan);
      appliedActions.push({ id: action.id, type: action.type, summary: "Recorded decision." });
    } else if (action.type === "create_task" || action.type === "create_coding_task") {
      const taskId = `TASK-${String(Date.now()).slice(-6)}`;
      const taskPath = await writeCodingTask(projectRoot, {
        id: taskId,
        markdown: [`# ${taskId} ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", "Target nodes:", ...list(action.targetNodeIds), "", "Target edges:", ...list(action.targetEdgeIds), ""].join("\n")
      });
      appliedActions.push({ id: action.id, type: action.type, summary: `Wrote ${taskPath}` });
    } else if (action.type === "write_report") {
      const reportPath = await writeActionReport(projectRoot, action, plan);
      appliedActions.push({ id: action.id, type: action.type, summary: `Wrote ${reportPath}` });
    }

    await appendTrace(projectRoot, {
      id: `trace-event:apply:${Date.now()}:${action.id}`,
      traceId: `trace:apply:${Date.now()}`,
      timestamp: new Date().toISOString(),
      kind: graphChangedByAction ? "graph.updated" : "memory.recorded",
      target: traceTargetFromAction(action),
      summary: `Applied plan action ${action.title}`,
      data: { planId: plan.id, action }
    });
  }

  if (graphChanged) await writeDevelopmentGraph(projectRoot, graph);
  if (appliedActions.length) {
    await appendChange(projectRoot, {
      title: `Applied ${appliedActions.length} plan action(s)`,
      summary: appliedActions.map((action) => `${action.type}: ${action.summary}`).join("\n"),
      kind: "CONFIRMED"
    });
  }

  return { appliedActions, skippedActions, graphUpdated: graphChanged };
}

function normalizeTaskResultInput(value: CodingAgentResultInput): CodingAgentResultInput {
  if (!value || typeof value !== "object") throw new Error("Task result must be a JSON object.");
  if (!value.taskId) throw new Error("Task result requires taskId.");
  if (!["done", "partial", "failed"].includes(value.status)) throw new Error("Task result status must be done, partial, or failed.");
  return {
    taskId: value.taskId,
    status: value.status,
    summary: value.summary || "",
    changedFiles: Array.isArray(value.changedFiles) ? value.changedFiles.filter((item) => typeof item === "string") : [],
    testResult: value.testResult,
    progressSuggestion: value.progressSuggestion,
    memorySuggestion: value.memorySuggestion
  };
}

function progressPlanFromTaskResult(result: CodingAgentResultInput): GraphPlan | undefined {
  const nodeActions =
    result.progressSuggestion?.nodeUpdates?.map((update, index) => ({
      id: `action:${result.taskId}:node-progress:${index + 1}`,
      type: "update_node_progress" as const,
      title: `Apply suggested node progress for ${update.nodeId}`,
      description: result.summary,
      targetNodeIds: [update.nodeId],
      targetEdgeIds: [],
      data: { progress: update.progress }
    })) ?? [];
  const edgeActions =
    result.progressSuggestion?.edgeUpdates?.map((update, index) => ({
      id: `action:${result.taskId}:edge-progress:${index + 1}`,
      type: "update_edge_progress" as const,
      title: `Apply suggested edge progress for ${update.edgeId}`,
      description: result.summary,
      targetNodeIds: [],
      targetEdgeIds: [update.edgeId],
      data: { progress: update.progress }
    })) ?? [];
  const actions = [...nodeActions, ...edgeActions];
  if (!actions.length) return undefined;
  return {
    id: `plan:${result.taskId}:progress-preview`,
    summary: `Progress suggestions imported from ${result.taskId}. Confirm before Apply.`,
    missingGluePoints: [],
    actions,
    codingTasks: [],
    questions: ["Which progress suggestions should Praxis apply to the Development Graph?"]
  };
}

function buildCodingTaskContext(graph: DevelopmentGraph, plan: GraphPlan, action?: GraphPlan["actions"][number]) {
  const targetEdgeIds = unique([
    ...(action?.targetEdgeIds ?? []),
    ...plan.actions.flatMap((item) => item.targetEdgeIds ?? [])
  ]);
  const edgeTargets = targetEdgeIds.map((edgeId) => findEdge(graph, edgeId)).filter(Boolean) as DevelopmentEdge[];
  const edgeNodeIds = edgeTargets.flatMap((edge) => [edge.source, edge.target]);
  const targetNodeIds = unique([...(action?.targetNodeIds ?? []), ...plan.actions.flatMap((item) => item.targetNodeIds ?? []), ...edgeNodeIds]);
  const nodeTargets = targetNodeIds.map((nodeId) => findNode(graph, nodeId)).filter(Boolean) as DevelopmentNode[];

  const edgeLines = edgeTargets.map((edge) => {
    const source = findNode(graph, edge.source);
    const target = findNode(graph, edge.target);
    return [
      `Edge: ${edge.id}`,
      `  Relation: ${source?.title ?? edge.source} --${edge.kind}--> ${target?.title ?? edge.target}`,
      `  Progress: ${Math.round(edge.progress * 100)}%`,
      `  Risk: ${edge.riskLevel}`,
      `  Knowledge: ${edge.knowledgeKind} / ${edge.confidence}`,
      edge.blockedReason ? `  Blocked reason: ${edge.blockedReason}` : "  Blocked reason: None recorded"
    ].join("\n");
  });
  const nodeLines = nodeTargets.map((node) =>
    [
      `Node: ${node.id}`,
      `  Title: ${node.title}`,
      `  Kind: ${node.kind}`,
      `  Progress: ${Math.round(node.progress * 100)}%`,
      `  Knowledge: ${node.knowledgeKind} / ${node.confidence}`,
      node.description ? `  Description: ${node.description}` : undefined
    ]
      .filter(Boolean)
      .join("\n")
  );
  const relatedFiles = unique(
    nodeTargets
      .map((node) => node.metadata?.path)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const relatedModulePaths = unique(
    nodeTargets
      .map((node) => node.metadata?.path)
      .filter((value): value is string => typeof value === "string" && (value.startsWith("apps/") || value.startsWith("packages/") || value === "docs"))
  );

  return {
    targetNodeIds,
    targetEdgeIds,
    relatedFiles,
    allowedPaths: relatedModulePaths.length ? [...relatedModulePaths, ".distinction"] : [".distinction", "packages"],
    architectureContext: nodeLines.length ? nodeLines.join("\n\n") : "No node context was resolved from the selected graph plan.",
    graphContext: [
      plan.summary,
      "",
      "Selected graph context:",
      edgeLines.length ? edgeLines.join("\n\n") : "No edge context was resolved from the selected graph plan.",
      "",
      nodeLines.length ? nodeLines.join("\n\n") : ""
    ]
      .filter(Boolean)
      .join("\n"),
    memoryContext: plan.missingGluePoints.map((point) => `${point.kind}: ${point.title} - ${point.reason}`)
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function list(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- None"];
}

function isSupportedApplyAction(action: PlanAction): boolean {
  return [
    "update_edge",
    "update_node_progress",
    "update_edge_progress",
    "create_memory_event",
    "create_decision",
    "create_task",
    "create_coding_task",
    "write_report"
  ].includes(action.type);
}

function isDevelopmentGraphMutationAction(action: PlanAction): boolean {
  return action.type === "update_edge" || action.type === "update_node_progress" || action.type === "update_edge_progress";
}

function progressFromAction(action: PlanAction): number | undefined {
  const raw = action.data?.progress ?? action.data?.value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return normalizeProgress(raw > 1 ? raw / 100 : raw);
}

async function appendDecision(projectRoot: string, action: PlanAction, plan: GraphPlan): Promise<void> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.memoryDir, { recursive: true });
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(
      path.join(paths.memoryDir, "decisions.md"),
      [`## ${new Date().toISOString()} ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", ""].join("\n"),
      "utf8"
    )
  );
}

async function writeActionReport(projectRoot: string, action: PlanAction, plan: GraphPlan): Promise<string> {
  const paths = getLocalKnowledgePaths(projectRoot);
  await mkdir(paths.reportsDir, { recursive: true });
  const reportPath = path.join(paths.reportsDir, `${slug(action.id)}.md`);
  await writeFile(
    reportPath,
    [`# ${action.title}`, "", action.description, "", `Plan: ${plan.id}`, "", "## Plan Summary", "", plan.summary, ""].join("\n"),
    "utf8"
  );
  return reportPath;
}

function traceTargetFromAction(action: PlanAction) {
  if (action.targetEdgeIds[0]) return { type: "edge" as const, id: action.targetEdgeIds[0] };
  if (action.targetNodeIds[0]) return { type: "node" as const, id: action.targetNodeIds[0] };
  return { type: "project" as const };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "candidate-finding";
}

function safeReviewIdPart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96)
    || "候选问题";
}

async function commandCreateProject(args: Args): Promise<void> {
  const root = required(args, "root");
  let plan: NewProjectPlan;
  if (args.plan) {
    plan = (await readJson(String(args.plan))) as NewProjectPlan;
  } else {
    plan = await createProjectPlanWithAgents(root, {
      projectName: String(args.name ?? "praxis-project"),
      productIdea: String(args.intent ?? "New Praxis project"),
      projectKind: args.kind === "tauri-desktop-minimal" ? "tauri-desktop-minimal" : "documentation-first"
    });
  }
  const result = await applyNewProjectPlan(root, plan);
  await appendChange(root, {
    title: "Created project from product intent",
    summary: `Generated ${plan.files.length} file(s), ${plan.requirements.length} requirement(s), and ${plan.architecture.length} architecture component(s).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:create-project:${Date.now()}`,
    traceId: `trace:create-project:${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "graph.generated",
    target: { type: "project", id: "project:root" },
    summary: "Created new project graph from product intent",
    data: { projectName: plan.projectName, projectKind: plan.projectKind }
  }).catch(() => undefined);
  outputJson({ ok: true, ...result });
}

async function commandCreateProjectPlan(args: Args): Promise<void> {
  const root = String(args.root ?? process.cwd());
  const plan = await createProjectPlanWithAgents(root, {
    projectName: String(args.name ?? "praxis-project"),
    productIdea: String(args.intent ?? "New Praxis project"),
    projectKind: args.kind === "tauri-desktop-minimal" ? "tauri-desktop-minimal" : "documentation-first"
  });
  await maybeWriteJson(args, "out", plan);
  outputJson({
    ok: true,
    legacyGraphFiles: true,
    legacyGraphNotice: "Generated .distinction/graph files are legacy DevelopmentGraph bootstrap artifacts, not v0.1 projection authority.",
    requirements: plan.requirements.length,
    architecture: plan.architecture.length,
    files: plan.files.length,
    plan
  });
}

async function createProjectPlanWithAgents(
  root: string,
  input: { projectName: string; productIdea: string; projectKind: "documentation-first" | "tauri-desktop-minimal" }
): Promise<NewProjectPlan> {
  const plan = createNewProjectPlan(input);
  const config = await loadModelConfig(root);
  const requirements = await callProjectCreationAgent(config, "project.create.requirements", "project-create-requirements", input);
  const architecture = await callProjectCreationAgent(config, "project.create.architecture", "project-create-architecture", {
    ...input,
    requirements: requirements?.requirements ?? plan.requirements
  });

  if (Array.isArray(requirements?.requirements)) {
    plan.requirements = normalizeRequirements(requirements.requirements, plan.requirements);
  }
  if (Array.isArray(architecture?.architecture)) {
    plan.architecture = normalizeArchitecture(architecture.architecture, plan.architecture);
  }
  plan.assumptions = [
    ...plan.assumptions,
    ...normalizeStringRecords(requirements?.assumptions, "requirement-agent-assumption"),
    ...normalizeStringRecords(requirements?.nonGoals, "requirement-agent-non-goal"),
    ...normalizeStringRecords(requirements?.successCriteria, "requirement-agent-success-criterion"),
    ...normalizeStringRecords(architecture?.risks, "architecture-agent-risk")
  ];
  plan.questions = [
    ...plan.questions,
    ...normalizeQuestionRecords(requirements?.questions, "requirement-agent-question"),
    ...normalizeQuestionRecords(architecture?.questions, "architecture-agent-question")
  ];
  refreshNewProjectPlanArtifacts(plan);
  return plan;
}

async function callProjectCreationAgent(
  config: Awaited<ReturnType<typeof loadModelConfig>>,
  taskType: "project.create.requirements" | "project.create.architecture",
  promptName: "project-create-requirements" | "project-create-architecture",
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt(promptName).body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  const parsed = safeJson(response.content);
  return isRecord(parsed) ? parsed : undefined;
}

async function callProjectOverviewAgent(root: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const config = await loadModelConfig(root);
  const route = resolveModelRoute(config, "project.overview.generate");
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("project-overview-discovery", { overrideDirs: reviewPromptOverrideDirs(root) }).body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  const parsed = safeJson(response.content);
  return isRecord(parsed) ? parsed : undefined;
}

async function callProjectChangePlanAgent(root: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const config = await loadModelConfig(root);
  const route = resolveModelRoute(config, "project.change_plan.generate");
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("project-change-plan", { overrideDirs: reviewPromptOverrideDirs(root) }).body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  const parsed = safeJson(response.content);
  return isRecord(parsed) ? parsed : undefined;
}

function requireProjectChangePlanAgentOutput(output: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!output) {
    throw new Error("Project Change Plan Agent did not return JSON; refusing to write a generated plan.");
  }
  const changeItems = Array.isArray(output.changeItems) ? output.changeItems.filter(isRecord) : [];
  const developmentPlan = Array.isArray(output.developmentPlan) ? output.developmentPlan.filter(isRecord) : [];
  if (!changeItems.length) {
    throw new Error("Project Change Plan Agent returned no changeItems; refusing to write a fallback/mock plan.");
  }
  if (!developmentPlan.length) {
    throw new Error("Project Change Plan Agent returned no developmentPlan; refusing to write a fallback/mock plan.");
  }
  if (!isRecord(output.expectedChangelog)) {
    throw new Error("Project Change Plan Agent returned no expectedChangelog; refusing to write a fallback/mock plan.");
  }
  for (const task of developmentPlan) {
    validateProjectChangePlanTaskPackage(task);
  }
  return output;
}

function validateProjectChangePlanTaskPackage(task: Record<string, unknown>): void {
  const title = typeof task.title === "string" && task.title.trim() ? task.title.trim() : String(task.id ?? "unknown task");
  if (!isRecord(task.implementationBrief)) {
    throw new Error(`Project Change Plan task "${title}" has no implementationBrief; refusing to write a non-actionable plan.`);
  }
  if (!isRecord(task.workset)) {
    throw new Error(`Project Change Plan task "${title}" has no workset; refusing to write a non-actionable plan.`);
  }
  const brief = task.implementationBrief;
  const workset = task.workset;
  for (const field of ["objective", "currentBehavior", "targetBehavior", "approach", "rollbackPlan"]) {
    if (!nonEmptyPlanString(brief[field])) {
      throw new Error(`Project Change Plan task "${title}" implementationBrief.${field} is empty.`);
    }
  }
  for (const field of ["readFiles", "relatedDocs", "contextNotes"]) {
    if (!nonEmptyPlanStringArray(workset[field])) {
      throw new Error(`Project Change Plan task "${title}" workset.${field} is empty; task package is not enough for implementation.`);
    }
  }
  const phase = typeof task.phase === "string" ? task.phase : "plan";
  if ((phase === "code" || phase === "test" || phase === "review") && !nonEmptyPlanStringArray(task.acceptance)) {
    throw new Error(`Project Change Plan task "${title}" has no concrete acceptance criteria.`);
  }
  if ((phase === "code" || phase === "test" || phase === "review") && !nonEmptyAcceptanceEvidence(task.acceptanceEvidence)) {
    throw new Error(`Project Change Plan task "${title}" has no acceptanceEvidence.`);
  }
  if (phase === "code" && !nonEmptyPlanStringArray(workset.writeFiles)) {
    throw new Error(`Project Change Plan code task "${title}" has no workset.writeFiles; refusing to write an unbounded implementation task.`);
  }
}

function nonEmptyPlanString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyPlanStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

function nonEmptyAcceptanceEvidence(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => {
    if (!isRecord(item)) return false;
    return nonEmptyPlanString(item.description) && nonEmptyPlanString(item.expectedResult);
  });
}

function normalizeRequirements(value: unknown[], fallback: NewProjectPlan["requirements"]): NewProjectPlan["requirements"] {
  const requirements = value
    .filter(isRecord)
    .map((item, index) => ({
      id: stringOr(item.id, `REQ-${String(index + 1).padStart(3, "0")}`),
      title: stringOr(item.title, `Requirement ${index + 1}`),
      description: stringOr(item.description, "")
    }))
    .filter((item) => item.title || item.description);
  return requirements.length ? requirements : fallback;
}

function normalizeArchitecture(value: unknown[], fallback: NewProjectPlan["architecture"]): NewProjectPlan["architecture"] {
  const architecture = value
    .filter(isRecord)
    .map((item, index) => ({
      id: stringOr(item.id, `ARCH-${String(index + 1).padStart(3, "0")}`),
      title: stringOr(item.title, `Architecture Component ${index + 1}`),
      responsibility: stringOr(item.responsibility, stringOr(item.description, ""))
    }))
    .filter((item) => item.title || item.responsibility);
  return architecture.length ? architecture : fallback;
}

function normalizeStringRecords(value: unknown, prefix: string): { id: string; summary: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((summary, index) => ({ id: `${prefix}-${index + 1}`, summary }));
}

function normalizeQuestionRecords(value: unknown, prefix: string): { id: string; question: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") return { id: `${prefix}-${index + 1}`, question: item };
      if (isRecord(item)) return { id: stringOr(item.id, `${prefix}-${index + 1}`), question: stringOr(item.question, "") };
      return undefined;
    })
    .filter((item): item is { id: string; question: string } => Boolean(item?.question));
}

function refreshNewProjectPlanArtifacts(plan: NewProjectPlan): void {
  const projectNode = plan.graph.nodes.find((node) => node.id === "project:root");
  plan.graph.nodes = [
    projectNode ?? {
      id: "project:root",
      kind: "project",
      title: plan.projectName,
      status: "draft",
      progress: 0.1,
      confidence: "medium",
      knowledgeKind: "CANDIDATE"
    },
    ...plan.requirements.map((requirement) => ({
      id: `requirement:${requirement.id}`,
      kind: "requirement" as const,
      title: requirement.title,
      description: requirement.description,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    })),
    ...plan.architecture.map((component) => ({
      id: `architecture:${component.id}`,
      kind: "architecture_component" as const,
      title: component.title,
      description: component.responsibility,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    }))
  ];
  plan.graph.edges = plan.graph.nodes
    .filter((node) => node.id !== "project:root")
    .map((node) => ({
      id: `edge:project-contains-${node.id}`,
      source: "project:root",
      target: node.id,
      kind: "contains" as const,
      title: "contains",
      status: "draft" as const,
      progress: 0.1,
      riskLevel: "none" as const,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    }));

  replaceGeneratedFile(
    plan,
    "docs/PRODUCT_SPEC.md",
    [
      "# Product Spec",
      "",
      `Project: ${plan.projectName}`,
      "",
      "## Product Intent",
      "",
      plan.productIdea,
      "",
      "## Requirements",
      "",
      ...plan.requirements.map((requirement) => `- ${requirement.id}: ${requirement.title} - ${requirement.description}`),
      "",
      "## Assumptions / Constraints",
      "",
      ...plan.assumptions.map((assumption) => `- ${assumption.summary}`),
      "",
      "## Questions",
      "",
      ...plan.questions.map((question) => `- ${question.question}`),
      ""
    ].join("\n")
  );
  replaceGeneratedFile(
    plan,
    "docs/ARCHITECTURE.md",
    [
      "# Architecture",
      "",
      "## Components",
      "",
      ...plan.architecture.map((component) => `- ${component.id}: ${component.title} - ${component.responsibility}`),
      "",
      "## Assumptions And Risks",
      "",
      ...plan.assumptions.map((assumption) => `- ${assumption.summary}`),
      ""
    ].join("\n")
  );
  // Legacy bootstrap output: new v0.1 graph surfaces should be projected under views/.
  replaceGeneratedFile(plan, ".distinction/graph/nodes.json", `${JSON.stringify(plan.graph.nodes, null, 2)}\n`);
  replaceGeneratedFile(plan, ".distinction/graph/edges.json", `${JSON.stringify(plan.graph.edges, null, 2)}\n`);
}

function replaceGeneratedFile(plan: NewProjectPlan, filePath: string, content: string): void {
  const file = plan.files.find((item) => item.path === filePath);
  if (file) file.content = content;
  else plan.files.push({ path: filePath, content });
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(values: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing required --${key}`);
  return value;
}

async function commandUnderstand(args: Args): Promise<void> {
  const root = required(args, "root");
  const codeFacts = args["code-facts"]
    ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
    : await readOrBuildCodeFacts(root, args);
  const patch = RepositoryUnderstandingPatchSchema.parse(buildRepositoryUnderstandingPatch(codeFacts));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "repository-understanding-patch.json");
  await writeJson(cachePath, patch, RepositoryUnderstandingPatchSchema);
  await maybeWriteJson(args, "out", patch);
  outputJson({
    ok: true,
    root: patch.root,
    cachePath,
    memoryPatches: patch.memoryPatches.length,
    modelPatches: patch.modelPatches.length,
    findingPatches: patch.findingPatches.length,
    warnings: patch.warnings,
    reviewQuestions: patch.reviewQuestions
  });
}

async function commandAcceptUnderstanding(args: Args): Promise<void> {
  const root = required(args, "root");
  const patchPath =
    typeof args.patch === "string"
      ? args.patch
      : path.join(path.resolve(root), ".distinction", "cache", "repository-understanding-patch.json");
  const patch = await readJsonWithSchema(patchPath, RepositoryUnderstandingPatchSchema);
  const records = acceptedFactRecordsFromPatch(patch);
  const factsPath = await appendFactRecords(root, records);
  await appendChange(root, {
    title: "Accepted repository understanding facts",
    summary: `Accepted ${records.length} FACT memory record(s) from ${path.relative(path.resolve(root), patchPath) || patchPath}.`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: path.resolve(root),
    factsPath,
    acceptedFacts: records.length
  });
}

async function commandModelArchitecture(args: Args): Promise<void> {
  const root = required(args, "root");
  const records = await readFactRecords(root);
  const patch = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(path.resolve(root), records as any[]));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "architecture-model-patch.json");
  await writeJson(cachePath, patch, ArchitectureModelPatchSchema);
  await maybeWriteJson(args, "out", patch);
  outputJson({
    ok: true,
    root: patch.root,
    cachePath,
    modules: patch.modules.length,
    dependencies: patch.dependencies.length,
    warnings: patch.warnings
  });
}

async function commandDetectFindings(args: Args): Promise<void> {
  const root = required(args, "root");
  const modelPath =
    typeof args.model === "string"
      ? args.model
      : path.join(path.resolve(root), ".distinction", "cache", "architecture-model-patch.json");
  let model: ArchitectureModelPatch;
  try {
    model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    const records = await readFactRecords(root);
    model = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(path.resolve(root), records as any[]));
    await writeJson(modelPath, model, ArchitectureModelPatchSchema);
  }
  const detectedReport = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "architecture-findings.json");
  const previousReport = await tryReadJsonWithSchema(cachePath, ArchitectureFindingReportSchema);
  const report = previousReport ? reconcileFindingReport(previousReport, detectedReport) : detectedReport;
  await writeJson(cachePath, report, ArchitectureFindingReportSchema);
  await maybeWriteJson(args, "out", report);
  outputJson({
    ok: true,
    root: report.root,
    cachePath,
    findings: report.findings.length,
    detectorIds: report.detectorIds
  });
}

async function buildAndWriteCodeUnderstandingSpineForCodeFacts(
  root: string,
  codeFacts: CodeFactGraphSnapshot,
  generatedAt = new Date().toISOString()
) {
  const spine = buildCodeUnderstandingSpine(root, codeFacts, generatedAt);
  const documents = await writeCodeUnderstandingSpineDocuments(root, spine);
  return { spine, documents };
}

async function commandCodeUnderstandingSpine(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const codeFacts = args["code-facts"]
    ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
    : await readOrBuildCodeFacts(root, args);
  const { spine, documents } = await buildAndWriteCodeUnderstandingSpineForCodeFacts(root, codeFacts, generatedAt);
  outputJson({
    ok: true,
    root,
    generatedAt,
    markdownPath: projectRelativePath(root, documents.markdownPath),
    jsonPath: projectRelativePath(root, documents.jsonPath),
    summary: spine.summary,
    source: spine.source
  });
}

async function commandProjectOverview(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const force = args.force === true;
  const existsAlready = await projectOverviewDocumentsExist(root);
  if (existsAlready && !force) {
    outputJson({
      ok: true,
      root,
      skipped: true,
      reason: "Project overview documents already exist. Use --force to regenerate.",
      overviewPath: path.join(root, PROJECT_OVERVIEW_DOC_RELATIVE_PATH),
      timelinePath: path.join(root, PROJECT_TIMELINE_DOC_RELATIVE_PATH)
    });
    return;
  }

  const sources = await readProjectOverviewSourceDocuments(root);
  const agentPayload = projectOverviewAgentPayload(root, generatedAt, sources);
  const draftRaw = await callProjectOverviewAgent(root, agentPayload);
  const draft = normalizeProjectOverviewDraft(draftRaw, root, generatedAt, sources);
  const documents = await writeProjectOverviewDocuments(root, draft, generatedAt);

  await appendChange(root, {
    title: "Project overview documents generated",
    summary: `Generated ${documents.overviewRelativePath} and ${documents.timelineRelativePath} from docs-backed project sources.`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:project-overview:${Date.now()}`,
    traceId: `trace:project-overview:${Date.now()}`,
    timestamp: generatedAt,
    kind: "project.overview.generated",
    target: { type: "project", id: "project:root" },
    summary: "Project Overview Agent generated docs-backed project overview documents.",
    data: {
      overviewPath: documents.overviewRelativePath,
      timelinePath: documents.timelineRelativePath,
      sourceDocuments: draft.sourceDocuments
    }
  } satisfies TraceRecord).catch(() => undefined);

  outputJson({
    ok: true,
    root,
    skipped: false,
    overviewPath: documents.overviewPath,
    timelinePath: documents.timelinePath,
    overviewRelativePath: documents.overviewRelativePath,
    timelineRelativePath: documents.timelineRelativePath,
    sourceDocuments: draft.sourceDocuments,
    currentState: draft.currentState,
    timelineItems: draft.timeline.length,
    progressItems: draft.progress.length,
    risks: draft.risks.length
  });
}

async function commandProjectChangePlan(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const readOnly = args["read-only"] === true;
  const force = args.force === true || args.refresh === true;
  const existing = await readProjectChangePlan(root);
  if (readOnly) {
    outputJson({
      ok: true,
      root,
      ...existing
    });
    return;
  }
  if (existing.exists && !existing.stale && !force) {
    outputJson({
      ok: true,
      root,
      skipped: true,
      reason: "Project change plan already exists and source documents are not newer. Use --force to regenerate.",
      ...existing
    });
    return;
  }

  const generatedAt = new Date().toISOString();
  const [currentVersion, git, sources] = await Promise.all([
    readProjectSemanticVersion(root).then((value) => value ?? "0.0.0"),
    readProjectGitVersion(root),
    readProjectChangePlanSources(root)
  ]);
  const payload = projectChangePlanAgentPayload(root, generatedAt, currentVersion, git, sources);
  let agentError: string | undefined;
  let agentOutput: Record<string, unknown> | undefined;
  try {
    agentOutput = await callProjectChangePlanAgent(root, payload);
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error);
  }
  if (agentError) {
    throw new Error(`Project Change Plan Agent failed; no plan document was written. ${agentError}`);
  }
  const model = normalizeProjectChangePlanModel(
    requireProjectChangePlanAgentOutput(agentOutput),
    root,
    generatedAt,
    currentVersion,
    git,
    sources
  );
  const documents = await writeProjectChangePlanDocuments(root, model);

  await appendChange(root, {
    title: "Project change plan generated",
    summary: `Generated ${PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH} for docs-first development workflow. Version decision: ${model.currentVersion} -> ${model.nextVersion} (${model.bump}).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:project-change-plan:${Date.now()}`,
    traceId: `trace:project-change-plan:${Date.now()}`,
    timestamp: generatedAt,
    kind: "project.change_plan.generated",
    target: { type: "project", id: "project:root" },
    summary: "Project Change Plan Agent generated docs-backed change items, development plan and expected changelog.",
    data: {
      markdownPath: documents.markdownRelativePath,
      htmlPath: documents.htmlRelativePath,
      status: model.status,
      currentVersion: model.currentVersion,
      nextVersion: model.nextVersion,
      bump: model.bump,
      sourceDocuments: sources.map((source) => source.path),
      agentError
    }
  } satisfies TraceRecord).catch(() => undefined);

  outputJson({
    ok: true,
    root,
    skipped: false,
    staleBefore: existing.stale,
    agentError,
    ...documents
  });
}

async function commandProjectChangePlanDiscuss(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const message = required(args, "message").trim();
  const generatedAt = new Date().toISOString();
  const conversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));
  const [existing, currentVersion, git, sources] = await Promise.all([
    readProjectChangePlan(root),
    readProjectSemanticVersion(root).then((value) => value ?? "0.0.0"),
    readProjectGitVersion(root),
    readProjectChangePlanSources(root)
  ]);
  const basePayload = projectChangePlanAgentPayload(root, generatedAt, existing.model?.currentVersion ?? currentVersion, git, sources);
  const payload = {
    ...basePayload,
    mode: "discuss_and_update_existing_project_change_plan",
    userMessage: message,
    existingProjectChangePlan: existing.model ?? null,
    sharedConversationHistory: conversationHistory.slice(-40).map((entry) => ({
      role: entry.role,
      scope: entry.scopeKind,
      title: entry.scopeTitle,
      context: entry.contextTitle,
      content: entry.text
    })),
    discussionRules: [
      "用户正在计划 / 甘特图页面讨论项目变更、开发计划、语义版本、changelog 或开发执行顺序。",
      "如果用户要求修改计划、拆分任务、调整版本或补充验收条件，必须直接反映到输出 JSON。",
      "如果用户只是询问计划含义，也要保持现有计划结构，并在 questions 或 agentProgress 中记录本次解释性交流是否产生后续行动。",
      "不要生成源码补丁；本命令只维护 docs/project/project-change-plan.md 和 HTML 投影。"
    ]
  };
  let agentError: string | undefined;
  let agentOutput: Record<string, unknown> | undefined;
  try {
    agentOutput = await callProjectChangePlanAgent(root, payload);
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error);
  }
  if (agentError) {
    throw new Error(`Project Change Plan Agent discussion failed; no plan document was rewritten. ${agentError}`);
  }
  const requiredAgentOutput = requireProjectChangePlanAgentOutput(agentOutput);
  const normalized = normalizeProjectChangePlanModel(
    requiredAgentOutput,
    root,
    generatedAt,
    existing.model?.currentVersion ?? currentVersion,
    git,
    sources
  );
  const nextModel = normalizeProjectChangePlanModel(
    {
      ...normalized,
      status: existing.model?.status === "in_development" || existing.model?.status === "completed"
        ? existing.model.status
        : normalized.status,
      agentProgress: [
        ...(existing.model?.agentProgress ?? []),
        ...normalized.agentProgress,
        {
          timestamp: generatedAt,
          taskId: "plan-discussion",
          status: "doing",
          summary: `计划 Agent 已根据用户消息更新或复核项目变更计划：${truncateText(message, 160)}`
        }
      ]
    },
    root,
    generatedAt,
    existing.model?.currentVersion ?? currentVersion,
    git,
    sources
  );
  const documents = await writeProjectChangePlanDocuments(root, nextModel);
  const documentEdits: DiagramDocumentEditResult[] = [
    {
      path: PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH,
      operation: "replace_document",
      status: "applied",
      changed: true,
      message: "已更新项目变更计划 Markdown。",
      reason: "Plan / Gantt Agent discussion maintains the docs-backed project change plan."
    },
    {
      path: PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH,
      operation: "replace_document",
      status: "applied",
      changed: true,
      message: "已更新项目变更计划 HTML 投影。",
      reason: "Plan / Gantt view renders the HTML projection from docs/project."
    }
  ];

  await appendTrace(root, {
    id: `trace-event:project-change-plan-discussion:${Date.now()}`,
    traceId: `trace:project-change-plan-discussion:${Date.now()}`,
    timestamp: generatedAt,
    kind: "project.change_plan.discussion_completed",
    target: { type: "project", id: "project:root" },
    summary: "Plan / Gantt Agent discussed and updated the docs-backed project change plan.",
    data: {
      markdownPath: documents.markdownRelativePath,
      htmlPath: documents.htmlRelativePath,
      currentVersion: nextModel.currentVersion,
      nextVersion: nextModel.nextVersion,
      bump: nextModel.bump,
      status: nextModel.status,
      agentError
    }
  } satisfies TraceRecord).catch(() => undefined);

  outputJson({
    ok: true,
    root,
    intent: "project_change_plan_discussion",
    answer: `已根据当前计划文档和你的消息更新项目变更计划。当前版本决策：${nextModel.currentVersion} -> ${nextModel.nextVersion} (${nextModel.bump})。`,
    guidance: "计划 / 甘特图页面会继续从 docs/project/project-change-plan.md 和 HTML 投影读取项目变更、开发计划、进度和预期 changelog。",
    documentEdits,
    artifactPaths: [PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH, PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH],
    markdownRelativePath: documents.markdownRelativePath,
    htmlRelativePath: documents.htmlRelativePath,
    model: documents.model,
    provider: {
      taskType: "project.change_plan.discuss",
      provider: "configured",
      model: "project-change-plan-agent"
    }
  });
}

async function commandProjectChangePlanApprove(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const documents = await approveProjectChangePlan(root);
  await appendTrace(root, {
    id: `trace-event:project-change-plan-approve:${Date.now()}`,
    traceId: `trace:project-change-plan-approve:${Date.now()}`,
    timestamp: generatedAt,
    kind: "project.change_plan.approved",
    target: { type: "project", id: "project:root" },
    summary: "User verified project change items and moved the docs-first plan into development stage.",
    data: {
      markdownPath: documents.markdownRelativePath,
      htmlPath: documents.htmlRelativePath,
      status: documents.model?.status,
      nextVersion: documents.model?.nextVersion
    }
  } satisfies TraceRecord).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    ...documents
  });
}

async function commandReviewFindingPlan(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const findingId = required(args, "finding");
  const generatedAt = new Date().toISOString();
  const reviewDocuments = await readQualityReviewDocumentModel(root);
  if (!reviewDocuments) {
    throw new Error(`Missing ${QUALITY_REVIEW_DOC_RELATIVE_PATH}. Run review-run before creating a project change item from a review finding.`);
  }
  const finding = reviewDocuments.findings.find((item) => item.id === findingId);
  if (!finding) {
    throw new Error(`Review finding not found: ${findingId}`);
  }
  const issue = reviewDocuments.documents.issues.find((item) => item.findingId === finding.id);
  const category = reviewDocuments.documents.categories.find((item) => item.category === finding.category);
  const documents = await upsertReviewFindingChangeItem({
    root,
    finding,
    issueDocPath: issue?.docPath,
    issueHtmlPath: issue?.htmlPath,
    categoryDocPath: category?.docPath,
    categoryHtmlPath: category?.htmlPath,
    generatedAt
  });
  const changeItemId = reviewFindingChangeItemId(finding.id);
  await appendTrace(root, {
    id: `trace-event:review-finding-plan:${Date.now()}`,
    traceId: `trace:review-finding-plan:${Date.now()}`,
    timestamp: generatedAt,
    kind: "review.finding.project_change_created",
    target: { type: "finding", id: finding.id },
    summary: "Review Queue finding was converted into a docs-backed project change plan item.",
    data: {
      findingId: finding.id,
      changeItemId,
      severity: finding.severity,
      category: finding.category,
      planMarkdownPath: documents.markdownRelativePath,
      planHtmlPath: documents.htmlRelativePath,
      issueDocPath: issue?.docPath
    }
  } satisfies TraceRecord).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    findingId: finding.id,
    changeItemId,
    message: "Review finding linked into docs/project/project-change-plan.md.",
    ...documents
  });
}

async function commandReviewFindingDiscuss(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const findingId = required(args, "finding");
  const message = required(args, "message").trim();
  const generatedAt = new Date().toISOString();
  const conversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));
  const reviewDocuments = await readQualityReviewDocumentModel(root);
  if (!reviewDocuments) {
    throw new Error(`Missing ${QUALITY_REVIEW_DOC_RELATIVE_PATH}. Run review-run before discussing a review finding.`);
  }
  const finding = reviewDocuments.findings.find((item) => item.id === findingId);
  if (!finding) {
    throw new Error(`Review finding not found: ${findingId}`);
  }
  const issue = reviewDocuments.documents.issues.find((item) => item.findingId === finding.id);
  const category = reviewDocuments.documents.categories.find((item) => item.category === finding.category);
  const context = await buildReviewFindingDiscussionContext(root, finding, issue, category);
  const result = await callReviewFindingDiscussionAgent(root, message, context, generatedAt, conversationHistory);
  const documentEdits: DiagramDocumentEditResult[] = [];
  const artifactPaths = [
    QUALITY_REVIEW_DOC_RELATIVE_PATH,
    QUALITY_REVIEW_HTML_RELATIVE_PATH,
    issue?.docPath,
    issue?.htmlPath,
    category?.docPath,
    category?.htmlPath,
    ...result.discussion.referencedDocuments
  ].filter((item): item is string => Boolean(item)).map(normalizeProjectRelativePath);
  let changeItemId: string | undefined;
  let planDocuments: Awaited<ReturnType<typeof upsertReviewFindingChangeItem>> | undefined;
  let statusUpdate: {
    findingId: string;
    status: ReviewFinding["status"];
    reason: string;
    regressionMarkdownPath?: string;
    regressionHtmlPath?: string;
  } | undefined;
  const shouldCreatePlan =
    result.discussion.intent === "create_project_change" ||
    result.discussion.planAction.shouldCreateOrUpdate;
  const shouldUpdateFindingStatus =
    result.discussion.intent === "mark_finding_false_positive" ||
    result.discussion.statusDecision.shouldUpdate;

  if (shouldCreatePlan) {
    planDocuments = await upsertReviewFindingChangeItem({
      root,
      finding,
      issueDocPath: issue?.docPath,
      issueHtmlPath: issue?.htmlPath,
      categoryDocPath: category?.docPath,
      categoryHtmlPath: category?.htmlPath,
      generatedAt
    });
    changeItemId = reviewFindingChangeItemId(finding.id);
    artifactPaths.push(planDocuments.markdownRelativePath, planDocuments.htmlRelativePath);
    documentEdits.push(
      {
        path: planDocuments.markdownRelativePath,
        operation: "replace_document",
        status: "applied",
        changed: true,
        message: `已创建或更新项目变更项 ${changeItemId}。`,
        reason: result.discussion.planAction.reason || "Review finding discussion requested a docs-backed project change item."
      },
      {
        path: planDocuments.htmlRelativePath,
        operation: "replace_document",
        status: "applied",
        changed: true,
        message: "已同步更新计划 HTML 投影。",
        reason: "Plan / Gantt view renders this document projection."
      }
    );
  }

  if (shouldUpdateFindingStatus) {
    const decision = result.discussion.statusDecision;
    if (decision.status === "false_positive" && (!decision.reason.trim() || !decision.evidenceSummary.trim())) {
      throw new Error("Review Agent must provide reason and evidenceSummary before marking a finding as false_positive.");
    }
    const regressionDocs = result.discussion.regressionAction.shouldCreate
      ? await writeReviewFindingRegressionRecord({
        root,
        finding,
        decision,
        regression: result.discussion.regressionAction,
        generatedAt
      })
      : undefined;
    const updatedFindings = reviewDocuments.findings.map((item): ReviewFinding => {
      if (item.id !== finding.id) return item;
      const decisionEvidence: ReviewEvidenceRef = {
        source: "agent",
        path: regressionDocs?.markdownPath ?? issue?.docPath ?? QUALITY_REVIEW_DOC_RELATIVE_PATH,
        summary: decision.evidenceSummary || decision.reason
      };
      return ReviewFindingSchema.parse({
        ...item,
        status: decision.status,
        confidence: decision.status === "false_positive" ? "high" : item.confidence,
        suggestedAction: decision.updatedSuggestedAction || item.suggestedAction,
        evidence: [...item.evidence, decisionEvidence],
        traceIds: unique([...item.traceIds, `trace:review-finding-discussion:${finding.id}:${Date.now()}`]),
        updatedAt: generatedAt
      } satisfies ReviewFinding);
    });
    const updatedRun = ReviewRunSchema.parse({
      ...reviewDocuments.run,
      findingIds: updatedFindings.map((item) => item.id),
      evaluatorResults: completeReviewEvaluatorResults(updatedFindings, reviewDocuments.run.evaluatorResults ?? [], undefined, root),
      summary: buildReviewRunSummary(updatedFindings)
    } satisfies ReviewRun);
    const reviewDocs = await writeQualityReviewDocuments({
      root,
      run: updatedRun,
      findings: updatedFindings,
      categoryOrder: reviewDocuments.categoryOrder
    });
    artifactPaths.push(
      reviewDocs.rootDocPath,
      reviewDocs.rootHtmlPath,
      ...reviewDocs.categoryDocuments.map((item) => item.docPath),
      ...reviewDocs.categoryDocuments.map((item) => item.htmlPath),
      ...reviewDocs.issueDocuments.map((item) => item.docPath),
      ...reviewDocs.issueDocuments.map((item) => item.htmlPath)
    );
    if (regressionDocs) artifactPaths.push(regressionDocs.markdownPath, regressionDocs.htmlPath);
    documentEdits.push(
      {
        path: QUALITY_REVIEW_DOC_RELATIVE_PATH,
        operation: "replace_document",
        status: "applied",
        changed: true,
        message: `已将 ${finding.id} 更新为 ${decision.status}。`,
        reason: decision.reason
      },
      {
        path: QUALITY_REVIEW_HTML_RELATIVE_PATH,
        operation: "replace_document",
        status: "applied",
        changed: true,
        message: "已同步更新评审 HTML 投影。",
        reason: "Review Queue renders docs/review HTML projection."
      }
    );
    if (regressionDocs) {
      documentEdits.push(
        {
          path: regressionDocs.markdownPath,
          operation: "replace_document",
          status: "applied",
          changed: true,
          message: "已写入评审理解纠偏/回归记录。",
          reason: result.discussion.regressionAction.reason
        },
        {
          path: regressionDocs.htmlPath,
          operation: "replace_document",
          status: "applied",
          changed: true,
          message: "已同步写入评审回归 HTML 投影。",
          reason: result.discussion.regressionAction.reason
        }
      );
    }
    statusUpdate = {
      findingId: finding.id,
      status: decision.status,
      reason: decision.reason,
      regressionMarkdownPath: regressionDocs?.markdownPath,
      regressionHtmlPath: regressionDocs?.htmlPath
    };
  }

  await appendTrace(root, {
    id: `trace-event:review-finding-discussion:${Date.now()}`,
    traceId: `trace:review-finding-discussion:${Date.now()}`,
    timestamp: generatedAt,
    kind: shouldCreatePlan
      ? "review.finding.project_change_requested"
      : statusUpdate
        ? "review.finding.status_updated_by_agent"
        : "review.finding.discussion.completed",
    target: { type: "finding", id: finding.id },
    summary: "Review Queue Agent handled a selected finding through the shared scoped agent runtime.",
    data: {
      findingId: finding.id,
      category: finding.category,
      severity: finding.severity,
      intent: result.discussion.intent,
      shouldCreatePlan,
      changeItemId,
      statusUpdate,
      regressionAction: result.discussion.regressionAction,
      issueDocPath: issue?.docPath,
      planMarkdownPath: planDocuments?.markdownRelativePath,
      planHtmlPath: planDocuments?.htmlRelativePath
    }
  } satisfies TraceRecord).catch(() => undefined);

  outputJson({
    ok: true,
    root,
    findingId: finding.id,
    changeItemId,
    intent: result.discussion.intent,
    answer: result.discussion.answer,
    guidance: result.discussion.guidance,
    referencedDocuments: result.discussion.referencedDocuments,
    planAction: result.discussion.planAction,
    statusDecision: result.discussion.statusDecision,
    regressionAction: result.discussion.regressionAction,
    statusUpdate,
    risks: result.discussion.risks,
    questions: result.discussion.questions,
    documentEdits,
    artifactPaths: unique(artifactPaths),
    provider: result.providerSummary
  });
}

async function writeReviewFindingRegressionRecord(input: {
  root: string;
  finding: ReviewFinding;
  decision: ReviewFindingStatusDecision;
  regression: ReviewFindingRegressionAction;
  generatedAt: string;
}): Promise<{ markdownPath: string; htmlPath: string }> {
  const fileBase = `${safeFilePart(input.finding.id)}-${safeFilePart(input.generatedAt)}`;
  const markdownPath = `docs/review/regressions/${fileBase}.md`;
  const htmlPath = `docs/review/regressions/${fileBase}.html`;
  const affectedCategories = input.regression.affectedCategories.length
    ? input.regression.affectedCategories
    : [input.finding.category];
  const affectedFindingIds = input.regression.affectedFindingIds.length
    ? input.regression.affectedFindingIds
    : [input.finding.id];
  const markdown = [
    `# 评审理解纠偏：${input.finding.title}`,
    "",
    "这份文档记录一次由 Review Agent 自主复核后产生的评审判伪/回归事件。它不是用户手工关闭问题，而是 agent 基于证据纠正项目理解后的文档化结论。",
    "",
    "## 判伪对象",
    "",
    `- Finding ID：${input.finding.id}`,
    `- 原评审项：${input.finding.category}`,
    `- 原严重级别：${input.finding.severity}`,
    `- 新状态：${input.decision.status}`,
    `- 更新时间：${input.generatedAt}`,
    "",
    "## 判定理由",
    "",
    input.decision.reason,
    "",
    "## 证据摘要",
    "",
    input.decision.evidenceSummary || "本次 agent 没有输出额外证据摘要。",
    "",
    "## 纠正后的项目理解",
    "",
    input.regression.correctedUnderstanding || "本次判定没有声明新的项目理解纠偏。",
    "",
    "## 回归影响面",
    "",
    `- 影响评审分类：${affectedCategories.join(", ")}`,
    `- 可能受影响 finding：${affectedFindingIds.join(", ")}`,
    `- 建议回归范围：${input.regression.recommendedReviewScope || "重新运行或复核同分类评审项。"}`,
    "",
    "## 后续建议动作",
    "",
    input.decision.updatedSuggestedAction || "该 finding 已由 agent 判定为不成立；后续应避免基于同一错误理解继续生成评审项。",
    ""
  ].join("\n");
  const html = [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    `  <title>${escapeReviewHtml(`评审理解纠偏：${input.finding.title}`)}</title>`,
    "  <style>",
    "    body { margin: 0; background: #0b1118; color: #d8e7f7; font: 14px/1.6 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    "    main { padding: 24px; }",
    "    section { border: 1px solid #24364a; border-radius: 8px; padding: 16px; margin: 0 0 14px; background: #101923; }",
    "    h1, h2, p { margin: 0 0 8px; }",
    "    code { background: #071019; border: 1px solid #26394d; border-radius: 6px; padding: 2px 5px; }",
    "  </style>",
    "</head>",
    "<body>",
    "<main>",
    `<section><p>Praxis Review Regression</p><h1>${escapeReviewHtml(`评审理解纠偏：${input.finding.title}`)}</h1><p>由 Review Agent 基于证据复核后写入。</p></section>`,
    `<section><h2>判伪对象</h2><p><code>${escapeReviewHtml(input.finding.id)}</code> · ${escapeReviewHtml(input.finding.category)} · ${escapeReviewHtml(input.finding.severity)} · ${escapeReviewHtml(input.decision.status)}</p></section>`,
    `<section><h2>判定理由</h2><p>${escapeReviewHtml(input.decision.reason)}</p></section>`,
    `<section><h2>证据摘要</h2><p>${escapeReviewHtml(input.decision.evidenceSummary || "本次 agent 没有输出额外证据摘要。")}</p></section>`,
    `<section><h2>纠正后的项目理解</h2><p>${escapeReviewHtml(input.regression.correctedUnderstanding || "本次判定没有声明新的项目理解纠偏。")}</p></section>`,
    `<section><h2>回归影响面</h2><p>影响评审分类：${escapeReviewHtml(affectedCategories.join(", "))}</p><p>可能受影响 finding：${escapeReviewHtml(affectedFindingIds.join(", "))}</p><p>建议回归范围：${escapeReviewHtml(input.regression.recommendedReviewScope || "重新运行或复核同分类评审项。")}</p></section>`,
    `<section><h2>后续建议动作</h2><p>${escapeReviewHtml(input.decision.updatedSuggestedAction || "该 finding 已由 agent 判定为不成立；后续应避免基于同一错误理解继续生成评审项。")}</p></section>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
  await mkdir(path.join(input.root, "docs", "review", "regressions"), { recursive: true });
  await writeFile(path.join(input.root, markdownPath), markdown, "utf8");
  await writeFile(path.join(input.root, htmlPath), html, "utf8");
  return { markdownPath, htmlPath };
}

function escapeReviewHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function commandDesignDiscover(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const candidatePath = typeof args.candidate === "string" ? args.candidate : undefined;
  const progressRunId = typeof args["run-id"] === "string" && args["run-id"].trim()
    ? args["run-id"].trim()
    : `design-discovery:${Date.now()}`;
  const generatedAt = new Date().toISOString();
  const result = await runDesignDiscoveryWorkflow({
    root,
    args,
    candidatePath,
    progressRunId,
    generatedAt
  }, {
    readJson,
    readCodeFacts: (filePath) => readJsonWithSchema(filePath, CodeFactGraphSnapshotSchema),
    readOrBuildCodeFacts,
    readAllMemoryRecords,
    callDesignDiscoveryAgent,
    buildAndWriteCodeUnderstandingSpineForCodeFacts,
    codeUnderstandingSpineDigest,
    writeDesignDiscoveryProgress,
    projectRelativePath,
    writeInteractionModelCandidate,
    writeDesignUseCaseProjectionViews,
    appendChange,
    appendTrace
  });
  const modelRegistryDocuments = await writeUmlModelRegistryDocuments(root).catch(() => undefined);
  await maybeWriteJsonWithSchema(args, "out", result.model, InteractionModelCandidateSchema);
  outputJson({
    ...result.output,
    modelRegistryDocPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.markdownPath) : undefined,
    modelRegistryHtmlPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.htmlPath) : undefined
  });
}

async function commandModelsDiscover(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const registry = await buildUmlModelRegistry(root, generatedAt);
  const documents = await writeUmlModelRegistryDocuments(root, registry);
  await appendTrace(root, {
    id: `trace-event:uml-model-registry:${Date.now()}`,
    traceId: `trace:uml-model-registry:${Date.now()}`,
    timestamp: generatedAt,
    kind: "uml_model.registry.completed",
    target: { type: "project", id: "project:root" },
    summary: "UML Model Registry organized existing design, engineering and architecture projections as Model / Package / Diagram / Trace.",
    data: {
      markdownPath: projectRelativePath(root, documents.markdownPath),
      htmlPath: projectRelativePath(root, documents.htmlPath),
      modelCount: registry.summary.modelCount,
      packageCount: registry.summary.packageCount,
      diagramCount: registry.summary.diagramCount,
      traceCount: registry.summary.traceCount
    }
  } satisfies TraceRecord).catch(() => undefined);
  await appendChange(root, {
    title: "UML Model Registry persisted",
    summary: `Persisted ${registry.summary.modelCount} UML Model(s), ${registry.summary.packageCount} Package group(s), ${registry.summary.diagramCount} Diagram projection(s), and ${registry.summary.traceCount} Trace/Refine link(s).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    generatedAt,
    modelRegistryDocPath: projectRelativePath(root, documents.markdownPath),
    modelRegistryHtmlPath: projectRelativePath(root, documents.htmlPath),
    summary: registry.summary,
    rootHtmlPath: UML_MODEL_ROOT_HTML_RELATIVE_PATH
  });
}

async function commandEngineeringDiscover(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const codeFacts = args["code-facts"]
    ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
    : await readOrBuildCodeFacts(root, args);
  const { spine, documents: spineDocuments } = await buildAndWriteCodeUnderstandingSpineForCodeFacts(root, codeFacts, generatedAt);
  const model = await buildEngineeringComplexityModel(root, codeFacts, generatedAt, spine);
  const documents = await writeEngineeringComplexityDocuments(root, model);
  const modelRegistryDocuments = await writeUmlModelRegistryDocuments(root).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:engineering-discovery:${Date.now()}`,
    traceId: `trace:engineering-discovery:${Date.now()}`,
    timestamp: generatedAt,
    kind: "engineering.discovery.completed",
    target: { type: "project", id: "project:root" },
    summary: "Engineering Discovery produced technical complexity map documents.",
    data: {
      markdownPath: projectRelativePath(root, documents.markdownPath),
      htmlPath: projectRelativePath(root, documents.htmlPath),
      compatibilityMarkdownPath: projectRelativePath(root, documents.compatibilityMarkdownPath),
      compatibilityHtmlPath: projectRelativePath(root, documents.compatibilityHtmlPath),
      modelRegistryMarkdownPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.markdownPath) : undefined,
      modelRegistryHtmlPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.htmlPath) : undefined,
      codeUnderstandingSpineMarkdownPath: projectRelativePath(root, spineDocuments.markdownPath),
      codeUnderstandingSpineJsonPath: projectRelativePath(root, spineDocuments.jsonPath),
      diagramDocumentCount: documents.diagramDocumentCount,
      packageCount: model.summary.packageCount,
      componentCount: model.summary.componentCount,
      runtimeFlowCount: model.summary.runtimeFlowCount,
      deploymentNodeCount: model.summary.deploymentNodeCount,
      hotspotCount: model.summary.hotspotCount
    }
  } satisfies TraceRecord).catch(() => undefined);
  await appendChange(root, {
    title: "Engineering complexity map persisted",
    summary: `Persisted ${model.summary.packageCount} package/module item(s), ${model.summary.componentCount} component item(s), ${model.summary.runtimeFlowCount} runtime flow item(s), ${model.summary.deploymentNodeCount} deployment/runtime node(s), and ${model.summary.hotspotCount} technical hotspot(s).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    generatedAt,
    engineeringMapDocPath: projectRelativePath(root, documents.markdownPath),
    engineeringMapHtmlPath: projectRelativePath(root, documents.htmlPath),
    compatibilityMapDocPath: projectRelativePath(root, documents.compatibilityMarkdownPath),
    compatibilityMapHtmlPath: projectRelativePath(root, documents.compatibilityHtmlPath),
    modelRegistryDocPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.markdownPath) : undefined,
    modelRegistryHtmlPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.htmlPath) : undefined,
    codeUnderstandingSpineDocPath: projectRelativePath(root, spineDocuments.markdownPath),
    codeUnderstandingSpineJsonPath: projectRelativePath(root, spineDocuments.jsonPath),
    diagramDocumentCount: documents.diagramDocumentCount,
    summary: model.summary,
    source: model.source
  });
}

async function commandEngineeringDiagramDiscuss(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const message = required(args, "message").trim();
  const documentPath = stringArg(args, "document-path") ?? ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH;
  const documentTitle = stringArg(args, "document-title");
  const generatedAt = new Date().toISOString();
  const conversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));
  const currentDiagram = await buildEngineeringDiagramDiscussionContext(root, documentPath, documentTitle, stringArg(args, "selected-anchor"), message, args);
  const result = await callEngineeringDiagramDiscussionAgent(root, message, currentDiagram, generatedAt, conversationHistory);
  const documentEdits = await applyDiagramDocumentEdits(root, result.discussion.documentEdits, ["docs/engineering"]);
  await appendTrace(root, {
    id: `trace-event:engineering-diagram-discussion:${Date.now()}`,
    traceId: `trace:engineering-diagram-discussion:${Date.now()}`,
    timestamp: generatedAt,
    kind: "engineering.diagram_discussion.completed",
    target: { type: "project", id: "project:root" },
    summary: "Engineering Diagram Discussion answered within the technical complexity boundary.",
    data: {
      documentPath: currentDiagram.currentDocumentPath,
      selectedAnchor: currentDiagram.selectedAnchor,
      intent: result.discussion.intent,
      technicalPerspective: result.discussion.technicalPerspective,
      documentEdits,
      provider: result.providerSummary
    }
  } satisfies TraceRecord).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    documentPath: currentDiagram.currentDocumentPath,
    intent: result.discussion.intent,
    answer: result.discussion.answer,
    guidance: result.discussion.guidance,
    technicalPerspective: result.discussion.technicalPerspective,
    referencedAnchors: result.discussion.referencedAnchors,
    suggestedDrilldowns: result.discussion.suggestedDrilldowns,
    documentEdits,
    risks: result.discussion.risks,
    questions: result.discussion.questions,
    provider: result.providerSummary
  });
}

async function commandArchitectureDiscover(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const generatedAt = new Date().toISOString();
  const codeFacts = args["code-facts"]
    ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
    : await readOrBuildCodeFacts(root, args);
  const { spine, documents: spineDocuments } = await buildAndWriteCodeUnderstandingSpineForCodeFacts(root, codeFacts, generatedAt);
  const model = await buildArchitectureC4Model(root, codeFacts, generatedAt, spine);
  const documents = await writeArchitectureC4Documents(root, model);
  const modelRegistryDocuments = await writeUmlModelRegistryDocuments(root).catch(() => undefined);
  await appendTrace(root, {
    id: `trace-event:architecture-c4-discovery:${Date.now()}`,
    traceId: `trace:architecture-c4-discovery:${Date.now()}`,
    timestamp: generatedAt,
    kind: "architecture.c4_discovery.completed",
    target: { type: "project", id: "project:root" },
    summary: "Architecture Explorer produced code-first C4 model documents from the shared discovery spine.",
    data: {
      markdownPath: projectRelativePath(root, documents.markdownPath),
      htmlPath: projectRelativePath(root, documents.htmlPath),
      modelRegistryMarkdownPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.markdownPath) : undefined,
      modelRegistryHtmlPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.htmlPath) : undefined,
      codeUnderstandingSpineMarkdownPath: projectRelativePath(root, spineDocuments.markdownPath),
      codeUnderstandingSpineJsonPath: projectRelativePath(root, spineDocuments.jsonPath),
      diagramDocumentCount: documents.diagramDocumentCount,
      systemContextCount: model.summary.systemContextCount,
      containerCount: model.summary.containerCount,
      componentViewCount: model.summary.componentViewCount,
      codeViewCount: model.summary.codeViewCount
    }
  } satisfies TraceRecord).catch(() => undefined);
  await appendChange(root, {
    title: "Architecture C4 model persisted",
    summary: `Persisted ${model.summary.systemContextCount} system context, ${model.summary.containerCount} container, ${model.summary.componentViewCount} component, and ${model.summary.codeViewCount} code view document(s).`,
    kind: "CANDIDATE"
  }).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    generatedAt,
    architectureMapDocPath: projectRelativePath(root, documents.markdownPath),
    architectureMapHtmlPath: projectRelativePath(root, documents.htmlPath),
    modelRegistryDocPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.markdownPath) : undefined,
    modelRegistryHtmlPath: modelRegistryDocuments ? projectRelativePath(root, modelRegistryDocuments.htmlPath) : undefined,
    codeUnderstandingSpineDocPath: projectRelativePath(root, spineDocuments.markdownPath),
    codeUnderstandingSpineJsonPath: projectRelativePath(root, spineDocuments.jsonPath),
    diagramDocumentCount: documents.diagramDocumentCount,
    summary: model.summary,
    source: model.source
  });
}

async function commandArchitectureDiagramDiscuss(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const message = required(args, "message").trim();
  const documentPath = stringArg(args, "document-path") ?? ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH;
  const documentTitle = stringArg(args, "document-title");
  const generatedAt = new Date().toISOString();
  const conversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));
  const currentDiagram = await buildArchitectureDiagramDiscussionContext(root, documentPath, documentTitle, stringArg(args, "selected-anchor"), message, args);
  const result = await callArchitectureDiagramDiscussionAgent(root, message, currentDiagram, generatedAt, conversationHistory);
  const documentEdits = await applyDiagramDocumentEdits(root, result.discussion.documentEdits, ["docs/architecture"]);
  await appendTrace(root, {
    id: `trace-event:architecture-diagram-discussion:${Date.now()}`,
    traceId: `trace:architecture-diagram-discussion:${Date.now()}`,
    timestamp: generatedAt,
    kind: "architecture.diagram_discussion.completed",
    target: { type: "project", id: "project:root" },
    summary: "Architecture Diagram Discussion answered within the C4 architecture boundary.",
    data: {
      documentPath: currentDiagram.currentDocumentPath,
      selectedAnchor: currentDiagram.selectedAnchor,
      intent: result.discussion.intent,
      architecturePerspective: result.discussion.architecturePerspective,
      documentEdits,
      provider: result.providerSummary
    }
  } satisfies TraceRecord).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    documentPath: currentDiagram.currentDocumentPath,
    intent: result.discussion.intent,
    answer: result.discussion.answer,
    guidance: result.discussion.guidance,
    architecturePerspective: result.discussion.architecturePerspective,
    referencedAnchors: result.discussion.referencedAnchors,
    suggestedDrilldowns: result.discussion.suggestedDrilldowns,
    documentEdits,
    risks: result.discussion.risks,
    questions: result.discussion.questions,
    provider: result.providerSummary
  });
}

async function buildEngineeringDiagramDiscussionContext(
  root: string,
  documentPath: string,
  documentTitle: string | undefined,
  selectedAnchorJson: string | undefined,
  userMessage = "",
  args: Args = {}
): Promise<EngineeringDiagramDiscussionContext> {
  const normalizedDocumentPath = normalizeProjectRelativePath(documentPath);
  const markdownPath = normalizedDocumentPath.endsWith(".html")
    ? normalizedDocumentPath.replace(/\.html$/i, ".md")
    : normalizedDocumentPath;
  const htmlPath = normalizedDocumentPath.endsWith(".md")
    ? normalizedDocumentPath.replace(/\.md$/i, ".html")
    : normalizedDocumentPath;
  const [html, markdown, rootMap] = await Promise.all([
    readProjectTextIfExists(root, htmlPath),
    readProjectTextIfExists(root, markdownPath),
    readProjectTextIfExists(root, ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH)
  ]);
  const selectedAnchor = selectedAnchorJson ? safeJson(selectedAnchorJson) : undefined;
  const currentDocumentPath = html || !markdown ? htmlPath : markdownPath;
  const repositoryEvidence = await buildGenericDiagramRepositoryEvidenceContext(root, args, {
    userMessage,
    currentDocumentTitle: documentTitle,
    currentDocumentPath,
    currentDocumentHtmlExcerpt: html,
    currentDocumentMarkdownExcerpt: markdown,
    mapIndexExcerpt: rootMap,
    selectedAnchor
  });
  return {
    schemaVersion: "praxis.engineeringDiagramContext.v1",
    rootMapPath: ENGINEERING_ROOT_MAP_HTML_RELATIVE_PATH,
    currentDocumentPath,
    currentDocumentTitle: documentTitle,
    currentDocumentHtmlExcerpt: compactText(html, 16_000),
    currentDocumentMarkdownExcerpt: compactText(markdown, 16_000),
    mapIndexExcerpt: compactText(rootMap, 12_000),
    repositoryEvidence,
    selectedAnchor
  };
}

async function buildArchitectureDiagramDiscussionContext(
  root: string,
  documentPath: string,
  documentTitle: string | undefined,
  selectedAnchorJson: string | undefined,
  userMessage = "",
  args: Args = {}
): Promise<ArchitectureDiagramDiscussionContext> {
  const normalizedDocumentPath = normalizeProjectRelativePath(documentPath);
  const markdownPath = normalizedDocumentPath.endsWith(".html")
    ? normalizedDocumentPath.replace(/\.html$/i, ".md")
    : normalizedDocumentPath;
  const htmlPath = normalizedDocumentPath.endsWith(".md")
    ? normalizedDocumentPath.replace(/\.md$/i, ".html")
    : normalizedDocumentPath;
  const [html, markdown, rootMap] = await Promise.all([
    readProjectTextIfExists(root, htmlPath),
    readProjectTextIfExists(root, markdownPath),
    readProjectTextIfExists(root, ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH)
  ]);
  const selectedAnchor = selectedAnchorJson ? safeJson(selectedAnchorJson) : undefined;
  const currentDocumentPath = html || !markdown ? htmlPath : markdownPath;
  const repositoryEvidence = await buildGenericDiagramRepositoryEvidenceContext(root, args, {
    userMessage,
    currentDocumentTitle: documentTitle,
    currentDocumentPath,
    currentDocumentHtmlExcerpt: html,
    currentDocumentMarkdownExcerpt: markdown,
    mapIndexExcerpt: rootMap,
    selectedAnchor
  });
  return {
    schemaVersion: "praxis.architectureDiagramContext.v1",
    rootMapPath: ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH,
    currentDocumentPath,
    currentDocumentTitle: documentTitle,
    currentDocumentHtmlExcerpt: compactText(html, 16_000),
    currentDocumentMarkdownExcerpt: compactText(markdown, 16_000),
    mapIndexExcerpt: compactText(rootMap, 12_000),
    repositoryEvidence,
    selectedAnchor
  };
}

async function readProjectTextIfExists(root: string, relativePath: string): Promise<string> {
  try {
    return await readFile(path.join(root, normalizeProjectRelativePath(relativePath)), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return "";
    throw error;
  }
}

function normalizeProjectRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n...[truncated ${value.length - maxLength} chars]`;
}

function parseScopedAgentConversationHistory(raw: string | undefined): ScopedAgentConversationHistoryEntry[] {
  if (!raw) return [];
  const parsed = safeJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const id = stringValue(record.id);
    const role = record.role === "user" || record.role === "assistant" || record.role === "system" ? record.role : undefined;
    const text = stringValue(record.text);
    const timestamp = stringValue(record.timestamp);
    const scopeId = stringValue(record.scopeId);
    const scopeTitle = stringValue(record.scopeTitle);
    if (!id || !role || !text || !timestamp || !scopeId || !scopeTitle) return [];
    return [{
      id,
      role,
      text: compactText(text, 4000),
      timestamp,
      scopeId,
      scopeTitle,
      scopeKind: stringValue(record.scopeKind),
      contextTitle: stringValue(record.contextTitle),
      contextPath: stringValue(record.contextPath),
      intent: stringValue(record.intent),
      status: stringValue(record.status)
    }];
  });
}

async function callEngineeringDiagramDiscussionAgent(
  root: string,
  userMessage: string,
  currentDiagram: EngineeringDiagramDiscussionContext,
  generatedAt: string,
  conversationHistory: ScopedAgentConversationHistoryEntry[] = []
): Promise<{ discussion: EngineeringDiagramDiscussionResult; providerSummary: Record<string, unknown> }> {
  const config = await loadModelConfig(root);
  const taskType = "engineering.diagram_discussion";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.engineeringDiagramDiscussionRequest.v1",
    root,
    generatedAt,
    userMessage,
    conversationHistory: conversationHistory.slice(-24),
    currentDiagram,
    policy: {
      pageMode: "engineering_explorer",
      allowedScope: "technical_complexity_only",
      redirectBusinessStoryQuestionsToDesignExplorer: true,
      doNotWriteFiles: false,
      documentWritesAllowed: true,
      allowedWriteRoots: ["docs/engineering"],
      documentEditProtocol: ["replace_text", "replace_between_markers", "append_section", "replace_document"],
      proposedOperationsAreCandidatesOnly: false,
      doNotGenerateSourceCode: true,
      keepFactsAndInferencesSeparated: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("engineering-diagram-discussion").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  return {
    discussion: parseEngineeringDiagramDiscussionResult(response.content),
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function callArchitectureDiagramDiscussionAgent(
  root: string,
  userMessage: string,
  currentDiagram: ArchitectureDiagramDiscussionContext,
  generatedAt: string,
  conversationHistory: ScopedAgentConversationHistoryEntry[] = []
): Promise<{ discussion: ArchitectureDiagramDiscussionResult; providerSummary: Record<string, unknown> }> {
  const config = await loadModelConfig(root);
  const taskType = "architecture.diagram_discussion";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.architectureDiagramDiscussionRequest.v1",
    root,
    generatedAt,
    userMessage,
    conversationHistory: conversationHistory.slice(-24),
    currentDiagram,
    policy: {
      pageMode: "architecture_explorer",
      allowedScope: "c4_architecture_only",
      redirectBusinessStoryQuestionsToDesignExplorer: true,
      redirectTechnicalComplexityQuestionsToEngineeringExplorer: true,
      doNotWriteFiles: false,
      documentWritesAllowed: true,
      allowedWriteRoots: ["docs/architecture"],
      documentEditProtocol: ["replace_text", "replace_between_markers", "append_section", "replace_document"],
      proposedOperationsAreCandidatesOnly: false,
      doNotGenerateSourceCode: true,
      keepFactsAndInferencesSeparated: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("architecture-c4-discussion").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  return {
    discussion: parseArchitectureDiagramDiscussionResult(response.content),
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function buildReviewFindingDiscussionContext(
  root: string,
  finding: ReviewFinding,
  issue: { docPath?: string; htmlPath?: string } | undefined,
  category: { category?: string; docPath?: string; htmlPath?: string } | undefined
): Promise<ReviewFindingDiscussionContext> {
  const [rootReviewExcerpt, issueExcerpt, categoryExcerpt, plan] = await Promise.all([
    readProjectTextIfExists(root, QUALITY_REVIEW_DOC_RELATIVE_PATH).then((content) => compactText(content, 12_000)),
    issue?.docPath
      ? readProjectTextIfExists(root, issue.docPath).then((content) => compactText(content, 10_000))
      : Promise.resolve(""),
    category?.docPath
      ? readProjectTextIfExists(root, category.docPath).then((content) => compactText(content, 10_000))
      : Promise.resolve(""),
    readProjectChangePlan(root).catch(() => undefined)
  ]);
  const relatedChangeItemId = reviewFindingChangeItemId(finding.id);
  const relatedChangeItem = plan?.model?.changeItems.find((item) => item.id === relatedChangeItemId);
  return {
    schemaVersion: "praxis.reviewFindingDiscussionContext.v1",
    rootReviewPath: QUALITY_REVIEW_DOC_RELATIVE_PATH,
    rootReviewHtmlPath: QUALITY_REVIEW_HTML_RELATIVE_PATH,
    finding,
    issueDocument: issue ? {
      docPath: issue.docPath,
      htmlPath: issue.htmlPath,
      excerpt: issueExcerpt
    } : undefined,
    categoryDocument: category ? {
      category: category.category,
      docPath: category.docPath,
      htmlPath: category.htmlPath,
      excerpt: categoryExcerpt
    } : undefined,
    rootReviewExcerpt,
    projectChangePlan: plan ? {
      exists: plan.exists,
      stale: plan.stale,
      markdownRelativePath: plan.markdownRelativePath,
      htmlRelativePath: plan.htmlRelativePath,
      relatedChangeItemId,
      relatedChangeItemStatus: relatedChangeItem?.status
    } : undefined
  };
}

async function callReviewFindingDiscussionAgent(
  root: string,
  userMessage: string,
  context: ReviewFindingDiscussionContext,
  generatedAt: string,
  conversationHistory: ScopedAgentConversationHistoryEntry[] = []
): Promise<{ discussion: ReviewFindingDiscussionResult; providerSummary: Record<string, unknown> }> {
  const config = await loadModelConfig(root);
  const taskType = "review.finding_discussion";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.reviewFindingDiscussionRequest.v1",
    root,
    generatedAt,
    userMessage,
    conversationHistory: conversationHistory.slice(-40),
    context,
    policy: {
      pageMode: "review_queue",
      allowedScope: "selected_review_finding_only",
      sharedAgentHistory: true,
      doNotEditSourceCode: true,
      doNotLetUserCloseFindingManually: true,
      allowAgentEvidenceBasedFalsePositiveDecision: true,
      falsePositiveDecisionMustUpdateReviewDocuments: true,
      regressionRecordRequiredWhenProjectUnderstandingChanges: true,
      projectChangePlanIsRequiredForFixes: true,
      runtimeOwnsPlanDocumentWrites: true,
      allowedWriteTargetsAfterDecision: [
        QUALITY_REVIEW_DOC_RELATIVE_PATH,
        QUALITY_REVIEW_HTML_RELATIVE_PATH,
        "docs/review/categories/**",
        "docs/review/issues/**",
        "docs/review/regressions/**",
        PROJECT_CHANGE_PLAN_DOC_RELATIVE_PATH,
        PROJECT_CHANGE_PLAN_HTML_RELATIVE_PATH
      ],
      reviewQueueIsProblemEvidenceNotImplementationWorkspace: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("review-finding-discussion").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  return {
    discussion: parseReviewFindingDiscussionResult(response.content),
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function callDesignDiscoveryAgent(
  root: string,
  codeFacts: CodeFactGraphSnapshot,
  memoryRecords: MemoryRecord[],
  args: Args,
  progress?: { runId: string; stage: string },
  codeUnderstandingSpine?: Record<string, unknown>
): Promise<{ model: InteractionModelCandidate; providerSummary: Record<string, unknown> }> {
  const generatedAt = new Date().toISOString();
  const config = await loadModelConfig(root);
  const taskType = "design.discovery.use_cases";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const codeFactDigest = designDiscoveryCodeFactDigest(codeFacts, args);
  const memoryDigest = designDiscoveryMemoryDigest(memoryRecords);
  const payload = {
    schemaVersion: "praxis.designDiscoveryUseCasesRequest.v1",
    root,
    generatedAt,
    instruction: typeof args.instruction === "string" ? args.instruction : "请为 Design Explorer 恢复中文候选业务故事和用例图模型。",
    outputSchema: "praxis.interactionModel.v1",
    codeFacts: codeFactDigest,
    codeUnderstandingSpine,
    memory: memoryDigest,
    projectionPolicy: {
      modelIsSourceOfTruth: true,
      useCaseDiagramIsProjection: true,
      doNotOutputMermaid: true,
      doNotMarkConfirmedWithoutUserEvidence: true,
      humanReadableLanguage: "zh-CN",
      keepTechnicalIdentifiersVerbatim: true,
      persistentDocuments: {
        map: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH],
        perUseCaseDirectory: DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH,
        perUseCaseDrilldowns: [
          `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/activity.md`,
          `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/sequences/<scenario>.md`,
          `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/state-machines/<state-object>.md`,
          `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/realization/class-collaboration.md`
        ]
      }
    }
  };
  if (progress) {
    await writeDesignDiscoveryProgress(root, progress.runId, progress.stage, "running", "已构造 Design Discovery 模型请求上下文。", {
      kind: "runtime_event",
      title: "构造模型请求",
      metadata: [
        `selected code facts: ${String(codeFactDigest.selectedCount ?? 0)}`,
        `spine behavior slices: ${String(readNestedNumber(codeUnderstandingSpine, ["summary", "behaviorSliceCount"]) ?? 0)}`,
        `spine unknown gaps: ${String(readNestedNumber(codeUnderstandingSpine, ["summary", "unknownGapCount"]) ?? 0)}`,
        `selected memory: ${String(memoryDigest.selectedCount ?? 0)}`,
        `truncated code facts: ${String(codeFactDigest.truncatedCount ?? 0)}`,
        `truncated memory: ${String(memoryDigest.truncatedCount ?? 0)}`
      ]
    });
    await writeDesignDiscoveryProgress(root, progress.runId, progress.stage, "running", "正在调用 Design Discovery 模型。", {
      kind: "tool_call",
      title: "调用 Design Discovery 模型",
      command: `${route.provider}/${route.model}`,
      metadata: [
        `task: ${taskType}`,
        `reasoning: ${String(route.reasoning ?? false)}`,
        `effort: ${route.reasoningEffort ?? "default"}`,
        `timeout: ${formatModelRouteTimeout(route.timeoutMs)}`
      ]
    });
  }
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("design-discovery-use-cases").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  if (progress) {
    await writeDesignDiscoveryProgress(root, progress.runId, progress.stage, "running", "模型已返回，正在解析候选 Interaction Model。", {
      kind: "assistant_message",
      title: "模型返回",
      metadata: [
        `provider: ${response.provider}`,
        `model: ${response.model}`,
        `content_chars: ${response.content.length}`,
        response.usage ? `usage: ${JSON.stringify(response.usage)}` : "usage: unavailable"
      ]
    });
  }
  const model = parseInteractionModelCandidate(response.content, root, generatedAt);
  if (progress) {
    await writeDesignDiscoveryProgress(root, progress.runId, progress.stage, "running", `模型输出已解析为 ${model.useCases.length} 个候选用例。`, {
      kind: "validation",
      title: "解析模型输出",
      metadata: designModelCountMetadata(model)
    });
  }
  return {
    model,
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

function formatModelRouteTimeout(timeoutMs: number | undefined): string {
  if (!timeoutMs || timeoutMs <= 0) return "no timeout";
  return `${Math.round(timeoutMs / 1000)}s`;
}

function readNestedNumber(value: unknown, pathParts: string[]): number | undefined {
  let cursor = value;
  for (const key of pathParts) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "number" ? cursor : undefined;
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

async function commandDesignStoryIntake(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const message = required(args, "message").trim();
  const generatedAt = new Date().toISOString();
  const currentModel = await readInteractionModelCandidateOrEmpty(root, args, generatedAt);
  const result = await callDesignStoryIntakeAgent(root, message, currentModel, generatedAt);
  const accepted = result.intake.accepted && result.intake.stories.length > 0;
  let updatedModel: InteractionModelCandidate | undefined;
  let designMapDocPath: string | undefined;
  let designMapHtmlPath: string | undefined;
  let useCaseDiagramDocuments: Awaited<ReturnType<typeof writeUseCaseDiagramDocuments>> | undefined;
  let modelPath: string | undefined;
  let projection: Awaited<ReturnType<typeof writeDesignUseCaseProjectionViews>> | undefined;
  let addedUseCaseIds: string[] = [];
  let versionDecision: DesignVersionDecision | undefined;
  let versionProviderSummary: Record<string, unknown> | undefined;

  if (accepted) {
    const merged = mergeDesignStoryCandidates(root, currentModel, result.intake.stories, message, generatedAt);
    updatedModel = merged.model;
    addedUseCaseIds = merged.addedUseCaseIds;
    const versionResult = await callDesignVersionDecisionAgent(root, {
      generatedAt,
      userMessage: message,
      currentModel,
      updatedModel,
      intake: result.intake,
      addedUseCaseIds,
      changedArtifacts: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH, `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/**`]
    });
    versionDecision = versionResult.decision;
    versionProviderSummary = versionResult.providerSummary;
    designMapDocPath = await writeUseCaseDiagramsMapDocument(root, updatedModel, versionDecision);
    designMapHtmlPath = await writeUseCaseDiagramsMapHtmlDocument(root, updatedModel, versionDecision);
    useCaseDiagramDocuments = await writeUseCaseDiagramDocuments(root, updatedModel, versionDecision);
    modelPath = await writeInteractionModelCandidate(root, updatedModel);
    projection = await writeDesignUseCaseProjectionViews(root, updatedModel);
    await appendChange(root, {
      title: "Design story intake updated Use Case Diagram map",
      summary: `Accepted ${addedUseCaseIds.length} candidate Use Case Diagram(s) from Design Explorer story intake. Version ${versionDecision.currentVersion} -> ${versionDecision.nextVersion} (${versionDecision.bump.toUpperCase()}).`,
      kind: "CANDIDATE"
    }).catch(() => undefined);
    await appendTrace(root, {
      id: `trace-event:design-story-intake:${Date.now()}`,
      traceId: `trace:design-story-intake:${Date.now()}`,
      timestamp: generatedAt,
      kind: "design.story_intake.completed",
      target: { type: "project", id: "project:root" },
      summary: "Design Story Intake added candidate Use Case Diagram stories to docs/design.",
      data: {
        addedUseCaseIds,
        designMapDocPath,
        designMapHtmlPath,
        useCaseDiagramDocuments,
        modelPath,
        projection,
        versionDecision,
        provider: result.providerSummary,
        versionProvider: versionProviderSummary
      }
    }).catch(() => undefined);
  }

  outputJson({
    ok: true,
    root,
    intent: result.intake.intent,
    accepted,
    updated: Boolean(updatedModel),
    summary: result.intake.summary,
    reason: result.intake.reason,
    guidance: result.intake.guidance,
    missingParts: result.intake.missingParts,
    questions: result.intake.questions,
    addedUseCaseIds,
    designMapDocPath,
    designMapHtmlPath,
    useCaseDiagramDocuments,
    modelPath,
    manifestPath: projection?.manifestPath,
    useCaseListViewPath: projection?.useCaseListViewPath,
    useCaseViewPaths: projection?.useCaseViewPaths ?? [],
    mermaidPaths: projection?.mermaidPaths ?? [],
    contexts: updatedModel?.contexts.length ?? currentModel.contexts.length,
    actors: updatedModel?.actors.length ?? currentModel.actors.length,
    externalSystems: updatedModel?.externalSystems.length ?? currentModel.externalSystems.length,
    useCases: updatedModel?.useCases.length ?? currentModel.useCases.length,
    relations: updatedModel?.relations.length ?? currentModel.relations.length,
    useCaseDrilldowns: updatedModel?.useCaseDrilldowns.length ?? currentModel.useCaseDrilldowns.length,
    versionDecision,
    provider: result.providerSummary,
    versionProvider: versionProviderSummary
  });
}

async function callDesignStoryIntakeAgent(
  root: string,
  userMessage: string,
  currentModel: InteractionModelCandidate,
  generatedAt: string
): Promise<{ intake: DesignStoryIntakeResult; providerSummary: Record<string, unknown> }> {
  const config = await loadModelConfig(root);
  const taskType = "design.story_intake";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.designStoryIntakeRequest.v1",
    root,
    generatedAt,
    userMessage,
    currentModel,
    policy: {
      pageMode: "list",
      allowedIntent: "new_story_only",
      acceptedStoriesBecomeCandidateDesignDocs: true,
      persistTarget: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH, `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>.md`, `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>.html`],
      perUseCaseDrilldowns: [
        `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/activity.md`,
        `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/sequences/<scenario>.md`,
        `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/state-machines/<state-object>.md`,
        `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/<story>/realization/class-collaboration.md`
      ],
      doNotExplainExistingDiagramHere: true,
      doNotGenerateSourceCode: true,
      doNotMarkConfirmedWithoutUserConfirmation: true,
      humanReadableLanguage: "zh-CN",
      keepTechnicalIdentifiersVerbatim: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("design-story-intake").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  return {
    intake: parseDesignStoryIntakeResult(response.content),
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function callDesignVersionDecisionAgent(
  root: string,
  input: {
    generatedAt: string;
    userMessage: string;
    currentModel: InteractionModelCandidate;
    updatedModel: InteractionModelCandidate;
    intake: DesignStoryIntakeResult;
    addedUseCaseIds: string[];
    changedArtifacts: string[];
  }
): Promise<{ decision: DesignVersionDecision; providerSummary: Record<string, unknown> }> {
  const currentVersion = await readProjectSemanticVersion(root) ?? "0.1.0";
  const gitVersion = await readProjectGitVersion(root);
  const config = await loadModelConfig(root);
  const taskType = "design.version_decision";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.designVersionDecisionRequest.v1",
    root,
    generatedAt: input.generatedAt,
    currentVersion,
    gitVersion,
    change: {
      source: "design-story-intake",
      userMessage: input.userMessage,
      intakeSummary: input.intake.summary,
      intakeReason: input.intake.reason,
      stories: input.intake.stories.map((story) => ({
        title: story.title,
        summary: story.summary,
        contextTitle: story.contextTitle,
        primaryActors: story.primaryActors,
        externalSystems: story.externalSystems,
        relationCount: story.relations.length,
        drilldownDiagramCount: story.drilldownDiagrams.length
      })),
      addedUseCaseIds: input.addedUseCaseIds,
      beforeCounts: interactionModelCounts(input.currentModel),
      afterCounts: interactionModelCounts(input.updatedModel),
      changedArtifacts: input.changedArtifacts
    },
    policy: {
      agentOwnsVersionDecision: true,
      userSuppliedVersionIsNotAuthoritative: true,
      atomicGitCommitRequired: true,
      oneVersionChangePerAtomicCommit: true,
      semverRules: {
        major: "参与者边界、系统边界、故事职责、API 或数据契约发生不兼容变化。",
        minor: "向后兼容地新增能力、故事、参与者、外部系统、支持流程或设计图层。",
        patch: "向后兼容的问题修复、澄清、证据更新、非行为性文档或布局变更。",
        none: "没有持久化的产品、设计、代码或项目记忆变更。"
      },
      humanReadableLanguage: "zh-CN",
      keepTechnicalIdentifiersVerbatim: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("design-version-decision").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  const decision = parseDesignVersionDecisionResult(
    response.content,
    currentVersion,
    input.changedArtifacts,
    `新增 ${input.addedUseCaseIds.length} 个候选用例图`,
    "新增候选用例图故事"
  );
  return {
    decision,
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function commandDesignDiagramDiscuss(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const message = required(args, "message").trim();
  const diagramId = stringArg(args, "use-case-id") ?? stringArg(args, "diagram-id") ?? required(args, "diagram");
  const generatedAt = new Date().toISOString();
  const conversationHistory = parseScopedAgentConversationHistory(stringArg(args, "conversation-history"));
  const model = await readInteractionModelCandidate(root, args);
  const currentDiagram = await buildDesignDiagramDiscussionContext(
    root,
    model,
    diagramId,
    stringArg(args, "selected-anchor"),
    stringArg(args, "current-uml"),
    message,
    args
  );
  const result = await callDesignDiagramDiscussionAgent(root, message, currentDiagram, generatedAt, conversationHistory);
  const documentEdits = await applyDiagramDocumentEdits(root, result.discussion.documentEdits, ["docs/design"]);
  await appendTrace(root, {
    id: `trace-event:design-diagram-discussion:${Date.now()}`,
    traceId: `trace:design-diagram-discussion:${Date.now()}`,
    timestamp: generatedAt,
    kind: "design.diagram_discussion.completed",
    target: { type: "project", id: "project:root" },
    summary: "Design Diagram Discussion answered within the selected Use Case Diagram boundary.",
    data: {
      diagramId: currentDiagram.targetUseCase.id,
      currentUml: currentDiagram.currentUml,
      selectedAnchor: currentDiagram.selectedAnchor,
      linkedDocuments: currentDiagram.linkedDocuments,
      intent: result.discussion.intent,
      affectedDocuments: result.discussion.affectedDocuments,
      documentEdits,
      provider: result.providerSummary
    }
  }).catch(() => undefined);
  outputJson({
    ok: true,
    root,
    diagramId: currentDiagram.targetUseCase.id,
    currentUml: currentDiagram.currentUml,
    intent: result.discussion.intent,
    answer: result.discussion.answer,
    guidance: result.discussion.guidance,
    referencedAnchors: result.discussion.referencedAnchors,
    suggestedOperations: result.discussion.suggestedOperations,
    affectedDocuments: result.discussion.affectedDocuments,
    documentEdits,
    risks: result.discussion.risks,
    questions: result.discussion.questions,
    provider: result.providerSummary
  });
}

async function callDesignDiagramDiscussionAgent(
  root: string,
  userMessage: string,
  currentDiagram: DesignDiagramDiscussionContext,
  generatedAt: string,
  conversationHistory: ScopedAgentConversationHistoryEntry[] = []
): Promise<{ discussion: DesignDiagramDiscussionResult; providerSummary: Record<string, unknown> }> {
  const config = await loadModelConfig(root);
  const taskType = "design.diagram_discussion";
  const route = resolveModelRoute(config, taskType);
  const providerConfig = config.providers[route.provider];
  const provider = createProvider(route.provider, {
    apiKey: providerConfig?.apiKey,
    apiKeyEnv: providerConfig?.apiKeyEnv,
    baseUrl: providerConfig?.baseUrl
  });
  const payload = {
    schemaVersion: "praxis.designDiagramDiscussionRequest.v1",
    root,
    generatedAt,
    userMessage,
    conversationHistory: conversationHistory.slice(-24),
    currentDiagram,
    policy: {
      pageMode: "diagram",
      allowedScope: "selected_current_uml_document_first",
      rejectNewStoryIntakeHere: true,
      doNotWriteFiles: false,
      documentWritesAllowed: true,
      allowedWriteRoots: ["docs/design"],
      documentEditProtocol: ["replace_text", "replace_between_markers", "append_section", "replace_document"],
      proposedOperationsAreCandidatesOnly: false,
      doNotGenerateSourceCode: true
    }
  };
  const response = await provider.call({
    route,
    responseFormat: "json",
    messages: [
      { role: "system", content: getPrompt("design-diagram-discussion").body },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]
  });
  return {
    discussion: parseDesignDiagramDiscussionResult(response.content),
    providerSummary: {
      provider: response.provider,
      model: response.model,
      taskType,
      reasoning: route.reasoning,
      reasoningEffort: route.reasoningEffort
    }
  };
}

async function readInteractionModelCandidateOrEmpty(root: string, args: Args, generatedAt: string): Promise<InteractionModelCandidate> {
  try {
    return await readInteractionModelCandidate(root, args);
  } catch (error) {
    if (isMissingFileError(error)) return emptyInteractionModelCandidate(root, generatedAt);
    throw error;
  }
}

function parseDesignStoryIntakeResult(content: string): DesignStoryIntakeResult {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Design Story Intake response did not contain a JSON object.");
  const stories = parseDesignStoryCandidates(raw.stories);
  const intent = designStoryIntakeIntent(raw.intent);
  const accepted = raw.accepted === true && intent === "new_story" && stories.length > 0;
  return {
    schemaVersion: "praxis.designStoryIntakeResult.v1",
    intent: accepted ? "new_story" : intent,
    accepted,
    summary: stringOr(raw.summary, accepted ? `Accepted ${stories.length} candidate story/stories.` : "The input was not accepted as a new story."),
    reason: stringOr(raw.reason, ""),
    guidance: stringOr(raw.guidance, accepted ? "Review the generated candidate Use Case Diagram documents." : "Describe a business actor, goal, trigger and expected outcome."),
    missingParts: stringArray(raw.missingParts),
    questions: stringArray(raw.questions),
    stories: accepted ? stories : []
  };
}

function parseDesignStoryCandidates(value: unknown): DesignStoryCandidateInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DesignStoryCandidateInput[] => {
    if (!isRecord(item)) return [];
    const title = stringValue(item.title);
    const summary = stringValue(item.summary);
    if (!title || !summary) return [];
    return [{
      title,
      summary,
      contextTitle: stringOr(item.contextTitle, "Project Design"),
      contextSummary: stringOr(item.contextSummary, `Stories related to ${title}.`),
      primaryActors: stringArray(item.primaryActors),
      supportingActors: stringArray(item.supportingActors),
      externalSystems: stringArray(item.externalSystems),
      trigger: stringValue(item.trigger),
      preconditions: stringArray(item.preconditions),
      mainSuccessScenario: stringArray(item.mainSuccessScenario),
      alternativeFlows: stringArray(item.alternativeFlows),
      failureFlows: stringArray(item.failureFlows),
      postconditions: stringArray(item.postconditions),
      questions: stringArray(item.questions),
      relations: parseDesignStoryRelations(item.relations),
      drilldownDiagrams: parseDesignStoryDrilldownDiagrams(item.drilldownDiagrams)
    }];
  });
}

function parseDesignStoryDrilldownDiagrams(value: unknown): DesignStoryDrilldownDiagramInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DesignStoryDrilldownDiagramInput[] => {
    if (!isRecord(item)) return [];
    const kind = designDrilldownKind(item.kind);
    const title = stringValue(item.title);
    const summary = stringValue(item.summary);
    if (!title || !summary) return [];
    const coverage = normalizeUseCaseDrilldownCoverage(item, kind, undefined, summary);
    return [{
      kind,
      title,
      summary,
      coverage,
      explanation: normalizeUseCaseDrilldownExplanation(item, kind, undefined, coverage, summary),
      mermaid: stringValue(item.mermaid),
      questions: stringArray(item.questions)
    }];
  });
}

function parseDesignStoryRelations(value: unknown): DesignStoryRelationInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DesignStoryRelationInput[] => {
    if (!isRecord(item)) return [];
    const kind = designStoryRelationKind(item.kind);
    const targetTitle = stringValue(item.targetTitle);
    if (!kind || !targetTitle) return [];
    return [{
      kind,
      targetTitle,
      summary: stringOr(item.summary, `${kind} ${targetTitle}`)
    }];
  });
}

function parseDesignDiagramDiscussionResult(content: string): DesignDiagramDiscussionResult {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Design Diagram Discussion response did not contain a JSON object.");
  return {
    schemaVersion: "praxis.designDiagramDiscussionResult.v1",
    intent: designDiagramDiscussionIntent(raw.intent),
    answer: stringOr(raw.answer, "当前问题没有落在所选 Use Case Diagram 的边界内。"),
    guidance: stringOr(raw.guidance, ""),
    referencedAnchors: stringArray(raw.referencedAnchors),
    suggestedOperations: stringArray(raw.suggestedOperations),
    affectedDocuments: parseDesignDiscussionAffectedDocuments(raw.affectedDocuments),
    documentEdits: parseDiagramDocumentEdits(raw.documentEdits),
    risks: stringArray(raw.risks),
    questions: stringArray(raw.questions)
  };
}

function parseDesignDiscussionAffectedDocuments(value: unknown): DesignDiscussionAffectedDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DesignDiscussionAffectedDocument[] => {
    if (!isRecord(item)) return [];
    const pathValue = normalizeProjectRelativePath(stringValue(item.path) ?? "");
    if (!pathValue) return [];
    return [{
      path: pathValue,
      kind: stringOr(item.kind, "linked_document"),
      reason: stringOr(item.reason, "需要根据当前 UML 讨论结果复核该关联文档。"),
      update: designAffectedDocumentUpdate(item.update)
    }];
  });
}

function designAffectedDocumentUpdate(value: unknown): DesignDiscussionAffectedDocument["update"] {
  if (value === "must_update" || value === "review" || value === "no_change") return value;
  return "review";
}

function parseEngineeringDiagramDiscussionResult(content: string): EngineeringDiagramDiscussionResult {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Engineering Diagram Discussion response did not contain a JSON object.");
  return {
    schemaVersion: "praxis.engineeringDiagramDiscussionResult.v1",
    intent: engineeringDiagramDiscussionIntent(raw.intent),
    answer: stringOr(raw.answer, "当前问题没有落在 Engineering Explorer 的技术复杂度边界内。"),
    guidance: stringOr(raw.guidance, ""),
    technicalPerspective: stringOr(raw.technicalPerspective, "unknown"),
    referencedAnchors: stringArray(raw.referencedAnchors),
    suggestedDrilldowns: stringArray(raw.suggestedDrilldowns),
    documentEdits: parseDiagramDocumentEdits(raw.documentEdits),
    risks: stringArray(raw.risks),
    questions: stringArray(raw.questions)
  };
}

function parseArchitectureDiagramDiscussionResult(content: string): ArchitectureDiagramDiscussionResult {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Architecture Diagram Discussion response did not contain a JSON object.");
  return {
    schemaVersion: "praxis.architectureDiagramDiscussionResult.v1",
    intent: architectureDiagramDiscussionIntent(raw.intent),
    answer: stringOr(raw.answer, "当前问题没有落在 Architecture Explorer 的 C4 架构边界内。"),
    guidance: stringOr(raw.guidance, ""),
    architecturePerspective: stringOr(raw.architecturePerspective, "unknown"),
    referencedAnchors: stringArray(raw.referencedAnchors),
    suggestedDrilldowns: stringArray(raw.suggestedDrilldowns),
    documentEdits: parseDiagramDocumentEdits(raw.documentEdits),
    risks: stringArray(raw.risks),
    questions: stringArray(raw.questions)
  };
}

function parseReviewFindingDiscussionResult(content: string): ReviewFindingDiscussionResult {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Review Finding Discussion response did not contain a JSON object.");
  const intent = reviewFindingDiscussionIntent(raw.intent);
  return {
    schemaVersion: "praxis.reviewFindingDiscussionResult.v1",
    intent,
    answer: stringOr(raw.answer, "当前问题没有落在所选评审问题的处理边界内。"),
    guidance: stringOr(raw.guidance, ""),
    referencedDocuments: stringArray(raw.referencedDocuments).map(normalizeProjectRelativePath),
    planAction: parseReviewFindingDiscussionPlanAction(raw.planAction),
    statusDecision: parseReviewFindingStatusDecision(raw.statusDecision, intent),
    regressionAction: parseReviewFindingRegressionAction(raw.regressionAction),
    risks: stringArray(raw.risks),
    questions: stringArray(raw.questions)
  };
}

function parseReviewFindingDiscussionPlanAction(value: unknown): ReviewFindingDiscussionPlanAction {
  const raw = isRecord(value) ? value : {};
  return {
    shouldCreateOrUpdate: raw.shouldCreateOrUpdate === true,
    reason: stringOr(raw.reason, "当前讨论未要求创建或更新项目变更项。"),
    expectedChangeSummary: stringOr(raw.expectedChangeSummary, "")
  };
}

function parseReviewFindingStatusDecision(value: unknown, intent: ReviewFindingDiscussionIntent): ReviewFindingStatusDecision {
  const raw = isRecord(value) ? value : {};
  const status = raw.status === "needs_more_evidence" ? "needs_more_evidence" : "false_positive";
  return {
    shouldUpdate: raw.shouldUpdate === true || intent === "mark_finding_false_positive",
    status,
    reason: stringOr(raw.reason, "Review Agent did not provide a status update reason."),
    evidenceSummary: stringOr(raw.evidenceSummary, ""),
    updatedSuggestedAction: stringOr(raw.updatedSuggestedAction, "")
  };
}

function parseReviewFindingRegressionAction(value: unknown): ReviewFindingRegressionAction {
  const raw = isRecord(value) ? value : {};
  return {
    shouldCreate: raw.shouldCreate === true,
    reason: stringOr(raw.reason, ""),
    correctedUnderstanding: stringOr(raw.correctedUnderstanding, ""),
    affectedCategories: stringArray(raw.affectedCategories).flatMap((item) => {
      const parsed = ReviewCategorySchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
    affectedFindingIds: stringArray(raw.affectedFindingIds),
    recommendedReviewScope: stringOr(raw.recommendedReviewScope, "")
  };
}

function parseDiagramDocumentEdits(value: unknown): DiagramDocumentEdit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DiagramDocumentEdit[] => {
    if (!isRecord(item)) return [];
    const pathValue = normalizeProjectRelativePath(stringValue(item.path) ?? "");
    const operation = diagramDocumentEditOperation(item.operation);
    if (!pathValue || !operation) return [];
    return [{
      path: pathValue,
      operation,
      reason: stringOr(item.reason, "Agent requested a docs-backed diagram document edit."),
      oldText: stringValue(item.oldText),
      newText: stringValue(item.newText),
      startMarker: stringValue(item.startMarker),
      endMarker: stringValue(item.endMarker),
      content: stringValue(item.content),
      createIfMissing: item.createIfMissing === true
    }];
  });
}

function diagramDocumentEditOperation(value: unknown): DiagramDocumentEditOperation | undefined {
  if (
    value === "replace_text"
    || value === "replace_between_markers"
    || value === "append_section"
    || value === "replace_document"
  ) {
    return value;
  }
  return undefined;
}

async function applyDiagramDocumentEdits(
  root: string,
  edits: DiagramDocumentEdit[],
  allowedPrefixes: string[]
): Promise<DiagramDocumentEditResult[]> {
  const results: DiagramDocumentEditResult[] = [];
  const changedMarkdownPaths = new Set<string>();
  for (const edit of edits.slice(0, 20)) {
    const result = await applyDiagramDocumentEdit(root, edit, allowedPrefixes);
    results.push(result);
    if (result.status === "applied" && result.changed && result.path.endsWith(".md")) {
      changedMarkdownPaths.add(result.path);
    }
  }
  for (const markdownPath of changedMarkdownPaths) {
    const syncResult = await refreshCompanionHtmlProjectionFromMarkdown(root, markdownPath, allowedPrefixes);
    if (syncResult) results.push(syncResult);
  }
  return results;
}

async function refreshCompanionHtmlProjectionFromMarkdown(
  root: string,
  markdownPath: string,
  allowedPrefixes: string[]
): Promise<DiagramDocumentEditResult | undefined> {
  const family = diagramProjectionFamilyFromMarkdownPath(markdownPath);
  if (!family) return undefined;
  const htmlPath = markdownPath.replace(/\.md$/i, ".html");
  if (htmlPath === markdownPath) return undefined;
  const rejection = rejectDiagramDocumentEditPath(root, htmlPath, allowedPrefixes);
  if (rejection) return undefined;
  const markdownAbsolutePath = path.resolve(root, markdownPath);
  const htmlAbsolutePath = path.resolve(root, htmlPath);
  let markdown = "";
  let existingHtml = "";
  try {
    markdown = await readFile(markdownAbsolutePath, "utf8");
  } catch (error) {
    return {
      path: htmlPath,
      operation: "replace_document",
      status: "failed",
      changed: false,
      reason: `同步 ${markdownPath} 的 HTML 投影。`,
      message: error instanceof Error ? error.message : String(error)
    };
  }
  try {
    existingHtml = await readFile(htmlAbsolutePath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      return {
        path: htmlPath,
        operation: "replace_document",
        status: "failed",
        changed: false,
        reason: `同步 ${markdownPath} 的 HTML 投影。`,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  const nextHtml = renderDiagramMarkdownProjectionHtml(markdown, markdownPath, htmlPath, existingHtml, family);
  if (nextHtml === existingHtml) {
    return {
      path: htmlPath,
      operation: "replace_document",
      status: "skipped",
      changed: false,
      reason: `同步 ${markdownPath} 的 HTML 投影。`,
      message: "Companion HTML projection already matches the Markdown document."
    };
  }
  await mkdir(path.dirname(htmlAbsolutePath), { recursive: true });
  await writeFile(htmlAbsolutePath, nextHtml, "utf8");
  return {
    path: htmlPath,
    operation: "replace_document",
    status: "applied",
    changed: true,
    reason: `同步 ${markdownPath} 的 HTML 投影。`,
    message: "Companion HTML projection refreshed from Markdown.",
    bytesWritten: Buffer.byteLength(nextHtml, "utf8")
  };
}

type DiagramProjectionFamily = "design" | "engineering" | "architecture";

function diagramProjectionFamilyFromMarkdownPath(markdownPath: string): DiagramProjectionFamily | undefined {
  const normalized = normalizeProjectRelativePath(markdownPath);
  if (normalized.startsWith("docs/engineering/")) return "engineering";
  if (normalized.startsWith("docs/architecture/")) return "architecture";
  if (!normalized.startsWith("docs/design/use-case-diagrams/")) return undefined;
  if (
    normalized.endsWith("/activity.md")
    || normalized.includes("/sequences/")
    || normalized.includes("/state-machines/")
    || normalized.includes("/realization/")
    || normalized.includes("/interaction-overviews/")
    || normalized.includes("/communications/")
    || normalized.includes("/timing/")
    || normalized.includes("/object-snapshots/")
    || normalized.includes("/composite-structures/")
  ) {
    return "design";
  }
  return undefined;
}

async function applyDiagramDocumentEdit(
  root: string,
  edit: DiagramDocumentEdit,
  allowedPrefixes: string[]
): Promise<DiagramDocumentEditResult> {
  const normalizedPath = normalizeProjectRelativePath(edit.path);
  const rejection = rejectDiagramDocumentEditPath(root, normalizedPath, allowedPrefixes);
  if (rejection) {
    return {
      path: normalizedPath,
      operation: edit.operation,
      status: "rejected",
      changed: false,
      reason: edit.reason,
      message: rejection
    };
  }
  const absolutePath = path.resolve(root, normalizedPath);
  let existing = "";
  try {
    existing = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      return {
        path: normalizedPath,
        operation: edit.operation,
        status: "failed",
        changed: false,
        reason: edit.reason,
        message: error instanceof Error ? error.message : String(error)
      };
    }
    if (!edit.createIfMissing && edit.operation !== "replace_document" && edit.operation !== "append_section") {
      return {
        path: normalizedPath,
        operation: edit.operation,
        status: "failed",
        changed: false,
        reason: edit.reason,
        message: "Document does not exist and createIfMissing was not set."
      };
    }
  }

  const next = applyDiagramDocumentEditToContent(existing, edit, normalizedPath);
  if (next.status !== "applied") {
    return {
      path: normalizedPath,
      operation: edit.operation,
      status: next.status,
      changed: false,
      reason: edit.reason,
      message: next.message
    };
  }
  const nextContent = normalizeDiagramDocumentContent(normalizedPath, next.content);
  if (nextContent === existing) {
    return {
      path: normalizedPath,
      operation: edit.operation,
      status: "skipped",
      changed: false,
      reason: edit.reason,
      message: "Edit produced no content change."
    };
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, nextContent, "utf8");
  return {
    path: normalizedPath,
    operation: edit.operation,
    status: "applied",
    changed: true,
    reason: edit.reason,
    message: "Document edit applied.",
    bytesWritten: Buffer.byteLength(nextContent, "utf8")
  };
}

function normalizeDiagramDocumentContent(normalizedPath: string, content: string): string {
  if (!/\.(md|html)$/i.test(normalizedPath)) return content;
  if (!content.includes("sequenceDiagram")) return content;
  return content.replace(/^(\s*)end\s+box\s*$/gim, "$1end");
}

function applyDiagramDocumentEditToContent(
  existing: string,
  edit: DiagramDocumentEdit,
  normalizedPath: string
): { status: Extract<DiagramDocumentEditStatus, "applied" | "failed">; content: string; message: string } {
  if (edit.operation === "replace_text") {
    if (!edit.oldText || edit.newText === undefined) {
      return { status: "failed", content: existing, message: "replace_text requires oldText and newText." };
    }
    const index = existing.indexOf(edit.oldText);
    if (index < 0) {
      return { status: "failed", content: existing, message: "oldText was not found in the target document." };
    }
    return {
      status: "applied",
      content: `${existing.slice(0, index)}${edit.newText}${existing.slice(index + edit.oldText.length)}`,
      message: "Text replacement applied."
    };
  }
  if (edit.operation === "replace_between_markers") {
    if (!edit.startMarker || !edit.endMarker || edit.content === undefined) {
      return { status: "failed", content: existing, message: "replace_between_markers requires startMarker, endMarker and content." };
    }
    const startIndex = existing.indexOf(edit.startMarker);
    const endIndex = existing.indexOf(edit.endMarker);
    if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
      return { status: "failed", content: existing, message: "Markers were not found in the expected order." };
    }
    return {
      status: "applied",
      content: [
        existing.slice(0, startIndex + edit.startMarker.length).trimEnd(),
        edit.content.trim(),
        existing.slice(endIndex).trimStart()
      ].join("\n\n"),
      message: "Managed marker block replacement applied."
    };
  }
  if (edit.operation === "append_section") {
    if (!edit.content) {
      return { status: "failed", content: existing, message: "append_section requires content." };
    }
    const content = formatAppendSectionContent(existing, edit.content, normalizedPath);
    return {
      status: "applied",
      content,
      message: "Section appended."
    };
  }
  if (edit.operation === "replace_document") {
    if (edit.content === undefined) {
      return { status: "failed", content: existing, message: "replace_document requires content." };
    }
    return {
      status: "applied",
      content: edit.content.endsWith("\n") ? edit.content : `${edit.content}\n`,
      message: "Full document replacement applied."
    };
  }
  return { status: "failed", content: existing, message: "Unsupported document edit operation." };
}

function formatAppendSectionContent(existing: string, content: string, normalizedPath: string): string {
  const trimmedContent = content.trim();
  if (normalizedPath.endsWith(".html")) {
    const block = `\n\n<section class="semantic-layer agent-edited-layer" data-praxis-kind="agent_edit" data-praxis-layer="agent_edit" data-praxis-author="agent">\n${trimmedContent}\n</section>\n`;
    const mainCloseIndex = existing.lastIndexOf("</main>");
    if (mainCloseIndex >= 0) return `${existing.slice(0, mainCloseIndex).trimEnd()}${block}${existing.slice(mainCloseIndex)}`;
    return `${existing.trimEnd()}${block}`;
  }
  const markdownBlock = `\n\n## Agent 文档补充\n\n${trimmedContent}\n`;
  return `${existing.trimEnd()}${markdownBlock}`;
}

function renderDiagramMarkdownProjectionHtml(
  markdown: string,
  markdownPath: string,
  htmlPath: string,
  existingHtml: string,
  family: DiagramProjectionFamily
): string {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.posix.basename(markdownPath, ".md");
  const anchor = existingHtml.match(/\sdata-praxis-anchor="([^"]+)"/)?.[1] || diagramAnchorFromMarkdownPath(markdownPath, family);
  const kind = diagramKindFromMarkdownPath(markdownPath, family);
  const status = markdown.match(/^状态：(.+)$/m)?.[1]?.trim() || "candidate";
  const confidence = markdown.match(/^置信度：(.+)$/m)?.[1]?.trim() || "medium";
  const body = renderMarkdownDocumentBodyHtml(markdown, anchor, kind, family);
  const payload = buildDiagramPayloadFromMarkdown(markdown, markdownPath, htmlPath, anchor, kind, title, family);
  const explorerLabel = diagramExplorerLabel(family);
  const mainClass = family === "design" ? "praxis-design-map" : family === "architecture" ? "praxis-architecture-map" : "praxis-engineering-map";
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    `  <title>${escapeRuntimeHtmlText(title)}</title>`,
    "</head>",
    "<body>",
    `<main class="${mainClass}" data-praxis-anchor="${escapeRuntimeHtmlAttr(anchor)}" data-praxis-kind="${family}_${escapeRuntimeHtmlAttr(kind)}_diagram" data-praxis-status="${escapeRuntimeHtmlAttr(status)}" data-praxis-confidence="${escapeRuntimeHtmlAttr(confidence)}" data-praxis-document-path="${escapeRuntimeHtmlAttr(htmlPath)}" data-praxis-source-md="${escapeRuntimeHtmlAttr(markdownPath)}" data-praxis-drilldowns="${escapeRuntimeHtmlAttr(JSON.stringify(payload.drilldowns))}">`,
    body,
    `  <script type="application/json" id="praxis-${family}-diagram-document" data-praxis-explorer="${escapeRuntimeHtmlAttr(explorerLabel)}">${escapeRuntimeScriptJson(JSON.stringify(payload))}</script>`,
    "</main>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function renderMarkdownDocumentBodyHtml(markdown: string, anchor: string, kind: string, family: DiagramProjectionFamily): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inCodeFence = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;
  let inTable = false;
  let sectionOpen = false;

  const closeList = () => {
    if (!inList) return;
    html.push("    </ul>");
    inList = false;
  };
  const closeTable = () => {
    if (!inTable) return;
    html.push("    </tbody>", "    </table>");
    inTable = false;
  };
  const closeBlocks = () => {
    closeList();
    closeTable();
  };
  const closeSection = () => {
    closeBlocks();
    if (!sectionOpen) return;
    html.push("  </section>");
    sectionOpen = false;
  };

  for (const line of lines) {
    const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      if (inCodeFence) {
        const code = codeLines.join("\n").trimEnd();
        if (codeLang.toLowerCase() === "mermaid") {
          const mermaid = normalizeMermaidProjectionSource(code);
          closeSection();
          html.push(`  <section class="semantic-layer diagram-section" data-praxis-anchor="${escapeRuntimeHtmlAttr(anchor)}:diagram-body" data-praxis-kind="${family}_diagram_body">`);
          html.push(`    <h2>${escapeRuntimeHtmlText(diagramBodyHeading(family))}</h2>`);
          html.push(`    <pre class="mermaid" data-praxis-anchor="${escapeRuntimeHtmlAttr(anchor)}:uml" data-praxis-kind="${family}_${escapeRuntimeHtmlAttr(kind)}_uml">${escapeRuntimeHtmlText(mermaid)}</pre>`);
          html.push("  </section>");
        } else {
          closeBlocks();
          html.push(`    <pre><code>${escapeRuntimeHtmlText(code)}</code></pre>`);
        }
        inCodeFence = false;
        codeLang = "";
        codeLines = [];
      } else {
        closeBlocks();
        inCodeFence = true;
        codeLang = fence[1] ?? "";
        codeLines = [];
      }
      continue;
    }
    if (inCodeFence) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeSection();
      const level = heading[1]?.length ?? 2;
      const text = heading[2] ?? "";
      if (level === 1) {
        html.push("  <header class=\"praxis-design-map-header\">");
        html.push(`    <p>${escapeRuntimeHtmlText(diagramExplorerLabel(family))}</p>`);
        html.push(`    <h1>${renderInlineMarkdownHtml(text)}</h1>`);
        html.push("  </header>");
      } else {
        if (isDiagramBodyHeading(text)) continue;
        html.push(`  <section class="semantic-layer" data-praxis-kind="${family}_document_section">`);
        html.push(`    <h${Math.min(level, 6)}>${renderInlineMarkdownHtml(text)}</h${Math.min(level, 6)}>`);
        sectionOpen = true;
      }
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      closeList();
      if (/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(trimmed)) continue;
      if (!inTable) {
        html.push("    <table>", "    <tbody>");
        inTable = true;
      }
      const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      html.push(`      <tr>${cells.map((cell) => `<td>${renderInlineMarkdownHtml(cell)}</td>`).join("")}</tr>`);
      continue;
    }

    const listItem = trimmed.match(/^-\s+(.+)$/);
    if (listItem) {
      closeTable();
      if (!inList) {
        html.push("    <ul>");
        inList = true;
      }
      html.push(`      <li>${renderInlineMarkdownHtml(listItem[1] ?? "")}</li>`);
      continue;
    }

    closeBlocks();
    html.push(`    <p>${renderInlineMarkdownHtml(trimmed)}</p>`);
  }
  closeSection();
  if (inCodeFence && codeLines.length) {
    html.push(`    <pre><code>${escapeRuntimeHtmlText(codeLines.join("\n").trimEnd())}</code></pre>`);
  }
  return html.join("\n");
}

function buildDiagramPayloadFromMarkdown(
  markdown: string,
  markdownPath: string,
  htmlPath: string,
  anchor: string,
  kind: string,
  title: string,
  family: DiagramProjectionFamily
): Record<string, unknown> {
  const mermaid = firstMermaidCodeFence(markdown);
  const elements = parseDiagramElementsFromMarkdown(markdown, markdownPath, mermaid, family);
  const drilldowns = parseMarkdownDrilldownLinks(markdown, markdownPath, family);
  return {
    id: anchor,
    family,
    kind,
    title,
    anchor,
    docPath: markdownPath,
    htmlPath,
    elements,
    drilldowns
  };
}

function parseDiagramElementsFromMarkdown(markdown: string, markdownPath: string, mermaid: string, family: DiagramProjectionFamily): Record<string, unknown>[] {
  const sectionMatch = markdown.match(/## 图内语义元素下钻\s*\n([\s\S]*?)(?:\n## |\s*$)/);
  if (!sectionMatch?.[1]) return [];
  const blocks = sectionMatch[1].split(/\n###\s+/).map((block) => block.trim()).filter(Boolean);
  const mermaidIds = parseMermaidClassIds(mermaid);
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/);
    const label = lines[0]?.replace(/^###\s+/, "").trim() || `元素 ${index + 1}`;
    const fields = markdownBulletFields(lines.slice(1));
    return {
      id: fields["锚点"] || `${diagramAnchorFromMarkdownPath(markdownPath, family)}:element:${slugPart(label)}`,
      mermaidId: mermaidIds[index] || `C_${slugPart(label)}`,
      label,
      kind: fields["元素类型"] || "component",
      anchor: fields["锚点"] || `${diagramAnchorFromMarkdownPath(markdownPath, family)}:element:${slugPart(label)}`,
      summary: fields["说明"] || "",
      role: fields["技术角色"] || "",
      whyItExists: fields["为什么出现"] || "",
      relationshipMeaning: fields["关系意义"] || "",
      drilldownIntent: fields["下钻意图"] || "",
      businessRelevance: fields["业务关联"] || "",
      changeImpact: fields["变更影响"] || "",
      evidence: markdownNestedListAfter(lines, "证据"),
      risks: markdownNestedListAfter(lines, "风险"),
      questions: markdownNestedListAfter(lines, "问题"),
      confidence: fields["置信度"] || "",
      drilldowns: parseMarkdownDrilldownLinks(block, markdownPath, family)
    };
  });
}

function markdownBulletFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\s*-\s*([^：]+)：\s*(.+)$/);
    if (match?.[1] && match[2]) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

function markdownNestedListAfter(lines: string[], heading: string): string[] {
  const result: string[] = [];
  const start = lines.findIndex((line) => new RegExp(`^\\s*-\\s*${escapeRegExpText(heading)}：\\s*$`).test(line));
  if (start < 0) return result;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*-\s+\S/.test(line)) break;
    const nested = line.match(/^\s{2,}-\s+(.+)$/);
    if (nested?.[1]) result.push(nested[1].trim());
  }
  return result;
}

function parseMarkdownDrilldownLinks(markdown: string, markdownPath: string, family: DiagramProjectionFamily): Record<string, unknown>[] {
  const links: Record<string, unknown>[] = [];
  const pattern = /-\s*(?:下钻：)?\[([^\]]+)]\(([^)]+)\)(?:\s*-\s*(.+))?/g;
  for (const match of markdown.matchAll(pattern)) {
    const title = match[1]?.trim();
    const docPath = match[2]?.trim();
    if (!title || !docPath) continue;
    const projectDocPath = normalizeMarkdownRelativeLink(markdownPath, docPath);
    links.push({
      id: `${family}:diagram-link:${slugPart(projectDocPath)}`,
      kind: diagramKindFromMarkdownPath(projectDocPath, family),
      title,
      summary: match[3]?.trim() || "",
      docPath: projectDocPath,
      htmlPath: projectDocPath.replace(/\.md$/i, ".html"),
      anchor: diagramAnchorFromMarkdownPath(projectDocPath, family),
      reason: match[3]?.trim() || ""
    });
  }
  return links;
}

function normalizeMarkdownRelativeLink(markdownPath: string, linkPath: string): string {
  if (linkPath.startsWith("docs/")) return normalizeProjectRelativePath(linkPath);
  const baseDir = path.posix.dirname(normalizeProjectRelativePath(markdownPath));
  return normalizeProjectRelativePath(path.posix.normalize(path.posix.join(baseDir, linkPath)));
}

function firstMermaidCodeFence(markdown: string): string {
  const match = markdown.match(/```mermaid\s*\n([\s\S]*?)\n```/i);
  return normalizeMermaidProjectionSource(match?.[1]?.trim() || "");
}

function normalizeMermaidProjectionSource(source: string): string {
  let result = source.trim();
  if (/^sequenceDiagram\b/im.test(result)) {
    result = result.replace(/^(\s*)end\s+box\s*$/gim, "$1end");
  }
  return sanitizeFlowchartProjectionNodeIds(result);
}

const FLOWCHART_RESERVED_PROJECTION_NODE_IDS = new Set([
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

function sanitizeFlowchartProjectionNodeIds(source: string): string {
  const lines = source.split(/\r?\n/);
  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0)?.trim() ?? "";
  if (!/^(flowchart|graph)\b/i.test(firstMeaningfulLine)) return source;

  const definedIds = new Set<string>();
  for (const line of lines) {
    const id = flowchartProjectionDefinitionId(line);
    if (id) definedIds.add(id);
  }

  const replacements = new Map<string, string>();
  for (const id of definedIds) {
    if (!FLOWCHART_RESERVED_PROJECTION_NODE_IDS.has(id.toLowerCase())) continue;
    replacements.set(id, nextSafeFlowchartProjectionNodeId(id, definedIds, replacements));
  }
  if (!replacements.size) return source;
  return lines.map((line) => rewriteFlowchartProjectionNodeIds(line, replacements)).join("\n");
}

function flowchartProjectionDefinitionId(line: string): string | undefined {
  return line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?=\[|\(|\{|\>)/)?.[1];
}

function nextSafeFlowchartProjectionNodeId(id: string, used: Set<string>, replacements: Map<string, string>): string {
  const base = `${id}Node`;
  let candidate = base;
  let suffix = 2;
  while (
    used.has(candidate) ||
    Array.from(replacements.values()).includes(candidate) ||
    FLOWCHART_RESERVED_PROJECTION_NODE_IDS.has(candidate.toLowerCase())
  ) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function rewriteFlowchartProjectionNodeIds(line: string, replacements: Map<string, string>): string {
  let result = line;
  for (const [from, to] of replacements.entries()) {
    const escaped = escapeRegExpText(from);
    result = result.replace(new RegExp(`^(\\s*)${escaped}(\\s*(?=\\[|\\(|\\{|\\>|--|-\\.|==))`), `$1${to}$2`);
    result = result.replace(new RegExp(`((?:-->|---|==>|-\\.->|--[^\\n-]*-->|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`((?:--&gt;|---|==&gt;|-\\.-&gt;|--[^\\n-]*--&gt;|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`^(\\s*(?:style|class|click)\\s+)${escaped}\\b`), `$1${to}`);
    result = result.replace(new RegExp(`,\\s*${escaped}\\b`, "g"), `, ${to}`);
  }
  return result;
}

function parseMermaidClassIds(mermaid: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of mermaid.split(/\r?\n/)) {
    const match = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    const id = match?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function diagramKindFromMarkdownPath(markdownPath: string, family: DiagramProjectionFamily): string {
  const normalized = normalizeProjectRelativePath(markdownPath);
  if (family === "design") {
    if (normalized.endsWith("/activity.md")) return "activity";
    if (normalized.includes("/sequences/")) return "sequence";
    if (normalized.includes("/state-machines/")) return "state_machine";
    if (normalized.includes("/realization/")) return "class_collaboration";
    if (normalized.includes("/interaction-overviews/")) return "interaction_overview";
    if (normalized.includes("/communications/")) return "communication";
    if (normalized.includes("/timing/")) return "timing";
    if (normalized.includes("/object-snapshots/")) return "object";
    if (normalized.includes("/composite-structures/")) return "composite_structure";
    return "use_case_diagram";
  }
  if (family === "architecture") {
    if (normalized.includes("/system-context/")) return "system_context";
    if (normalized.includes("/containers/")) return "container";
    if (normalized.includes("/components/")) return "component";
    if (normalized.includes("/code/")) return "code";
    return "c4";
  }
  return engineeringKindFromMarkdownPath(normalized);
}

function engineeringKindFromMarkdownPath(markdownPath: string): string {
  if (markdownPath.includes("/package-diagrams/")) return "package";
  if (markdownPath.includes("/component-diagrams/")) return "component";
  if (markdownPath.includes("/class-structural-diagrams/")) return "class_structural";
  if (markdownPath.includes("/sequence-diagrams/")) return "sequence";
  if (markdownPath.includes("/deployment-diagrams/")) return "deployment";
  if (markdownPath.includes("/technical-hotspots/")) return "technical_hotspot";
  return "diagram";
}

function diagramAnchorFromMarkdownPath(markdownPath: string, family: DiagramProjectionFamily): string {
  const normalized = normalizeProjectRelativePath(markdownPath);
  if (family === "engineering") return engineeringAnchorFromMarkdownPath(normalized);
  if (family === "design") {
    const parts = normalized.split("/");
    const useCaseIndex = parts.indexOf("use-case-diagrams") + 1;
    const useCaseSlug = parts[useCaseIndex] || path.posix.basename(normalized, ".md");
    const kind = diagramKindFromMarkdownPath(normalized, family).replace(/_/g, "-");
    const basename = path.posix.basename(normalized, ".md");
    const suffix = basename && basename !== "activity" && basename !== "class-collaboration" ? `:${basename}` : "";
    return `design:${kind}:${useCaseSlug}${suffix}`;
  }
  const kind = diagramKindFromMarkdownPath(normalized, family).replace(/_/g, "-");
  const basename = path.posix.basename(normalized, ".md");
  const directory = normalized.split("/").at(-2) || basename;
  return `architecture:${kind}:${directory}:${basename}`;
}

function engineeringAnchorFromMarkdownPath(markdownPath: string): string {
  const normalized = normalizeProjectRelativePath(markdownPath);
  const parts = normalized.split("/");
  const directory = parts.at(-2) || path.posix.basename(normalized, ".md");
  const kind = engineeringKindFromMarkdownPath(normalized).replace(/_/g, "-");
  return `engineering:${kind}:${directory}`;
}

function diagramExplorerLabel(family: DiagramProjectionFamily): string {
  if (family === "design") return "Praxis Design Explorer";
  if (family === "architecture") return "Praxis Architecture Explorer";
  return "Praxis Engineering Explorer";
}

function diagramBodyHeading(family: DiagramProjectionFamily): string {
  if (family === "design") return "UML 底图";
  if (family === "architecture") return "C4 图";
  return "UML / 技术图";
}

function isDiagramBodyHeading(value: string): boolean {
  return ["UML", "UML 底图", "UML / 技术图", "C4 图"].includes(value.trim());
}

function renderInlineMarkdownHtml(value: string): string {
  const codeTokens: string[] = [];
  let escaped = escapeRuntimeHtmlText(value).replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `@@CODE_${codeTokens.length}@@`;
    codeTokens.push(`<code>${escapeRuntimeHtmlText(code)}</code>`);
    return token;
  });
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, href: string) =>
    `<a href="${escapeRuntimeHtmlAttr(href)}">${escapeRuntimeHtmlText(label)}</a>`
  );
  codeTokens.forEach((replacement, index) => {
    escaped = escaped.replace(`@@CODE_${index}@@`, replacement);
  });
  return escaped;
}

function escapeRuntimeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRuntimeHtmlAttr(value: string): string {
  return escapeRuntimeHtmlText(value).replace(/"/g, "&quot;");
}

function escapeRuntimeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/::/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function escapeRegExpText(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rejectDiagramDocumentEditPath(root: string, relativePath: string, allowedPrefixes: string[]): string | undefined {
  if (!relativePath || relativePath.includes("\0")) return "Invalid document path.";
  if (!relativePath.endsWith(".md") && !relativePath.endsWith(".html")) return "Only Markdown and HTML design documents can be edited.";
  const parts = relativePath.split("/");
  if (parts.includes("..")) return "Path traversal is not allowed.";
  const prefixAllowed = allowedPrefixes.some((prefix) => {
    const normalizedPrefix = normalizeProjectRelativePath(prefix);
    return relativePath === normalizedPrefix || relativePath.startsWith(`${normalizedPrefix}/`);
  });
  if (!prefixAllowed) return `Document path is outside the allowed roots: ${allowedPrefixes.join(", ")}.`;
  const resolved = path.resolve(root, relativePath);
  const rootRelative = path.relative(root, resolved);
  if (rootRelative.startsWith("..") || path.isAbsolute(rootRelative)) return "Resolved document path escapes the project root.";
  return undefined;
}

function parseDesignVersionDecisionResult(
  content: string,
  currentVersion: string,
  changedArtifacts: string[],
  fallbackScope: string,
  fallbackCommitSummary: string
): DesignVersionDecision {
  const parsed = safeJson(content);
  const raw = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : parsed;
  if (!isRecord(raw)) throw new Error("Design Version Decision response did not contain a JSON object.");
  const bump = designVersionBump(raw.bump);
  const normalizedCurrentVersion = semverCore(currentVersion) ?? "0.1.0";
  const nextVersion = bumpSemver(normalizedCurrentVersion, bump);
  const agentNextVersion = semverCore(stringValue(raw.nextVersion));
  const reason = stringOr(raw.reason, `Agent selected ${bump.toUpperCase()} for this design change.`);
  const semverRule = stringOr(raw.semverRule, semverRuleForBump(bump));
  return {
    schemaVersion: "praxis.designVersionDecision.v1",
    bump,
    currentVersion: normalizedCurrentVersion,
    nextVersion,
    reason: agentNextVersion && agentNextVersion !== nextVersion
      ? `${reason} Runtime corrected nextVersion from ${agentNextVersion} to ${nextVersion} so it matches the selected bump.`
      : reason,
    semverRule,
    atomicCommitScope: stringOr(raw.atomicCommitScope, fallbackScope),
    commitSummary: stringOr(raw.commitSummary, fallbackCommitSummary),
    affectedArtifacts: nonEmptyStringArray(raw.affectedArtifacts, changedArtifacts),
    breaking: raw.breaking === true || bump === "major",
    confidence: designVersionConfidence(raw.confidence),
    questions: stringArray(raw.questions)
  };
}

function mergeDesignStoryCandidates(
  root: string,
  currentModel: InteractionModelCandidate,
  stories: DesignStoryCandidateInput[],
  userMessage: string,
  generatedAt: string
): { model: InteractionModelCandidate; addedUseCaseIds: string[] } {
  const intakeId = `design-story-intake:${Date.now()}`;
  const contexts = [...currentModel.contexts];
  const actors = [...currentModel.actors];
  const externalSystems = [...currentModel.externalSystems];
  const useCases = [...currentModel.useCases];
  const relations = [...currentModel.relations];
  const useCaseDrilldowns = [...currentModel.useCaseDrilldowns];
  const questions = [...currentModel.questions];
  const contextByTitle = new Map(contexts.map((context) => [designTitleKey(context.title), context]));
  const actorByTitle = new Map(actors.map((actor) => [designTitleKey(actor.title), actor]));
  const externalByTitle = new Map(externalSystems.map((external) => [designTitleKey(external.title), external]));
  const useCaseByTitle = new Map(useCases.map((useCase) => [designTitleKey(useCase.title), useCase.id]));
  const allIds = new Set([
    ...contexts.map((item) => item.id),
    ...actors.map((item) => item.id),
    ...externalSystems.map((item) => item.id),
    ...useCases.map((item) => item.id),
    ...relations.map((item) => item.id),
    ...useCaseDrilldowns.map((item) => item.id),
    ...questions.map((item) => item.id)
  ]);
  const addedUseCaseIds: string[] = [];
  const evidence = {
    source: "user_confirmation" as const,
    filePath: DESIGN_MAP_DOC_RELATIVE_PATH,
    excerpt: truncateText(userMessage, 1200),
    summary: "User described this candidate story in Design Explorer story intake.",
    strength: "medium" as const,
    knowledgeKind: "CANDIDATE" as const
  };

  for (const story of stories) {
    const context = contextByTitle.get(designTitleKey(story.contextTitle)) ?? (() => {
      const contextCandidate = {
        ...designTraceability(intakeId, [], [evidence]),
        id: nextDesignId("context", story.contextTitle, allIds),
        title: story.contextTitle,
        summary: story.contextSummary,
        kind: "business_module" as const,
        scope: story.contextSummary,
        responsibility: story.contextSummary,
        businessTerms: inferDesignBusinessTerms(`${story.contextTitle} ${story.contextSummary}`),
        status: "candidate" as const,
        confidence: "medium" as const
      };
      contexts.push(contextCandidate);
      contextByTitle.set(designTitleKey(story.contextTitle), contextCandidate);
      return contextCandidate;
    })();
    const primaryActorIds = story.primaryActors.map((title) =>
      getOrCreateDesignActor(title, "role", actors, actorByTitle, allIds, intakeId, evidence)
    );
    const supportingActorIds = story.supportingActors.map((title) =>
      getOrCreateDesignActor(title, "role", actors, actorByTitle, allIds, intakeId, evidence)
    );
    const externalSystemIds = story.externalSystems.map((title) =>
      getOrCreateDesignExternalSystem(title, externalSystems, externalByTitle, allIds, intakeId, evidence)
    );
    const useCase = {
      ...designTraceability(intakeId, story.questions, [evidence]),
      id: nextDesignId("use-case", story.title, allIds),
      contextId: context.id,
      title: story.title,
      summary: story.summary,
      status: "candidate" as const,
      confidence: "medium" as const,
      primaryActorIds,
      supportingActorIds,
      externalSystemIds,
      entryPointIds: [],
      trigger: story.trigger,
      preconditions: nonEmptyOrDefault(story.preconditions, "Preconditions need user confirmation."),
      postconditions: nonEmptyOrDefault(story.postconditions, "Postconditions need user confirmation."),
      mainSuccessScenario: nonEmptyOrDefault(story.mainSuccessScenario, story.summary),
      alternativeFlows: story.alternativeFlows,
      failureFlows: story.failureFlows
    };
    useCases.push(useCase);
    useCaseByTitle.set(designTitleKey(story.title), useCase.id);
    addedUseCaseIds.push(useCase.id);
    const storyDrilldowns = story.drilldownDiagrams.length
      ? story.drilldownDiagrams.map((diagram, diagramIndex) => ({
          ...designTraceability(intakeId, diagram.questions, [evidence]),
          id: nextDesignId(designDrilldownIdPrefix(diagram.kind), `${useCase.id}-${diagram.title}-${diagramIndex + 1}`, allIds),
          useCaseId: useCase.id,
          kind: diagram.kind,
          title: diagram.title,
          summary: diagram.summary,
          coverage: diagram.coverage,
          explanation: diagram.explanation,
          status: "candidate" as const,
          confidence: "medium" as const,
          mermaid: diagram.mermaid ?? fallbackDrilldownMermaid(diagram.kind, useCase)
        }))
      : ensureUseCaseDrilldownDiagrams([], [useCase], allIds) as unknown as InteractionModelCandidate["useCaseDrilldowns"];
    useCaseDrilldowns.push(...(storyDrilldowns as unknown as InteractionModelCandidate["useCaseDrilldowns"]));
    for (const [index, question] of story.questions.entries()) {
      questions.push({
        id: nextDesignId("question", `${useCase.id}-${index + 1}`, allIds),
        question,
        targetId: useCase.id,
        severity: "warning"
      });
    }
  }

  for (const story of stories) {
    const sourceId = useCaseByTitle.get(designTitleKey(story.title));
    if (!sourceId) continue;
    for (const relation of story.relations) {
      const targetId = useCaseByTitle.get(designTitleKey(relation.targetTitle));
      if (!targetId || targetId === sourceId) continue;
      relations.push({
        ...designTraceability(intakeId, [], [evidence]),
        id: nextDesignId("relation", `${sourceId}-${relation.kind}-${targetId}`, allIds),
        kind: relation.kind,
        sourceId,
        targetId,
        summary: relation.summary,
        status: "candidate" as const,
        confidence: "medium" as const
      });
    }
  }

  return {
    model: InteractionModelCandidateSchema.parse({
      ...currentModel,
      root,
      generatedAt,
      source: "agent",
      contexts,
      actors,
      externalSystems,
      useCases,
      relations,
      useCaseDrilldowns,
      questions,
      warnings: currentModel.warnings
    }),
    addedUseCaseIds
  };
}

async function buildDesignDiagramDiscussionContext(
  root: string,
  model: InteractionModelCandidate,
  useCaseId: string,
  selectedAnchorRaw?: string,
  currentUmlRaw?: string,
  userMessage = "",
  args: Args = {}
): Promise<DesignDiagramDiscussionContext> {
  const targetUseCase = model.useCases.find((useCase) => useCase.id === useCaseId);
  if (!targetUseCase) throw new Error(`Use Case Diagram not found: ${useCaseId}`);
  const context = model.contexts.find((item) => item.id === targetUseCase.contextId);
  const contextUseCases = model.useCases.filter((useCase) => useCase.contextId === targetUseCase.contextId);
  const useCaseIds = new Set(contextUseCases.map((useCase) => useCase.id));
  const actorIds = new Set(contextUseCases.flatMap((useCase) => [...useCase.primaryActorIds, ...useCase.supportingActorIds]));
  const externalSystemIds = new Set(contextUseCases.flatMap((useCase) => useCase.externalSystemIds));
  const targetUseCaseDrilldowns = model.useCaseDrilldowns.filter((diagram) => diagram.useCaseId === targetUseCase.id);
  const currentUml = await buildDesignCurrentUmlContext(root, targetUseCase, targetUseCaseDrilldowns, currentUmlRaw);
  const linkedDocuments = buildDesignLinkedDocuments(targetUseCase, targetUseCaseDrilldowns, currentUml);
  const linkedDocumentExcerpts = await buildDesignLinkedDocumentExcerpts(root, linkedDocuments);
  const repositoryEvidence = await buildDesignRepositoryEvidenceContext(root, model, {
    targetUseCase,
    targetUseCaseDrilldowns,
    currentUml,
    linkedDocumentExcerpts,
    userMessage,
    args
  });
  return {
    schemaVersion: "praxis.designDiagramContext.v1",
    targetUseCase,
    targetUseCaseDrilldowns,
    currentUml,
    linkedDocuments,
    linkedDocumentExcerpts,
    repositoryEvidence,
    context,
    contextUseCases,
    actors: model.actors.filter((actor) => actorIds.has(actor.id)),
    externalSystems: model.externalSystems.filter((external) => externalSystemIds.has(external.id)),
    relations: model.relations.filter((relation) => useCaseIds.has(relation.sourceId) || useCaseIds.has(relation.targetId)),
    questions: model.questions.filter((question) => !question.targetId || useCaseIds.has(question.targetId)),
    selectedAnchor: parseSelectedAnchor(selectedAnchorRaw),
    sourceSpecPaths: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH]
  };
}

async function buildDesignCurrentUmlContext(
  root: string,
  targetUseCase: InteractionModelCandidate["useCases"][number],
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"],
  currentUmlRaw?: string
): Promise<DesignCurrentUmlContext> {
  const raw = currentUmlRaw ? safeJson(currentUmlRaw) : undefined;
  const provided = isRecord(raw) ? raw : {};
  const requestedId = stringValue(provided.id);
  const requestedPath = stringValue(provided.htmlPath);
  const matchedDrilldown = drilldowns.find((diagram) =>
    diagram.id === requestedId
    || (requestedPath ? designUseCaseDrilldownHtmlRelativePath(diagram) === normalizeProjectRelativePath(requestedPath) : false)
  );
  const fallbackHtmlPath = designUseCaseDiagramHtmlRelativePath(targetUseCase.id);
  const htmlPath = normalizeProjectRelativePath(
    stringOr(provided.htmlPath, matchedDrilldown ? designUseCaseDrilldownHtmlRelativePath(matchedDrilldown) : fallbackHtmlPath)
  );
  const markdownPath = normalizeProjectRelativePath(
    stringOr(provided.markdownPath, htmlPath.replace(/\.html$/i, ".md"))
  );
  const [html, markdown] = await Promise.all([
    readProjectTextIfExists(root, htmlPath),
    readProjectTextIfExists(root, markdownPath)
  ]);
  return {
    id: stringOr(provided.id, matchedDrilldown?.id ?? `${targetUseCase.id}:use-case-diagram`),
    kind: stringOr(provided.kind, matchedDrilldown?.kind ?? "use_case_diagram"),
    title: stringOr(provided.title, matchedDrilldown?.title ?? targetUseCase.title),
    summary: stringValue(provided.summary) ?? matchedDrilldown?.summary ?? targetUseCase.summary,
    htmlPath,
    markdownPath,
    status: stringValue(provided.status) ?? matchedDrilldown?.status ?? targetUseCase.status,
    confidence: stringValue(provided.confidence) ?? matchedDrilldown?.confidence ?? targetUseCase.confidence,
    coverage: isRecord(provided.coverage) ? provided.coverage : matchedDrilldown?.coverage,
    currentDocumentHtmlExcerpt: compactText(html, 16_000),
    currentDocumentMarkdownExcerpt: compactText(markdown, 16_000)
  };
}

function buildDesignLinkedDocuments(
  targetUseCase: InteractionModelCandidate["useCases"][number],
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"],
  currentUml: DesignCurrentUmlContext
): DesignLinkedDocumentContext[] {
  const documents: DesignLinkedDocumentContext[] = [];
  const pushDocument = (document: DesignLinkedDocumentContext) => {
    const key = `${document.relationship}:${document.id}:${document.htmlPath ?? ""}:${document.markdownPath ?? ""}`;
    if (documents.some((item) => `${item.relationship}:${item.id}:${item.htmlPath ?? ""}:${item.markdownPath ?? ""}` === key)) return;
    documents.push(document);
  };

  pushDocument({
    id: currentUml.id,
    kind: currentUml.kind,
    title: currentUml.title,
    htmlPath: currentUml.htmlPath,
    markdownPath: currentUml.markdownPath,
    relationship: "current_uml",
    updateReason: "当前中间面板正在显示的 UML 文档；任何解释层、锚点、证据或图形语义调整都应先落在这里。"
  });

  const parentHtmlPath = designUseCaseDiagramHtmlRelativePath(targetUseCase.id);
  const parentMarkdownPath = designMarkdownRelativePath(parentHtmlPath);
  if (normalizeProjectRelativePath(currentUml.htmlPath) !== parentHtmlPath) {
    pushDocument({
      id: `${targetUseCase.id}:use-case-diagram`,
      kind: "use_case_diagram",
      title: targetUseCase.title,
      htmlPath: parentHtmlPath,
      markdownPath: parentMarkdownPath,
      relationship: "parent_use_case",
      updateReason: "父级 Use Case Diagram 承载业务故事边界；下钻图改变业务流程、参与者、成功/失败路径或范围时必须同步复核。"
    });
  }

  for (const diagram of drilldowns) {
    const htmlPath = designUseCaseDrilldownHtmlRelativePath(diagram);
    if (normalizeProjectRelativePath(currentUml.htmlPath) === htmlPath) continue;
    pushDocument({
      id: diagram.id,
      kind: diagram.kind,
      title: diagram.title,
      htmlPath,
      markdownPath: designMarkdownRelativePath(htmlPath),
      relationship: "sibling_uml",
      updateReason: `同一 Use Case 下的 ${diagram.kind} 下钻图；当前图改变流程、时序、状态或结构协作语义时需要联动复核。`
    });
  }

  pushDocument({
    id: "design-map:markdown",
    kind: "design_map_index",
    title: "Use Case Diagrams Maps",
    htmlPath: DESIGN_MAP_HTML_RELATIVE_PATH,
    markdownPath: DESIGN_MAP_DOC_RELATIVE_PATH,
    relationship: "map_index",
    updateReason: "设计地图索引承载 Use Case / 下钻 UML 列表、版本和变更摘要；新增、删除、重命名或关系变化时必须同步。"
  });

  return documents;
}

async function buildDesignLinkedDocumentExcerpts(
  root: string,
  documents: DesignLinkedDocumentContext[]
): Promise<DesignLinkedDocumentExcerpt[]> {
  const result: DesignLinkedDocumentExcerpt[] = [];
  for (const document of documents) {
    const [markdown, html] = await Promise.all([
      document.markdownPath ? readProjectTextIfExists(root, document.markdownPath) : Promise.resolve(""),
      document.htmlPath ? readProjectTextIfExists(root, document.htmlPath) : Promise.resolve("")
    ]);
    result.push({
      path: document.markdownPath ?? document.htmlPath ?? "",
      relationship: document.relationship,
      title: document.title,
      kind: document.kind,
      markdownExcerpt: compactText(markdown, 8_000),
      htmlExcerpt: compactText(html, 8_000)
    });
  }
  return result;
}

async function buildDesignRepositoryEvidenceContext(
  root: string,
  model: InteractionModelCandidate,
  input: {
    targetUseCase: InteractionModelCandidate["useCases"][number];
    targetUseCaseDrilldowns: InteractionModelCandidate["useCaseDrilldowns"];
    currentUml: DesignCurrentUmlContext;
    linkedDocumentExcerpts: DesignLinkedDocumentExcerpt[];
    userMessage: string;
    args: Args;
  }
): Promise<DesignRepositoryEvidenceContext> {
  const queryTerms = designDiscussionQueryTerms(input);
  try {
    const codeFacts = await readOrBuildCodeFacts(root, input.args);
    const directIds = designDiscussionDirectCodeFactIds(input.targetUseCase, input.targetUseCaseDrilldowns);
    const scoredNodes = codeFacts.nodes
      .map((node) => ({ node, score: designDiscussionNodeScore(node, queryTerms, directIds) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.node.filePath.localeCompare(right.node.filePath))
      .slice(0, 80);
    const matchingNodes: DesignRepositoryEvidenceNode[] = scoredNodes.map(({ node }) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      range: node.range ? { startLine: node.range.startLine, endLine: node.range.endLine } : undefined,
      signature: node.signature,
      docSummary: node.docSummary,
      evidence: node.evidence.slice(0, 4),
      matchReason: designDiscussionNodeMatchReason(node, queryTerms, directIds)
    }));
    const matchedNodeIds = new Set(matchingNodes.map((node) => node.id));
    const relatedEdges: DesignRepositoryEvidenceEdge[] = codeFacts.edges
      .filter((edge) => matchedNodeIds.has(edge.sourceId) || matchedNodeIds.has(edge.targetId))
      .slice(0, 120)
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        filePath: edge.filePath,
        evidence: edge.evidence.slice(0, 3)
      }));
    const fileExcerpts = await designDiscussionRepositoryFileExcerpts(root, matchingNodes, queryTerms);
    const limitations = [
      matchingNodes.length ? "" : "没有在本地代码事实中找到与当前 UML 和用户输入直接匹配的符号。",
      fileExcerpts.length ? "" : "没有读取到可展示的源码片段；只能基于代码事实节点和文档摘录判断。"
    ].filter(Boolean);
    return {
      source: "local_code_facts",
      queryTerms,
      matchingNodes,
      relatedEdges,
      fileExcerpts,
      limitations
    };
  } catch (error) {
    return {
      source: "unavailable",
      queryTerms,
      matchingNodes: [],
      relatedEdges: [],
      fileExcerpts: [],
      limitations: [`无法读取或生成本地代码事实：${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

async function buildGenericDiagramRepositoryEvidenceContext(
  root: string,
  args: Args,
  input: {
    userMessage: string;
    currentDocumentTitle?: string;
    currentDocumentPath: string;
    currentDocumentHtmlExcerpt: string;
    currentDocumentMarkdownExcerpt: string;
    mapIndexExcerpt: string;
    selectedAnchor?: unknown;
  }
): Promise<DesignRepositoryEvidenceContext> {
  const queryTerms = diagramDiscussionQueryTermsFromText([
    input.userMessage,
    input.currentDocumentTitle,
    input.currentDocumentPath,
    input.currentDocumentHtmlExcerpt,
    input.currentDocumentMarkdownExcerpt,
    input.mapIndexExcerpt,
    input.selectedAnchor ? JSON.stringify(input.selectedAnchor) : ""
  ].filter(Boolean).join("\n"));
  try {
    const codeFacts = await readOrBuildCodeFacts(root, args);
    const directIds = new Set<string>();
    const scoredNodes = codeFacts.nodes
      .map((node) => ({ node, score: designDiscussionNodeScore(node, queryTerms, directIds) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.node.filePath.localeCompare(right.node.filePath))
      .slice(0, 80);
    const matchingNodes: DesignRepositoryEvidenceNode[] = scoredNodes.map(({ node }) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      range: node.range ? { startLine: node.range.startLine, endLine: node.range.endLine } : undefined,
      signature: node.signature,
      docSummary: node.docSummary,
      evidence: node.evidence.slice(0, 4),
      matchReason: designDiscussionNodeMatchReason(node, queryTerms, directIds)
    }));
    const matchedNodeIds = new Set(matchingNodes.map((node) => node.id));
    const relatedEdges: DesignRepositoryEvidenceEdge[] = codeFacts.edges
      .filter((edge) => matchedNodeIds.has(edge.sourceId) || matchedNodeIds.has(edge.targetId))
      .slice(0, 120)
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        filePath: edge.filePath,
        evidence: edge.evidence.slice(0, 3)
      }));
    const fileExcerpts = await designDiscussionRepositoryFileExcerpts(root, matchingNodes, queryTerms);
    const limitations = [
      matchingNodes.length ? "" : "没有在本地仓库证据中找到与当前文档、锚点和用户输入直接匹配的符号。",
      fileExcerpts.length ? "" : "没有读取到可展示的源码片段；只能基于文档摘录和本地仓库证据节点判断。"
    ].filter(Boolean);
    return {
      source: "local_code_facts",
      queryTerms,
      matchingNodes,
      relatedEdges,
      fileExcerpts,
      limitations
    };
  } catch (error) {
    return {
      source: "unavailable",
      queryTerms,
      matchingNodes: [],
      relatedEdges: [],
      fileExcerpts: [],
      limitations: [`无法读取或生成本地仓库证据：${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function designDiscussionDirectCodeFactIds(
  targetUseCase: InteractionModelCandidate["useCases"][number],
  drilldowns: InteractionModelCandidate["useCaseDrilldowns"]
): Set<string> {
  const ids = new Set<string>();
  const collect = (item: Pick<InteractionModelCandidate["useCases"][number], "sourceCodeFactIds" | "evidence">) => {
    item.sourceCodeFactIds.forEach((id) => ids.add(id));
    item.evidence.forEach((evidence) => {
      if (evidence.sourceCodeFactId) ids.add(evidence.sourceCodeFactId);
    });
  };
  collect(targetUseCase);
  for (const drilldown of drilldowns) collect(drilldown);
  return ids;
}

function designDiscussionQueryTerms(input: {
  targetUseCase: InteractionModelCandidate["useCases"][number];
  targetUseCaseDrilldowns: InteractionModelCandidate["useCaseDrilldowns"];
  currentUml: DesignCurrentUmlContext;
  linkedDocumentExcerpts: DesignLinkedDocumentExcerpt[];
  userMessage: string;
}): string[] {
  const rawText = [
    input.userMessage,
    input.currentUml.title,
    input.currentUml.summary,
    input.currentUml.currentDocumentMarkdownExcerpt,
    input.currentUml.currentDocumentHtmlExcerpt,
    input.targetUseCase.title,
    input.targetUseCase.summary,
    input.targetUseCase.trigger,
    ...input.targetUseCase.mainSuccessScenario,
    ...input.targetUseCase.alternativeFlows,
    ...input.targetUseCase.failureFlows,
    ...input.targetUseCaseDrilldowns.flatMap((diagram) => [
      diagram.id,
      diagram.title,
      diagram.summary,
      diagram.coverage.scenario,
      diagram.coverage.boundary,
      diagram.coverage.rationale,
      diagram.explanation.business,
      diagram.explanation.design,
      diagram.explanation.implementation,
      diagram.mermaid,
      ...diagram.coverage.implementationScope.modules,
      ...diagram.coverage.implementationScope.entryPoints,
      ...diagram.coverage.implementationScope.keyFiles,
      ...diagram.coverage.implementationScope.codeAnchors
    ]),
    ...input.linkedDocumentExcerpts.flatMap((document) => [document.markdownExcerpt, document.htmlExcerpt])
  ].filter(Boolean).join("\n");
  return diagramDiscussionQueryTermsFromText(rawText);
}

function diagramDiscussionQueryTermsFromText(rawText: string): string[] {
  const terms = new Set<string>();
  for (const match of rawText.matchAll(/[A-Za-z][A-Za-z0-9_$]*(?:::[A-Za-z][A-Za-z0-9_$]*)?/g)) {
    const value = match[0];
    if (designDiscussionUsefulTerm(value)) addDesignDiscussionTerm(terms, value);
  }
  const lower = rawText.toLowerCase();
  const zhHints: Array<[string, string[]]> = [
    ["策略", ["Strategy"]],
    ["通道", ["Channel", "Provider"]],
    ["网关", ["Gateway", "Provider"]],
    ["创建", ["Create", "Creation"]],
    ["架构", ["Architecture", "Container", "Component"]],
    ["组件", ["Component"]],
    ["模块", ["Module", "Package"]],
    ["包", ["Package", "Module"]],
    ["类", ["Class"]],
    ["接口", ["Interface"]],
    ["服务", ["Service"]],
    ["领域", ["Domain"]],
    ["部署", ["Deployment"]],
    ["配置", ["Config", "Configuration"]],
    ["依赖", ["Dependency", "Import"]],
    ["调用", ["Call", "Invoke"]],
    ["状态", ["State"]],
    ["事件", ["Event"]]
  ];
  for (const [needle, values] of zhHints) {
    if (rawText.includes(needle)) values.forEach((value) => addDesignDiscussionTerm(terms, value));
  }
  if (lower.includes("strategy")) addDesignDiscussionTerm(terms, "Strategy");
  if (lower.includes("provider")) addDesignDiscussionTerm(terms, "Provider");
  return Array.from(terms).slice(0, 120);
}

function addDesignDiscussionTerm(terms: Set<string>, value: string): void {
  const cleaned = value.replace(/^use-case:/, "").replace(/^class-collaboration:/, "").replace(/^sequence:/, "").trim();
  if (!designDiscussionUsefulTerm(cleaned)) return;
  terms.add(cleaned);
  for (const part of cleaned.split(/[:.$_\-\/\\]+/)) {
    if (designDiscussionUsefulTerm(part)) terms.add(part);
  }
}

function designDiscussionUsefulTerm(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 90) return false;
  if (/^\d+$/.test(normalized)) return false;
  const lower = normalized.toLowerCase();
  return !new Set([
    "div",
    "span",
    "class",
    "section",
    "article",
    "data",
    "praxis",
    "candidate",
    "high",
    "medium",
    "low",
    "true",
    "false",
    "docs",
    "design",
    "html",
    "markdown",
    "mermaid",
    "flowchart",
    "sequencediagram",
    "classdiagram"
  ]).has(lower);
}

function designDiscussionNodeScore(
  node: CodeFactGraphSnapshot["nodes"][number],
  queryTerms: string[],
  directIds: Set<string>
): number {
  let score = directIds.has(node.id) ? 25 : 0;
  const haystack = `${node.id} ${node.kind} ${node.name} ${node.qualifiedName} ${node.filePath} ${node.signature ?? ""} ${node.docSummary ?? ""}`.toLowerCase();
  for (const term of queryTerms) {
    const lower = term.toLowerCase();
    if (!lower || lower.length < 3) continue;
    if (node.name.toLowerCase() === lower) score += 10;
    else if (node.qualifiedName.toLowerCase().includes(lower)) score += lower.length >= 8 ? 6 : 3;
    else if (haystack.includes(lower)) score += lower.length >= 8 ? 4 : 1;
  }
  if (node.kind === "class" || node.kind === "interface" || node.kind === "enum") score += 2;
  if (node.kind === "method" || node.kind === "function") score += 1;
  if (designDiscussionGeneratedOrVendorPath(node.filePath)) score -= 8;
  return score;
}

function designDiscussionNodeMatchReason(
  node: CodeFactGraphSnapshot["nodes"][number],
  queryTerms: string[],
  directIds: Set<string>
): string {
  if (directIds.has(node.id)) return "当前 Use Case 或下钻图已经引用该代码事实。";
  const haystack = `${node.name} ${node.qualifiedName} ${node.filePath} ${node.signature ?? ""} ${node.docSummary ?? ""}`.toLowerCase();
  const matched = queryTerms
    .filter((term) => term.length >= 3 && haystack.includes(term.toLowerCase()))
    .slice(0, 6);
  return matched.length ? `匹配当前问题/文档关键词：${matched.join(", ")}` : "与当前图的本地代码事实相关。";
}

async function designDiscussionRepositoryFileExcerpts(
  root: string,
  matchingNodes: DesignRepositoryEvidenceNode[],
  queryTerms: string[]
): Promise<DesignRepositoryEvidenceFileExcerpt[]> {
  const byFile = new Map<string, DesignRepositoryEvidenceNode[]>();
  for (const node of matchingNodes) {
    if (!node.filePath || designDiscussionGeneratedOrVendorPath(node.filePath)) continue;
    if (!byFile.has(node.filePath)) byFile.set(node.filePath, []);
    byFile.get(node.filePath)?.push(node);
  }
  const result: DesignRepositoryEvidenceFileExcerpt[] = [];
  for (const [filePath, nodes] of Array.from(byFile.entries()).slice(0, 8)) {
    const content = await readProjectTextIfExists(root, filePath);
    if (!content.trim()) continue;
    const excerpt = designDiscussionSourceExcerpt(content, nodes, queryTerms);
    if (!excerpt.trim()) continue;
    result.push({
      path: filePath,
      reason: nodes.slice(0, 6).map((node) => `${node.kind}:${node.qualifiedName || node.name}`).join(", "),
      excerpt
    });
  }
  return result;
}

function designDiscussionSourceExcerpt(content: string, nodes: DesignRepositoryEvidenceNode[], queryTerms: string[]): string {
  const lines = content.split(/\r?\n/);
  const windows: Array<{ start: number; end: number }> = [];
  for (const node of nodes.slice(0, 8)) {
    if (!node.range) continue;
    windows.push({
      start: Math.max(1, node.range.startLine - 8),
      end: Math.min(lines.length, node.range.endLine + 8)
    });
  }
  if (!windows.length) {
    const lowerTerms = queryTerms.map((term) => term.toLowerCase()).filter((term) => term.length >= 4).slice(0, 30);
    for (let index = 0; index < lines.length && windows.length < 4; index += 1) {
      const lowerLine = lines[index].toLowerCase();
      if (lowerTerms.some((term) => lowerLine.includes(term))) {
        windows.push({ start: Math.max(1, index + 1 - 6), end: Math.min(lines.length, index + 1 + 8) });
      }
    }
  }
  const merged = mergeLineWindows(windows).slice(0, 4);
  return compactText(
    merged
      .map((window) => formatNumberedSourceLines(lines, window.start, window.end))
      .join("\n\n...\n\n"),
    8_000
  );
}

function mergeLineWindows(windows: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = windows
    .filter((window) => window.start <= window.end)
    .sort((left, right) => left.start - right.start);
  const result: Array<{ start: number; end: number }> = [];
  for (const window of sorted) {
    const previous = result[result.length - 1];
    if (previous && window.start <= previous.end + 3) {
      previous.end = Math.max(previous.end, window.end);
      continue;
    }
    result.push({ ...window });
  }
  return result;
}

function formatNumberedSourceLines(lines: string[], start: number, end: number): string {
  return lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n");
}

function designDiscussionGeneratedOrVendorPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(node_modules|dist|build|target|coverage|vendor|generated|logs|bin|obj)(\/|$)/.test(normalized)
    || /\.(min\.(js|css)|map|lock)$/i.test(normalized);
}

function designUseCaseDiagramDocumentSlug(useCaseId: string): string {
  return safeFilePart(useCaseId.replace(/^use-case:/, "")).toLowerCase() || safeFilePart(useCaseId).toLowerCase();
}

function designUseCaseDiagramHtmlRelativePath(useCaseId: string): string {
  return `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/${designUseCaseDiagramDocumentSlug(useCaseId)}.html`;
}

function designUseCaseDrilldownHtmlRelativePath(diagram: InteractionModelCandidate["useCaseDrilldowns"][number]): string {
  const base = `${DESIGN_USE_CASE_DIAGRAMS_DIR_RELATIVE_PATH}/${designUseCaseDiagramDocumentSlug(diagram.useCaseId)}`;
  if (diagram.kind === "activity") return `${base}/activity.html`;
  if (diagram.kind === "sequence") return `${base}/sequences/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  if (diagram.kind === "state_machine") return `${base}/state-machines/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  if (diagram.kind === "class_collaboration") return `${base}/realization/class-collaboration.html`;
  if (diagram.kind === "interaction_overview") return `${base}/interaction-overviews/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  if (diagram.kind === "communication") return `${base}/communications/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  if (diagram.kind === "timing") return `${base}/timing/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  if (diagram.kind === "object_snapshot") return `${base}/object-snapshots/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
  return `${base}/composite-structures/${designUseCaseDiagramDocumentSlug(diagram.id)}.html`;
}

function designMarkdownRelativePath(htmlPath: string): string {
  const normalized = normalizeProjectRelativePath(htmlPath);
  return normalized.replace(/\.html$/i, ".md");
}

function parseSelectedAnchor(value: string | undefined): unknown {
  if (!value) return undefined;
  const parsed = safeJson(value);
  return isRecord(parsed) ? parsed : { anchor: value };
}

function getOrCreateDesignActor(
  title: string,
  type: "person" | "role" | "system" | "external_system",
  actors: InteractionModelCandidate["actors"],
  actorByTitle: Map<string, InteractionModelCandidate["actors"][number]>,
  allIds: Set<string>,
  intakeId: string,
  evidence: InteractionModelCandidate["actors"][number]["evidence"][number]
): string {
  const key = designTitleKey(title);
  const existing = actorByTitle.get(key);
  if (existing) return existing.id;
  const actor = {
    ...designTraceability(intakeId, [], [evidence]),
    id: nextDesignId("actor", title, allIds),
    title,
    summary: `Actor participating in ${title}.`,
    type,
    status: "candidate" as const,
    confidence: "medium" as const
  };
  actors.push(actor);
  actorByTitle.set(key, actor);
  return actor.id;
}

function getOrCreateDesignExternalSystem(
  title: string,
  externalSystems: InteractionModelCandidate["externalSystems"],
  externalByTitle: Map<string, InteractionModelCandidate["externalSystems"][number]>,
  allIds: Set<string>,
  intakeId: string,
  evidence: InteractionModelCandidate["externalSystems"][number]["evidence"][number]
): string {
  const key = designTitleKey(title);
  const existing = externalByTitle.get(key);
  if (existing) return existing.id;
  const externalSystem = {
    ...designTraceability(intakeId, [], [evidence]),
    id: nextDesignId("external-system", title, allIds),
    title,
    summary: `External system participating in ${title}.`,
    status: "candidate" as const,
    confidence: "medium" as const
  };
  externalSystems.push(externalSystem);
  externalByTitle.set(key, externalSystem);
  return externalSystem.id;
}

function designTraceability(
  intakeId: string,
  questions: string[],
  evidence: InteractionModelCandidate["useCases"][number]["evidence"]
) {
  return {
    sourceMemoryIds: [],
    sourceModelIds: [intakeId],
    sourceSpecPaths: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH],
    sourceCodeFactIds: [],
    evidence,
    questions
  };
}

function nextDesignId(prefix: string, title: string, allIds: Set<string>): string {
  const slugValue = designSlug(title);
  const base = `${prefix}:${slugValue}`;
  let candidate = base;
  let index = 2;
  while (allIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  allIds.add(candidate);
  return candidate;
}

function designSlug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `item-${stableHash(value)}`;
}

function inferDesignBusinessTerms(value: string): string[] {
  const matches = value.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,}/g) ?? [];
  return unique(matches.slice(0, 8));
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function designTitleKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function nonEmptyOrDefault(values: string[], fallback: string): string[] {
  return values.length ? values : [fallback];
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function designStoryIntakeIntent(value: unknown): DesignStoryIntakeIntent {
  return value === "new_story" || value === "insufficient_story" || value === "not_new_story" ? value : "not_new_story";
}

function designDiagramDiscussionIntent(value: unknown): DesignDiagramDiscussionIntent {
  if (
    value === "explain" ||
    value === "operate" ||
    value === "propose_patch" ||
    value === "out_of_scope" ||
    value === "needs_selection"
  ) {
    return value;
  }
  return "out_of_scope";
}

function engineeringDiagramDiscussionIntent(value: unknown): EngineeringDiagramDiscussionIntent {
  if (
    value === "explain" ||
    value === "drilldown" ||
    value === "governance" ||
    value === "out_of_scope" ||
    value === "needs_selection"
  ) {
    return value;
  }
  return "out_of_scope";
}

function architectureDiagramDiscussionIntent(value: unknown): ArchitectureDiagramDiscussionIntent {
  if (
    value === "explain" ||
    value === "drilldown" ||
    value === "boundary" ||
    value === "out_of_scope" ||
    value === "needs_selection"
  ) {
    return value;
  }
  return "out_of_scope";
}

function reviewFindingDiscussionIntent(value: unknown): ReviewFindingDiscussionIntent {
  if (
    value === "explain_review_finding" ||
    value === "create_project_change" ||
    value === "mark_finding_false_positive" ||
    value === "clarify_review_scope" ||
    value === "out_of_scope" ||
    value === "needs_selection"
  ) {
    return value;
  }
  return "out_of_scope";
}

function designVersionBump(value: unknown): DesignVersionBump {
  if (value === "major" || value === "minor" || value === "patch" || value === "none") return value;
  return "patch";
}

function designVersionConfidence(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

function interactionModelCounts(model: InteractionModelCandidate): Record<string, number> {
  return {
    contexts: model.contexts.length,
    actors: model.actors.length,
    externalSystems: model.externalSystems.length,
    useCases: model.useCases.length,
    relations: model.relations.length,
    useCaseDrilldowns: model.useCaseDrilldowns.length,
    questions: model.questions.length
  };
}

function nonEmptyStringArray(value: unknown, fallback: string[]): string[] {
  const parsed = stringArray(value);
  return parsed.length ? parsed : fallback;
}

function semverRuleForBump(bump: DesignVersionBump): string {
  if (bump === "major") return "MAJOR: incompatible public contract, business boundary or core story responsibility change.";
  if (bump === "minor") return "MINOR: backward-compatible new capability, story, actor, external system or supported flow.";
  if (bump === "patch") return "PATCH: backward-compatible fix, clarification, evidence update or non-behavioral documentation change.";
  return "NONE: no persistent product, design, code or memory change.";
}

function semverCore(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

function bumpSemver(currentVersion: string, bump: DesignVersionBump): string {
  const core = semverCore(currentVersion) ?? "0.1.0";
  const [major, minor, patch] = core.split(".").map((part) => Number.parseInt(part, 10));
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return core;
}

function designStoryRelationKind(value: unknown): DesignStoryRelationKind | undefined {
  if (
    value === "includes" ||
    value === "extends" ||
    value === "depends_on" ||
    value === "triggers" ||
    value === "conflicts_with" ||
    value === "out_of_scope_for"
  ) {
    return value;
  }
  return undefined;
}

function designDiscoveryCodeFactDigest(codeFacts: CodeFactGraphSnapshot, args: Args): Record<string, unknown> {
  const maxNodes = numberArg(args, "max-design-nodes") ?? 360;
  const maxEdges = numberArg(args, "max-design-edges") ?? 460;
  const maxFiles = numberArg(args, "max-design-files") ?? 160;
  const relevantNodes = codeFacts.nodes.filter(isDesignRelevantCodeFactNode);
  const selectedNodes = (relevantNodes.length ? relevantNodes : codeFacts.nodes).slice(0, maxNodes);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = codeFacts.edges
    .filter((edge) => selectedNodeIds.has(edge.sourceId) || selectedNodeIds.has(edge.targetId))
    .slice(0, maxEdges);
  const selectedFiles = codeFacts.files
    .filter((file) => file.roleHint !== "unknown" || file.path.match(/(readme|docs?|adr|api|route|controller|service|handler|usecase|test|spec)/i))
    .slice(0, maxFiles);

  return {
    schemaVersion: codeFacts.schemaVersion,
    root: codeFacts.root,
    generatedAt: codeFacts.generatedAt,
    provider: codeFacts.provider,
    statistics: codeFacts.statistics,
    selectedNodeCount: selectedNodes.length,
    selectedEdgeCount: selectedEdges.length,
    selectedFileCount: selectedFiles.length,
    truncatedNodes: Math.max(0, codeFacts.nodes.length - selectedNodes.length),
    truncatedEdges: Math.max(0, codeFacts.edges.length - selectedEdges.length),
    files: selectedFiles.map((file) => ({
      id: file.id,
      path: file.path,
      language: file.language,
      roleHint: file.roleHint,
      nodeIds: file.nodeIds.slice(0, 30)
    })),
    nodes: selectedNodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      language: node.language,
      range: node.range,
      signature: node.signature,
      docSummary: node.docSummary,
      evidence: node.evidence.slice(0, 2)
    })),
    edges: selectedEdges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      filePath: edge.filePath,
      range: edge.range,
      confidence: edge.confidence,
      evidence: edge.evidence.slice(0, 2)
    })),
    warnings: codeFacts.warnings
  };
}

function isDesignRelevantCodeFactNode(node: CodeFactGraphSnapshot["nodes"][number]): boolean {
  if (node.kind === "route" || node.kind === "component") return true;
  if (node.kind !== "class" && node.kind !== "interface" && node.kind !== "method" && node.kind !== "function") return false;
  const haystack = `${node.name} ${node.qualifiedName} ${node.filePath} ${node.signature ?? ""}`.toLowerCase();
  return /(controller|route|endpoint|service|handler|usecase|use-case|command|query|event|listener|consumer|producer|workflow|process|orchestr|facade|application|domain)/.test(haystack);
}

function designDiscoveryMemoryDigest(records: MemoryRecord[]): Record<string, unknown> {
  const selectedRecords = records.slice(0, 180);
  return {
    count: records.length,
    selectedCount: selectedRecords.length,
    truncatedCount: Math.max(0, records.length - selectedRecords.length),
    records: selectedRecords.map((record) => ({
      id: record.id,
      kind: record.kind,
      type: record.type,
      subject: record.subject,
      predicate: record.predicate,
      object: record.object,
      summary: record.summary,
      source: record.source,
      confidence: record.confidence,
      status: record.status,
      evidence: record.evidence.slice(0, 3)
    }))
  };
}

async function writeDesignDiscoveryProgress(
  root: string,
  runId: string,
  stage: string,
  status: "running" | "complete" | "failed",
  detail = "",
  eventPatch: Record<string, unknown> = {}
): Promise<void> {
  const progressPath = path.join(root, DESIGN_DISCOVERY_PROGRESS_RELATIVE_PATH);
  let existingEvents: Record<string, unknown>[] = [];
  try {
    const existing = await readFile(progressPath, "utf8");
    const parsed = safeJson(existing);
    if (isRecord(parsed) && parsed.runId === runId && Array.isArray(parsed.events)) {
      existingEvents = parsed.events.filter(isRecord);
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  const stages = [
    ["prepare", "准备 Design Discovery", "检查项目和生成策略。"],
    ["collect_facts", "收集代码事实", "读取仓库扫描和本地代码事实证据。"],
    ["read_memory", "读取项目记忆", "查找 docs-backed memory 和迁移证据。"],
    ["agent_thinking", "Design Discovery Agent", "恢复故事、参与者、上下文和用例边界。"],
    ["normalize_model", "规范化 Interaction Model", "在持久化前校验并修复候选模型形状。"],
    ["persist_docs", "写入 docs/design", "生成 Markdown、Semantic HTML 和独立用例图文档。"],
    ["project_views", "重建投影", "把 docs-backed 设计地图投影到 Design Explorer 视图。"],
    ["complete", "Design Discovery 完成", "Design Explorer 可以加载生成的设计地图。"]
  ];
  const activeIndex = Math.max(0, stages.findIndex(([id]) => id === stage));
  const event = designDiscoveryProgressEvent(runId, stage, status, detail || stages[activeIndex]?.[2] || "", eventPatch);
  const advancedEvents = advanceDesignDiscoveryProgressEvents(existingEvents, stages.map(([id]) => id), activeIndex, status);
  const lastEvent = advancedEvents[advancedEvents.length - 1];
  const nextEvents = lastEvent
    && lastEvent.stage === event.stage
    && lastEvent.status === event.status
    && lastEvent.content === event.content
    && lastEvent.kind === event.kind
    && lastEvent.title === event.title
    ? advancedEvents
    : [...advancedEvents, event];
  const events = settleSupersededDesignDiscoveryEvents(nextEvents, stage, status);
  const payload = {
    schemaVersion: "praxis.designDiscoveryProgress.v1",
    root,
    runId,
    updatedAt: new Date().toISOString(),
    status,
    stage,
    title: stages[activeIndex]?.[1] ?? stage,
    detail: detail || stages[activeIndex]?.[2] || "",
    events,
    steps: stages.map(([id, title, stepDetail], index) => ({
      id,
      title,
      detail: stepDetail,
      status: status === "complete"
        ? "done"
        : status === "failed" && index === activeIndex
          ? "failed"
          : index < activeIndex
            ? "done"
            : index === activeIndex
              ? "running"
              : "pending"
    }))
  };
  await mkdir(path.dirname(progressPath), { recursive: true });
  await writeFile(progressPath, JSON.stringify(payload, null, 2), "utf8");
}

function advanceDesignDiscoveryProgressEvents(
  events: Record<string, unknown>[],
  stageIds: string[],
  activeIndex: number,
  status: "running" | "complete" | "failed"
): Record<string, unknown>[] {
  return events.map((event) => {
    const eventStage = typeof event.stage === "string" ? event.stage : "";
    const eventIndex = stageIds.indexOf(eventStage);
    if (eventIndex < 0) return event;
    if (status === "complete" || eventIndex < activeIndex) {
      return { ...event, status: "done" };
    }
    if (status === "failed" && eventIndex === activeIndex) {
      return { ...event, status: "failed" };
    }
    if (eventIndex === activeIndex) {
      return { ...event, status: "running" };
    }
    return event;
  });
}

function settleSupersededDesignDiscoveryEvents(
  events: Record<string, unknown>[],
  activeStage: string,
  status: "running" | "complete" | "failed"
): Record<string, unknown>[] {
  if (status !== "running") return events;
  let latestActiveEventIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.stage === activeStage) {
      latestActiveEventIndex = index;
      break;
    }
  }
  if (latestActiveEventIndex < 0) return events;
  return events.map((event, index) => {
    if (index < latestActiveEventIndex && event.stage === activeStage && event.status === "running") {
      return { ...event, status: "done" };
    }
    return event;
  });
}

function designDiscoveryProgressEvent(
  runId: string,
  stage: string,
  status: "running" | "complete" | "failed",
  detail: string,
  eventPatch: Record<string, unknown> = {}
): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  const id = `${runId}:${stage}:${Date.now()}`;
  const mergeEvent = (base: Record<string, unknown>): Record<string, unknown> => ({
    ...base,
    ...eventPatch,
    id,
    stage,
    status: eventPatch.status ?? base.status ?? status,
    content: typeof eventPatch.content === "string" ? eventPatch.content : detail,
    timestamp
  });
  if (stage === "collect_facts") {
    return mergeEvent({
      id,
      kind: "command_run",
      stage,
      status,
      title: "运行仓库发现",
      command: "praxis-runtime design:discover",
      content: detail,
      timestamp
    });
  }
  if (stage === "agent_thinking") {
    return mergeEvent({
      id,
      kind: "assistant_message",
      stage,
      status,
      title: "Design Discovery Agent",
      content: detail,
      timestamp
    });
  }
  if (stage === "normalize_model") {
    return mergeEvent({
      id,
      kind: "validation",
      stage,
      status,
      title: "校验 Interaction Model",
      content: detail,
      timestamp
    });
  }
  if (stage === "persist_docs") {
    return mergeEvent({
      id,
      kind: "file_edit",
      stage,
      status,
      title: "写入 docs/design",
      path: DESIGN_MAP_DOC_RELATIVE_PATH,
      content: detail,
      metadata: [DESIGN_MAP_HTML_RELATIVE_PATH],
      timestamp
    });
  }
  if (stage === "complete") {
    return mergeEvent({
      id,
      kind: "final_summary",
      stage,
      status: "done",
      title: "Design Discovery 完成",
      content: detail,
      timestamp
    });
  }
  if (status === "failed") {
    return mergeEvent({
      id,
      kind: "error",
      stage,
      status,
      title: "Design Discovery 失败",
      content: detail,
      timestamp
    });
  }
  return mergeEvent({
    id,
    kind: "runtime_event",
    stage,
    status,
    title: stage.replace(/_/g, " "),
    content: detail,
    timestamp
  });
}

async function readInteractionModelFromUseCaseDiagramsMap(root: string): Promise<InteractionModelCandidate | undefined> {
  const docPath = path.join(root, DESIGN_MAP_DOC_RELATIVE_PATH);
  try {
    const raw = await readFile(docPath, "utf8");
    const parsed = parseInteractionModelFromUseCaseDiagramsMap(raw);
    return InteractionModelCandidateSchema.parse({ ...parsed, root });
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

async function readInteractionModelFromUseCaseDiagramsHtml(root: string): Promise<InteractionModelCandidate | undefined> {
  const htmlPath = path.join(root, DESIGN_MAP_HTML_RELATIVE_PATH);
  try {
    const raw = await readFile(htmlPath, "utf8");
    const parsed = parseInteractionModelFromUseCaseDiagramsHtml(raw);
    return InteractionModelCandidateSchema.parse({ ...parsed, root });
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function parseInteractionModelFromUseCaseDiagramsMap(raw: string): InteractionModelCandidate {
  const startIndex = raw.indexOf(DESIGN_INTERACTION_MODEL_START);
  const endIndex = raw.indexOf(DESIGN_INTERACTION_MODEL_END);
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`${DESIGN_MAP_DOC_RELATIVE_PATH} does not contain a managed Interaction Model snapshot.`);
  }
  const managed = raw.slice(startIndex + DESIGN_INTERACTION_MODEL_START.length, endIndex);
  const match = managed.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error(`${DESIGN_MAP_DOC_RELATIVE_PATH} does not contain a JSON Interaction Model snapshot.`);
  }
  const parsed = safeJson(match[1]);
  if (!isRecord(parsed)) {
    throw new Error(`${DESIGN_MAP_DOC_RELATIVE_PATH} contains invalid Interaction Model JSON.`);
  }
  return InteractionModelCandidateSchema.parse(normalizeInteractionModelCandidate(parsed, stringOr(parsed.root, "unknown"), stringOr(parsed.generatedAt, new Date().toISOString())));
}

function parseInteractionModelFromUseCaseDiagramsHtml(raw: string): InteractionModelCandidate {
  const match = raw.match(/<script[^>]*data-praxis-snapshot=["']interaction-model["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error(`${DESIGN_MAP_HTML_RELATIVE_PATH} does not contain an Interaction Model snapshot.`);
  }
  const parsed = safeJson(match[1].trim());
  if (!isRecord(parsed)) {
    throw new Error(`${DESIGN_MAP_HTML_RELATIVE_PATH} contains invalid Interaction Model JSON.`);
  }
  return InteractionModelCandidateSchema.parse(normalizeInteractionModelCandidate(parsed, stringOr(parsed.root, "unknown"), stringOr(parsed.generatedAt, new Date().toISOString())));
}

async function writeInteractionModelCandidate(root: string, model: InteractionModelCandidate): Promise<string> {
  const modelPath = path.join(root, ".distinction", "cache", "design", "interaction-model-candidate.json");
  await writeJson(modelPath, model, InteractionModelCandidateSchema);
  return modelPath;
}

async function readInteractionModelCandidate(root: string, args: Args): Promise<InteractionModelCandidate> {
  if (typeof args.model !== "string") {
    const docModel = await readInteractionModelFromUseCaseDiagramsMap(root);
    if (docModel) return docModel;
    const htmlModel = await readInteractionModelFromUseCaseDiagramsHtml(root);
    if (htmlModel) return htmlModel;
  }
  const modelPath = typeof args.model === "string" ? args.model : path.join(root, ".distinction", "cache", "design", "interaction-model-candidate.json");
  const raw = await readJson(modelPath);
  if (!isRecord(raw)) throw new Error(`Invalid Interaction Model candidate JSON: ${modelPath}`);
  return InteractionModelCandidateSchema.parse(normalizeInteractionModelCandidate(raw, root, stringOr(raw.generatedAt, new Date().toISOString())));
}

async function writeDesignUseCaseProjectionViews(root: string, model: InteractionModelCandidate): Promise<{
  manifestPath: string;
  useCaseListViewPath: string;
  useCaseViewPaths: string[];
  mermaidPaths: string[];
}> {
  const modelCachePath = ".distinction/cache/design/interaction-model-candidate.json";
  const generatedAt = new Date().toISOString();
  const useCaseListView = ProjectedGraphViewSchema.parse(
    projectDesignUseCaseListView({
      model,
      generatedAt,
      sourceCachePaths: [modelCachePath],
      sourceSpecPaths: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH]
    })
  );
  const useCaseViews = projectDesignUseCaseGraphViews({
    model,
    generatedAt,
    sourceCachePaths: [modelCachePath],
    sourceSpecPaths: [DESIGN_MAP_DOC_RELATIVE_PATH, DESIGN_MAP_HTML_RELATIVE_PATH]
  }).map((view) => ProjectedGraphViewSchema.parse(view));

  const useCaseListViewRelativePath = ".distinction/views/design/use-case-list.json";
  const useCaseListViewPath = path.join(root, useCaseListViewRelativePath);
  await writeJson(useCaseListViewPath, useCaseListView, ProjectedGraphViewSchema);

  const projectedViews: { view: ProjectedGraphView; path: string }[] = [
    { view: useCaseListView, path: useCaseListViewRelativePath }
  ];
  const useCaseViewPaths: string[] = [];
  const mermaidPaths: string[] = [];
  for (const view of useCaseViews) {
    const contextId = view.id.replace(/^view:design:use-case:/, "");
    const safeContextId = safeFilePart(contextId);
    const viewRelativePath = `.distinction/views/design/${safeContextId}/use-case-diagram.json`;
    const viewPath = path.join(root, viewRelativePath);
    await writeJson(viewPath, view, ProjectedGraphViewSchema);
    projectedViews.push({ view, path: viewRelativePath });
    useCaseViewPaths.push(viewPath);

    const mermaidPath = path.join(root, ".distinction", "views", "design", safeContextId, "use-case-diagram.mmd");
    await mkdir(path.dirname(mermaidPath), { recursive: true });
    await writeFile(mermaidPath, renderUseCaseDiagramMermaid(model, contextId), "utf8");
    mermaidPaths.push(mermaidPath);
  }

  const manifestPath = await writeProjectionManifest(
    root,
    buildProjectionManifest({
      root,
      projectedViews,
      authority: "review_cache",
      sourceCachePaths: [modelCachePath]
    })
  );
  return {
    manifestPath,
    useCaseListViewPath,
    useCaseViewPaths,
    mermaidPaths
  };
}

async function commandReviewQueue(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const includeAccepted = args["include-accepted"] === true;
  const reviewDocuments = await readQualityReviewDocumentModel(root);
  const latestProgress = await readQualityReviewProgress(root);
  const progressSupersedesDocuments = Boolean(
    latestProgress
    && !isStaleReviewProgress(latestProgress)
    && latestProgress.scope !== "category"
    && latestProgress.runId !== reviewDocuments?.run.id
    && (!reviewDocuments?.run || timestampValue(latestProgress.startedAt) >= timestampValue(reviewDocuments.run.generatedAt))
  );
  const rawReviewFindings = reviewDocuments?.findings ?? [];
  const reviewFindings = includeAccepted
    ? rawReviewFindings
    : rawReviewFindings.filter((finding) => !isResolvedFindingStatus(finding.status));
  const qualityReview = buildQualityReviewQueueSummary(
    root,
    reviewFindings,
    progressSupersedesDocuments ? undefined : reviewDocuments?.run,
    progressSupersedesDocuments ? latestProgress : undefined
  );
  const foundation = undefined;
  const memorySuggestions: unknown[] = [];
  const findingStatusPatches: unknown[] = [];
  const result = {
    ok: true,
    root,
    generatedAt: new Date().toISOString(),
    includeAccepted,
    counts: {
      memorySuggestions: memorySuggestions.length,
      findingStatusPatches: findingStatusPatches.length,
      qualityFindings: reviewFindings.length,
      total: reviewFindings.length + memorySuggestions.length + findingStatusPatches.length
    },
    qualityReview,
    reviewFindings,
    reviewDocuments: {
      exists: Boolean(reviewDocuments),
      rootDocPath: QUALITY_REVIEW_DOC_RELATIVE_PATH,
      rootHtmlPath: QUALITY_REVIEW_HTML_RELATIVE_PATH,
      categoryDocuments: reviewDocuments?.documents.categories ?? [],
      issueDocuments: reviewDocuments?.documents.issues ?? []
    },
    foundation,
    memorySuggestions,
    findingStatusPatches
  };
  await maybeWriteJson(args, "out", result);
  outputJson(result);
}

async function commandReviewProgress(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  outputJson(await readQualityReviewProgress(root) ?? null);
}

async function commandReviewRun(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  assertPiReviewEngine(args);
  const category = reviewCategoryArg(args);
  const review = category
    ? await buildPiQualityReviewCategoryRetry(root, args, category)
    : await buildPiQualityReviewFindings(root, args);
  const reviewDocs = await writeQualityReviewDocuments({
    root,
    run: review.run,
    findings: review.findings,
    categoryOrder: [...reviewCategoryOrder]
  });
  const progressEvaluatorResults = category
    ? review.run.evaluatorResults?.filter((result) => result.evaluator.category === category) ?? []
    : review.run.evaluatorResults ?? [];
  const failedEvaluatorResults = progressEvaluatorResults.filter((result) => result.status === "failed");
  const failedEvaluatorCount = failedEvaluatorResults.length;
  const progressFindingCount = category
    ? review.findings.filter((finding) => displayReviewCategory(finding.category) === category).length
    : review.findings.length;
  const progressStatus: ReviewProgressStatus = category
    ? failedEvaluatorCount ? "failed" : "completed"
    : review.run.status === "failed" ? "failed" : "completed";
  await writeReviewProgress(qualityReviewProgressPath(root), {
    schemaVersion: "praxis.reviewProgress.v1",
    runId: review.run.id,
    root,
    source: reviewAgentSource,
    scope: category ? "category" : "full",
    retryCategory: category,
    status: progressStatus,
    startedAt: review.run.generatedAt,
    updatedAt: new Date().toISOString(),
    totalCategories: category ? 1 : reviewCategoryOrder.length,
    completedCategories: category ? 1 : reviewCategoryOrder.length,
    currentCategory: category,
    currentEvaluator: category ? reviewEvaluatorFor(category, root).name : undefined,
    message: category
      ? progressStatus === "failed"
        ? `评审项重试失败：${reviewEvaluatorFor(category, root).name}。`
        : `评审项已完成重试：${reviewEvaluatorFor(category, root).name}，当前候选问题 ${progressFindingCount} 个。`
      : progressStatus === "failed"
        ? `工程评估失败：${failedEvaluatorCount} 个分类全部失败。`
        : failedEvaluatorCount
          ? `工程评估部分完成，生成 ${review.findings.length} 个候选问题；${failedEvaluatorCount} 个分类失败。`
          : `工程评估完成，生成 ${review.findings.length} 个候选问题。`,
    findings: progressFindingCount,
    error: failedEvaluatorCount ? failedEvaluatorResults.map((result) => result.summary).join("\n") : undefined,
    evaluatorResults: progressEvaluatorResults
  });
  outputJson({
    ok: true,
    root,
    run: review.run,
    findings: review.findings,
    candidateMemoryRecords: 0,
    paths: {
      run: reviewDocs.rootDocPath,
      findings: "docs/review/issues",
      candidateMemory: "",
      reviewDoc: reviewDocs.rootDocPath,
      reviewHtml: reviewDocs.rootHtmlPath,
      categories: reviewDocs.categoryDocuments.map((item) => item.docPath),
      issues: reviewDocs.issueDocuments.map((item) => item.docPath)
    }
  });
}

async function commandReviewFindingRefresh(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  assertPiReviewEngine(args);
  const findingId = required(args, "finding");
  const reviewDocuments = await readQualityReviewDocumentModel(root);
  if (!reviewDocuments) throw new Error(`Quality review documents not found: ${QUALITY_REVIEW_DOC_RELATIVE_PATH}`);
  const findings = reviewDocuments.findings;
  const finding = findings.find((item) => item.id === findingId);
  if (!finding) throw new Error(`Review finding not found in review documents: ${findingId}`);

  const startedAt = new Date().toISOString();
  const runId = `finding-refresh-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const evaluator = reviewEvaluatorFor(finding.category, root);
  const prompt = buildPiFindingRefreshPrompt(root, args, finding);
  const result = await runPiReviewPrompt({
    root,
    args,
    runId,
    category: finding.category,
    evaluator,
    prompt,
    timeoutMs: timeoutMsArg(args, ["finding-refresh-timeout-ms", "review-pi-timeout-ms", "pi-timeout-ms"], 180_000)
  });
  const patch = parsePiFindingStatusPatch(result.stdout, finding, runId, startedAt);
  const updatedFindings = findings.map((item) => item.id === finding.id ? reviewFindingWithRefreshPatch(item, patch) : item);
  const updatedRun = ReviewRunSchema.parse({
    ...reviewDocuments.run,
    findingIds: updatedFindings.map((item) => item.id),
    evaluatorResults: completeReviewEvaluatorResults(updatedFindings, reviewDocuments.run.evaluatorResults ?? [], undefined, root),
    summary: buildReviewRunSummary(updatedFindings)
  } satisfies ReviewRun);
  const reviewDocs = await writeQualityReviewDocuments({
    root,
    run: updatedRun,
    findings: updatedFindings,
    categoryOrder: [...reviewCategoryOrder]
  });
  outputJson({
    ok: true,
    root,
    findingId: finding.id,
    patch,
    paths: {
      reviewDoc: reviewDocs.rootDocPath,
      reviewHtml: reviewDocs.rootHtmlPath,
      issues: reviewDocs.issueDocuments.map((item) => item.docPath)
    },
    diagnostics: result.diagnostics
  });
}

function assertPiReviewEngine(args: Args): void {
  const requested = stringArg(args, "engine") ?? stringArg(args, "mode") ?? process.env.PRAXIS_REVIEW_ENGINE;
  if (!requested) return;
  const normalized = requested.trim().toLowerCase();
  if (normalized === "pi" || normalized === "pi-agent" || normalized === "agent") return;
  throw new Error([
    `Engineering review must run through the configured Agent Engine; unsupported review engine: ${requested}.`,
    "Rerun review-run without --engine/--mode, or use --engine agent."
  ].join("\n"));
}

function reviewCategoryArg(args: Args): ReviewCategory | undefined {
  const raw = args.category;
  if (raw === undefined) return undefined;
  const parsed = reviewCategoryValue(raw);
  if (!parsed || parsed === "foundation_integrity") {
    throw new Error(`Unsupported review category: ${String(raw)}.`);
  }
  return parsed;
}

function latestFindingStatusPatch(patches: FindingStatusPatch[] | undefined): FindingStatusPatch | undefined {
  if (!patches?.length) return undefined;
  return patches
    .slice()
    .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt) || left.id.localeCompare(right.id))
    .at(-1);
}

function reviewFindingWithRefreshPatch(finding: ReviewFinding, patch: FindingStatusPatch): ReviewFinding {
  const evidence = patch.evidence.length
    ? [
      ...finding.evidence,
      ...patch.evidence.slice(0, 3).map((item) => ({
        source: "agent" as const,
        path: item.filePath,
        summary: patch.summary,
        excerpt: item.excerpt
      }))
    ]
    : finding.evidence;
  const affectedAnchors = unique([
    ...finding.affectedAnchors.map((anchor) => JSON.stringify(anchor)),
    ...patch.evidence.slice(0, 3).map((item) => JSON.stringify(fileAnchor(item.filePath)))
  ]).map((value) => JSON.parse(value) as GraphAnchor);
  return ReviewFindingSchema.parse({
    ...finding,
    status: patch.status,
    summary: patch.summary || finding.summary,
    whyItMatters: patch.rationale || finding.whyItMatters,
    evidence,
    affectedAnchors,
    traceIds: unique([...finding.traceIds, `trace:${patch.sourceResultId ?? patch.id}`]),
    updatedAt: patch.createdAt
  } satisfies ReviewFinding);
}

function isResolvedReviewStatus(status: FindingStatusPatch["status"]): boolean {
  return status === "resolved" || status === "false_positive" || status === "mitigated" || status === "accepted_risk";
}

async function readQualityReviewProgress(root: string): Promise<ReviewProgressSnapshot | undefined> {
  const parsed = await tryReadJsonFile(qualityReviewProgressPath(root));
  return parseReviewProgressSnapshot(parsed);
}

function parseReviewProgressSnapshot(parsed: unknown): ReviewProgressSnapshot | undefined {
  if (!isRecord(parsed)) return undefined;
  if (parsed.schemaVersion !== "praxis.reviewProgress.v1") return undefined;
  if (typeof parsed.runId !== "string" || typeof parsed.root !== "string") return undefined;
  if (parsed.status !== "running" && parsed.status !== "completed" && parsed.status !== "failed") return undefined;
  if (parsed.source !== "agent" && parsed.source !== "pi-agent" && parsed.source !== "praxis-heuristic") return undefined;
  return {
    schemaVersion: "praxis.reviewProgress.v1",
    runId: parsed.runId,
    root: parsed.root,
    source: parsed.source === "pi-agent" ? reviewAgentSource : parsed.source,
    scope: parsed.scope === "category" ? "category" : parsed.scope === "full" ? "full" : undefined,
    retryCategory: reviewCategoryValue(parsed.retryCategory),
    retryOfRunId: typeof parsed.retryOfRunId === "string" ? parsed.retryOfRunId : undefined,
    status: parsed.status,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date(0).toISOString(),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    totalCategories: typeof parsed.totalCategories === "number" ? parsed.totalCategories : reviewCategoryOrder.length,
    completedCategories: typeof parsed.completedCategories === "number" ? parsed.completedCategories : 0,
    currentCategory: reviewCategoryValue(parsed.currentCategory),
    currentEvaluator: typeof parsed.currentEvaluator === "string" ? parsed.currentEvaluator : undefined,
    message: typeof parsed.message === "string" ? parsed.message : "",
    findings: typeof parsed.findings === "number" ? parsed.findings : 0,
    error: typeof parsed.error === "string" ? parsed.error : undefined,
    evaluatorResults: reviewEvaluatorResultArray(parsed.evaluatorResults),
    pi: reviewProgressPiState(parsed.pi),
    events: reviewProgressEventArray(parsed.events)
  };
}

function reviewProgressPiState(value: unknown): ReviewProgressPiState | undefined {
  if (!isRecord(value)) return undefined;
  const provider = typeof value.provider === "string" ? value.provider : undefined;
  const model = typeof value.model === "string" ? value.model : undefined;
  if (!provider || !model) return undefined;
  return {
    provider,
    model,
    tools: Array.isArray(value.tools) ? value.tools.filter((item): item is string => typeof item === "string") : [],
    eventCount: typeof value.eventCount === "number" && Number.isFinite(value.eventCount) ? value.eventCount : 0,
    lastEventAt: typeof value.lastEventAt === "string" ? value.lastEventAt : undefined,
    lastEventType: typeof value.lastEventType === "string" ? value.lastEventType : undefined,
    lastToolName: typeof value.lastToolName === "string" ? value.lastToolName : undefined,
    lastToolStatus: typeof value.lastToolStatus === "string" ? value.lastToolStatus : undefined,
    lastToolInput: typeof value.lastToolInput === "string" ? value.lastToolInput : undefined,
    lastToolOutput: typeof value.lastToolOutput === "string" ? value.lastToolOutput : undefined,
    lastAssistantText: typeof value.lastAssistantText === "string" ? value.lastAssistantText : undefined,
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics.filter((item): item is string => typeof item === "string") : undefined
  };
}

function reviewProgressEventArray(value: unknown): ReviewProgressEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const events = value.flatMap((item): ReviewProgressEvent[] => {
    if (!isRecord(item) || typeof item.timestamp !== "string" || typeof item.type !== "string" || typeof item.summary !== "string") return [];
    return [{
      timestamp: item.timestamp,
      type: item.type,
      summary: item.summary,
      toolName: typeof item.toolName === "string" ? item.toolName : undefined,
      status: typeof item.status === "string" ? item.status : undefined
    }];
  });
  return events.length ? events.slice(-12) : undefined;
}

function isStaleReviewProgress(progress: ReviewProgressSnapshot): boolean {
  if (progress.status !== "running") return false;
  const updatedAt = new Date(progress.pi?.lastEventAt ?? progress.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > staleReviewProgressMs;
}

function reviewCategoryValue(value: unknown): ReviewCategory | undefined {
  const parsed = ReviewCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function reviewEvaluatorResultArray(value: unknown): NonNullable<ReviewRun["evaluatorResults"]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const results: NonNullable<ReviewRun["evaluatorResults"]> = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const evaluator = isRecord(item.evaluator) ? item.evaluator : {};
    const category = reviewCategoryValue(evaluator.category);
    if (!category) continue;
    const status = item.status === "completed" || item.status === "partial" || item.status === "failed" ? item.status : undefined;
    if (!status) continue;
    results.push({
      evaluator: {
        id: typeof evaluator.id === "string" && evaluator.id.trim() ? evaluator.id : reviewEvaluatorFor(category).id,
        name: typeof evaluator.name === "string" && evaluator.name.trim() ? evaluator.name : reviewEvaluatorFor(category).name,
        category,
        prompt: typeof evaluator.prompt === "string" && evaluator.prompt.trim() ? evaluator.prompt : reviewEvaluatorFor(category).prompt,
        source: reviewAgentSource
      },
      status,
      findingIds: Array.isArray(item.findingIds) ? item.findingIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [],
      summary: typeof item.summary === "string" && item.summary.trim() ? item.summary : "评审项状态可用，但没有返回摘要。"
    });
  }
  return results;
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const reviewCategoryOrder = [
  "architecture_boundaries",
  "dependencies_coupling",
  "build_release",
  "testing_verification",
  "security_secrets",
  "configuration_environment",
  "code_quality_maintainability",
  "api_contracts_data_flow",
  "performance_resources",
  "documentation_knowledge"
] as const satisfies readonly ReviewCategory[];

const reviewEvaluatorProfiles: Record<ReviewCategory, ReviewEvaluatorRef> = {
  foundation_integrity: {
    id: "knowledge-memory-evaluator",
    name: "文档、知识与项目记忆缺口评估器",
    category: "documentation_knowledge",
    source: "praxis-heuristic",
    prompt: "review-documentation-knowledge"
  },
  architecture_boundaries: {
    id: "architecture-boundary-evaluator",
    name: "架构与模块边界评估器",
    category: "architecture_boundaries",
    source: "praxis-heuristic",
    prompt: "review-architecture-boundaries"
  },
  dependencies_coupling: {
    id: "dependency-coupling-evaluator",
    name: "依赖与耦合评估器",
    category: "dependencies_coupling",
    source: "praxis-heuristic",
    prompt: "review-dependencies-coupling"
  },
  build_release: {
    id: "build-release-evaluator",
    name: "构建与发布评估器",
    category: "build_release",
    source: "praxis-heuristic",
    prompt: "review-build-release"
  },
  testing_verification: {
    id: "testing-verification-evaluator",
    name: "测试与验证评估器",
    category: "testing_verification",
    source: "praxis-heuristic",
    prompt: "review-testing-verification"
  },
  security_secrets: {
    id: "security-secrets-evaluator",
    name: "安全与敏感信息评估器",
    category: "security_secrets",
    source: "praxis-heuristic",
    prompt: "review-security-secrets"
  },
  configuration_environment: {
    id: "configuration-environment-evaluator",
    name: "配置与环境评估器",
    category: "configuration_environment",
    source: "praxis-heuristic",
    prompt: "review-configuration-environment"
  },
  code_quality_maintainability: {
    id: "maintainability-evaluator",
    name: "代码质量与可维护性评估器",
    category: "code_quality_maintainability",
    source: "praxis-heuristic",
    prompt: "review-code-quality-maintainability"
  },
  api_contracts_data_flow: {
    id: "api-data-flow-evaluator",
    name: "接口契约与数据流评估器",
    category: "api_contracts_data_flow",
    source: "praxis-heuristic",
    prompt: "review-api-contracts-data-flow"
  },
  performance_resources: {
    id: "performance-resource-evaluator",
    name: "性能与资源风险评估器",
    category: "performance_resources",
    source: "praxis-heuristic",
    prompt: "review-performance-resources"
  },
  documentation_knowledge: {
    id: "knowledge-memory-evaluator",
    name: "文档、知识与项目记忆缺口评估器",
    category: "documentation_knowledge",
    source: "praxis-heuristic",
    prompt: "review-documentation-knowledge"
  }
};

function reviewEvaluatorFor(category: ReviewCategory, root?: string): ReviewEvaluatorRef {
  const displayCategory = displayReviewCategory(category);
  const profile = reviewEvaluatorProfiles[category] ?? reviewEvaluatorProfiles[displayCategory];
  return {
    ...profile,
    category: displayCategory,
    prompt: getPrompt(reviewPromptNameForCategory(displayCategory), { overrideDirs: root ? reviewPromptOverrideDirs(root) : undefined }).body
  };
}

function reviewPromptOverrideDirs(root: string): string[] {
  const envDirs = process.env.PRAXIS_PROMPT_DIR
    ?.split(path.delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean) ?? [];
  return [path.join(root, "docs", "prompts"), ...envDirs];
}

type ReviewProgressStatus = "running" | "completed" | "failed";
const reviewAgentSource = "agent" as const;
const staleReviewProgressMs = 2 * 60 * 1000;

interface ReviewProgressSnapshot {
  schemaVersion: "praxis.reviewProgress.v1";
  runId: string;
  root: string;
  source: "agent" | "pi-agent" | "praxis-heuristic";
  scope?: "full" | "category";
  retryCategory?: ReviewCategory;
  retryOfRunId?: string;
  status: ReviewProgressStatus;
  startedAt: string;
  updatedAt: string;
  totalCategories: number;
  completedCategories: number;
  currentCategory?: ReviewCategory;
  currentEvaluator?: string;
  message: string;
  findings: number;
  error?: string;
  evaluatorResults?: NonNullable<ReviewRun["evaluatorResults"]>;
  pi?: ReviewProgressPiState;
  events?: ReviewProgressEvent[];
}

interface ReviewProgressPiState {
  provider: string;
  model: string;
  tools: string[];
  eventCount: number;
  lastEventAt?: string;
  lastEventType?: string;
  lastToolName?: string;
  lastToolStatus?: string;
  lastToolInput?: string;
  lastToolOutput?: string;
  lastAssistantText?: string;
  diagnostics?: string[];
}

interface ReviewProgressEvent {
  timestamp: string;
  type: string;
  summary: string;
  toolName?: string;
  status?: string;
}

async function buildPiQualityReviewFindings(root: string, args: Args): Promise<{ run: ReviewRun; findings: ReviewFinding[] }> {
  const generatedAt = new Date().toISOString();
  const runId = `review-run-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const progressPath = qualityReviewProgressPath(root);
  const findingsOut: ReviewFinding[] = [];
  const evaluatorResults: NonNullable<ReviewRun["evaluatorResults"]> = [];

  await writeReviewProgress(progressPath, {
    schemaVersion: "praxis.reviewProgress.v1",
    runId,
    root,
    source: reviewAgentSource,
    status: "running",
    startedAt: generatedAt,
    updatedAt: new Date().toISOString(),
    totalCategories: reviewCategoryOrder.length,
    completedCategories: 0,
    message: "工程评估已启动，正在按分类顺序运行。",
    findings: 0,
    evaluatorResults: []
  });

  try {
    const heuristic = { findings: [] as ReviewFinding[] };
    for (const category of reviewCategoryOrder) {
      const evaluator = reviewEvaluatorFor(category, root);
      const categoryProgressBase: ReviewProgressSnapshot = {
        schemaVersion: "praxis.reviewProgress.v1",
        runId,
        root,
        source: reviewAgentSource,
        status: "running",
        startedAt: generatedAt,
        updatedAt: new Date().toISOString(),
        totalCategories: reviewCategoryOrder.length,
        completedCategories: evaluatorResults.length,
        currentCategory: category,
        currentEvaluator: evaluator.name,
        message: `正在评估：${evaluator.name}`,
        findings: findingsOut.length,
        evaluatorResults
      };
      await writeReviewProgress(progressPath, {
        ...categoryProgressBase
      });

      let categoryFindings: ReviewFinding[] = [];
      let categoryError: string | undefined;
      try {
        categoryFindings = await runPiQualityReviewCategory({
          root,
          args,
          runId,
          generatedAt,
          category,
          evaluator,
          heuristicFindings: heuristic.findings.filter((finding) => displayReviewCategory(finding.category) === category),
          progressPath,
          progressBase: categoryProgressBase
        });
        findingsOut.push(...categoryFindings);
        evaluatorResults.push({
          evaluator: { ...evaluator, source: reviewAgentSource },
          status: "completed",
          findingIds: categoryFindings.map((finding) => finding.id),
          summary: categoryFindings.length
            ? `本评审项生成 ${categoryFindings.length} 个候选问题。`
            : "本评审项没有返回候选问题；不代表该类别健康。"
        });
      } catch (error) {
        categoryError = error instanceof Error ? error.message : String(error);
        const fallbackFindings = await buildLocalQualityReviewFindings(root, {
          runId,
          generatedAt,
          category
        });
        if (fallbackFindings.length > 0) {
          categoryFindings = fallbackFindings;
          findingsOut.push(...categoryFindings);
          evaluatorResults.push({
            evaluator: { ...evaluator, source: reviewAgentSource },
            status: "completed",
            findingIds: categoryFindings.map((finding) => finding.id),
            summary: `已基于本地仓库证据生成 ${categoryFindings.length} 个候选问题；这些结论仍需在评审页面继续解释、转计划或判伪。`
          });
          categoryError = undefined;
          await appendPiReviewCategoryLog(root, runId, {
            schemaVersion: "praxis.reviewFallbackLog.v1",
            timestamp: new Date().toISOString(),
            runId,
            category,
            evaluator: { ...evaluator, source: reviewAgentSource },
            status: "fallback_completed",
            error: summarizeForRun(error instanceof Error ? error.message : String(error), 2000),
            fallbackFindingIds: categoryFindings.map((finding) => finding.id)
          });
        } else {
          evaluatorResults.push({
            evaluator: { ...evaluator, source: reviewAgentSource },
            status: "completed",
            findingIds: [],
            summary: "本地仓库证据暂未发现可落文档的候选问题；这不代表该类别健康。"
          });
          categoryError = undefined;
          await appendPiReviewCategoryLog(root, runId, {
            schemaVersion: "praxis.reviewFallbackLog.v1",
            timestamp: new Date().toISOString(),
            runId,
            category,
            evaluator: { ...evaluator, source: reviewAgentSource },
            status: "fallback_completed",
            error: summarizeForRun(error instanceof Error ? error.message : String(error), 2000),
            fallbackFindingIds: []
          });
        }
      }

      await writeReviewProgress(progressPath, {
        schemaVersion: "praxis.reviewProgress.v1",
        runId,
        root,
        source: reviewAgentSource,
        status: "running",
        startedAt: generatedAt,
        updatedAt: new Date().toISOString(),
        totalCategories: reviewCategoryOrder.length,
        completedCategories: evaluatorResults.length,
        currentCategory: category,
        currentEvaluator: evaluator.name,
        message: categoryError ? `评审项失败，继续下一类：${evaluator.name}` : `评审项已完成：${evaluator.name}`,
        findings: findingsOut.length,
        error: categoryError,
        evaluatorResults
      });
    }

    const sorted = sortReviewFindings(dedupeReviewFindings(findingsOut)).map((finding) => ReviewFindingSchema.parse(finding));
    const failedEvaluators = evaluatorResults.filter((result) => result.status === "failed");
    const runStatus: ReviewRun["status"] = failedEvaluators.length === evaluatorResults.length
      ? "failed"
      : failedEvaluators.length
        ? "partial"
        : "completed";
    const run = ReviewRunSchema.parse({
      schemaVersion: "praxis.reviewRun.v1",
      id: runId,
      root,
      generatedAt,
      source: reviewAgentSource,
      status: runStatus,
      categories: [...reviewCategoryOrder],
      findingIds: sorted.map((finding) => finding.id),
      evaluatorResults: completeReviewEvaluatorResults(sorted, evaluatorResults, undefined, root),
      summary: buildReviewRunSummary(sorted),
      traceIds: []
    } satisfies ReviewRun);

    await writeReviewProgress(progressPath, {
      schemaVersion: "praxis.reviewProgress.v1",
      runId,
      root,
      source: reviewAgentSource,
      status: runStatus === "failed" ? "failed" : "completed",
      startedAt: generatedAt,
      updatedAt: new Date().toISOString(),
      totalCategories: reviewCategoryOrder.length,
      completedCategories: reviewCategoryOrder.length,
      message: runStatus === "failed"
        ? `工程评估失败：${failedEvaluators.length} 个分类全部失败。`
        : runStatus === "partial"
          ? `工程评估部分完成，生成 ${sorted.length} 个候选问题；${failedEvaluators.length} 个分类失败。`
          : `工程评估完成，生成 ${sorted.length} 个候选问题。`,
      findings: sorted.length,
      error: failedEvaluators.length ? failedEvaluators.map((result) => result.summary).join("\n") : undefined,
      evaluatorResults
    });

    return { run, findings: sorted };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await writeReviewProgress(progressPath, {
      schemaVersion: "praxis.reviewProgress.v1",
      runId,
      root,
      source: reviewAgentSource,
      status: "failed",
      startedAt: generatedAt,
      updatedAt: new Date().toISOString(),
      totalCategories: reviewCategoryOrder.length,
      completedCategories: evaluatorResults.length,
      message: "工程评估失败。",
      findings: findingsOut.length,
      error: errorMessage,
      evaluatorResults
    });
    throw error;
  }
}

async function buildPiQualityReviewCategoryRetry(
  root: string,
  args: Args,
  category: ReviewCategory
): Promise<{ run: ReviewRun; findings: ReviewFinding[] }> {
  const generatedAt = new Date().toISOString();
  const runId = `review-run-retry-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const progressPath = qualityReviewProgressPath(root);
  const evaluator = reviewEvaluatorFor(category, root);
  const existingReviewDocuments = await readQualityReviewDocumentModel(root);
  const latestRun = existingReviewDocuments?.run;
  const previousFindings = existingReviewDocuments?.findings ?? [];
  const previousCategoryFindings = previousFindings.filter((finding) => displayReviewCategory(finding.category) === category);
  const preservedFindings = previousFindings.filter((finding) => displayReviewCategory(finding.category) !== category);
  const previousEvaluatorResults = latestRun?.evaluatorResults?.length
    ? latestRun.evaluatorResults
    : buildReviewEvaluatorResults(previousFindings, root) ?? [];
  const retryOfRunId = latestRun?.id;

  const runningProgress = {
    schemaVersion: "praxis.reviewProgress.v1" as const,
    runId,
    root,
    source: reviewAgentSource,
    scope: "category" as const,
    retryCategory: category,
    retryOfRunId,
    status: "running" as const,
    startedAt: generatedAt,
    updatedAt: new Date().toISOString(),
    totalCategories: 1,
    completedCategories: 0,
    currentCategory: category,
    currentEvaluator: evaluator.name,
    message: `正在重试评审项：${evaluator.name}`,
    findings: previousCategoryFindings.length,
    evaluatorResults: [{
      evaluator: { ...evaluator, source: reviewAgentSource },
      status: "partial",
      findingIds: previousCategoryFindings.map((finding) => finding.id),
      summary: "正在重新评估这个分类，旧结果会在成功后被替换。"
    }]
  } satisfies ReviewProgressSnapshot;
  await writeReviewProgress(progressPath, runningProgress);

  try {
    const heuristic = { findings: [] as ReviewFinding[] };
    const categoryFindings = await runPiQualityReviewCategory({
      root,
      args,
      runId,
      generatedAt,
      category,
      evaluator,
      heuristicFindings: heuristic.findings.filter((finding) => displayReviewCategory(finding.category) === category),
      progressPath,
      progressBase: runningProgress
    });
    const sorted = sortReviewFindings(dedupeReviewFindings([...preservedFindings, ...categoryFindings]))
      .map((finding) => ReviewFindingSchema.parse(finding));
    const evaluatorResults = replaceEvaluatorResult(
      completeReviewEvaluatorResults(sorted, previousEvaluatorResults, undefined, root),
      category,
      {
        evaluator: { ...evaluator, source: reviewAgentSource },
        status: "completed",
        findingIds: categoryFindings.map((finding) => finding.id),
        summary: categoryFindings.length
          ? `本评审项重新评估生成 ${categoryFindings.length} 个候选问题。`
          : "本评审项已重新评估，但没有返回候选问题；这不代表该类别健康。"
      },
      root
    );
    const failedEvaluators = evaluatorResults.filter((result) => result.status === "failed");
    const run = ReviewRunSchema.parse({
      schemaVersion: "praxis.reviewRun.v1",
      id: runId,
      root,
      generatedAt,
      source: reviewAgentSource,
      status: failedEvaluators.length ? "partial" : "completed",
      categories: [...reviewCategoryOrder],
      findingIds: sorted.map((finding) => finding.id),
      evaluatorResults,
      summary: buildReviewRunSummary(sorted),
      traceIds: []
    } satisfies ReviewRun);

    await writeReviewProgress(progressPath, {
      schemaVersion: "praxis.reviewProgress.v1",
      runId,
      root,
      source: reviewAgentSource,
      scope: "category",
      retryCategory: category,
      retryOfRunId,
      status: "completed",
      startedAt: generatedAt,
      updatedAt: new Date().toISOString(),
      totalCategories: 1,
      completedCategories: 1,
      currentCategory: category,
      currentEvaluator: evaluator.name,
      message: `评审项已完成重试：${evaluator.name}，当前候选问题 ${categoryFindings.length} 个。`,
      findings: categoryFindings.length,
      evaluatorResults: [{
        evaluator: { ...evaluator, source: reviewAgentSource },
        status: "completed",
        findingIds: categoryFindings.map((finding) => finding.id),
        summary: categoryFindings.length
          ? `本评审项重新评估生成 ${categoryFindings.length} 个候选问题。`
          : "本评审项已重新评估，但没有返回候选问题；这不代表该类别健康。"
      }]
    });

    return { run, findings: sorted };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const categoryFindings = await buildLocalQualityReviewFindings(root, {
      runId,
      generatedAt,
      category
    });
    if (categoryFindings.length > 0) {
      const sorted = sortReviewFindings(dedupeReviewFindings([...preservedFindings, ...categoryFindings]))
        .map((finding) => ReviewFindingSchema.parse(finding));
      const evaluatorResults = replaceEvaluatorResult(
        completeReviewEvaluatorResults(sorted, previousEvaluatorResults, undefined, root),
        category,
        {
          evaluator: { ...evaluator, source: reviewAgentSource },
          status: "completed",
          findingIds: categoryFindings.map((finding) => finding.id),
          summary: `已基于本地仓库证据重新生成 ${categoryFindings.length} 个候选问题；这些结论仍需在评审页面继续解释、转计划或判伪。`
        },
        root
      );
      const failedEvaluators = evaluatorResults.filter((result) => result.status === "failed");
      const run = ReviewRunSchema.parse({
        schemaVersion: "praxis.reviewRun.v1",
        id: runId,
        root,
        generatedAt,
        source: reviewAgentSource,
        status: failedEvaluators.length ? "partial" : "completed",
        categories: [...reviewCategoryOrder],
        findingIds: sorted.map((finding) => finding.id),
        evaluatorResults,
        summary: buildReviewRunSummary(sorted),
        traceIds: []
      } satisfies ReviewRun);
      await appendPiReviewCategoryLog(root, runId, {
        schemaVersion: "praxis.reviewFallbackLog.v1",
        timestamp: new Date().toISOString(),
        runId,
        category,
        evaluator: { ...evaluator, source: reviewAgentSource },
        status: "fallback_completed",
        error: summarizeForRun(errorMessage, 2000),
        fallbackFindingIds: categoryFindings.map((finding) => finding.id)
      });
      await writeReviewProgress(progressPath, {
        schemaVersion: "praxis.reviewProgress.v1",
        runId,
        root,
        source: reviewAgentSource,
        scope: "category",
        retryCategory: category,
        retryOfRunId,
        status: "completed",
        startedAt: generatedAt,
        updatedAt: new Date().toISOString(),
        totalCategories: 1,
        completedCategories: 1,
        currentCategory: category,
        currentEvaluator: evaluator.name,
        message: `评审项已使用本地仓库证据完成重试：${evaluator.name}，当前候选问题 ${categoryFindings.length} 个。`,
        findings: categoryFindings.length,
        evaluatorResults: [{
          evaluator: { ...evaluator, source: reviewAgentSource },
          status: "completed",
          findingIds: categoryFindings.map((finding) => finding.id),
          summary: `已基于本地仓库证据重新生成 ${categoryFindings.length} 个候选问题；这些结论仍需在评审页面继续解释、转计划或判伪。`
        }]
      });
      return { run, findings: sorted };
    }
    const sorted = sortReviewFindings(dedupeReviewFindings(preservedFindings))
      .map((finding) => ReviewFindingSchema.parse(finding));
    const evaluatorResults = replaceEvaluatorResult(
      completeReviewEvaluatorResults(sorted, previousEvaluatorResults, undefined, root),
      category,
      {
        evaluator: { ...evaluator, source: reviewAgentSource },
        status: "completed",
        findingIds: [],
        summary: "本地仓库证据暂未发现可落文档的候选问题；这不代表该类别健康。"
      },
      root
    );
    const failedEvaluators = evaluatorResults.filter((result) => result.status === "failed");
    const run = ReviewRunSchema.parse({
      schemaVersion: "praxis.reviewRun.v1",
      id: runId,
      root,
      generatedAt,
      source: reviewAgentSource,
      status: failedEvaluators.length ? "partial" : "completed",
      categories: [...reviewCategoryOrder],
      findingIds: sorted.map((finding) => finding.id),
      evaluatorResults,
      summary: buildReviewRunSummary(sorted),
      traceIds: []
    } satisfies ReviewRun);
    await appendPiReviewCategoryLog(root, runId, {
      schemaVersion: "praxis.reviewFallbackLog.v1",
      timestamp: new Date().toISOString(),
      runId,
      category,
      evaluator: { ...evaluator, source: reviewAgentSource },
      status: "fallback_completed",
      error: summarizeForRun(errorMessage, 2000),
      fallbackFindingIds: []
    });
    await writeReviewProgress(progressPath, {
      schemaVersion: "praxis.reviewProgress.v1",
      runId,
      root,
      source: reviewAgentSource,
      scope: "category",
      retryCategory: category,
      retryOfRunId,
      status: "completed",
      startedAt: generatedAt,
      updatedAt: new Date().toISOString(),
      totalCategories: 1,
      completedCategories: 1,
      currentCategory: category,
      currentEvaluator: evaluator.name,
      message: `评审项已完成重试：${evaluator.name}，当前候选问题 0 个。`,
      findings: 0,
      evaluatorResults: [{
        evaluator: { ...evaluator, source: reviewAgentSource },
        status: "completed",
        findingIds: [],
        summary: "本地仓库证据暂未发现可落文档的候选问题；这不代表该类别健康。"
      }]
    });
    return { run, findings: sorted };
  }
}

async function runPiQualityReviewCategory(input: {
  root: string;
  args: Args;
  runId: string;
  generatedAt: string;
  category: ReviewCategory;
  evaluator: ReviewEvaluatorRef;
  heuristicFindings: ReviewFinding[];
  progressPath?: string;
  progressBase?: ReviewProgressSnapshot;
}): Promise<ReviewFinding[]> {
  const prompt = buildPiQualityReviewPrompt(input);
  const pi = await runPiReviewPrompt({
    root: input.root,
    args: input.args,
    runId: input.runId,
    category: input.category,
    evaluator: input.evaluator,
    prompt,
    timeoutMs: reviewPiTimeoutMsArg(input.args, 0),
    progressPath: input.progressPath,
    progressBase: input.progressBase
  });
  return parsePiReviewFindings(pi.stdout, input);
}

async function runPiReviewPrompt(input: PiReviewPromptRunInput): Promise<PiWorkerRunResult> {
  const startedAt = Date.now();
  const progressEvents: ReviewProgressEvent[] = [];
  const progressBase = input.progressBase;
  const thinking = stringArg(input.args, "review-pi-thinking") ?? loadPiRuntimeSettingsSync().reviewThinking;
  let launchMetadata: {
    route: { provider: string; model: string };
    tools: string[];
    diagnostics: string[];
  } | undefined;
  const launched = await launchPiJsonWorker({
    projectRoot: input.root,
    args: input.args,
    mode: "plan",
    target: { type: "project" },
    prompt: input.prompt,
    thinking,
    timeoutMs: input.timeoutMs,
    tools: resolvePiReviewToolAllowlist(input.args),
    onStart: async (metadata) => {
      launchMetadata = metadata;
      if (input.progressPath && progressBase) {
        await writeReviewProgress(input.progressPath, reviewProgressWithPiStart(progressBase, metadata));
      }
    },
    onJson: async (event, assistantText) => {
      if (input.progressPath && progressBase) {
        await writeReviewProgress(input.progressPath, reviewProgressWithPiEvent(progressBase, {
          event,
          eventCount: progressEvents.length + 1,
          events: progressEvents,
          route: launchMetadata?.route ?? { provider: "unknown", model: "unknown" },
          tools: launchMetadata?.tools ?? [],
          diagnostics: launchMetadata?.diagnostics ?? [],
          assistantText
        }));
      }
    }
  });

  const cleanStdout = sanitizePiOutput(launched.assistantText || launched.stdout);
  const cleanStderr = sanitizePiOutput(launched.stderr);
  await appendPiReviewCategoryLog(input.root, input.runId, {
    schemaVersion: "praxis.piReviewCategoryLog.v1",
    timestamp: new Date().toISOString(),
    runId: input.runId,
    category: input.category,
    evaluator: { ...input.evaluator, source: reviewAgentSource },
    status: launched.exitCode === 0 ? "completed" : "failed",
    diagnostics: launched.diagnostics,
    stdout: cleanStdout,
    stderr: cleanStderr
  });

  if (launched.exitCode !== 0) {
    const detail = [cleanStderr, cleanStdout].filter(Boolean).join("\n\n").trim();
    throw new Error(formatPiFailureDetail(detail || `Pi exited with code ${launched.exitCode}.`, launched.diagnostics));
  }

  return {
    stdout: cleanStdout,
    stderr: cleanStderr,
    exitCode: launched.exitCode,
    durationMs: Date.now() - startedAt,
    commandLine: launched.commandLine,
    provider: launched.provider,
    model: launched.model,
    modelRoute: launched.modelRoute,
    tools: launched.tools,
    diagnostics: launched.diagnostics
  };
}

function reviewProgressWithPiEvent(base: ReviewProgressSnapshot, input: {
  event: PiJsonEvent;
  eventCount: number;
  events: ReviewProgressEvent[];
  route: { provider: string; model: string };
  tools: string[];
  diagnostics: string[];
  assistantText?: string;
}): ReviewProgressSnapshot {
  const now = new Date().toISOString();
  const toolView = piToolViewFromEvent(input.event);
  const eventType = String(input.event.type ?? "event");
  const eventSummary = toolView
    ? `${toolView.name} ${toolView.status}: ${toolView.outputSummary ?? toolView.inputSummary}`
    : input.assistantText
      ? `评审消息：${summarizeForRun(input.assistantText, 260)}`
      : `评审事件：${eventType}`;
  const eventRecord: ReviewProgressEvent = {
    timestamp: now,
    type: eventType,
    summary: eventSummary,
    toolName: toolView?.name,
    status: toolView?.status
  };
  input.events.push(eventRecord);
  const recentEvents = input.events.slice(-12);
  return {
    ...base,
    updatedAt: now,
    message: toolView
      ? `正在执行工具：${toolView.name}`
      : input.assistantText
        ? "正在生成评估结果。"
        : base.message,
    pi: {
      provider: input.route.provider,
      model: input.route.model,
      tools: input.tools,
      eventCount: input.eventCount,
      lastEventAt: now,
      lastEventType: eventType,
      lastToolName: toolView?.name,
      lastToolStatus: toolView?.status,
      lastToolInput: toolView?.inputSummary,
      lastToolOutput: toolView?.outputSummary,
      lastAssistantText: input.assistantText ? summarizeForRun(input.assistantText, 1200) : undefined,
      diagnostics: input.diagnostics
    },
    events: recentEvents
  };
}

function reviewProgressWithPiStart(base: ReviewProgressSnapshot, input: {
  route: { provider: string; model: string };
  tools: string[];
  diagnostics: string[];
}): ReviewProgressSnapshot {
  const now = new Date().toISOString();
  return {
    ...base,
    updatedAt: now,
    pi: {
      provider: input.route.provider,
      model: input.route.model,
      tools: input.tools,
      eventCount: base.pi?.eventCount ?? 0,
      lastEventAt: base.pi?.lastEventAt,
      lastEventType: base.pi?.lastEventType,
      lastToolName: base.pi?.lastToolName,
      lastToolStatus: base.pi?.lastToolStatus,
      lastToolInput: base.pi?.lastToolInput,
      lastToolOutput: base.pi?.lastToolOutput,
      lastAssistantText: base.pi?.lastAssistantText,
      diagnostics: input.diagnostics
    },
    events: base.events
  };
}

function buildPiQualityReviewPrompt(input: {
  root: string;
  args: Args;
  runId: string;
  generatedAt: string;
  category: ReviewCategory;
  evaluator: ReviewEvaluatorRef;
  heuristicFindings: ReviewFinding[];
}): string {
  const responseLanguage = reviewResponseLanguage(input.args);
  const basePrompt = getPrompt("review-quality-base", { overrideDirs: reviewPromptOverrideDirs(input.root) }).body;
  return renderPromptTemplate(basePrompt, {
    responseLanguage,
    category: input.category,
    evaluatorName: input.evaluator.name,
    categoryPrompt: input.evaluator.prompt,
    heuristicFindingsJson: JSON.stringify(input.heuristicFindings.map((finding) => ({
      title: finding.title,
      severity: finding.severity,
      summary: finding.summary,
      evidence: finding.evidence.slice(0, 3)
    })), null, 2),
    outputSchemaJson: JSON.stringify({
      findings: [
        {
          severity: "P1",
          title: "具体问题标题",
          summary: "具体问题描述，必须说明证据和风险",
          whyItMatters: "为什么这会影响工程质量",
          suggestedAction: "下一步建议",
          confidence: "high",
          evidence: [
            { path: "relative/path", summary: "证据摘要", excerpt: "可选短摘录" }
          ],
          affectedPaths: ["relative/path"]
        }
      ]
    }, null, 2)
  });
}

function reviewTransportPayloadError(action: string, output: string, limit = 3000): string {
  return [
    `Review worker did not return a usable structured review payload while ${action}.`,
    "This payload is only runtime transport; review memory must be written to docs/review Markdown/HTML documents.",
    "",
    "Worker output:",
    output.slice(0, limit)
  ].join("\n");
}

function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

function buildPiFindingRefreshPrompt(root: string, args: Args, finding: ReviewFinding): string {
  const responseLanguage = reviewResponseLanguage(args);
  const evidence = finding.evidence.slice(0, 8).map((item) => ({
    path: item.path ?? item.anchor?.path ?? item.anchor?.id,
    summary: item.summary,
    excerpt: item.excerpt
  }));
  return [
    "You are a Praxis Studio review finding agent.",
    `Respond in the user's language: ${responseLanguage}.`,
    `All user-visible payload string fields MUST use ${responseLanguage}: summary, rationale, evidence.excerpt.`,
    "Return a strict machine-readable JSON payload only. This payload is transient transport; Praxis will render the result into docs/review documents. No Markdown fences. No preface. No explanation outside the payload.",
    "",
    "## Boundary",
    "- Re-check only the single finding below.",
    "- Do not run a whole-project review and do not create unrelated findings.",
    "- Do not edit files or write memory. Praxis will turn your result into a pending FindingStatusPatch.",
    "- Inspect the current repository state with read-only tools. Use repository evidence tools if useful.",
    "- If the issue still exists, return status open.",
    "- If there is credible evidence that it is fixed, return status resolved or mitigated.",
    "- If evidence is insufficient, return status acknowledged and explain what evidence is missing.",
    "",
    "## Project",
    root,
    "",
    "## Finding To Re-check",
    JSON.stringify({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      whyItMatters: finding.whyItMatters,
      suggestedAction: finding.suggestedAction,
      evidence,
      affectedAnchors: finding.affectedAnchors
    }, null, 2),
    "",
    "## Output Transport Payload Shape",
    JSON.stringify({
      status: "open",
      summary: "One-sentence current status of this finding.",
      rationale: "Short evidence-based explanation of why the issue still exists or no longer exists.",
      evidence: [
        { filePath: "relative/path", excerpt: "short current evidence" }
      ]
    }, null, 2)
  ].join("\n");
}

function reviewResponseLanguage(args: Args): string {
  const explicit = stringArg(args, "response-language") ?? stringArg(args, "language") ?? process.env.PRAXIS_RESPONSE_LANGUAGE;
  if (explicit?.trim()) return explicit.trim();
  const locale = stringArg(args, "locale") ?? process.env.PRAXIS_LOCALE;
  if (locale === "zh-CN" || locale?.toLowerCase().startsWith("zh")) return "Simplified Chinese";
  if (locale === "en" || locale?.toLowerCase().startsWith("en")) return "English";
  return "the same language as the user's Praxis Studio UI";
}

function parsePiReviewFindings(
  stdout: string,
  input: {
    runId: string;
    generatedAt: string;
    category: ReviewCategory;
    evaluator: ReviewEvaluatorRef;
  }
): ReviewFinding[] {
  const parsed = parsePiReviewJson(stdout) ?? salvagePiReviewJson(stdout);
  if (!isRecord(parsed) || !Array.isArray(parsed.findings)) {
    throw new Error(reviewTransportPayloadError(`evaluating ${input.category}`, stdout));
  }

  const findings: ReviewFinding[] = [];
  const rejected: string[] = [];
  parsed.findings.forEach((item, index) => {
    if (!isRecord(item)) {
      rejected.push(`findings[${index}] is not an object`);
      return;
    }
    const title = optionalString(item.title);
    const summary = optionalString(item.summary);
    const whyItMatters = optionalString(item.whyItMatters) ?? optionalString(item.why_it_matters);
    const suggestedAction = optionalString(item.suggestedAction) ?? optionalString(item.suggested_action);
    if (!title || !summary) {
      rejected.push(`findings[${index}] is missing title or summary`);
      return;
    }
    const severity = reviewSeverityValue(item.severity);
    const confidence = reviewConfidenceValue(item.confidence);
    const evidenceItems = Array.isArray(item.evidence) ? item.evidence.filter(isRecord) : [];
    const affectedPaths = Array.isArray(item.affectedPaths)
      ? item.affectedPaths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const evidence: ReviewEvidenceRef[] = evidenceItems.length
      ? evidenceItems.map((evidence) => {
        const evidencePath = optionalString(evidence.path);
        return {
        source: evidencePath ? "file" as const : "agent" as const,
        path: evidencePath,
        summary: optionalString(evidence.summary)
          ?? optionalString(evidence.excerpt)?.slice(0, 260)
          ?? (evidencePath ? `该路径提供了本候选问题的证据：${evidencePath}` : `本候选问题缺少路径级证据摘要。`),
        excerpt: optionalString(evidence.excerpt)?.slice(0, 12_000)
      };
      })
      : [{ source: "agent" as const, summary: "本候选问题缺少路径级证据，需要在接受前补充或复核证据。" }];
    const anchors = affectedPaths.length
      ? affectedPaths.slice(0, 12).map((filePath) => fileAnchor(filePath))
      : evidence.flatMap((evidence) => evidence.path ? [fileAnchor(evidence.path)] : []);
    const evaluator: ReviewEvaluatorRef = { ...input.evaluator, source: reviewAgentSource };
    findings.push(ReviewFindingSchema.parse({
      schemaVersion: "praxis.reviewFinding.v1",
      id: `review:${severity.toLowerCase()}:${input.category}:${safeReviewIdPart(title)}:${index + 1}`,
      runId: input.runId,
      category: input.category,
      severity,
      status: "candidate",
      title,
      summary,
      whyItMatters: whyItMatters ?? "本候选问题没有单独影响说明；接受前需要先复核摘要和证据，确认它确实会影响理解、变更、测试、发布或安全。",
      suggestedAction: suggestedAction ?? "先复核证据；证据成立时转入项目变更计划，证据不足时要求补证据或标记为需要复查。",
      confidence,
      source: "agent",
      evaluator,
      knowledgeKind: "CANDIDATE",
      evidence,
      affectedAnchors: anchors.slice(0, 12),
      traceIds: [],
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt
    } satisfies ReviewFinding));
  });
  if (!findings.length && rejected.length) {
    throw new Error(`Review worker returned a structured payload for ${input.category}, but no usable findings could be rendered into docs/review: ${rejected.slice(0, 5).join("; ")}`);
  }
  return findings;
}

function parsePiFindingStatusPatch(
  stdout: string,
  finding: ReviewFinding,
  runId: string,
  createdAt: string
): FindingStatusPatch {
  const parsed = parsePiReviewJson(stdout);
  if (!isRecord(parsed)) {
    throw new Error(reviewTransportPayloadError(`refreshing finding ${finding.id}`, stdout, 2000));
  }
  const rawStatus = optionalString(parsed.status)?.toLowerCase();
  const status = findingStatusValue(rawStatus);
  const summary = optionalString(parsed.summary)
    ?? (status === "open" ? `复查后仍然检测到：${finding.title}` : `复查后状态更新为 ${status}：${finding.title}`);
  const rationale = optionalString(parsed.rationale);
  const evidenceItems = Array.isArray(parsed.evidence) ? parsed.evidence.filter(isRecord) : [];
  const evidence: CodeFactEvidenceRef[] = evidenceItems.length
    ? evidenceItems.map((item) => ({
      source: "agent_inference" as const,
      filePath: optionalString(item.filePath) ?? optionalString(item.path) ?? QUALITY_REVIEW_DOC_RELATIVE_PATH,
      excerpt: optionalString(item.excerpt) ?? optionalString(item.summary) ?? summary
    }))
    : finding.evidence.slice(0, 3).map((item) => ({
      source: item.source === "agent" ? "agent_inference" as const : item.source === "code_fact_graph" ? "codegraph" as const : "repository_scan" as const,
      filePath: item.path ?? item.anchor?.path ?? QUALITY_REVIEW_DOC_RELATIVE_PATH,
      excerpt: item.excerpt ?? item.summary
    }));
  return FindingStatusPatchSchema.parse({
    schemaVersion: "praxis.findingStatusPatch.v1",
    id: `finding-status:${safeFilePart(finding.id)}:${safeFilePart(runId)}`,
    sourceResultId: runId,
    findingId: finding.id,
    status,
    summary,
    rationale,
    evidence,
    createdAt
  } satisfies FindingStatusPatch);
}

function findingStatusValue(value: unknown): FindingStatusPatch["status"] {
  if (
    value === "open"
    || value === "acknowledged"
    || value === "planned"
    || value === "in_progress"
    || value === "mitigated"
    || value === "resolved"
    || value === "false_positive"
    || value === "accepted_risk"
  ) {
    return value;
  }
  return "acknowledged";
}

interface ProjectTreeFileEntry {
  path: string;
  language?: string;
  roleHint?: string;
  lineCount?: number;
  sizeBytes?: number;
}

interface ProjectTreeDirectoryEntry {
  path: string;
  roleHint?: string;
}

interface ProjectTreeNode {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "file";
  children: ProjectTreeNode[];
  fileCount: number;
  directoryCount: number;
  language?: string;
  roleHint?: string;
  lineCount?: number;
  sizeBytes?: number;
  truncated?: boolean;
}

function buildProjectTree(files: ProjectTreeFileEntry[], directories: ProjectTreeDirectoryEntry[], maxDepth: number, maxEntries: number): {
  ok: boolean;
  generatedAt: string;
  maxDepth: number;
  maxEntries: number;
  root: ProjectTreeNode;
  totalFiles: number;
  renderedEntries: number;
  truncated: boolean;
} {
  const root: ProjectTreeNode = {
    id: ".",
    name: ".",
    path: ".",
    kind: "directory",
    children: [],
    fileCount: 0,
    directoryCount: 0
  };
  const byPath = new Map<string, ProjectTreeNode>([[".", root]]);
  const ensureDirectory = (directoryPath: string, roleHint?: string): ProjectTreeNode => {
    const parts = directoryPath.split(/[\\/]+/).filter(Boolean);
    let parent = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = byPath.get(currentPath);
      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          kind: "directory",
          children: [],
          fileCount: 0,
          directoryCount: 0
        };
        byPath.set(currentPath, node);
        parent.children.push(node);
      }
      if (roleHint && currentPath === directoryPath) node.roleHint = roleHint;
      parent = node;
    }
    return parent;
  };
  for (const directory of directories.sort((left, right) => left.path.localeCompare(right.path))) {
    ensureDirectory(directory.path, directory.roleHint);
  }
  for (const file of files.sort((left, right) => left.path.localeCompare(right.path))) {
    const parts = file.path.split(/[\\/]+/).filter(Boolean);
    let parent = root;
    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = byPath.get(currentPath);
      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          kind: isFile ? "file" : "directory",
          children: [],
          fileCount: 0,
          directoryCount: 0
        };
        byPath.set(currentPath, node);
        parent.children.push(node);
      }
      if (isFile) {
        node.language = file.language;
        node.roleHint = file.roleHint;
        node.lineCount = file.lineCount;
        node.sizeBytes = file.sizeBytes;
      }
      parent = node;
    });
  }
  annotateProjectTree(root);
  let renderedEntries = 0;
  const limitedRoot = limitProjectTree(root, 0, maxDepth, maxEntries, () => renderedEntries, (value) => { renderedEntries = value; });
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    maxDepth,
    maxEntries,
    root: limitedRoot,
    totalFiles: files.length,
    renderedEntries,
    truncated: renderedEntries >= maxEntries || treeHasTruncation(limitedRoot)
  };
}

function annotateProjectTree(node: ProjectTreeNode): { files: number; directories: number } {
  if (node.kind === "file") {
    node.fileCount = 1;
    node.directoryCount = 0;
    return { files: 1, directories: 0 };
  }
  let files = 0;
  let directories = 0;
  node.children.sort((left, right) => left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === "file" ? -1 : 1);
  for (const child of node.children) {
    const counts = annotateProjectTree(child);
    files += counts.files;
    directories += child.kind === "directory" ? 1 + counts.directories : counts.directories;
  }
  node.fileCount = files;
  node.directoryCount = directories;
  return { files, directories };
}

function limitProjectTree(
  node: ProjectTreeNode,
  depth: number,
  maxDepth: number,
  maxEntries: number,
  getRendered: () => number,
  setRendered: (value: number) => void
): ProjectTreeNode {
  const next: ProjectTreeNode = { ...node, children: [] };
  if (depth >= maxDepth) {
    next.truncated = node.children.length > 0;
    return next;
  }
  const remaining = maxEntries - getRendered();
  const selectedChildren = selectProjectTreeChildren(node.children, remaining);
  if (selectedChildren.length < node.children.length) next.truncated = true;
  for (const child of selectedChildren) {
    if (getRendered() >= maxEntries) {
      next.truncated = true;
      break;
    }
    setRendered(getRendered() + 1);
    next.children.push({ ...child, children: [] });
  }
  for (let index = 0; index < selectedChildren.length; index += 1) {
    const child = selectedChildren[index];
    if (!child || child.kind !== "directory") continue;
    if (getRendered() >= maxEntries) {
      const shallow = next.children[index];
      if (shallow && child.children.length) shallow.truncated = true;
      next.truncated = true;
      continue;
    }
    next.children[index] = limitProjectTree(child, depth + 1, maxDepth, maxEntries, getRendered, setRendered);
  }
  return next;
}

function selectProjectTreeChildren(children: ProjectTreeNode[], limit: number): ProjectTreeNode[] {
  if (limit <= 0) return [];
  if (children.length <= limit) return children;
  const directories = children.filter((child) => child.kind === "directory");
  const files = children.filter((child) => child.kind === "file");
  if (!directories.length || !files.length) return children.slice(0, limit);
  const fileQuota = Math.min(files.length, Math.max(1, Math.floor(limit * 0.35)));
  const directoryQuota = Math.min(directories.length, Math.max(0, limit - fileQuota));
  const selected = new Set<ProjectTreeNode>([
    ...directories.slice(0, directoryQuota),
    ...files.slice(0, Math.max(0, limit - directoryQuota))
  ]);
  for (const child of children) {
    if (selected.size >= limit) break;
    selected.add(child);
  }
  return children.filter((child) => selected.has(child));
}

function projectTreeIgnoreNames(args: Args): string[] {
  const ignored = [
    ".git",
    ".distinction",
    ".codegraph",
    ".vs",
    ".vscode",
    ".tmp",
    "node_modules",
    "bin",
    "obj",
    "target",
    "dist",
    "build",
    "coverage"
  ];
  if (args["include-build-artifacts"] !== true) {
    ignored.push("artifacts", "publish", "publish-docker", "artifacts_obj", "test-build", "logs");
  }
  return unique(ignored);
}

function treeHasTruncation(node: ProjectTreeNode): boolean {
  return Boolean(node.truncated || node.children.some(treeHasTruncation));
}

function parsePiReviewJson(stdout: string): unknown {
  const candidate = extractPiReviewJson(stdout);
  return safeJson(candidate) ?? safeJson(repairPiReviewJson(candidate));
}

function salvagePiReviewJson(stdout: string): unknown {
  const text = stripMarkdownJsonFence(stdout);
  const findings: unknown[] = [];
  for (const chunk of splitLikelyFindingChunks(text)) {
    const severity = matchJsonStringField(chunk, "severity");
    const title = matchJsonStringField(chunk, "title");
    const summary = matchJsonStringField(chunk, "summary");
    if (!title || !summary) continue;
    const whyItMatters = matchJsonStringField(chunk, "whyItMatters") ?? matchJsonStringField(chunk, "why_it_matters");
    const suggestedAction = matchJsonStringField(chunk, "suggestedAction") ?? matchJsonStringField(chunk, "suggested_action");
    const confidence = matchJsonStringField(chunk, "confidence");
    const paths = Array.from(chunk.matchAll(/"path"\s*:\s*"((?:\\.|[^"\\])*)"/g))
      .map((match) => decodeJsonString(match[1] ?? ""))
      .filter((value): value is string => Boolean(value));
    const evidenceSummaries = Array.from(chunk.matchAll(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/g))
      .slice(1, 5)
      .map((match) => decodeJsonString(match[1] ?? ""))
      .filter((value): value is string => Boolean(value));
    const fallbackEvidenceSummary = "评审 Agent 返回了候选问题，但结构化证据载荷不完整或被截断；需要检查评审运行日志获取完整文本。";
    findings.push({
      severity: severity ?? "P2",
      title,
      summary,
      whyItMatters,
      suggestedAction,
      confidence: confidence ?? "medium",
      evidence: paths.length
        ? paths.slice(0, 6).map((filePath, index) => ({
          path: filePath,
          summary: evidenceSummaries[index] ?? fallbackEvidenceSummary
        }))
        : [{ summary: fallbackEvidenceSummary, excerpt: chunk.slice(0, 12_000) }],
      affectedPaths: paths
    });
  }
  return findings.length ? { findings } : undefined;
}

function stripMarkdownJsonFence(value: string): string {
  const fenced = Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi), (match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  return fenced[0] ?? value;
}

function splitLikelyFindingChunks(value: string): string[] {
  const marker = /"severity"\s*:\s*"P[0-3]"/g;
  const starts = Array.from(value.matchAll(marker), (match) => match.index ?? -1).filter((index) => index >= 0);
  if (!starts.length) return [value];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? value.length;
    return value.slice(start, end);
  });
}

function matchJsonStringField(value: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s").exec(value);
  return match ? decodeJsonString(match[1] ?? "") : undefined;
}

function decodeJsonString(value: string): string | undefined {
  const parsed = safeJson(`"${value.replace(/"/g, "\\\"")}"`);
  if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
  return value.replace(/\\"/g, "\"").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim() || undefined;
}

function extractPiReviewJson(value: string): string {
  const trimmed = value.trim();
  const candidates = [
    trimmed,
    ...Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi), (match) => match[1]?.trim() ?? "")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = firstBalancedJsonObject(candidate);
    if (parsed) return parsed;
  }
  return trimmed;
}

function firstBalancedJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function repairPiReviewJson(value: string): string {
  let repaired = "";
  let inString = false;
  let escaped = false;
  for (const char of value) {
    if (!inString) {
      if (char === "\"") inString = true;
      repaired += char;
      continue;
    }
    if (escaped) {
      repaired += isJsonEscapeChar(char) ? char : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = false;
      repaired += char;
      continue;
    }
    if (char === "\n") {
      repaired += "\\n";
      continue;
    }
    if (char === "\r") {
      repaired += "\\r";
      continue;
    }
    if (char === "\t") {
      repaired += "\\t";
      continue;
    }
    repaired += char;
  }
  if (escaped) repaired += "\\\\";
  return repaired;
}

function isJsonEscapeChar(value: string): boolean {
  return value === "\"" || value === "\\" || value === "/" || value === "b" || value === "f" || value === "n" || value === "r" || value === "t" || value === "u";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function reviewSeverityValue(value: unknown): ReviewSeverity {
  if (value === "P0" || value === "P1" || value === "P2" || value === "P3") return value;
  return "P2";
}

function reviewConfidenceValue(value: unknown): ReviewFinding["confidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function qualityReviewProgressPath(root: string): string {
  return path.join(root, QUALITY_REVIEW_RUNTIME_PROGRESS_RELATIVE_PATH);
}

async function writeReviewProgress(filePath: string, progress: ReviewProgressSnapshot): Promise<void> {
  const previous = parseReviewProgressSnapshot(await tryReadJsonFile(filePath).catch(() => undefined));
  const merged = mergeReviewProgressVisibility(progress, previous);
  await writeJsonAtomic(filePath, merged);
}

function mergeReviewProgressVisibility(progress: ReviewProgressSnapshot, previous?: ReviewProgressSnapshot): ReviewProgressSnapshot {
  if (!previous || previous.runId !== progress.runId) return progress;
  if (progress.status !== "running" && !progress.pi && !progress.events) return progress;
  return {
    ...progress,
    pi: progress.pi ?? previous.pi,
    events: progress.events ?? previous.events
  };
}

async function appendPiReviewCategoryLog(root: string, runId: string, entry: unknown): Promise<void> {
  const filePath = path.join(root, QUALITY_REVIEW_RUNTIME_LOG_DIR_RELATIVE_PATH, `${safeFilePart(runId)}.jsonl`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

interface QualityReviewContext {
  root: string;
  runId: string;
  generatedAt: string;
  repositorySnapshotPath: string;
  codeFactsPath: string;
  profilePath: string;
  understandingPath: string;
  factsPath: string;
  architecturePath: string;
  findingsPath: string;
  manifestPath: string;
  snapshotFiles: Record<string, unknown>[];
  codeFacts?: CodeFactGraphSnapshot;
  projectKinds: string[];
  frameworks: string[];
  languages: string[];
  understanding?: RepositoryUnderstandingPatch;
  factRecords: MemoryRecord[];
  architecture?: ArchitectureModelPatch;
  findings?: ArchitectureFindingReport;
  manifest?: unknown;
  projectedViews: Awaited<ReturnType<typeof readProjectedGraphViewRecords>>;
}

function addFoundationIntegrityFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  if (!context.snapshotFiles.length) {
    findings.push(reviewFinding(context, {
      slug: "missing-repository-snapshot",
      category: "documentation_knowledge",
      severity: "P0",
      title: "项目接入尚未产生仓库快照",
      summary: "当前项目没有 repository-snapshot 缓存，后续图谱、记忆和工程评估都缺少可信事实层。",
      whyItMatters: "v0.1 规格要求先由本地扫描产生 FACT，再允许 agent 生成候选判断或等待用户确认。",
      suggestedAction: "先运行项目接入，再使用工程评估结果或生成编码任务。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, "缺少仓库快照缓存。")],
      affectedAnchors: []
    }));
    return;
  }

  const ignoredLike = context.snapshotFiles
    .map((file) => String(file.path ?? ""))
    .filter((filePath) => ignoredBuildArtifactPath(filePath));
  if (ignoredLike.length > 0) {
    const sample = ignoredLike.slice(0, 8);
    findings.push(reviewFinding(context, {
      slug: "scanner-includes-build-artifacts",
      category: "documentation_knowledge",
      severity: ignoredLike.length >= 50 ? "P0" : "P1",
      title: "仓库扫描包含构建或发布产物",
      summary: `仓库快照包含 ${ignoredLike.length} 个生成/构建产物路径，例如 ${sample.slice(0, 3).join(", ")}。`,
      whyItMatters: "生成产物会污染项目记忆、仓库证据、架构推断和后续评审优先级。",
      suggestedAction: "让扫描器遵守 .gitignore 或项目专属忽略规则，然后重新生成仓库证据、记忆和投影视图。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.repositorySnapshotPath, `快照包含疑似应忽略的构建路径：${sample.join(", ")}。`),
        {
          source: "file",
          path: ".gitignore",
          summary: "存在项目忽略规则时，应把它作为扫描边界证据。"
        }
      ],
      affectedAnchors: sample.map((filePath) => fileAnchor(filePath))
    }));
  }

  const factStats = factRecordDuplicateStats(context.factRecords);
  if (factStats.duplicateRecordCount > 0) {
    findings.push(reviewFinding(context, {
      slug: "fact-memory-duplicates",
      category: "documentation_knowledge",
      severity: factStats.duplicateRecordCount >= 100 ? "P1" : "P2",
      title: "FACT 记忆中存在重复记录 id",
      summary: `${factStats.duplicateIds} 个 FACT id 重复，额外产生 ${factStats.duplicateRecordCount} 行 facts.jsonl 记录。`,
      whyItMatters: "追加式重复会让评审统计失真，也会影响架构和 finding 的候选推断。",
      suggestedAction: "按记录 id 去重 FACT 记忆，或先让 accept-understanding 具备幂等性，再信任聚合结果。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.factsPath, `facts.jsonl 行数=${context.factRecords.length}；唯一 id=${factStats.uniqueIds}；重复行=${factStats.duplicateRecordCount}。`)
      ],
      affectedAnchors: [{ kind: "memory", id: "facts.jsonl", path: ".distinction/memory/facts.jsonl" }]
    }));
  }

  if (context.understanding && context.factRecords.length > 0) {
    const patchIds = new Set(context.understanding.memoryPatches.map((patch) => patch.record.id));
    const acceptedIds = new Set(context.factRecords.map((record) => record.id));
    const missingAccepted = Array.from(patchIds).filter((id) => !acceptedIds.has(id)).length;
    const extraAccepted = Array.from(acceptedIds).filter((id) => !patchIds.has(id)).length;
    if (missingAccepted || extraAccepted) {
      findings.push(reviewFinding(context, {
        slug: "understanding-acceptance-drift",
        category: "documentation_knowledge",
        severity: "P2",
        title: "仓库理解 patch 与 FACT 记忆不同步",
        summary: `当前仓库理解 patch 与已接受 FACT 记忆不一致：缺少 ${missingAccepted} 个，额外存在 ${extraAccepted} 个唯一 FACT id。`,
        whyItMatters: "Praxis 必须区分当前候选理解与已确认记忆；二者漂移会让页面错误地宣称某些知识已经被接受。",
        suggestedAction: "先把当前 repository-understanding patch 与长期 FACT 记忆对齐，再把它作为已确认项目知识使用。",
        confidence: "medium",
        evidence: [
          fileEvidence(context, context.understandingPath, `memoryPatches=${context.understanding.memoryPatches.length}。`),
          fileEvidence(context, context.factsPath, `已接受唯一 FACT id=${acceptedIds.size}。`)
        ],
        affectedAnchors: [{ kind: "memory", id: "repository-understanding", path: ".distinction/cache/repository-understanding-patch.json" }]
      }));
    }
  }

  if (context.codeFacts?.provider.source === "native") {
    findings.push(reviewFinding(context, {
      slug: "native-code-facts-limited",
      category: "documentation_knowledge",
      severity: "P2",
      title: "代码事实来自能力有限的 native provider",
      summary: "当前 provider 只记录文件和 import 事实，缺少符号、调用和引用级证据。",
      whyItMatters: "没有更强证据时，架构、影响面和工程评估项不能假装拥有符号级确定性。",
      suggestedAction: "接入更强的符号级仓库分析能力，支撑更深的架构与依赖评估；否则把相关候选项明确标为低深度证据。",
      confidence: "high",
      evidence: [fileEvidence(context, context.codeFactsPath, `provider=${context.codeFacts.provider.name}；能力=${context.codeFacts.provider.capabilities.join(", ")}。`)],
      affectedAnchors: [{ kind: "code_fact_node", id: "provider:native", path: ".distinction/cache/code-fact-graph.json" }]
    }));
  }
}

function addArchitectureQualityFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const sourceRootDirs = sourceRootDirectoryNames(context.snapshotFiles);
  const moduleCount = context.architecture?.modules.length ?? 0;
  if (sourceRootDirs.length >= 3 && moduleCount <= 1) {
    findings.push(reviewFinding(context, {
      slug: "architecture-model-underfits-project",
      category: "architecture_boundaries",
      severity: "P1",
      title: "架构模型没有覆盖项目真实模块结构",
      summary: `扫描发现 ${sourceRootDirs.length} 个类似源码的顶层区域，但当前架构模型只有 ${moduleCount} 个模块。`,
      whyItMatters: "过弱的架构模型会让依赖、所有权和 finding 评审看起来比真实项目更干净。",
      suggestedAction: "先让架构建模识别本项目的模块约定，再把架构 finding 当作完整结论接受。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.repositorySnapshotPath, `类似源码的顶层区域：${sourceRootDirs.slice(0, 12).join(", ")}。`),
        fileEvidence(context, context.architecturePath, `架构模块数=${moduleCount}。`)
      ],
      affectedAnchors: sourceRootDirs.slice(0, 12).map((dir) => ({ kind: "architecture_module", id: dir, path: dir }))
    }));
  }

  if ((context.architecture?.warnings.length ?? 0) > 0) {
    findings.push(reviewFinding(context, {
      slug: "architecture-model-warnings",
      category: "architecture_boundaries",
      severity: "P2",
      title: "架构模型仍有未处理警告",
      summary: context.architecture?.warnings.map((warning) => warning.summary).join(" ") ?? "架构模型报告了警告。",
      whyItMatters: "架构警告说明推断模型并不完整，不能直接当作已确认设计知识。",
      suggestedAction: "逐条评审架构警告：要么补强证据，要么显式标记受影响模型为有意不完整。",
      confidence: "high",
      evidence: [fileEvidence(context, context.architecturePath, `${context.architecture?.warnings.length ?? 0} 条架构警告。`)],
      affectedAnchors: [{ kind: "architecture_module", id: "architecture-model", path: ".distinction/cache/architecture-model-patch.json" }]
    }));
  }

}

function addBuildReleaseFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const buildFiles = context.snapshotFiles.map((file) => String(file.path ?? "")).filter((filePath) => buildOutputPath(filePath));
  if (buildFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "build-outputs-in-repository-snapshot",
      category: "build_release",
      severity: buildFiles.length >= 50 ? "P1" : "P2",
      title: "扫描范围中包含构建输出",
      summary: `当前快照包含 ${buildFiles.length} 个构建输出路径，例如 ${buildFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "构建输出会放大项目体积、遮蔽源码所有权，也可能让评审上下文误读二进制或产物而不是源码。",
      suggestedAction: "从 intake 中排除生成目录，并确认是否确实需要把某些产物作为发布资产提交。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `构建输出样例：${buildFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: buildFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  const manifestNames = new Set(context.snapshotFiles.map((file) => path.basename(String(file.path ?? "")).toLowerCase()));
  const hasBuildManifest = ["package.json", "cargo.toml", "csproj", "sln", "pom.xml", "build.gradle", "go.mod", "pyproject.toml"].some((name) => {
    if (name === "csproj") return Array.from(manifestNames).some((item) => item.endsWith(".csproj"));
    if (name === "sln") return Array.from(manifestNames).some((item) => item.endsWith(".sln"));
    return manifestNames.has(name);
  });
  if (!hasBuildManifest && context.snapshotFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "no-build-manifest-detected",
      category: "build_release",
      severity: "P2",
      title: "扫描项目中没有检测到构建清单",
      summary: "仓库扫描没有识别到 package.json、Cargo.toml、.sln、.csproj、pom.xml 或 go.mod 等常见构建入口。",
      whyItMatters: "缺少构建入口时，Praxis 无法为生成的受控编码任务给出可信验证命令。",
      suggestedAction: "确认真实构建系统，并把它写入项目记忆或扫描器的构建清单检测逻辑。",
      confidence: "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, "快照文件名中没有发现常见构建清单。")],
      affectedAnchors: []
    }));
  }
}

function addTestingFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const allPaths = snapshotFilePaths(context);
  const sourceFiles = allPaths.filter((filePath) => reviewableSourceCodePath(filePath));
  const realTestFiles = allPaths.filter((filePath) => realTestPath(filePath));
  const testLikeArtifacts = allPaths.filter((filePath) => testPath(filePath) && !realTestPath(filePath));
  const coverageArtifacts = allPaths.filter((filePath) => coverageEvidencePath(filePath));
  const integrationLikeTests = realTestFiles.filter((filePath) => integrationOrUiTestPath(filePath));
  const isDesktopProject = context.projectKinds.includes("desktop_app")
    || context.frameworks.some((framework) => /avalonia|tauri|electron|wpf|winui/i.test(framework));

  if (sourceFiles.length >= 20 && realTestFiles.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "no-real-tests-detected",
      category: "testing_verification",
      severity: "P1",
      title: "非小型代码库没有检测到真实测试入口",
      summary: `当前快照包含 ${sourceFiles.length} 个可评审源码文件，但没有检测到真实 test/spec 文件、Tests 项目或测试目录。`,
      whyItMatters: "受控编码任务需要验证命令；没有测试时，回归只能依赖人工检查或仅构建检查。",
      suggestedAction: "先补充至少一条可运行的测试入口，并把验证命令写入项目记忆；否则后续开发计划不能声称具备回归保护。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.repositorySnapshotPath, `可评审源码=${sourceFiles.length}；真实测试入口=${realTestFiles.length}。`)
      ],
      affectedAnchors: sourceFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (sourceFiles.length >= 20 && coverageArtifacts.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "missing-coverage-evidence",
      category: "testing_verification",
      severity: "P1",
      title: "缺少覆盖率证据，不能证明 100% 覆盖",
      summary: "当前快照没有检测到 lcov、cobertura、opencover、.coverage、coverage 目录或覆盖率配置。",
      whyItMatters: "没有覆盖率报告时，Praxis 不能把“已有测试”解释成“质量已被验证”；即使存在单元测试，也无法证明关键路径或发布形态被覆盖。",
      suggestedAction: "为项目建立覆盖率产出和阈值，并在工程评审中把低于 100% 或没有覆盖率证据都列为待评审问题。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `覆盖率证据=${coverageArtifacts.length}；可评审源码=${sourceFiles.length}。`)],
      affectedAnchors: sourceFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (isDesktopProject && sourceFiles.length >= 20 && integrationLikeTests.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "desktop-flow-verification-missing",
      category: "testing_verification",
      severity: realTestFiles.length === 0 ? "P1" : "P2",
      title: "桌面关键流程缺少集成/UI/端到端验证证据",
      summary: `项目被识别为桌面应用，但没有检测到 integration、ui、e2e、playwright、selenium 或类似发布形态验证入口。`,
      whyItMatters: "桌面应用的风险通常在窗口生命周期、平台资源、硬件/驱动集成和发布包行为里，仅靠单元测试或构建成功无法覆盖这些问题。",
      suggestedAction: "补充桌面冒烟、UI 自动化或发布包级验证，并把验证入口纳入受控编码任务的验收条件。",
      confidence: "medium",
      evidence: [
        fileEvidence(context, context.profilePath, `projectKinds=${context.projectKinds.join(", ")}；frameworks=${context.frameworks.join(", ")}。`),
        fileEvidence(context, context.repositorySnapshotPath, `真实测试入口=${realTestFiles.length}；集成/UI/E2E 测试入口=${integrationLikeTests.length}。`)
      ],
      affectedAnchors: sourceFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (testLikeArtifacts.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "test-like-artifacts-pollute-verification-signal",
      category: "testing_verification",
      severity: "P2",
      title: "test 字样的构建产物污染了测试识别信号",
      summary: `检测到 ${testLikeArtifacts.length} 个 test-like 路径不是真实测试入口，例如 ${testLikeArtifacts.slice(0, 3).join(", ")}。`,
      whyItMatters: "如果把 dcrf32test.exe、发布目录或私钥文件名里的 test 当成测试证据，评审页会错误显示“暂无问题”。",
      suggestedAction: "测试识别只能接受真实测试源文件、测试项目或测试框架入口；构建产物和二进制文件应继续作为构建/性能/安全风险处理。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `误导性 test-like 路径样例：${testLikeArtifacts.slice(0, 8).join(", ")}。`)],
      affectedAnchors: testLikeArtifacts.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }
}

function addSecurityAndConfigFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const allPaths = snapshotFilePaths(context);
  const sensitiveFiles = context.snapshotFiles
    .map((file) => String(file.path ?? ""))
    .filter((filePath) => sensitiveConfigPath(filePath));
  const sensitiveBuildFiles = sensitiveFiles.filter((filePath) => buildOutputPath(filePath));
  if (sensitiveBuildFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "sensitive-material-in-build-artifacts",
      category: "security_secrets",
      severity: "P0",
      title: "发布或构建产物中包含疑似密钥材料",
      summary: `构建/发布路径里发现 ${sensitiveBuildFiles.length} 个疑似敏感文件，例如 ${sensitiveBuildFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "私钥、证书或凭据一旦进入发布产物、评审上下文或项目记忆，后续自动化流程可能无意扩散敏感信息。",
      suggestedAction: "立即确认这些文件是否是真实密钥；若是，轮换密钥并把构建输出、发布目录和密钥目录加入扫描与上下文过滤规则。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `敏感构建产物样例：${sensitiveBuildFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: sensitiveBuildFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (sensitiveFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "sensitive-config-files-present",
      category: "security_secrets",
      severity: sensitiveBuildFiles.length > 0 ? "P1" : "P2",
      title: "扫描范围中存在疑似敏感文件",
      summary: `发现 ${sensitiveFiles.length} 个疑似敏感配置文件，例如 ${sensitiveFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "凭据、私钥、证书和环境专属值在进入评审上下文、项目记忆或外部执行输入前必须先评审。",
      suggestedAction: "检查这些文件是否包含密钥；未来自动化运行前应遮蔽、摘要化或忽略敏感值。",
      confidence: sensitiveBuildFiles.length > 0 ? "high" : "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `敏感配置样例：${sensitiveFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: sensitiveFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  const configFiles = allPaths.filter((filePath) => configPath(filePath));
  const generatedConfigFiles = configFiles.filter((filePath) => buildOutputPath(filePath));
  if (configFiles.length >= 20) {
    findings.push(reviewFinding(context, {
      slug: "large-config-surface",
      category: "configuration_environment",
      severity: "P2",
      title: "配置面过大，需要明确环境所有权",
      summary: `项目中检测到 ${configFiles.length} 个配置文件。`,
      whyItMatters: "配置扩散经常隐藏环境专属行为，评审过程可能把这些行为误解为源码真相。",
      suggestedAction: "在把配置内容写入长期项目记忆前，先区分生产、开发和生成配置文件。",
      confidence: "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `配置样例：${configFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: configFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (generatedConfigFiles.length >= 5) {
    findings.push(reviewFinding(context, {
      slug: "generated-configs-treated-as-environment-facts",
      category: "configuration_environment",
      severity: "P2",
      title: "生成配置混入扫描范围，环境事实所有权不清",
      summary: `检测到 ${generatedConfigFiles.length} 个位于构建/发布路径下的配置文件，例如 ${generatedConfigFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "生成配置经常是发布结果或本机环境快照，不能直接当成源码层面的环境约定写入长期记忆。",
      suggestedAction: "把源码配置、发布配置和本机生成配置分层；只有经过确认的环境约定才能进入已确认项目记忆。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `生成配置样例：${generatedConfigFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: generatedConfigFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }
}

function addMaintainabilityFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const sourceFiles = context.snapshotFiles.filter((file) => reviewableSourceCodePath(String(file.path ?? "")));
  const generatedSourceFiles = context.snapshotFiles
    .map((file) => String(file.path ?? ""))
    .filter((filePath) => generatedSourcePath(filePath));
  const largeSourceFiles = sourceFiles.filter((file) => {
    const filePath = String(file.path ?? "");
    return !generatedSourcePath(filePath) && (snapshotLineCount(file) >= 800 || snapshotSizeBytes(file) >= 120_000);
  }).map((file) => String(file.path ?? ""));

  if (generatedSourceFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "generated-source-contaminates-maintainability-signal",
      category: "code_quality_maintainability",
      severity: generatedSourceFiles.length >= 50 ? "P1" : "P2",
      title: "生成源码混入评审范围，维护性信号被污染",
      summary: `检测到 ${generatedSourceFiles.length} 个生成源码路径，例如 ${generatedSourceFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "GlobalUsings、AssemblyInfo、g.cs 和 obj/bin 下的源码不是工程师直接维护的主源码，把它们纳入质量判断会稀释真正的复杂度和所有权问题。",
      suggestedAction: "在源码评审、复杂度评估和上下文构造中排除生成源码，同时保留它们作为扫描边界污染的候选问题证据。",
      confidence: "high",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `生成源码样例：${generatedSourceFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: generatedSourceFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (sourceFiles.length >= 100 && context.codeFacts?.provider.source === "native") {
    findings.push(reviewFinding(context, {
      slug: "maintainability-lacks-symbol-and-call-facts",
      category: "code_quality_maintainability",
      severity: "P2",
      title: "维护性评估缺少符号、调用和复杂度事实",
      summary: `当前有 ${sourceFiles.length} 个可评审源码文件，但代码事实 provider 只有 ${context.codeFacts.provider.capabilities.join(", ")} 能力。`,
      whyItMatters: "没有符号/调用/引用事实时，评审器无法可靠发现大类、长方法、隐藏耦合或影响面，不能把空结果解释成代码质量良好。",
      suggestedAction: "接入符号级代码事实后，再让维护性评估器生成复杂度、重复、调用链和影响面候选问题。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.codeFactsPath, `provider=${context.codeFacts.provider.name}；capabilities=${context.codeFacts.provider.capabilities.join(", ")}。`),
        fileEvidence(context, context.repositorySnapshotPath, `可评审源码=${sourceFiles.length}。`)
      ],
      affectedAnchors: [{ kind: "code_fact_node", id: "provider:native", path: ".distinction/cache/code-fact-graph.json" }]
    }));
  }

  if (largeSourceFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "large-source-files-need-maintainability-review",
      category: "code_quality_maintainability",
      severity: "P2",
      title: "存在超大源码文件，需要维护性拆解评审",
      summary: `检测到 ${largeSourceFiles.length} 个超大源码文件，例如 ${largeSourceFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "超大文件通常意味着职责聚合、测试困难和变更影响面难以判断，尤其会削弱后续 agent 的局部理解能力。",
      suggestedAction: "对这些文件补充职责说明、测试锚点和拆解计划；在没有证据前保持为候选维护风险。",
      confidence: "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `超大源码样例：${largeSourceFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: largeSourceFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }
}

function addApiContractFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const allPaths = snapshotFilePaths(context);
  const contractFiles = allPaths.filter((filePath) => apiContractPath(filePath));
  const httpFlowFiles = allPaths.filter((filePath) => httpOrDataFlowPath(filePath));
  const contractTests = allPaths.filter((filePath) => realTestPath(filePath) && apiContractTestPath(filePath));

  if ((contractFiles.length >= 5 || httpFlowFiles.length > 0) && contractTests.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "api-contracts-without-contract-tests",
      category: "api_contracts_data_flow",
      severity: "P1",
      title: "接口契约和数据流缺少契约测试证据",
      summary: `检测到 ${contractFiles.length} 个契约/DTO/服务接口路径和 ${httpFlowFiles.length} 个 HTTP/数据流路径，但没有契约测试入口。`,
      whyItMatters: "服务接口、Request/Response DTO 和 HTTP 客户端一旦漂移，桌面端可能在运行期才失败；没有消费者或契约测试时，agent 也无法安全改动接口。",
      suggestedAction: "为服务契约、DTO 序列化和 HTTP 调用补充契约测试或消费者验证，并把契约边界写入项目记忆。",
      confidence: "high",
      evidence: [
        fileEvidence(context, context.repositorySnapshotPath, `契约样例：${contractFiles.slice(0, 8).join(", ")}。`),
        fileEvidence(context, context.repositorySnapshotPath, `HTTP/数据流样例：${httpFlowFiles.slice(0, 8).join(", ")}。`)
      ],
      affectedAnchors: [...contractFiles, ...httpFlowFiles].slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (contractFiles.length >= 10 && (context.architecture?.dependencies.length ?? 0) === 0) {
    findings.push(reviewFinding(context, {
      slug: "contract-boundaries-not-projected-to-architecture",
      category: "api_contracts_data_flow",
      severity: "P2",
      title: "接口契约没有投影到架构依赖和消费者关系",
      summary: `项目存在 ${contractFiles.length} 个契约相关文件，但架构模型 dependencies=0。`,
      whyItMatters: "契约层如果没有消费者和依赖方向，评审器只能看到文件名，无法判断数据从哪里来、被谁消费、改动会破坏谁。",
      suggestedAction: "把服务接口、DTO、HTTP 客户端和消费模块映射成架构边或投影视图，再执行接口契约评审。",
      confidence: "medium",
      evidence: [
        fileEvidence(context, context.repositorySnapshotPath, `契约文件=${contractFiles.length}。`),
        fileEvidence(context, context.architecturePath, `dependencies=${context.architecture?.dependencies.length ?? 0}。`)
      ],
      affectedAnchors: contractFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }
}

function addPerformanceResourceFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const buildFiles = snapshotFilePaths(context).filter((filePath) => buildOutputPath(filePath));
  const unknownFiles = context.snapshotFiles
    .filter((file) => String(file.language ?? "").toLowerCase() === "unknown")
    .map((file) => String(file.path ?? ""));
  const binaryFiles = snapshotFilePaths(context).filter((filePath) => binaryOrNativeArtifactPath(filePath));
  const largeFiles = context.snapshotFiles
    .filter((file) => snapshotSizeBytes(file) >= 1_000_000)
    .map((file) => String(file.path ?? ""));
  const resourceHeavyPaths = snapshotFilePaths(context).filter((filePath) => resourceHeavyPath(filePath));
  const criticalResourcePaths = resourceHeavyPaths.filter((filePath) => {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    return /(^|\/)(watcher|watchers|filesystemwatcher|hotreload|hot-reload|hot_reload|driver|drivers|native|jni)(\/|$)/.test(normalized)
      || /\.(dll|exe|so|dylib|node)$/i.test(normalized);
  });
  const performanceTests = snapshotFilePaths(context).filter((filePath) => realTestPath(filePath) && performanceTestPath(filePath));

  if (buildFiles.length >= 50 || unknownFiles.length >= 100 || binaryFiles.length >= 20) {
    const evidence = [
      buildFiles.length > 0 ? fileEvidence(context, context.repositorySnapshotPath, `构建产物样例：${buildFiles.slice(0, 8).join(", ")}。`) : undefined,
      unknownFiles.length > 0 ? fileEvidence(context, context.repositorySnapshotPath, `未识别语言文件样例（用于修正扫描识别，不代表应排除源码）：${unknownFiles.slice(0, 8).join(", ")}。`) : undefined,
      binaryFiles.length > 0 ? fileEvidence(context, context.repositorySnapshotPath, `二进制/原生文件样例：${binaryFiles.slice(0, 8).join(", ")}。`) : undefined,
      fileEvidence(context, context.codeFactsPath, `files=${context.codeFacts?.statistics.fileCount ?? context.snapshotFiles.length}；Unknown=${context.codeFacts?.statistics.filesByLanguage?.Unknown ?? unknownFiles.length}。`)
    ].filter((item): item is ReviewEvidenceRef => Boolean(item));
    findings.push(reviewFinding(context, {
      slug: "repository-scan-surface-too-large-for-agent-context",
      category: "performance_resources",
      severity: buildFiles.length >= 500 || unknownFiles.length >= 500 ? "P1" : "P2",
      title: "本地仓库扫描范围和语言识别会放大评审范围",
      summary: `快照中构建产物=${buildFiles.length}，未识别语言文件=${unknownFiles.length}，二进制/原生文件=${binaryFiles.length}。如果未识别样例里包含源码，应先修正语言识别，而不是排除源码。`,
      whyItMatters: "过大的扫描面和不准确的语言识别会拖慢项目接入、仓库分析、上下文构造和桌面评审，也会让评审把注意力错误地放到发布产物、二进制依赖或扫描器识别缺口上。",
      suggestedAction: "修正仓库扫描器的语言识别；保留真实源码，排除可重建输出、发布目录、日志和二进制依赖；再重新生成仓库证据和评审候选项。",
      confidence: "high",
      evidence,
      affectedAnchors: [...buildFiles, ...unknownFiles, ...binaryFiles].slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if (largeFiles.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "large-files-in-review-scope",
      category: "performance_resources",
      severity: largeFiles.length >= 20 ? "P1" : "P2",
      title: "大文件进入评审范围，可能拖慢扫描和上下文构造",
      summary: `检测到 ${largeFiles.length} 个超过 1MB 的文件，例如 ${largeFiles.slice(0, 3).join(", ")}。`,
      whyItMatters: "大文件和二进制资产通常不适合直接进入评审上下文；它们需要摘要、引用或资源清单，而不是全文扫描。",
      suggestedAction: "为大文件建立资源清单和摘要策略，并从默认上下文包中排除原始内容。",
      confidence: "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `大文件样例：${largeFiles.slice(0, 8).join(", ")}。`)],
      affectedAnchors: largeFiles.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }

  if ((criticalResourcePaths.length > 0 || resourceHeavyPaths.length >= 20) && performanceTests.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "resource-heavy-paths-without-performance-verification",
      category: "performance_resources",
      severity: "P2",
      title: "资源密集路径缺少性能或压力验证证据",
      summary: `检测到 ${resourceHeavyPaths.length} 个驱动、原生库、watcher、hot reload 或资源路径，但没有性能/压力测试入口。`,
      whyItMatters: "桌面应用和硬件/原生库集成常见风险不是编译失败，而是启动慢、资源泄漏、文件监听膨胀或发布包体积失控。",
      suggestedAction: "为启动、发布包、驱动加载和资源访问建立性能预算或压力验证，并把结果写入候选评审记忆。",
      confidence: "medium",
      evidence: [fileEvidence(context, context.repositorySnapshotPath, `资源密集路径样例：${resourceHeavyPaths.slice(0, 8).join(", ")}。`)],
      affectedAnchors: resourceHeavyPaths.slice(0, 8).map((filePath) => fileAnchor(filePath))
    }));
  }
}

function addProjectionFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  const failedViews = context.projectedViews.filter((record) => record.view.status === "failed");
  if (!context.manifest || context.projectedViews.length === 0) {
    findings.push(reviewFinding(context, {
      slug: "projection-views-missing",
      category: "documentation_knowledge",
      severity: "P2",
      title: "缺少工程投影视图",
      summary: "当前没有可用于架构、代码事实、findings、记忆或 trace 的投影视图。",
      whyItMatters: "评审项需要图谱锚点和可导航证据；没有投影时，评审队列会失去上下文所有权。",
      suggestedAction: "在 intake 和记忆接受后生成工程投影视图。",
      confidence: "high",
      evidence: [fileEvidence(context, context.manifestPath, "缺少 projection manifest 或视图记录。")],
      affectedAnchors: []
    }));
  } else if (failedViews.length > 0) {
    findings.push(reviewFinding(context, {
      slug: "projection-views-failed",
      category: "documentation_knowledge",
      severity: "P2",
      title: "部分工程投影视图生成失败",
      summary: `${failedViews.length} 个投影视图被标记为失败。`,
      whyItMatters: "失败投影可能隐藏受影响节点，让评审证据难以检查。",
      suggestedAction: "检查失败的 projection 记录，修复源缓存问题后重新生成投影视图。",
      confidence: "high",
      evidence: [fileEvidence(context, context.manifestPath, `失败视图数=${failedViews.length}。`)],
      affectedAnchors: failedViews.map((record) => ({ kind: "projection_node", id: record.view.id, path: record.path }))
    }));
  }
}

function addExternalDetectorFindings(context: QualityReviewContext, findings: ReviewFinding[]): void {
  for (const finding of context.findings?.findings ?? []) {
    findings.push(reviewFinding(context, {
      slug: safeFilePart(finding.id),
      category: externalArchitectureFindingReviewCategory(finding),
      severity: architectureFindingSeverity(finding.severity),
      title: localizeArchitectureFindingTitle(finding),
      summary: localizeArchitectureFindingSummary(finding),
      whyItMatters: "架构 detector 的输出只是候选工程评估项，必须经过用户确认、驳回或补充证据后才能进入已确认记忆。",
      suggestedAction: "检查 detector 证据，并选择接受、驳回或请求更多证据。",
      confidence: finding.confidence,
      evidence: [
        fileEvidence(context, context.findingsPath, `Detector ${finding.antiPatternId} 报告了 ${finding.id}。`),
        ...finding.evidence.map((evidence) => ({
          source: "file" as const,
          path: evidence.filePath,
          summary: evidence.excerpt ?? `${finding.id} 的证据。`,
          excerpt: evidence.excerpt
        }))
      ],
      affectedAnchors: [{ kind: "finding", id: finding.id }]
    }));
  }
}

function externalArchitectureFindingReviewCategory(finding: ArchitectureFinding): ReviewCategory {
  if (finding.antiPatternId === "package_dependency_cycle") return "dependencies_coupling";
  return "architecture_boundaries";
}

function localizeArchitectureFindingTitle(finding: ArchitectureFinding): string {
  if (finding.antiPatternId === "architecture_dependency_without_evidence") return `架构依赖缺少证据：${finding.affectedDependencyIds.join(", ")}`;
  if (finding.antiPatternId === "package_dependency_cycle") return `模块依赖存在循环：${finding.affectedModuleIds.join(" -> ")}`;
  return finding.title;
}

function localizeArchitectureFindingSummary(finding: ArchitectureFinding): string {
  if (finding.antiPatternId === "architecture_dependency_without_evidence") {
    return "有架构依赖缺少来源记忆或证据引用，当前不能作为已确认架构知识使用。";
  }
  if (finding.antiPatternId === "package_dependency_cycle") {
    return "模块级依赖形成循环，会让架构边界更难演进，也会削弱受控编码任务的影响面判断。";
  }
  return finding.summary;
}

function architectureFindingSeverity(severity: ArchitectureFinding["severity"]): ReviewSeverity {
  if (severity === "critical" || severity === "high") return "P1";
  if (severity === "medium") return "P2";
  return "P3";
}

function buildQualityReviewQueueSummary(root: string, findings: ReviewFinding[], latestRun?: ReviewRun, progress?: ReviewProgressSnapshot) {
  return {
    counts: buildReviewRunSummary(findings),
    generatedAt: new Date().toISOString(),
    severityOrder: ["P0", "P1", "P2", "P3"] as ReviewSeverity[],
    categoryOrder: [...reviewCategoryOrder],
    evaluatorResults: progress
      ? completeReviewEvaluatorResults(findings, progress.evaluatorResults ?? [], progress, root)
      : latestRun?.evaluatorResults?.length
        ? completeReviewEvaluatorResults(findings, latestRun.evaluatorResults, undefined, root)
        : findings.length
          ? buildReviewEvaluatorResults(findings, root)
          : buildPendingReviewEvaluatorResults(root)
  };
}

function buildPendingReviewEvaluatorResults(root?: string): NonNullable<ReviewRun["evaluatorResults"]> {
  return reviewCategoryOrder.map((category) => ({
    evaluator: {
      ...reviewEvaluatorProfiles[category],
      category,
      prompt: reviewEvaluatorProfiles[category].prompt
    },
    status: "partial" as const,
    findingIds: [],
    summary: "尚未生成 docs/review 评审文档；请运行评审，让十个评审项落入持久文档。"
  }));
}

function buildReviewEvaluatorResults(findings: ReviewFinding[], root?: string): ReviewRun["evaluatorResults"] {
  return reviewCategoryOrder.map((category) => {
    const categoryFindingIds = findings
      .filter((finding) => displayReviewCategory(finding.category) === category)
      .map((finding) => finding.id);
    return {
      evaluator: reviewEvaluatorFor(category, root),
      status: "completed" as const,
      findingIds: categoryFindingIds,
      summary: categoryFindingIds.length
        ? `评估器生成 ${categoryFindingIds.length} 个候选问题。`
        : "当前规则未命中候选问题；不代表该类别健康。"
    };
  });
}

function completeReviewEvaluatorResults(
  findings: ReviewFinding[],
  existing: NonNullable<ReviewRun["evaluatorResults"]>,
  progress?: ReviewProgressSnapshot,
  root?: string
): NonNullable<ReviewRun["evaluatorResults"]> {
  const byCategory = new Map(existing.map((item) => [displayReviewCategory(item.evaluator.category), item]));
  const currentCategory = progress?.status === "running" ? progress.currentCategory : undefined;
  const completedCategories = new Set(existing.map((item) => displayReviewCategory(item.evaluator.category)));
  return reviewCategoryOrder.map((category) => {
    const current = byCategory.get(category);
    if (current) return current;
    const categoryFindingIds = findings
      .filter((finding) => displayReviewCategory(finding.category) === category)
      .map((finding) => finding.id);
    if (progress?.status === "running" && category === currentCategory) {
      return {
        evaluator: reviewEvaluatorFor(category, root),
        status: "partial",
        findingIds: categoryFindingIds,
        summary: progress.message || "评审项正在执行。"
      };
    }
    if (progress?.status === "running" && !completedCategories.has(category)) {
      return {
        evaluator: reviewEvaluatorFor(category, root),
        status: "partial",
        findingIds: categoryFindingIds,
        summary: "当前运行尚未执行到这个评审项。"
      };
    }
    if (progress?.status === "failed" && category === currentCategory) {
      return {
        evaluator: reviewEvaluatorFor(category, root),
        status: "failed",
        findingIds: categoryFindingIds,
        summary: progress.error ?? progress.message ?? "评审项执行失败。"
      };
    }
    if (progress?.status === "failed" && !completedCategories.has(category)) {
      return {
        evaluator: reviewEvaluatorFor(category, root),
        status: "partial",
        findingIds: categoryFindingIds,
        summary: "当前运行在执行到这个评审项之前已经结束。"
      };
    }
    return {
      evaluator: reviewEvaluatorFor(category, root),
      status: "completed",
      findingIds: categoryFindingIds,
      summary: categoryFindingIds.length
        ? `评估器生成 ${categoryFindingIds.length} 个候选问题。`
        : "当前规则未命中候选问题；不代表该类别健康。"
    };
  });
}

function replaceEvaluatorResult(
  results: NonNullable<ReviewRun["evaluatorResults"]>,
  category: ReviewCategory,
  replacement: NonNullable<ReviewRun["evaluatorResults"]>[number],
  root?: string
): NonNullable<ReviewRun["evaluatorResults"]> {
  const displayCategory = displayReviewCategory(category);
  return reviewCategoryOrder.map((item) =>
    item === displayCategory
      ? replacement
      : results.find((result) => displayReviewCategory(result.evaluator.category) === item) ?? {
        evaluator: reviewEvaluatorFor(item, root),
        status: "partial",
        findingIds: [],
        summary: "该分类还没有可用的评估结果。"
      }
  );
}

function displayReviewCategory(category: ReviewCategory): ReviewCategory {
  return category === "foundation_integrity" ? "documentation_knowledge" : category;
}

function reviewFinding(
  context: QualityReviewContext,
  input: {
    slug: string;
    category: ReviewCategory;
    severity: ReviewSeverity;
    title: string;
    summary: string;
    whyItMatters: string;
    suggestedAction: string;
    confidence: "high" | "medium" | "low";
    evidence: ReviewEvidenceRef[];
    affectedAnchors: GraphAnchor[];
    source?: ReviewFinding["source"];
  }
): ReviewFinding {
  const category = displayReviewCategory(input.category);
  return ReviewFindingSchema.parse({
    schemaVersion: "praxis.reviewFinding.v1",
    id: `review:${input.severity.toLowerCase()}:${category}:${safeFilePart(input.slug)}`,
    runId: context.runId,
    category,
    severity: input.severity,
    status: "candidate",
    title: input.title,
    summary: input.summary,
    whyItMatters: input.whyItMatters,
    suggestedAction: input.suggestedAction,
    confidence: input.confidence,
    source: input.source ?? "hybrid",
    evaluator: reviewEvaluatorFor(category, context.root),
    knowledgeKind: "CANDIDATE",
    evidence: input.evidence,
    affectedAnchors: input.affectedAnchors,
    traceIds: [],
    createdAt: context.generatedAt,
    updatedAt: context.generatedAt
  } satisfies ReviewFinding);
}

function fileEvidence(context: QualityReviewContext, absolutePath: string, summary: string): ReviewEvidenceRef {
  return {
    source: absolutePath.includes(`${path.sep}.distinction${path.sep}memory${path.sep}`) ? "memory" : "repository_snapshot",
    path: projectRelativePath(context.root, absolutePath),
    summary
  };
}

function fileAnchor(filePath: string): GraphAnchor {
  return { kind: "file", id: filePath, path: filePath };
}

function factRecordDuplicateStats(records: MemoryRecord[]) {
  const ids = new Map<string, number>();
  for (const record of records) ids.set(record.id, (ids.get(record.id) ?? 0) + 1);
  let duplicateIds = 0;
  let duplicateRecordCount = 0;
  for (const count of ids.values()) {
    if (count > 1) {
      duplicateIds += 1;
      duplicateRecordCount += count - 1;
    }
  }
  return { uniqueIds: ids.size, duplicateIds, duplicateRecordCount };
}

function sourceRootDirectoryNames(files: Record<string, unknown>[]): string[] {
  const candidates = new Set<string>();
  for (const file of files) {
    const filePath = String(file.path ?? "");
    if (!reviewableSourceCodePath(filePath)) continue;
    const first = filePath.split("/")[0];
    if (first && !ignoredBuildArtifactPath(filePath)) candidates.add(first);
  }
  return Array.from(candidates).sort();
}

function snapshotFilePaths(context: QualityReviewContext): string[] {
  return context.snapshotFiles.map((file) => String(file.path ?? "")).filter(Boolean);
}

function snapshotSizeBytes(file: Record<string, unknown>): number {
  const size = Number(file.sizeBytes);
  return Number.isFinite(size) ? size : 0;
}

function snapshotLineCount(file: Record<string, unknown>): number {
  const lines = Number(file.lineCount);
  return Number.isFinite(lines) ? lines : 0;
}

function ignoredBuildArtifactPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(artifacts|artifacts_obj|publish-docker|publish|bin|obj|logs|test-build|bin_codex|obj_codex|target|dist|build|coverage|node_modules)(\/|$)/.test(normalized)
    || /\.(dll|exe|pdb|cache|so|dylib|class|o|obj|lib|up2date|bin|dat|trx|coverage)$/i.test(normalized);
}

function buildOutputPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(bin|obj|build|dist|target|publish|publish-docker|artifacts|artifacts_obj|test-build)(\/|$)/.test(normalized)
    || /\.(dll|exe|pdb|so|dylib|class|o|obj|lib|up2date)$/i.test(normalized);
}

function sourceCodePath(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|rs|cs|fs|java|kt|go|py|cpp|c|h|hpp|swift|xaml|axaml)$/i.test(filePath);
}

function reviewableSourceCodePath(filePath: string): boolean {
  return sourceCodePath(filePath)
    && !ignoredBuildArtifactPath(filePath)
    && !generatedSourcePath(filePath);
}

function generatedSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(bin|obj|artifacts|artifacts_obj|publish|publish-docker|generated)(\/|$)/.test(normalized)
    || /\.(g|designer|assemblyinfo|globalusings)\.cs$/i.test(normalized)
    || /(^|\/)(generated|sourcegenerated|sourcegeneratedfiles)(\/|$)/.test(normalized);
}

function testPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(normalized)
    || /\.(test|spec)\.[a-z0-9]+$/i.test(normalized)
    || /test/.test(path.basename(normalized));
}

function realTestPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (ignoredBuildArtifactPath(filePath) || generatedSourcePath(filePath)) return false;
  if (!sourceCodePath(filePath) && !/\.(csproj|fsproj|vbproj|sln|props|targets|json|config)$/i.test(normalized)) return false;
  return /(^|\/)(__tests__|tests?|specs?)(\/|$)/.test(normalized)
    || /(^|\/)[^/]*(\.tests?|\.specs?)(\/|$)/.test(normalized)
    || /\.(test|spec)\.[a-z0-9]+$/i.test(normalized)
    || /(^|\/)[^/]*(tests?|specs?)\.(csproj|fsproj|vbproj)$/i.test(normalized);
}

function coverageEvidencePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(coverage|coverage-report|testresults|test-results)(\/|$)/.test(normalized)
    || /(lcov\.info|cobertura|opencover|coverage\.xml|coverage\.json|coverage\.lcov|\.coverage|\.trx$)/.test(normalized)
    || /(coverlet|collectcoverage|threshold|coverage)/.test(path.basename(normalized));
}

function integrationOrUiTestPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(integration|e2e|endtoend|ui|smoke|playwright|selenium|cypress|appium|desktop|golden|snapshot)/.test(normalized);
}

function sensitiveConfigPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const basename = path.basename(normalized);
  const extension = path.extname(basename);
  const sourceExtensions = new Set([
    ".java",
    ".kt",
    ".kts",
    ".scala",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".cs",
    ".go",
    ".rs",
    ".py",
    ".rb",
    ".php",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp"
  ]);
  const certificateOrKeyFile = /\.(pem|pfx|p12|key|crt|cer|jks|keystore)$/i.test(normalized)
    || /(^|\/)[^/]*(priv|private)[^/]*\.(pem|key|pfx|p12|cer|crt|jks|keystore)$/i.test(normalized);
  if (certificateOrKeyFile) return true;
  if (/(^|\/)(\.env($|\.)|\.npmrc$|\.pypirc$|id_rsa$|id_dsa$)/.test(normalized)) return true;
  if (sourceExtensions.has(extension)) return false;

  const securityDirectory = /\/(keys?|secrets?|credentials?|certs?|certificates?)\//.test(normalized);
  if (securityDirectory && !/\.(md|txt|adoc|rst)$/i.test(normalized)) return true;

  const serviceProviderOrMigrationFile = /\/meta-inf\/services\//.test(normalized)
    || /\/(changelog|migrations?|db\/migration)\//.test(normalized);
  if (serviceProviderOrMigrationFile && !/(secret|secrets|credential|credentials|private-key|private_key|password|passwd|apikey|api-key)/.test(basename)) {
    return false;
  }

  const configLike = configPath(filePath)
    || /\/(config|conf|settings|env|environment)\//.test(normalized)
    || /appsettings\.(production|prod|release)\.json$/.test(normalized);
  if (!configLike) return false;

  return /(secret|secrets|credential|credentials|private-key|private_key|apikey|api-key|access-token|access_token|refresh-token|refresh_token|password|passwd|token|oauth|auth|cert|certificate)/.test(basename)
    || /appsettings\.(production|prod|release)\.json$/.test(normalized);
}

function configPath(filePath: string): boolean {
  return /\.(json|yaml|yml|toml|ini|config|props|targets|xml)$/i.test(filePath)
    || path.basename(filePath).toLowerCase().startsWith("appsettings");
}

function apiContractPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (ignoredBuildArtifactPath(filePath) || generatedSourcePath(filePath)) return false;
  return /(^|\/)(contracts?|services\.contracts?|schemas?|proto|openapi|swagger)(\/|$)/.test(normalized)
    || /(request|response|dto|contract|api(model|models)?|commonapimodels|service|client|endpoint|message|eventargs)/.test(path.basename(normalized))
    || /^i[A-Z]/.test(path.basename(filePath));
}

function httpOrDataFlowPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (ignoredBuildArtifactPath(filePath) || generatedSourcePath(filePath)) return false;
  return /(httpclient|httphandler|messagehandler|authenticated|intercepting|grpc|rest|jsonpropertyname|serializer|deserializer|api|endpoint|route)/.test(normalized);
}

function apiContractTestPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(contract|consumer|api|serialization|schema|http|integration|e2e)/.test(normalized);
}

function binaryOrNativeArtifactPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /\.(dll|exe|so|dylib|pdb|lib|bin|dat|jar|war|ear)$/i.test(normalized)
    || /(^|\/)(driver|drivers|native|jni)(\/|$)/.test(normalized);
}

function resourceHeavyPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (/^(\.?\/)?(docs?|documentation|history)\//.test(normalized)) return false;
  return /(^|\/)(watcher|watchers|filesystemwatcher|hotreload|hot-reload|hot_reload|driver|drivers|native|jni)(\/|$)/.test(normalized)
    || /\.(dll|exe|so|dylib|node)$/i.test(normalized)
    || /(^|\/)(src\/main\/resources\/static|public|assets?|images?|fonts?)(\/|$)/.test(normalized)
    || (/(^|\/)(static|public|assets?|images?|fonts?)(\/|$)/.test(normalized)
      && /\.(png|jpg|jpeg|gif|webp|bmp|ico|svg|woff|woff2|ttf|otf|mp3|mp4|wav)$/i.test(normalized));
}

function performanceTestPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(performance|perf|benchmark|stress|load|startup|memory|leak|resource)/.test(normalized);
}

function dedupeReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const byId = new Map<string, ReviewFinding>();
  for (const finding of findings) {
    if (!byId.has(finding.id)) byId.set(finding.id, finding);
  }
  return Array.from(byId.values());
}

function sortReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const severityRank: Record<ReviewSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  return [...findings].sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity]
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.category.localeCompare(right.category)
    || left.title.localeCompare(right.title)
  );
}

function buildReviewRunSummary(findings: ReviewFinding[]): ReviewRun["summary"] {
  const bySeverity: Record<ReviewSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const byCategory: Partial<Record<ReviewCategory, number>> = {};
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byCategory };
}

async function buildLocalQualityReviewFindings(
  root: string,
  input: {
    runId: string;
    generatedAt: string;
    category?: ReviewCategory;
  }
): Promise<ReviewFinding[]> {
  const context = await buildQualityReviewContext(root, input.runId, input.generatedAt);
  const findings: ReviewFinding[] = [];
  addFoundationIntegrityFindings(context, findings);
  addArchitectureQualityFindings(context, findings);
  addBuildReleaseFindings(context, findings);
  addTestingFindings(context, findings);
  addSecurityAndConfigFindings(context, findings);
  addMaintainabilityFindings(context, findings);
  addApiContractFindings(context, findings);
  addPerformanceResourceFindings(context, findings);
  addProjectionFindings(context, findings);
  addExternalDetectorFindings(context, findings);
  await addEventProjectionConsistencyFindings(context, findings);
  const filtered = input.category
    ? findings.filter((finding) => displayReviewCategory(finding.category) === input.category)
    : findings;
  return sortReviewFindings(dedupeReviewFindings(filtered))
    .map((finding) => ReviewFindingSchema.parse({
      ...finding,
      source: "agent",
      evaluator: finding.evaluator ? { ...finding.evaluator, source: reviewAgentSource } : reviewEvaluatorFor(finding.category, root)
    } satisfies ReviewFinding));
}

async function buildQualityReviewContext(root: string, runId: string, generatedAt: string): Promise<QualityReviewContext> {
  const cacheDir = path.join(root, ".distinction", "cache");
  const memoryDir = path.join(root, ".distinction", "memory");
  const repositorySnapshotPath = path.join(cacheDir, "repository-snapshot.json");
  const codeFactsPath = path.join(cacheDir, "code-fact-graph.json");
  const profilePath = path.join(cacheDir, "project-profile.json");
  const understandingPath = path.join(cacheDir, "repository-understanding-patch.json");
  const factsPath = path.join(memoryDir, "facts.jsonl");
  const architecturePath = path.join(cacheDir, "architecture-model-patch.json");
  const findingsPath = path.join(cacheDir, "architecture-findings.json");
  const manifestPath = path.join(cacheDir, "projection-manifest.json");

  const [repositorySnapshot, codeFacts, profile, understanding, factRecords, architecture, findings, manifest, projectedViews] = await Promise.all([
    tryReadJsonFile(repositorySnapshotPath),
    tryReadJsonWithSchema(codeFactsPath, CodeFactGraphSnapshotSchema),
    tryReadJsonFile(profilePath),
    tryReadJsonWithSchema(understandingPath, RepositoryUnderstandingPatchSchema),
    readMemoryRecordJsonl(factsPath),
    tryReadJsonWithSchema(architecturePath, ArchitectureModelPatchSchema),
    tryReadJsonWithSchema(findingsPath, ArchitectureFindingReportSchema),
    tryReadJsonWithSchema(manifestPath, ProjectionManifestSchema),
    readProjectedGraphViewRecords(root)
  ]);

  const snapshotFiles = isRecord(repositorySnapshot) && Array.isArray(repositorySnapshot.files)
    ? repositorySnapshot.files.filter(isRecord)
    : [];
  const projectKinds = isRecord(profile) && Array.isArray(profile.projectKinds)
    ? profile.projectKinds.filter((item): item is string => typeof item === "string")
    : [];
  const frameworks = isRecord(profile) && Array.isArray(profile.frameworks)
    ? profile.frameworks.filter((item): item is string => typeof item === "string")
    : [];
  const languages = isRecord(profile) && Array.isArray(profile.languages)
    ? profile.languages.filter((item): item is string => typeof item === "string")
    : [];

  return {
    root,
    runId,
    generatedAt,
    repositorySnapshotPath,
    codeFactsPath,
    profilePath,
    understandingPath,
    factsPath,
    architecturePath,
    findingsPath,
    manifestPath,
    snapshotFiles,
    codeFacts,
    projectKinds,
    frameworks,
    languages,
    understanding,
    factRecords,
    architecture,
    findings,
    manifest,
    projectedViews
  };
}

async function addEventProjectionConsistencyFindings(context: QualityReviewContext, findings: ReviewFinding[]): Promise<void> {
  const projectionPaths = snapshotFilePaths(context)
    .filter((filePath) => reviewableSourceCodePath(filePath))
    .filter((filePath) => /(projection|projector|readmodel|materialized|viewwriter)/i.test(filePath))
    .slice(0, 80);
  for (const filePath of projectionPaths) {
    const absolutePath = path.join(context.root, filePath);
    let source = "";
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    addSwallowedProjectionFailureFinding(context, findings, filePath, source);
    addIncompleteProjectionHandlerFinding(context, findings, filePath, source);
  }
}

function addSwallowedProjectionFailureFinding(
  context: QualityReviewContext,
  findings: ReviewFinding[],
  filePath: string,
  source: string
): void {
  const isProjectionWriter = /(projectionwriter|projector|readmodel|materialized|viewwriter)/i.test(filePath);
  if (!isProjectionWriter) return;
  const hasStateTerms = /(balance|account|refund|payment|status|order|card|余额|账户|退款|支付|状态|订单|卡)/i.test(source);
  const hasSwallowedException = /catch\s*\([^)]*Exception[^)]*\)\s*\{[\s\S]{0,900}log\.(warn|error|info)/.test(source)
    && /(不应影响主流程|不应该影响主流程|should not affect (the )?main flow|continue|继续)/i.test(source);
  if (!hasStateTerms || !hasSwallowedException) return;

  const excerpt = extractAroundFirst(source, [
    "账户余额更新失败不应该影响主流程",
    "卡账户余额更新失败不应该影响主流程",
    "预付卡信息处理失败不应该影响主流程",
    "不应该影响主流程",
    "should not affect the main flow",
    "should not affect main flow"
  ], 260, 460);
  findings.push(reviewFinding(context, {
    slug: `projection-swallowed-failure-${safeFilePart(filePath)}`,
    category: "dependencies_coupling",
    severity: "P1",
    title: "投影写入失败被日志隔离后可能导致支付结果与账户余额状态不一致",
    summary: `${filePath} 在支付、退款、账户或余额相关的投影写入路径中捕获异常后仅记录日志，并明确让主流程继续。这会让支付事件已经成功发布或处理，但账户余额、卡余额或兼容查询视图没有同步完成。`,
    whyItMatters: "投影和兼容写入可以直接使用 DAO/Entity；真正的风险不是 DAO 本身，而是失败后的回放、补偿、告警和一致性边界没有被代码或文档解释清楚。没有这些边界，后续查询、对账或退款处理可能看到与支付事实不一致的状态。",
    suggestedAction: "把该投影写入的归属写入变更计划：如果它只是读模型或兼容视图，应补充幂等重放、失败告警和补偿任务；如果它参与后续支付、退款、资格、扣费或结算判断，应拆出更严格的事务边界和一致性验证。整改方案不得预设由领域层承接持久化接口，除非文档已证明该状态属于领域聚合持久化。",
    confidence: "high",
    evidence: [{
      source: "file",
      path: filePath,
      summary: "代码中存在账户或卡余额投影写入失败后仅记录日志并继续主流程的路径。",
      excerpt
    }],
    affectedAnchors: [fileAnchor(filePath)]
  }));
}

function addIncompleteProjectionHandlerFinding(
  context: QualityReviewContext,
  findings: ReviewFinding[],
  filePath: string,
  source: string
): void {
  const todoCount = (source.match(/TODO|待实现|未实现|return\s+null\s*;/gi) ?? []).length;
  const eventOrProjection = /(Event|事件|Projection|Projector|Handler|Callback|Refund|Payment|支付|退款|回调)/i.test(source + filePath);
  if (todoCount < 2 || !eventOrProjection) return;
  const excerpt = extractFirstMatchExcerpt(source, /(TODO|待实现|未实现|return\s+null\s*;)[\s\S]{0,500}/i);
  findings.push(reviewFinding(context, {
    slug: `incomplete-projection-handler-${safeFilePart(filePath)}`,
    category: "api_contracts_data_flow",
    severity: todoCount >= 4 ? "P1" : "P2",
    title: "事件或投影处理路径仍有未完成实现",
    summary: `${filePath} 包含 ${todoCount} 处 TODO、未实现标记或空返回，且文件位于事件、回调或投影处理路径中。`,
    whyItMatters: "事件和投影路径的未完成实现会让文档中的流程、读模型和实际查询结果不一致，也会让评审转计划时遗漏必要开发任务。",
    suggestedAction: "把未完成路径拆成明确开发任务：补实现、补事件-投影覆盖测试，并在对应设计文档或变更计划中记录影响范围。",
    confidence: "medium",
    evidence: [{
      source: "file",
      path: filePath,
      summary: "文件中存在未完成实现标记。",
      excerpt
    }],
    affectedAnchors: [fileAnchor(filePath)]
  }));
}

function extractFirstMatchExcerpt(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  const excerpt = match?.[0] ?? source.slice(0, 800);
  return trimExcerptToLineBoundaries(excerpt, 1800);
}

function extractAroundFirst(source: string, needles: string[], before = 420, after = 760): string {
  const lower = source.toLowerCase();
  const matchIndex = needles
    .map((needle) => lower.indexOf(needle.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (matchIndex === undefined) return trimExcerptToLineBoundaries(source.slice(0, Math.min(source.length, before + after)), before + after);
  const start = Math.max(0, matchIndex - before);
  const end = Math.min(source.length, matchIndex + after);
  return trimExcerptToLineBoundaries(source.slice(start, end), before + after);
}

function trimExcerptToLineBoundaries(excerpt: string, maxLength: number): string {
  const clipped = excerpt.slice(0, maxLength);
  const firstLineBreak = clipped.indexOf("\n");
  const lastLineBreak = clipped.lastIndexOf("\n");
  const startsMidLine = excerpt.length > clipped.length || firstLineBreak > 0;
  const lineBounded = firstLineBreak >= 0 && lastLineBreak > firstLineBreak
    ? clipped.slice(startsMidLine ? firstLineBreak + 1 : 0, lastLineBreak)
    : clipped;
  return lineBounded.trim();
}

async function buildFoundationReviewStatus(root: string) {
  const cacheDir = path.join(root, ".distinction", "cache");
  const memoryDir = path.join(root, ".distinction", "memory");
  const distinctionExists = await exists(path.join(root, ".distinction"));
  const repositorySnapshotPath = path.join(cacheDir, "repository-snapshot.json");
  const codeFactsPath = path.join(cacheDir, "code-fact-graph.json");
  const profilePath = path.join(cacheDir, "project-profile.json");
  const understandingPath = path.join(cacheDir, "repository-understanding-patch.json");
  const factsPath = path.join(memoryDir, "facts.jsonl");
  const architecturePath = path.join(cacheDir, "architecture-model-patch.json");
  const findingsPath = path.join(cacheDir, "architecture-findings.json");
  const manifestPath = path.join(cacheDir, "projection-manifest.json");

  const [repositorySnapshot, codeFacts, profile, understanding, factRecords, architecture, findings, manifest, projectedViews, traces, tasks] = await Promise.all([
    tryReadJsonFile(repositorySnapshotPath),
    tryReadJsonWithSchema(codeFactsPath, CodeFactGraphSnapshotSchema),
    tryReadJsonFile(profilePath),
    tryReadJsonWithSchema(understandingPath, RepositoryUnderstandingPatchSchema),
    readMemoryRecordJsonl(factsPath),
    tryReadJsonWithSchema(architecturePath, ArchitectureModelPatchSchema),
    tryReadJsonWithSchema(findingsPath, ArchitectureFindingReportSchema),
    tryReadJsonWithSchema(manifestPath, ProjectionManifestSchema),
    readProjectedGraphViewRecords(root),
    readTraceRecordJsonl(root),
    readTaskProjectionRecords(root)
  ]);

  const repositoryFiles = isRecord(repositorySnapshot) && Array.isArray(repositorySnapshot.files) ? repositorySnapshot.files.length : undefined;
  const projectKinds = isRecord(profile) && Array.isArray(profile.projectKinds) ? profile.projectKinds.filter((item): item is string => typeof item === "string") : [];
  const languages = isRecord(profile) && Array.isArray(profile.languages) ? profile.languages.filter((item): item is string => typeof item === "string") : [];
  const frameworks = isRecord(profile) && Array.isArray(profile.frameworks) ? profile.frameworks.filter((item): item is string => typeof item === "string") : [];
  const pendingUnderstanding = Boolean(understanding && factRecords.length === 0);
  const status = !distinctionExists
    ? "not_initialized"
    : !repositorySnapshot
      ? "needs_intake"
      : pendingUnderstanding
        ? "understanding_pending"
        : "foundation_ready";

  const nextActions: string[] = [];
  if (!repositorySnapshot) nextActions.push("运行项目接入，生成仓库缓存事实。");
  if (pendingUnderstanding) nextActions.push("接受仓库理解，将 FACT 写入长期记忆。");
  if (!manifest || projectedViews.length === 0) nextActions.push("生成架构、代码事实、findings 和记忆的工程投影视图。");
  if (findings && findings.findings.length > 0) nextActions.push("评审未处理 findings，或创建受治理的 finding 状态 patch。");
  if (!nextActions.length) nextActions.push("当前没有待治理评审项，可进入投影检查器或 Agent 会话继续探索。");

  return {
    status,
    generatedAt: new Date().toISOString(),
    artifacts: {
      repositorySnapshot: {
        exists: Boolean(repositorySnapshot),
        path: projectRelativePath(root, repositorySnapshotPath),
        files: repositoryFiles
      },
      codeFacts: {
        exists: Boolean(codeFacts),
        path: projectRelativePath(root, codeFactsPath),
        provider: codeFacts?.provider,
        files: codeFacts?.statistics.fileCount ?? 0,
        nodes: codeFacts?.statistics.nodeCount ?? 0,
        edges: codeFacts?.statistics.edgeCount ?? 0,
        warnings: codeFacts?.warnings.length ?? 0
      },
      projectProfile: {
        exists: Boolean(profile),
        path: projectRelativePath(root, profilePath),
        projectKinds,
        languages,
        frameworks
      },
      repositoryUnderstanding: {
        exists: Boolean(understanding),
        path: projectRelativePath(root, understandingPath),
        memoryPatches: understanding?.memoryPatches.length ?? 0,
        warnings: understanding?.warnings.length ?? 0,
        reviewQuestions: understanding?.reviewQuestions.length ?? 0,
        pendingAcceptance: pendingUnderstanding
      },
      factMemory: {
        exists: factRecords.length > 0,
        path: projectRelativePath(root, factsPath),
        records: factRecords.length
      },
      architectureModel: {
        exists: Boolean(architecture),
        path: projectRelativePath(root, architecturePath),
        modules: architecture?.modules.length ?? 0,
        dependencies: architecture?.dependencies.length ?? 0,
        warnings: architecture?.warnings.length ?? 0
      },
      findings: {
        exists: Boolean(findings),
        path: projectRelativePath(root, findingsPath),
        detected: findings?.findings.length ?? 0,
        detectorIds: findings?.detectorIds ?? []
      },
      projections: {
        exists: Boolean(manifest),
        path: projectRelativePath(root, manifestPath),
        manifestViews: manifest?.views.length ?? 0,
        schemaValidViews: projectedViews.length,
        freshViews: projectedViews.filter((record) => record.view.status === "fresh").length,
        failedViews: projectedViews.filter((record) => record.view.status === "failed").length,
        kinds: Array.from(new Set(projectedViews.map((record) => record.view.kind)))
      },
      traces: {
        records: traces.length
      },
      tasks: {
        records: tasks.length
      }
    },
    nextActions
  };
}

async function commandFindingAudit(args: Args): Promise<void> {
  const root = path.resolve(required(args, "root"));
  const filterFindingId = typeof args.finding === "string" ? args.finding : undefined;
  const audit = await buildFindingAudit(root, filterFindingId);
  await maybeWriteJson(args, "out", audit);
  outputJson(audit);
}

async function commandAcceptExternalResult(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const resultPath = await resolveExternalResultPath(resolvedRoot, required(args, "result"));
  const result = await readJsonWithSchema(resultPath, ExternalAgentResultSchema);
  const materializedMemorySuggestions: string[] = [];
  const materializedFindingStatusPatches: string[] = [];
  for (const suggestion of result.memorySuggestions) {
    materializedMemorySuggestions.push(await writeMemorySuggestionPatch(resolvedRoot, suggestion));
  }
  for (const patch of result.findingStatusSuggestions) {
    materializedFindingStatusPatches.push(await writeFindingStatusPatch(resolvedRoot, patch));
  }

  const traceRecord = TraceRecordSchema.parse({
    schemaVersion: "praxis.traceRecord.v1",
    id: `trace-event:external-result-accepted:${safeFilePart(result.id)}:${Date.now()}`,
    traceId: `trace:task:${result.taskId}`,
    timestamp: new Date().toISOString(),
    kind: "external_agent.result_accepted",
    target: { type: "external_agent_result", id: result.id },
    summary: `Accepted external result ${result.id} into governance review.`,
    data: {
      taskId: result.taskId,
      status: result.status,
      resultPath: projectRelativePath(resolvedRoot, resultPath),
      memorySuggestionPaths: materializedMemorySuggestions,
      findingStatusPatchPaths: materializedFindingStatusPatches
    }
  } satisfies TraceRecord);
  const tracePath = await appendTraceRecord(resolvedRoot, traceRecord);
  await appendChange(resolvedRoot, {
    title: `Accepted external result ${result.id}`,
    summary: `Accepted ${result.status} result for ${result.taskId}. Materialized ${materializedMemorySuggestions.length} memory suggestion(s) and ${materializedFindingStatusPatches.length} finding status patch(es).`,
    kind: "CANDIDATE"
  });

  outputJson({
    ok: true,
    root: resolvedRoot,
    resultId: result.id,
    resultPath: projectRelativePath(resolvedRoot, resultPath),
    memorySuggestionPaths: materializedMemorySuggestions,
    findingStatusPatchPaths: materializedFindingStatusPatches,
    tracePath
  });
}

async function commandAcceptMemorySuggestion(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const suggestionArg = typeof args.suggestion === "string" ? args.suggestion : typeof args.patch === "string" ? args.patch : "";
  if (!suggestionArg) throw new Error("Missing required --suggestion");
  const suggestionPath = await resolveMemorySuggestionPatchPath(resolvedRoot, suggestionArg);
  const suggestion = await readJsonWithSchema(suggestionPath, MemorySuggestionPatchSchema);
  const now = new Date().toISOString();
  const records = suggestion.memoryPatches.map((patch, index) =>
    confirmedMemoryRecordFromSuggestion(suggestion, patch, now, index, projectRelativePath(resolvedRoot, suggestionPath))
  );
  const memoryPath = await appendMemoryRecords(resolvedRoot, "confirmations.jsonl", records);
  const tracePath = await appendTraceRecord(
    resolvedRoot,
    TraceRecordSchema.parse({
      schemaVersion: "praxis.traceRecord.v1",
      id: `trace-event:memory-suggestion-accepted:${safeFilePart(suggestion.id)}:${Date.now()}`,
      traceId: suggestion.sourceTaskId ? `trace:task:${suggestion.sourceTaskId}` : `trace:memory:${suggestion.id}`,
      timestamp: now,
      kind: "memory_suggestion.accepted",
      target: { type: "memory", id: suggestion.id },
      summary: suggestion.summary,
      data: {
        suggestionId: suggestion.id,
        suggestionPath: projectRelativePath(resolvedRoot, suggestionPath),
        sourceResultId: suggestion.sourceResultId,
        sourceTaskId: suggestion.sourceTaskId,
        memoryPatchIds: suggestion.memoryPatches.map((patch) => patch.id),
        acceptedMemoryIds: records.map((record) => record.id)
      }
    } satisfies TraceRecord)
  );
  await appendChange(resolvedRoot, {
    title: `Accepted memory suggestion ${suggestion.id}`,
    summary: `Accepted ${records.length} memory record(s) from ${projectRelativePath(resolvedRoot, suggestionPath)}.`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: resolvedRoot,
    suggestionId: suggestion.id,
    suggestionPath: projectRelativePath(resolvedRoot, suggestionPath),
    memoryPath,
    acceptedMemoryIds: records.map((record) => record.id),
    tracePath
  });
}

async function commandAcceptFindingStatus(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const patchPath = await resolveFindingStatusPatchPath(resolvedRoot, required(args, "patch"));
  const patch = await readJsonWithSchema(patchPath, FindingStatusPatchSchema);
  const findingsPath = path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");
  const existingReport = await readJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  const now = new Date().toISOString();
  const updatedReport = applyFindingStatusPatch(existingReport, patch, now);
  await writeJson(findingsPath, updatedReport, ArchitectureFindingReportSchema);
  const findingMemoryPath = await appendFindingStatusMemory(resolvedRoot, patch, now);
  const tracePath = await appendTraceRecord(
    resolvedRoot,
    TraceRecordSchema.parse({
      schemaVersion: "praxis.traceRecord.v1",
      id: `trace-event:finding-status-accepted:${safeFilePart(patch.id)}:${Date.now()}`,
      traceId: `trace:finding:${patch.findingId}`,
      timestamp: now,
      kind: "finding.status_accepted",
      target: { type: "finding", id: patch.findingId },
      summary: patch.summary,
      data: {
        patchId: patch.id,
        patchPath: projectRelativePath(resolvedRoot, patchPath),
        status: patch.status,
        sourceResultId: patch.sourceResultId,
        sourceTaskId: patch.sourceTaskId
      }
    } satisfies TraceRecord)
  );
  const rerunReport = await rerunDetectorWithFindingStatusReconciliation(resolvedRoot, updatedReport);
  await appendChange(resolvedRoot, {
    title: `Accepted finding status ${patch.status}`,
    summary: `${patch.findingId}: ${patch.summary}`,
    kind: "CONFIRMED"
  });
  outputJson({
    ok: true,
    root: resolvedRoot,
    patchId: patch.id,
    findingId: patch.findingId,
    status: patch.status,
    findingsPath,
    findingMemoryPath,
    tracePath,
    detectorRerun: {
      findings: rerunReport.findings.length,
      statusPreserved: rerunReport.findings.some((finding) => finding.id === patch.findingId && finding.status === patch.status)
    }
  });
}

async function resolveExternalResultPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const reportsDir = path.join(root, ".distinction", "reports", "external-results");
  const candidates = await listJsonFiles(reportsDir);
  for (const candidate of candidates) {
    const result = await readJsonWithSchema(candidate, ExternalAgentResultSchema);
    if (result.id === value || safeFilePart(result.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`ExternalAgentResult not found: ${value}`);
}

async function resolveFindingStatusPatchPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const patchDir = path.join(root, ".distinction", "cache", "finding-status-patches");
  const candidates = await listJsonFiles(patchDir);
  for (const candidate of candidates) {
    const patch = await readJsonWithSchema(candidate, FindingStatusPatchSchema);
    if (patch.id === value || safeFilePart(patch.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`FindingStatusPatch not found: ${value}`);
}

async function resolveMemorySuggestionPatchPath(root: string, value: string): Promise<string> {
  const direct = path.isAbsolute(value) ? value : path.resolve(root, value);
  if (await exists(direct)) return direct;
  const patchDir = path.join(root, ".distinction", "cache", "memory-suggestions");
  const candidates = await listJsonFiles(patchDir);
  for (const candidate of candidates) {
    const patch = await readJsonWithSchema(candidate, MemorySuggestionPatchSchema);
    if (patch.id === value || safeFilePart(patch.id) === safeFilePart(value) || path.basename(candidate, ".json") === value) return candidate;
  }
  throw new Error(`MemorySuggestionPatch not found: ${value}`);
}

async function writeMemorySuggestionPatch(root: string, suggestion: MemorySuggestionPatch): Promise<string> {
  const parsed = MemorySuggestionPatchSchema.parse(suggestion);
  const relative = `.distinction/cache/memory-suggestions/${safeFilePart(parsed.id)}.json`;
  await writeJson(path.join(root, relative), parsed, MemorySuggestionPatchSchema);
  return relative;
}

function confirmedMemoryRecordFromSuggestion(
  suggestion: MemorySuggestionPatch,
  patch: MemoryPatch,
  timestamp: string,
  index: number,
  suggestionPath: string
): MemoryRecord {
  if (patch.status === "rejected") throw new Error(`Cannot accept rejected memory patch: ${patch.id}`);
  const base = patch.record;
  return MemoryRecordSchema.parse({
    ...base,
    id: `memory:confirmed:${safeFilePart(suggestion.id)}:${index + 1}:${Date.now()}`,
    kind: "CONFIRMED",
    evidence: [
      ...base.evidence,
      {
        source: "user_confirmation",
        filePath: suggestionPath,
        excerpt: suggestion.summary
      }
    ],
    source: "user",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MemoryRecord);
}

async function appendMemoryRecords(root: string, fileName: string, records: MemoryRecord[]): Promise<string> {
  const memoryPath = path.join(root, ".distinction", "memory", fileName);
  await mkdir(path.dirname(memoryPath), { recursive: true });
  if (!records.length) {
    await appendFile(memoryPath, "", "utf8");
    return memoryPath;
  }
  const lines = records.map((record) => JSON.stringify(MemoryRecordSchema.parse(record))).join("\n");
  await appendFile(memoryPath, `${lines}\n`, "utf8");
  return memoryPath;
}

async function appendUniqueMemoryRecords(root: string, fileName: string, records: MemoryRecord[]): Promise<string> {
  const memoryPath = path.join(root, ".distinction", "memory", fileName);
  await mkdir(path.dirname(memoryPath), { recursive: true });
  const existingIds = new Set((await readMemoryRecordJsonl(memoryPath)).map((record) => record.id));
  const uniqueRecords = records.filter((record) => !existingIds.has(record.id));
  if (!uniqueRecords.length) {
    await appendFile(memoryPath, "", "utf8");
    return memoryPath;
  }
  const lines = uniqueRecords.map((record) => JSON.stringify(MemoryRecordSchema.parse(record))).join("\n");
  await appendFile(memoryPath, `${lines}\n`, "utf8");
  return memoryPath;
}

async function writeFindingStatusPatch(root: string, patch: FindingStatusPatch): Promise<string> {
  const parsed = FindingStatusPatchSchema.parse(patch);
  const relative = `.distinction/cache/finding-status-patches/${safeFilePart(parsed.id)}.json`;
  await writeJson(path.join(root, relative), parsed, FindingStatusPatchSchema);
  return relative;
}

function applyFindingStatusPatch(report: ArchitectureFindingReport, patch: FindingStatusPatch, timestamp: string): ArchitectureFindingReport {
  let matched = false;
  const findings = report.findings.map((finding) => {
    if (finding.id !== patch.findingId) return finding;
    matched = true;
    return {
      ...finding,
      status: patch.status,
      updatedAt: timestamp
    } satisfies ArchitectureFinding;
  });
  if (!matched) throw new Error(`Finding not found in architecture-findings cache: ${patch.findingId}`);
  return ArchitectureFindingReportSchema.parse({
    ...report,
    generatedAt: timestamp,
    findings
  });
}

function reconcileFindingReport(previous: ArchitectureFindingReport, detected: ArchitectureFindingReport): ArchitectureFindingReport {
  const previousById = new Map(previous.findings.map((finding) => [finding.id, finding]));
  const findings = detected.findings.map((finding) => {
    const previousFinding = previousById.get(finding.id);
    if (!previousFinding) return finding;
    if (previousFinding.status === "open") {
      return {
        ...finding,
        createdAt: previousFinding.createdAt
      };
    }
    return {
      ...finding,
      status: previousFinding.status,
      createdAt: previousFinding.createdAt,
      updatedAt: previousFinding.updatedAt
    };
  });
  return ArchitectureFindingReportSchema.parse({
    ...detected,
    findings
  });
}

async function rerunDetectorWithFindingStatusReconciliation(root: string, previousReport: ArchitectureFindingReport): Promise<ArchitectureFindingReport> {
  const modelPath = path.join(root, ".distinction", "cache", "architecture-model-patch.json");
  const model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  const detected = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
  const reconciled = reconcileFindingReport(previousReport, detected);
  await writeJson(path.join(root, ".distinction", "cache", "architecture-findings.json"), reconciled, ArchitectureFindingReportSchema);
  return reconciled;
}

async function appendFindingStatusMemory(root: string, patch: FindingStatusPatch, timestamp: string): Promise<string> {
  const record = MemoryRecordSchema.parse({
    id: `memory:finding-status:${safeFilePart(patch.id)}:${Date.now()}`,
    kind: "CONFIRMED",
    type: "finding_status",
    subject: patch.findingId,
    predicate: "status",
    object: patch.status,
    value: {
      patchId: patch.id,
      sourceResultId: patch.sourceResultId,
      sourceTaskId: patch.sourceTaskId,
      rationale: patch.rationale
    },
    summary: patch.summary,
    evidence: patch.evidence,
    source: "user",
    confidence: "high",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MemoryRecord);
  const findingsPath = path.join(root, ".distinction", "memory", "findings.jsonl");
  await mkdir(path.dirname(findingsPath), { recursive: true });
  await appendFile(findingsPath, `${JSON.stringify(record)}\n`, "utf8");
  return findingsPath;
}

async function appendTraceRecord(root: string, record: TraceRecord): Promise<string> {
  const tracePath = path.join(root, ".distinction", "memory", "traces.jsonl");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await appendFile(tracePath, `${JSON.stringify(TraceRecordSchema.parse(record))}\n`, "utf8");
  return tracePath;
}

async function readAcceptedReviewArtifactIds(root: string): Promise<{
  memorySuggestions: Map<string, string>;
  findingStatusPatches: Map<string, string>;
}> {
  const memorySuggestions = new Map<string, string>();
  const findingStatusPatches = new Map<string, string>();
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const value = safeJson(trimmed);
      if (!isRecord(value)) continue;
      const kind = typeof value.kind === "string" ? value.kind : "";
      const timestamp = typeof value.timestamp === "string" ? value.timestamp : "";
      const data = isRecord(value.data) ? value.data : {};
      if (kind === "memory_suggestion.accepted" && typeof data.suggestionId === "string") {
        memorySuggestions.set(data.suggestionId, timestamp);
      }
      if (kind === "finding.status_accepted" && typeof data.patchId === "string") {
        findingStatusPatches.set(data.patchId, timestamp);
      }
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { memorySuggestions, findingStatusPatches };
}

async function buildFindingAudit(root: string, filterFindingId?: string) {
  const findingsPath = path.join(root, ".distinction", "cache", "architecture-findings.json");
  const report = await tryReadJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  const currentById = new Map((report?.findings ?? []).map((finding) => [finding.id, finding]));
  const accepted = await readAcceptedReviewArtifactIds(root);
  const patchEntries = await readFindingStatusPatchEntries(root);
  const findingMemoryRecords = (await readMemoryRecordJsonl(path.join(root, ".distinction", "memory", "findings.jsonl"))).filter(
    (record) => record.type === "finding_status"
  );
  const traces = (await readTraceRecordJsonl(root)).filter(
    (trace) =>
      trace.kind === "finding.status_accepted" ||
      trace.target?.type === "finding" ||
      (isRecord(trace.data) && typeof trace.data.findingId === "string")
  );

  const findingIds = new Set<string>();
  for (const id of currentById.keys()) findingIds.add(id);
  for (const entry of patchEntries) findingIds.add(entry.patch.findingId);
  for (const record of findingMemoryRecords) findingIds.add(record.subject);
  for (const trace of traces) {
    if (trace.target?.type === "finding" && trace.target.id) findingIds.add(trace.target.id);
    if (isRecord(trace.data) && typeof trace.data.findingId === "string") findingIds.add(trace.data.findingId);
  }

  const findings = Array.from(findingIds)
    .filter((findingId) => !filterFindingId || findingId === filterFindingId)
    .sort()
    .map((findingId) => {
      const current = currentById.get(findingId);
      const patches = patchEntries
        .filter((entry) => entry.patch.findingId === findingId)
        .sort((left, right) => left.patch.createdAt.localeCompare(right.patch.createdAt));
      const memoryRecords = findingMemoryRecords
        .filter((record) => record.subject === findingId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const findingTraces = traces
        .filter((trace) => {
          if (trace.target?.type === "finding" && trace.target.id === findingId) return true;
          return isRecord(trace.data) && trace.data.findingId === findingId;
        })
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      const latestMemory = memoryRecords.length ? memoryRecords[memoryRecords.length - 1] : undefined;
      const latestPatch = patches.length ? patches[patches.length - 1].patch : undefined;
      const latestAcceptedStatus =
        typeof latestMemory?.object === "string" ? latestMemory.object : latestPatch?.status;
      const latestAcceptedAt = latestMemory?.createdAt ?? (latestPatch ? accepted.findingStatusPatches.get(latestPatch.id) : undefined);
      return {
        findingId,
        currentlyDetected: Boolean(current),
        detectorState: findingDetectorState(current, latestAcceptedStatus),
        currentStatus: current?.status,
        currentTitle: current?.title,
        currentSummary: current?.summary,
        severity: current?.severity,
        latestAcceptedStatus,
        latestAcceptedAt,
        history: patches.map(({ patch, path: patchPath }) => ({
          patchId: patch.id,
          patchPath,
          status: patch.status,
          summary: patch.summary,
          rationale: patch.rationale,
          sourceTaskId: patch.sourceTaskId,
          sourceResultId: patch.sourceResultId,
          createdAt: patch.createdAt,
          acceptedAt: accepted.findingStatusPatches.get(patch.id),
          evidenceCount: patch.evidence.length
        })),
        memoryRecords: memoryRecords.map((record) => ({
          id: record.id,
          status: typeof record.object === "string" ? record.object : undefined,
          summary: record.summary,
          createdAt: record.createdAt,
          patchId: isRecord(record.value) && typeof record.value.patchId === "string" ? record.value.patchId : undefined,
          sourceResultId: isRecord(record.value) && typeof record.value.sourceResultId === "string" ? record.value.sourceResultId : undefined,
          sourceTaskId: isRecord(record.value) && typeof record.value.sourceTaskId === "string" ? record.value.sourceTaskId : undefined
        })),
        traces: findingTraces.map((trace) => ({
          id: trace.id,
          kind: trace.kind,
          timestamp: trace.timestamp,
          summary: trace.summary,
          patchId: isRecord(trace.data) && typeof trace.data.patchId === "string" ? trace.data.patchId : undefined,
          status: isRecord(trace.data) && typeof trace.data.status === "string" ? trace.data.status : undefined
        }))
      };
    });

  return {
    ok: true,
    root,
    generatedAt: new Date().toISOString(),
    findingsPath: projectRelativePath(root, findingsPath),
    counts: {
      findings: findings.length,
      currentlyDetected: findings.filter((finding) => finding.currentlyDetected).length,
      historicalOnly: findings.filter((finding) => !finding.currentlyDetected).length,
      acceptedHistoryEvents: findings.reduce((total, finding) => total + finding.history.filter((entry) => entry.acceptedAt).length, 0)
    },
    findings
  };
}

function findingDetectorState(current: ArchitectureFinding | undefined, latestAcceptedStatus: string | undefined): string {
  if (!current && latestAcceptedStatus) return "disappeared_after_reconciliation";
  if (!current) return "historical_only";
  if (!latestAcceptedStatus) return "detected";
  if (current.status === "open" && latestAcceptedStatus !== "open") return "reopened";
  if (current.status === latestAcceptedStatus) return "still_detected_with_accepted_status";
  return "detected_with_new_status";
}

async function readFindingStatusPatchEntries(root: string): Promise<Array<{ path: string; patch: FindingStatusPatch }>> {
  const patchDir = path.join(root, ".distinction", "cache", "finding-status-patches");
  const files = await listJsonFiles(patchDir);
  const entries: Array<{ path: string; patch: FindingStatusPatch }> = [];
  for (const file of files) {
    entries.push({
      path: projectRelativePath(root, file),
      patch: await readJsonWithSchema(file, FindingStatusPatchSchema)
    });
  }
  return entries;
}

async function readTraceRecordJsonl(root: string): Promise<TraceRecord[]> {
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    const records: TraceRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(TraceRecordSchema.parse(JSON.parse(trimmed)));
      } catch {
        // Legacy trace records are intentionally ignored by the governed audit view.
      }
    }
    return records;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(absolute)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) files.push(absolute);
  }
  return files;
}

async function commandProjectView(args: Args, rest: string[]): Promise<void> {
  const view = rest.find((item) => !item.startsWith("--")) ?? String(args.view ?? "");
  if (
    view !== "architecture" &&
    view !== "code-facts" &&
    view !== "findings" &&
    view !== "memory" &&
    view !== "trace" &&
    view !== "tasks" &&
    view !== "design" &&
    view !== "context"
  ) {
    throw new Error(`Unsupported project:view target: ${view || "(missing)"}`);
  }

  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  if (view === "memory") {
    const records = await readAllMemoryRecords(resolvedRoot);
    const memoryView = ProjectedGraphViewSchema.parse(
      projectMemoryGraphView({
        root: resolvedRoot,
        records,
        sourceMemoryPaths: [
          ".distinction/memory/facts.jsonl",
          ".distinction/memory/inferences.jsonl",
          ".distinction/memory/candidates.jsonl",
          ".distinction/memory/confirmations.jsonl",
          ".distinction/memory/decisions.jsonl",
          ".distinction/memory/findings.jsonl"
        ]
      })
    );
    const memoryViewPath = path.join(resolvedRoot, ".distinction", "views", "memory", "memory-view.json");
    await writeJson(memoryViewPath, memoryView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: memoryView, path: ".distinction/views/memory/memory-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", memoryView);
    outputProjectedViewSummary(resolvedRoot, view, memoryViewPath, manifestPath, memoryView);
    return;
  }

  if (view === "trace") {
    const traces = await readTraceRecords(resolvedRoot);
    const traceView = ProjectedGraphViewSchema.parse(
      projectTraceGraphView({
        root: resolvedRoot,
        traces,
        sourceTracePaths: [".distinction/memory/traces.jsonl"]
      })
    );
    const traceViewPath = path.join(resolvedRoot, ".distinction", "views", "trace", "trace-view.json");
    await writeJson(traceViewPath, traceView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: traceView, path: ".distinction/views/trace/trace-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", traceView);
    outputProjectedViewSummary(resolvedRoot, view, traceViewPath, manifestPath, traceView);
    return;
  }

  if (view === "tasks") {
    const tasks = await readTaskProjectionRecords(resolvedRoot);
    const taskView = ProjectedGraphViewSchema.parse(
      projectTaskPlanGraphView({
        root: resolvedRoot,
        tasks,
        sourceTaskPaths: tasks.map((task) => task.path ?? ".distinction/tasks")
      })
    );
    const taskViewPath = path.join(resolvedRoot, ".distinction", "views", "project-plan", "task-view.json");
    await writeJson(taskViewPath, taskView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: taskView, path: ".distinction/views/project-plan/task-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", taskView);
    outputProjectedViewSummary(resolvedRoot, view, taskViewPath, manifestPath, taskView);
    return;
  }

  if (view === "context") {
    const packetPath =
      typeof args.packet === "string"
        ? args.packet
        : path.join(resolvedRoot, ".distinction", "cache", "context-packet.json");
    const packet = await readJsonWithSchema(packetPath, ContextPacketSchema);
    const contextView = ProjectedGraphViewSchema.parse(
      projectContextGraphView({
        packet,
        sourceCachePaths: [projectRelativePath(resolvedRoot, packetPath)]
      })
    );
    const contextViewPath = path.join(resolvedRoot, ".distinction", "views", "context", "context-view.json");
    await writeJson(contextViewPath, contextView, ProjectedGraphViewSchema);
    const manifestPath = await writeProjectionManifest(
      resolvedRoot,
      buildProjectionManifest({
        root: resolvedRoot,
        projectedViews: [{ view: contextView, path: ".distinction/views/context/context-view.json" }]
      })
    );
    await maybeWriteJson(args, "out", contextView);
    outputProjectedViewSummary(resolvedRoot, view, contextViewPath, manifestPath, contextView);
    return;
  }

  if (view === "design") {
    const model = await readInteractionModelCandidate(resolvedRoot, args);
    const designMapHtmlPath = await writeUseCaseDiagramsMapHtmlDocument(resolvedRoot, model);
    const modelPath = await writeInteractionModelCandidate(resolvedRoot, model);
    const projection = await writeDesignUseCaseProjectionViews(resolvedRoot, model);
    await maybeWriteJson(args, "out", model);
    outputJson({
      ok: true,
      root: resolvedRoot,
      view: "design",
      designMapDocPath: path.join(resolvedRoot, DESIGN_MAP_DOC_RELATIVE_PATH),
      designMapHtmlPath,
      modelPath,
      manifestPath: projection.manifestPath,
      useCaseListViewPath: projection.useCaseListViewPath,
      useCaseViewPaths: projection.useCaseViewPaths,
      mermaidPaths: projection.mermaidPaths,
      contexts: model.contexts.length,
      useCases: model.useCases.length,
      relations: model.relations.length
    });
    return;
  }

  if (view === "code-facts") {
    const codeFacts = args["code-facts"]
      ? await readJsonWithSchema(String(args["code-facts"]), CodeFactGraphSnapshotSchema)
      : await readOrBuildCodeFacts(root, args);
    const codeFactView = ProjectedGraphViewSchema.parse(
      projectCodeFactGraphView({
        codeFacts,
        sourceCachePaths: [".distinction/cache/code-fact-graph.json"]
      })
    );
    const codeFactViewPath = path.join(resolvedRoot, ".distinction", "views", "code", "code-fact-view.json");
    await writeJson(codeFactViewPath, codeFactView, ProjectedGraphViewSchema);
    const manifest = buildProjectionManifest({
      root: resolvedRoot,
      projectedViews: [{ view: codeFactView, path: ".distinction/views/code/code-fact-view.json" }]
    });
    const manifestPath = await writeProjectionManifest(resolvedRoot, manifest);
    await maybeWriteJson(args, "out", codeFactView);
    outputJson({
      ok: true,
      root: resolvedRoot,
      view: "code-facts",
      codeFactViewPath,
      manifestPath,
      nodes: codeFactView.nodes.length,
      edges: codeFactView.edges.length,
      annotations: codeFactView.annotations.length,
      status: codeFactView.status
    });
    return;
  }

  const modelPath =
    typeof args.model === "string"
      ? args.model
      : path.join(resolvedRoot, ".distinction", "cache", "architecture-model-patch.json");
  const findingsPath =
    typeof args.findings === "string"
      ? args.findings
      : path.join(resolvedRoot, ".distinction", "cache", "architecture-findings.json");

  let model: ArchitectureModelPatch;
  try {
    model = await readJsonWithSchema(modelPath, ArchitectureModelPatchSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    const records = await readFactRecords(root);
    model = ArchitectureModelPatchSchema.parse(buildArchitectureModelPatch(resolvedRoot, records as any[]));
    await writeJson(modelPath, model, ArchitectureModelPatchSchema);
  }

  let findings: ArchitectureFindingReport;
  try {
    findings = await readJsonWithSchema(findingsPath, ArchitectureFindingReportSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    findings = ArchitectureFindingReportSchema.parse(detectArchitectureFindings(model));
    await writeJson(findingsPath, findings, ArchitectureFindingReportSchema);
  }

  if (view === "findings") {
    const findingView = ProjectedGraphViewSchema.parse(
      projectFindingsGraphView({
        findings,
        sourceCachePaths: [projectRelativePath(resolvedRoot, findingsPath)]
      })
    );
    const findingViewPath = path.join(resolvedRoot, ".distinction", "views", "findings", "finding-view.json");
    await writeJson(findingViewPath, findingView, ProjectedGraphViewSchema);
    const manifest = buildProjectionManifest({
      root: resolvedRoot,
      projectedViews: [{ view: findingView, path: ".distinction/views/findings/finding-view.json" }]
    });
    const manifestPath = await writeProjectionManifest(resolvedRoot, manifest);
    await maybeWriteJson(args, "out", findingView);
    outputJson({
      ok: true,
      root: resolvedRoot,
      view: "findings",
      findingViewPath,
      manifestPath,
      nodes: findingView.nodes.length,
      edges: findingView.edges.length,
      annotations: findingView.annotations.length,
      status: findingView.status
    });
    return;
  }

  const dependencyView = ArchitectureDependencyViewSchema.parse(projectArchitectureDependencyView({ model, findings }));
  const architectureGraphView = ProjectedGraphViewSchema.parse(
    projectArchitectureDependencyGraphView({
      model,
      findings,
      sourceCachePaths: [projectRelativePath(resolvedRoot, modelPath), projectRelativePath(resolvedRoot, findingsPath)]
    })
  );
  const dependencyViewPath = path.join(resolvedRoot, ".distinction", "views", "architecture", "dependency-view.json");
  const architectureGraphViewPath = path.join(resolvedRoot, ".distinction", "views", "architecture", "architecture-graph-view.json");
  await writeJson(dependencyViewPath, dependencyView, ArchitectureDependencyViewSchema);
  await writeJson(architectureGraphViewPath, architectureGraphView, ProjectedGraphViewSchema);

  const manifest = buildProjectionManifest({
    root: resolvedRoot,
    dependencyView,
    dependencyViewPath: ".distinction/views/architecture/dependency-view.json",
    projectedViews: [{ view: architectureGraphView, path: ".distinction/views/architecture/architecture-graph-view.json" }],
    authority: "review_cache",
    sourceCachePaths: [projectRelativePath(resolvedRoot, modelPath), projectRelativePath(resolvedRoot, findingsPath)]
  });
  const manifestPath = path.join(resolvedRoot, ".distinction", "cache", "projection-manifest.json");
  await writeProjectionManifest(resolvedRoot, manifest);
  await maybeWriteJson(args, "out", dependencyView);

  outputJson({
    ok: true,
    root: resolvedRoot,
    view: "architecture",
    dependencyViewPath,
    architectureGraphViewPath,
    manifestPath,
    nodes: dependencyView.nodes.length,
    edges: dependencyView.edges.length,
    annotations: dependencyView.annotations.length,
    status: manifest.views[0]?.status ?? "fresh"
  });
}

function outputProjectedViewSummary(root: string, view: string, viewPath: string, manifestPath: string, projectedView: { nodes: unknown[]; edges: unknown[]; annotations: unknown[]; status: string }): void {
  outputJson({
    ok: true,
    root,
    view,
    viewPath,
    manifestPath,
    nodes: projectedView.nodes.length,
    edges: projectedView.edges.length,
    annotations: projectedView.annotations.length,
    status: projectedView.status
  });
}

async function writeProjectionManifest(root: string, next: ReturnType<typeof buildProjectionManifest>): Promise<string> {
  const manifestPath = path.join(root, ".distinction", "cache", "projection-manifest.json");
  let existing: ReturnType<typeof buildProjectionManifest> | undefined;
  try {
    existing = await readJsonWithSchema(manifestPath, ProjectionManifestSchema);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  const nextIds = new Set(next.views.map((view) => view.id));
  const merged = ProjectionManifestSchema.parse({
    schemaVersion: "praxis.projectionManifest.v1",
    root,
    generatedAt: next.generatedAt,
    views: [...(existing?.views.filter((view) => !nextIds.has(view.id)) ?? []), ...next.views]
  });
  await writeJson(manifestPath, merged, ProjectionManifestSchema);
  return manifestPath;
}

async function commandContextPacket(args: Args): Promise<void> {
  const root = required(args, "root");
  const resolvedRoot = path.resolve(root);
  const anchor = parseGraphAnchor(required(args, "anchor"));
  const purpose = contextPacketPurposeArg(args);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root: resolvedRoot,
      anchor,
      purpose,
      createdBy: "cli",
      limit: {
        codeFacts: numberArg(args, "limit-code-facts"),
        findings: numberArg(args, "limit-findings"),
        memory: numberArg(args, "limit-memory"),
        projectionNodes: numberArg(args, "limit-projection-nodes")
      }
    })
  );
  if (args["write-cache"] === true) {
    await writeJson(path.join(resolvedRoot, ".distinction", "cache", "context-packet.json"), packet, ContextPacketSchema);
  }
  await maybeWriteJsonWithSchema(args, "out", packet, ContextPacketSchema);
  outputJson({
    ok: true,
    root: resolvedRoot,
    contextPacketId: packet.id,
    anchor: packet.anchor,
    purpose: packet.purpose,
    codeFactNodes: packet.codeFacts.nodes.length,
    codeFactEdges: packet.codeFacts.edges.length,
    findings: packet.findings.length,
    projectionViews: packet.projections.views.length,
    memoryFacts: packet.memory.facts.length,
    includedPaths: packet.scope.includedPaths,
    warnings: packet.warnings
  });
}

function contextPacketPurposeArg(args: Args) {
  const purpose = String(args.purpose ?? "explain");
  if (
    purpose === "explain" ||
    purpose === "plan" ||
    purpose === "task" ||
    purpose === "review" ||
    purpose === "governance" ||
    purpose === "external_agent"
  ) {
    return purpose;
  }
  throw new Error(`Unsupported context packet purpose: ${purpose}`);
}

async function readOrBuildCodeFacts(root: string, args: Args) {
  const cachePath = path.join(path.resolve(root), ".distinction", "cache", "code-fact-graph.json");
  if (args["rebuild-code-facts"] !== true) {
    try {
      const cached = await readJsonWithSchema(cachePath, CodeFactGraphSnapshotSchema);
      if (await isCodeFactCacheCurrent(root, cached)) return cached;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      // Build below when no cache exists.
    }
  }
  const snapshot = CodeFactGraphSnapshotSchema.parse(
    await buildCodeFactGraphSnapshot(root, {
      provider: codeFactProviderArg(args),
      includeHidden: args["include-hidden"] === true,
      maxFiles: numberArg(args, "max-files"),
      maxFileSizeBytes: numberArg(args, "max-file-size")
    })
  );
  await writeJson(cachePath, snapshot, CodeFactGraphSnapshotSchema);
  return snapshot;
}

async function isCodeFactCacheCurrent(root: string, snapshot: CodeFactGraphSnapshot): Promise<boolean> {
  const resolvedRoot = path.resolve(root);
  if (path.resolve(snapshot.root) !== resolvedRoot) return false;
  const filePaths = new Set<string>();
  for (const file of snapshot.files) {
    if (isSyntheticCodeFactPath(file.path)) continue;
    filePaths.add(file.path);
  }
  for (const node of snapshot.nodes) {
    if (isSyntheticCodeFactPath(node.filePath)) continue;
    filePaths.add(node.filePath);
  }
  for (const filePath of filePaths) {
    if (!(await exists(path.join(resolvedRoot, normalizeProjectRelativePath(filePath))))) return false;
  }
  return true;
}

function isSyntheticCodeFactPath(filePath: string): boolean {
  const normalized = normalizeProjectRelativePath(filePath);
  return normalized === "." || normalized.length === 0;
}

function codeFactProviderArg(args: Args): CodeFactProviderSource {
  const provider = String(args.provider ?? process.env.PRAXIS_CODE_FACT_PROVIDER ?? "codegraph");
  if (provider === "native" || provider === "codegraph" || provider === "lsp" || provider === "scip") return provider;
  throw new Error(`Unsupported code fact provider: ${provider}`);
}

function projectRelativePath(root: string, filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return absolute.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
}

function numberArg(args: Args, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value for --${key}: ${value}`);
  return parsed;
}

function timeoutMsArg(args: Args, keys: string[], fallbackMs: number): number {
  for (const key of keys) {
    const parsed = numberArg(args, key);
    if (parsed === undefined) continue;
    if (parsed === 0) return 0;
    if (parsed < 1_000) throw new Error(`Invalid timeout for --${key}: ${parsed}. Timeout must be at least 1000ms.`);
    return parsed;
  }
  if (fallbackMs < 0) return fallbackMs;
  return fallbackMs;
}

async function readAllMemoryRecords(root: string): Promise<MemoryRecord[]> {
  const memoryDir = path.join(root, ".distinction", "memory");
  const records: MemoryRecord[] = [];
  for (const file of MEMORY_RECORD_FILES) {
    records.push(...(await readMemoryRecordJsonl(path.join(memoryDir, file))));
  }
  return records;
}

async function readMemoryRecordJsonl(filePath: string): Promise<MemoryRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => MemoryRecordSchema.parse(JSON.parse(line)));
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function readTraceRecords(root: string): Promise<TraceProjectionRecord[]> {
  const tracesPath = path.join(root, ".distinction", "memory", "traces.jsonl");
  try {
    const raw = await readFile(tracesPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => normalizeTraceProjectionRecord(JSON.parse(line), index));
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

function normalizeTraceProjectionRecord(value: unknown, index: number): TraceProjectionRecord {
  if (!isRecord(value)) return { id: `trace:${index + 1}`, summary: String(value) };
  return {
    id: stringOr(value.id, `trace:${index + 1}`),
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : undefined,
    kind: typeof value.kind === "string" ? value.kind : undefined,
    target: isRecord(value.target)
      ? {
          type: typeof value.target.type === "string" ? value.target.type : undefined,
          id: typeof value.target.id === "string" ? value.target.id : undefined
        }
      : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    data: isRecord(value.data) ? value.data : undefined
  };
}

async function readTaskProjectionRecords(root: string): Promise<TaskProjectionRecord[]> {
  const tasksDir = path.join(root, ".distinction", "tasks");
  let entries;
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const tasks: TaskProjectionRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const absolute = path.join(tasksDir, entry.name);
    const relativePath = projectRelativePath(root, absolute);
    const raw = await readFile(absolute, "utf8");
    const firstHeading = raw.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim();
    const id = entry.name.replace(/\.md$/i, "");
    tasks.push({
      id,
      title: firstHeading || id,
      path: relativePath,
      status: "open",
      summary: raw.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"))?.trim(),
      sourceFindingIds: extractFindingIds(raw)
    });
  }
  return tasks;
}

function extractFindingIds(value: string): string[] {
  return Array.from(new Set(value.match(/finding:[A-Za-z0-9._:-]+/g) ?? []));
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T> {
  return schema.parse(await readJson(filePath));
}

async function tryReadJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T | undefined> {
  try {
    return await readJsonWithSchema(filePath, schema);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

async function tryReadJsonFile(filePath: string): Promise<unknown | undefined> {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(stripJsonBom(content));
  } catch {
    return undefined;
  }
}

function safeJsonRecord(content: string): Record<string, unknown> | null {
  const parsed = safeJson(content);
  return isRecord(parsed) ? parsed : null;
}

function stripJsonBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

async function maybeWriteJson(args: Args, key: string, value: unknown): Promise<void> {
  const out = args[key];
  if (typeof out === "string") await writeFile(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function maybeWriteJsonWithSchema<T>(args: Args, key: string, value: T, schema: JsonSchema<T>): Promise<void> {
  const out = args[key];
  if (typeof out === "string") await writeFile(out, `${JSON.stringify(schema.parse(value), null, 2)}\n`, "utf8");
}

async function writeJson<T>(filePath: string, value: T, schema?: JsonSchema<T>): Promise<void> {
  const parsed = schema ? schema.parse(value) : value;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

async function writeJsonAtomic<T>(filePath: string, value: T, schema?: JsonSchema<T>): Promise<void> {
  const parsed = schema ? schema.parse(value) : value;
  await mkdir(path.dirname(filePath), { recursive: true });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${attempt}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      await rm(tempPath, { force: true }).catch(() => undefined);
      await sleep(75 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function outputJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

void main(process.argv.slice(2));
