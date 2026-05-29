import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface RuntimeIntakeResult {
  ok: boolean;
  snapshot?: unknown;
  root?: string;
  reviewOnly?: boolean;
  provider?: {
    name: string;
    source: string;
    version?: string;
    runId?: string;
    capabilities?: string[];
  };
  cache?: {
    repositorySnapshot?: string;
    codeFacts?: string;
    projectProfile?: string;
    repositoryUnderstandingPatch?: string;
    architectureModelPatch?: string;
    architectureFindings?: string;
  };
  summary?: {
    files: number;
    codeFactNodes: number;
    codeFactEdges: number;
    memoryPatches: number;
    modules: number;
    dependencies: number;
    findings: number;
  };
  next?: string;
  profile?: {
    moduleCandidates: { id: string; title: string; path: string; kind: string; confidence: string }[];
    projectKinds: string[];
    languages: string[];
    frameworks: string[];
    warnings?: string[];
  };
  architecture?: {
    modules: {
      id: string;
      name: string;
      path: string;
      role: string;
      confidence?: string;
      responsibilities?: string[];
    }[];
    dependencies: {
      id: string;
      sourceModuleId: string;
      targetModuleId: string;
      kind: string;
      confidence?: string;
    }[];
    warnings?: { id: string; severity: string; summary: string }[];
  };
  findings?: {
    findings: { id: string; title?: string; summary: string; severity?: string; status?: string }[];
  };
  candidate?: {
    graph: RuntimeGraph;
    warnings: { id: string; severity: string; summary: string; targetId?: string }[];
    unresolvedQuestions: { id: string; question: string; targetId?: string }[];
  };
}

export interface RuntimeGraph {
  id: string;
  title: string;
  rootPath?: string;
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
  metadata?: Record<string, unknown>;
}

export interface RuntimeProjectProfile {
  name: string;
  root: string;
  projectKinds: string[];
  languages: string[];
  frameworks: string[];
  buildSystems: string[];
  packageManagers: string[];
  entrypoints: string[];
  testFiles: string[];
  testCommands: string[];
  runCommands: string[];
  buildCommands: string[];
  moduleCandidates: {
    id: string;
    title: string;
    path: string;
    kind: string;
    confidence: string;
    evidence?: string[];
  }[];
  confidence: string;
  evidence?: { id: string; summary: string; references: string[] }[];
}

export interface RuntimeArchitectureModel {
  schemaVersion: "praxis.architectureModelPatch.v1";
  root: string;
  generatedAt: string;
  modules: {
    id: string;
    name: string;
    path: string;
    role: string;
    responsibilities?: string[];
    sourceMemoryIds?: string[];
    evidence?: unknown[];
    confidence?: string;
    knowledgeKind?: string;
  }[];
  dependencies: {
    id: string;
    sourceModuleId: string;
    targetModuleId: string;
    kind: string;
    sourceMemoryIds?: string[];
    evidence?: unknown[];
    confidence?: string;
    knowledgeKind?: string;
  }[];
  warnings?: { id: string; severity: string; summary: string }[];
  confidence?: string;
}

export interface RuntimeMemoryRecord {
  id: string;
  kind: string;
  type: string;
  subject: string;
  predicate: string;
  object?: string;
  value?: unknown;
  summary: string;
  evidence?: { source?: string; filePath: string; startLine?: number; endLine?: number; excerpt?: string }[];
  source: string;
  confidence: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeMemoryRecordSet {
  facts: RuntimeMemoryRecord[];
  inferences: RuntimeMemoryRecord[];
  candidates: RuntimeMemoryRecord[];
  confirmations: RuntimeMemoryRecord[];
  decisions: RuntimeMemoryRecord[];
  findings: RuntimeMemoryRecord[];
}

export interface RuntimeEngineeringSourceData {
  profile?: RuntimeProjectProfile;
  architecture?: RuntimeArchitectureModel;
  codeFacts?: RuntimeCodeFactGraphSnapshot;
  legacyGraph?: RuntimeGraph | null;
  memory: RuntimeMemoryRecordSet;
  readErrors: Record<string, string>;
}

export interface RuntimeNode {
  id: string;
  kind: string;
  title: string;
  description?: string;
  progress: number;
  status: string;
  confidence: string;
  knowledgeKind: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  title?: string;
  description?: string;
  progress: number;
  status: string;
  riskLevel: string;
  blockedReason?: string;
  confidence: string;
  knowledgeKind: string;
  metadata?: Record<string, unknown>;
}


// ─── Agent Run Types ─────────────────────────────────────────

export interface RuntimeAgentStep {
  id: string;
  runId: string;
  sequence: number;
  timestamp: string;
  kind: "tool_call" | "tool_result" | "permission_request" | "context_compaction" | "patch_preview" | "command_result" | "model_response" | "error";
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolRiskLevel?: string;
  toolStatus?: "pending" | "running" | "success" | "failed";
  toolInputSummary?: string;
  toolOutputSummary?: string;
  toolCallId?: string;
  permissionId?: string;
  permissionTitle?: string;
  permissionDescription?: string;
  permissionActionType?: string;
  permissionAffectedPaths?: string[];
  permissionOptions?: { id: string; label: string }[];
  patchFilePath?: string;
  patchDiff?: string;
  commandLine?: string;
  commandStdout?: string;
  commandStderr?: string;
  commandExitCode?: number;
  reasoningContent?: string;
  reasoningDurationMs?: number;
  modelContent?: string;
  modelStructured?: unknown;
  errorMessage?: string;
  transitionReason?: string;
  compactedMessageCount?: number;
  compactedChars?: number;
  compactSummary?: string;
}

export interface RuntimeAgentRunResult {
  ok: boolean;
  sessionId: string;
  runId: string;
  runPath: string;
  logPaths?: RuntimeAgentLogPaths;
  runStatus: "running" | "waiting_for_permission" | "completed" | "failed" | "cancelled";
  terminalReason?: string;
  transitions?: Array<{ reason: string; timestamp: string; detail?: string }>;
  stepCount: number;
  finalMessage: string;
  finalStructured?: unknown;
}

export interface RuntimeAgentLogPaths {
  chatSessionsIndex: string;
  chatTranscript: string;
  runsIndex: string;
  runPath?: string;
  traces: string;
}

export interface RuntimeChatResult {
  traceId: string;
  mode: "explain" | "plan";
  contextSummary: string;
  selectedModel: string;
  message: string;
  structured?: unknown;
}

export interface RuntimePlanAction {
  id: string;
  type: string;
  title: string;
  description: string;
  targetNodeIds: string[];
  targetEdgeIds: string[];
  data?: Record<string, unknown>;
}

export interface RuntimeGraphPlan {
  id: string;
  summary: string;
  missingGluePoints: { title: string; reason: string; kind: string }[];
  actions: RuntimePlanAction[];
  codingTasks: { title: string; allowedPaths: string[]; forbiddenPaths: string[]; acceptanceCriteria: string[] }[];
  questions: string[];
}

export type RuntimeChatTarget =
  | { type: "project" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "subgraph"; nodeIds: string[]; edgeIds: string[] };

export interface RuntimeChatSession {
  id: string;
  projectRoot: string;
  title: string;
  target: RuntimeChatTarget;
  mode: "explain" | "plan" | "apply" | "task";
  modelRoute?: string;
  createdAt: string;
  updatedAt: string;
}

export type RuntimeChatIntent = "explain" | "plan" | "generate_task" | "apply" | "import_result";

export type RuntimeChatMessageRole = "user" | "assistant" | "system" | "tool" | "permission" | "result" | "error";

export interface RuntimeToolCallView {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  inputSummary: string;
  outputSummary?: string;
  riskLevel: "read" | "plan" | "write_memory" | "write_docs" | "write_source" | "shell" | "network";
}

export interface RuntimePermissionRequestView {
  id: string;
  title: string;
  description: string;
  actionType:
    | "apply_plan"
    | "tool_call"
    | "read"
    | "plan"
    | "write_memory"
    | "write_docs"
    | "write_source"
    | "shell"
    | "network"
    | "write_graph"
    | "generate_task"
    | "import_task_result"
    | "run_external_agent";
  affectedPaths: string[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  options: { id: "approve" | "reject" | "modify"; label: string }[];
}

export interface RuntimeCodingAgentTask {
  id: string;
  title: string;
  instruction: string;
  source: {
    planId?: string;
    targetNodeIds: string[];
    targetEdgeIds: string[];
  };
  context: {
    architectureContext: string;
    graphContext: string;
    memoryContext: string[];
    constraints: string[];
  };
  scope: {
    relatedFiles: string[];
    allowedPaths: string[];
    forbiddenPaths: string[];
  };
  acceptanceCriteria: string[];
  verificationCommands: string[];
  expectedOutput: Record<string, boolean>;
}

export interface RuntimeChatMessage {
  id: string;
  sessionId: string;
  role: RuntimeChatMessageRole;
  createdAt: string;
  content: string;
  status?: "streaming" | "done" | "failed" | "cancelled";
  reasoning?: { content: string; durationMs?: number };
  structured?: unknown;
  toolCall?: RuntimeToolCallView;
  permissionRequest?: RuntimePermissionRequestView;
  plan?: RuntimeGraphPlan;
  task?: RuntimeCodingAgentTask;
  traceIds?: string[];
}

export interface RuntimeChatTranscriptResult {
  ok: boolean;
  sessionId?: string;
  session: RuntimeChatSession;
  messages: RuntimeChatMessage[];
  appendedMessages?: RuntimeChatMessage[];
  logPaths?: RuntimeAgentLogPaths;
  pendingPermission?: RuntimePermissionRequestView;
  plan?: RuntimeGraphPlan;
}

export interface RecentProject {
  root: string;
  name: string;
  lastOpenedAt: string;
}

export interface NewProjectPlan {
  projectName: string;
  productIdea: string;
  projectKind: string;
  requirements: { id: string; title: string; description: string }[];
  architecture: { id: string; title: string; responsibility: string }[];
  graph: RuntimeGraph;
  files: { path: string; content: string }[];
  assumptions: { id: string; summary: string }[];
  questions: { id: string; question: string }[];
}

export interface RuntimeReviewQueueResult {
  ok: boolean;
  root: string;
  generatedAt: string;
  includeAccepted: boolean;
  counts: {
    memorySuggestions: number;
    findingStatusPatches: number;
    qualityFindings: number;
    total: number;
  };
  qualityReview?: RuntimeQualityReviewSummary;
  reviewFindings: RuntimeReviewFinding[];
  foundation?: RuntimeFoundationReviewStatus;
  memorySuggestions: RuntimeMemorySuggestionReviewItem[];
  findingStatusPatches: RuntimeFindingStatusReviewItem[];
}

export interface RuntimeProjectTreeNode {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "file";
  children: RuntimeProjectTreeNode[];
  fileCount: number;
  directoryCount: number;
  language?: string;
  roleHint?: string;
  lineCount?: number;
  sizeBytes?: number;
  truncated?: boolean;
}

export interface RuntimeProjectTreeResult {
  ok: boolean;
  generatedAt: string;
  source?: "filesystem" | "cache";
  scannedAt?: string;
  maxDepth: number;
  maxEntries: number;
  root: RuntimeProjectTreeNode;
  totalFiles: number;
  totalDirectories?: number;
  renderedEntries: number;
  truncated: boolean;
  warning?: string;
}

export type RuntimeReviewSeverity = "P0" | "P1" | "P2" | "P3";

export type RuntimeReviewCategory =
  | "foundation_integrity"
  | "architecture_boundaries"
  | "dependencies_coupling"
  | "build_release"
  | "testing_verification"
  | "security_secrets"
  | "configuration_environment"
  | "code_quality_maintainability"
  | "api_contracts_data_flow"
  | "performance_resources"
  | "documentation_knowledge";

export interface RuntimeQualityReviewSummary {
  counts: {
    total: number;
    bySeverity: Record<RuntimeReviewSeverity, number>;
    byCategory: Partial<Record<RuntimeReviewCategory, number>>;
  };
  generatedAt: string;
  severityOrder: RuntimeReviewSeverity[];
  categoryOrder: RuntimeReviewCategory[];
  evaluatorResults?: {
    evaluator: RuntimeReviewEvaluatorRef;
    status: "completed" | "partial" | "failed";
    findingIds: string[];
    summary: string;
  }[];
}

export interface RuntimeReviewEvidenceRef {
  source: "repository_snapshot" | "code_fact_graph" | "memory" | "projection" | "trace" | "file" | "agent";
  path?: string;
  anchor?: RuntimeGraphAnchor;
  summary: string;
  excerpt?: string;
}

export interface RuntimeReviewEvaluatorRef {
  id: string;
  name: string;
  category: RuntimeReviewCategory;
  prompt: string;
  source: "praxis-heuristic" | "pi-agent" | "hybrid";
}

export interface RuntimeReviewFinding {
  schemaVersion: "praxis.reviewFinding.v1";
  id: string;
  runId: string;
  category: RuntimeReviewCategory;
  severity: RuntimeReviewSeverity;
  status:
    | "candidate"
    | "confirmed"
    | "dismissed"
    | "needs_more_evidence"
    | "open"
    | "acknowledged"
    | "planned"
    | "in_progress"
    | "mitigated"
    | "resolved"
    | "false_positive"
    | "accepted_risk";
  title: string;
  summary: string;
  whyItMatters: string;
  suggestedAction: string;
  confidence: "high" | "medium" | "low";
  source: "scan" | "codegraph" | "agent" | "hybrid";
  evaluator?: RuntimeReviewEvaluatorRef;
  knowledgeKind: "CANDIDATE" | "INFERENCE";
  evidence: RuntimeReviewEvidenceRef[];
  affectedAnchors: RuntimeGraphAnchor[];
  traceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeReviewRun {
  schemaVersion: "praxis.reviewRun.v1";
  id: string;
  root: string;
  generatedAt: string;
  source: "praxis-heuristic" | "pi-agent" | "hybrid";
  status: "completed" | "partial" | "failed";
  categories: RuntimeReviewCategory[];
  findingIds: string[];
  evaluatorResults?: {
    evaluator: RuntimeReviewEvaluatorRef;
    status: "completed" | "partial" | "failed";
    findingIds: string[];
    summary: string;
  }[];
  summary: RuntimeQualityReviewSummary["counts"];
  traceIds: string[];
}

export interface RuntimeReviewRunResult {
  ok: boolean;
  root: string;
  run: RuntimeReviewRun;
  findings: RuntimeReviewFinding[];
  candidateMemoryRecords: number;
  paths: {
    run: string;
    findings: string;
    candidateMemory: string;
  };
}

export interface RuntimeReviewProgress {
  schemaVersion: "praxis.reviewProgress.v1";
  runId: string;
  root: string;
  source: "pi-agent" | "praxis-heuristic";
  scope?: "full" | "category";
  retryCategory?: RuntimeReviewCategory;
  retryOfRunId?: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  totalCategories: number;
  completedCategories: number;
  currentCategory?: RuntimeReviewCategory;
  currentEvaluator?: string;
  message: string;
  findings: number;
  error?: string;
  evaluatorResults?: {
    evaluator: RuntimeReviewEvaluatorRef;
    status: "completed" | "partial" | "failed";
    findingIds: string[];
    summary: string;
  }[];
  pi?: {
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
  };
  events?: {
    timestamp: string;
    type: string;
    summary: string;
    toolName?: string;
    status?: string;
  }[];
}

export interface RuntimeFoundationReviewStatus {
  status: "not_initialized" | "needs_intake" | "understanding_pending" | "foundation_ready" | string;
  generatedAt: string;
  artifacts: {
    repositorySnapshot: RuntimeFoundationArtifact & { files?: number };
    codeFacts: RuntimeFoundationArtifact & {
      provider?: {
        name?: string;
        source?: string;
        version?: string;
        runId?: string;
        capabilities?: string[];
      };
      files: number;
      nodes: number;
      edges: number;
      warnings: number;
    };
    projectProfile: RuntimeFoundationArtifact & {
      projectKinds: string[];
      languages: string[];
      frameworks: string[];
    };
    repositoryUnderstanding: RuntimeFoundationArtifact & {
      memoryPatches: number;
      warnings: number;
      reviewQuestions: number;
      pendingAcceptance: boolean;
    };
    factMemory: RuntimeFoundationArtifact & { records: number };
    architectureModel: RuntimeFoundationArtifact & {
      modules: number;
      dependencies: number;
      warnings: number;
    };
    findings: RuntimeFoundationArtifact & {
      detected: number;
      detectorIds: string[];
    };
    projections: RuntimeFoundationArtifact & {
      manifestViews: number;
      schemaValidViews: number;
      freshViews: number;
      failedViews: number;
      kinds: string[];
    };
    traces: { records: number };
    tasks: { records: number };
  };
  nextActions: string[];
}

export interface RuntimeFoundationArtifact {
  exists: boolean;
  path?: string;
}

export interface RuntimeMemorySuggestionReviewItem {
  id: string;
  path: string;
  sourceResultId?: string;
  sourceTaskId?: string;
  summary: string;
  createdAt: string;
  acceptedAt?: string;
  memoryPatchCount: number;
  records: RuntimeMemorySuggestionRecordPreview[];
}

export interface RuntimeMemorySuggestionRecordPreview {
  patchId: string;
  patchStatus: string;
  id: string;
  kind: string;
  type: string;
  subject: string;
  predicate: string;
  object?: string;
  summary: string;
  confidence: string;
  source: string;
  status: string;
}

export interface RuntimeFindingStatusReviewItem {
  id: string;
  path: string;
  sourceResultId?: string;
  sourceTaskId?: string;
  findingId: string;
  status: string;
  summary: string;
  rationale?: string;
  createdAt: string;
  acceptedAt?: string;
  evidenceCount: number;
}

export interface RuntimeFindingAuditResult {
  ok: boolean;
  root: string;
  generatedAt: string;
  findingsPath: string;
  counts: {
    findings: number;
    currentlyDetected: number;
    historicalOnly: number;
    acceptedHistoryEvents: number;
  };
  findings: RuntimeFindingAuditItem[];
}

export interface RuntimeFindingAuditItem {
  findingId: string;
  currentlyDetected: boolean;
  detectorState: string;
  currentStatus?: string;
  currentTitle?: string;
  currentSummary?: string;
  severity?: string;
  latestAcceptedStatus?: string;
  latestAcceptedAt?: string;
  history: RuntimeFindingAuditHistoryEntry[];
  memoryRecords: RuntimeFindingAuditMemoryRecord[];
  traces: RuntimeFindingAuditTraceEntry[];
}

export interface RuntimeFindingAuditHistoryEntry {
  patchId: string;
  patchPath: string;
  status: string;
  summary: string;
  rationale?: string;
  sourceTaskId?: string;
  sourceResultId?: string;
  createdAt: string;
  acceptedAt?: string;
  evidenceCount: number;
}

export interface RuntimeFindingAuditMemoryRecord {
  id: string;
  status?: string;
  summary: string;
  createdAt: string;
  patchId?: string;
  sourceResultId?: string;
  sourceTaskId?: string;
}

export interface RuntimeFindingAuditTraceEntry {
  id: string;
  kind: string;
  timestamp: string;
  summary: string;
  patchId?: string;
  status?: string;
}

export type RuntimeProjectedGraphViewKind =
  | "architecture_dependency"
  | "architecture_component"
  | "code_fact"
  | "finding"
  | "context"
  | "task_plan"
  | "trace"
  | "memory";

export interface RuntimeGraphAnchor {
  kind:
    | "file"
    | "symbol"
    | "code_fact_node"
    | "code_fact_edge"
    | "architecture_module"
    | "architecture_dependency"
    | "finding"
    | "task"
    | "trace"
    | "memory"
    | "projection_node"
    | "projection_edge";
  id: string;
  path?: string;
}

export interface RuntimeProjectedGraphSource {
  type: string;
  id: string;
}

export interface RuntimeProjectedGraphNode {
  id: string;
  kind: string;
  label: string;
  source: RuntimeProjectedGraphSource;
  anchor: RuntimeGraphAnchor;
  path?: string;
  summary?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeProjectedGraphEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  source: RuntimeProjectedGraphSource;
  anchor: RuntimeGraphAnchor;
  confidence?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeProjectedGraphAnnotation {
  id: string;
  kind: string;
  sourceFindingId?: string;
  targetNodeIds: string[];
  targetEdgeIds: string[];
  severity?: string;
  status?: string;
  summary: string;
  anchor?: RuntimeGraphAnchor;
  metadata?: Record<string, unknown>;
}

export interface RuntimeProjectedGraphView {
  schemaVersion: "praxis.projectedGraphView.v1";
  id: string;
  kind: RuntimeProjectedGraphViewKind;
  root: string;
  generatedAt: string;
  authority: "review_cache" | "durable_model";
  nodes: RuntimeProjectedGraphNode[];
  edges: RuntimeProjectedGraphEdge[];
  annotations: RuntimeProjectedGraphAnnotation[];
  sourceCachePaths: string[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];
  status: "fresh" | "stale" | "regenerating" | "failed";
  error?: string;
}

export interface RuntimeProjectionManifestView {
  id: string;
  kind: RuntimeProjectedGraphViewKind;
  path: string;
  authority: "review_cache" | "durable_model";
  status: "fresh" | "stale" | "regenerating" | "failed";
  generatedAt?: string;
  error?: string;
  sourceCachePaths: string[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];
}

export interface RuntimeProjectionManifest {
  schemaVersion: "praxis.projectionManifest.v1";
  root: string;
  generatedAt: string;
  views: RuntimeProjectionManifestView[];
}

export interface RuntimeProjectedGraphViewRecord {
  path: string;
  manifest?: RuntimeProjectionManifestView;
  view: RuntimeProjectedGraphView;
}

export interface RuntimeProjectionViewsResult {
  manifest: RuntimeProjectionManifest | null;
  records: RuntimeProjectedGraphViewRecord[];
  skippedPaths: string[];
}

export interface RuntimeContextPacketSummary {
  schemaVersion: "praxis.contextPacket.v1";
  id: string;
  root: string;
  generatedAt: string;
  anchor: RuntimeGraphAnchor;
  purpose: "explain" | "plan" | "task" | "review" | "governance" | "external_agent";
  memory: {
    facts: unknown[];
    inferences: unknown[];
    candidates: unknown[];
    confirmations: unknown[];
    findings: unknown[];
    decisions: unknown[];
  };
  codeFacts: {
    nodes: unknown[];
    edges: unknown[];
    callers: unknown[];
    callees: unknown[];
    impacted: unknown[];
    relatedFiles: unknown[];
  };
  projections: {
    views: RuntimeProjectedGraphView[];
    nodes: RuntimeProjectedGraphNode[];
    edges: RuntimeProjectedGraphEdge[];
    annotations: RuntimeProjectedGraphAnnotation[];
  };
  findings: Array<{ id: string; title: string; status: string; severity: string; summary: string }>;
  scope: {
    includedPaths: string[];
    excludedPaths: string[];
    expansionPolicy: string;
  };
  authority: {
    memoryAuthority: string;
    projectionAuthority: string;
  };
  trace: {
    createdBy: string;
    sourceViewId?: string;
  };
  warnings: string[];
}

export interface ModelSettings {
  defaultProvider: string;
  baseUrl: string;
  apiKey: string;
  intakeModel: string;
  nodeExplainModel: string;
  edgeExplainModel: string;
  edgePlanModel: string;
  codingTaskModel: string;
  piProvider: string;
  piModel: string;
  piThinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  piTools: string;
  piCodeGraph: boolean;
  piAllowRead: boolean;
  piAllowShell: boolean;
  piAllowWrite: boolean;
  piTimeoutMs: number;
  reviewPiThinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  reviewPiTimeoutMs: number;
}

export const defaultModelSettings: ModelSettings = {
  defaultProvider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  intakeModel: "deepseek-v4-pro",
  nodeExplainModel: "deepseek-v4-flash",
  edgeExplainModel: "deepseek-v4-pro",
  edgePlanModel: "deepseek-v4-pro",
  codingTaskModel: "deepseek-v4-pro",
  piProvider: "deepseek",
  piModel: "deepseek-v4-pro",
  piThinking: "high",
  piTools: "read,grep,find,ls,codegraph_query,codegraph_context,codegraph_relations,bash,edit,write",
  piCodeGraph: true,
  piAllowRead: true,
  piAllowShell: true,
  piAllowWrite: true,
  piTimeoutMs: 300000,
  reviewPiThinking: "high",
  reviewPiTimeoutMs: 300000
};

const modelSettingsStorageKey = "praxis-studio:model-settings";


export async function runRuntimeCommandAsync(command: string, args: string[]): Promise<string> {
  return invoke<string>("run_runtime_command_async", { command, args });
}

export async function runRuntimeCommand(command: string, args: string[]): Promise<string> {
  return invoke<string>("run_runtime_command", { command, args });
}

export async function openProjectDialog(title = "Open Existing Project"): Promise<string | null> {
  try {
    const selected = await open({ directory: true, multiple: false, title });
    if (typeof selected === "string") return selected;
    if (Array.isArray(selected)) return selected[0] ?? null;
    return null;
  } catch {
    const selected = await invoke<string | null>("open_project_dialog").catch(() => null);
    return selected;
  }
}

export async function runProjectIntake(root: string): Promise<RuntimeIntakeResult> {
  const stdout = await runRuntimeCommand("intake", ["--root", root]);
  const result = JSON.parse(stdout) as RuntimeIntakeResult;
  if (result.cache?.projectProfile && !result.profile) {
    result.profile = await readDistinctionJson<RuntimeIntakeResult["profile"]>(root, result.cache.projectProfile).catch(() => undefined);
  }
  if (result.cache?.architectureModelPatch && !result.architecture) {
    result.architecture = await readDistinctionJson<RuntimeIntakeResult["architecture"]>(root, result.cache.architectureModelPatch).catch(() => undefined);
  }
  if (result.cache?.architectureFindings && !result.findings) {
    result.findings = await readDistinctionJson<RuntimeIntakeResult["findings"]>(root, result.cache.architectureFindings).catch(() => undefined);
  }
  return result;
}

export async function acceptGraph(root: string, candidate: RuntimeIntakeResult["candidate"]): Promise<void> {
  if (!candidate) throw new Error("DevelopmentGraphCandidate is required.");
  await invoke<string>("initialize_project_memory", {
    projectRoot: root,
    candidateJson: JSON.stringify(candidate)
  });
}

export async function acceptUnderstanding(root: string): Promise<unknown> {
  const stdout = await runRuntimeCommand("accept-understanding", ["--root", root]);
  return JSON.parse(stdout) as unknown;
}

export async function runChat(root: string, targetId: string, mode: "explain" | "plan", instruction: string): Promise<RuntimeChatResult> {
  const stdout = await runRuntimeCommand("chat", ["--project-root", root, "--target", targetId, "--mode", mode, "--instruction", instruction]);
  return JSON.parse(stdout) as RuntimeChatResult;
}




export async function respondToPermission(root: string, permissionId: string, approval: "approve" | "reject"): Promise<void> {
  await invoke("respond_to_permission", { projectRoot: root, permissionId, approval });
}

export async function cancelAgentRun(root: string): Promise<void> {
  await invoke("cancel_agent_run", { projectRoot: root });
}


export async function startAgentRunAsync(
  root: string,
  target: RuntimeChatTarget,
  mode: "explain" | "plan",
  instruction: string,
  sessionId: string,
  onMessages: (messages: RuntimeChatMessage[]) => void,
  signal?: AbortSignal
): Promise<RuntimeAgentRunResult> {
  const args = ["--project-root", root, "--session", sessionId, "--mode", mode, "--instruction", instruction, ...chatTargetArgs(target)];
  
  // Start agent in background
  const spawnResult = JSON.parse(await runRuntimeCommandAsync("agent-run", args));
  
  // Poll for messages until done
  let attempts = 0;
  const maxAttempts = 3600; // 60 minutes at 1s intervals; permission waits can be long.
  
  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      await cancelAgentRun(root);
      return { ok: false, sessionId, runId: "", runPath: "", runStatus: "cancelled", stepCount: 0, finalMessage: "Cancelled" };
    }
    
    await new Promise(r => setTimeout(r, 1000)); // Poll every 1 second
    
    try {
      const transcript = await readChatSession(root, sessionId);
      onMessages(transcript.messages);
      
      // Check if agent finished: look for a completed/failed run result file
      // Or check if the last assistant message is from this run
      const lastMsg = transcript.messages[transcript.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.status !== "streaming") {
        // Try reading the run result from .distinction/runs/
        try {
          const runsResult = await runRuntimeCommand("chat-session-read", ["--project-root", root, "--session", sessionId]);
          const runsData = JSON.parse(runsResult);
          if (runsData.ok) {
            return {
              ok: true,
              sessionId,
              runId: spawnResult.runId || "",
              runPath: spawnResult.runPath || "",
              runStatus: "completed",
              stepCount: 0,
              finalMessage: lastMsg.content
            };
          }
        } catch {}
      }
      
      // Check for error messages
      if (lastMsg && lastMsg.role === "error") {
        return {
          ok: false,
          sessionId,
          runId: spawnResult.runId || "",
          runPath: "",
          runStatus: "failed",
          stepCount: 0,
          finalMessage: lastMsg.content
        };
      }
    } catch {
      // Session might not be ready yet, continue polling
    }
    
    attempts++;
  }
  
  return {
    ok: false,
    sessionId,
    runId: "",
    runPath: "",
    runStatus: "failed",
    stepCount: 0,
    finalMessage: "Agent run timed out after 60 minutes."
  };
}

export async function startAgentRun(
  root: string,
  target: RuntimeChatTarget,
  mode: "explain" | "plan",
  instruction: string,
  sessionId: string
): Promise<RuntimeAgentRunResult> {
  const args = ["--project-root", root, "--session", sessionId, "--mode", mode, "--instruction", instruction, ...chatTargetArgs(target)];
  // Async spawn: process starts in background, returns immediately with { ok: true, pid: ... }
  await runRuntimeCommandAsync("agent-run", args);
  // Agent runs independently — frontend polls readChatSession for results
  return {
    ok: true, sessionId, runId: "", runPath: "",
    runStatus: "running", stepCount: 0, finalMessage: ""
  };
}

export async function createChatSession(root: string, target: RuntimeChatTarget): Promise<RuntimeChatTranscriptResult> {
  const stdout = await runRuntimeCommand("chat-session-create", ["--project-root", root, ...chatTargetArgs(target)]);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function readChatSession(root: string, sessionId: string): Promise<RuntimeChatTranscriptResult> {
  const stdout = await runRuntimeCommand("chat-session-read", ["--project-root", root, "--session", sessionId]);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function sendChatMessage(
  root: string,
  sessionId: string,
  target: RuntimeChatTarget,
  message: string,
  intent?: RuntimeChatIntent,
  actionIds?: string[]
): Promise<RuntimeChatTranscriptResult> {
  const args = ["--project-root", root, "--session", sessionId, ...chatTargetArgs(target), "--message", message];
  if (intent) args.push("--intent", intent);
  if (actionIds?.length) args.push("--actions", actionIds.join(","));
  const stdout = await runRuntimeCommand("chat-send", args);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function respondToChatPermission(
  root: string,
  sessionId: string,
  target: RuntimeChatTarget,
  permissionId: string,
  approval: "approve" | "reject" | "modify",
  actionIds: string[] = []
): Promise<RuntimeChatTranscriptResult> {
  const args = [
    "--project-root",
    root,
    "--session",
    sessionId,
    ...chatTargetArgs(target),
    "--intent",
    "apply",
    "--approval",
    approval,
    "--permission-id",
    permissionId,
    "--message",
    approval === "approve" ? "Approve selected plan actions." : approval === "reject" ? "Reject this Apply request." : "Modify this Apply request."
  ];
  if (actionIds.length) args.push("--actions", actionIds.join(","));
  const stdout = await runRuntimeCommand("chat-send", args);
  return JSON.parse(stdout) as RuntimeChatTranscriptResult;
}

export async function generateTask(root: string, plan: unknown): Promise<string> {
  return invoke<string>("generate_task_from_plan", {
    projectRoot: root,
    planJson: JSON.stringify(plan)
  });
}

export async function applyPlan(root: string, plan: unknown, actionIds: string[]): Promise<unknown> {
  const stdout = await invoke<string>("apply_plan_actions", {
    projectRoot: root,
    planJson: JSON.stringify(plan),
    actionIds
  });
  return JSON.parse(stdout) as unknown;
}

export async function importTaskResult(root: string, result: unknown): Promise<unknown> {
  const stdout = await invoke<string>("import_task_result", {
    projectRoot: root,
    resultJson: typeof result === "string" ? result : JSON.stringify(result)
  });
  return JSON.parse(stdout) as unknown;
}

export async function createProjectPlan(root: string, name: string, intent: string, kind: string): Promise<NewProjectPlan> {
  const stdout = await runRuntimeCommand("create-project-plan", ["--root", root || ".", "--name", name, "--intent", intent, "--kind", kind]);
  const payload = JSON.parse(stdout) as { plan: NewProjectPlan };
  return payload.plan;
}

export async function createProjectFromPlan(root: string, plan: NewProjectPlan): Promise<unknown> {
  const stdout = await invoke<string>("create_project_from_plan", {
    projectRoot: root,
    planJson: JSON.stringify(plan)
  });
  return JSON.parse(stdout) as unknown;
}

export async function readReviewQueue(root: string, includeAccepted = false): Promise<RuntimeReviewQueueResult> {
  const args = ["--root", root];
  if (includeAccepted) args.push("--include-accepted");
  const stdout = await runRuntimeCommand("review-queue", args);
  return JSON.parse(stdout) as RuntimeReviewQueueResult;
}

export async function runQualityReview(root: string, locale?: string, category?: RuntimeReviewCategory): Promise<RuntimeReviewRunResult> {
  const args = ["--root", root];
  if (category) args.push("--category", category);
  if (locale) args.push("--locale", locale, "--response-language", locale === "zh-CN" ? "Simplified Chinese" : "English");
  const stdout = await runRuntimeCommand("review-run", args);
  return JSON.parse(stdout) as RuntimeReviewRunResult;
}

export async function refreshReviewFinding(
  root: string,
  findingId: string,
  locale?: string
): Promise<unknown> {
  const args = ["--root", root, "--finding", findingId];
  if (locale) args.push("--locale", locale, "--response-language", locale === "zh-CN" ? "Simplified Chinese" : "English");
  const stdout = await runRuntimeCommand("review-finding-refresh", args);
  return JSON.parse(stdout) as unknown;
}

export async function startQualityReview(root: string, locale?: string, category?: RuntimeReviewCategory): Promise<{ ok: boolean; pid: number }> {
  const args = ["--root", root];
  if (category) args.push("--category", category);
  if (locale) args.push("--locale", locale, "--response-language", locale === "zh-CN" ? "Simplified Chinese" : "English");
  const stdout = await runRuntimeCommandAsync("review-run", args);
  return JSON.parse(stdout) as { ok: boolean; pid: number };
}

export async function readQualityReviewProgress(root: string): Promise<RuntimeReviewProgress | null> {
  try {
    const content = await invoke<string>("read_project_distinction_file", {
      projectRoot: root,
      relativePath: ".distinction/reviews/progress/latest.json"
    });
    return JSON.parse(content) as RuntimeReviewProgress;
  } catch {
    return null;
  }
}

export async function readFindingAudit(root: string): Promise<RuntimeFindingAuditResult> {
  const stdout = await runRuntimeCommand("finding-audit", ["--root", root]);
  return JSON.parse(stdout) as RuntimeFindingAuditResult;
}

export async function readProjectTree(root: string, options?: { cached?: boolean }): Promise<RuntimeProjectTreeResult> {
  const args = ["--root", root, "--depth", "6", "--max-entries", "2600"];
  if (options?.cached) args.push("--cached");
  const stdout = await runRuntimeCommand("project-tree", args);
  return JSON.parse(stdout) as RuntimeProjectTreeResult;
}

async function readDistinctionJson<T>(root: string, relativePath: string): Promise<T> {
  const content = await invoke<string>("read_project_distinction_file", {
    projectRoot: root,
    relativePath
  });
  return JSON.parse(content) as T;
}

export async function readProjectionManifest(root: string): Promise<RuntimeProjectionManifest | null> {
  try {
    const content = await invoke<string>("read_project_distinction_file", {
      projectRoot: root,
      relativePath: ".distinction/cache/projection-manifest.json"
    });
    return JSON.parse(content) as RuntimeProjectionManifest;
  } catch {
    return null;
  }
}

export async function readProjectedGraphViews(root: string): Promise<RuntimeProjectionViewsResult> {
  const manifest = await readProjectionManifest(root);
  const records: RuntimeProjectedGraphViewRecord[] = [];
  const skippedPaths: string[] = [];
  for (const view of manifest?.views ?? []) {
    try {
      const content = await invoke<string>("read_project_distinction_file", {
        projectRoot: root,
        relativePath: view.path
      });
      const parsed = JSON.parse(content) as Partial<RuntimeProjectedGraphView>;
      if (parsed.schemaVersion !== "praxis.projectedGraphView.v1") {
        skippedPaths.push(view.path);
        continue;
      }
      records.push({ path: view.path, manifest: view, view: parsed as RuntimeProjectedGraphView });
    } catch {
      skippedPaths.push(view.path);
    }
  }
  return { manifest, records, skippedPaths };
}

export async function readEngineeringSourceData(root: string): Promise<RuntimeEngineeringSourceData> {
  const readErrors: Record<string, string> = {};
  const [profile, architecture, codeFacts, memory, legacyGraph] = await Promise.all([
    readOptionalDistinctionJson<RuntimeProjectProfile>(root, ".distinction/cache/project-profile.json", readErrors, "projectProfile"),
    readOptionalDistinctionJson<RuntimeArchitectureModel>(root, ".distinction/cache/architecture-model-patch.json", readErrors, "architectureModel"),
    readOptionalDistinctionJson<RuntimeCodeFactGraphSnapshot>(root, ".distinction/cache/code-fact-graph.json", readErrors, "codeFacts"),
    readMemoryRecordSet(root, readErrors),
    readLegacyGraphFiles(root, readErrors)
  ]);
  return { profile, architecture, codeFacts, memory, legacyGraph, readErrors };
}

async function readOptionalDistinctionJson<T>(
  root: string,
  relativePath: string,
  readErrors: Record<string, string>,
  key: string
): Promise<T | undefined> {
  try {
    return await readDistinctionJson<T>(root, relativePath);
  } catch (error) {
    readErrors[key] = error instanceof Error ? error.message : String(error);
    return undefined;
  }
}

async function readMemoryRecordSet(root: string, readErrors: Record<string, string>): Promise<RuntimeMemoryRecordSet> {
  const entries = await Promise.all([
    readMemoryRecordJsonl(root, "facts.jsonl", readErrors),
    readMemoryRecordJsonl(root, "inferences.jsonl", readErrors),
    readMemoryRecordJsonl(root, "candidates.jsonl", readErrors),
    readMemoryRecordJsonl(root, "confirmations.jsonl", readErrors),
    readMemoryRecordJsonl(root, "decisions.jsonl", readErrors),
    readMemoryRecordJsonl(root, "findings.jsonl", readErrors)
  ]);
  return {
    facts: entries[0],
    inferences: entries[1],
    candidates: entries[2],
    confirmations: entries[3],
    decisions: entries[4],
    findings: entries[5]
  };
}

async function readMemoryRecordJsonl(
  root: string,
  fileName: string,
  readErrors: Record<string, string>
): Promise<RuntimeMemoryRecord[]> {
  const relativePath = `.distinction/memory/${fileName}`;
  try {
    const content = await invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath });
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line, index) => {
        try {
          return [JSON.parse(line) as RuntimeMemoryRecord];
        } catch (error) {
          readErrors[`memory:${fileName}:${index + 1}`] = error instanceof Error ? error.message : String(error);
          return [];
        }
      });
  } catch (error) {
    readErrors[`memory:${fileName}`] = error instanceof Error ? error.message : String(error);
    return [];
  }
}

async function readLegacyGraphFiles(root: string, readErrors: Record<string, string>): Promise<RuntimeGraph | null> {
  try {
    const [nodes, edges] = await Promise.all([
      invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/nodes.json" }),
      invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/edges.json" })
    ]);
    return {
      id: "graph:local",
      title: "Development Graph",
      rootPath: root,
      nodes: JSON.parse(nodes) as RuntimeNode[],
      edges: JSON.parse(edges) as RuntimeEdge[]
    };
  } catch (error) {
    readErrors.legacyGraph = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export async function refreshProjectedGraphViews(root: string): Promise<RuntimeProjectionViewsResult> {
  await runRuntimeCommand("intake", ["--root", root, "--provider", "codegraph"]);
  const targets = ["code-facts", "architecture", "findings", "memory", "trace", "tasks"];
  for (const target of targets) {
    await runRuntimeCommand("project:view", [target, "--root", root]);
  }
  return await readProjectedGraphViews(root);
}

export async function buildContextPacketForAnchor(
  root: string,
  anchor: RuntimeGraphAnchor,
  purpose: RuntimeContextPacketSummary["purpose"] = "explain"
): Promise<RuntimeContextPacketSummary> {
  await runRuntimeCommand("context-packet", [
    "--root",
    root,
    "--anchor",
    graphAnchorToRuntimeArg(anchor),
    "--purpose",
    purpose,
    "--write-cache"
  ]);
  const content = await invoke<string>("read_project_distinction_file", {
    projectRoot: root,
    relativePath: ".distinction/cache/context-packet.json"
  });
  return JSON.parse(content) as RuntimeContextPacketSummary;
}

export async function acceptMemorySuggestion(root: string, suggestionIdOrPath: string): Promise<unknown> {
  const stdout = await runRuntimeCommand("accept-memory-suggestion", ["--root", root, "--suggestion", suggestionIdOrPath]);
  return JSON.parse(stdout) as unknown;
}

export async function acceptFindingStatus(root: string, patchIdOrPath: string): Promise<unknown> {
  const stdout = await runRuntimeCommand("accept-finding-status", ["--root", root, "--patch", patchIdOrPath]);
  return JSON.parse(stdout) as unknown;
}

export async function acceptExternalResult(root: string, resultIdOrPath: string): Promise<unknown> {
  const stdout = await runRuntimeCommand("accept-external-result", ["--root", root, "--result", resultIdOrPath]);
  return JSON.parse(stdout) as unknown;
}

export async function writeDistinctionFile(root: string, relativePath: string, content: string): Promise<void> {
  await invoke<void>("write_project_distinction_file", {
    projectRoot: root,
    relativePath,
    content
  });
}

export async function readRecentProjects(): Promise<RecentProject[]> {
  const stdout = await invoke<string>("read_recent_projects");
  return JSON.parse(stdout) as RecentProject[];
}

export async function recordRecentProject(root: string): Promise<RecentProject[]> {
  const stdout = await invoke<string>("write_recent_project", { projectRoot: root });
  return JSON.parse(stdout) as RecentProject[];
}

export async function readGraph(root: string): Promise<RuntimeGraph> {
  try {
    const [nodes, edges] = await Promise.all([
      invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/nodes.json" }),
      invoke<string>("read_project_distinction_file", { projectRoot: root, relativePath: ".distinction/graph/edges.json" })
    ]);
    return {
      id: "graph:local",
      title: "Development Graph",
      rootPath: root,
      nodes: JSON.parse(nodes) as RuntimeNode[],
      edges: JSON.parse(edges) as RuntimeEdge[]
    };
  } catch {
    const projected = await readProjectedGraphViews(root);
    if (projected.records.length > 0) return runtimeGraphFromProjectedViews(root, projected.records.map((record) => record.view));

    try {
      const codeFacts = await readDistinctionJson<RuntimeCodeFactGraphSnapshot>(root, ".distinction/cache/code-fact-graph.json");
      return runtimeGraphFromCodeFacts(root, codeFacts);
    } catch {
      return minimalRuntimeFoundationGraph(root, "未找到旧 DevelopmentGraph；请先运行项目接入，或在投影检查器生成 Foundation views。");
    }
  }
}

export interface RuntimeCodeFactGraphSnapshot {
  provider?: unknown;
  files?: {
    id: string;
    path: string;
    language: string;
    extension?: string;
    sizeBytes?: number;
    lineCount?: number;
    roleHint?: string;
    nodeIds?: string[];
    evidence?: unknown[];
  }[];
  nodes?: {
    id: string;
    kind: string;
    name?: string;
    qualifiedName?: string;
    filePath?: string;
    language?: string;
    range?: unknown;
    signature?: string;
    visibility?: "public" | "private" | "protected" | "internal";
    docSummary?: string;
  }[];
  edges?: {
    id: string;
    kind: string;
    sourceId: string;
    targetId: string;
    confidence?: number;
    filePath?: string;
    range?: unknown;
    evidence?: unknown[];
  }[];
  statistics?: {
    fileCount?: number;
    nodeCount?: number;
    edgeCount?: number;
    filesByLanguage?: Record<string, number>;
    nodesByKind?: Record<string, number>;
    edgesByKind?: Record<string, number>;
  };
  warnings?: { id: string; severity: string; summary: string }[];
}

function minimalRuntimeFoundationGraph(root: string, description?: string): RuntimeGraph {
  return {
    id: "graph:foundation:fallback",
    title: `${basenameFromPath(root) || "Project"} Foundation Graph`,
    rootPath: root,
    metadata: {
      foundationFallback: true,
      source: "empty_foundation_fallback",
      readOnly: true
    },
    nodes: [
      {
        id: "project:foundation",
        kind: "project",
        title: basenameFromPath(root) || "Project",
        description,
        progress: 0,
        status: "active",
        confidence: "medium",
        knowledgeKind: "FACT",
        metadata: { foundationFallback: true, path: root }
      }
    ],
    edges: []
  };
}

function runtimeGraphFromProjectedViews(root: string, views: RuntimeProjectedGraphView[]): RuntimeGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalRuntimeFoundationGraph(root, "Synthesized from Foundation ProjectedGraphView cache because legacy .distinction/graph is absent.");
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
      const graphNodeId = runtimeProjectionNodeId(view.id, projectedNode.id);
      nodeIdByViewNode.set(`${view.id}\u0000${projectedNode.id}`, graphNodeId);
      if (seenNodes.has(graphNodeId)) continue;
      if (graph.nodes.length >= nodeLimit) {
        truncatedNodes += 1;
        continue;
      }
      seenNodes.add(graphNodeId);
      graph.nodes.push({
        id: graphNodeId,
        kind: runtimeNodeKindFromProjection(projectedNode.kind, projectedNode.anchor.kind),
        title: projectedNode.label || projectedNode.id,
        description: projectedNode.summary,
        progress: 0,
        status: runtimeStatusFromString(projectedNode.status),
        confidence: view.authority === "durable_model" ? "high" : "medium",
        knowledgeKind: view.authority === "durable_model" ? "CONFIRMED" : "INFERENCE",
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
      progress: 0,
      status: "active",
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
      const graphEdgeId = runtimeProjectionEdgeId(view.id, projectedEdge.id);
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
        kind: runtimeEdgeKindFromProjection(projectedEdge.kind),
        title: projectedEdge.kind,
        description: projectedEdge.summary,
        progress: 0,
        status: "active",
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

function runtimeGraphFromCodeFacts(root: string, snapshot: RuntimeCodeFactGraphSnapshot): RuntimeGraph {
  const nodeLimit = 420;
  const edgeLimit = 720;
  const graph = minimalRuntimeFoundationGraph(root, "Synthesized from CodeFactGraphSnapshot cache because legacy .distinction/graph is absent.");
  graph.metadata = {
    ...(graph.metadata ?? {}),
    source: "code_fact_graph_snapshot",
    provider: snapshot.provider,
    readOnly: true
  };

  const selectedNodes = (snapshot.nodes ?? []).filter((node) => node.kind !== "project").slice(0, nodeLimit - 1);
  const idMap = new Map<string, string>();
  for (const node of selectedNodes) {
    const graphNodeId = runtimeCodeFactNodeId(node.id);
    idMap.set(node.id, graphNodeId);
    graph.nodes.push({
      id: graphNodeId,
      kind: runtimeNodeKindFromProjection(node.kind, node.kind === "file" ? "file" : "symbol"),
      title: node.name || node.qualifiedName || node.id,
      description: node.qualifiedName,
      progress: 0,
      status: "active",
      confidence: "high",
      knowledgeKind: "FACT",
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
      progress: 0,
      status: "active",
      riskLevel: "none",
      confidence: "high",
      knowledgeKind: "FACT",
      metadata: { foundationFallback: true, synthetic: true }
    });
  }

  let truncatedEdges = 0;
  for (const edge of snapshot.edges ?? []) {
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
      id: runtimeCodeFactEdgeId(edge.id),
      source,
      target,
      kind: runtimeEdgeKindFromProjection(edge.kind),
      title: edge.kind,
      progress: 0,
      status: "active",
      riskLevel: "none",
      confidence: runtimeConfidenceFromNumber(edge.confidence ?? 0.5),
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
    truncatedNodes: Math.max(0, (snapshot.nodes?.length ?? 0) - selectedNodes.length - 1),
    truncatedEdges
  };
  return graph;
}

function runtimeProjectionNodeId(viewId: string, nodeId: string): string {
  return `projection:${viewId}:${nodeId}`;
}

function runtimeProjectionEdgeId(viewId: string, edgeId: string): string {
  return `projection:${viewId}:${edgeId}`;
}

function runtimeCodeFactNodeId(nodeId: string): string {
  return `code-fact:${nodeId}`;
}

function runtimeCodeFactEdgeId(edgeId: string): string {
  return `code-fact:${edgeId}`;
}

function runtimeNodeKindFromProjection(kind: string, anchorKind?: string): string {
  if (anchorKind === "finding" || kind.includes("finding") || kind.includes("risk")) return "risk";
  if (anchorKind === "task" || kind.includes("task")) return "task";
  if (anchorKind === "trace" || anchorKind === "memory" || kind.includes("trace") || kind.includes("memory")) return "memory_event";
  if (anchorKind === "architecture_module" || kind.includes("architecture") || kind.includes("module")) return "architecture_component";
  if (anchorKind === "file" || anchorKind === "symbol" || kind.includes("file") || kind.includes("function") || kind.includes("class")) return "code_unit";
  if (kind.includes("decision")) return "decision";
  if (kind.includes("document") || kind.includes("spec")) return "document";
  return "code_unit";
}

function runtimeEdgeKindFromProjection(kind: string): string {
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

function runtimeStatusFromString(value: string | undefined): string {
  if (value === "draft" || value === "active" || value === "wip" || value === "blocked" || value === "done" || value === "stale" || value === "deprecated") {
    return value;
  }
  return "active";
}

function runtimeConfidenceFromNumber(value: number): string {
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

function basenameFromPath(value: string): string {
  return value.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? value;
}

function chatTargetArgs(target: RuntimeChatTarget): string[] {
  if (target.type === "project") return ["--target-type", "project"];
  if (target.type === "node" || target.type === "edge") return ["--target-type", target.type, "--target-id", target.id];
  return ["--target-json", JSON.stringify(target)];
}

function graphAnchorToRuntimeArg(anchor: RuntimeGraphAnchor): string {
  return `${anchor.kind}:${anchor.id}`;
}

export function renderRuntimeRoutePreview(settings: ModelSettings): string {
  return [
    `default_provider: ${settings.defaultProvider}`,
    "",
    "providers:",
    "  deepseek:",
    "    type: openai-compatible",
    `    base_url: ${settings.baseUrl}`,
    "",
    "routes:",
    "  project.intake.analyze:",
    "    provider: deepseek",
    `    model: ${settings.intakeModel}`,
    "    reasoning: true",
    "    reasoning_effort: medium",
    "",
    "  graph.node.explain:",
    "    provider: deepseek",
    `    model: ${settings.nodeExplainModel}`,
    "    reasoning: false",
    "",
    "  graph.edge.explain:",
    "    provider: deepseek",
    `    model: ${settings.edgeExplainModel}`,
    "    reasoning: true",
    "    reasoning_effort: medium",
    "",
    "  graph.edge.plan:",
    "    provider: deepseek",
    `    model: ${settings.edgePlanModel}`,
    "    reasoning: true",
    "    reasoning_effort: high",
    "",
    "  coding.task.generate:",
    "    provider: deepseek",
    `    model: ${settings.codingTaskModel}`,
    "    reasoning: true",
    "    reasoning_effort: high",
    "",
    "pi_agent_engine:",
    `  provider: ${settings.piProvider}`,
    `  model: ${settings.piModel}`,
    `  thinking: ${settings.piThinking}`,
    `  codegraph: ${settings.piCodeGraph ? "enabled" : "disabled"}`,
    `  tools: ${settings.piTools}`,
    "  permissions:",
    `    read: ${settings.piAllowRead ? "enabled" : "disabled"}`,
    `    shell: ${settings.piAllowShell ? "enabled" : "disabled"}`,
    `    write: ${settings.piAllowWrite ? "enabled" : "disabled"}`,
    `  timeout_ms: ${settings.piTimeoutMs}`,
    `  review_thinking: ${settings.reviewPiThinking}`,
    `  review_timeout_ms: ${settings.reviewPiTimeoutMs}`,
    ""
  ].join("\n");
}

export async function readAppModelSettings(): Promise<Partial<ModelSettings> | null> {
  if (hasTauriRuntime()) {
    const content = await invoke<string>("read_app_model_settings");
    const settings = JSON.parse(stripJsonBom(content)) as Partial<ModelSettings>;
    if (Object.keys(settings).length) {
      const normalized = normalizeModelSettings(settings);
      if (!modelSettingsEqual(settings, normalized)) {
        await invoke<void>("write_app_model_settings", { settingsJson: JSON.stringify(normalized) });
      }
      return normalized;
    }
    const legacySettings = readLocalModelSettings();
    if (legacySettings) {
      const normalizedLegacySettings = normalizeModelSettings(legacySettings);
      await invoke<void>("write_app_model_settings", { settingsJson: JSON.stringify(normalizedLegacySettings) });
      window.localStorage.removeItem(modelSettingsStorageKey);
      return normalizedLegacySettings;
    }
    const normalizedDefaultSettings = normalizeModelSettings(settings);
    await invoke<void>("write_app_model_settings", { settingsJson: JSON.stringify(normalizedDefaultSettings) });
    return normalizedDefaultSettings;
  }
  const localSettings = readLocalModelSettings();
  return localSettings ? normalizeModelSettings(localSettings) : null;
}

export async function readAppModelSettingsPath(): Promise<string | null> {
  if (!hasTauriRuntime()) return null;
  return await invoke<string>("read_app_model_settings_path");
}

export async function saveAppModelSettings(settings: ModelSettings): Promise<void> {
  const content = JSON.stringify(settings);
  if (hasTauriRuntime()) {
    await invoke<void>("write_app_model_settings", { settingsJson: content });
    window.localStorage.removeItem(modelSettingsStorageKey);
    return;
  }
  window.localStorage.setItem(modelSettingsStorageKey, content);
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function readLocalModelSettings(): Partial<ModelSettings> | null {
  const content = window.localStorage.getItem(modelSettingsStorageKey);
  return content ? (JSON.parse(stripJsonBom(content)) as Partial<ModelSettings>) : null;
}

type StoredModelSettings = Partial<ModelSettings> & { apiKeyEnv?: string };

function normalizeModelSettings(saved: StoredModelSettings): ModelSettings {
  const { apiKeyEnv: legacyApiKeyEnv, ...savedSettings } = saved;
  const apiKey = saved.apiKey || (legacyApiKeyEnv && looksLikeApiKey(legacyApiKeyEnv) ? legacyApiKeyEnv : "");
  return {
    ...defaultModelSettings,
    ...savedSettings,
    apiKey
  };
}

function modelSettingsEqual(saved: Partial<ModelSettings>, normalized: ModelSettings): boolean {
  return JSON.stringify(saved) === JSON.stringify(normalized);
}

function looksLikeApiKey(value: string): boolean {
  return value.startsWith("sk-") || value.startsWith("sk_");
}

function stripJsonBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
