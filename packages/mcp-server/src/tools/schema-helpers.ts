export function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {})
  };
}

export function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

export function numberSchema(description: string): Record<string, unknown> {
  return { type: "number", minimum: 1, maximum: 500, description };
}

export function enumSchema(values: string[], description: string): Record<string, unknown> {
  return { type: "string", enum: values, description };
}

export function codeRelationInputSchema(symbolDescription: string): Record<string, unknown> {
  return objectSchema(
    {
      root: stringSchema("Optional project root override. Must resolve to the scoped MCP project root."),
      symbolId: stringSchema(symbolDescription),
      depth: { type: "number", minimum: 1, maximum: 5 },
      limit: numberSchema("Maximum number of relation nodes and edges to return.")
    },
    ["symbolId"]
  );
}

export function graphAnchorJsonSchema(): Record<string, unknown> {
  return objectSchema(
    {
      kind: enumSchema(
        [
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
        ],
        "Graph anchor kind."
      ),
      id: stringSchema("Stable graph anchor id."),
      path: stringSchema("Optional repository-relative path.")
    },
    ["kind", "id"]
  );
}
