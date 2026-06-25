import type { RecentProject } from "../runtimeClient";
import { useI18n } from "../i18n";

interface HomePageProps {
  projectRoot: string;
  onOpenExistingProject: () => void;
  onCreateNewProject: () => void;
  onOpenModelSettings: () => void;
  recentProjects: RecentProject[];
  onRefreshRecentProjects: () => void;
  onOpenRecentProject: (root: string) => void;
}

export function HomePage({
  projectRoot,
  onOpenExistingProject,
  onCreateNewProject,
  onOpenModelSettings,
  recentProjects,
  onRefreshRecentProjects,
  onOpenRecentProject
}: HomePageProps) {
  const { t } = useI18n();
  const currentProjectName = projectRoot ? projectNameFromRoot(projectRoot) : "";

  return (
    <section className="home-layout" aria-labelledby="home-title">
      <section className="home-primary">
        <p className="eyebrow">{t("home.eyebrow")}</p>
        <h1 id="home-title">{t("home.title")}</h1>
        <div className="action-row" aria-label={t("home.eyebrow")}>
          <button className="primary-action" type="button" onClick={onOpenExistingProject}>
            {t("home.openExisting")}
          </button>
          <button className="secondary-action" type="button" onClick={onCreateNewProject}>
            {t("home.createNew")}
          </button>
        </div>
        {projectRoot ? (
          <div className="current-project-card" aria-label={t("home.currentProject")}>
            <span>{t("home.currentProject")}</span>
            <strong>{currentProjectName}</strong>
            <code>{projectRoot}</code>
          </div>
        ) : null}
      </section>

      <section className="home-grid">
        <section className="panel recent-panel" aria-labelledby="recent-title">
          <div className="panel-heading">
            <h2 id="recent-title">{t("home.recentProjects")}</h2>
            <button className="icon-button" type="button" aria-label={t("home.refreshRecent")} onClick={onRefreshRecentProjects}>
              R
            </button>
          </div>
          <div className="recent-list">
            {recentProjects.length ? (
              recentProjects.map((project) => (
                <button
                  className={sameRoot(project.root, projectRoot) ? "recent-project active" : "recent-project"}
                  type="button"
                  key={project.root}
                  onClick={() => onOpenRecentProject(project.root)}
                >
                  <span className="recent-project-topline">
                    <strong className="recent-project-name">{project.name || projectNameFromRoot(project.root)}</strong>
                    {sameRoot(project.root, projectRoot) ? <span className="project-badge">{t("home.currentBadge")}</span> : null}
                  </span>
                  <span className="recent-project-path">{project.root}</span>
                  <small>{project.lastOpenedAt ? formatRecentTime(project.lastOpenedAt) : t("home.openedUnknown")}</small>
                </button>
              ))
            ) : (
              <div className="recent-empty-state">
                <strong>{t("home.noRecentTitle")}</strong>
                <span>{t("home.noRecentDescription")}</span>
                <small>{t("home.noRecentStorage")}</small>
                <button className="secondary-action compact-action" type="button" onClick={onOpenExistingProject}>
                  {t("home.openExisting")}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="panel status-panel" aria-labelledby="status-title">
          <h2 id="status-title">{t("home.gates")}</h2>
          <ul className="gate-list">
            <li>
              <span className="gate-state active" />
              {t("home.gateHome")}
            </li>
            <li>
              <span className="gate-state" />
              {t("home.gateRuntime")}
            </li>
            <li>
              <span className="gate-state" />
              {t("home.gateScanner")}
            </li>
            <li>
              <span className="gate-state" />
              {t("home.gateWorkspace")}
            </li>
          </ul>
        </section>

        <section className="panel model-panel" aria-labelledby="model-title">
          <div className="panel-heading">
            <h2 id="model-title">{t("home.modelRoute")}</h2>
            <button className="text-button" type="button" onClick={onOpenModelSettings}>
              {t("home.settings")}
            </button>
          </div>
          <dl className="model-list">
            <div>
              <dt>{t("home.defaultProvider")}</dt>
              <dd>DeepSeek</dd>
            </div>
            <div>
              <dt>{t("home.fallback")}</dt>
              <dd>None</dd>
            </div>
            <div>
              <dt>{t("home.policy")}</dt>
              <dd>Explain &gt; Plan &gt; Apply</dd>
            </div>
          </dl>
        </section>
      </section>
    </section>
  );
}

function formatRecentTime(value: string): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return new Date(numeric).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function projectNameFromRoot(root: string): string {
  const normalized = normalizeProjectRootForUi(root).replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "Project";
}

function sameRoot(left: string, right: string): boolean {
  return normalizeRoot(left) === normalizeRoot(right);
}

function normalizeRoot(root: string): string {
  return normalizeProjectRootForUi(root).replace(/[\\/]+$/, "").toLowerCase();
}

function normalizeProjectRootForUi(root: string): string {
  if (root.startsWith("\\\\?\\UNC\\")) return `\\\\${root.slice("\\\\?\\UNC\\".length)}`;
  if (root.startsWith("\\\\?\\")) return root.slice("\\\\?\\".length);
  return root;
}
