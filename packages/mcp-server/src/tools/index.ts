import { codeFactTools } from "./code-facts.js";
import { contextPacketTools } from "./context-packet.js";
import { findingTools } from "./findings.js";
import { governedArtifactTools } from "./governed-artifacts.js";
import { MCP_TOOL_NAMES } from "./names.js";
import { projectionTools } from "./projections.js";
import { statusTools } from "./status.js";
import type { McpToolDefinition } from "./types.js";

export { MCP_TOOL_NAMES } from "./names.js";
export type { McpToolContext, McpToolDefinition } from "./types.js";

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  ...statusTools,
  ...codeFactTools,
  ...findingTools,
  ...projectionTools,
  ...contextPacketTools,
  ...governedArtifactTools
];

const definitionNames = MCP_TOOL_DEFINITIONS.map((tool) => tool.name);
if (definitionNames.length !== MCP_TOOL_NAMES.length || definitionNames.some((name, index) => name !== MCP_TOOL_NAMES[index])) {
  throw new Error("MCP tool catalog definitions must stay in the same order as MCP_TOOL_NAMES.");
}
