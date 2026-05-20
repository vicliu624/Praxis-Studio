import { useState } from "react";
import { createProjectFromPlan, createProjectPlan, readGraph, type NewProjectPlan, type RuntimeGraph } from "../runtimeClient";
import { useI18n } from "../i18n";

interface CreateProjectWizardPageProps {
  onProjectCreated: (root: string, graph: RuntimeGraph) => void;
}

export function CreateProjectWizardPage({ onProjectCreated }: CreateProjectWizardPageProps) {
  const { t } = useI18n();
  const [intent, setIntent] = useState("");
  const [projectName, setProjectName] = useState("praxis-new-project");
  const [targetRoot, setTargetRoot] = useState("");
  const [projectKind, setProjectKind] = useState<"documentation-first" | "tauri-desktop-minimal">("documentation-first");
  const [plan, setPlan] = useState<NewProjectPlan | null>(null);
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");
  const wizardSteps = [t("create.stepIntent"), t("create.stepGenerate"), t("create.stepReview"), t("create.stepApply"), t("create.stepWorkspace")];

  async function generatePlan() {
    setStatus("generating");
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
    setStatus("applying");
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
        <p className="eyebrow">{t("create.eyebrow")}</p>
        <h1 id="wizard-title">{t("create.title")}</h1>
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
        <label htmlFor="project-name">{t("create.projectName")}</label>
        <input id="project-name" className="path-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        <label htmlFor="target-root">{t("create.targetDirectory")}</label>
        <input id="target-root" className="path-input" value={targetRoot} placeholder={t("create.targetPlaceholder")} onChange={(event) => setTargetRoot(event.target.value)} />
        <label htmlFor="product-intent">{t("create.productIntent")}</label>
        <textarea id="product-intent" value={intent} placeholder={t("create.intentPlaceholder")} onChange={(event) => setIntent(event.target.value)} />
        <div className="segmented-control" aria-label={t("create.projectType")}>
          <button className={projectKind === "documentation-first" ? "active" : ""} type="button" onClick={() => setProjectKind("documentation-first")}>
            {t("create.documentationFirst")}
          </button>
          <button className={projectKind === "tauri-desktop-minimal" ? "active" : ""} type="button" onClick={() => setProjectKind("tauri-desktop-minimal")}>
            {t("create.tauriDesktop")}
          </button>
        </div>
        <div className="action-row">
          <button className="primary-action" type="button" disabled={!intent || !projectName || Boolean(status)} onClick={generatePlan}>
            {status === "generating" ? t("create.generating") : t("create.generatePlan")}
          </button>
          <button className="secondary-action" type="button" disabled={!plan || !targetRoot || Boolean(status)} onClick={applyPlan}>
            {status === "applying" ? t("create.applying") : t("create.applyFiles")}
          </button>
        </div>
      </section>

      <section className="panel generated-files">
        <div className="panel-heading">
          <h2>{t("create.reviewPlan")}</h2>
          <span className="pill">{plan ? t("create.fileCount", { count: plan.files.length }) : t("create.noPlan")}</span>
        </div>
        {plan ? (
          <div className="review-plan">
            <h3>{t("create.requirements")}</h3>
            <ul>
              {plan.requirements.map((requirement) => (
                <li key={requirement.id}>
                  <strong>{requirement.id}</strong>
                  <span>{requirement.title}</span>
                </li>
              ))}
            </ul>
            <h3>{t("create.architecture")}</h3>
            <ul>
              {plan.architecture.map((component) => (
                <li key={component.id}>
                  <strong>{component.id}</strong>
                  <span>{component.title}</span>
                </li>
              ))}
            </ul>
            <h3>{t("create.files")}</h3>
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
          </ul>
        )}
        <pre className="agent-output">{result || t("create.planOutput")}</pre>
      </section>
    </section>
  );
}

function activeStep(plan: NewProjectPlan | null, targetRoot: string): number {
  if (plan && targetRoot) return 2;
  if (plan) return 2;
  return 0;
}
