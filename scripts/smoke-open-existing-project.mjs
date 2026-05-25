import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArchitectureModelPatchSchema, CodeFactGraphSnapshotSchema, ProjectionManifestSchema } from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const tmpRoot = await mkdtemp(path.join(tmpdir(), "praxis-open-existing-"));
const projectRoot = path.join(tmpRoot, "Praxis-Studio");
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await copyWorkspace(repoRoot, projectRoot);

run(["intake", "--root", projectRoot, "--provider", "native"]);
await assertExists(".distinction/cache/repository-snapshot.json");
CodeFactGraphSnapshotSchema.parse(await readProjectJson(".distinction/cache/code-fact-graph.json"));
await assertExists(".distinction/cache/repository-understanding-patch.json");
ArchitectureModelPatchSchema.parse(await readProjectJson(".distinction/cache/architecture-model-patch.json"));
await assertExists(".distinction/cache/architecture-findings.json");

run(["accept-understanding", "--root", projectRoot]);
const facts = (await readFile(path.join(projectRoot, ".distinction", "memory", "facts.jsonl"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
assert.ok(facts.length > 0, "facts.jsonl must contain accepted FACT memory");
assert.ok(facts.every((record) => record.kind === "FACT"));
assert.ok(facts.every((record) => record.status === "active"));

run(["model-architecture", "--root", projectRoot]);
run(["detect-findings", "--root", projectRoot]);
run(["project:view", "architecture", "--root", projectRoot]);

const dependencyView = await readProjectJson(".distinction/views/architecture/dependency-view.json");
assert.equal(dependencyView.schemaVersion, "praxis.architectureDependencyView.v1");
assert.ok(dependencyView.nodes.some((node) => node.path === "apps/runtime-cli"));
assert.ok(dependencyView.nodes.some((node) => node.path === "packages/schema"));

const manifest = ProjectionManifestSchema.parse(await readProjectJson(".distinction/cache/projection-manifest.json"));
const architectureView = manifest.views.find((view) => view.id === "view:architecture:dependency");
assert.ok(architectureView);
assert.equal(architectureView.authority, "review_cache");
assert.equal(architectureView.status, "fresh");

console.log(
  JSON.stringify({
    ok: true,
    projectRoot,
    facts: facts.length,
    nodes: dependencyView.nodes.length,
    edges: dependencyView.edges.length,
    annotations: dependencyView.annotations.length
  })
);

async function assertExists(relativePath) {
  await readFile(path.join(projectRoot, relativePath), "utf8");
}

async function readProjectJson(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function copyWorkspace(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true });
  await copyDirectory(sourceRoot, targetRoot);
}

async function copyDirectory(sourceDir, targetDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(source, target);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }
}

function shouldSkip(name) {
  return [".git", ".distinction", ".tmp", "dist", "node_modules", "target"].includes(name);
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
