import { useEffect, useState, type ReactNode } from "react";
import mermaid from "mermaid";
import { useI18n } from "../i18n";

export interface FullscreenMermaidDiagram {
  svg: string;
  title: string;
}

export interface MermaidFullscreenController {
  fullscreenDiagram: FullscreenMermaidDiagram | null;
  fullscreenZoom: number;
  setFullscreenDiagram: (diagram: FullscreenMermaidDiagram | null) => void;
  setFullscreenZoom: (zoom: number | ((current: number) => number)) => void;
  overlay: ReactNode;
}

export interface SemanticMermaidRenderContext {
  block: Element;
  rendered: HTMLElement;
  source: string;
  svg: string;
  index: number;
}

export interface RenderSemanticMermaidBlocksOptions {
  blocks: Element[];
  renderIdPrefix: string;
  fullscreenLabel: string;
  setFullscreenDiagram: (diagram: FullscreenMermaidDiagram) => void;
  setFullscreenZoom: (zoom: number) => void;
  securityLevel?: "strict" | "loose";
  decorateRendered?: (context: SemanticMermaidRenderContext) => void;
}

export function useUmlFullscreenViewer(resetKey: unknown): MermaidFullscreenController {
  const [fullscreenDiagram, setFullscreenDiagram] = useState<FullscreenMermaidDiagram | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);

  useEffect(() => {
    setFullscreenDiagram(null);
    setFullscreenZoom(1);
  }, [resetKey]);

  useEffect(() => {
    if (!fullscreenDiagram) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreenDiagram(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenDiagram]);

  return {
    fullscreenDiagram,
    fullscreenZoom,
    setFullscreenDiagram,
    setFullscreenZoom,
    overlay: fullscreenDiagram ? (
      <UmlFullscreenOverlay
        diagram={fullscreenDiagram}
        zoom={fullscreenZoom}
        onZoomChange={setFullscreenZoom}
        onClose={() => setFullscreenDiagram(null)}
      />
    ) : null
  };
}

export function UmlFullscreenOverlay({
  diagram,
  zoom,
  onZoomChange,
  onClose
}: {
  diagram: FullscreenMermaidDiagram;
  zoom: number;
  onZoomChange: (zoom: number | ((current: number) => number)) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="uml-fullscreen-backdrop" role="dialog" aria-modal="true" aria-label={diagram.title}>
      <div className="uml-fullscreen-toolbar">
        <strong>{diagram.title}</strong>
        <div>
          <button type="button" title={t("design.zoomOut")} aria-label={t("design.zoomOut")} onClick={() => onZoomChange((current) => clampUmlZoom(current - 0.15))}>-</button>
          <span>{t("design.umlZoom", { value: Math.round(zoom * 100) })}</span>
          <button type="button" title={t("design.zoomIn")} aria-label={t("design.zoomIn")} onClick={() => onZoomChange((current) => clampUmlZoom(current + 0.15))}>+</button>
          <button type="button" title={t("design.resetZoom")} aria-label={t("design.resetZoom")} onClick={() => onZoomChange(1)}>1:1</button>
          <button type="button" title={t("design.exitFullscreen")} aria-label={t("design.exitFullscreen")} onClick={onClose}>x</button>
        </div>
      </div>
      <div className="uml-fullscreen-canvas">
        <div
          className="uml-fullscreen-svg"
          style={{ width: `${Math.round(zoom * 100)}%`, minWidth: `${Math.round(720 * zoom)}px` }}
          dangerouslySetInnerHTML={{ __html: diagram.svg }}
        />
      </div>
    </div>
  );
}

export async function renderSemanticMermaidBlocks({
  blocks,
  renderIdPrefix,
  fullscreenLabel,
  setFullscreenDiagram,
  setFullscreenZoom,
  securityLevel = "strict",
  decorateRendered
}: RenderSemanticMermaidBlocksOptions) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel,
    theme: "dark",
    flowchart: { htmlLabels: true }
  });

  for (const [index, block] of blocks.entries()) {
    const source = normalizeMermaidRenderSource(block.textContent ?? "");
    if (!source) continue;
    const renderId = `${renderIdPrefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await mermaid.render(renderId, source);
      const rendered = document.createElement("div");
      rendered.className = "semantic-mermaid-render";
      rendered.innerHTML = result.svg;
      copySemanticAttributes(block, rendered);
      decorateMermaidSvg(rendered, source);
      decorateRendered?.({ block, rendered, source, svg: result.svg, index });
      addFullscreenAction({
        rendered,
        block,
        svg: result.svg,
        fullscreenLabel,
        setFullscreenDiagram,
        setFullscreenZoom
      });
      addC4LayerNavigator({
        rendered,
        block,
        renderIdPrefix,
        fullscreenLabel,
        setFullscreenDiagram,
        setFullscreenZoom
      });
      block.replaceWith(rendered);
    } catch (caught) {
      block.classList.add("semantic-mermaid-error");
      block.setAttribute("data-mermaid-error", caught instanceof Error ? caught.message : String(caught));
    }
  }
}

export function copySemanticAttributes(source: Element, target: Element) {
  for (const attribute of Array.from(source.attributes)) {
    if (!attribute.name.startsWith("data-praxis-")) continue;
    target.setAttribute(attribute.name, attribute.value);
  }
}

interface C4LayerView {
  level: string;
  label: string;
  title: string;
  diagramTitle: string;
  summary: string;
  docPath?: string;
  htmlPath?: string;
  mermaid: string;
  highlightLabels: string[];
  current?: boolean;
  missing?: boolean;
}

function addC4LayerNavigator({
  rendered,
  block,
  renderIdPrefix,
  fullscreenLabel,
  setFullscreenDiagram,
  setFullscreenZoom
}: {
  rendered: HTMLElement;
  block: Element;
  renderIdPrefix: string;
  fullscreenLabel: string;
  setFullscreenDiagram: (diagram: FullscreenMermaidDiagram) => void;
  setFullscreenZoom: (zoom: number) => void;
}) {
  const views = parseC4LayerViews(rendered.getAttribute("data-praxis-c4-layer-views"));
  if (views.length < 2) return;

  rendered.querySelector(".uml-viewer-actions")?.remove();
  rendered.classList.remove("has-uml-viewer-actions");
  rendered.classList.add("has-c4-layer-tabs");

  const navigator = document.createElement("div");
  navigator.className = "c4-layer-viewer";
  navigator.setAttribute("data-praxis-selection-ignore", "true");
  const heading = document.createElement("div");
  heading.className = "c4-layer-navigator-heading";
  const headingText = document.createElement("strong");
  headingText.textContent = "C4 层级";
  const hint = document.createElement("span");
  hint.textContent = "切换层级后高亮当前对象在该层的位置";
  heading.append(headingText, hint);

  const buttonRow = document.createElement("div");
  buttonRow.className = "c4-layer-buttons";
  const canvas = document.createElement("div");
  canvas.className = "c4-layer-canvas";
  const buttons: HTMLButtonElement[] = [];
  const fallbackTitle = mermaidDiagramTitle(block);

  for (const view of views) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `c4-layer-button ${view.current ? "is-current" : ""}`;
    button.textContent = view.label || c4LayerLabel(view.level);
    button.title = view.summary;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const candidate of buttons) candidate.classList.toggle("is-active", candidate === button);
      void renderC4LayerTab({
        view,
        canvas,
        renderIdPrefix,
        fallbackTitle,
        fullscreenLabel,
        setFullscreenDiagram,
        setFullscreenZoom
      });
    });
    buttons.push(button);
    buttonRow.append(button);
  }

  navigator.addEventListener("click", (event) => event.stopPropagation());
  navigator.append(heading, buttonRow, canvas);
  rendered.replaceChildren(navigator);
  const defaultIndex = Math.max(0, views.findIndex((view) => view.current));
  const initialView = views[defaultIndex] ?? views[0];
  if (!initialView) return;
  buttons[defaultIndex]?.classList.add("is-active");
  void renderC4LayerTab({
    view: initialView,
    canvas,
    renderIdPrefix,
    fallbackTitle,
    fullscreenLabel,
    setFullscreenDiagram,
    setFullscreenZoom
  });
}

async function renderC4LayerTab({
  view,
  canvas,
  renderIdPrefix,
  fallbackTitle,
  fullscreenLabel,
  setFullscreenDiagram,
  setFullscreenZoom
}: {
  view: C4LayerView;
  canvas: HTMLElement;
  renderIdPrefix: string;
  fallbackTitle: string;
  fullscreenLabel: string;
  setFullscreenDiagram: (diagram: FullscreenMermaidDiagram) => void;
  setFullscreenZoom: (zoom: number) => void;
}) {
  canvas.replaceChildren();
  const header = document.createElement("div");
  header.className = "c4-layer-canvas-header";
  const title = document.createElement("strong");
  title.textContent = view.title || view.diagramTitle || fallbackTitle;
  const summary = document.createElement("span");
  summary.textContent = view.summary || "查看当前对象在该 C4 层级中的位置。";
  header.append(title, summary);
  canvas.append(header);

  const body = document.createElement("div");
  body.className = "c4-layer-canvas-body";
  if (view.missing) {
    body.classList.add("c4-layer-canvas-empty");
    body.innerHTML = "";
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = `${view.label || c4LayerLabel(view.level)} 层尚未形成正式文档`;
    const emptyCopy = document.createElement("span");
    emptyCopy.textContent = view.summary || "当前对象在这一层没有可渲染的 C4 图；生成流程已保持为空状态，避免把证据不足的内容画成正式架构。";
    body.append(emptyTitle, emptyCopy);
    canvas.append(body);
    return;
  }
  body.textContent = "正在渲染层级投影...";
  canvas.append(body);

  try {
    const source = normalizeMermaidRenderSource(view.mermaid);
    const renderId = `${renderIdPrefix}-c4-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await mermaid.render(renderId, source);
    body.textContent = "";
    body.innerHTML = result.svg;
    decorateMermaidSvg(body, source);
    if (!view.current) highlightC4LayerPreview(body, view.highlightLabels);

    const actions = document.createElement("div");
    actions.className = "c4-layer-canvas-actions";
    if (view.htmlPath || view.docPath) {
      const pathChip = document.createElement("span");
      pathChip.textContent = view.htmlPath ?? view.docPath ?? "";
      actions.append(pathChip);
    }
    const fullscreenButton = document.createElement("button");
    fullscreenButton.type = "button";
    fullscreenButton.className = "uml-viewer-icon-button";
    fullscreenButton.title = fullscreenLabel;
    fullscreenButton.setAttribute("aria-label", fullscreenLabel);
    fullscreenButton.textContent = "⛶";
    fullscreenButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFullscreenZoom(1);
      setFullscreenDiagram({ svg: result.svg, title: view.title || fallbackTitle });
    });
    actions.append(fullscreenButton);
    header.append(actions);
  } catch (caught) {
    body.classList.add("c4-layer-canvas-error");
    body.textContent = caught instanceof Error ? caught.message : String(caught);
  }
}

function parseC4LayerViews(raw: string | null): C4LayerView[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): C4LayerView[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const level = stringField(record.level);
      const mermaidSource = stringField(record.mermaid);
      if (!level || !mermaidSource) return [];
      return [{
        level,
        label: stringField(record.label) ?? c4LayerLabel(level),
        title: stringField(record.title) ?? c4LayerLabel(level),
        diagramTitle: stringField(record.diagramTitle) ?? c4LayerLabel(level),
        summary: stringField(record.summary) ?? "",
        docPath: stringField(record.docPath),
        htmlPath: stringField(record.htmlPath),
        mermaid: mermaidSource,
        highlightLabels: stringArrayField(record.highlightLabels),
        current: Boolean(record.current),
        missing: Boolean(record.missing)
      }];
    });
  } catch {
    return [];
  }
}

function highlightC4LayerPreview(container: Element, labels: string[]) {
  const normalizedLabels = labels.map(normalizeC4LayerText).filter(Boolean);
  if (!normalizedLabels.length) return;
  const groups = Array.from(container.querySelectorAll("svg g.node"));
  for (const group of groups) {
    const text = normalizeC4LayerText(Array.from(group.querySelectorAll("text, tspan, span"))
      .map((item) => item.textContent ?? "")
      .join(" "));
    if (!text || !normalizedLabels.some((label) => text === label)) continue;
    group.classList.add("c4-layer-highlight-node");
  }
}

function normalizeC4LayerText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}/_.:-]+/gu, "")
    .toLowerCase()
    .trim();
}

function c4LayerLabel(level: string): string {
  if (level === "system_context") return "System";
  if (level === "container") return "Container";
  if (level === "component") return "Component";
  if (level === "code") return "Code";
  return level;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function addFullscreenAction({
  rendered,
  block,
  svg,
  fullscreenLabel,
  setFullscreenDiagram,
  setFullscreenZoom
}: {
  rendered: HTMLElement;
  block: Element;
  svg: string;
  fullscreenLabel: string;
  setFullscreenDiagram: (diagram: FullscreenMermaidDiagram) => void;
  setFullscreenZoom: (zoom: number) => void;
}) {
  rendered.classList.add("has-uml-viewer-actions");
  const title = mermaidDiagramTitle(block);
  const actions = document.createElement("div");
  actions.className = "uml-viewer-actions";
  actions.setAttribute("data-praxis-selection-ignore", "true");
  const fullscreenButton = document.createElement("button");
  fullscreenButton.type = "button";
  fullscreenButton.className = "uml-viewer-icon-button";
  fullscreenButton.title = fullscreenLabel;
  fullscreenButton.setAttribute("aria-label", fullscreenLabel);
  fullscreenButton.textContent = "⛶";
  fullscreenButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setFullscreenZoom(1);
    setFullscreenDiagram({ svg, title });
  });
  actions.addEventListener("click", (event) => event.stopPropagation());
  actions.append(fullscreenButton);
  rendered.prepend(actions);
}

function clampUmlZoom(value: number): number {
  return Math.min(3, Math.max(0.35, Number(value.toFixed(2))));
}

function mermaidDiagramTitle(block: Element): string {
  const section = block.closest(".diagram-section, .semantic-layer, .use-case-section, [data-praxis-anchor]");
  const heading = section?.querySelector("h1, h2, h3, h4")?.textContent?.trim();
  if (heading) return heading;
  const anchor = block.getAttribute("data-praxis-anchor") ?? section?.getAttribute("data-praxis-anchor");
  return anchor || "UML";
}

function normalizeMermaidRenderSource(value: string): string {
  let result = value.trim();
  for (let index = 0; index < 3; index += 1) {
    const fenced = result.match(/^```(?:mermaid|mmd)?[^\n]*\n([\s\S]*?)\n?```\s*$/i);
    if (!fenced) break;
    result = fenced[1]?.trim() ?? "";
  }
  const lines = result.split(/\r?\n/);
  if (lines.length >= 2) {
    if (/^```(?:mermaid|mmd)?[^\n]*$/i.test(lines[0]?.trim() ?? "")) lines.shift();
    if (/^```\s*$/.test(lines[lines.length - 1]?.trim() ?? "")) lines.pop();
    result = lines.join("\n").trim();
  }
  return sanitizeMermaidRenderNodeIds(normalizeMermaidRenderSequenceBoxSyntax(result));
}

function normalizeMermaidRenderSequenceBoxSyntax(source: string): string {
  const firstMeaningfulLine = source.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim().toLowerCase();
  if (firstMeaningfulLine !== "sequencediagram") return source;
  return source
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase() === "end box" ? "end" : line)
    .join("\n");
}

const FLOWCHART_RESERVED_RENDER_NODE_IDS = new Set([
  "end",
  "class",
  "click",
  "default",
  "direction",
  "flowchart",
  "graph",
  "linkstyle",
  "style",
  "subgraph"
]);

function sanitizeMermaidRenderNodeIds(source: string): string {
  const lines = source.split(/\r?\n/);
  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0)?.trim() ?? "";
  if (!/^(flowchart|graph)\b/i.test(firstMeaningfulLine)) return source;
  const definedIds = new Set<string>();
  for (const line of lines) {
    const id = flowchartRenderDefinitionId(line);
    if (id) definedIds.add(id);
  }
  const replacements = new Map<string, string>();
  for (const id of definedIds) {
    if (!FLOWCHART_RESERVED_RENDER_NODE_IDS.has(id.toLowerCase())) continue;
    replacements.set(id, nextSafeFlowchartRenderNodeId(id, definedIds, replacements));
  }
  if (!replacements.size) return source;
  return lines.map((line) => rewriteFlowchartRenderNodeIds(line, replacements)).join("\n");
}

function flowchartRenderDefinitionId(line: string): string | undefined {
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?=\[|\(|\{|\>)/);
  return match?.[1];
}

function nextSafeFlowchartRenderNodeId(id: string, used: Set<string>, replacements: Map<string, string>): string {
  const base = `${id}Node`;
  let candidate = base;
  let suffix = 2;
  while (
    used.has(candidate) ||
    Array.from(replacements.values()).includes(candidate) ||
    FLOWCHART_RESERVED_RENDER_NODE_IDS.has(candidate.toLowerCase())
  ) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function rewriteFlowchartRenderNodeIds(line: string, replacements: Map<string, string>): string {
  let result = line;
  for (const [from, to] of replacements.entries()) {
    const escaped = escapeRegExp(from);
    result = result.replace(new RegExp(`^(\\s*)${escaped}(\\s*(?=\\[|\\(|\\{|\\>|--|-\\.|==))`), `$1${to}$2`);
    result = result.replace(new RegExp(`((?:-->|---|==>|-\\.->|--[^\\n-]*-->|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`((?:--&gt;|---|==&gt;|-\\.-&gt;|--[^\\n-]*--&gt;|--\\|[^\\n|]*\\|))\\s*${escaped}\\b`, "g"), `$1 ${to}`);
    result = result.replace(new RegExp(`^(\\s*(?:style|class|click)\\s+)${escaped}\\b`), `$1${to}`);
    result = result.replace(new RegExp(`,\\s*${escaped}\\b`, "g"), `, ${to}`);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decorateMermaidSvg(rendered: Element, source: string) {
  const nodes = parseMermaidNodeIds(source);
  if (!nodes.length) return;
  const svgElements = Array.from(rendered.querySelectorAll("[id]"));
  for (const node of nodes) {
    const element = svgElements.find((candidate) => mermaidSvgElementMatchesNode(candidate.id, node.id));
    if (!element) continue;
    element.setAttribute("data-praxis-anchor", `mermaid:${node.id}`);
    element.setAttribute("data-praxis-kind", node.kind);
    element.setAttribute("data-praxis-layer", "base");
    element.setAttribute("data-praxis-status", "rendered");
    element.setAttribute("data-praxis-confidence", "derived");
  }
}

function parseMermaidNodeIds(source: string): Array<{ id: string; kind: string }> {
  const nodes: Array<{ id: string; kind: string }> = [];
  const seen = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\[|\()/);
    const id = match?.[1];
    if (!id || id === "flowchart" || seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, kind: mermaidNodeKind(id) });
  }
  return nodes;
}

function mermaidNodeKind(id: string): string {
  if (id.startsWith("actor_")) return "design_actor";
  if (id.startsWith("external_")) return "design_external_system";
  if (id.startsWith("useCase_")) return "design_use_case";
  return "use_case";
}

function mermaidSvgElementMatchesNode(elementId: string, nodeId: string): boolean {
  return elementId === nodeId || elementId.includes(`-${nodeId}-`) || elementId.endsWith(`-${nodeId}`);
}
