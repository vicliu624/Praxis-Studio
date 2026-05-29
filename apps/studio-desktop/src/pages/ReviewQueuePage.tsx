import { type ReactNode, useEffect, useState } from "react";
import {
  acceptFindingStatus,
  acceptMemorySuggestion,
  openProjectDialog,
  readFindingAudit,
  readQualityReviewProgress,
  readReviewQueue,
  refreshReviewFinding,
  startQualityReview,
  type RuntimeGraphAnchor,
  type RuntimeFindingAuditItem,
  type RuntimeFindingAuditResult,
  type RuntimeFindingStatusReviewItem,
  type RuntimeMemorySuggestionReviewItem,
  type RuntimeReviewCategory,
  type RuntimeReviewFinding,
  type RuntimeReviewProgress,
  type RuntimeReviewQueueResult,
  type RuntimeReviewSeverity
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface ReviewQueuePageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  focusFindingId?: string;
  focusToken?: number;
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
  onOpenAssistantDraft?: (draft: string, mode?: "explain" | "plan") => void;
}

type ReviewItemKind = "memory" | "finding";
type AuditFilter = "all" | "detected" | "reopened" | "disappeared" | "historical";
type ReviewCategoryState = "completed" | "running" | "waiting" | "failed" | "empty";

const staleReviewProgressMs = 2 * 60 * 1000;
const severityOrder: RuntimeReviewSeverity[] = ["P0", "P1", "P2", "P3"];
const reviewCategoryOrder: RuntimeReviewCategory[] = [
  "architecture_boundaries",
  "dependencies_coupling",
  "build_release",
  "testing_verification",
  "security_secrets",
  "configuration_environment",
  "code_quality_maintainability",
  "api_contracts_data_flow",
  "performance_resources",
  "documentation_knowledge"
];

export function ReviewQueuePage({
  projectRoot,
  onProjectRootChange,
  focusFindingId,
  focusToken,
  onOpenProjectionAnchor,
  onOpenAssistantDraft
}: ReviewQueuePageProps) {
  const { locale, t } = useI18n();
  const [queue, setQueue] = useState<RuntimeReviewQueueResult | null>(null);
  const [audit, setAudit] = useState<RuntimeFindingAuditResult | null>(null);
  const [includeAccepted, setIncludeAccepted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState<{ kind: ReviewItemKind; id: string } | null>(null);
  const [runningReview, setRunningReview] = useState(false);
  const [checkingReviewProgress, setCheckingReviewProgress] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<RuntimeReviewProgress | null>(null);
  const [retryingCategory, setRetryingCategory] = useState<RuntimeReviewCategory | null>(null);
  const [refreshingFindingId, setRefreshingFindingId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [selectedAuditFindingId, setSelectedAuditFindingId] = useState<string | null>(null);
  const [activeReviewCategory, setActiveReviewCategory] = useState<RuntimeReviewCategory>("architecture_boundaries");

  useEffect(() => {
    let cancelled = false;
    if (!projectRoot) {
      setQueue(null);
      setAudit(null);
      setReviewProgress(null);
      setRunningReview(false);
      setCheckingReviewProgress(false);
      return;
    }

    setQueue(null);
    setAudit(null);
    setReviewProgress(null);
    setRunningReview(false);
    setCheckingReviewProgress(true);
    setError("");
    setStatus(t("review.loading"));

    const loadCurrentProjectState = async () => {
      const progress = await readQualityReviewProgress(projectRoot).catch(() => null);
      if (cancelled) return;
      if (progress) {
        setReviewProgress(progress);
        if (progress.status === "running") {
          const stale = isStaleReviewProgress(progress);
          setRunningReview(!stale);
          setStatus(stale ? t("review.progressStaleStatus") : progress.message);
          setCheckingReviewProgress(false);
          await refreshQueueQuietly();
          return;
        }
        if (progress.status === "failed") {
          setRunningReview(false);
          setError(progress.error ?? progress.message);
          setStatus("");
          setCheckingReviewProgress(false);
          await refreshQueueQuietly();
          return;
        }
      }
      setCheckingReviewProgress(false);
      await loadQueue();
    };

    void loadCurrentProjectState();
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!runningReview || !projectRoot) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const progress = await readQualityReviewProgress(projectRoot).catch(() => null);
      if (cancelled) return;
      if (progress) {
        setReviewProgress(progress);
        const stale = isStaleReviewProgress(progress);
        setStatus(stale ? t("review.progressStaleStatus") : progress.message);
        if (stale) {
          setRunningReview(false);
          setRetryingCategory(null);
          await refreshQueueQuietly();
          return;
        }
        await refreshQueueQuietly();
        if (progress.status === "completed") {
          setRunningReview(false);
          setRetryingCategory(null);
          setStatus(t("review.engineeringReviewWritten"));
          return;
        }
        if (progress.status === "failed") {
          setRunningReview(false);
          setRetryingCategory(null);
          setError(progress.error ?? progress.message);
          setStatus("");
          return;
        }
      }
      timeoutId = setTimeout(poll, 1000);
    };
    timeoutId = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [runningReview, projectRoot]);

  async function chooseProjectRoot() {
    const selected = await openProjectDialog(t("review.openProject"));
    if (!selected) return;
    onProjectRootChange(selected);
  }

  async function loadQueue() {
    if (!projectRoot) return;
    await loadQueueData({ quiet: false });
  }

  async function refreshQueueQuietly() {
    if (!projectRoot) return;
    await loadQueueData({ quiet: true });
  }

  async function loadQueueData({ quiet }: { quiet: boolean }) {
    if (!projectRoot) return;
    if (!quiet) {
      setError("");
      setStatus(t("review.loading"));
    }
    try {
      const [next, nextAudit] = await Promise.all([readReviewQueue(projectRoot, includeAccepted), readFindingAudit(projectRoot)]);
      setQueue(next);
      setAudit(nextAudit);
      if (!quiet) setStatus(t("review.loadedProblems"));
    } catch (err) {
      setQueue(null);
      setAudit(null);
      setError(err instanceof Error ? err.message : String(err));
      if (!quiet) setStatus("");
    }
  }

  async function runReview() {
    if (!projectRoot) return;
    setRunningReview(true);
    setQueue(null);
    setAudit(null);
    setReviewProgress(null);
    setError("");
    setStatus(t("review.runningEngineeringReview"));
    try {
      await startQualityReview(projectRoot, locale);
      setStatus(t("review.piReviewStarted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
      setRunningReview(false);
      setRetryingCategory(null);
    } finally {
    }
  }

  async function retryReviewCategory(category: RuntimeReviewCategory) {
    if (!projectRoot) return;
    setRunningReview(true);
    setRetryingCategory(category);
    setError("");
    setStatus(t("review.retryingCategory", { category: categoryLabel(t, category) }));
    try {
      await startQualityReview(projectRoot, locale, category);
      setStatus(t("review.retryStarted", { category: categoryLabel(t, category) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
      setRunningReview(false);
      setRetryingCategory(null);
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

  function openFindingInAssistant(finding: RuntimeReviewFinding) {
    onOpenAssistantDraft?.(buildFindingCodingDraft(finding, categoryLabel(t, finding.category)), "plan");
    setStatus(t("review.codingDraftPrepared"));
  }

  async function refreshFinding(finding: RuntimeReviewFinding) {
    if (!projectRoot || refreshingFindingId) return;
    setRefreshingFindingId(finding.id);
    setError("");
    setStatus(t("review.findingRefreshThinking", { title: finding.title }));
    try {
      await refreshReviewFinding(projectRoot, finding.id, locale);
      setStatus(t("review.findingRefreshCompleted"));
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    } finally {
      setRefreshingFindingId(null);
    }
  }

  const reviewFindings = queue?.reviewFindings ?? [];
  const displayReviewFindings = reviewFindings.map(normalizeReviewFindingDisplayCategory);
  const activeCategoryFindings = sortFindingsForDisplay(displayReviewFindings.filter((finding) => finding.category === activeReviewCategory));
  const activeEvaluator = evaluatorForCategory(queue, activeReviewCategory);
  const categoryStates = buildCategoryStates(reviewProgress, queue, displayReviewFindings);
  const activeCategoryState = categoryStates[activeReviewCategory];
  const externalItems = (queue?.memorySuggestions.length ?? 0) + (queue?.findingStatusPatches.length ?? 0);
  const auditItems = audit?.findings ?? [];
  const filteredAuditItems = auditItems.filter((item) => auditFilterMatches(item, auditFilter));
  const selectedAuditFinding = auditItems.find((item) => item.findingId === selectedAuditFindingId) ?? filteredAuditItems[0] ?? null;
  const staleReviewProgress = isStaleReviewProgress(reviewProgress);
  const effectiveRunningReview = runningReview && !staleReviewProgress;
  const reviewIsInProgress = effectiveRunningReview || (reviewProgress?.status === "running" && !staleReviewProgress);
  const reviewMemoryPill = checkingReviewProgress
    ? t("review.checkingProgressPill")
    : reviewIsInProgress
      ? t("review.reviewRunningPill")
      : staleReviewProgress
        ? t("review.reviewStalePill")
        : reviewProgress?.status === "failed"
        ? t("review.reviewFailedPill")
        : reviewFindings.length
          ? t("review.memoryBacked")
          : t("review.noMemoryBacked");

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
          <button className="primary-action" type="button" disabled={!projectRoot || effectiveRunningReview} onClick={() => void runReview()}>
            {effectiveRunningReview ? t("review.running") : t("review.runEngineeringReview")}
          </button>
          <button className="secondary-action" type="button" disabled={!projectRoot || effectiveRunningReview} onClick={() => void loadQueue()}>
            {t("review.refresh")}
          </button>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeAccepted} onChange={(event) => setIncludeAccepted(event.target.checked)} />
          <span>{t("review.includeAccepted")}</span>
        </label>
        <div className="review-boundary-note">
          <div>
            <strong>{t("review.memoryFirst")}</strong>
            <span>{t("review.memoryFirstCopy")}</span>
          </div>
          <div>
            <strong>{t("review.candidateBoundary")}</strong>
            <span>{t("review.candidateBoundaryCopy")}</span>
          </div>
        </div>
        {effectiveRunningReview || reviewProgress ? <ReviewProgressStrip progress={reviewProgress} stale={staleReviewProgress} /> : null}
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel review-problem-board" aria-labelledby="review-problem-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("review.problemEyebrow")}</p>
            <h2 id="review-problem-title">{t("review.problemTitle")}</h2>
            <p className="muted-copy">{t("review.problemCopy")}</p>
          </div>
          <span className="pill">{reviewMemoryPill}</span>
        </div>
        {!projectRoot ? (
          <EmptyQueue message={t("review.noProject")} />
        ) : checkingReviewProgress || (reviewProgress?.status === "running" && !staleReviewProgress && !queue) ? (
          <ReviewLockedPanel progress={reviewProgress} checking={checkingReviewProgress} />
        ) : queue && !reviewFindings.length ? (
          <ReviewCategoryPanel
            category={activeReviewCategory}
            evaluatorName={activeEvaluator?.evaluator.name}
            evaluatorSummary={activeEvaluator?.summary}
            categoryState={activeCategoryState}
            findings={activeCategoryFindings}
            allFindings={displayReviewFindings}
            categoryStates={categoryStates}
            onSelectCategory={setActiveReviewCategory}
            onRetryCategory={(category) => void retryReviewCategory(category)}
            retryingCategory={retryingCategory}
            reviewIsInProgress={reviewIsInProgress}
            onOpenProjectionAnchor={onOpenProjectionAnchor}
            onOpenAssistantDraft={openFindingInAssistant}
            onRefreshFinding={(finding) => void refreshFinding(finding)}
            refreshingFindingId={refreshingFindingId}
          />
        ) : (
          <ReviewCategoryPanel
            category={activeReviewCategory}
            evaluatorName={activeEvaluator?.evaluator.name}
            evaluatorSummary={activeEvaluator?.summary}
            categoryState={activeCategoryState}
            findings={activeCategoryFindings}
            allFindings={displayReviewFindings}
            categoryStates={categoryStates}
            onSelectCategory={setActiveReviewCategory}
            onRetryCategory={(category) => void retryReviewCategory(category)}
            retryingCategory={retryingCategory}
            reviewIsInProgress={reviewIsInProgress}
            onOpenProjectionAnchor={onOpenProjectionAnchor}
            onOpenAssistantDraft={openFindingInAssistant}
            onRefreshFinding={(finding) => void refreshFinding(finding)}
            refreshingFindingId={refreshingFindingId}
          />
        )}
      </section>

      {externalItems ? <section className="panel review-governance-panel" aria-labelledby="review-governance-title">
        <div className="panel-heading">
          <div>
            <h2 id="review-governance-title">{t("review.governanceTitle")}</h2>
            <p className="muted-copy">{t("review.governanceCopy")}</p>
          </div>
          <span className="pill">{externalItems ? t("review.pendingGovernance") : t("review.noPendingGovernance")}</span>
        </div>
        <div className="review-governance-grid">
          <section className="review-queue-column" aria-labelledby="review-memory-title">
            <div className="panel-heading tight">
              <div>
                <h3 id="review-memory-title">{t("review.memorySuggestions")}</h3>
                <p className="muted-copy">{t("review.memoryCopy")}</p>
              </div>
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

          <section className="review-queue-column" aria-labelledby="review-finding-title">
            <div className="panel-heading tight">
              <div>
                <h3 id="review-finding-title">{t("review.findingStatusPatches")}</h3>
                <p className="muted-copy">{t("review.findingCopy")}</p>
              </div>
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
        </div>
      </section> : null}

      {queue?.foundation && (queue.foundation.status !== "foundation_ready" || queue.foundation.nextActions.length)
        ? <FoundationStatusStrip status={queue.foundation.status} nextActions={queue.foundation.nextActions} />
        : null}

      {audit?.counts.findings ? <section className="panel review-audit-panel" aria-labelledby="review-audit-title">
        <div className="panel-heading">
          <div>
            <h2 id="review-audit-title">{t("review.auditTitle")}</h2>
            <p className="muted-copy">{t("review.auditCopy")}</p>
          </div>
          <span className="pill">{audit?.counts.findings ? t("review.auditHasHistory") : t("review.auditNoHistory")}</span>
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
      </section> : null}
    </section>
  );
}

function ReviewLockedPanel({ progress, checking }: { progress: RuntimeReviewProgress | null; checking: boolean }) {
  const { t } = useI18n();
  const failed = progress?.status === "failed";
  return (
    <section className="review-locked-panel" aria-labelledby="review-locked-title">
      <div className="review-locked-copy">
        <h3 id="review-locked-title">
          {failed ? t("review.failedLockedTitle") : checking ? t("review.checkingProgressTitle") : t("review.inProgressLockedTitle")}
        </h3>
        <p>{failed ? t("review.failedLockedCopy") : checking ? t("review.checkingProgressCopy") : t("review.inProgressLockedCopy")}</p>
      </div>
      <ReviewProgressStrip progress={progress} stale={isStaleReviewProgress(progress)} />
      {progress?.error ? <p className="error-text">{progress.error}</p> : null}
      <p className="muted-copy">{failed ? t("review.failedLockedMemory") : t("review.inProgressLockedMemory")}</p>
    </section>
  );
}

function ReviewCategoryTabs({
  activeCategory,
  findings,
  categoryStates,
  onSelect
}: {
  activeCategory: RuntimeReviewCategory;
  findings: RuntimeReviewFinding[];
  categoryStates: Record<RuntimeReviewCategory, ReviewCategoryState>;
  onSelect: (category: RuntimeReviewCategory) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="review-category-tabs" role="tablist" aria-label={t("review.categoryTabs")}>
      {reviewCategoryOrder.map((category) => {
        const categoryFindings = findings.filter((finding) => finding.category === category);
        const highestSeverity = highestSeverityForFindings(categoryFindings);
        const state = categoryStates[category];
        return (
          <button
            key={category}
            className={activeCategory === category ? "review-category-tab active" : "review-category-tab"}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            onClick={() => onSelect(category)}
          >
            <span>{categoryLabel(t, category)}</span>
            <small>
              {highestSeverity
                ? t("review.categoryHasFindings", { severity: highestSeverity })
                : t(categoryStateLabelKey(state))}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function ReviewProgressStrip({ progress, stale = false }: { progress: RuntimeReviewProgress | null; stale?: boolean }) {
  const { locale, t } = useI18n();
  const total = progress?.totalCategories ?? reviewCategoryOrder.length;
  const completed = progress?.completedCategories ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const pi = progress?.pi;
  const recentEvents = progress?.events ?? [];
  const updatedLabel = progress?.updatedAt ? formatReviewTimeAgo(progress.updatedAt, locale) : "";
  const startedLabel = progress?.startedAt ? formatReviewElapsed(progress.startedAt, locale) : "";
  const title =
    stale
      ? t("review.piAgentStale")
      : progress?.status === "failed"
      ? t("review.piAgentFailed")
      : progress?.status === "completed"
        ? t("review.piAgentCompleted")
        : progress?.source === "pi-agent"
          ? t("review.piAgentRunning")
          : t("review.runningEngineeringReview");
  return (
    <div className="review-progress-strip">
      <div>
        <strong>{title}</strong>
        <span>{progress?.message ?? t("review.waitingForPiProgress")}</span>
      </div>
      {stale ? <div className="review-progress-stale">{t("review.progressStaleCopy")}</div> : null}
      <div className="review-progress-meta">
        <span>{completed}/{total}</span>
        {progress?.currentEvaluator ? <span>{progress.currentEvaluator}</span> : null}
        {progress?.findings ? <span>{t("review.progressFindings", { count: progress.findings })}</span> : null}
        {startedLabel ? <span>{t("review.progressElapsed", { time: startedLabel })}</span> : null}
        {updatedLabel ? <span>{t("review.progressUpdated", { time: updatedLabel })}</span> : null}
      </div>
      <div className="review-progress-bar" aria-label={t("review.progress")}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {pi ? (
        <div className="review-progress-agent">
          <div className="review-progress-agent-head">
            <div>
              <strong>{t("review.piExecutionProcess")}</strong>
              <span>{t("review.piRoute", { provider: pi.provider, model: pi.model })}</span>
            </div>
            <span>{t("review.piEventCount", { count: pi.eventCount })}</span>
          </div>
          {pi.tools.length ? (
            <div className="review-progress-tools" aria-label={t("review.piEnabledTools")}>
              {pi.tools.map((tool) => <span key={tool}>{tool}</span>)}
            </div>
          ) : null}
          {pi.lastToolName || pi.lastAssistantText ? (
            <div className="review-progress-current">
              {pi.lastToolName ? (
                <div>
                  <span>{t("review.piCurrentTool")}</span>
                  <strong>{pi.lastToolName}{pi.lastToolStatus ? ` · ${pi.lastToolStatus}` : ""}</strong>
                </div>
              ) : null}
              {pi.lastToolInput ? <pre>{pi.lastToolInput}</pre> : null}
              {pi.lastToolOutput ? <pre>{pi.lastToolOutput}</pre> : null}
              {pi.lastAssistantText ? <p>{pi.lastAssistantText}</p> : null}
            </div>
          ) : (
            <p className="review-progress-waiting">{t("review.piNoEventsYet")}</p>
          )}
          {recentEvents.length ? (
            <div className="review-progress-events">
              <span>{t("review.piRecentEvents")}</span>
              <ol>
                {recentEvents.map((event, index) => (
                  <li key={`${event.timestamp}-${index}`}>
                    <time>{formatReviewClock(event.timestamp)}</time>
                    <div>
                      <strong>{event.toolName ?? event.type}{event.status ? ` · ${event.status}` : ""}</strong>
                      <span>{event.summary}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewCategoryPanel({
  category,
  evaluatorName,
  evaluatorSummary,
  categoryState,
  findings,
  allFindings,
  categoryStates,
  onSelectCategory,
  onRetryCategory,
  retryingCategory,
  reviewIsInProgress,
  onOpenProjectionAnchor,
  onOpenAssistantDraft,
  onRefreshFinding,
  refreshingFindingId
}: {
  category: RuntimeReviewCategory;
  evaluatorName?: string;
  evaluatorSummary?: string;
  categoryState: ReviewCategoryState;
  findings: RuntimeReviewFinding[];
  allFindings: RuntimeReviewFinding[];
  categoryStates: Record<RuntimeReviewCategory, ReviewCategoryState>;
  onSelectCategory: (category: RuntimeReviewCategory) => void;
  onRetryCategory: (category: RuntimeReviewCategory) => void;
  retryingCategory: RuntimeReviewCategory | null;
  reviewIsInProgress: boolean;
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
  onOpenAssistantDraft?: (finding: RuntimeReviewFinding) => void;
  onRefreshFinding?: (finding: RuntimeReviewFinding) => void;
  refreshingFindingId: string | null;
}) {
  const { t } = useI18n();
  const retryingThisCategory = retryingCategory === category;
  return (
    <div className="review-category-workspace">
      <ReviewCategoryTabs activeCategory={category} findings={allFindings} categoryStates={categoryStates} onSelect={onSelectCategory} />
      <section className="review-category-panel" role="tabpanel" aria-labelledby={`review-category-${category}`}>
        <div className="review-category-heading">
          <div>
            <h3 id={`review-category-${category}`}>{categoryLabel(t, category)}</h3>
            <p className="muted-copy">{categoryCopy(t, category)}</p>
          </div>
          <div className="review-evaluator-chip">
            <strong>{evaluatorName ?? t("review.evaluatorUnknown")}</strong>
            <span>{evaluatorSummary ?? t("review.evaluatorFallbackSummary")}</span>
            {categoryState === "failed" || retryingThisCategory ? (
              <button
                className="review-category-retry"
                type="button"
                disabled={reviewIsInProgress && !retryingThisCategory}
                onClick={() => onRetryCategory(category)}
              >
                {retryingThisCategory ? t("review.retrying") : t("review.retryCategory")}
              </button>
            ) : null}
          </div>
        </div>
        {findings.length ? (
          <div className="review-severity-stack compact">
            {severityOrder.map((severity) => {
              const severityFindings = findings.filter((finding) => finding.severity === severity);
              if (!severityFindings.length) return null;
              return (
                <ReviewSeveritySection
                  key={severity}
                  severity={severity}
                  findings={severityFindings}
                  onOpenProjectionAnchor={onOpenProjectionAnchor}
                  onOpenAssistantDraft={onOpenAssistantDraft}
                  onRefreshFinding={onRefreshFinding}
                  refreshingFindingId={refreshingFindingId}
                />
              );
            })}
          </div>
        ) : (
          <EmptyQueue message={t(categoryEmptyMessageKey(categoryState))} />
        )}
      </section>
    </div>
  );
}

function ReviewSeveritySection({
  severity,
  findings,
  onOpenProjectionAnchor,
  onOpenAssistantDraft,
  onRefreshFinding,
  refreshingFindingId
}: {
  severity: RuntimeReviewSeverity;
  findings: RuntimeReviewFinding[];
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
  onOpenAssistantDraft?: (finding: RuntimeReviewFinding) => void;
  onRefreshFinding?: (finding: RuntimeReviewFinding) => void;
  refreshingFindingId: string | null;
}) {
  const { t } = useI18n();
  return (
    <section className={`review-severity-section severity-${severity.toLowerCase()}`} aria-labelledby={`review-${severity}`}>
      <div className="review-severity-heading">
        <div>
          <h3 id={`review-${severity}`}>{t(severityTitleKey(severity))}</h3>
          <p className="muted-copy">{t(severityCopyKey(severity))}</p>
        </div>
      </div>
      <div className="review-card-list">
        {findings.map((finding) => (
          <ReviewFindingCard
            key={finding.id}
            finding={finding}
            onOpenProjectionAnchor={onOpenProjectionAnchor}
            onOpenAssistantDraft={onOpenAssistantDraft}
            onRefreshFinding={onRefreshFinding}
            refreshing={refreshingFindingId === finding.id}
          />
        ))}
        {!findings.length ? <EmptyQueue message={t("review.noSeverityFindings")} /> : null}
      </div>
    </section>
  );
}

function ReviewFindingCard({
  finding,
  onOpenProjectionAnchor,
  onOpenAssistantDraft,
  onRefreshFinding,
  refreshing
}: {
  finding: RuntimeReviewFinding;
  onOpenProjectionAnchor?: (anchor: RuntimeGraphAnchor) => void;
  onOpenAssistantDraft?: (finding: RuntimeReviewFinding) => void;
  onRefreshFinding?: (finding: RuntimeReviewFinding) => void;
  refreshing: boolean;
}) {
  const { t } = useI18n();
  const primaryAnchor = finding.affectedAnchors[0];
  return (
    <article className={refreshing ? `review-finding-card severity-${finding.severity.toLowerCase()} is-refreshing` : `review-finding-card severity-${finding.severity.toLowerCase()}`} aria-busy={refreshing}>
      <div className="review-finding-head">
        <div className="review-finding-badges">
          <span className="pill">{finding.severity}</span>
          <span className="pill">{categoryLabel(t, finding.category)}</span>
          {finding.evaluator ? <span className="pill">{finding.evaluator.name}</span> : null}
          <span className="pill">{t(confidenceLabelKey(finding.confidence))}</span>
          <span className="pill">{finding.status}</span>
        </div>
        <div className="review-finding-actions">
          <button className="text-button" type="button" disabled={refreshing || !onOpenAssistantDraft} onClick={() => onOpenAssistantDraft?.(finding)}>
            {t("review.coding")}
          </button>
          <button className="text-button" type="button" disabled={refreshing || !onRefreshFinding} onClick={() => onRefreshFinding?.(finding)}>
            {refreshing ? t("review.findingThinkingShort") : t("review.refreshFinding")}
          </button>
          <button className="text-button" type="button" disabled={refreshing || !primaryAnchor || !onOpenProjectionAnchor} onClick={() => primaryAnchor ? onOpenProjectionAnchor?.(primaryAnchor) : undefined}>
            {t("review.openAnchor")}
          </button>
        </div>
      </div>
      {refreshing ? (
        <div className="review-finding-thinking">
          <span className="spinner" />
          <span>{t("review.findingThinking")}</span>
        </div>
      ) : null}
      <h4>{finding.title}</h4>
      <p>{finding.summary}</p>
      <div className="review-explanation-grid">
        <div>
          <strong>{t("review.whyItMatters")}</strong>
          <span>{finding.whyItMatters}</span>
        </div>
        <div>
          <strong>{t("review.suggestedAction")}</strong>
          <span>{finding.suggestedAction}</span>
        </div>
      </div>
      <details className="review-evidence-list">
        <summary>{t("review.evidenceCount", { count: finding.evidence.length + finding.affectedAnchors.length })}</summary>
        {finding.evidence.slice(0, 4).map((evidence, index) => (
          <div className="review-evidence" key={`${finding.id}:evidence:${index}`}>
            <span>{evidence.source}</span>
            <p>{evidence.summary}</p>
            {evidence.path ? <small>{evidence.path}</small> : null}
          </div>
        ))}
        {finding.affectedAnchors.length ? (
          <div className="review-anchor-list">
            {finding.affectedAnchors.slice(0, 6).map((anchor) => (
              <button
                key={`${anchor.kind}:${anchor.id}`}
                className="review-anchor-chip"
                type="button"
                disabled={!onOpenProjectionAnchor || refreshing}
                onClick={() => onOpenProjectionAnchor?.(anchor)}
              >
                {anchor.path ?? anchor.id}
              </button>
            ))}
          </div>
        ) : null}
      </details>
    </article>
  );
}

function FoundationStatusStrip({ status, nextActions }: { status: string; nextActions: string[] }) {
  const { t } = useI18n();
  return (
    <section className="panel review-foundation-strip" aria-labelledby="review-foundation-title">
      <div className="panel-heading tight">
        <div>
          <h2 id="review-foundation-title">{t("review.foundationTitle")}</h2>
          <p className="muted-copy">{t("review.foundationCopy")}</p>
        </div>
        <span className={status === "foundation_ready" ? "pill success" : "pill"}>{foundationStatusLabel(t, status)}</span>
      </div>
      <div className="review-next-action-list">
        {nextActions.map((action) => (
          <span key={action}>{action}</span>
        ))}
      </div>
    </section>
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
      <h4>{item.summary}</h4>
      <dl className="review-meta-grid">
        <div>
          <dt>{t("review.sourceTask")}</dt>
          <dd>{item.sourceTaskId ?? "-"}</dd>
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
      <h4>{item.summary}</h4>
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
      <h4>{item.currentTitle ?? item.findingId}</h4>
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

function categoryLabel(t: (key: ReviewTranslationKey) => string, category: RuntimeReviewCategory): string {
  return t(categoryLabelKey(category));
}

function categoryCopy(t: (key: ReviewTranslationKey) => string, category: RuntimeReviewCategory): string {
  return t(categoryCopyKey(category));
}

function foundationStatusLabel(t: (key: ReviewTranslationKey) => string, status: string): string {
  if (status === "foundation_ready") return t("review.foundationReady");
  if (status === "understanding_pending") return t("review.foundationUnderstandingPending");
  if (status === "needs_intake") return t("review.foundationNeedsIntake");
  if (status === "not_initialized") return t("review.foundationNotInitialized");
  return status;
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function normalizeReviewFindingDisplayCategory(finding: RuntimeReviewFinding): RuntimeReviewFinding {
  if (finding.category !== "foundation_integrity") return finding;
  return {
    ...finding,
    category: "documentation_knowledge",
    evaluator: finding.evaluator
      ? { ...finding.evaluator, category: "documentation_knowledge" }
      : finding.evaluator
  };
}

function buildFindingCodingDraft(finding: RuntimeReviewFinding, category: string): string {
  const evidence = finding.evidence.slice(0, 5).map((item, index) => {
    const path = item.path ? ` (${item.path})` : "";
    return `${index + 1}. ${item.summary}${path}`;
  });
  const anchors = finding.affectedAnchors.slice(0, 8).map((anchor, index) => `${index + 1}. ${anchor.path ?? anchor.id}`);
  return [
    "请基于下面这条工程评审问题做整改。不要直接开始大范围重构，先确认问题是否仍存在，再给出最小修改计划。",
    "",
    `问题：${finding.title}`,
    `分类：${category}`,
    `严重程度：${finding.severity}`,
    `当前状态：${finding.status}`,
    "",
    `问题描述：${finding.summary}`,
    "",
    `为什么重要：${finding.whyItMatters}`,
    "",
    `建议整改：${finding.suggestedAction}`,
    evidence.length ? ["", "证据：", ...evidence].join("\n") : "",
    anchors.length ? ["", "相关锚点：", ...anchors].join("\n") : "",
    "",
    "执行要求：",
    "1. 先复查该问题是否仍存在，并说明证据。",
    "2. 如果仍存在，给出最小可行整改计划。",
    "3. 需要改代码时，说明将修改哪些文件、为什么改、如何验证。",
    "4. 遵守 Praxis v0.1：Explain before Plan, Plan before Apply；不要自动提交。"
  ].filter(Boolean).join("\n");
}

function sortFindingsForDisplay(findings: RuntimeReviewFinding[]): RuntimeReviewFinding[] {
  const severityRank: Record<RuntimeReviewSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const confidenceRank: Record<RuntimeReviewFinding["confidence"], number> = { high: 0, medium: 1, low: 2 };
  return [...findings].sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity]
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.title.localeCompare(right.title)
  );
}

function evaluatorForCategory(queue: RuntimeReviewQueueResult | null, category: RuntimeReviewCategory) {
  return queue?.qualityReview?.evaluatorResults?.find((result) => normalizeReviewCategory(result.evaluator.category) === category);
}

function buildCategoryStates(
  progress: RuntimeReviewProgress | null,
  queue: RuntimeReviewQueueResult | null,
  findings: RuntimeReviewFinding[]
): Record<RuntimeReviewCategory, ReviewCategoryState> {
  const states = Object.fromEntries(reviewCategoryOrder.map((category) => [category, "empty"])) as Record<RuntimeReviewCategory, ReviewCategoryState>;
  for (const finding of findings) states[finding.category] = "completed";
  if (isStaleReviewProgress(progress)) {
    if (progress?.currentCategory) states[progress.currentCategory] = "failed";
    return states;
  }
  const evaluatorResults = progress?.evaluatorResults ?? queue?.qualityReview?.evaluatorResults ?? [];
  for (const result of evaluatorResults) {
    const category = normalizeReviewCategory(result.evaluator.category);
    if (result.status === "failed") states[category] = "failed";
    else if (result.status === "completed") states[category] = "completed";
    else if (progress?.status === "running" && category === progress.currentCategory) states[category] = "running";
    else if (progress?.status === "running") states[category] = "waiting";
  }
  if (progress?.status === "running") {
    const completed = new Set((progress.evaluatorResults ?? [])
      .filter((result) => result.status === "completed" || result.status === "failed")
      .map((result) => normalizeReviewCategory(result.evaluator.category)));
    for (const category of reviewCategoryOrder) {
      if (category === progress.currentCategory) states[category] = "running";
      else if (!completed.has(category) && states[category] === "empty") states[category] = "waiting";
    }
  }
  if (progress?.status === "failed" && progress.currentCategory) states[progress.currentCategory] = "failed";
  return states;
}

function normalizeReviewCategory(category: RuntimeReviewCategory): RuntimeReviewCategory {
  return category === "foundation_integrity" ? "documentation_knowledge" : category;
}

function isStaleReviewProgress(progress: RuntimeReviewProgress | null): boolean {
  if (!progress || progress.status !== "running") return false;
  const updatedAt = new Date(progress.pi?.lastEventAt ?? progress.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > staleReviewProgressMs;
}

function highestSeverityForFindings(findings: RuntimeReviewFinding[]): RuntimeReviewSeverity | undefined {
  return severityOrder.find((severity) => findings.some((finding) => finding.severity === severity));
}

function categoryStateLabelKey(state: ReviewCategoryState): ReviewTranslationKey {
  if (state === "completed") return "review.categoryCompleted";
  if (state === "running") return "review.categoryRunning";
  if (state === "waiting") return "review.categoryWaiting";
  if (state === "failed") return "review.categoryFailed";
  return "review.categoryClear";
}

function categoryEmptyMessageKey(state: ReviewCategoryState): ReviewTranslationKey {
  if (state === "running") return "review.categoryRunningEmpty";
  if (state === "waiting") return "review.categoryWaitingEmpty";
  if (state === "failed") return "review.categoryFailedEmpty";
  if (state === "completed") return "review.noCategoryFindings";
  return "review.noReviewFindings";
}

function auditFilterMatches(item: RuntimeFindingAuditItem, filter: AuditFilter): boolean {
  if (filter === "all") return true;
  if (filter === "detected") return item.currentlyDetected;
  if (filter === "reopened") return item.detectorState === "reopened";
  if (filter === "disappeared") return item.detectorState === "disappeared_after_reconciliation";
  return !item.currentlyDetected;
}

function auditFilterLabelKey(filter: AuditFilter): ReviewTranslationKey {
  if (filter === "all") return "review.auditFilterAll";
  if (filter === "detected") return "review.auditFilterDetected";
  if (filter === "reopened") return "review.auditFilterReopened";
  if (filter === "disappeared") return "review.auditFilterDisappeared";
  return "review.auditFilterHistorical";
}

type ReviewTranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

function formatReviewTimeAgo(iso: string, locale: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return locale === "zh-CN" ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === "zh-CN" ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "zh-CN" ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "zh-CN" ? `${days} 天前` : `${days}d ago`;
}

function formatReviewElapsed(iso: string, locale: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return locale === "zh-CN" ? `${seconds} 秒` : `${seconds}s`;
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return locale === "zh-CN" ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return locale === "zh-CN" ? `${hours} 小时 ${remainingMinutes} 分` : `${hours}h ${remainingMinutes}m`;
}

function formatReviewClock(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function severityTitleKey(severity: RuntimeReviewSeverity): ReviewTranslationKey {
  if (severity === "P0") return "review.severity.P0.title";
  if (severity === "P1") return "review.severity.P1.title";
  if (severity === "P2") return "review.severity.P2.title";
  return "review.severity.P3.title";
}

function severityCopyKey(severity: RuntimeReviewSeverity): ReviewTranslationKey {
  if (severity === "P0") return "review.severity.P0.copy";
  if (severity === "P1") return "review.severity.P1.copy";
  if (severity === "P2") return "review.severity.P2.copy";
  return "review.severity.P3.copy";
}

function confidenceLabelKey(confidence: RuntimeReviewFinding["confidence"]): ReviewTranslationKey {
  if (confidence === "high") return "review.confidence.high";
  if (confidence === "medium") return "review.confidence.medium";
  return "review.confidence.low";
}

function categoryLabelKey(category: RuntimeReviewCategory): ReviewTranslationKey {
  if (category === "foundation_integrity") return "review.category.foundation_integrity";
  if (category === "architecture_boundaries") return "review.category.architecture_boundaries";
  if (category === "dependencies_coupling") return "review.category.dependencies_coupling";
  if (category === "build_release") return "review.category.build_release";
  if (category === "testing_verification") return "review.category.testing_verification";
  if (category === "security_secrets") return "review.category.security_secrets";
  if (category === "configuration_environment") return "review.category.configuration_environment";
  if (category === "code_quality_maintainability") return "review.category.code_quality_maintainability";
  if (category === "api_contracts_data_flow") return "review.category.api_contracts_data_flow";
  if (category === "performance_resources") return "review.category.performance_resources";
  return "review.category.documentation_knowledge";
}

function categoryCopyKey(category: RuntimeReviewCategory): ReviewTranslationKey {
  if (category === "foundation_integrity") return "review.categoryCopy.documentation_knowledge";
  if (category === "architecture_boundaries") return "review.categoryCopy.architecture_boundaries";
  if (category === "dependencies_coupling") return "review.categoryCopy.dependencies_coupling";
  if (category === "build_release") return "review.categoryCopy.build_release";
  if (category === "testing_verification") return "review.categoryCopy.testing_verification";
  if (category === "security_secrets") return "review.categoryCopy.security_secrets";
  if (category === "configuration_environment") return "review.categoryCopy.configuration_environment";
  if (category === "code_quality_maintainability") return "review.categoryCopy.code_quality_maintainability";
  if (category === "api_contracts_data_flow") return "review.categoryCopy.api_contracts_data_flow";
  if (category === "performance_resources") return "review.categoryCopy.performance_resources";
  return "review.categoryCopy.documentation_knowledge";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
