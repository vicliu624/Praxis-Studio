import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { readProjectFile } from "../runtimeClient";
import { CodeBlockPreview } from "./CodeBlockPreview";

export interface CodeEvidencePreviewEvidence {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  excerpt?: string;
  anchor?: string;
}

interface CodeEvidencePreviewProps {
  projectRoot: string;
  evidence: CodeEvidencePreviewEvidence;
  triggerLabel: string;
  pinLabel: string;
  unpinLabel: string;
  loadingLabel: string;
  unavailableLabel: string;
  fallbackLabel: string;
  maxHeight?: number;
}

interface CodeEvidenceReference {
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

type PreviewState =
  | { key: string; status: "idle" | "loading"; title?: string; meta?: string; code?: string; note?: string }
  | { key: string; status: "ready"; title: string; meta?: string; code: string; note?: string }
  | { key: string; status: "missing"; title?: string; meta?: string; code?: string; note: string };

const codePathPattern = /(?:[A-Za-z]:[\\/][^·•\n\r]+?|(?:\.{1,2}[\\/])?(?:[\w@.+-]+[\\/])+[\w@.+-]+\.(?:ts|tsx|js|jsx|mjs|cjs|rs|py|java|kt|go|cs|cpp|cxx|cc|h|hpp|css|scss|html|md|json|toml|ya?ml|xml|sql|sh|ps1|tsx?))(?:\b|$)/i;
const lineRangePattern = /(?:^|\s|[·•,:#(])(?:L)?(\d{1,7})(?:\s*[-:]\s*(?:L)?(\d{1,7}))?(?:\s|$|[),.;])/i;

export function CodeEvidencePreview({
  projectRoot,
  evidence,
  triggerLabel,
  pinLabel,
  unpinLabel,
  loadingLabel,
  unavailableLabel,
  fallbackLabel,
  maxHeight = 280
}: CodeEvidencePreviewProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ key: "", status: "idle" });
  const closeTimerRef = useRef<number | undefined>(undefined);
  const cacheRef = useRef<Record<string, PreviewState>>({});
  const reference = useMemo(() => parseCodeEvidenceReference(evidence), [evidence]);
  const referenceKey = [
    projectRoot,
    reference.filePath ?? "",
    reference.startLine ?? "",
    reference.endLine ?? "",
    evidence.excerpt ?? ""
  ].join(":");
  const open = pinned || hovered;
  const classes = [
    "code-evidence-preview",
    pinned ? "is-pinned" : "",
    open ? "is-open" : ""
  ].filter(Boolean).join(" ");

  function clearCloseTimer() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }

  function openPreview() {
    clearCloseTimer();
    setHovered(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setHovered(false), 180);
  }

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    scheduleClose();
  }

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open) return;
    const cached = cacheRef.current[referenceKey];
    if (cached) {
      setPreview(cached);
      return;
    }

    let cancelled = false;
    const fallbackCode = evidence.excerpt?.trim() ?? "";
    const filePath = normalizeProjectRelativePath(reference.filePath, projectRoot);
    const fallbackTitle = reference.filePath ?? evidence.label;
    const fallbackState = fallbackCode
      ? ({
          key: referenceKey,
          status: "ready",
          title: fallbackLabel,
          meta: evidence.anchor,
          code: fallbackCode,
          note: reference.filePath ? unavailableLabel : undefined
        } satisfies PreviewState)
      : ({
          key: referenceKey,
          status: "missing",
          title: fallbackTitle,
          note: unavailableLabel
        } satisfies PreviewState);

    if (!filePath) {
      cacheRef.current[referenceKey] = fallbackState;
      setPreview(fallbackState);
      return;
    }

    const loadingState: PreviewState = {
      key: referenceKey,
      status: "loading",
      title: filePath,
      meta: formatLineRange(reference.startLine, reference.endLine)
    };
    setPreview(loadingState);

    readProjectFile(projectRoot, filePath)
      .then((content) => {
        if (cancelled) return;
        const snippet = sourceSnippet(content, reference.startLine, reference.endLine);
        const nextState: PreviewState = {
          key: referenceKey,
          status: "ready",
          title: filePath,
          meta: snippet.meta,
          code: snippet.code
        };
        cacheRef.current[referenceKey] = nextState;
        setPreview(nextState);
      })
      .catch(() => {
        if (cancelled) return;
        cacheRef.current[referenceKey] = fallbackState;
        setPreview(fallbackState);
      });

    return () => {
      cancelled = true;
    };
  }, [evidence.anchor, evidence.excerpt, evidence.label, fallbackLabel, open, projectRoot, reference.endLine, reference.filePath, reference.startLine, referenceKey, unavailableLabel]);

  return (
    <span
      className={classes}
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClose}
      onFocus={openPreview}
      onBlur={handleBlur}
    >
      <button
        className="code-evidence-preview-trigger"
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setPinned((current) => !current);
        }}
      >
        {triggerLabel}
      </button>
      <span className="code-evidence-preview-panel" role="tooltip">
        <span className="code-evidence-preview-heading">
          <strong>{preview.title ?? evidence.label}</strong>
          <button
            className="secondary-action compact-action"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPinned((current) => !current);
            }}
          >
            {pinned ? unpinLabel : pinLabel}
          </button>
        </span>
        {preview.status === "loading" ? (
          <span className="code-evidence-preview-note">{loadingLabel}</span>
        ) : preview.status === "ready" && preview.code ? (
          <CodeBlockPreview
            code={preview.code}
            title={undefined}
            meta={preview.meta}
            maxHeight={maxHeight}
            className="code-evidence-preview-code"
          />
        ) : (
          <span className="code-evidence-preview-note">{preview.note}</span>
        )}
        {preview.note && preview.status === "ready" ? (
          <small className="code-evidence-preview-note">{preview.note}</small>
        ) : null}
      </span>
    </span>
  );
}

function parseCodeEvidenceReference(evidence: CodeEvidencePreviewEvidence): CodeEvidenceReference {
  const sources = [evidence.label, evidence.detail, evidence.id, evidence.anchor].filter((value): value is string => Boolean(value));
  const text = sources.join(" · ");
  const parts = text.split(/[·•]/).map((part) => part.trim()).filter(Boolean);
  const pathPartIndex = parts.findIndex((part) => codePathPattern.test(part));
  const pathSource = pathPartIndex >= 0 ? parts[pathPartIndex] : text;
  const filePath = cleanCodePath(pathSource.match(codePathPattern)?.[0]);
  const rangeSource = pathPartIndex >= 0
    ? [parts[pathPartIndex + 1], pathSource.slice(pathSource.indexOf(filePath ?? "") + (filePath?.length ?? 0))].filter(Boolean).join(" ")
    : text;
  const range = parseLineRange(rangeSource);
  return {
    filePath,
    startLine: range?.startLine,
    endLine: range?.endLine
  };
}

function cleanCodePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;:]+$/g, "")
    .replace(/\\/g, "/");
}

function parseLineRange(value: string): { startLine: number; endLine?: number } | undefined {
  const match = value.match(lineRangePattern);
  if (!match) return undefined;
  const startLine = Number(match[1]);
  const endLine = match[2] ? Number(match[2]) : undefined;
  if (!Number.isInteger(startLine) || startLine <= 0) return undefined;
  if (endLine !== undefined && (!Number.isInteger(endLine) || endLine < startLine)) return { startLine };
  return { startLine, endLine };
}

function normalizeProjectRelativePath(filePath: string | undefined, projectRoot: string): string | undefined {
  if (!filePath) return undefined;
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

function sourceSnippet(content: string, startLine: number | undefined, endLine: number | undefined): { code: string; meta: string } {
  const lines = content.split(/\r?\n/);
  const start = Math.min(Math.max(lines.length, 1), Math.max(1, startLine ?? 1));
  const requestedEnd = Math.max(start, endLine ?? Math.min(lines.length, start + 139));
  const cappedEnd = Math.min(lines.length, start + 219, requestedEnd);
  const width = String(cappedEnd).length;
  const code = lines
    .slice(start - 1, cappedEnd)
    .map((line, index) => `${String(start + index).padStart(width, " ")} | ${line}`)
    .join("\n");
  return {
    code,
    meta: formatLineRange(start, cappedEnd) ?? `L${start}`
  };
}

function formatLineRange(startLine: number | undefined, endLine: number | undefined): string | undefined {
  if (!startLine) return undefined;
  return endLine && endLine !== startLine ? `L${startLine}-L${endLine}` : `L${startLine}`;
}
