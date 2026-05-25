import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodeFactGraphSnapshotSchema } from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-codegraph-provider-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "src"), { recursive: true });
await writeFile(
  path.join(root, "src", "index.ts"),
  [
    "export function add(a: number, b: number) {",
    "  return a + b;",
    "}",
    "",
    "export function main() {",
    "  return add(1, 2);",
    "}",
    ""
  ].join("\n"),
  "utf8"
);

run(["code-facts", "--root", root, "--provider", "codegraph", "--write-cache"]);

const graph = CodeFactGraphSnapshotSchema.parse(await readJson(".distinction/cache/code-fact-graph.json"));
assert.equal(graph.provider.source, "codegraph");
assert.ok(graph.provider.capabilities.includes("file_structure"));
assert.ok(graph.provider.capabilities.includes("imports_exports"));
assert.ok(graph.provider.capabilities.includes("symbols"));
assert.ok(graph.provider.capabilities.includes("calls"));
assert.ok(graph.provider.capabilities.includes("references"));

const addNode = graph.nodes.find((node) => node.kind === "function" && node.name === "add");
const mainNode = graph.nodes.find((node) => node.kind === "function" && node.name === "main");
assert.ok(addNode, "CodeGraph provider must discover function symbol add");
assert.ok(mainNode, "CodeGraph provider must discover function symbol main");

const callEdge = graph.edges.find((edge) => edge.kind === "calls" && edge.sourceId === mainNode.id && edge.targetId === addNode.id);
assert.ok(callEdge, "CodeGraph provider must normalize a calls edge from main to add");

console.log(
  JSON.stringify({
    ok: true,
    root,
    provider: graph.provider,
    files: graph.statistics.fileCount,
    nodes: graph.statistics.nodeCount,
    edges: graph.statistics.edgeCount,
    callEdge: callEdge.id
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
