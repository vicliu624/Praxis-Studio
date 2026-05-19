import type { RecentProject } from "../runtimeClient";

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
  return (
    <section className="home-layout" aria-labelledby="home-title">
      <section className="home-primary">
        <p className="eyebrow">Project Intake + Graph Agent + Controlled Coding Task MVP</p>
        <h1 id="home-title">Praxis Studio v0.1</h1>
        <div className="action-row" aria-label="Project actions">
          <button className="primary-action" type="button" onClick={onOpenExistingProject}>
            Open Existing Project
          </button>
          <button className="secondary-action" type="button" onClick={onCreateNewProject}>
            Create New Project
          </button>
        </div>
      </section>

      <section className="home-grid">
        <section className="panel recent-panel" aria-labelledby="recent-title">
          <div className="panel-heading">
            <h2 id="recent-title">Recent Projects</h2>
            <button className="icon-button" type="button" aria-label="Refresh recent projects" onClick={onRefreshRecentProjects}>
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
                <strong>No recent projects yet</strong>
                <span>Open a repository to create the first recent entry.</span>
                <small>Recent projects are stored in ~/.praxis-studio/recent-projects.json.</small>
              </button>
            )}
          </div>
        </section>

        <section className="panel status-panel" aria-labelledby="status-title">
          <h2 id="status-title">v0.1 Gates</h2>
          <ul className="gate-list">
            <li>
              <span className="gate-state active" />
              HomePage
            </li>
            <li>
              <span className="gate-state" />
              Runtime CLI
            </li>
            <li>
              <span className="gate-state" />
              Repository Scanner
            </li>
            <li>
              <span className="gate-state" />
              Graph Workspace
            </li>
          </ul>
        </section>

        <section className="panel model-panel" aria-labelledby="model-title">
          <div className="panel-heading">
            <h2 id="model-title">Model Route</h2>
            <button className="text-button" type="button" onClick={onOpenModelSettings}>
              Settings
            </button>
          </div>
          <dl className="model-list">
            <div>
              <dt>Default provider</dt>
              <dd>DeepSeek</dd>
            </div>
            <div>
              <dt>Fallback</dt>
              <dd>MockProvider</dd>
            </div>
            <div>
              <dt>Policy</dt>
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
