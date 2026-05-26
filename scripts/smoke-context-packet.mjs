import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ContextPacketSchema } from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-context-packet-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "packages", "a", "src"), { recursive: true });
await mkdir(path.join(root, "packages", "b", "src"), { recursive: true });
await mkdir(path.join(root, ".distinction", "rules"), { recursive: true });
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({ name: "praxis-context-packet-smoke", type: "module", workspaces: ["packages/*"] }, null, 2)}\n`,
  "utf8"
);
await writeFile(path.join(root, "packages", "a", "src", "index.ts"), 'import { b } from "@praxis/b";\nexport const a = b;\n', "utf8");
await writeFile(path.join(root, "packages", "b", "src", "index.ts"), 'import { a } from "@praxis/a";\nexport const b = a;\n', "utf8");
await writeFile(path.join(root, ".distinction", "rules", "architecture.md"), "# Architecture Rules\n\n- Keep package dependencies acyclic.\n", "utf8");
await writeFile(path.join(root, ".distinction", "rules", "boundaries.md"), "# Boundary Rules\n\n- Packages must not form cycles.\n", "utf8");
await writeFile(path.join(root, ".distinction", "rules", "ai-constraints.md"), "# AI Constraints\n\n- Explain before Plan.\n", "utf8");

run(["intake", "--root", root, "--provider", "native"]);
run(["accept-understanding", "--root", root]);
run(["model-architecture", "--root", root]);
run(["detect-findings", "--root", root]);
run(["project:view", "code-facts", "--root", root]);
run(["project:view", "findings", "--root", root]);

const findings = await readJson(".distinction/cache/architecture-findings.json");
const finding = findings.findings[0];
assert.ok(finding, "smoke project must produce at least one finding");

run(["context-packet", "--root", root, "--anchor", finding.id, "--purpose", "explain", "--write-cache"]);
const packet = ContextPacketSchema.parse(await readJson(".distinction/cache/context-packet.json"));
assert.equal(packet.anchor.kind, "finding");
assert.equal(packet.anchor.id, finding.id);
assert.equal(packet.purpose, "explain");
assert.ok(packet.findings.some((item) => item.id === finding.id));
assert.ok(packet.codeFacts.nodes.length > 0, "context packet should include related code fact nodes");
assert.ok(packet.projections.views.some((view) => view.id === "view:findings"), "context packet should include finding projection view");
assert.ok(packet.rules.architectureRules.some((rule) => rule.includes("acyclic")));
assert.ok(packet.scope.includedPaths.length > 0);

console.log(
  JSON.stringify({
    ok: true,
    root,
    contextPacketId: packet.id,
    anchor: packet.anchor,
    codeFactNodes: packet.codeFacts.nodes.length,
    findings: packet.findings.length,
    projectionViews: packet.projections.views.length,
    memoryFacts: packet.memory.facts.length
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
