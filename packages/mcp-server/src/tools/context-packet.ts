import { buildContextPacket } from "@praxis/context-builder";
import {
  ContextPacketSchema,
  PraxisMcpContextPacketInputSchema,
  PraxisMcpContextPacketResultSchema,
  PraxisMcpExplainAnchorInputSchema,
  PraxisMcpExplainAnchorResultSchema
} from "@praxis/schema";
import { enumSchema, graphAnchorJsonSchema, objectSchema, stringSchema } from "./schema-helpers.js";
import { normalizeAnchorInput, normalizeContextPacketInput, resolveToolRoot } from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const contextPacketTools: McpToolDefinition[] = [
  {
    name: "praxis_context_packet",
    description: "Build a ContextPacket from a graph anchor using the shared Praxis context builder.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        anchor: {
          ...graphAnchorJsonSchema(),
          description: "Required graph anchor. A string anchor is also accepted at runtime for convenience."
        },
        purpose: enumSchema(["explain", "plan", "task", "review", "governance", "external_agent"], "Context packet purpose."),
        limit: {
          type: "object",
          description: "Optional context slice limits.",
          additionalProperties: false,
          properties: {
            codeFacts: { type: "number", minimum: 1, maximum: 500 },
            findings: { type: "number", minimum: 1, maximum: 500 },
            memory: { type: "number", minimum: 1, maximum: 500 },
            projectionNodes: { type: "number", minimum: 1, maximum: 500 }
          }
        }
      },
      ["anchor"]
    ),
    call: callContextPacket
  },
  {
    name: "praxis_explain_anchor",
    description: "Build a ContextPacket and return a deterministic explanation summary for the anchor.",
    inputSchema: objectSchema(
      {
        root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
        anchor: {
          ...graphAnchorJsonSchema(),
          description: "Required graph anchor. A string anchor is also accepted at runtime for convenience."
        }
      },
      ["anchor"]
    ),
    call: callExplainAnchor
  }
];

async function callContextPacket(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const normalizedInput = normalizeContextPacketInput(rawInput);
  const input = PraxisMcpContextPacketInputSchema.parse(normalizedInput);
  const root = resolveToolRoot(context, input.root);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor: input.anchor,
      purpose: input.purpose ?? "explain",
      createdBy: "mcp",
      limit: input.limit
    })
  );
  return PraxisMcpContextPacketResultSchema.parse(packet);
}

async function callExplainAnchor(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpExplainAnchorInputSchema.parse(normalizeAnchorInput(rawInput));
  const root = resolveToolRoot(context, input.root);
  const packet = ContextPacketSchema.parse(
    await buildContextPacket({
      root,
      anchor: input.anchor,
      purpose: "explain",
      createdBy: "mcp"
    })
  );
  const summary = [
    `Anchor ${packet.anchor.kind}:${packet.anchor.id}`,
    `${packet.codeFacts.nodes.length} code fact node(s)`,
    `${packet.findings.length} finding(s)`,
    `${packet.projections.views.length} projection view(s)`,
    `${packet.memory.facts.length} FACT memory record(s)`
  ].join("; ");
  return PraxisMcpExplainAnchorResultSchema.parse({
    schemaVersion: "praxis.mcp.explainAnchorResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    anchor: input.anchor,
    summary,
    contextPacket: packet
  });
}
