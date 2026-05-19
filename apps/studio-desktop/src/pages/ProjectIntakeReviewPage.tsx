const profileRows = [
  ["Project kind", "Pending scan"],
  ["Languages", "Pending scan"],
  ["Frameworks", "Pending scan"],
  ["Modules", "Pending scan"]
];

export function ProjectIntakeReviewPage() {
  return (
    <section className="page-grid intake-layout" aria-labelledby="intake-title">
      <section className="panel">
        <p className="eyebrow">Open Existing Project</p>
        <h1 id="intake-title">Project Intake Review</h1>
        <dl className="profile-list">
          {profileRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Module Candidates</h2>
          <span className="pill">RepositorySnapshot required</span>
        </div>
        <div className="empty-state">
          <strong>No repository selected</strong>
          <span>Waiting for RepositorySnapshot</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Graph Candidate</h2>
          <span className="pill">Candidate only</span>
        </div>
        <div className="graph-placeholder">
          <span>FACT</span>
          <span>CANDIDATE</span>
          <span>INFERENCE</span>
        </div>
      </section>

      <aside className="panel review-panel">
        <h2>Review</h2>
        <ul className="review-list">
          <li>Warnings</li>
          <li>Questions</li>
          <li>Ask AI Improve</li>
          <li>Accept Graph</li>
        </ul>
        <button className="primary-action full-width" type="button" disabled>
          Accept Graph
        </button>
      </aside>
    </section>
  );
}
