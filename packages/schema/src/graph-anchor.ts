export type GraphAnchorKind =
  | "file"
  | "symbol"
  | "code_fact_node"
  | "code_fact_edge"
  | "architecture_module"
  | "architecture_dependency"
  | "finding"
  | "task"
  | "trace"
  | "memory"
  | "projection_node"
  | "projection_edge";

export interface GraphAnchor {
  kind: GraphAnchorKind;
  id: string;
  path?: string;
}
