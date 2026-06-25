import type { PraxisMcpToolName } from "@praxis/schema";

export interface JsonSchema<T> {
  parse(value: unknown): T;
}

export interface McpToolContext {
  root: string;
}

export interface McpToolDefinition {
  name: PraxisMcpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (rawInput: unknown, context: McpToolContext) => Promise<unknown>;
}
