import { type ReactNode, useEffect, useState } from "react";
import {
  acceptFindingStatus,
  acceptMemorySuggestion,
  openProjectDialog,
  readFindingAudit,
  readReviewQueue,
  type RuntimeGraphAnchor,
  type RuntimeFoundationReviewStatus,
  type RuntimeFindingAuditItem,
  type RuntimeFindingAuditResult,
  type RuntimeFindingStatusReviewItem,
  type RuntimeMemorySuggestionReviewItem,
  type RuntimeReviewQueueResult
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface ReviewQueuePageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  focusFindingId?: string;
  focusToken?: number;
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
}

type ReviewItemKind = "memory" | "finding";
type AuditFilter = "all" | "detected" | "reopened" | "disappeared" | "historical";

export function ReviewQueuePage({
  projectRoot,
  onProjectRootChange,
  focusFindingId,
  focusToken,
  onOpenProjectionAnchor
}: ReviewQueuePageProps) {
  const { t } = useI18n();
  const [queue, setQueue] = useState<RuntimeReviewQueueResult | null>(null);
  const [audit, setAudit] = useState<RuntimeFindingAuditResult | null>(null);
  const [includeAccepted, setIncludeAccepted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState<{ kind: ReviewItemKind; id: string } | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [selectedAuditFindingId, setSelectedAuditFindingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setQueue(null);
      setAudit(null);
      return;
    }
    void loadQueue();
  }, [projectRoot, includeAccepted]);

  useEffect(() => {
    if (!audit?.findings.length) {
      setSelectedAuditFindingId(null);
      return;
    }
    if (selectedAuditFindingId && audit.findings.some((item) => item.findingId === selectedAuditFindingId)) return;
    setSelectedAuditFindingId(audit.findings[0].findingId);
  }, [audit, selectedAuditFindingId]);

  useEffect(() => {
    if (!focusFindingId || !audit?.findings.some((item) => item.findingId === focusFindingId)) return;
    setAuditFilter("all");
    setSelectedAuditFindingId(focusFindingId);
  }, [audit, focusFindingId, focusToken]);

  async function chooseProjectRoot() {
    const selected = await openProjectDialog(t("review.openProject"));
    if (!selected) return;
    onProjectRootChange(selected);
  }

  async function loadQueue() {
    if (!projectRoot) return;
    setError("");
    setStatus(t("review.loading"));
    try {
      const [next, nextAudit] = await Promise.all([readReviewQueue(projectRoot, includeAccepted), readFindingAudit(projectRoot)]);
      setQueue(next);
      setAudit(nextAudit);
      setStatus(next.counts.total === 0 && next.foundation ? t("review.loadedFoundation") : t("review.loaded", { count: next.counts.total }));
    } catch (err) {
      setQueue(null);
      setAudit(null);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    }
  }

  async function acceptMemory(item: RuntimeMemorySuggestionReviewItem) {
    setAccepting({ kind: "memory", id: item.id });
    setError("");
    try {
      await acceptMemorySuggestion(projectRoot, item.id);
      setStatus(t("review.acceptedMemory", { id: item.id }));
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccepting(null);
    }
  }

  async function acceptFinding(item: RuntimeFindingStatusReviewItem) {
    setAccepting({ kind: "finding", id: item.id });
    setError("");
    try {
      await acceptFindingStatus(projectRoot, item.id);
      setStatus(t("review.acceptedFinding", { id: item.id }));
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccepting(null);
    }
  }

  const hasItems = Boolean(queue && (queue.memorySuggestions.length || queue.findingStatusPatches.length));
  const foundation = queue?.foundation;
  const auditItems = audit?.findings ?? [];
  const filteredAuditItems = auditItems.filter((item) => auditFilterMatches(item, auditFilter));
  const selectedAuditFinding = auditItems.find((item) => item.findingId === selectedAuditFindingId) ?? filteredAuditItems[0] ?? null;

  return (
    <section className="review-queue-layout" aria-labelledby="review-queue-title">
      <section className="panel review-queue-hero">
        <p className="eyebrow">{t("review.eyebrow")}</p>
        <h1 id="review-queue-title">{t("review.title")}</h1>
        <p className="muted-copy">{t("review.copy")}</p>
        <div className="review-project-row">
          <input
            className="path-input"
            value={projectRoot}
            placeholder={t("review.projectRootPlaceholder")}
            onChange={(event) => onProjectRootChange(event.target.value)}
          />
          <button className="secondary-action" type="button" onClick={chooseProjectRoot}>
            {t("review.browse")}
          </button>
          <button className="primary-action" type="button" disabled={!projectRoot} onClick={loadQueue}>
            {t("review.refresh")}
          </button>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeAccepted} onChange={(event) => setIncludeAccepted(event.target.checked)} />
          <span>{t("review.includeAccepted")}</span>
        </label>
        <div className="review-boundary-note">
          <div>
            <strong>{t("review.internalModelConfig")}</strong>
            <span>{t("review.internalModelConfigCopy")}</span>
          </div>
          <div>
            <strong>{t("review.externalResultQueue")}</strong>
            <span>{t("review.externalResultQueueCopy")}</span>
          </div>
        </div>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel review-queue-summary" aria-label={t("review.summary")}>
        <MetricCard label={t("review.total")} value={queue?.counts.total ?? 0} />
        <MetricCard label={t("review.memorySuggestions")} value={queue?.counts.memorySuggestions ?? 0} />
        <MetricCard label={t("review.findingStatusPatches")} value={queue?.counts.findingStatusPatches ?? 0} />
      </section>

      {foundation ? <FoundationReviewPanel foundation={foundation} /> : null}

      <section className="panel review-queue-column" aria-labelledby="review-memory-title">
        <div className="panel-heading">
          <div>
            <h2 id="review-memory-title">{t("review.memorySuggestions")}</h2>
            <p className="muted-copy">{t("review.memoryCopy")}</p>
          </div>
          <span className="pill">{queue?.memorySuggestions.length ?? 0}</span>
        </div>
        <div className="review-card-list">
          {queue?.memorySuggestions.map((item) => (
            <MemorySuggestionCard
              key={item.id}
              item={item}
              accepting={accepting?.kind === "memory" && accepting.id === item.id}
              onAccept={() => void acceptMemory(item)}
            />
          ))}
          {queue && !queue.memorySuggestions.length ? <EmptyQueue message={t("review.noMemorySuggestions")} /> : null}
        </div>
      </section>

      <section className="panel review-queue-column" aria-labelledby="review-finding-title">
        <div className="panel-heading">
          <div>
            <h2 id="review-finding-title">{t("review.findingStatusPatches")}</h2>
            <p className="muted-copy">{t("review.findingCopy")}</p>
          </div>
          <span className="pill">{queue?.findingStatusPatches.length ?? 0}</span>
        </div>
        <div className="review-card-list">
          {queue?.findingStatusPatches.map((item) => (
            <FindingStatusCard
              key={item.id}
              item={item}
              accepting={accepting?.kind === "finding" && accepting.id === item.id}
              onAccept={() => void acceptFinding(item)}
            />
          ))}
          {queue && !queue.findingStatusPatches.length ? <EmptyQueue message={t("review.noFindingPatches")} /> : null}
        </div>
      </section>

      {!projectRoot ? (
        <section className="panel review-queue-empty">
          <EmptyQueue message={t("review.noProject")} />
        </section>
      ) : !hasItems && queue ? (
        <section className="panel review-queue-empty">
          <EmptyQueue message={includeAccepted ? t("review.noItemsWithAccepted") : t("review.noExternalItemsButFoundationReady")} />
        </section>
      ) : null}

      <section className="panel review-audit-panel" aria-labelledby="review-audit-title">
        <div className="panel-heading">
          <div>
            <h2 id="review-audit-title">{t("review.auditTitle")}</h2>
            <p className="muted-copy">{t("review.auditCopy")}</p>
          </div>
          <span className="pill">{audit?.counts.findings ?? 0}</span>
        </div>
        <div className="review-audit-summary">
          <MetricCard label={t("review.auditDetected")} value={audit?.counts.currentlyDetected ?? 0} />
          <MetricCard label={t("review.auditHistorical")} value={audit?.counts.historicalOnly ?? 0} />
          <MetricCard label={t("review.auditAcceptedEvents")} value={audit?.counts.acceptedHistoryEvents ?? 0} />
        </div>
        <div className="review-filter-row" aria-label={t("review.auditFilter")}>
          {(["all", "detected", "reopened", "disappeared", "historical"] as AuditFilter[]).map((filter) => (
            <button
              key={filter}
              className={auditFilter === filter ? "text-button active-filter" : "text-button"}
              type="button"
              onClick={() => setAuditFilter(filter)}
            >
              {t(auditFilterLabelKey(filter))}
            </button>
          ))}
        </div>
        <div className="review-audit-list">
          {filteredAuditItems.map((item) => (
            <FindingAuditCard
              key={item.findingId}
              item={item}
              selected={selectedAuditFinding?.findingId === item.findingId}
              onSelect={() => setSelectedAuditFindingId(item.findingId)}
            />
          ))}
          {audit && !filteredAuditItems.length ? <EmptyQueue message={t("review.noAudit")} /> : null}
        </div>
        {selectedAuditFinding ? <FindingAuditDetail item={selectedAuditFinding} onOpenProjectionAnchor={onOpenProjectionAnchor} /> : null}
      </section>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FoundationReviewPanel({ foundation }: { foundation: RuntimeFoundationReviewStatus }) {
  const { t } = useI18n();
  const artifacts = foundation.artifacts;
  const statusLabel =
    foundation.status === "foundation_ready"
      ? t("review.foundationReady")
      : foundation.status === "understanding_pending"
        ? t("review.foundationUnderstandingPending")
        : foundation.status === "needs_intake"
          ? t("review.foundationNeedsIntake")
          : foundation.status === "not_initialized"
            ? t("review.foundationNotInitialized")
            : foundation.status;
  return (
    <section className="panel review-foundation-panel" aria-labelledby="review-foundation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("review.foundationEyebrow")}</p>
          <h2 id="review-foundation-title">{t("review.foundationTitle")}</h2>
          <p className="muted-copy">{t("review.foundationCopy")}</p>
        </div>
        <span className={foundation.status === "foundation_ready" ? "pill success" : "pill"}>{statusLabel}</span>
      </div>
      <div className="review-foundation-grid">
        <FoundationArtifactCard
          title={t("review.repositorySnapshot")}
          exists={artifacts.repositorySnapshot.exists}
          path={artifacts.repositorySnapshot.path}
          metrics={[{ label: t("review.files"), value: numberOrDash(artifacts.repositorySnapshot.files) }]}
        />
        <FoundationArtifactCard
          title={t("review.codeFacts")}
          exists={artifacts.codeFacts.exists}
          path={artifacts.codeFacts.path}
          subtitle={[
            artifacts.codeFacts.provider?.source,
            artifacts.codeFacts.provider?.capabilities?.length ? `${artifacts.codeFacts.provider.capabilities.length} ${t("review.capabilities")}` : undefined
          ].filter(Boolean).join(" / ")}
          metrics={[
            { label: t("review.files"), value: numberOrDash(artifacts.codeFacts.files) },
            { label: t("review.nodes"), value: numberOrDash(artifacts.codeFacts.nodes) },
            { label: t("review.edges"), value: numberOrDash(artifacts.codeFacts.edges) },
            { label: t("review.warnings"), value: numberOrDash(artifacts.codeFacts.warnings) }
          ]}
        />
        <FoundationArtifactCard
          title={t("review.projectProfile")}
          exists={artifacts.projectProfile.exists}
          path={artifacts.projectProfile.path}
          subtitle={joinPreview([...artifacts.projectProfile.projectKinds, ...artifacts.projectProfile.languages, ...artifacts.projectProfile.frameworks])}
          metrics={[
            { label: t("review.languages"), value: artifacts.projectProfile.languages.length },
            { label: t("review.frameworks"), value: artifacts.projectProfile.frameworks.length }
          ]}
        />
        <FoundationArtifactCard
          title={t("review.repositoryUnderstanding")}
          exists={artifacts.repositoryUnderstanding.exists}
          path={artifacts.repositoryUnderstanding.path}
          subtitle={artifacts.repositoryUnderstanding.pendingAcceptance ? t("review.pendingAcceptance") : t("review.acceptedOrNoPending")}
          metrics={[
            { label: t("review.memoryPatches"), value: numberOrDash(artifacts.repositoryUnderstanding.memoryPatches) },
            { label: t("review.questions"), value: numberOrDash(artifacts.repositoryUnderstanding.reviewQuestions) },
            { label: t("review.warnings"), value: numberOrDash(artifacts.repositoryUnderstanding.warnings) }
          ]}
        />
        <FoundationArtifactCard
          title={t("review.factMemory")}
          exists={artifacts.factMemory.exists}
          path={artifacts.factMemory.path}
          metrics={[{ label: t("review.records"), value: numberOrDash(artifacts.factMemory.records) }]}
        />
        <FoundationArtifactCard
          title={t("review.architectureModel")}
          exists={artifacts.architectureModel.exists}
          path={artifacts.architectureModel.path}
          metrics={[
            { label: t("review.modules"), value: numberOrDash(artifacts.architectureModel.modules) },
            { label: t("review.dependencies"), value: numberOrDash(artifacts.architectureModel.dependencies) },
            { label: t("review.warnings"), value: numberOrDash(artifacts.architectureModel.warnings) }
          ]}
        />
        <FoundationArtifactCard
          title={t("review.findings")}
          exists={artifacts.findings.exists}
          path={artifacts.findings.path}
          subtitle={joinPreview(artifacts.findings.detectorIds)}
          metrics={[{ label: t("review.findingsDetected"), value: numberOrDash(artifacts.findings.detected) }]}
        />
        <FoundationArtifactCard
          title={t("review.projections")}
          exists={artifacts.projections.exists}
          path={artifacts.projections.path}
          subtitle={joinPreview(artifacts.projections.kinds)}
          metrics={[
            { label: t("review.views"), value: numberOrDash(artifacts.projections.schemaValidViews) },
            { label: t("review.freshViews"), value: numberOrDash(artifacts.projections.freshViews) },
            { label: t("review.failedViews"), value: numberOrDash(artifacts.projections.failedViews) }
          ]}
        />
      </div>
      <div className="review-foundation-next">
        <h3>{t("review.nextActions")}</h3>
        <div className="review-next-action-list">
          {foundation.nextActions.map((action) => (
            <span key={action}>{action}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FoundationArtifactCard({
  title,
  exists,
  path,
  subtitle,
  metrics
}: {
  title: string;
  exists: boolean;
  path?: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string | number }>;
}) {
  const { t } = useI18n();
  return (
    <article className={exists ? "review-foundation-card ready" : "review-foundation-card missing"}>
      <div className="review-card-header">
        <strong>{title}</strong>
        <span className={exists ? "pill success" : "pill"}>{exists ? t("review.exists") : t("review.missing")}</span>
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
      {path ? <small>{path}</small> : null}
      <dl className="review-foundation-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function MemorySuggestionCard({
  item,
  accepting,
  onAccept
}: {
  item: RuntimeMemorySuggestionReviewItem;
  accepting: boolean;
  onAccept: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className={item.acceptedAt ? "review-card accepted" : "review-card"}>
      <div className="review-card-header">
        <span className="pill">MemorySuggestionPatch</span>
        <small>{item.acceptedAt ? t("review.acceptedAt", { time: formatDate(item.acceptedAt) }) : t("review.pending")}</small>
      </div>
      <h3>{item.summary}</h3>
      <dl className="review-meta-grid">
        <div>
          <dt>{t("review.sourceTask")}</dt>
          <dd>{item.sourceTaskId ?? "-"}</dd>
        </div>
        <div>
          <dt>{t("review.records")}</dt>
          <dd>{item.memoryPatchCount}</dd>
        </div>
        <div>
          <dt>{t("review.path")}</dt>
          <dd>{item.path}</dd>
        </div>
      </dl>
      <div className="review-record-list">
        {item.records.slice(0, 3).map((record) => (
          <div className="review-record" key={record.patchId}>
            <strong>{record.type}</strong>
            <span>{record.subject} / {record.predicate}</span>
            <small>{record.summary}</small>
          </div>
        ))}
      </div>
      <button className="primary-action full-width" type="button" disabled={Boolean(item.acceptedAt) || accepting} onClick={onAccept}>
        {accepting ? t("review.accepting") : t("review.acceptMemory")}
      </button>
    </article>
  );
}

function FindingStatusCard({
  item,
  accepting,
  onAccept
}: {
  item: RuntimeFindingStatusReviewItem;
  accepting: boolean;
  onAccept: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className={item.acceptedAt ? "review-card accepted" : "review-card"}>
      <div className="review-card-header">
        <span className="pill">FindingStatusPatch</span>
        <small>{item.acceptedAt ? t("review.acceptedAt", { time: formatDate(item.acceptedAt) }) : t("review.pending")}</small>
      </div>
      <h3>{item.summary}</h3>
      <dl className="review-meta-grid">
        <div>
          <dt>{t("review.finding")}</dt>
          <dd>{item.findingId}</dd>
        </div>
        <div>
          <dt>{t("review.status")}</dt>
          <dd>{item.status}</dd>
        </div>
        <div>
          <dt>{t("review.path")}</dt>
          <dd>{item.path}</dd>
        </div>
      </dl>
      {item.rationale ? <p className="review-rationale">{item.rationale}</p> : null}
      <button className="primary-action full-width" type="button" disabled={Boolean(item.acceptedAt) || accepting} onClick={onAccept}>
        {accepting ? t("review.accepting") : t("review.acceptFinding")}
      </button>
    </article>
  );
}

function FindingAuditCard({
  item,
  selected,
  onSelect
}: {
  item: RuntimeFindingAuditItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const acceptedHistory = item.history.filter((entry) => entry.acceptedAt);
  const latest =
    acceptedHistory.length > 0
      ? acceptedHistory[acceptedHistory.length - 1]
      : item.history.length > 0
        ? item.history[item.history.length - 1]
        : undefined;
  return (
    <article className={selected ? "review-audit-card selected" : "review-audit-card"}>
      <div className="review-card-header">
        <span className="pill">{stateLabel(item.detectorState)}</span>
        <small>{item.currentlyDetected ? t("review.auditCurrentlyDetected") : t("review.auditHistoricalOnly")}</small>
      </div>
      <h3>{item.currentTitle ?? item.findingId}</h3>
      {item.currentSummary ? <p className="review-rationale">{item.currentSummary}</p> : null}
      <dl className="review-meta-grid">
        <div>
          <dt>{t("review.finding")}</dt>
          <dd>{item.findingId}</dd>
        </div>
        <div>
          <dt>{t("review.status")}</dt>
          <dd>{item.currentStatus ?? item.latestAcceptedStatus ?? "-"}</dd>
        </div>
        <div>
          <dt>{t("review.auditLastAccepted")}</dt>
          <dd>{item.latestAcceptedAt ? formatDate(item.latestAcceptedAt) : "-"}</dd>
        </div>
      </dl>
      {latest ? (
        <div className="review-record">
          <strong>{latest.status}</strong>
          <span>{latest.patchId}</span>
          <small>{latest.summary}</small>
        </div>
      ) : null}
      <div className="review-audit-timeline">
        {item.traces.slice(-3).map((trace) => (
          <div key={trace.id}>
            <span>{formatDate(trace.timestamp)}</span>
            <strong>{trace.kind}</strong>
            <small>{trace.summary}</small>
          </div>
        ))}
      </div>
      <button className="text-button" type="button" onClick={onSelect}>
        {selected ? t("review.auditSelected") : t("review.auditViewDetails")}
      </button>
    </article>
  );
}

function FindingAuditDetail({
  item,
  onOpenProjectionAnchor
}: {
  item: RuntimeFindingAuditItem;
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="review-audit-detail" aria-labelledby="review-audit-detail-title">
      <div className="panel-heading tight">
        <div>
          <h2 id="review-audit-detail-title">{t("review.auditDetail")}</h2>
          <p className="muted-copy">{item.findingId}</p>
        </div>
        <div className="action-row">
          {onOpenProjectionAnchor ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => onOpenProjectionAnchor({ kind: "finding", id: item.findingId })}
            >
              {t("review.openInProjection")}
            </button>
          ) : null}
          <span className="pill">{stateLabel(item.detectorState)}</span>
        </div>
      </div>
      <div className="review-detail-grid">
        <DetailColumn title={t("review.auditPatchHistory")}>
          {item.history.length ? (
            item.history.map((entry) => (
              <div className="review-detail-entry" key={entry.patchId}>
                <strong>{entry.status}</strong>
                <span>{entry.patchId}</span>
                <small>{entry.acceptedAt ? t("review.acceptedAt", { time: formatDate(entry.acceptedAt) }) : t("review.pending")}</small>
                <p>{entry.summary}</p>
                {entry.rationale ? <p>{entry.rationale}</p> : null}
              </div>
            ))
          ) : (
            <EmptyQueue message={t("review.auditNoPatchHistory")} />
          )}
        </DetailColumn>
        <DetailColumn title={t("review.auditMemoryRecords")}>
          {item.memoryRecords.length ? (
            item.memoryRecords.map((record) => (
              <div className="review-detail-entry" key={record.id}>
                <strong>{record.status ?? "-"}</strong>
                <span>{record.id}</span>
                <small>{formatDate(record.createdAt)}</small>
                <p>{record.summary}</p>
              </div>
            ))
          ) : (
            <EmptyQueue message={t("review.auditNoMemory")} />
          )}
        </DetailColumn>
        <DetailColumn title={t("review.auditTraceTimeline")}>
          {item.traces.length ? (
            item.traces.map((trace) => (
              <div className="review-detail-entry" key={trace.id}>
                <strong>{trace.kind}</strong>
                <span>{trace.id}</span>
                <small>{formatDate(trace.timestamp)}</small>
                <p>{trace.summary}</p>
              </div>
            ))
          ) : (
            <EmptyQueue message={t("review.auditNoTrace")} />
          )}
        </DetailColumn>
      </div>
    </section>
  );
}

function DetailColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="review-detail-column">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <div className="empty-state compact">
      <strong>{message}</strong>
    </div>
  );
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function auditFilterMatches(item: RuntimeFindingAuditItem, filter: AuditFilter): boolean {
  if (filter === "all") return true;
  if (filter === "detected") return item.currentlyDetected;
  if (filter === "reopened") return item.detectorState === "reopened";
  if (filter === "disappeared") return item.detectorState === "disappeared_after_reconciliation";
  return !item.currentlyDetected;
}

function auditFilterLabelKey(filter: AuditFilter) {
  if (filter === "all") return "review.auditFilterAll";
  if (filter === "detected") return "review.auditFilterDetected";
  if (filter === "reopened") return "review.auditFilterReopened";
  if (filter === "disappeared") return "review.auditFilterDisappeared";
  return "review.auditFilterHistorical";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function numberOrDash(value: number | undefined): string | number {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function joinPreview(values: string[]): string {
  const filtered = values.filter(Boolean);
  if (!filtered.length) return "";
  const visible = filtered.slice(0, 5).join(" / ");
  return filtered.length > 5 ? `${visible} +${filtered.length - 5}` : visible;
}
