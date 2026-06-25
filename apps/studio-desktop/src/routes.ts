export type AppRoute =
  | "home"
  | "project-intake"
  | "create-project"
  | "agent-workspace"
  | "model-explorer"
  | "design-explorer"
  | "engineering-explorer"
  | "architecture-explorer"
  | "review-queue"
  | "project-plan"
  | "model-settings";

export interface RouteDefinition {
  id: AppRoute;
}

export const routes: RouteDefinition[] = [
  { id: "home" },
  { id: "project-intake" },
  { id: "create-project" },
  { id: "agent-workspace" },
  { id: "model-explorer" },
  { id: "design-explorer" },
  { id: "engineering-explorer" },
  { id: "architecture-explorer" },
  { id: "review-queue" },
  { id: "project-plan" },
  { id: "model-settings" }
];
