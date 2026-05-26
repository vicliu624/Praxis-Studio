import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ContextPacketSchema,
  PraxisMcpCodeFactsResultSchema,
  PraxisMcpFindingsResultSchema,
  PraxisMcpProjectionViewsResultSchema,
  PraxisMcpStatusResultSchema
} from "../packages/schema/dist/index.js";

const repoRoot = path.resolve(".");
const root = await mkdtemp(path.join(tmpdir(), "praxis-mcp-readonly-"));
const cli = path.join(repoRoot, "apps", "runtime-cli", "dist", "index.js");

await mkdir(path.join(root, "packages", "a", "src"), { recursive: true });
await mkdir(path.join(root, "packages", "b", "src"), { recursive: true });
await mkdir(path.join(root, ".distinction", "rules"), { recursive: true });
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({ name: "praxis-mcp-readonly-smoke", type: "module", workspaces: ["packages/*"] }, null, 2)}\n`,
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

const client = startMcpClient(root);
try {
  const initialized = await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "praxis-smoke", version: "0.1.0" }
  });
  assert.equal(initialized.serverInfo.name, "praxis-mcp-server");
  client.notify("notifications/initialized", {});

  const list = await client.call("tools/list", {});
  const toolNames = new Set(list.tools.map((tool) => tool.name));
  for (const tool of ["praxis_status", "praxis_code_facts", "praxis_findings", "praxis_projection_views", "praxis_context_packet"]) {
    assert.ok(toolNames.has(tool), `missing MCP tool: ${tool}`);
  }

  const status = PraxisMcpStatusResultSchema.parse(await client.tool("praxis_status", {}));
  assert.equal(status.root, root);
  assert.equal(status.server.readOnly, true);
  assert.equal(status.cache.codeFacts, true);
  assert.equal(status.cache.findings, true);
  assert.ok(status.views.projectedGraphViewCount >= 2);

  const codeFacts = PraxisMcpCodeFactsResultSchema.parse(await client.tool("praxis_code_facts", { limit: 25 }));
  assert.ok(codeFacts.nodes.length > 0, "praxis_code_facts should return nodes");
  assert.ok(codeFacts.provider.capabilities.includes("file_structure"));

  const findings = PraxisMcpFindingsResultSchema.parse(await client.tool("praxis_findings", { status: "open", limit: 10 }));
  assert.ok(findings.findings.length > 0, "praxis_findings should return an open finding");

  const projectionViews = PraxisMcpProjectionViewsResultSchema.parse(await client.tool("praxis_projection_views", { kind: "finding" }));
  assert.ok(projectionViews.views.some((view) => view.id === "view:findings"), "praxis_projection_views should expose finding view");

  const finding = findings.findings[0];
  const packet = ContextPacketSchema.parse(
    await client.tool("praxis_context_packet", {
      anchor: { kind: "finding", id: finding.id },
      purpose: "explain",
      limit: { codeFacts: 50, findings: 20, memory: 50, projectionNodes: 50 }
    })
  );
  assert.equal(packet.trace.createdBy, "mcp");
  assert.equal(packet.anchor.kind, "finding");
  assert.equal(packet.anchor.id, finding.id);
  assert.ok(packet.findings.some((item) => item.id === finding.id));
  assert.ok(packet.codeFacts.nodes.length > 0);

  await client.call("shutdown", {});
  await client.close();

  console.log(
    JSON.stringify({
      ok: true,
      root,
      tools: [...toolNames].length,
      codeFactNodes: codeFacts.nodes.length,
      findings: findings.findings.length,
      projectionViews: projectionViews.views.length,
      contextPacketId: packet.id
    })
  );
} catch (error) {
  await client.kill();
  throw error;
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
    const payload = { jsonrpc: "2.0", id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
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
