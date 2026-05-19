export function DevelopmentGraphWorkspacePage() {
  return (
    <section className="workspace-layout" aria-labelledby="workspace-title">
      <aside className="panel outline-panel">
        <p className="eyebrow">Development Graph</p>
        <h1 id="workspace-title">Workspace</h1>
        <div className="empty-state compact">
          <strong>No confirmed graph</strong>
          <span>Open a project or create one first.</span>
        </div>
      </aside>

      <section className="panel graph-workspace-panel">
        <div className="graph-empty">
          <div className="graph-empty-node">Project</div>
          <div className="graph-empty-node muted">Node</div>
          <div className="graph-empty-edge">edge progress</div>
        </div>
      </section>

      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <h2>Inspector</h2>
          <span className="pill">Target-bound</span>
        </div>
        <div className="mode-row" aria-label="Agent mode">
          <button className="active" type="button">
            Explain
          </button>
          <button type="button">Plan</button>
          <button type="button">Apply</button>
        </div>
        <textarea placeholder="Ask about the selected node or edge..." />
        <button className="primary-action full-width" type="button" disabled>
          Send
        </button>
      </aside>
    </section>
  );
}
