import { appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildContextPacket, parseGraphAnchor } from "@praxis/context-builder";
import { readProjectedGraphViewRecords } from "@praxis/projection-engine";
import {
  ArchitectureFindingReportSchema,
  CodingAgentTaskSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  ExternalAgentResultSchema,
  FindingStatusPatchSchema,
  MemoryRecordSchema,
  MemorySuggestionPatchSchema,
  PlanPatchSchema,
  PraxisMcpCodeFactsInputSchema,
  PraxisMcpCodeFactsResultSchema,
  PraxisMcpCodeRelationInputSchema,
  PraxisMcpCodeRelationResultSchema,
  PraxisMcpContextPacketInputSchema,
  PraxisMcpContextPacketResultSchema,
  PraxisMcpExplainAnchorInputSchema,
  PraxisMcpExplainAnchorResultSchema,
  PraxisMcpFindingAuditInputSchema,
  PraxisMcpFindingAuditResultSchema,
  PraxisMcpFindingsInputSchema,
  PraxisMcpFindingsResultSchema,
  PraxisMcpGenerateTaskInputSchema,
  PraxisMcpGenerateTaskResultSchema,
  PraxisMcpPlanFromFindingInputSchema,
  PraxisMcpPlanFromFindingResultSchema,
  PraxisMcpProjectionViewsInputSchema,
  PraxisMcpProjectionViewsResultSchema,
  PraxisMcpProjectProfileInputSchema,
  PraxisMcpProjectProfileResultSchema,
  PraxisMcpRecordExternalResultInputSchema,
  PraxisMcpRecordExternalResultResultSchema,
  PraxisMcpStatusInputSchema,
  PraxisMcpStatusResultSchema,
  TraceRecordSchema,
  type ArchitectureFinding,
  type ArchitectureFindingReport,
  type CodingAgentTask,
  type ExternalAgentResult,
  type CodeFactGraphSnapshot,
  type CodeFactNode,
  type FindingStatusPatch,
  type GraphAnchor,
  type MemoryRecord,
  type MemorySuggestionPatch,
  type PlanPatch,
  type PraxisMcpFindingAuditResult,
  type PraxisMcpToolName,
  type ProjectedGraphView,
  type TraceRecord
} from "@praxis/schema";

interface JsonSchema<T> {
  parse(value: unknown): T;
}

export interface McpToolContext {
  root: string;
}

export interface McpToolDefinition {
  name: PraxisMcpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (rawInput: unknown, context: McpToolContext) => Promise<unknown>;
}

export const MCP_TOOL_NAMES: PraxisMcpToolName[] = [
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
  "praxis_explain_anchor",
  "praxis_plan_from_finding",
  "praxis_generate_task",
  "praxis_record_external_result"
];

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "praxis_status",
    description: "Return Praxis project intelligence status for the scoped project.",
    inputSchema: objectSchema({ root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root.") }),
    call: callStatus
  },
  {
    name: "praxis_project_profile",
    description: "Read the cached Praxis project profile from .distinction/cache/project-profile.json.",
    inputSchema: objectSchema({ root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root.") }),
    call: callProjectProfile
  },
  {
    name: "praxis_code_facts",
    description: "Read normalized CodeFactGraph facts from .distinction/cache/code-fact-graph.json.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      path: stringSchema("Optional repository-relative path filter."),
      kind: enumSchema(["project", "file", "module", "class", "struct", "interface", "trait", "function", "method", "property", "field", "variable", "constant", "enum", "enum_member", "type_alias", "namespace", "import", "export", "route", "component"], "Optional code fact node kind filter."),
      name: stringSchema("Optional case-insensitive symbol or file name substring filter."),
      limit: numberSchema("Maximum number of files, nodes, and edges to return.")
    }),
    call: callCodeFacts
  },
  {
    name: "praxis_callers",
    description: "Return call edges whose target is the requested symbol.",
    inputSchema: codeRelationInputSchema("Symbol id whose callers should be returned."),
    call: (rawInput, context) => callCodeRelation("callers", rawInput, context)
  },
  {
    name: "praxis_callees",
    description: "Return call edges whose source is the requested symbol.",
    inputSchema: codeRelationInputSchema("Symbol id whose callees should be returned."),
    call: (rawInput, context) => callCodeRelation("callees", rawInput, context)
  },
  {
    name: "praxis_impact",
    description: "Return impact-like outgoing call/reference edges for the requested symbol when provider facts support them.",
    inputSchema: codeRelationInputSchema("Symbol id whose impact should be returned."),
    call: (rawInput, context) => callCodeRelation("impact", rawInput, context)
  },
  {
    name: "praxis_findings",
    description: "Read architecture findings from .distinction/cache/architecture-findings.json.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      category: enumSchema(["architecture"], "Optional finding category filter."),
      status: enumSchema(["open", "acknowledged", "planned", "in_progress", "mitigated", "resolved", "false_positive", "accepted_risk"], "Optional finding status filter."),
      severity: enumSchema(["info", "low", "medium", "high", "critical"], "Optional finding severity filter."),
      limit: numberSchema("Maximum number of findings to return.")
    }),
    call: callFindings
  },
  {
    name: "praxis_finding_audit",
    description: "Read governed finding status audit history from accepted patches, durable finding memory and trace records.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      findingId: stringSchema("Optional finding id filter."),
      state: stringSchema("Optional detector state filter, such as reopened or disappeared_after_reconciliation."),
      limit: numberSchema("Maximum number of finding audit entries to return.")
    }),
    call: callFindingAudit
  },
  {
    name: "praxis_projection_views",
    description: "Read schema-valid projected graph views under .distinction/views.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      kind: enumSchema(["architecture_dependency", "architecture_component", "code_fact", "finding", "context", "task_plan", "trace", "memory"], "Optional projected graph view kind filter."),
      anchor: graphAnchorJsonSchema(),
      limit: numberSchema("Maximum number of projected graph views to return.")
    }),
    call: callProjectionViews
  },
  {
    name: "praxis_context_packet",
    description: "Build a ContextPacket from a graph anchor using the shared Praxis context builder.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        anchor: {
          ...graphAnchorJsonSchema(),
          description: "Required graph anchor. A string anchor is also accepted at runtime for convenience."
        },
        purpose: enumSchema(["explain", "plan", "task", "review", "governance", "external_agent"], "Context packet purpose."),
        limit: {
          type: "object",
          description: "Optional context slice limits.",
          additionalProperties: false,
          properties: {
            codeFacts: { type: "number", minimum: 1, maximum: 500 },
            findings: { type: "number", minimum: 1, maximum: 500 },
            memory: { type: "number", minimum: 1, maximum: 500 },
            projectionNodes: { type: "number", minimum: 1, maximum: 500 }
          }
        }
      },
      ["anchor"]
    ),
    call: callContextPacket
  },
  {
    name: "praxis_explain_anchor",
    description: "Build a ContextPacket and return a deterministic explanation summary for the anchor.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        anchor: {
          ...graphAnchorJsonSchema(),
          description: "Required graph anchor. A string anchor is also accepted at runtime for convenience."
        }
      },
      ["anchor"]
    ),
    call: callExplainAnchor
  },
  {
    name: "praxis_plan_from_finding",
    description: "Create a governed PlanPatch from a finding. Does not modify source code or confirmed memory.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        findingId: stringSchema("Finding id to plan from."),
        strength: enumSchema(["conservative", "balanced", "aggressive"], "Governance remediation strength.")
      },
      ["findingId"]
    ),
    call: callPlanFromFinding
  },
  {
    name: "praxis_generate_task",
    description: "Generate a governed CodingAgentTask artifact for an anchor or finding. Does not execute an external agent.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      anchor: graphAnchorJsonSchema(),
      findingId: stringSchema("Optional finding id to task from."),
      adapter: enumSchema(["manual", "codex", "claude-code", "claude-code-best", "opencode"], "External adapter hint.")
    }),
    call: callGenerateTask
  },
  {
    name: "praxis_record_external_result",
    description: "Record an external agent result as trace/result artifacts. Does not confirm memory or edit source code.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        taskId: stringSchema("CodingAgentTask id."),
        status: enumSchema(["done", "partial", "failed"], "External agent result status."),
        summary: stringSchema("Result summary."),
        changedFiles: { type: "array", items: { type: "string" } },
        testResult: stringSchema("Optional test result summary."),
        evidencePaths: { type: "array", items: { type: "string" } }
      },
      ["taskId", "status", "summary"]
    ),
    call: callRecordExternalResult
  }
];

async function callStatus(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpStatusInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const distinctionPath = path.join(root, ".distinction");
  const cachePath = path.join(distinctionPath, "cache");
  const memoryPath = path.join(distinctionPath, "memory");
  const viewsPath = path.join(distinctionPath, "views");

  const [distinctionExists, codeFacts, findings, projectionManifestExists, contextPacketExists, codeFactViewExists, findingViewExists, projectedViews] =
    await Promise.all([
      exists(distinctionPath),
      tryReadJsonWithSchema(path.join(cachePath, "code-fact-graph.json"), CodeFactGraphSnapshotSchema),
      tryReadJsonWithSchema(path.join(cachePath, "architecture-findings.json"), ArchitectureFindingReportSchema),
      exists(path.join(cachePath, "projection-manifest.json")),
      exists(path.join(cachePath, "context-packet.json")),
      exists(path.join(viewsPath, "code", "code-fact-view.json")),
      exists(path.join(viewsPath, "findings", "finding-view.json")),
      readProjectedGraphViews(root)
    ]);

  const warnings: string[] = [];
  if (!distinctionExists) warnings.push(".distinction directory is missing; run intake before using project intelligence tools.");
  if (!codeFacts) warnings.push("Code fact cache is missing; run praxis-runtime intake or code-facts --write-cache.");
  if (!findings) warnings.push("Finding cache is missing; run praxis-runtime detect-findings.");

  return PraxisMcpStatusResultSchema.parse({
    schemaVersion: "praxis.mcp.statusResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    server: {
      name: "praxis-mcp-server",
      version: "0.1.0-alpha.0",
      readOnly: false,
      writePolicy: "governed_artifacts_only"
    },
    distinction: {
      exists: distinctionExists,
      path: distinctionPath,
      cachePath,
      memoryPath,
      viewsPath
    },
    cache: {
      codeFacts: Boolean(codeFacts),
      findings: Boolean(findings),
      projectionManifest: projectionManifestExists,
      contextPacket: contextPacketExists
    },
    views: {
      codeFacts: codeFactViewExists,
      findings: findingViewExists,
      projectedGraphViewCount: projectedViews.length
    },
    codeFacts: codeFacts
      ? {
          provider: codeFacts.provider,
          files: codeFacts.files.length,
          nodes: codeFacts.nodes.length,
          edges: codeFacts.edges.length,
          warnings: codeFacts.warnings
        }
      : undefined,
    findings: findings
      ? {
          count: findings.findings.length,
          open: findings.findings.filter((finding) => finding.status === "open").length
        }
      : undefined,
    tools: MCP_TOOL_NAMES,
    warnings
  });
}

async function callProjectProfile(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpProjectProfileInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const sourcePath = path.join(root, ".distinction", "cache", "project-profile.json");
  const profile = await readJsonWithSchema(sourcePath, { parse: (value) => value as Record<string, unknown> });
  return PraxisMcpProjectProfileResultSchema.parse({
    schemaVersion: "praxis.mcp.projectProfileResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    profile,
    sourceCachePath: ".distinction/cache/project-profile.json"
  });
}

async function callCodeFacts(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpCodeFactsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const cachePath = path.join(root, ".distinction", "cache", "code-fact-graph.json");
  const snapshot = await readJsonWithSchema(cachePath, CodeFactGraphSnapshotSchema);
  const limit = input.limit ?? 100;
  const nameFilter = input.name?.toLowerCase();
  const pathFilter = input.path?.replace(/\\/g, "/");

  let files = snapshot.files;
  let nodes = snapshot.nodes;
  let edges = snapshot.edges;

  if (pathFilter) {
    files = files.filter((file) => pathMatches(file.path, pathFilter));
    nodes = nodes.filter((node) => pathMatches(node.filePath, pathFilter));
    edges = edges.filter((edge) => (edge.filePath ? pathMatches(edge.filePath, pathFilter) : false));
  }
  if (input.kind) nodes = nodes.filter((node) => node.kind === input.kind);
  if (nameFilter) {
    nodes = nodes.filter((node) => node.name.toLowerCase().includes(nameFilter) || node.qualifiedName.toLowerCase().includes(nameFilter));
    files = files.filter((file) => file.path.toLowerCase().includes(nameFilter));
  }

  if (input.path || input.kind || input.name) {
    const selectedNodeIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => selectedNodeIds.has(edge.sourceId) || selectedNodeIds.has(edge.targetId));
    const selectedPaths = new Set([...nodes.map((node) => node.filePath), ...edges.map((edge) => edge.filePath).filter(Boolean) as string[]]);
    files = files.filter((file) => selectedPaths.has(file.path) || (pathFilter ? pathMatches(file.path, pathFilter) : false));
  }

  const truncated = files.length > limit || nodes.length > limit || edges.length > limit;
  return PraxisMcpCodeFactsResultSchema.parse({
    schemaVersion: "praxis.mcp.codeFactsResult.v1",
    root: snapshot.root,
    generatedAt: new Date().toISOString(),
    provider: snapshot.provider,
    files: files.slice(0, limit),
    nodes: nodes.slice(0, limit),
    edges: edges.slice(0, limit),
    truncated,
    sourceCachePath: ".distinction/cache/code-fact-graph.json",
    warnings: snapshot.warnings
  });
}

async function callCodeRelation(relation: "callers" | "callees" | "impact", rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpCodeRelationInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const snapshot = await readJsonWithSchema(path.join(root, ".distinction", "cache", "code-fact-graph.json"), CodeFactGraphSnapshotSchema);
  const limit = input.limit ?? 100;
  const depth = input.depth ?? 1;
  const relationKinds = relation === "impact" ? new Set(["calls", "references", "impacts"]) : new Set(["calls"]);
  const selectedEdges = traverseCodeRelation(snapshot, input.symbolId, relation, relationKinds, depth);
  const selectedNodeIds = new Set<string>([input.symbolId]);
  for (const edge of selectedEdges) {
    selectedNodeIds.add(edge.sourceId);
    selectedNodeIds.add(edge.targetId);
  }
  const nodes = snapshot.nodes.filter((node) => selectedNodeIds.has(node.id));
  const providerSupportsImpact = snapshot.provider.capabilities.includes("impact") || selectedEdges.some((edge) => edge.kind === "impacts");
  const supported = relation !== "impact" || providerSupportsImpact || selectedEdges.length > 0;
  const reason =
    relation === "impact" && !supported
      ? "Provider did not expose impact/reference/call facts for this symbol."
      : undefined;

  return PraxisMcpCodeRelationResultSchema.parse({
    schemaVersion: "praxis.mcp.codeRelationResult.v1",
    root: snapshot.root,
    generatedAt: new Date().toISOString(),
    relation,
    symbolId: input.symbolId,
    supported,
    reason,
    nodes: nodes.slice(0, limit),
    edges: selectedEdges.slice(0, limit),
    truncated: nodes.length > limit || selectedEdges.length > limit,
    sourceCachePath: ".distinction/cache/code-fact-graph.json"
  });
}

async function callFindings(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpFindingsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const report = await readJsonWithSchema(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema);
  const limit = input.limit ?? 100;
  let findings = report.findings;
  if (input.category) findings = findings.filter((finding) => finding.category === input.category);
  if (input.status) findings = findings.filter((finding) => finding.status === input.status);
  if (input.severity) findings = findings.filter((finding) => finding.severity === input.severity);

  return PraxisMcpFindingsResultSchema.parse({
    schemaVersion: "praxis.mcp.findingsResult.v1",
    root: report.root,
    generatedAt: new Date().toISOString(),
    findings: findings.slice(0, limit),
    truncated: findings.length > limit,
    sourceCachePath: ".distinction/cache/architecture-findings.json"
  });
}

async function callFindingAudit(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpFindingAuditInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const audit = await buildFindingAudit(root, input.findingId);
  let findings = audit.findings;
  if (input.state) findings = findings.filter((item) => item.detectorState === input.state);
  const limit = input.limit ?? 100;
  return PraxisMcpFindingAuditResultSchema.parse({
    ...audit,
    findings: findings.slice(0, limit),
    truncated: findings.length > limit
  } satisfies PraxisMcpFindingAuditResult);
}

async function callProjectionViews(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpProjectionViewsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const limit = input.limit ?? 20;
  let records = await readProjectedGraphViewRecords(root);
  if (input.kind) records = records.filter((record) => record.view.kind === input.kind);
  const anchor = input.anchor;
  if (anchor) records = records.filter((record) => projectedViewMatchesAnchor(record.view, anchor));

  const selected = records.slice(0, limit);
  return PraxisMcpProjectionViewsResultSchema.parse({
    schemaVersion: "praxis.mcp.projectionViewsResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    views: selected.map((record) => record.view),
    truncated: records.length > limit,
    sourceViewPaths: selected.map((record) => record.path)
  });
}

async function callContextPacket(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const normalizedInput = normalizeContextPacketInput(rawInput);
  const input = PraxisMcpContextPacketInputSchema.parse(normalizedInput);
  const root = resolveToolRoot(context, input.root);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor: input.anchor,
      purpose: input.purpose ?? "explain",
      createdBy: "mcp",
      limit: input.limit
    })
  );
  return PraxisMcpContextPacketResultSchema.parse(packet);
}

async function callExplainAnchor(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpExplainAnchorInputSchema.parse(normalizeAnchorInput(rawInput));
  const root = resolveToolRoot(context, input.root);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor: input.anchor,
      purpose: "explain",
      createdBy: "mcp"
    })
  );
  const summary = [
    `Anchor ${packet.anchor.kind}:${packet.anchor.id}`,
    `${packet.codeFacts.nodes.length} code fact node(s)`,
    `${packet.findings.length} finding(s)`,
    `${packet.projections.views.length} projection view(s)`,
    `${packet.memory.facts.length} FACT memory record(s)`
  ].join("; ");
  return PraxisMcpExplainAnchorResultSchema.parse({
    schemaVersion: "praxis.mcp.explainAnchorResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    anchor: input.anchor,
    summary,
    contextPacket: packet
  });
}

async function callPlanFromFinding(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpPlanFromFindingInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const report = await readJsonWithSchema(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema);
  const finding = requiredFinding(report, input.findingId);
  const strength = input.strength ?? "conservative";
  const planPatch = PlanPatchSchema.parse({
    schemaVersion: "praxis.planPatch.v1",
    id: `plan-patch:${sanitizeId(finding.id)}:${Date.now()}`,
    sourceFindingId: finding.id,
    title: `Plan remediation for ${finding.title}`,
    summary: finding.summary,
    strength,
    steps: [
      "Explain the finding and evidence before proposing edits.",
      ...finding.suggestedPlanActions,
      "Generate a controlled coding task instead of editing source directly.",
      "Record external result and rerun detector before closing the finding."
    ],
    createdAt: new Date().toISOString()
  } satisfies PlanPatch);
  const relativePath = `.distinction/cache/plan-patches/${sanitizeId(planPatch.id)}.json`;
  await writeSchemaJson(path.join(root, relativePath), planPatch, PlanPatchSchema);
  return PraxisMcpPlanFromFindingResultSchema.parse({
    schemaVersion: "praxis.mcp.planFromFindingResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    planPatch,
    path: relativePath
  });
}

async function callGenerateTask(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpGenerateTaskInputSchema.parse(normalizeAnchorInput(rawInput ?? {}));
  const root = resolveToolRoot(context, input.root);
  const finding = input.findingId ? requiredFinding(await readArchitectureFindingReport(root), input.findingId) : undefined;
  const anchor = input.anchor ?? (finding ? { kind: "finding" as const, id: finding.id } : undefined);
  if (!anchor) throw new Error("praxis_generate_task requires either anchor or findingId.");
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor,
      purpose: "task",
      createdBy: "mcp"
    })
  );
  const sourceFindingIds = finding ? [finding.id] : packet.findings.map((item) => item.id);
  const task = CodingAgentTaskSchema.parse({
    schemaVersion: "praxis.codingAgentTask.v1",
    id: `TASK-${Date.now()}`,
    sourceFindingIds,
    sourceContextPacketId: packet.id,
    goal: finding ? `Address finding: ${finding.title}` : `Work on anchor ${anchor.kind}:${anchor.id}`,
    nonGoals: ["Do not bypass Praxis memory/model confirmation boundaries.", "Do not modify files outside allowed paths."],
    allowedPaths: packet.scope.includedPaths.length ? packet.scope.includedPaths : ["."],
    forbiddenPaths: [".distinction/cache", ".distinction/views"],
    acceptanceCriteria: finding?.suggestedPlanActions.length ? finding.suggestedPlanActions : ["Explain the proposed change and provide verification evidence."],
    expectedOutputs: ["patch summary", "changed files", "test result", "risk notes"],
    riskNotes: packet.warnings.length ? packet.warnings : ["External agent must return results to Praxis instead of directly confirming memory."],
    createdAt: new Date().toISOString()
  } satisfies CodingAgentTask);
  const taskJsonPath = `.distinction/tasks/${task.id}.json`;
  const taskMarkdownPath = `.distinction/tasks/${task.id}.md`;
  await writeSchemaJson(path.join(root, taskJsonPath), task, CodingAgentTaskSchema);
  await writeFile(path.join(root, taskMarkdownPath), renderCodingAgentTaskMarkdown(task), "utf8");
  return PraxisMcpGenerateTaskResultSchema.parse({
    schemaVersion: "praxis.mcp.generateTaskResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    task,
    taskJsonPath,
    taskMarkdownPath
  });
}

async function callRecordExternalResult(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpRecordExternalResultInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const createdAt = new Date().toISOString();
  const stamp = Date.now();
  const resultId = `external-result:${sanitizeId(input.taskId)}:${stamp}`;
  const task = await tryReadJsonWithSchema(path.join(root, ".distinction", "tasks", `${input.taskId}.json`), CodingAgentTaskSchema);
  const evidence = (input.evidencePaths ?? []).map((filePath) => ({
    source: "agent_inference" as const,
    filePath
  }));
  const findingStatusSuggestions = (task?.sourceFindingIds ?? []).map((findingId) =>
    FindingStatusPatchSchema.parse({
      schemaVersion: "praxis.findingStatusPatch.v1",
      id: `finding-status-patch:${sanitizeId(input.taskId)}:${sanitizeId(findingId)}:${stamp}`,
      sourceResultId: resultId,
      sourceTaskId: input.taskId,
      findingId,
      status: input.status === "done" ? "mitigated" : input.status === "partial" ? "in_progress" : "acknowledged",
      summary: `External agent result for ${input.taskId}: ${input.summary}`,
      rationale: input.testResult,
      evidence,
      createdAt
    } satisfies FindingStatusPatch)
  );
  const memorySuggestions = [
    MemorySuggestionPatchSchema.parse({
      schemaVersion: "praxis.memorySuggestionPatch.v1",
      id: `memory-suggestion:${sanitizeId(input.taskId)}:${stamp}`,
      sourceResultId: resultId,
      sourceTaskId: input.taskId,
      summary: `Record external result for ${input.taskId} as candidate memory.`,
      memoryPatches: [
        {
          id: `memory-patch:external-result:${sanitizeId(input.taskId)}:${stamp}`,
          operation: "append",
          status: "proposed",
          record: {
            id: `memory:external-result:${sanitizeId(input.taskId)}:${stamp}`,
            kind: "CANDIDATE",
            type: "external_agent_result",
            subject: input.taskId,
            predicate: "reported_result",
            object: input.summary,
            summary: `External agent reported ${input.status} for ${input.taskId}.`,
            evidence,
            source: "agent",
            confidence: input.status === "done" ? "high" : "medium",
            status: "proposed",
            createdAt,
            updatedAt: createdAt
          },
          sourceCodeFactIds: []
        }
      ],
      createdAt
    } satisfies MemorySuggestionPatch)
  ];
  const result = ExternalAgentResultSchema.parse({
    schemaVersion: "praxis.externalAgentResult.v1",
    id: resultId,
    taskId: input.taskId,
    status: input.status,
    summary: input.summary,
    changedFiles: input.changedFiles ?? [],
    testResult: input.testResult,
    evidence,
    memorySuggestions,
    findingStatusSuggestions,
    createdAt
  } satisfies ExternalAgentResult);
  const resultPath = `.distinction/reports/external-results/${sanitizeId(input.taskId)}-${stamp}.json`;
  const tracePath = ".distinction/memory/traces.jsonl";
  const traceRecord = TraceRecordSchema.parse({
    schemaVersion: "praxis.traceRecord.v1",
    id: `trace-event:external-result:${stamp}`,
    traceId: `trace:task:${input.taskId}`,
    timestamp: createdAt,
    kind: "external_agent.result_recorded",
    target: { type: "task", id: input.taskId },
    summary: input.summary,
    data: { resultPath, resultId, status: input.status, changedFiles: input.changedFiles ?? [] }
  } satisfies TraceRecord);
  await writeSchemaJson(path.join(root, resultPath), result, ExternalAgentResultSchema);
  await mkdir(path.dirname(path.join(root, tracePath)), { recursive: true });
  await appendFile(path.join(root, tracePath), `${JSON.stringify(traceRecord)}\n`, "utf8");
  return PraxisMcpRecordExternalResultResultSchema.parse({
    schemaVersion: "praxis.mcp.recordExternalResultResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    result,
    resultPath,
    tracePath
  });
}

function normalizeContextPacketInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "object" || rawInput === null || !("anchor" in rawInput)) return rawInput;
  const input = rawInput as { anchor?: unknown };
  if (typeof input.anchor !== "string") return rawInput;
  return { ...(rawInput as Record<string, unknown>), anchor: parseGraphAnchor(input.anchor) };
}

function normalizeAnchorInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "object" || rawInput === null || !("anchor" in rawInput)) return rawInput;
  const input = rawInput as { anchor?: unknown };
  if (typeof input.anchor !== "string") return rawInput;
  return { ...(rawInput as Record<string, unknown>), anchor: parseGraphAnchor(input.anchor) };
}

function resolveToolRoot(context: McpToolContext, requestedRoot?: string): string {
  if (!requestedRoot) return context.root;
  const resolved = path.isAbsolute(requestedRoot) ? path.resolve(requestedRoot) : path.resolve(context.root, requestedRoot);
  if (normalizeForCompare(resolved) !== normalizeForCompare(context.root)) {
    throw new Error(`MCP server is scoped to ${context.root}; refusing root ${resolved}`);
  }
  return context.root;
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function pathMatches(filePath: string, filter: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const normalizedFilter = filter.toLowerCase();
  return normalizedPath === normalizedFilter || normalizedPath.startsWith(`${normalizedFilter}/`) || normalizedPath.includes(normalizedFilter);
}

async function readProjectedGraphViews(root: string): Promise<ProjectedGraphView[]> {
  return (await readProjectedGraphViewRecords(root)).map((record) => record.view);
}

function projectedViewMatchesAnchor(view: ProjectedGraphView, anchor: GraphAnchor): boolean {
  return (
    view.nodes.some((node) => graphAnchorMatches(node.anchor, anchor)) ||
    view.edges.some((edge) => graphAnchorMatches(edge.anchor, anchor)) ||
    view.annotations.some((annotation) => annotation.anchor && graphAnchorMatches(annotation.anchor, anchor))
  );
}

function graphAnchorMatches(left: GraphAnchor, right: GraphAnchor): boolean {
  return left.kind === right.kind && left.id === right.id && (!right.path || left.path === right.path);
}

function traverseCodeRelation(
  snapshot: CodeFactGraphSnapshot,
  symbolId: string,
  relation: "callers" | "callees" | "impact",
  relationKinds: Set<string>,
  depth: number
) {
  const selected = new Map<string, CodeFactGraphSnapshot["edges"][number]>();
  const frontier = new Set([symbolId]);
  const visited = new Set<string>();
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      for (const edge of snapshot.edges) {
        if (!relationKinds.has(edge.kind)) continue;
        const matches =
          relation === "callers"
            ? edge.targetId === nodeId
            : relation === "callees"
              ? edge.sourceId === nodeId
              : edge.sourceId === nodeId || edge.kind === "impacts";
        if (!matches) continue;
        selected.set(edge.id, edge);
        next.add(relation === "callers" ? edge.sourceId : edge.targetId);
      }
    }
    frontier.clear();
    for (const item of next) frontier.add(item);
  }
  return Array.from(selected.values());
}

async function readArchitectureFindingReport(root: string): Promise<ArchitectureFindingReport> {
  return await readJsonWithSchema(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema);
}

async function readAcceptedReviewArtifactIds(root: string): Promise<{
  findingStatusPatches: Map<string, string>;
}> {
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
      if (kind === "finding.status_accepted" && typeof data.patchId === "string") {
        findingStatusPatches.set(data.patchId, timestamp);
      }
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { findingStatusPatches };
}

async function buildFindingAudit(root: string, filterFindingId?: string): Promise<Omit<PraxisMcpFindingAuditResult, "truncated">> {
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
      const latestAcceptedStatus = typeof latestMemory?.object === "string" ? latestMemory.object : latestPatch?.status;
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
    schemaVersion: "praxis.mcp.findingAuditResult.v1",
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

async function readMemoryRecordJsonl(filePath: string): Promise<MemoryRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const records: MemoryRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      records.push(MemoryRecordSchema.parse(JSON.parse(trimmed)));
    }
    return records;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
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
        // Legacy trace lines are ignored by this governed read-only audit view.
      }
    }
    return records;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

function requiredFinding(report: ArchitectureFindingReport, findingId: string): ArchitectureFinding {
  const finding = report.findings.find((item) => item.id === findingId);
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  return finding;
}

async function writeSchemaJson<T>(filePath: string, value: T, schema: JsonSchema<T>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(schema.parse(value), null, 2)}\n`, "utf8");
}

function renderCodingAgentTaskMarkdown(task: CodingAgentTask): string {
  return [
    `# ${task.id}`,
    "",
    "## Goal",
    "",
    task.goal,
    "",
    "## Source Findings",
    "",
    ...list(task.sourceFindingIds),
    "",
    "## Non-goals",
    "",
    ...list(task.nonGoals),
    "",
    "## Allowed Paths",
    "",
    ...list(task.allowedPaths),
    "",
    "## Forbidden Paths",
    "",
    ...list(task.forbiddenPaths),
    "",
    "## Acceptance Criteria",
    "",
    ...list(task.acceptanceCriteria),
    "",
    "## Expected Outputs",
    "",
    ...list(task.expectedOutputs),
    "",
    "## Risk Notes",
    "",
    ...list(task.riskNotes),
    ""
  ].join("\n");
}

function list(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- None"];
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "artifact";
}

async function readJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

async function tryReadJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T | undefined> {
  try {
    return await readJsonWithSchema(filePath, schema);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function projectRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return filePath.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
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
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolute)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(absolute);
    }
  }
  return files;
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

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {})
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

function numberSchema(description: string): Record<string, unknown> {
  return { type: "number", minimum: 1, maximum: 500, description };
}

function enumSchema(values: string[], description: string): Record<string, unknown> {
  return { type: "string", enum: values, description };
}

function codeRelationInputSchema(symbolDescription: string): Record<string, unknown> {
  return objectSchema(
    {
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      symbolId: stringSchema(symbolDescription),
      depth: { type: "number", minimum: 1, maximum: 5 },
      limit: numberSchema("Maximum number of relation nodes and edges to return.")
    },
    ["symbolId"]
  );
}

function graphAnchorJsonSchema(): Record<string, unknown> {
  return objectSchema(
    {
      kind: enumSchema(
        [
          "file",
          "symbol",
          "code_fact_node",
          "code_fact_edge",
          "architecture_module",
          "architecture_dependency",
          "finding",
          "task",
          "trace",
          "memory",
          "projection_node",
          "projection_edge"
        ],
        "Graph anchor kind."
      ),
      id: stringSchema("Stable graph anchor id."),
      path: stringSchema("Optional repository-relative path.")
    },
    ["kind", "id"]
  );
}
