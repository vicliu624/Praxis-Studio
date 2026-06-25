export type GraphAnchorKind =
  | "file"
  | "symbol"
  | "code_fact_node"
  | "code_fact_edge"
  | "architecture_module"
  | "architecture_dependency"
  | "design_context"
  | "design_actor"
  | "design_external_system"
  | "design_use_case"
  | "design_activity"
  | "design_sequence"
  | "design_state_machine"
  | "design_class_collaboration"
  | "design_interaction_overview"
  | "design_communication"
  | "design_timing"
  | "design_object_snapshot"
  | "design_composite_structure"
  | "design_pattern"
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
