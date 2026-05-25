import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ArchitectureModelPatchSchema, CodeFactGraphSnapshotSchema, ProjectionManifestSchema } from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtures = [
  {
    name: "CodeFactGraphSnapshot",
    path: "fixtures/code-fact/minimal.json",
    schema: CodeFactGraphSnapshotSchema
  },
  {
    name: "ArchitectureModelPatch",
    path: "fixtures/architecture-model-patch/minimal.json",
    schema: ArchitectureModelPatchSchema
  },
  {
    name: "ProjectionManifest",
    path: "fixtures/projection-manifest/minimal.json",
    schema: ProjectionManifestSchema
  }
];

for (const fixture of fixtures) {
  const raw = JSON.parse(await readFile(path.join(packageRoot, fixture.path), "utf8"));
  const parsed = fixture.schema.parse(raw);
  const roundTripped = fixture.schema.parse(JSON.parse(JSON.stringify(parsed)));
  assert.deepEqual(roundTripped, parsed, `${fixture.name} must round-trip`);
}

console.log(JSON.stringify({ ok: true, fixtures: fixtures.map((fixture) => fixture.name) }));
