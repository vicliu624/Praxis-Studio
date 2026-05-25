import { slugify } from "@praxis/core";
import type { CodeFactEdge, CodeFactEvidenceRef, CodeFactGraphSnapshot, CodeFactNode } from "@praxis/code-fact-graph";
import type { Confidence, MemoryPatch, MemoryRecord, RepositoryUnderstandingPatch, ReviewQuestion, UnderstandingWarning } from "@praxis/schema";

export type { MemoryPatch, MemoryPatchStatus, MemoryRecord, RepositoryUnderstandingPatch, ReviewQuestion, UnderstandingWarning } from "@praxis/schema";

export function buildRepositoryUnderstandingPatch(snapshot: CodeFactGraphSnapshot): RepositoryUnderstandingPatch {
  const generatedAt = new Date().toISOString();
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const memoryPatches: MemoryPatch[] = [];

  for (const file of snapshot.files) {
    memoryPatches.push(fileMemoryPatch(file.path, file.evidence, generatedAt));
  }

  for (const edge of snapshot.edges.filter((item) => item.kind === "imports")) {
    const source = nodesById.get(edge.sourceId);
    const target = nodesById.get(edge.targetId);
    if (!source || !target) continue;
    memoryPatches.push(importMemoryPatch(edge, source, target, generatedAt));
  }

  return {
    schemaVersion: "praxis.repositoryUnderstandingPatch.v1",
    root: snapshot.root,
    generatedAt,
    sourceSnapshot: {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      provider: snapshot.provider,
      statistics: snapshot.statistics
    },
    memoryPatches: dedupeMemoryPatches(memoryPatches),
    modelPatches: [],
    findingPatches: [],
    reviewQuestions: buildReviewQuestions(snapshot),
    warnings: buildWarnings(snapshot),
    confidence: snapshot.statistics.fileCount > 0 ? "high" : "low"
  };
}

export function acceptedFactRecordsFromPatch(patch: RepositoryUnderstandingPatch): MemoryRecord[] {
  return proposedFactRecordsFromPatchForPreview(patch).map((record) => ({
    ...record,
    status: "active" as const,
    updatedAt: new Date().toISOString()
  }));
}

export function proposedFactRecordsFromPatchForPreview(patch: RepositoryUnderstandingPatch): MemoryRecord[] {
  return patch.memoryPatches
    .map((item) => item.record)
    .filter((record) => record.kind === "FACT")
    .map((record) => ({
      ...record,
      status: "proposed" as const
    }));
}

function fileMemoryPatch(filePath: string, evidence: CodeFactEvidenceRef[], now: string): MemoryPatch {
  const record: MemoryRecord = {
    id: memoryId("code.file.exists", filePath, "exists", "file"),
    kind: "FACT",
    type: "code.file.exists",
    subject: filePath,
    predicate: "exists",
    object: "file",
    summary: `File exists in repository: ${filePath}.`,
    evidence,
    source: "code_fact_graph",
    confidence: "high",
    status: "proposed",
    createdAt: now,
    updatedAt: now
  };
  return {
    id: `patch:${record.id}`,
    operation: "append",
    status: "proposed",
    record,
    sourceCodeFactIds: [`code:file:${slugify(filePath)}`]
  };
}

function importMemoryPatch(edge: CodeFactEdge, source: CodeFactNode, target: CodeFactNode, now: string): MemoryPatch {
  const record: MemoryRecord = {
    id: memoryId("code.import.exists", source.qualifiedName, "imports", target.qualifiedName),
    kind: "FACT",
    type: "code.import.exists",
    subject: source.qualifiedName,
    predicate: "imports",
    object: target.qualifiedName,
    summary: `${source.qualifiedName} imports ${target.qualifiedName}.`,
    evidence: edge.evidence.length ? edge.evidence : [...source.evidence, ...target.evidence],
    source: "code_fact_graph",
    confidence: confidenceFromEdge(edge.confidence),
    status: "proposed",
    createdAt: now,
    updatedAt: now
  };
  return {
    id: `patch:${record.id}`,
    operation: "append",
    status: "proposed",
    record,
    sourceCodeFactIds: [edge.id, source.id, target.id]
  };
}

function buildReviewQuestions(snapshot: CodeFactGraphSnapshot): ReviewQuestion[] {
  const questions: ReviewQuestion[] = [];
  if (snapshot.provider.source === "native") {
    questions.push({
      id: "question:code-fact-provider-depth",
      question: "Should Praxis use a stronger provider before deriving symbol-level or call-level understanding?"
    });
  }
  return questions;
}

function buildWarnings(snapshot: CodeFactGraphSnapshot): UnderstandingWarning[] {
  return snapshot.warnings.map((warning) => ({
    id: warning.id.replace("code-fact-warning", "understanding-warning"),
    severity: warning.severity,
    summary: warning.summary
  }));
}

function dedupeMemoryPatches(patches: MemoryPatch[]): MemoryPatch[] {
  const seen = new Set<string>();
  const result: MemoryPatch[] = [];
  for (const patch of patches) {
    if (seen.has(patch.record.id)) continue;
    seen.add(patch.record.id);
    result.push(patch);
  }
  return result;
}

function confidenceFromEdge(value: number): Confidence {
  if (value >= 0.9) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

function memoryId(type: string, subject: string, predicate: string, object: string): string {
  return `mem:fact:${slugify(`${type}:${subject}:${predicate}:${object}`)}`;
}
