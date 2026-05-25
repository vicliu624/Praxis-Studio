import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(path.join(tmpdir(), "praxis-architecture-"));
await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "smoke", workspaces: ["packages/*"] }, null, 2), "utf8");
await mkdirp(path.join(root, "packages", "a", "src"));
await mkdirp(path.join(root, "packages", "b", "src"));
await writeFile(path.join(root, "packages", "a", "src", "index.ts"), 'import { b } from "@praxis/b";\nexport const a = b;\n', "utf8");
await writeFile(path.join(root, "packages", "b", "src", "index.ts"), 'import { a } from "@praxis/a";\nexport const b = a;\n', "utf8");

const cli = path.resolve("apps/runtime-cli/dist/index.js");
run(["code-facts", "--root", root, "--write-cache"]);
run(["understand", "--root", root]);
run(["accept-understanding", "--root", root]);
run(["model-architecture", "--root", root]);
run(["detect-findings", "--root", root]);

const model = JSON.parse(await readFile(path.join(root, ".distinction", "cache", "architecture-model-patch.json"), "utf8"));
assert.equal(model.schemaVersion, "praxis.architectureModelPatch.v1");
assert.ok(model.modules.some((module) => module.path === "packages/a"));
assert.ok(model.modules.some((module) => module.path === "packages/b"));
assert.ok(model.dependencies.length >= 2);

const report = JSON.parse(await readFile(path.join(root, ".distinction", "cache", "architecture-findings.json"), "utf8"));
assert.equal(report.schemaVersion, "praxis.architectureFindingReport.v1");
assert.ok(report.findings.some((finding) => finding.antiPatternId === "package_dependency_cycle"));

console.log(JSON.stringify({ ok: true, modules: model.modules.length, dependencies: model.dependencies.length, findings: report.findings.length }));

async function mkdirp(target) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(target, { recursive: true });
}

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
