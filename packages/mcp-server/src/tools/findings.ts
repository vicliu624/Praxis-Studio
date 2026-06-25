import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ArchitectureFindingReportSchema,
  FindingStatusPatchSchema,
  MemoryRecordSchema,
  PraxisMcpFindingAuditInputSchema,
  PraxisMcpFindingAuditResultSchema,
  PraxisMcpFindingsInputSchema,
  PraxisMcpFindingsResultSchema,
  TraceRecordSchema,
  type ArchitectureFinding,
  type ArchitectureFindingReport,
  type FindingStatusPatch,
  type MemoryRecord,
  type PraxisMcpFindingAuditResult,
  type TraceRecord
} from "@praxis/schema";
import { enumSchema, numberSchema, objectSchema, stringSchema } from "./schema-helpers.js";
import {
  isMissingFileError,
  isRecord,
  listJsonFiles,
  projectRelativePath,
  readJsonWithSchema,
  resolveToolRoot,
  safeJson,
  tryReadJsonWithSchema
} from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const findingTools: McpToolDefinition[] = [
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
  }
];

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

export async function readArchitectureFindingReport(root: string): Promise<ArchitectureFindingReport> {
  return await readJsonWithSchema(path.join(root, ".distinction", "cache", "architecture-findings.json"), ArchitectureFindingReportSchema);
}

export function requiredFinding(report: ArchitectureFindingReport, findingId: string): ArchitectureFinding {
  const finding = report.findings.find((item) => item.id === findingId);
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  return finding;
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
