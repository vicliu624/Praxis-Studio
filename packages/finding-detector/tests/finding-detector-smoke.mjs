import assert from "node:assert/strict";
import { detectArchitectureFindings } from "../dist/index.js";

const model = {
  schemaVersion: "praxis.architectureModelPatch.v1",
  root: "/repo",
  generatedAt: "2026-05-22T00:00:00.000Z",
  modules: [
    module("arch-module:packages-a", "packages/a"),
    module("arch-module:packages-b", "packages/b")
  ],
  dependencies: [
    dependency("dep:a-b", "arch-module:packages-a", "arch-module:packages-b", ["mem:a-b"], [{ source: "repository_scan", filePath: "packages/a/src/index.ts" }]),
    dependency("dep:b-a", "arch-module:packages-b", "arch-module:packages-a", ["mem:b-a"], [{ source: "repository_scan", filePath: "packages/b/src/index.ts" }]),
    dependency("dep:missing", "arch-module:packages-a", "arch-module:packages-b", [], [])
  ],
  warnings: [],
  confidence: "medium"
};

const report = detectArchitectureFindings(model);

assert.equal(report.schemaVersion, "praxis.architectureFindingReport.v1");
assert.ok(report.findings.some((finding) => finding.antiPatternId === "package_dependency_cycle"));
assert.ok(report.findings.some((finding) => finding.antiPatternId === "architecture_dependency_without_evidence"));
assert.ok(report.findings.every((finding) => finding.status === "open"));
assert.ok(report.findings.every((finding) => finding.knowledgeKind === "INFERENCE"));

console.log(JSON.stringify({ ok: true, findings: report.findings.length }));

function module(id, path) {
  return {
    id,
    name: path,
    path,
    role: "unknown",
    responsibilities: [],
    sourceMemoryIds: [],
    evidence: [],
    confidence: "medium",
    knowledgeKind: "INFERENCE"
  };
}

function dependency(id, sourceModuleId, targetModuleId, sourceMemoryIds, evidence) {
  return {
    id,
    sourceModuleId,
    targetModuleId,
    kind: "depends_on",
    sourceMemoryIds,
    evidence,
    confidence: "medium",
    knowledgeKind: "INFERENCE"
  };
}
