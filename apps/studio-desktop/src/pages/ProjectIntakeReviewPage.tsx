import { useEffect, useMemo, useState } from "react";
import { readProjectFile, runProjectOverviewGeneration } from "../runtimeClient";
import { useI18n } from "../i18n";

interface ProjectIntakeReviewPageProps {
  projectRoot: string;
}

type OverviewDocKind = "overview" | "timeline" | "readme" | "changelog" | "source";
type OverviewLoadState = "idle" | "loading" | "ready" | "missing" | "generating" | "error";

interface OverviewDoc {
  path: string;
  title: string;
  kind: OverviewDocKind;
  content: string;
}

const overviewDocPath = "docs/project/project-overview.md";
const timelineDocPath = "docs/project/project-timeline.md";

const docCandidates: Array<Omit<OverviewDoc, "content">> = [
  { path: overviewDocPath, title: "Project Overview", kind: "overview" },
  { path: timelineDocPath, title: "Project Timeline", kind: "timeline" },
  { path: "README.md", title: "README", kind: "readme" },
  { path: "README.zh-CN.md", title: "README zh-CN", kind: "readme" },
  { path: "CHANGELOG.md", title: "CHANGELOG", kind: "changelog" },
  { path: "docs/CHANGELOG.md", title: "docs CHANGELOG", kind: "changelog" },
  { path: "docs/changelog.md", title: "docs changelog", kind: "changelog" },
  { path: "AGENTS.md", title: "AGENTS", kind: "source" },
  { path: "docs/design/use-case-diagrams-maps.md", title: "Design Explorer docs", kind: "source" },
  { path: "docs/engineering/engineering-maps.md", title: "Engineering Explorer docs", kind: "source" },
  { path: "docs/architecture/c4/c4-model-maps.md", title: "Architecture Explorer docs", kind: "source" }
];

export function ProjectIntakeReviewPage({ projectRoot }: ProjectIntakeReviewPageProps) {
  const { t } = useI18n();
  const [state, setState] = useState<OverviewLoadState>("idle");
  const [docs, setDocs] = useState<OverviewDoc[]>([]);
  const [error, setError] = useState("");
  const [generationSummary, setGenerationSummary] = useState("");

  useEffect(() => {
    void loadDocs();
  }, [projectRoot]);

  const overviewDoc = docs.find((doc) => doc.kind === "overview");
  const normalizedTimelineDoc = docs.find((doc) => doc.kind === "timeline");
  const timelineDoc = normalizedTimelineDoc ?? docs.find((doc) => doc.kind === "changelog");
  const readmeDoc = docs.find((doc) => doc.kind === "readme");
  const sourceDocs = docs.filter((doc) => doc.kind !== "overview" && doc.kind !== "timeline");
  const normalizedDocsMissing = !overviewDoc || !normalizedTimelineDoc;
  const projectName = useMemo(() => projectNameFromRoot(projectRoot), [projectRoot]);
  const timelineEntries = useMemo(() => extractTimelineEntries(timelineDoc?.content ?? ""), [timelineDoc]);
  const overviewSections = useMemo(() => extractMarkdownSections(overviewDoc?.content ?? readmeDoc?.content ?? ""), [overviewDoc, readmeDoc]);

  async function loadDocs() {
    if (!projectRoot.trim()) {
      setDocs([]);
      setState("idle");
      setError("");
      return;
    }
    setState("loading");
    setError("");
    const loaded: OverviewDoc[] = [];
    for (const candidate of docCandidates) {
      try {
        const content = await readProjectFile(projectRoot, candidate.path);
        loaded.push({ ...candidate, content });
      } catch {
        // Missing source documents are represented in the UI; they are not load errors.
      }
    }
    setDocs(dedupeDocs(loaded));
    setState(loaded.some((doc) => doc.kind === "overview") ? "ready" : "missing");
  }

  async function generateMissingDocs() {
    if (!projectRoot.trim()) return;
    setState("generating");
    setError("");
    setGenerationSummary("");
    try {
      const result = await runProjectOverviewGeneration(projectRoot);
      setGenerationSummary(
        result.skipped
          ? (result.reason ?? t("intake.overviewGeneratedSkipped"))
          : t("intake.overviewGenerated", {
              timeline: result.timelineItems ?? 0,
              progress: result.progressItems ?? 0,
              risks: result.risks ?? 0
            })
      );
      await loadDocs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  return (
    <section className="project-overview-page" aria-labelledby="project-overview-title">
      <aside className="panel project-overview-sidebar">
        <p className="eyebrow">{t("intake.overviewEyebrow")}</p>
        <h1 id="project-overview-title">{t("intake.overviewTitle")}</h1>
        <div className="project-overview-identity">
          <span>{t("intake.currentProject")}</span>
          <strong>{projectName || t("intake.noRepository")}</strong>
        </div>
        <button className="secondary-action full-width" type="button" onClick={loadDocs} disabled={!projectRoot || state === "loading" || state === "generating"}>
          {state === "loading" ? t("intake.loadingDocs") : t("intake.refreshDocs")}
        </button>
        {normalizedDocsMissing ? (
          <button className="primary-action full-width" type="button" onClick={generateMissingDocs} disabled={!projectRoot || state === "generating"}>
            {state === "generating" ? t("intake.generatingOverview") : t("intake.generateOverview")}
          </button>
        ) : null}
        <section className="overview-source-list">
          <h2>{t("intake.docsSource")}</h2>
          <DocSourceRow doc={overviewDoc} fallbackPath={overviewDocPath} title={t("intake.normalizedOverviewDoc")} required />
          <DocSourceRow doc={normalizedTimelineDoc} fallbackPath={timelineDocPath} title={t("intake.normalizedTimelineDoc")} required />
          <DocSourceRow doc={readmeDoc} fallbackPath="README.md" title="README" />
          <DocSourceRow doc={docs.find((doc) => doc.kind === "changelog")} fallbackPath="CHANGELOG.md" title="CHANGELOG" />
        </section>
      </aside>

      <main className="panel project-overview-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("intake.overviewMemoryRule")}</p>
            <h2>{overviewDoc ? markdownTitle(overviewDoc.content, projectName) : t("intake.missingOverviewTitle")}</h2>
            <p>{overviewDoc ? t("intake.overviewFromDocs") : t("intake.missingOverviewCopy")}</p>
          </div>
          <span className={overviewDoc ? "pill success" : "pill"}>{overviewDoc ? overviewDoc.path : t("intake.docsMissing")}</span>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {generationSummary ? <p className="status-text">{generationSummary}</p> : null}

        {!projectRoot ? (
          <div className="empty-state">
            <strong>{t("intake.noRepository")}</strong>
            <span>{t("engineering.noProjectCopy")}</span>
          </div>
        ) : !overviewDoc ? (
          <section className="overview-missing-panel">
            <h3>{t("intake.missingOverviewTitle")}</h3>
            <p>{t("intake.missingOverviewActionCopy")}</p>
            <button className="primary-action" type="button" onClick={generateMissingDocs} disabled={state === "generating"}>
              {state === "generating" ? t("intake.generatingOverview") : t("intake.generateOverview")}
            </button>
            {readmeDoc || timelineDoc ? (
              <div className="overview-fallback-grid">
                {readmeDoc ? <MarkdownPreviewCard title="README" doc={readmeDoc} /> : null}
                {timelineDoc ? <MarkdownPreviewCard title={timelineDoc.title} doc={timelineDoc} /> : null}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="overview-section-grid">
            {overviewSections.length ? (
              overviewSections.slice(0, 8).map((section) => (
                <article className="overview-section-card" key={`${section.title}:${section.index}`}>
                  <h3>{section.title}</h3>
                  <p>{section.preview}</p>
                </article>
              ))
            ) : (
              <MarkdownPreviewCard title={overviewDoc.title} doc={overviewDoc} />
            )}
          </section>
        )}
      </main>

      <aside className="panel project-overview-timeline">
        <h2>{t("intake.timelineTitle")}</h2>
        <p>{timelineDoc ? t("intake.timelineFromDocs") : t("intake.timelineMissing")}</p>
        {timelineEntries.length ? (
          <ol className="overview-timeline-list">
            {timelineEntries.slice(0, 10).map((entry) => (
              <li key={`${entry.date}:${entry.title}`}>
                <time>{entry.date}</time>
                <strong>{entry.title}</strong>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state compact">
            <strong>{t("intake.noTimelineTitle")}</strong>
            <span>{t("intake.noTimelineCopy")}</span>
          </div>
        )}
        {sourceDocs.length ? (
          <section className="overview-secondary-docs">
            <h3>{t("intake.relatedDocs")}</h3>
            {sourceDocs.slice(0, 6).map((doc) => (
              <article key={doc.path}>
                <strong>{doc.title}</strong>
                <span>{doc.path}</span>
              </article>
            ))}
          </section>
        ) : null}
      </aside>
    </section>
  );
}

function DocSourceRow({
  doc,
  fallbackPath,
  title,
  required = false
}: {
  doc?: OverviewDoc;
  fallbackPath: string;
  title: string;
  required?: boolean;
}) {
  return (
    <article className={doc ? "overview-source-row ready" : required ? "overview-source-row missing required" : "overview-source-row missing"}>
      <div>
        <strong>{title}</strong>
        <span>{doc?.path ?? fallbackPath}</span>
      </div>
      <small>{doc ? "ready" : required ? "missing" : "optional"}</small>
    </article>
  );
}

function MarkdownPreviewCard({ title, doc }: { title: string; doc: OverviewDoc }) {
  return (
    <article className="overview-section-card">
      <h3>{markdownTitle(doc.content, title)}</h3>
      <p>{markdownIntro(doc.content)}</p>
      <span>{doc.path}</span>
    </article>
  );
}

function dedupeDocs(docs: OverviewDoc[]): OverviewDoc[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = doc.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markdownTitle(content: string, fallback: string): string {
  return content.split(/\r?\n/).find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() || fallback;
}

function markdownIntro(content: string): string {
  const lines = content
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("<!--") && !line.startsWith("- 项目版本") && !line.startsWith("- Git"));
  const preview = lines.slice(0, 4).join(" ");
  return preview.length > 420 ? `${preview.slice(0, 420)}...` : preview || "暂无摘要。";
}

function extractMarkdownSections(content: string): Array<{ index: number; title: string; preview: string }> {
  if (!content.trim()) return [];
  const matches = Array.from(content.matchAll(/^##\s+(.+)$/gm));
  if (!matches.length) return [{ index: 0, title: markdownTitle(content, "概要"), preview: markdownIntro(content) }];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1]?.index ?? content.length;
    return {
      index,
      title: match[1].trim(),
      preview: markdownIntro(content.slice(start, next))
    };
  });
}

function extractTimelineEntries(content: string): Array<{ date: string; title: string; summary: string }> {
  if (!content.trim()) return [];
  const headingEntries = Array.from(content.matchAll(/^###\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|unknown)?\s*(.+)$/gm)).map((match, index, all) => {
    const start = (match.index ?? 0) + match[0].length;
    const next = all[index + 1]?.index ?? content.length;
    const date = match[1]?.trim() || "unknown";
    return {
      date,
      title: match[2].trim(),
      summary: markdownIntro(content.slice(start, next))
    };
  });
  if (headingEntries.length) return headingEntries;
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^##\s+/.test(line))
    .slice(0, 10)
    .map((line, index) => ({
      date: "unknown",
      title: line.replace(/^[-*#\s]+/, "").slice(0, 80) || `事件 ${index + 1}`,
      summary: line.replace(/^[-*#\s]+/, "")
    }));
}

function projectNameFromRoot(root: string): string {
  const normalized = root.replace(/\\+$/, "").replace(/\/+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "";
}
