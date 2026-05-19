export type AppRoute = "home" | "project-intake" | "create-project" | "graph-workspace" | "model-settings";

export interface RouteDefinition {
  id: AppRoute;
}

export const routes: RouteDefinition[] = [
  { id: "home" },
  { id: "project-intake" },
  { id: "create-project" },
  { id: "graph-workspace" },
  { id: "model-settings" }
];
