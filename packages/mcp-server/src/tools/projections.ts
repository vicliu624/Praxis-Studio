import { readProjectedGraphViewRecords } from "@praxis/projection-engine";
import {
  PraxisMcpProjectionViewsInputSchema,
  PraxisMcpProjectionViewsResultSchema,
  type GraphAnchor,
  type ProjectedGraphView
} from "@praxis/schema";
import { enumSchema, graphAnchorJsonSchema, numberSchema, objectSchema, stringSchema } from "./schema-helpers.js";
import { resolveToolRoot } from "./shared.js";
import type { McpToolContext, McpToolDefinition } from "./types.js";

export const projectionTools: McpToolDefinition[] = [
  {
    name: "praxis_projection_views",
    description: "Read schema-valid projected graph views under .distinction/views.",
    inputSchema: objectSchema({
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      kind: enumSchema(["architecture_dependency", "architecture_component", "design_use_case_list", "design_use_case", "design_activity", "design_sequence", "design_state_machine", "design_class_collaboration", "design_pattern_map", "code_fact", "finding", "context", "task_plan", "trace", "memory"], "Optional projected graph view kind filter."),
      anchor: graphAnchorJsonSchema(),
      limit: numberSchema("Maximum number of projected graph views to return.")
    }),
    call: callProjectionViews
  }
];

async function callProjectionViews(rawInput: unknown, context: McpToolContext): Promise<unknown> {
  const input = PraxisMcpProjectionViewsInputSchema.parse(rawInput ?? {});
  const root = resolveToolRoot(context, input.root);
  const limit = input.limit ?? 20;
  let records = await readProjectedGraphViewRecords(root);
  if (input.kind) records = records.filter((record) => record.view.kind === input.kind);
  const anchor = input.anchor;
  if (anchor) records = records.filter((record) => projectedViewMatchesAnchor(record.view, anchor));

  const selected = records.slice(0, limit);
  return PraxisMcpProjectionViewsResultSchema.parse({
    schemaVersion: "praxis.mcp.projectionViewsResult.v1",
    root,
    generatedAt: new Date().toISOString(),
    views: selected.map((record) => record.view),
    truncated: records.length > limit,
    sourceViewPaths: selected.map((record) => record.path)
  });
}

function projectedViewMatchesAnchor(view: ProjectedGraphView, anchor: GraphAnchor): boolean {
  return (
    view.nodes.some((node) => graphAnchorMatches(node.anchor, anchor)) ||
    view.edges.some((edge) => graphAnchorMatches(edge.anchor, anchor)) ||
    view.annotations.some((annotation) => annotation.anchor && graphAnchorMatches(annotation.anchor, anchor))
  );
}

function graphAnchorMatches(left: GraphAnchor, right: GraphAnchor): boolean {
  return left.kind === right.kind && left.id === right.id && (!right.path || left.path === right.path);
}
