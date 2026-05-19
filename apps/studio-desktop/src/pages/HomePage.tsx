interface HomePageProps {
  onOpenExistingProject: () => void;
  onCreateNewProject: () => void;
  onOpenGraphWorkspace: () => void;
}

const recentProjects = [
  {
    name: "Praxis Studio",
    path: "C:/Users/VicLi/Documents/Projects/Praxis-Studio",
    status: "No confirmed graph"
  }
];

export function HomePage({ onOpenExistingProject, onCreateNewProject, onOpenGraphWorkspace }: HomePageProps) {
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
            <button className="icon-button" type="button" aria-label="Refresh recent projects">
              R
            </button>
          </div>
          <div className="recent-list">
            {recentProjects.map((project) => (
              <button className="recent-project" key={project.path} type="button" onClick={onOpenGraphWorkspace}>
                <strong>{project.name}</strong>
                <span>{project.path}</span>
                <small>{project.status}</small>
              </button>
            ))}
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
            <button className="text-button" type="button">
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
