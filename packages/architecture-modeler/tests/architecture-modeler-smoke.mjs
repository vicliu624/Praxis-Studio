import assert from "node:assert/strict";
import { buildArchitectureModelPatch } from "../dist/index.js";

const records = [
  fact("mem:core-file", "code.file.exists", "packages/core/src/index.ts", "exists", "file"),
  fact("mem:cli-file", "code.file.exists", "apps/runtime-cli/src/index.ts", "exists", "file"),
  fact("mem:cli-import-core", "code.import.exists", "apps/runtime-cli/src/index.ts", "imports", "@praxis/core")
];

const patch = buildArchitectureModelPatch("/repo", records);

assert.equal(patch.schemaVersion, "praxis.architectureModelPatch.v1");
assert.ok(patch.modules.some((module) => module.path === "packages/core"));
assert.ok(patch.modules.some((module) => module.path === "apps/runtime-cli"));
assert.ok(
  patch.dependencies.some((dependency) => {
    const source = patch.modules.find((module) => module.id === dependency.sourceModuleId);
    const target = patch.modules.find((module) => module.id === dependency.targetModuleId);
    return source?.path === "apps/runtime-cli" && target?.path === "packages/core";
  })
);
assert.ok(patch.dependencies.every((dependency) => dependency.sourceMemoryIds.length > 0));
assert.ok(patch.dependencies.every((dependency) => dependency.evidence.length > 0));

console.log(JSON.stringify({ ok: true, modules: patch.modules.length, dependencies: patch.dependencies.length }));

function fact(id, type, subject, predicate, object) {
  return {
    id,
    kind: "FACT",
    type,
    subject,
    predicate,
    object,
    summary: `${subject} ${predicate} ${object}`,
    evidence: [{ source: "repository_scan", filePath: subject }],
    source: "code_fact_graph",
    confidence: "high",
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z"
  };
}
