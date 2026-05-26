import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArchitectureDependencyViewSchema,
  ArchitectureFindingReportSchema,
  ArchitectureModelPatchSchema,
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  PraxisMcpCodeFactsResultSchema,
  PraxisMcpFindingsResultSchema,
  PraxisMcpProjectionViewsResultSchema,
  PraxisMcpStatusResultSchema,
  ProjectionManifestSchema,
  ProjectedGraphViewSchema,
  RepositoryUnderstandingPatchSchema
} from "../dist/index.js";

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
    name: "RepositoryUnderstandingPatch",
    path: "fixtures/repository-understanding-patch/minimal.json",
    schema: RepositoryUnderstandingPatchSchema
  },
  {
    name: "ArchitectureFindingReport",
    path: "fixtures/architecture-finding-report/minimal.json",
    schema: ArchitectureFindingReportSchema
  },
  {
    name: "ArchitectureDependencyView",
    path: "fixtures/architecture-dependency-view/minimal.json",
    schema: ArchitectureDependencyViewSchema
  },
  {
    name: "ProjectionManifest",
    path: "fixtures/projection-manifest/minimal.json",
    schema: ProjectionManifestSchema
  },
  {
    name: "ProjectedGraphView",
    path: "fixtures/projected-graph-view/minimal.json",
    schema: ProjectedGraphViewSchema
  },
  {
    name: "ContextPacket",
    path: "fixtures/context-packet/minimal.json",
    schema: ContextPacketSchema
  },
  {
    name: "PraxisMcpStatusResult",
    path: "fixtures/mcp-status-result/minimal.json",
    schema: PraxisMcpStatusResultSchema
  },
  {
    name: "PraxisMcpCodeFactsResult",
    path: "fixtures/mcp-code-facts-result/minimal.json",
    schema: PraxisMcpCodeFactsResultSchema
  },
  {
    name: "PraxisMcpFindingsResult",
    path: "fixtures/mcp-findings-result/minimal.json",
    schema: PraxisMcpFindingsResultSchema
  },
  {
    name: "PraxisMcpProjectionViewsResult",
    path: "fixtures/mcp-projection-views-result/minimal.json",
    schema: PraxisMcpProjectionViewsResultSchema
  }
];

for (const fixture of fixtures) {
  const raw = JSON.parse(await readFile(path.join(packageRoot, fixture.path), "utf8"));
  const parsed = fixture.schema.parse(raw);
  const roundTripped = fixture.schema.parse(JSON.parse(JSON.stringify(parsed)));
  assert.deepEqual(roundTripped, parsed, `${fixture.name} must round-trip`);
}

console.log(JSON.stringify({ ok: true, fixtures: fixtures.map((fixture) => fixture.name) }));
