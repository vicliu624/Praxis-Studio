import { useState } from "react";
import { acceptGraph, readGraph, runProjectIntake, type RuntimeGraph, type RuntimeIntakeResult } from "../runtimeClient";

interface ProjectIntakeReviewPageProps {
  projectRoot: string;
  intakeResult: RuntimeIntakeResult | null;
  onProjectRootChange: (root: string) => void;
  onIntakeResult: (result: RuntimeIntakeResult) => void;
  onGraphAccepted: (graph: RuntimeGraph) => void;
}

type IntakeState = "idle" | "scanning" | "review" | "saving" | "done" | "error";

export function ProjectIntakeReviewPage({
  projectRoot,
  intakeResult,
  onProjectRootChange,
  onIntakeResult,
  onGraphAccepted
}: ProjectIntakeReviewPageProps) {
  const [state, setState] = useState<IntakeState>(intakeResult ? "review" : "idle");
  const [error, setError] = useState("");

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
        <p className="eyebrow">Open Existing Project</p>
        <h1 id="intake-title">Project Intake Review</h1>
        <label htmlFor="project-root">Project root</label>
        <input
          id="project-root"
          className="path-input"
          value={projectRoot}
          placeholder="C:/path/to/repository"
          onChange={(event) => onProjectRootChange(event.target.value)}
        />
        <button className="primary-action full-width" type="button" onClick={runIntake} disabled={!projectRoot || state === "scanning"}>
          {state === "scanning" ? "Scanning..." : "Scan / Profile / Generate Graph"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <dl className="profile-list">
          <div>
            <dt>Project kind</dt>
            <dd>{profile?.projectKinds.join(", ") ?? "Pending scan"}</dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd>{profile?.languages.join(", ") ?? "Pending scan"}</dd>
          </div>
          <div>
            <dt>Frameworks</dt>
            <dd>{profile?.frameworks.join(", ") ?? "Pending scan"}</dd>
          </div>
          <div>
            <dt>Graph</dt>
            <dd>{candidate ? `${candidate.graph.nodes.length} nodes / ${candidate.graph.edges.length} edges` : "Pending scan"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Module Candidates</h2>
          <span className="pill">{profile ? `${profile.moduleCandidates.length} modules` : "RepositorySnapshot required"}</span>
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
              <strong>No repository selected</strong>
              <span>Waiting for RepositorySnapshot</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Graph Candidate</h2>
          <span className="pill">Candidate only</span>
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
        <h2>Review</h2>
        <ul className="review-list">
          {(candidate?.warnings.slice(0, 8) ?? []).map((warning) => (
            <li key={warning.id}>{warning.summary}</li>
          ))}
          {(candidate?.unresolvedQuestions.slice(0, 5) ?? []).map((question) => (
            <li key={question.id}>{question.question}</li>
          ))}
          {!candidate ? <li>Run intake to see warnings and questions.</li> : null}
        </ul>
        <button className="primary-action full-width" type="button" disabled={!candidate || state === "saving"} onClick={accept}>
          {state === "saving" ? "Writing .distinction..." : "Accept Graph"}
        </button>
      </aside>
    </section>
  );
}
