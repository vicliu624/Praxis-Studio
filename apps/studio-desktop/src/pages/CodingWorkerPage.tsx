import { useEffect, useMemo, useState } from "react";
import {
  createCodingAgentTask,
  generatePiTaskPayload,
  importPiResult,
  normalizeToExternalAgentResult,
  renderPiTaskMarkdown,
  type CodingAgentTask,
  type PiCodingAgentPayload,
  type PiImportedResult
} from "@praxis/coding-agent-adapter";
import {
  acceptExternalResult,
  buildContextPacketForAnchor,
  openProjectDialog,
  readReviewQueue,
  writeDistinctionFile,
  type RuntimeGraphAnchor,
  type RuntimeReviewQueueResult
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface CodingWorkerPageProps {
  projectRoot: string;
  onProjectRootChange: (root: string) => void;
  onOpenReviewQueue: () => void;
}

const defaultInstruction = [
  "Use the provided ContextPacket and allowed paths.",
  "Make the smallest safe implementation change.",
  "Return praxis.externalAgentResult.v1 JSON when possible.",
  "Do not claim Praxis memory or finding status is confirmed."
].join("\n");

export function CodingWorkerPage({ projectRoot, onProjectRootChange, onOpenReviewQueue }: CodingWorkerPageProps) {
  const { t } = useI18n();
  const [queue, setQueue] = useState<RuntimeReviewQueueResult | null>(null);
  const [title, setTitle] = useState("Pi coding worker task");
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [anchorText, setAnchorText] = useState("");
  const [allowedPaths, setAllowedPaths] = useState("src\napps\npackages");
  const [forbiddenPaths, setForbiddenPaths] = useState(".distinction/memory\n.distinction/models\nnode_modules");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("Build/typecheck passes\nChanged files are summarized\nRisk notes are explicit");
  const [verificationCommands, setVerificationCommands] = useState("npm run build\nnpm run typecheck");
  const [task, setTask] = useState<CodingAgentTask | null>(null);
  const [payload, setPayload] = useState<PiCodingAgentPayload | null>(null);
  const [payloadText, setPayloadText] = useState("");
  const [payloadMarkdown, setPayloadMarkdown] = useState("");
  const [resultText, setResultText] = useState("");
  const [importedResult, setImportedResult] = useState<PiImportedResult | null>(null);
  const [normalizedResultText, setNormalizedResultText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectRoot) {
      setQueue(null);
      return;
    }
    void refreshQueue();
  }, [projectRoot]);

  const externalResultCount = queue?.counts.total ?? 0;
  const currentResultId = useMemo(() => {
    try {
      const parsed = JSON.parse(normalizedResultText) as { id?: string };
      return parsed.id;
    } catch {
      return undefined;
    }
  }, [normalizedResultText]);

  async function chooseProjectRoot() {
    const selected = await openProjectDialog(t("worker.openProject"));
    if (!selected) return;
    onProjectRootChange(selected);
  }

  async function refreshQueue() {
    if (!projectRoot) return;
    const next = await readReviewQueue(projectRoot).catch(() => null);
    setQueue(next);
  }

  async function generateTask() {
    if (!projectRoot) return;
    setBusy(true);
    setError("");
    setStatus(t("worker.generating"));
    try {
      const nextTask = createCodingAgentTask({
        id: `TASK-PI-${Date.now()}`,
        title: title.trim() || "Pi coding worker task",
        instruction: instruction.trim() || defaultInstruction,
        context: {
          architectureContext: "Use Praxis ContextPacket as source of architecture truth when present.",
          graphContext: "External worker result must return to Praxis Review Queue before memory/finding changes are accepted.",
          memoryContext: [],
          constraints: [
            "Praxis owns graph, memory, findings, traces and acceptance.",
            "External workers may propose changes; they do not confirm memory."
          ]
        },
        scope: {
          relatedFiles: [],
          allowedPaths: lines(allowedPaths),
          forbiddenPaths: lines(forbiddenPaths)
        },
        acceptanceCriteria: lines(acceptanceCriteria),
        verificationCommands: lines(verificationCommands)
      });
      const anchor = parseAnchor(anchorText);
      const contextPacket = anchor ? await buildContextPacketForAnchor(projectRoot, anchor, "external_agent").catch((err) => ({ warning: String(err), anchor })) : undefined;
      const nextPayload = generatePiTaskPayload(nextTask, contextPacket);
      setTask(nextTask);
      setPayload(nextPayload);
      setPayloadText(JSON.stringify(nextPayload, null, 2));
      setPayloadMarkdown(renderPiTaskMarkdown(nextPayload));
      setStatus(t("worker.generated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function copyPayload() {
    if (!payloadText) return;
    await navigator.clipboard.writeText(payloadText);
    setStatus(t("worker.copied"));
  }

  async function exportPayload() {
    if (!projectRoot || !payload || !task) return;
    setBusy(true);
    setError("");
    try {
      const base = `.distinction/tasks/${safeFilePart(task.id)}.pi`;
      await writeDistinctionFile(projectRoot, `${base}.json`, `${JSON.stringify(payload, null, 2)}\n`);
      await writeDistinctionFile(projectRoot, `${base}.md`, `${payloadMarkdown}\n`);
      setStatus(t("worker.exported", { path: `${base}.json` }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function importResult() {
    setError("");
    try {
      const imported = importPiResult(resultText);
      const normalized = normalizeToExternalAgentResult(imported, task ?? undefined);
      setImportedResult(imported);
      setNormalizedResultText(JSON.stringify(normalized, null, 2));
      setStatus(t("worker.resultNormalized"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function acceptImportedResult() {
    if (!projectRoot || !normalizedResultText) return;
    setBusy(true);
    setError("");
    try {
      const normalized = JSON.parse(normalizedResultText) as { id: string };
      const relative = `.distinction/reports/external-results/${safeFilePart(normalized.id)}.json`;
      await writeDistinctionFile(projectRoot, relative, `${normalizedResultText}\n`);
      await acceptExternalResult(projectRoot, relative);
      setStatus(t("worker.resultQueued"));
      await refreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="coding-worker-layout" aria-labelledby="coding-worker-title">
      <section className="panel coding-worker-hero">
        <p className="eyebrow">{t("worker.eyebrow")}</p>
        <h1 id="coding-worker-title">{t("worker.title")}</h1>
        <p className="muted-copy">{t("worker.copy")}</p>
        <div className="review-project-row">
          <input
            className="path-input"
            value={projectRoot}
            placeholder={t("worker.projectRootPlaceholder")}
            onChange={(event) => onProjectRootChange(event.target.value)}
          />
          <button className="secondary-action" type="button" onClick={chooseProjectRoot}>
            {t("worker.browse")}
          </button>
          <button className="primary-action" type="button" disabled={!projectRoot} onClick={() => void refreshQueue()}>
            {t("worker.refresh")}
          </button>
        </div>
        <div className="worker-state-card">
          <strong>{externalResultCount ? t("worker.pendingResults", { count: externalResultCount }) : t("worker.noExternalResults")}</strong>
          <span>{t("worker.queuePolicy")}</span>
          <button className="text-button" type="button" onClick={onOpenReviewQueue}>
            {t("worker.openReviewQueue")}
          </button>
        </div>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel coding-worker-form" aria-labelledby="worker-task-title">
        <div className="panel-heading">
          <div>
            <h2 id="worker-task-title">{t("worker.taskTitle")}</h2>
            <p className="muted-copy">{t("worker.taskCopy")}</p>
          </div>
          <span className="pill">CodingAgentTask</span>
        </div>
        <label>
          {t("worker.titleLabel")}
          <input className="path-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          {t("worker.anchorLabel")}
          <input className="path-input" value={anchorText} placeholder="finding:finding-id / code_fact_node:node-id" onChange={(event) => setAnchorText(event.target.value)} />
        </label>
        <label>
          {t("worker.instructionLabel")}
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        </label>
        <div className="worker-grid-two">
          <label>
            {t("worker.allowedPaths")}
            <textarea value={allowedPaths} onChange={(event) => setAllowedPaths(event.target.value)} />
          </label>
          <label>
            {t("worker.forbiddenPaths")}
            <textarea value={forbiddenPaths} onChange={(event) => setForbiddenPaths(event.target.value)} />
          </label>
        </div>
        <div className="worker-grid-two">
          <label>
            {t("worker.acceptanceCriteria")}
            <textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} />
          </label>
          <label>
            {t("worker.verificationCommands")}
            <textarea value={verificationCommands} onChange={(event) => setVerificationCommands(event.target.value)} />
          </label>
        </div>
        <button className="primary-action" type="button" disabled={!projectRoot || busy} onClick={() => void generateTask()}>
          {t("worker.generateTask")}
        </button>
      </section>

      <section className="panel coding-worker-output" aria-labelledby="worker-payload-title">
        <div className="panel-heading">
          <div>
            <h2 id="worker-payload-title">{t("worker.payloadTitle")}</h2>
            <p className="muted-copy">{t("worker.payloadCopy")}</p>
          </div>
          <span className="pill">Pi</span>
        </div>
        <div className="action-row">
          <button className="secondary-action" type="button" disabled={!payloadText} onClick={() => void copyPayload()}>
            {t("worker.copyPayload")}
          </button>
          <button className="secondary-action" type="button" disabled={!payloadText || busy} onClick={() => void exportPayload()}>
            {t("worker.exportPayload")}
          </button>
        </div>
        <textarea className="worker-code-textarea" value={payloadText} placeholder={t("worker.noPayload")} onChange={(event) => setPayloadText(event.target.value)} />
      </section>

      <section className="panel coding-worker-import" aria-labelledby="worker-import-title">
        <div className="panel-heading">
          <div>
            <h2 id="worker-import-title">{t("worker.importTitle")}</h2>
            <p className="muted-copy">{t("worker.importCopy")}</p>
          </div>
          <span className="pill">ExternalAgentResult</span>
        </div>
        <textarea value={resultText} placeholder={t("worker.resultPlaceholder")} onChange={(event) => setResultText(event.target.value)} />
        <div className="action-row">
          <button className="secondary-action" type="button" disabled={!resultText.trim()} onClick={importResult}>
            {t("worker.importPiResult")}
          </button>
          <button className="primary-action" type="button" disabled={!normalizedResultText || busy} onClick={() => void acceptImportedResult()}>
            {t("worker.queueResult")}
          </button>
        </div>
        {importedResult ? (
          <div className="worker-state-card">
            <strong>{currentResultId ?? t("worker.normalizedResult")}</strong>
            <span>{importedResult.parsedJson ? t("worker.parsedJson") : t("worker.unstructuredText")}</span>
          </div>
        ) : null}
        <textarea className="worker-code-textarea" value={normalizedResultText} placeholder={t("worker.noNormalizedResult")} onChange={(event) => setNormalizedResultText(event.target.value)} />
      </section>
    </section>
  );
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAnchor(value: string): RuntimeGraphAnchor | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const separator = trimmed.indexOf(":");
  if (separator <= 0) return undefined;
  const kind = trimmed.slice(0, separator);
  const id = trimmed.slice(separator + 1);
  if (!id) return undefined;
  if (!isAnchorKind(kind)) return undefined;
  return { kind, id };
}

function isAnchorKind(value: string): value is RuntimeGraphAnchor["kind"] {
  return [
    "file",
    "symbol",
    "code_fact_node",
    "code_fact_edge",
    "architecture_module",
    "architecture_dependency",
    "finding",
    "task",
    "trace",
    "memory",
    "projection_node",
    "projection_edge"
  ].includes(value);
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
