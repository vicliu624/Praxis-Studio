import { useEffect, useRef, useState } from "react";
import {
  acceptGraph,
  acceptUnderstanding,
  readGraph,
  refreshProjectedGraphViews,
  runProjectIntake,
  type RuntimeGraph,
  type RuntimeIntakeResult
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface ProjectIntakeReviewPageProps {
  projectRoot: string;
  intakeResult: RuntimeIntakeResult | null;
  onProjectRootChange: (root: string) => void;
  onIntakeResult: (result: RuntimeIntakeResult) => void;
  autoIntakeToken: number;
  onGraphAccepted: (graph: RuntimeGraph) => void;
  onFoundationAccepted?: () => void;
}

type IntakeState = "idle" | "scanning" | "review" | "saving" | "done" | "error";

export function ProjectIntakeReviewPage({
  projectRoot,
  intakeResult,
  onProjectRootChange,
  onIntakeResult,
  autoIntakeToken,
  onGraphAccepted,
  onFoundationAccepted
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
      if (intakeResult.candidate) {
        await acceptGraph(projectRoot, intakeResult.candidate);
        const graph = await readGraph(projectRoot);
        onGraphAccepted(graph);
      } else {
        await acceptUnderstanding(projectRoot);
        await refreshProjectedGraphViews(projectRoot).catch(() => null);
        onFoundationAccepted?.();
      }
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  const profile = intakeResult?.profile;
  const candidate = intakeResult?.candidate;
  const summary = intakeResult?.summary;
  const architecture = intakeResult?.architecture;
  const findings = intakeResult?.findings?.findings ?? [];
  const hasFoundationIntake = Boolean(summary);
  const moduleCandidates =
    profile?.moduleCandidates.map((module) => ({
      id: module.id,
      title: module.title,
      path: module.path,
      kind: module.kind,
      confidence: module.confidence
    })) ??
    architecture?.modules.map((module) => ({
      id: module.id,
      title: module.name,
      path: module.path,
      kind: module.role,
      confidence: module.confidence ?? "medium"
    })) ??
    [];
  const reviewItems = [
    ...(candidate?.warnings.map((warning) => warning.summary) ?? []),
    ...(candidate?.unresolvedQuestions.map((question) => question.question) ?? []),
    ...(architecture?.warnings?.map((warning) => warning.summary) ?? []),
    ...findings.map((finding) => finding.summary)
  ];
  const acceptDisabled = (!candidate && !hasFoundationIntake) || state === "saving" || state === "scanning";

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
        <p className="status-text">{intakeStatusText(state, Boolean(candidate), hasFoundationIntake, summary, t)}</p>
        <p className="intake-boundary-note">{t("intake.boundaryNote")}</p>
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
              {candidate
                ? t("intake.graphCount", { nodes: candidate.graph.nodes.length, edges: candidate.graph.edges.length })
                : summary
                  ? t("intake.foundationGraphCount", { nodes: summary.codeFactNodes, edges: summary.codeFactEdges })
                  : t("intake.pendingScan")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{t("intake.moduleCandidates")}</h2>
          <span className="pill">{intakeResult ? t("intake.moduleCount", { count: moduleCandidates.length }) : t("intake.snapshotRequired")}</span>
        </div>
        <div className="table-list">
          {moduleCandidates.length ? moduleCandidates.slice(0, 18).map((module) => (
            <div className="table-row" key={module.id}>
              <strong>{module.path}</strong>
              <span>{module.kind}</span>
              <small>{module.confidence}</small>
            </div>
          )) : (
            <div className="empty-state">
              <strong>{intakeResult ? t("intake.noModules") : t("intake.noRepository")}</strong>
              <span>{intakeResult ? t("intake.noModulesCopy") : t("intake.waitingSnapshot")}</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{hasFoundationIntake && !candidate ? t("intake.foundationResult") : t("intake.graphCandidate")}</h2>
          <span className="pill">{hasFoundationIntake && !candidate ? t("intake.reviewOnly") : t("intake.candidateOnly")}</span>
        </div>
        <div className="graph-preview-list">
          {candidate ? candidate.graph.edges.slice(0, 16).map((edge) => (
            <div className="edge-preview" key={edge.id}>
              <strong>{edge.kind}</strong>
              <span>{edge.source}</span>
              <span>{edge.target}</span>
              <small>{Math.round(edge.progress * 100)}%</small>
            </div>
          )) : summary ? (
            <FoundationSummary result={intakeResult} />
          ) : (
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
          {reviewItems.slice(0, 10).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {hasFoundationIntake && !reviewItems.length ? <li>{t("intake.foundationNoWarnings")}</li> : null}
          {!candidate && !hasFoundationIntake ? <li>{t("intake.runForWarnings")}</li> : null}
        </ul>
        <button className="primary-action full-width" type="button" disabled={acceptDisabled} onClick={accept}>
          {state === "saving" ? t("intake.writing") : candidate ? t("intake.acceptGraph") : t("intake.acceptUnderstanding")}
        </button>
      </aside>
    </section>
  );
}

function FoundationSummary({ result }: { result: RuntimeIntakeResult }) {
  const { t } = useI18n();
  const summary = result.summary;
  if (!summary) return null;
  return (
    <div className="review-audit-summary">
      <Metric label={t("intake.files")} value={summary.files} />
      <Metric label={t("intake.codeFactNodes")} value={summary.codeFactNodes} />
      <Metric label={t("intake.codeFactEdges")} value={summary.codeFactEdges} />
      <Metric label={t("intake.memoryPatches")} value={summary.memoryPatches} />
      <Metric label={t("intake.modules")} value={summary.modules} />
      <Metric label={t("intake.findings")} value={summary.findings} />
      <div className="review-record">
        <strong>{t("intake.provider")}</strong>
        <span>{result.provider?.name ?? "unknown"}</span>
        <small>{result.provider?.capabilities?.join(", ") ?? result.provider?.source ?? "native"}</small>
      </div>
      <div className="review-record">
        <strong>{t("intake.cacheOutputs")}</strong>
        <span>{Object.values(result.cache ?? {}).filter(Boolean).length} files</span>
        <small>{result.next ?? ""}</small>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function intakeStatusText(
  state: IntakeState,
  hasCandidate: boolean,
  hasFoundationIntake: boolean,
  summary: RuntimeIntakeResult["summary"] | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (state === "scanning") return t("intake.statusScanning");
  if (state === "saving") return t("intake.statusSaving");
  if (state === "done") return t("intake.statusDone");
  if (state === "error") return t("intake.statusError");
  if (hasCandidate) return t("intake.statusLegacyReady");
  if (hasFoundationIntake && summary) return t("intake.statusFoundationReady", { files: summary.files, patches: summary.memoryPatches });
  return t("intake.statusIdle");
}
