import { useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { ProjectIntakeReviewPage } from "./pages/ProjectIntakeReviewPage";
import { CreateProjectWizardPage } from "./pages/CreateProjectWizardPage";
import { AgentWorkspacePage } from "./pages/AgentWorkspacePage";
import { ModelSettingsPage } from "./pages/ModelSettingsPage";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";
import { ModelExplorerPage } from "./pages/ModelExplorerPage";
import { DesignExplorerPage } from "./pages/DesignExplorerPage";
import { EngineeringExplorerPage } from "./pages/EngineeringExplorerPage";
import { ArchitectureExplorerPage } from "./pages/ArchitectureExplorerPage";
import { ProjectPlanPage } from "./pages/ProjectPlanPage";
import { type AppRoute, routes } from "./routes";
import { I18nProvider, type TranslationKey, useI18n } from "./i18n";
import {
  openProjectDialog,
  readStartupContext,
  readRecentProjects,
  recordRecentProject,
  type RecentProject
} from "./runtimeClient";

const praxisLogoNavMarkUrl = new URL("./assets/praxis-logo-nav-mark.svg", import.meta.url).href;

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
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [reviewFocus, setReviewFocus] = useState<{ findingId: string; token: number } | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<{ text: string; mode: "explain" | "plan"; token: number } | null>(null);
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    void refreshRecentProjects();
    void applyStartupContext();
  }, []);

  function changeProjectRoot(root: string) {
    const normalizedRoot = root.trim();
    setProjectRoot(normalizedRoot);
    setReviewFocus(null);
    setAssistantDraft(null);
  }

  async function recordActiveProject(root: string) {
    if (!root.trim()) return;
    setRecentProjects(await recordRecentProject(root).catch(() => recentProjects));
  }

  async function refreshRecentProjects() {
    const projects = await readRecentProjects().catch(() => []);
    setRecentProjects(projects);
  }

  async function applyStartupContext() {
    const startup = await readStartupContext().catch(() => null);
    if (!startup) return;
    if (startup.projectRoot) {
      changeProjectRoot(startup.projectRoot);
      await recordActiveProject(startup.projectRoot);
    }
    if (startup.route && isAppRoute(startup.route)) {
      setRoute(startup.route);
    }
  }

  async function openExistingProject() {
    const selectedRoot = await openProjectDialog(t("home.openExisting"));
    if (selectedRoot) {
      changeProjectRoot(selectedRoot);
      await recordActiveProject(selectedRoot);
      setRoute("project-intake");
    }
  }

  async function openRecentProject(root: string) {
    changeProjectRoot(root);
    await recordActiveProject(root);
    setRoute("project-intake");
  }

  async function finishProjectOpen(root: string, _acceptedGraph: unknown) {
    changeProjectRoot(root);
    await recordActiveProject(root);
    setRoute("agent-workspace");
  }

  function openReviewFinding(findingId: string) {
    setReviewFocus({ findingId, token: Date.now() });
    setRoute("review-queue");
  }

  function openAssistantDraft(text: string, mode: "explain" | "plan" = "plan") {
    setAssistantDraft({ text, mode, token: Date.now() });
    setRoute("agent-workspace");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => setRoute("home")}>
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-mark-image" src={praxisLogoNavMarkUrl} alt="" />
          </span>
          <span>
            <strong>Praxis Studio</strong>
            <small>v0.1</small>
          </span>
        </button>
        {projectRoot ? (
          <span className="header-project-chip" title={projectRoot}>
            {projectNameFromRoot(projectRoot)}
          </span>
        ) : null}
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

      <section
        className={
          route === "agent-workspace"
          || route === "project-plan"
          || route === "model-explorer"
          || route === "design-explorer"
          || route === "engineering-explorer"
          || route === "architecture-explorer"
            ? "app-content app-content-fill"
            : "app-content app-content-scroll"
        }
      >
        {route === "home" ? (
          <HomePage
            projectRoot={projectRoot}
            onOpenExistingProject={openExistingProject}
            onCreateNewProject={() => setRoute("create-project")}
            onOpenModelSettings={() => setRoute("model-settings")}
            recentProjects={recentProjects}
            onRefreshRecentProjects={refreshRecentProjects}
            onOpenRecentProject={openRecentProject}
          />
        ) : null}
        {route === "project-intake" ? (
          <ProjectIntakeReviewPage
            projectRoot={projectRoot}
          />
        ) : null}
        {route === "create-project" ? (
          <CreateProjectWizardPage
            onProjectCreated={(root, createdGraph) => {
              void finishProjectOpen(root, createdGraph);
            }}
          />
        ) : null}
        {route === "agent-workspace" && projectRoot ? (
          <AgentWorkspacePage
            projectRoot={projectRoot}
            initialDraft={assistantDraft}
            onDraftConsumed={(token) => {
              setAssistantDraft((current) => current?.token === token ? null : current);
            }}
            onNavigateToPlan={() => setRoute("project-plan")}
            onNavigateToSettings={() => setRoute("model-settings")}
            onNavigateHome={() => setRoute("home")}
          />
        ) : null}
        {route === "review-queue" ? (
          <ReviewQueuePage
            projectRoot={projectRoot}
            onProjectRootChange={changeProjectRoot}
            focusFindingId={reviewFocus?.findingId}
            focusToken={reviewFocus?.token}
          />
        ) : null}
        {route === "model-explorer" ? (
          <ModelExplorerPage
            projectRoot={projectRoot}
          />
        ) : null}
        {route === "design-explorer" ? (
          <DesignExplorerPage
            projectRoot={projectRoot}
            onProjectRootChange={changeProjectRoot}
            onOpenEngineeringViews={() => setRoute("architecture-explorer")}
          />
        ) : null}
        {route === "engineering-explorer" ? (
          <EngineeringExplorerPage
            projectRoot={projectRoot}
            onProjectRootChange={changeProjectRoot}
            onOpenDesignExplorer={() => setRoute("design-explorer")}
          />
        ) : null}
        {route === "architecture-explorer" ? (
          <ArchitectureExplorerPage
            projectRoot={projectRoot}
            onOpenDesignExplorer={() => setRoute("design-explorer")}
            onOpenEngineeringExplorer={() => setRoute("engineering-explorer")}
          />
        ) : null}
        {route === "project-plan" ? (
          <ProjectPlanPage
            projectRoot={projectRoot}
          />
        ) : null}
        {route === "model-settings" ? <ModelSettingsPage projectRoot={projectRoot} /> : null}
      </section>
    </main>
  );
}

const routeLabelKeys: Record<AppRoute, TranslationKey> = {
  home: "route.home",
  "project-intake": "route.projectIntake",
  "create-project": "route.createProject",
  "agent-workspace": "route.agentWorkspace",
  "model-explorer": "route.modelExplorer",
  "design-explorer": "route.designExplorer",
  "engineering-explorer": "route.engineeringExplorer",
  "architecture-explorer": "route.architectureExplorer",
  "review-queue": "route.reviewQueue",
  "project-plan": "route.projectPlan",
  "model-settings": "route.modelSettings"
};

function projectNameFromRoot(root: string): string {
  const normalized = normalizeProjectRootForUi(root).replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "Project";
}

function isAppRoute(value: string): value is AppRoute {
  return routes.some((route) => route.id === value);
}

function normalizeProjectRootForUi(root: string): string {
  if (root.startsWith("\\\\?\\UNC\\")) return `\\\\${root.slice("\\\\?\\UNC\\".length)}`;
  if (root.startsWith("\\\\?\\")) return root.slice("\\\\?\\".length);
  return root;
}
