import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(path.join(tmpdir(), "praxis-understanding-"));
await writeFile(
  path.join(root, "package.json"),
  JSON.stringify({ name: "smoke", type: "module" }, null, 2),
  "utf8"
);
await writeFile(path.join(root, "index.ts"), 'import { value } from "./value";\nconsole.log(value);\n', "utf8");
await writeFile(path.join(root, "value.ts"), "export const value = 1;\n", "utf8");

const cli = path.resolve("apps/runtime-cli/dist/index.js");

run(["code-facts", "--root", root, "--write-cache"]);
run(["understand", "--root", root]);

const factsPath = path.join(root, ".distinction", "memory", "facts.jsonl");
await assert.rejects(() => stat(factsPath));

const patchPath = path.join(root, ".distinction", "cache", "repository-understanding-patch.json");
const patch = JSON.parse(await readFile(patchPath, "utf8"));
assert.equal(patch.schemaVersion, "praxis.repositoryUnderstandingPatch.v1");
assert.equal(patch.modelPatches.length, 0);
assert.equal(patch.findingPatches.length, 0);
assert.ok(patch.memoryPatches.some((item) => item.record.type === "code.file.exists"));
assert.ok(patch.memoryPatches.some((item) => item.record.type === "code.import.exists"));

run(["accept-understanding", "--root", root]);

const facts = (await readFile(factsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.ok(facts.length >= patch.memoryPatches.length);
assert.ok(facts.every((record) => record.kind === "FACT"));
assert.ok(facts.every((record) => record.source === "code_fact_graph"));

console.log(JSON.stringify({ ok: true, root, acceptedFacts: facts.length }));

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}
