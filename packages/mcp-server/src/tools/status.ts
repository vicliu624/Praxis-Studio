import path from "node:path";
import { readProjectedGraphViewRecords } from "@praxis/projection-engine";
import {
  ArchitectureFindingReportSchema,
  CodeFactGraphSnapshotSchema,
  PraxisMcpProjectProfileInputSchema,
  PraxisMcpProjectProfileResultSchema,
  PraxisMcpStatusInputSchema,
  PraxisMcpStatusResultSchema
} from "@praxis/schema";
import { objectSchema, stringSchema } from "./schema-helpers.js";
import { MCP_TOOL_NAMES } from "./names.js";
import { exists, readJsonWithSchema, resolveToolRoot, tryReadJsonWithSchema } from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const statusTools: McpToolDefinition[] = [
  {
    name: "praxis_status",
    description: "Return Praxis project intelligence status for the scoped project.",
    inputSchema: objectSchema({ root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root.") }),
    call: callStatus
  },
  {
    name: "praxis_project_profile",
    description: "Read the cached Praxis project profile from .distinction/cache/project-profile.json.",
    inputSchema: objectSchema({ root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root.") }),
    call: callProjectProfile
  }
];

async function callStatus(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpStatusInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const distinctionPath = path.join(root, ".distinction");
  const cachePath = path.join(distinctionPath, "cache");
  const memoryPath = path.join(distinctionPath, "memory");
  const viewsPath = path.join(distinctionPath, "views");

  const [distinctionExists, codeFacts, findings, projectionManifestExists, contextPacketExists, codeFactViewExists, findingViewExists, projectedViews] =
    await Promise.all([
      exists(distinctionPath),
      tryReadJsonWithSchema(path.join(cachePath, "code-fact-graph.json"), CodeFactGraphSnapshotSchema),
      tryReadJsonWithSchema(path.join(cachePath, "architecture-findings.json"), ArchitectureFindingReportSchema),
      exists(path.join(cachePath, "projection-manifest.json")),
      exists(path.join(cachePath, "context-packet.json")),
      exists(path.join(viewsPath, "code", "code-fact-view.json")),
      exists(path.join(viewsPath, "findings", "finding-view.json")),
      readProjectedGraphViews(root)
    ]);

  const warnings: string[] = [];
  if (!distinctionExists) warnings.push(".distinction directory is missing; run intake before using project intelligence tools.");
  if (!codeFacts) warnings.push("Code fact cache is missing; run praxis-runtime intake or code-facts --write-cache.");
  if (!findings) warnings.push("Finding cache is missing; run praxis-runtime detect-findings.");

  return PraxisMcpStatusResultSchema.parse({
    schemaVersion: "praxis.mcp.statusResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    server: {
      name: "praxis-mcp-server",
      version: "0.1.0-alpha.0",
      readOnly: false,
      writePolicy: "governed_artifacts_only"
    },
    distinction: {
      exists: distinctionExists,
      path: distinctionPath,
      cachePath,
      memoryPath,
      viewsPath
    },
    cache: {
      codeFacts: Boolean(codeFacts),
      findings: Boolean(findings),
      projectionManifest: projectionManifestExists,
      contextPacket: contextPacketExists
    },
    views: {
      codeFacts: codeFactViewExists,
      findings: findingViewExists,
      projectedGraphViewCount: projectedViews.length
    },
    codeFacts: codeFacts
      ? {
          provider: codeFacts.provider,
          files: codeFacts.files.length,
          nodes: codeFacts.nodes.length,
          edges: codeFacts.edges.length,
          warnings: codeFacts.warnings
        }
      : undefined,
    findings: findings
      ? {
          count: findings.findings.length,
          open: findings.findings.filter((finding) => finding.status === "open").length
        }
      : undefined,
    tools: MCP_TOOL_NAMES,
    warnings
  });
}

async function callProjectProfile(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpProjectProfileInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const sourcePath = path.join(root, ".distinction", "cache", "project-profile.json");
  const profile = await readJsonWithSchema(sourcePath, { parse: (value) => value as Record<string, unknown> });
  return PraxisMcpProjectProfileResultSchema.parse({
    schemaVersion: "praxis.mcp.projectProfileResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    profile,
    sourceCachePath: ".distinction/cache/project-profile.json"
  });
}

async function readProjectedGraphViews(root: string) {
  return (await readProjectedGraphViewRecords(root)).map((record) => record.view);
}
