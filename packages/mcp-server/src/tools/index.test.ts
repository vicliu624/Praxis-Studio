import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MCP_TOOL_DEFINITIONS, MCP_TOOL_NAMES, type McpToolDefinition } from "./index.js";

test("MCP tool catalog preserves public tool names and order", () => {
  assert.equal(MCP_TOOL_DEFINITIONS.length, 14);
  assert.deepEqual(MCP_TOOL_DEFINITIONS.map((tool) => tool.name), MCP_TOOL_NAMES);
  assert.equal(new Set(MCP_TOOL_NAMES).size, MCP_TOOL_NAMES.length);
  for (const tool of MCP_TOOL_DEFINITIONS) {
    assert.equal(typeof tool.description, "string");
    assert.equal(typeof tool.call, "function");
    assert.equal((tool.inputSchema as { type?: unknown }).type, "object");
  }
});

test("praxis_status reports missing project intelligence and refuses root escape", async (t) => {
  const root = await tempProject(t);
  const status = getTool("praxis_status");

  const result = await status.call({}, { root }) as { root: string; warnings: string[]; tools: string[] };
  assert.equal(result.root, root);
  assert.ok(result.warnings.some((warning) => warning.includes(".distinction directory is missing")));
  assert.deepEqual(result.tools, MCP_TOOL_NAMES);

  await assert.rejects(
    () => status.call({ root: path.dirname(root) }, { root }),
    /MCP server is scoped to/
  );
});

test("praxis_code_facts filters cached facts and relation tools return callers", async (t) => {
  const root = await tempProject(t);
  await writeCodeFactSnapshot(root);

  const facts = await getTool("praxis_code_facts").call(
    { path: "src/app.ts", kind: "function", name: "handle", limit: 5 },
    { root }
  ) as { nodes: Array<{ id: string; name: string }>; files: Array<{ path: string }>; edges: Array<{ id: string }> };
  assert.deepEqual(facts.nodes.map((node) => node.id), ["fn:handle"]);
  assert.deepEqual(facts.files.map((file) => file.path), ["src/app.ts"]);
  assert.deepEqual(facts.edges.map((edge) => edge.id), ["edge:caller-handle"]);

  const callers = await getTool("praxis_callers").call(
    { symbolId: "fn:handle", depth: 1, limit: 5 },
    { root }
  ) as { relation: string; nodes: Array<{ id: string }>; edges: Array<{ id: string }> };
  assert.equal(callers.relation, "callers");
  assert.ok(callers.nodes.some((node) => node.id === "fn:caller"));
  assert.deepEqual(callers.edges.map((edge) => edge.id), ["edge:caller-handle"]);
});

test("finding tools filter findings and write governed plan artifacts", async (t) => {
  const root = await tempProject(t);
  await writeFindingReport(root);

  const findings = await getTool("praxis_findings").call(
    { severity: "high" },
    { root }
  ) as { findings: Array<{ id: string; severity: string }>; truncated: boolean };
  assert.equal(findings.truncated, false);
  assert.deepEqual(findings.findings.map((finding) => finding.id), ["finding:high"]);

  const plan = await getTool("praxis_plan_from_finding").call(
    { findingId: "finding:high", strength: "balanced" },
    { root }
  ) as { path: string; planPatch: { sourceFindingId?: string; strength: string } };
  assert.equal(plan.planPatch.sourceFindingId, "finding:high");
  assert.equal(plan.planPatch.strength, "balanced");

  const planText = await readFile(path.join(root, plan.path), "utf8");
  const parsed = JSON.parse(planText) as { schemaVersion: string; sourceFindingId: string };
  assert.equal(parsed.schemaVersion, "praxis.planPatch.v1");
  assert.equal(parsed.sourceFindingId, "finding:high");
});

function getTool(name: string): McpToolDefinition {
  const tool = MCP_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected tool ${name} to exist`);
  return tool;
}

async function tempProject(t: { after: (fn: () => void | Promise<void>) => void }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-mcp-tools-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCodeFactSnapshot(root: string): Promise<void> {
  const evidence = { source: "repository_scan", filePath: "src/app.ts", startLine: 1, endLine: 1 };
  await writeJson(root, ".distinction/cache/code-fact-graph.json", {
    schemaVersion: "praxis.codeFactGraph.v1",
    root,
    generatedAt: "2026-06-16T00:00:00.000Z",
    provider: {
      name: "unit-test",
      source: "native",
      version: "0.0.0",
      capabilities: ["file_structure", "symbols", "calls", "impact"]
    },
    files: [
      {
        id: "file:src/app.ts",
        path: "src/app.ts",
        language: "typescript",
        extension: ".ts",
        sizeBytes: 100,
        lineCount: 10,
        roleHint: "source",
        nodeIds: ["fn:caller", "fn:handle"],
        evidence: [evidence]
      }
    ],
    nodes: [
      {
        id: "fn:caller",
        kind: "function",
        name: "caller",
        qualifiedName: "caller",
        filePath: "src/app.ts",
        language: "typescript",
        range: { startLine: 1, endLine: 3 },
        signature: "function caller()",
        evidence: [evidence]
      },
      {
        id: "fn:handle",
        kind: "function",
        name: "handleRequest",
        qualifiedName: "handleRequest",
        filePath: "src/app.ts",
        language: "typescript",
        range: { startLine: 5, endLine: 8 },
        signature: "function handleRequest()",
        evidence: [evidence]
      }
    ],
    edges: [
      {
        id: "edge:caller-handle",
        kind: "calls",
        sourceId: "fn:caller",
        targetId: "fn:handle",
        filePath: "src/app.ts",
        confidence: 0.9,
        evidence: [evidence]
      }
    ],
    statistics: {
      fileCount: 1,
      nodeCount: 2,
      edgeCount: 1,
      filesByLanguage: { typescript: 1 },
      nodesByKind: { function: 2 },
      edgesByKind: { calls: 1 }
    },
    warnings: []
  });
}

async function writeFindingReport(root: string): Promise<void> {
  const baseFinding = {
    antiPatternId: "architecture_dependency_without_evidence",
    category: "architecture",
    confidence: "medium",
    knowledgeKind: "CANDIDATE",
    affectedModuleIds: ["module:a"],
    affectedDependencyIds: [],
    affectedSourcePaths: ["src/app.ts"],
    evidence: [{ source: "repository_scan", filePath: "src/app.ts", startLine: 1, endLine: 1 }],
    suggestedQuestions: ["Is this dependency intentional?"],
    suggestedPlanActions: ["Add missing architectural evidence."],
    status: "open",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
  await writeJson(root, ".distinction/cache/architecture-findings.json", {
    schemaVersion: "praxis.architectureFindingReport.v1",
    root,
    generatedAt: "2026-06-16T00:00:00.000Z",
    detectorIds: ["unit-test"],
    findings: [
      {
        ...baseFinding,
        id: "finding:high",
        title: "High finding",
        summary: "A high severity finding.",
        severity: "high"
      },
      {
        ...baseFinding,
        id: "finding:low",
        title: "Low finding",
        summary: "A low severity finding.",
        severity: "low"
      }
    ]
  });
}
