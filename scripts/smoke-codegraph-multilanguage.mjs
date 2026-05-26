import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodeFactGraphSnapshotSchema } from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const fixtureRoot = path.join(repoRoot, "fixtures", "codegraph-multilanguage");
const root = await mkdtemp(path.join(tmpdir(), "praxis-codegraph-multilanguage-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await copyDirectory(fixtureRoot, root);
run(["code-facts", "--root", root, "--provider", "codegraph", "--write-cache"]);

const graph = CodeFactGraphSnapshotSchema.parse(await readJson(".distinction/cache/code-fact-graph.json"));
assert.equal(graph.provider.source, "codegraph");
assert.ok(graph.provider.capabilities.includes("file_structure"));
assert.ok(graph.provider.capabilities.includes("symbols"));
assert.ok(!graph.warnings.some((warning) => warning.id === "code-fact-warning:codegraph-cli-fallback"), "direct index read should not use CLI fallback");

for (const filePath of ["cpp/main.cpp", "go/main.go", "py/src/app.py", "rust/src/lib.rs", "ts/src/index.ts"]) {
  assert.ok(graph.files.some((file) => file.path === filePath), `CodeGraph indexed file must be present: ${filePath}`);
}

for (const symbolName of ["cpp_add", "goAdd", "py_add", "rust_add", "tsAdd", "tsMain"]) {
  assert.ok(graph.nodes.some((node) => node.kind === "function" && node.name === symbolName), `CodeGraph symbol must be present: ${symbolName}`);
}

const tsAdd = graph.nodes.find((node) => node.name === "tsAdd");
const tsMain = graph.nodes.find((node) => node.name === "tsMain");
assert.ok(tsAdd);
assert.ok(tsMain);
assert.ok(graph.edges.some((edge) => edge.kind === "calls" && edge.sourceId === tsMain.id && edge.targetId === tsAdd.id));

console.log(
  JSON.stringify({
    ok: true,
    root,
    files: graph.statistics.fileCount,
    nodes: graph.statistics.nodeCount,
    edges: graph.statistics.edgeCount,
    languages: graph.statistics.filesByLanguage
  })
);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function copyDirectory(sourceDir, targetDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
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
