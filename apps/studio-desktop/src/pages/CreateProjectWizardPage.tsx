import { useState } from "react";
import { createProjectFromPlan, createProjectPlan, readGraph, type NewProjectPlan, type RuntimeGraph } from "../runtimeClient";

const wizardSteps = ["Product Intent", "Generate Plan", "Review", "Apply", "Workspace"];

interface CreateProjectWizardPageProps {
  onProjectCreated: (root: string, graph: RuntimeGraph) => void;
}

export function CreateProjectWizardPage({ onProjectCreated }: CreateProjectWizardPageProps) {
  const [intent, setIntent] = useState("");
  const [projectName, setProjectName] = useState("praxis-new-project");
  const [targetRoot, setTargetRoot] = useState("");
  const [projectKind, setProjectKind] = useState<"documentation-first" | "tauri-desktop-minimal">("documentation-first");
  const [plan, setPlan] = useState<NewProjectPlan | null>(null);
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");

  async function generatePlan() {
    setStatus("Generating plan...");
    setResult("");
    try {
      const generated = await createProjectPlan(targetRoot || ".", projectName, intent, projectKind);
      setPlan(generated);
      setResult(JSON.stringify({ requirements: generated.requirements.length, architecture: generated.architecture.length, files: generated.files.length }, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setStatus("");
    }
  }

  async function applyPlan() {
    if (!plan) return;
    setStatus("Applying project files...");
    try {
      const output = await createProjectFromPlan(targetRoot, plan);
      setResult(JSON.stringify(output, null, 2));
      const graph = await readGraph(targetRoot);
      onProjectCreated(targetRoot, graph);
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
            <li className={activeStep(plan, targetRoot) === index ? "active-step" : ""} key={step}>
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
        <div className="action-row">
          <button className="primary-action" type="button" disabled={!intent || !projectName || Boolean(status)} onClick={generatePlan}>
            {status === "Generating plan..." ? status : "Generate Plan"}
          </button>
          <button className="secondary-action" type="button" disabled={!plan || !targetRoot || Boolean(status)} onClick={applyPlan}>
            {status === "Applying project files..." ? status : "Apply Files"}
          </button>
        </div>
      </section>

      <section className="panel generated-files">
        <div className="panel-heading">
          <h2>Review Plan</h2>
          <span className="pill">{plan ? `${plan.files.length} files` : "No plan"}</span>
        </div>
        {plan ? (
          <div className="review-plan">
            <h3>Requirements</h3>
            <ul>
              {plan.requirements.map((requirement) => (
                <li key={requirement.id}>
                  <strong>{requirement.id}</strong>
                  <span>{requirement.title}</span>
                </li>
              ))}
            </ul>
            <h3>Architecture</h3>
            <ul>
              {plan.architecture.map((component) => (
                <li key={component.id}>
                  <strong>{component.id}</strong>
                  <span>{component.title}</span>
                </li>
              ))}
            </ul>
            <h3>Files</h3>
            <ul>
              {plan.files.slice(0, 12).map((file) => (
                <li key={file.path}>{file.path}</li>
              ))}
            </ul>
          </div>
        ) : (
          <ul>
            <li>README.md</li>
            <li>docs/PRODUCT_SPEC.md</li>
            <li>docs/ARCHITECTURE.md</li>
            <li>docs/ROADMAP.md</li>
            <li>.distinction/graph/nodes.json</li>
            <li>.distinction/graph/edges.json</li>
            <li>.distinction/models.yaml</li>
          </ul>
        )}
        <pre className="agent-output">{result || "Generated plan result will appear here."}</pre>
      </section>
    </section>
  );
}

function activeStep(plan: NewProjectPlan | null, targetRoot: string): number {
  if (plan && targetRoot) return 2;
  if (plan) return 2;
  return 0;
}
