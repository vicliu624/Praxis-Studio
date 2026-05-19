import { useState } from "react";
import { HomePage } from "./pages/HomePage";
import { ProjectIntakeReviewPage } from "./pages/ProjectIntakeReviewPage";
import { CreateProjectWizardPage } from "./pages/CreateProjectWizardPage";
import { DevelopmentGraphWorkspacePage } from "./pages/DevelopmentGraphWorkspacePage";
import { ModelSettingsPage } from "./pages/ModelSettingsPage";
import { type AppRoute, routes } from "./routes";
import { openProjectDialog, type RuntimeGraph, type RuntimeIntakeResult } from "./runtimeClient";

export function App() {
  const [route, setRoute] = useState<AppRoute>("home");
  const [projectRoot, setProjectRoot] = useState("");
  const [intakeResult, setIntakeResult] = useState<RuntimeIntakeResult | null>(null);
  const [graph, setGraph] = useState<RuntimeGraph | null>(null);
  const [autoIntakeToken, setAutoIntakeToken] = useState(0);

  async function openExistingProject() {
    const selectedRoot = await openProjectDialog();
    if (selectedRoot) {
      setProjectRoot(selectedRoot);
      setIntakeResult(null);
      setGraph(null);
      setAutoIntakeToken(Date.now());
    }
    setRoute("project-intake");
  }

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
          onOpenExistingProject={openExistingProject}
          onCreateNewProject={() => setRoute("create-project")}
          onOpenGraphWorkspace={() => setRoute("graph-workspace")}
          onOpenModelSettings={() => setRoute("model-settings")}
        />
      ) : null}
      {route === "project-intake" ? (
        <ProjectIntakeReviewPage
          projectRoot={projectRoot}
          intakeResult={intakeResult}
          onProjectRootChange={setProjectRoot}
          onIntakeResult={setIntakeResult}
          autoIntakeToken={autoIntakeToken}
          onGraphAccepted={(acceptedGraph) => {
            setGraph(acceptedGraph);
            setRoute("graph-workspace");
          }}
        />
      ) : null}
      {route === "create-project" ? <CreateProjectWizardPage /> : null}
      {route === "graph-workspace" ? <DevelopmentGraphWorkspacePage projectRoot={projectRoot} graph={graph} onGraphLoaded={setGraph} /> : null}
      {route === "model-settings" ? <ModelSettingsPage projectRoot={projectRoot} /> : null}
    </main>
  );
}
