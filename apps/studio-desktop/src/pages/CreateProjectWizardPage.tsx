import { useState } from "react";
import { runRuntimeCommand } from "../runtimeClient";

const wizardSteps = ["Product Intent", "Project Type", "Stack", "Generated Plan", "Apply"];

export function CreateProjectWizardPage() {
  const [intent, setIntent] = useState("");
  const [projectName, setProjectName] = useState("praxis-new-project");
  const [targetRoot, setTargetRoot] = useState("");
  const [projectKind, setProjectKind] = useState<"documentation-first" | "tauri-desktop-minimal">("documentation-first");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");

  async function createProject() {
    setStatus("Creating project...");
    try {
      const stdout = await runRuntimeCommand("create-project", [
        "--root",
        targetRoot,
        "--name",
        projectName,
        "--intent",
        intent,
        "--kind",
        projectKind
      ]);
      setResult(stdout);
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setStatus("");
    }
  }

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
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" className="path-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        <label htmlFor="target-root">Target directory</label>
        <input id="target-root" className="path-input" value={targetRoot} placeholder="C:/path/to/new-project" onChange={(event) => setTargetRoot(event.target.value)} />
        <label htmlFor="product-intent">Product Intent</label>
        <textarea id="product-intent" value={intent} placeholder="Describe the product intent..." onChange={(event) => setIntent(event.target.value)} />
        <div className="segmented-control" aria-label="Project type">
          <button className={projectKind === "documentation-first" ? "active" : ""} type="button" onClick={() => setProjectKind("documentation-first")}>
            Documentation-first
          </button>
          <button className={projectKind === "tauri-desktop-minimal" ? "active" : ""} type="button" onClick={() => setProjectKind("tauri-desktop-minimal")}>
            Tauri Desktop
          </button>
        </div>
        <button className="primary-action" type="button" disabled={!intent || !targetRoot || !projectName || Boolean(status)} onClick={createProject}>
          {status || "Generate Requirements / Architecture / Graph / Files"}
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
        <pre className="agent-output">{result || "Generated project result will appear here."}</pre>
      </section>
    </section>
  );
}
