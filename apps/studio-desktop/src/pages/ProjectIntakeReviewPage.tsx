import { useEffect, useRef, useState } from "react";
import { acceptGraph, readGraph, runProjectIntake, type RuntimeGraph, type RuntimeIntakeResult } from "../runtimeClient";
import { useI18n } from "../i18n";

interface ProjectIntakeReviewPageProps {
  projectRoot: string;
  intakeResult: RuntimeIntakeResult | null;
  onProjectRootChange: (root: string) => void;
  onIntakeResult: (result: RuntimeIntakeResult) => void;
  autoIntakeToken: number;
  onGraphAccepted: (graph: RuntimeGraph) => void;
}

type IntakeState = "idle" | "scanning" | "review" | "saving" | "done" | "error";

export function ProjectIntakeReviewPage({
  projectRoot,
  intakeResult,
  onProjectRootChange,
  onIntakeResult,
  autoIntakeToken,
  onGraphAccepted
}: ProjectIntakeReviewPageProps) {
  const [state, setState] = useState<IntakeState>(intakeResult ? "review" : "idle");
  const [error, setError] = useState("");
  const lastAutoIntakeToken = useRef(0);
  const { t } = useI18n();

  useEffect(() => {
    if (!autoIntakeToken || autoIntakeToken === lastAutoIntakeToken.current || !projectRoot) return;
    lastAutoIntakeToken.current = autoIntakeToken;
    void runIntake();
  }, [autoIntakeToken, projectRoot]);

  async function runIntake() {
    setState("scanning");
    setError("");
    try {
      const result = await runProjectIntake(projectRoot);
      onIntakeResult(result);
      setState("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  async function accept() {
    if (!intakeResult) return;
    setState("saving");
    setError("");
    try {
      await acceptGraph(projectRoot, intakeResult.candidate);
      const graph = await readGraph(projectRoot);
      onGraphAccepted(graph);
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  const profile = intakeResult?.profile;
  const candidate = intakeResult?.candidate;

  return (
    <section className="page-grid intake-layout" aria-labelledby="intake-title">
      <section className="panel">
        <p className="eyebrow">{t("intake.eyebrow")}</p>
        <h1 id="intake-title">{t("intake.title")}</h1>
        <label htmlFor="project-root">{t("intake.projectRoot")}</label>
        <input
          id="project-root"
          className="path-input"
          value={projectRoot}
          placeholder={t("intake.projectRootPlaceholder")}
          onChange={(event) => onProjectRootChange(event.target.value)}
        />
        <button className="primary-action full-width" type="button" onClick={runIntake} disabled={!projectRoot || state === "scanning"}>
          {state === "scanning" ? t("intake.scanning") : t("intake.scan")}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <dl className="profile-list">
          <div>
            <dt>{t("intake.projectKind")}</dt>
            <dd>{profile?.projectKinds.join(", ") ?? t("intake.pendingScan")}</dd>
          </div>
          <div>
            <dt>{t("intake.languages")}</dt>
            <dd>{profile?.languages.join(", ") ?? t("intake.pendingScan")}</dd>
          </div>
          <div>
            <dt>{t("intake.frameworks")}</dt>
            <dd>{profile?.frameworks.join(", ") ?? t("intake.pendingScan")}</dd>
          </div>
          <div>
            <dt>{t("intake.graph")}</dt>
            <dd>
              {candidate ? t("intake.graphCount", { nodes: candidate.graph.nodes.length, edges: candidate.graph.edges.length }) : t("intake.pendingScan")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{t("intake.moduleCandidates")}</h2>
          <span className="pill">{profile ? t("intake.moduleCount", { count: profile.moduleCandidates.length }) : t("intake.snapshotRequired")}</span>
        </div>
        <div className="table-list">
          {profile?.moduleCandidates.slice(0, 18).map((module) => (
            <div className="table-row" key={module.id}>
              <strong>{module.path}</strong>
              <span>{module.kind}</span>
              <small>{module.confidence}</small>
            </div>
          )) ?? (
            <div className="empty-state">
              <strong>{t("intake.noRepository")}</strong>
              <span>{t("intake.waitingSnapshot")}</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{t("intake.graphCandidate")}</h2>
          <span className="pill">{t("intake.candidateOnly")}</span>
        </div>
        <div className="graph-preview-list">
          {candidate?.graph.edges.slice(0, 16).map((edge) => (
            <div className="edge-preview" key={edge.id}>
              <strong>{edge.kind}</strong>
              <span>{edge.source}</span>
              <span>{edge.target}</span>
              <small>{Math.round(edge.progress * 100)}%</small>
            </div>
          )) ?? (
            <div className="graph-placeholder">
              <span>FACT</span>
              <span>CANDIDATE</span>
              <span>INFERENCE</span>
            </div>
          )}
        </div>
      </section>

      <aside className="panel review-panel">
        <h2>{t("intake.review")}</h2>
        <ul className="review-list">
          {(candidate?.warnings.slice(0, 8) ?? []).map((warning) => (
            <li key={warning.id}>{warning.summary}</li>
          ))}
          {(candidate?.unresolvedQuestions.slice(0, 5) ?? []).map((question) => (
            <li key={question.id}>{question.question}</li>
          ))}
          {!candidate ? <li>{t("intake.runForWarnings")}</li> : null}
        </ul>
        <button className="primary-action full-width" type="button" disabled={!candidate || state === "saving"} onClick={accept}>
          {state === "saving" ? t("intake.writing") : t("intake.acceptGraph")}
        </button>
      </aside>
    </section>
  );
}
