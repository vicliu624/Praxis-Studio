export type AppRoute = "home" | "project-intake" | "create-project" | "graph-workspace" | "model-settings";

export interface RouteDefinition {
  id: AppRoute;
  label: string;
}

export const routes: RouteDefinition[] = [
  { id: "home", label: "Home" },
  { id: "project-intake", label: "Project Intake" },
  { id: "create-project", label: "Create Project" },
  { id: "graph-workspace", label: "Development Graph" },
  { id: "model-settings", label: "Model Settings" }
];
