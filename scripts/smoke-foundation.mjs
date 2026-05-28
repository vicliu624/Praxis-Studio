import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CodeFactGraphSnapshotSchema,
  ContextPacketSchema,
  PraxisMcpContextPacketResultSchema,
  PraxisMcpProjectionViewsResultSchema,
  PraxisMcpStatusResultSchema,
  ProjectedGraphViewSchema,
  ProjectionManifestSchema
} from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-foundation-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "packages", "a", "src"), { recursive: true });
await mkdir(path.join(root, "packages", "b", "src"), { recursive: true });
await mkdir(path.join(root, ".distinction", "rules"), { recursive: true });
await mkdir(path.join(root, ".distinction", "tasks"), { recursive: true });
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({ name: "praxis-foundation-smoke", type: "module", workspaces: ["packages/*"] }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(root, "packages", "a", "src", "index.ts"),
  [
    'import { b } from "@praxis/b";',
    "export function add(a: number, bValue: number) {",
    "  return a + bValue;",
    "}",
    "export function a() {",
    "  return b() + add(1, 2);",
    "}",
    ""
  ].join("\n"),
  "utf8"
);
await writeFile(
  path.join(root, "packages", "b", "src", "index.ts"),
  [
    'import { a } from "@praxis/a";',
    "export function b() {",
    "  return a();",
    "}",
    ""
  ].join("\n"),
  "utf8"
);
await writeFile(path.join(root, ".distinction", "rules", "architecture.md"), "# Architecture Rules\n\n- Keep package dependencies acyclic.\n", "utf8");
await writeFile(path.join(root, ".distinction", "rules", "boundaries.md"), "# Boundary Rules\n\n- Packages must not form cycles.\n", "utf8");
await writeFile(path.join(root, ".distinction", "rules", "ai-constraints.md"), "# AI Constraints\n\n- Explain before Plan.\n", "utf8");
await writeFile(
  path.join(root, ".distinction", "tasks", "TASK-foundation.md"),
  "# TASK-foundation\n\nValidate Foundation graph projection smoke.\n\nSource: finding:foundation-smoke\n",
  "utf8"
);
await mkdir(path.join(root, ".distinction", "memory"), { recursive: true });
await writeFile(
  path.join(root, ".distinction", "memory", "traces.jsonl"),
  `${JSON.stringify({
    id: "trace-event:foundation-smoke",
    traceId: "trace:foundation-smoke",
    timestamp: "2026-05-26T00:00:00.000Z",
    kind: "smoke.foundation",
    target: { type: "task", id: "TASK-foundation" },
    summary: "Foundation smoke trace"
  })}\n`,
  "utf8"
);

run(["intake", "--root", root, "--provider", "codegraph"]);
run(["accept-understanding", "--root", root]);
run(["model-architecture", "--root", root]);
run(["detect-findings", "--root", root]);
run(["project:view", "architecture", "--root", root]);
run(["project:view", "code-facts", "--root", root]);
run(["project:view", "findings", "--root", root]);
run(["project:view", "memory", "--root", root]);
run(["project:view", "trace", "--root", root]);
run(["project:view", "tasks", "--root", root]);

const codeFacts = CodeFactGraphSnapshotSchema.parse(await readJson(".distinction/cache/code-fact-graph.json"));
assert.equal(codeFacts.provider.source, "codegraph");
assert.ok(codeFacts.provider.capabilities.includes("symbols"), "Foundation smoke expects CodeGraph symbols");
const anchorNode = codeFacts.nodes.find((node) => node.kind === "function") ?? codeFacts.nodes[0];
assert.ok(anchorNode, "Foundation smoke requires at least one code fact node");

run(["context-packet", "--root", root, "--anchor", `code_fact_node:${anchorNode.id}`, "--purpose", "explain", "--write-cache"]);
run(["project:view", "context", "--root", root]);

const packet = ContextPacketSchema.parse(await readJson(".distinction/cache/context-packet.json"));
assert.equal(packet.anchor.kind, "code_fact_node");
assert.equal(packet.anchor.id, anchorNode.id);
assert.ok(packet.codeFacts.nodes.some((node) => node.id === anchorNode.id));
assert.ok(packet.projections.views.some((view) => view.kind === "architecture_dependency"));

const projectedViews = [
  ".distinction/views/architecture/architecture-graph-view.json",
  ".distinction/views/code/code-fact-view.json",
  ".distinction/views/findings/finding-view.json",
  ".distinction/views/memory/memory-view.json",
  ".distinction/views/trace/trace-view.json",
  ".distinction/views/project-plan/task-view.json",
  ".distinction/views/context/context-view.json"
];
for (const viewPath of projectedViews) {
  const view = ProjectedGraphViewSchema.parse(await readJson(viewPath));
  assert.equal(view.status, "fresh", `${viewPath} should be fresh`);
  for (const node of view.nodes) assert.ok(node.anchor, `${viewPath} node must have anchor`);
  for (const edge of view.edges) assert.ok(edge.anchor, `${viewPath} edge must have anchor`);
}

const manifest = ProjectionManifestSchema.parse(await readJson(".distinction/cache/projection-manifest.json"));
for (const viewPath of projectedViews) {
  assert.ok(manifest.views.some((view) => view.path === viewPath), `manifest should include ${viewPath}`);
}

const client = startMcpClient(root);
try {
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "praxis-foundation-smoke", version: "0.1.0" }
  });
  client.notify("notifications/initialized", {});

  const status = PraxisMcpStatusResultSchema.parse(await client.tool("praxis_status", {}));
  assert.equal(status.server.writePolicy, "governed_artifacts_only");
  assert.ok(status.views.projectedGraphViewCount >= projectedViews.length);

  const projectionResult = PraxisMcpProjectionViewsResultSchema.parse(await client.tool("praxis_projection_views", { kind: "architecture_dependency" }));
  assert.ok(projectionResult.views.some((view) => view.id === "view:architecture:dependency-graph"));

  const mcpPacket = PraxisMcpContextPacketResultSchema.parse(
    await client.tool("praxis_context_packet", {
      anchor: { kind: "code_fact_node", id: anchorNode.id },
      purpose: "explain"
    })
  );
  assert.equal(mcpPacket.trace.createdBy, "mcp");
  assert.equal(mcpPacket.anchor.id, anchorNode.id);

  await client.call("shutdown", {});
  await client.close();
} catch (error) {
  await client.kill();
  throw error;
}

console.log(
  JSON.stringify({
    ok: true,
    root,
    provider: codeFacts.provider.source,
    codeFactNodes: codeFacts.nodes.length,
    projectionViews: projectedViews.length,
    manifestViews: manifest.views.length,
    contextPacketId: packet.id
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

function startMcpClient(projectRoot) {
  const child = spawn(process.execPath, [cli, "serve", "--mcp", "--path", projectRoot], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const pending = new Map();
  let nextId = 1;
  let stdoutBuffer = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) handleLine(line);
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("exit", (code) => {
    for (const { reject } of pending.values()) reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
    pending.clear();
  });

  function handleLine(line) {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(`${message.error.message}\n${JSON.stringify(message.error.data ?? {}, null, 2)}`));
    else request.resolve(message.result);
  }

  function call(method, params) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`Timed out waiting for MCP response to ${method}. stderr:\n${stderr}`));
      }, 15000);
    });
  }

  return {
    call,
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    async tool(name, args) {
      const result = await call("tools/call", { name, arguments: args });
      assert.equal(result.isError, false);
      assert.ok(result.structuredContent, `MCP tool ${name} should return structuredContent`);
      return result.structuredContent;
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for MCP server exit. stderr:\n${stderr}`)), 15000);
        child.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
    async kill() {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };
}
