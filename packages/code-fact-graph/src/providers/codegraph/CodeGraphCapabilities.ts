import type { CodeFactCapability } from "@praxis/schema";
import type { CodeGraphIndexedEdge, CodeGraphIndexedFile, CodeGraphIndexedNode } from "./CodeGraphTypes.js";

export function detectCodeGraphCapabilities(input: {
  files: CodeGraphIndexedFile[];
  nodes: CodeGraphIndexedNode[];
  edges: CodeGraphIndexedEdge[];
  hasRepositoryImportFacts: boolean;
}): CodeFactCapability[] {
  const capabilities = new Set<CodeFactCapability>();
  capabilities.add("file_structure");
  capabilities.add("imports_exports");
  if (input.nodes.some((node) => node.kind !== "file")) capabilities.add("symbols");
  if (input.edges.some((edge) => edge.kind === "calls")) capabilities.add("calls");
  if (input.edges.some((edge) => edge.kind === "references" || edge.kind === "calls")) capabilities.add("references");
  if (input.edges.some((edge) => edge.kind === "extends" || edge.kind === "implements" || edge.kind === "type_of")) {
    capabilities.add("type_relations");
  }
  if (input.edges.some((edge) => edge.kind === "impacts")) capabilities.add("impact");
  if (input.nodes.some((node) => node.kind === "route")) capabilities.add("routes");
  return Array.from(capabilities);
}
