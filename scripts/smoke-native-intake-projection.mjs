import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-native-projection-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "packages", "core", "src"), { recursive: true });
await mkdir(path.join(root, "apps", "runtime-cli", "src"), { recursive: true });

await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({ name: "praxis-smoke-project", type: "module", workspaces: ["apps/*", "packages/*"] }, null, 2)}\n`,
  "utf8"
);
await writeFile(path.join(root, "packages", "core", "src", "index.ts"), "export const coreValue = 1;\n", "utf8");
await writeFile(
  path.join(root, "apps", "runtime-cli", "src", "index.ts"),
  'import { coreValue } from "@praxis/core";\nconsole.log(coreValue);\n',
  "utf8"
);

run(["intake", "--root", root, "--provider", "native"]);

const repositorySnapshot = await readJson(".distinction/cache/repository-snapshot.json");
assert.ok(Array.isArray(repositorySnapshot.files));
await assertJson(".distinction/cache/code-fact-graph.json", "praxis.codeFactGraph.v1");
const projectProfile = await readJson(".distinction/cache/project-profile.json");
assert.ok(Array.isArray(projectProfile.moduleCandidates));
await assertJson(".distinction/cache/repository-understanding-patch.json", "praxis.repositoryUnderstandingPatch.v1");
await assertJson(".distinction/cache/architecture-model-patch.json", "praxis.architectureModelPatch.v1");
await assertJson(".distinction/cache/architecture-findings.json", "praxis.architectureFindingReport.v1");
await assert.rejects(() => stat(path.join(root, ".distinction", "memory", "facts.jsonl")));

run(["accept-understanding", "--root", root]);
const facts = (await readFile(path.join(root, ".distinction", "memory", "facts.jsonl"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
assert.ok(facts.length > 0);
assert.ok(facts.every((record) => record.kind === "FACT"));
assert.ok(facts.every((record) => record.status === "active"));

run(["model-architecture", "--root", root]);
run(["detect-findings", "--root", root]);
run(["project:view", "architecture", "--root", root]);

const dependencyView = await assertJson(".distinction/views/architecture/dependency-view.json", "praxis.architectureDependencyView.v1");
assert.ok(dependencyView.nodes.some((node) => node.path === "packages/core"));
assert.ok(dependencyView.nodes.some((node) => node.path === "apps/runtime-cli"));
assert.ok(dependencyView.edges.length >= 1);

const manifest = await assertJson(".distinction/cache/projection-manifest.json", "praxis.projectionManifest.v1");
const architectureView = manifest.views.find((view) => view.id === "view:architecture:dependency");
assert.ok(architectureView);
assert.equal(architectureView.authority, "review_cache");
assert.deepEqual(architectureView.sourceCachePaths, [
  ".distinction/cache/architecture-model-patch.json",
  ".distinction/cache/architecture-findings.json"
]);
assert.equal(architectureView.status, "fresh");

console.log(
  JSON.stringify({
    ok: true,
    root,
    facts: facts.length,
    nodes: dependencyView.nodes.length,
    edges: dependencyView.edges.length,
    annotations: dependencyView.annotations.length
  })
);

async function assertJson(relativePath, schemaVersion) {
  const parsed = await readJson(relativePath);
  assert.equal(parsed.schemaVersion, schemaVersion, relativePath);
  return parsed;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}
