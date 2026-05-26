import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectedGraphViewSchema, ProjectionManifestSchema } from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-projected-views-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "packages", "a", "src"), { recursive: true });
await mkdir(path.join(root, "packages", "b", "src"), { recursive: true });
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({ name: "praxis-projected-view-smoke", type: "module", workspaces: ["packages/*"] }, null, 2)}\n`,
  "utf8"
);
await writeFile(path.join(root, "packages", "a", "src", "index.ts"), 'import { b } from "@praxis/b";\nexport const a = b;\n', "utf8");
await writeFile(path.join(root, "packages", "b", "src", "index.ts"), 'import { a } from "@praxis/a";\nexport const b = a;\n', "utf8");

run(["intake", "--root", root, "--provider", "native"]);
run(["accept-understanding", "--root", root]);
run(["model-architecture", "--root", root]);
run(["detect-findings", "--root", root]);
run(["project:view", "code-facts", "--root", root]);

const codeFactView = ProjectedGraphViewSchema.parse(await readJson(".distinction/views/code/code-fact-view.json"));
assert.equal(codeFactView.kind, "code_fact");
assert.ok(codeFactView.nodes.some((node) => node.anchor.kind === "file"));
assert.ok(codeFactView.edges.some((edge) => edge.anchor.kind === "code_fact_edge"));

run(["project:view", "findings", "--root", root]);
const findingView = ProjectedGraphViewSchema.parse(await readJson(".distinction/views/findings/finding-view.json"));
assert.equal(findingView.kind, "finding");
assert.ok(findingView.nodes.some((node) => node.anchor.kind === "finding"));
assert.ok(findingView.annotations.length >= 1, "finding view should expose finding annotations");
assert.ok(findingView.annotations.every((annotation) => annotation.sourceFindingId), "finding annotations must retain sourceFindingId");

const manifest = ProjectionManifestSchema.parse(await readJson(".distinction/cache/projection-manifest.json"));
assert.ok(manifest.views.some((view) => view.id === "view:code-facts" && view.kind === "code_fact"));
assert.ok(manifest.views.some((view) => view.id === "view:findings" && view.kind === "finding"));

console.log(
  JSON.stringify({
    ok: true,
    root,
    codeFactNodes: codeFactView.nodes.length,
    codeFactEdges: codeFactView.edges.length,
    findingNodes: findingView.nodes.length,
    findingEdges: findingView.edges.length,
    annotations: findingView.annotations.length
  })
);

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
