import assert from "node:assert/strict";
import { buildNativeCodeFactGraphSnapshot } from "@praxis/code-fact-graph";
import { acceptedFactRecordsFromPatch, buildRepositoryUnderstandingPatch } from "../dist/index.js";

const codeFacts = buildNativeCodeFactGraphSnapshot(
  {
    root: "/tmp/praxis-smoke",
    name: "praxis-smoke",
    scannedAt: "2026-05-22T00:00:00.000Z",
    files: [
      {
        path: "packages/core/src/index.ts",
        extension: ".ts",
        language: "TypeScript",
        sizeBytes: 42,
        lineCount: 3,
        roleHint: "domain",
        importedPaths: ["@praxis/other"],
        isIgnored: false
      }
    ],
    directories: [],
    manifests: [],
    docs: [],
    git: { present: false },
    statistics: {
      fileCount: 1,
      directoryCount: 0,
      totalBytes: 42,
      languages: { TypeScript: 1 }
    }
  },
  { name: "native-heuristic", source: "native", version: "smoke", capabilities: ["file_structure", "imports_exports"] }
);

const patch = buildRepositoryUnderstandingPatch(codeFacts);

assert.equal(patch.schemaVersion, "praxis.repositoryUnderstandingPatch.v1");
assert.equal(patch.modelPatches.length, 0);
assert.equal(patch.findingPatches.length, 0);
assert.ok(patch.memoryPatches.some((item) => item.record.type === "code.file.exists"));
assert.ok(patch.memoryPatches.some((item) => item.record.type === "code.import.exists"));
assert.ok(patch.memoryPatches.every((item) => item.status === "proposed"));
assert.ok(patch.memoryPatches.every((item) => item.record.kind === "FACT"));
assert.ok(patch.memoryPatches.every((item) => item.record.status === "proposed"));

const accepted = acceptedFactRecordsFromPatch(patch);
assert.equal(accepted.length, patch.memoryPatches.length);
assert.ok(accepted.every((record) => record.kind === "FACT"));
assert.ok(accepted.every((record) => record.source === "code_fact_graph"));
assert.ok(accepted.every((record) => record.status === "active"));

console.log(
  JSON.stringify({
    ok: true,
    memoryPatches: patch.memoryPatches.length,
    acceptedFacts: accepted.length
  })
);
