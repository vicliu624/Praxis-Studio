import { z } from "zod";
import type { GraphAnchor } from "./graph-anchor.js";

export const GraphAnchorKindSchema = z.enum([
  "file",
  "symbol",
  "code_fact_node",
  "code_fact_edge",
  "architecture_module",
  "architecture_dependency",
  "finding",
  "task",
  "trace",
  "memory",
  "projection_node",
  "projection_edge"
]);

export const GraphAnchorSchema: z.ZodType<GraphAnchor> = z.object({
  kind: GraphAnchorKindSchema,
  id: z.string().min(1),
  path: z.string().min(1).optional()
});
