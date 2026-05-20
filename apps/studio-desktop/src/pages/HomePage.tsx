import type { RecentProject } from "../runtimeClient";
import { useI18n } from "../i18n";

interface HomePageProps {
  onOpenExistingProject: () => void;
  onCreateNewProject: () => void;
  onOpenGraphWorkspace: () => void;
  onOpenModelSettings: () => void;
  recentProjects: RecentProject[];
  onRefreshRecentProjects: () => void;
  onOpenRecentProject: (root: string) => void;
}

export function HomePage({
  onOpenExistingProject,
  onCreateNewProject,
  onOpenGraphWorkspace,
  onOpenModelSettings,
  recentProjects,
  onRefreshRecentProjects,
  onOpenRecentProject
}: HomePageProps) {
  const { t } = useI18n();

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
                <button className="recent-project" type="button" key={project.root} onClick={() => onOpenRecentProject(project.root)}>
                  <strong>{project.name}</strong>
                  <span>{project.root}</span>
                  <small>{formatRecentTime(project.lastOpenedAt)}</small>
                </button>
              ))
            ) : (
              <button className="recent-project" type="button" onClick={onOpenGraphWorkspace}>
                <strong>{t("home.noRecentTitle")}</strong>
                <span>{t("home.noRecentDescription")}</span>
                <small>{t("home.noRecentStorage")}</small>
              </button>
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
