export type AppRoute =
  | "home"
  | "project-intake"
  | "create-project"
  | "agent-workspace"
  | "review-queue"
  | "projection-inspector"
  | "graph-workspace"
  | "model-settings";

export interface RouteDefinition {
  id: AppRoute;
}

export const routes: RouteDefinition[] = [
  { id: "home" },
  { id: "project-intake" },
  { id: "create-project" },
  { id: "agent-workspace" },
  { id: "review-queue" },
  { id: "projection-inspector" },
  { id: "graph-workspace" },
  { id: "model-settings" }
];
