const wizardSteps = [
  "Product Intent",
  "Project Type",
  "Stack",
  "Generated Plan",
  "Apply"
];

export function CreateProjectWizardPage() {
  return (
    <section className="wizard-layout" aria-labelledby="wizard-title">
      <aside className="panel wizard-steps">
        <p className="eyebrow">Create New Project</p>
        <h1 id="wizard-title">Project Wizard</h1>
        <ol>
          {wizardSteps.map((step, index) => (
            <li className={index === 0 ? "active-step" : ""} key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </aside>

      <section className="panel intent-panel">
        <label htmlFor="product-intent">Product Intent</label>
        <textarea id="product-intent" placeholder="Describe the product intent..." />
        <div className="segmented-control" aria-label="Project type">
          <button className="active" type="button">
            Documentation-first
          </button>
          <button type="button">Tauri Desktop</button>
        </div>
        <button className="primary-action" type="button" disabled>
          Generate Requirements
        </button>
      </section>

      <section className="panel generated-files">
        <h2>Required Output</h2>
        <ul>
          <li>README.md</li>
          <li>docs/PRODUCT_SPEC.md</li>
          <li>docs/ARCHITECTURE.md</li>
          <li>docs/ROADMAP.md</li>
          <li>.distinction/graph/nodes.json</li>
          <li>.distinction/graph/edges.json</li>
          <li>.distinction/models.yaml</li>
        </ul>
      </section>
    </section>
  );
}
