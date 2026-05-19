import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const tmpDir = path.join(root, ".tmp", "smoke-self-intake");
const snapshotPath = path.join(tmpDir, "snapshot.json");
const profilePath = path.join(tmpDir, "profile.json");
const candidatePath = path.join(tmpDir, "candidate.json");
const intakePath = path.join(tmpDir, "intake.json");

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

await run("npm", ["run", "build"]);
await run("npm", ["run", "typecheck"]);
await run("node", ["apps/runtime-cli/dist/index.js", "intake", "--root", "."], { stdoutFile: intakePath });
await run("node", ["apps/runtime-cli/dist/index.js", "scan", "--root", ".", "--out", snapshotPath]);
await run("node", ["apps/runtime-cli/dist/index.js", "profile", "--snapshot", snapshotPath, "--out", profilePath]);
await run("node", ["apps/runtime-cli/dist/index.js", "generate-graph", "--snapshot", snapshotPath, "--profile", profilePath, "--out", candidatePath]);

const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
const nodeIds = new Set(candidate.graph?.nodes?.map((node) => node.id) ?? []);
const requiredNodeIds = ["project:root", "module:apps/studio-desktop", "module:apps/runtime-cli", "module:packages/agent-runtime"];

assert(candidate.graph?.nodes?.length > 0, "candidate.graph.nodes must not be empty");
assert(candidate.graph?.edges?.length > 0, "candidate.graph.edges must not be empty");
for (const nodeId of requiredNodeIds) {
  assert(nodeIds.has(nodeId), `required node missing: ${nodeId}`);
}
assert(Array.isArray(candidate.warnings), "candidate.warnings must be an array");
assert(Array.isArray(candidate.unresolvedQuestions), "candidate.unresolvedQuestions must be an array");

console.log(
  JSON.stringify(
    {
      ok: true,
      nodes: candidate.graph.nodes.length,
      edges: candidate.graph.edges.length,
      warnings: candidate.warnings.length,
      unresolvedQuestions: candidate.unresolvedQuestions.length
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const chunks = [];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
      if (!options.stdoutFile) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
  if (options.stdoutFile) {
    await mkdir(path.dirname(options.stdoutFile), { recursive: true });
    await import("node:fs/promises").then(({ writeFile }) => writeFile(options.stdoutFile, Buffer.concat(chunks), "utf8"));
  }
}
