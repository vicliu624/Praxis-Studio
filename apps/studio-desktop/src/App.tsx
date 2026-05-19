import { useState } from "react";
import { HomePage } from "./pages/HomePage";
import { ProjectIntakeReviewPage } from "./pages/ProjectIntakeReviewPage";
import { CreateProjectWizardPage } from "./pages/CreateProjectWizardPage";
import { DevelopmentGraphWorkspacePage } from "./pages/DevelopmentGraphWorkspacePage";
import { type AppRoute, routes } from "./routes";

export function App() {
  const [route, setRoute] = useState<AppRoute>("home");

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => setRoute("home")}>
          <span className="brand-mark">P</span>
          <span>
            <strong>Praxis Studio</strong>
            <small>v0.1</small>
          </span>
        </button>
        <nav className="top-nav" aria-label="Primary">
          {routes.map((item) => (
            <button
              key={item.id}
              className={route === item.id ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setRoute(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {route === "home" ? (
        <HomePage
          onOpenExistingProject={() => setRoute("project-intake")}
          onCreateNewProject={() => setRoute("create-project")}
          onOpenGraphWorkspace={() => setRoute("graph-workspace")}
        />
      ) : null}
      {route === "project-intake" ? <ProjectIntakeReviewPage /> : null}
      {route === "create-project" ? <CreateProjectWizardPage /> : null}
      {route === "graph-workspace" ? <DevelopmentGraphWorkspacePage /> : null}
    </main>
  );
}
