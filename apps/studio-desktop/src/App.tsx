import { useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { ProjectIntakeReviewPage } from "./pages/ProjectIntakeReviewPage";
import { CreateProjectWizardPage } from "./pages/CreateProjectWizardPage";
import { DevelopmentGraphWorkspacePage } from "./pages/DevelopmentGraphWorkspacePage";
import { ModelSettingsPage } from "./pages/ModelSettingsPage";
import { type AppRoute, routes } from "./routes";
import { I18nProvider, type TranslationKey, useI18n } from "./i18n";
import {
  openProjectDialog,
  readGraph,
  readRecentProjects,
  recordRecentProject,
  type RecentProject,
  type RuntimeGraph,
  type RuntimeIntakeResult
} from "./runtimeClient";

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const [route, setRoute] = useState<AppRoute>("home");
  const [projectRoot, setProjectRoot] = useState("");
  const [intakeResult, setIntakeResult] = useState<RuntimeIntakeResult | null>(null);
  const [graph, setGraph] = useState<RuntimeGraph | null>(null);
  const [autoIntakeToken, setAutoIntakeToken] = useState(0);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    void refreshRecentProjects();
  }, []);

  async function refreshRecentProjects() {
    const projects = await readRecentProjects().catch(() => []);
    setRecentProjects(projects);
  }

  async function openExistingProject() {
    const selectedRoot = await openProjectDialog(t("home.openExisting"));
    if (selectedRoot) {
      setProjectRoot(selectedRoot);
      setIntakeResult(null);
      setGraph(null);
      setAutoIntakeToken(Date.now());
    }
    setRoute("project-intake");
  }

  async function openRecentProject(root: string) {
    setProjectRoot(root);
    setIntakeResult(null);
    try {
      const loadedGraph = await readGraph(root);
      setGraph(loadedGraph);
      setRecentProjects(await recordRecentProject(root).catch(() => recentProjects));
      setRoute("graph-workspace");
    } catch {
      setGraph(null);
      setAutoIntakeToken(Date.now());
      setRoute("project-intake");
    }
  }

  async function finishProjectOpen(root: string, acceptedGraph: RuntimeGraph) {
    setProjectRoot(root);
    setGraph(acceptedGraph);
    setRecentProjects(await recordRecentProject(root).catch(() => recentProjects));
    setRoute("graph-workspace");
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
        <nav className="top-nav" aria-label={t("app.primaryNav")}>
          {routes.map((item) => (
            <button
              key={item.id}
              className={route === item.id ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setRoute(item.id)}
            >
              {t(routeLabelKeys[item.id])}
            </button>
          ))}
        </nav>
        <label className="language-switch" aria-label={t("app.language")}>
          <span>{t("app.language")}</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value === "zh-CN" ? "zh-CN" : "en")}>
            <option value="en">{t("app.english")}</option>
            <option value="zh-CN">{t("app.chinese")}</option>
          </select>
        </label>
      </header>

      {route === "home" ? (
        <HomePage
          onOpenExistingProject={openExistingProject}
          onCreateNewProject={() => setRoute("create-project")}
          onOpenGraphWorkspace={() => setRoute("graph-workspace")}
          onOpenModelSettings={() => setRoute("model-settings")}
          recentProjects={recentProjects}
          onRefreshRecentProjects={refreshRecentProjects}
          onOpenRecentProject={openRecentProject}
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
            void finishProjectOpen(projectRoot, acceptedGraph);
          }}
        />
      ) : null}
      {route === "create-project" ? (
        <CreateProjectWizardPage
          onProjectCreated={(root, createdGraph) => {
            void finishProjectOpen(root, createdGraph);
          }}
        />
      ) : null}
      {route === "graph-workspace" ? <DevelopmentGraphWorkspacePage projectRoot={projectRoot} graph={graph} onGraphLoaded={setGraph} /> : null}
      {route === "model-settings" ? <ModelSettingsPage projectRoot={projectRoot} /> : null}
    </main>
  );
}

const routeLabelKeys: Record<AppRoute, TranslationKey> = {
  home: "route.home",
  "project-intake": "route.projectIntake",
  "create-project": "route.createProject",
  "graph-workspace": "route.graphWorkspace",
  "model-settings": "route.modelSettings"
};
