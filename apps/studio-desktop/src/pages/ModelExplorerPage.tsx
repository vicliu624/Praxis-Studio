import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ScopedAgentPanel, type ScopedAgentSubmitResult } from "../chat/ScopedAgentPanel";
import { renderSemanticMermaidBlocks, useUmlFullscreenViewer } from "../components/SemanticMermaidRenderer";
import { normalizeInternalTermsInHtmlDocument } from "../components/userFacingText";
import {
  discussArchitectureDiagram,
  discussDesignDiagram,
  discussEngineeringDiagram,
  readModelDocumentHtml,
  readModelDocumentMarkdown,
  readModelMapMarkdown,
  readModelSemanticHtml,
  runModelDiscovery,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";

interface ModelExplorerPageProps {
  projectRoot: string;
}

type ModelDocumentState = "idle" | "loading" | "ready" | "missing" | "generating" | "error";

interface UmlModelRegistry {
  schemaVersion: "praxis.umlModelRegistry.v1";
  generatedAt: string;
  projectVersion: string;
  summary: {
    modelCount: number;
    packageCount: number;
    elementCount?: number;
    diagramCount: number;
    traceCount: number;
    projectionCount?: number;
  };
  models: UmlModelEntry[];
  elements?: UmlModelElement[];
  projections?: UmlProjectionEntry[];
  traces: Array<{ id: string; relation: string; sourceId: string; targetId: string; summary: string }>;
}

interface UmlModelEntry {
  id: string;
  kind: string;
  title: string;
  viewpoint: string;
  abstractionLevel: string;
  purpose: string;
  docPath: string;
  htmlPath: string;
  packages: UmlPackageEntry[];
  elements?: UmlModelElement[];
  diagrams: UmlDiagramEntry[];
}

interface UmlPackageEntry {
  id: string;
  title: string;
  packagePath: string;
  summary: string;
  parentPackageId?: string;
  childPackageIds?: string[];
  level?: number;
  elementCount?: number;
  elements?: UmlModelElement[];
  diagramCount: number;
  diagrams: UmlDiagramEntry[];
}

interface UmlModelElement {
  id: string;
  kind: string;
  role: string;
  name: string;
  summary: string;
  modelId: string;
  packageId: string;
  packagePath: string;
  representedByDiagramIds: string[];
  status: string;
  confidence: string;
}

interface UmlDiagramEntry {
  id: string;
  kind: string;
  title: string;
  summary: string;
  modelId: string;
  packagePath: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: string;
  confidence: string;
  representedElements?: string[];
}

interface UmlProjectionEntry {
  id: string;
  kind: string;
  title: string;
  source: string;
  docPath: string;
  htmlPath: string;
  projectionOf: string[];
  status: string;
  confidence: string;
  summary: string;
}

interface ModelDocumentCardReference {
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
}

export function ModelExplorerPage({ projectRoot }: ModelExplorerPageProps) {
  const [rootHtml, setRootHtml] = useState("");
  const [rootMarkdown, setRootMarkdown] = useState("");
  const [activeHtml, setActiveHtml] = useState("");
  const [activeMarkdown, setActiveMarkdown] = useState("");
  const [activeDocumentPath, setActiveDocumentPath] = useState("");
  const [activeDocumentTitle, setActiveDocumentTitle] = useState("UML Model Registry");
  const [state, setState] = useState<ModelDocumentState>(projectRoot ? "loading" : "idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sideTab, setSideTab] = useState<"models" | "agent">("models");
  const registry = useMemo(() => parseModelRegistry(rootHtml), [rootHtml]);

  useEffect(() => {
    if (projectRoot) {
      void loadModelDocuments(projectRoot);
      return;
    }
    setRootHtml("");
    setRootMarkdown("");
    setActiveHtml("");
    setActiveMarkdown("");
    setActiveDocumentPath("");
    setActiveDocumentTitle("UML Model Registry");
    setState("idle");
    setStatus("");
    setError("");
  }, [projectRoot]);

  async function loadModelDocuments(root: string) {
    setState("loading");
    setStatus("正在读取 docs/models 模型注册表");
    setError("");
    try {
      const [html, markdown] = await Promise.all([readModelSemanticHtml(root), readModelMapMarkdown(root)]);
      if (!html?.trim() && !markdown?.trim()) {
        setRootHtml("");
        setRootMarkdown("");
        setActiveHtml("");
        setActiveMarkdown("");
        setActiveDocumentPath("");
        setState("missing");
        setStatus("docs/models/models-map 尚未生成");
        return;
      }
      const nextHtml = html ?? fallbackMarkdownHtml(markdown ?? "");
      setRootHtml(nextHtml);
      setRootMarkdown(markdown ?? "");
      setActiveHtml(nextHtml);
      setActiveMarkdown(markdown ?? "");
      setActiveDocumentPath("docs/models/models-map.html");
      setActiveDocumentTitle("UML Model Registry");
      setState("ready");
      setStatus("已载入 UML Model Registry");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("模型注册表读取失败");
    }
  }

  async function generateModelRegistry() {
    if (!projectRoot) return;
    setState("generating");
    setStatus("正在生成 UML Model Registry");
    setError("");
    try {
      await runModelDiscovery(projectRoot);
      await loadModelDocuments(projectRoot);
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("模型注册表生成失败");
    }
  }

  async function openModelDocument(document: UmlDiagramEntry | UmlModelEntry | UmlProjectionEntry | ModelDocumentCardReference) {
    const htmlPath = document.htmlPath;
    const markdownPath = "docPath" in document ? document.docPath : htmlPath.replace(/\.html$/i, ".md");
    setStatus(`正在读取 ${htmlPath}`);
    const [html, markdown] = await Promise.all([
      readModelDocumentHtml(projectRoot, htmlPath),
      readModelDocumentMarkdown(projectRoot, markdownPath)
    ]);
    if (!html?.trim() && !markdown?.trim()) {
      setError(`文档不存在：${htmlPath}`);
      setStatus("文档读取失败");
      return;
    }
    setActiveHtml(html ?? fallbackMarkdownHtml(markdown ?? ""));
    setActiveMarkdown(markdown ?? "");
    setActiveDocumentPath(htmlPath);
    setActiveDocumentTitle(document.title);
    setState("ready");
    setStatus(`已载入 ${document.title}`);
  }

  return (
    <div className="model-explorer-page">
      <header className="model-explorer-header">
        <span>UML 2.x Model</span>
        <h1>Model Explorer</h1>
        <p>这里用 UML Model / Package / Diagram / Trace 组织项目记忆。Design、Engineering 和 Architecture 只是投影入口。</p>
      </header>

      <section className="model-explorer-workspace">
        <aside className="panel model-left-panel">
          <h2>模型变化</h2>
          <p>来自 docs/models 的模型注册表和 Git 时间线。</p>
          {registry ? (
            <ol className="engineering-timeline-list">
              <li>
                <strong>UML Model Registry</strong>
                <time>{registry.generatedAt}</time>
                <p>组织 {registry.summary.modelCount} 个 Model、{registry.summary.packageCount} 个 Package、{registry.summary.elementCount ?? 0} 个 Element、{registry.summary.diagramCount} 张 Diagram。</p>
              </li>
            </ol>
          ) : (
            <div className="engineering-empty-note">尚未载入模型注册表。</div>
          )}
        </aside>

        <main className="model-main-panel">
          {registry ? (
            <section className="model-summary-grid">
              <ModelMetric label="Model" value={registry.summary.modelCount} />
              <ModelMetric label="Package" value={registry.summary.packageCount} />
              <ModelMetric label="Element" value={registry.summary.elementCount ?? 0} />
              <ModelMetric label="Diagram" value={registry.summary.diagramCount} />
              <ModelMetric label="Projection" value={registry.summary.projectionCount ?? registry.projections?.length ?? 0} />
              <ModelMetric label="Trace" value={registry.summary.traceCount} />
            </section>
          ) : null}

          {state === "missing" ? (
            <section className="panel model-generate-panel">
              <strong>缺少 UML Model Registry</strong>
              <span>当前项目还没有 docs/models/models-map.md。生成后，已有设计、工程和 C4 文档会被组织进统一 UML Model / Projection 体系。</span>
              <button className="primary-action" type="button" onClick={generateModelRegistry}>生成 Model Registry</button>
            </section>
          ) : state === "generating" ? (
            <section className="panel model-generate-panel">
              <strong>正在生成模型注册表</strong>
              <span>正在把已有 Design、Engineering、Architecture 文档归一到 UML Model / Package / Trace 结构。</span>
            </section>
          ) : (
            <section className="panel model-html-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activeDocumentTitle}</h2>
                  <p className="muted-copy">从 durable docs 渲染；当前文档只是 Model / Package / Diagram 的投影。</p>
                </div>
                <span className="pill">{activeDocumentPath || "docs/models/models-map.html"}</span>
              </div>
              <SemanticModelHtml html={activeHtml} onOpenDocumentCard={openModelDocument} />
            </section>
          )}
        </main>

        <aside className="panel model-side-panel">
          <div className="engineering-side-tabs" role="tablist" aria-label="Model Explorer side panel">
            <button className={sideTab === "models" ? "is-active" : ""} type="button" onClick={() => setSideTab("models")}>Models</button>
            <button className={sideTab === "agent" ? "is-active" : ""} type="button" onClick={() => setSideTab("agent")}>Agent</button>
          </div>
          <div className="engineering-side-tab-body">
            {sideTab === "models" ? (
              <ModelTree registry={registry} activePath={activeDocumentPath} onOpen={openModelDocument} />
            ) : (
              <ModelAgentPanel
                projectRoot={projectRoot}
                activeDocumentPath={activeDocumentPath}
                activeDocumentTitle={activeDocumentTitle}
                activeMarkdown={activeMarkdown}
                onDocumentsChanged={() => void loadModelDocuments(projectRoot)}
              />
            )}
          </div>
        </aside>
      </section>

      <footer className="engineering-status-bar">
        <span>项目：{projectRoot}</span>
        <span>文档：{modelDocumentStatusLabel(state)}</span>
        <span>{status}</span>
        {error ? <span>{error}</span> : null}
      </footer>
    </div>
  );
}

function ModelMetric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel engineering-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function ModelTree({
  registry,
  activePath,
  onOpen
}: {
  registry: UmlModelRegistry | null;
  activePath: string;
  onOpen: (document: UmlDiagramEntry | UmlModelEntry | UmlProjectionEntry) => void;
}) {
  const [expandedModelIds, setExpandedModelIds] = useState<Set<string>>(new Set());
  const [expandedPackageIds, setExpandedPackageIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!registry) return;
    setExpandedModelIds(new Set(registry.models.map((model) => model.id)));
    setExpandedPackageIds(new Set(registry.models.flatMap((model) => model.packages.filter((pkg) => !pkg.parentPackageId || pkg.packagePath === ".").map((pkg) => pkg.id))));
  }, [registry?.generatedAt]);
  if (!registry) return <div className="engineering-empty-note">尚未载入 docs/models。</div>;
  const projectionCount = registry.summary.projectionCount ?? registry.projections?.length ?? 0;
  return (
    <nav className="engineering-document-tree" aria-label="UML Model tree">
      <header>
        <strong>UML Models</strong>
        <span>Root · {registry.summary.modelCount} models · {projectionCount} projections</span>
      </header>
      <ol>
        {registry.models.map((model) => {
          const expanded = expandedModelIds.has(model.id);
          const packageRoots = rootPackagesForModel(model);
          return (
            <li key={model.id}>
              <div className="engineering-tree-category-row">
                <button
                  className="engineering-tree-toggle"
                  type="button"
                  onClick={() => {
                    setExpandedModelIds((current) => {
                      const next = new Set(current);
                      if (next.has(model.id)) next.delete(model.id);
                      else next.add(model.id);
                      return next;
                    });
                  }}
                  aria-label={expanded ? "Collapse" : "Expand"}
                >
                  {expanded ? "-" : "+"}
                </button>
                <button type="button" className={activePath === model.htmlPath ? "is-active" : ""} onClick={() => onOpen(model)}>
                  <span>{model.title}</span>
                  <em>{model.diagrams.length}</em>
                </button>
              </div>
              {expanded ? (
                <ol>
                  {packageRoots.map((pkg) => renderModelPackageTree(model, pkg, activePath, onOpen, expandedPackageIds, setExpandedPackageIds))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
      {registry.projections?.length ? (
        <>
          <header className="model-tree-projection-header">
            <strong>Projections</strong>
            <span>{registry.projections.length}</span>
          </header>
          <ol>
            {registry.projections.map((projection) => (
              <li key={projection.id}>
                <button
                  type="button"
                  className={activePath === projection.htmlPath ? "is-active" : ""}
                  onClick={() => onOpen(projection)}
                  title={projection.summary}
                >
                  <span>{projection.title}</span>
                  <small>{projection.source} · {projection.confidence}</small>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </nav>
  );
}

function rootPackagesForModel(model: UmlModelEntry): UmlPackageEntry[] {
  const root = model.packages.find((pkg) => pkg.packagePath === ".");
  const rootChildren = root ? model.packages.filter((pkg) => pkg.parentPackageId === root.id) : [];
  if (rootChildren.length) return rootChildren;
  return model.packages.filter((pkg) => !pkg.parentPackageId);
}

function renderModelPackageTree(
  model: UmlModelEntry,
  pkg: UmlPackageEntry,
  activePath: string,
  onOpen: (document: UmlDiagramEntry | UmlModelEntry | UmlProjectionEntry) => void,
  expandedPackageIds: Set<string>,
  setExpandedPackageIds: (next: Set<string> | ((current: Set<string>) => Set<string>)) => void
) {
  const children = model.packages.filter((candidate) => candidate.parentPackageId === pkg.id);
  const expanded = expandedPackageIds.has(pkg.id);
  const elementCount = pkg.elementCount ?? pkg.elements?.length ?? 0;
  return (
    <li key={pkg.id}>
      <div className="engineering-tree-category-row model-tree-package-row">
        <button
          className="engineering-tree-toggle"
          type="button"
          onClick={() => {
            setExpandedPackageIds((current) => {
              const next = new Set(current);
              if (next.has(pkg.id)) next.delete(pkg.id);
              else next.add(pkg.id);
              return next;
            });
          }}
          aria-label={expanded ? "Collapse package" : "Expand package"}
        >
          {expanded ? "-" : "+"}
        </button>
        <span className="model-tree-package">
          <strong>{pkg.title}</strong>
          <small>{elementCount} elements · {pkg.diagramCount} diagrams</small>
        </span>
      </div>
      {expanded ? (
        <ol>
          {children.map((child) => renderModelPackageTree(model, child, activePath, onOpen, expandedPackageIds, setExpandedPackageIds))}
          {(pkg.elements ?? []).map((element) => {
            const diagram = model.diagrams.find((candidate) => element.representedByDiagramIds.includes(candidate.id));
            return (
              <li key={element.id}>
                <button
                  type="button"
                  className={diagram && activePath === diagram.htmlPath ? "is-active" : ""}
                  onClick={() => diagram && onOpen(diagram)}
                  title={element.summary}
                  disabled={!diagram}
                >
                  <span>{element.name}</span>
                  <small>{element.kind} · {element.confidence}</small>
                </button>
              </li>
            );
          })}
          {pkg.diagrams.map((diagram) => (
            <li key={diagram.id}>
              <button
                type="button"
                className={activePath === diagram.htmlPath ? "is-active" : ""}
                onClick={() => onOpen(diagram)}
                title={diagram.summary}
              >
                <span>{diagram.title}</span>
                <small>{diagram.kind} · {diagram.confidence}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function SemanticModelHtml({
  html,
  onOpenDocumentCard
}: {
  html: string;
  onOpenDocumentCard: (document: ModelDocumentCardReference) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizeModelHtml(html), [html]);
  const umlFullscreen = useUmlFullscreenViewer(safeHtml);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const scrollTop = host.scrollTop;
    const scrollLeft = host.scrollLeft;
    const nextHost = document.createElement("div");
    nextHost.innerHTML = safeHtml;
    const blocks = Array.from(nextHost.querySelectorAll("pre.mermaid"));
    void renderSemanticMermaidBlocks({
      blocks,
      renderIdPrefix: "praxis-model-explorer",
      fullscreenLabel: "全屏查看 UML",
      setFullscreenDiagram: (diagram) => umlFullscreen.setFullscreenDiagram(diagram),
      setFullscreenZoom: (zoom) => umlFullscreen.setFullscreenZoom(zoom),
      securityLevel: "strict"
    }).then(() => {
      if (!active) return;
      host.replaceChildren(...Array.from(nextHost.childNodes));
      window.requestAnimationFrame(() => {
        host.scrollTop = scrollTop;
        host.scrollLeft = scrollLeft;
      });
    });
    return () => {
      active = false;
    };
  }, [safeHtml]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const card = documentCardReferenceFromTarget(event.target);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenDocumentCard(card);
  }

  return (
    <>
      <div ref={hostRef} className="model-semantic-html semantic-design-html" onClick={handleClick} />
      {umlFullscreen.overlay}
    </>
  );
}

function ModelAgentPanel({
  projectRoot,
  activeDocumentPath,
  activeDocumentTitle,
  activeMarkdown,
  onDocumentsChanged
}: {
  projectRoot: string;
  activeDocumentPath: string;
  activeDocumentTitle: string;
  activeMarkdown: string;
  onDocumentsChanged: () => void;
}) {
  async function handleSubmit(text: string, conversationHistory: RuntimeScopedAgentHistoryEntry[]): Promise<ScopedAgentSubmitResult> {
    const path = activeDocumentPath || "docs/models/models-map.html";
    if (path.includes("/design/") || path.startsWith("docs/design/")) {
      const useCaseId = useCaseIdFromPath(path) ?? "use-case:unknown";
      const result = await discussDesignDiagram(projectRoot, useCaseId, text, {
        conversationHistory,
        currentUml: {
          id: path,
          kind: "model_projection",
          title: activeDocumentTitle,
          htmlPath: path,
          markdownPath: path.replace(/\.html$/i, ".md"),
          currentDocumentHtmlExcerpt: "",
          currentDocumentMarkdownExcerpt: activeMarkdown.slice(0, 12000)
        }
      });
      return {
        text: formatGenericAgentResult(result),
        intent: result.intent,
        status: result.ok ? "done" : "failed",
        documentEdits: result.documentEdits,
        provider: result.provider
      };
    }
    if (path.includes("/architecture/") || path.startsWith("docs/architecture/")) {
      const result = await discussArchitectureDiagram(projectRoot, path, activeDocumentTitle, text, undefined, conversationHistory);
      return {
        text: formatGenericAgentResult(result),
        intent: result.intent,
        status: result.ok ? "done" : "failed",
        documentEdits: result.documentEdits,
        provider: result.provider
      };
    }
    if (path.includes("/engineering/") || path.startsWith("docs/engineering/")) {
      const result = await discussEngineeringDiagram(projectRoot, path, activeDocumentTitle, text, undefined, conversationHistory);
      return {
        text: formatGenericAgentResult(result),
        intent: result.intent,
        status: result.ok ? "done" : "failed",
        documentEdits: result.documentEdits,
        provider: result.provider
      };
    }
    return {
      text: [
        "当前选中的是 UML Model Registry 本身。",
        "",
        "Model Registry 只负责组织 Model / Package / Diagram / Trace。若要修改具体 UML，请先在左侧选择某个具体 diagram 文档；agent 会按该文档所在的 Model 投影范围行动。"
      ].join("\n"),
      intent: "explain",
      status: "done"
    };
  }

  return (
    <ScopedAgentPanel
      projectRoot={projectRoot}
      className="engineering-agent-panel"
      textareaId="model-agent-input"
      ariaLabel="Model Agent"
      scope={{
        id: `model:${activeDocumentPath || "registry"}`,
        title: "Model Agent",
        copy: "同一个 agent，当前被约束在选中的 UML Model / Package / Diagram 上。",
        modeLabel: "model scope",
        placeholder: "讨论当前 Model、Package、Diagram、Trace 或请求联动修改...",
        inputLabel: "消息",
        emptyTitle: "Model Agent",
        emptyCopy: "选择具体 diagram 后，agent 会把对话绑定到当前文档和相关模型。",
        scopeKind: "model",
        contextTitle: activeDocumentTitle,
        contextPath: activeDocumentPath
      }}
      onSubmit={handleSubmit}
      onResult={(result) => {
        if (result.documentEdits?.some((edit) => edit.changed && edit.status === "applied")) onDocumentsChanged();
      }}
    />
  );
}

function parseModelRegistry(html: string): UmlModelRegistry | null {
  const match = html.match(/<script[^>]+id=["']praxis-uml-model-registry["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1].replace(/\\u003c/g, "<")) as UmlModelRegistry;
    return parsed.schemaVersion === "praxis.umlModelRegistry.v1" ? parsed : null;
  } catch {
    return null;
  }
}

function documentCardReferenceFromTarget(target: EventTarget | null): ModelDocumentCardReference | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest("[data-praxis-document-html]");
  if (!card) return null;
  const htmlPath = card.getAttribute("data-praxis-document-html") ?? "";
  if (!htmlPath) return null;
  return {
    title: card.getAttribute("data-praxis-document-title") ?? htmlPath,
    summary: card.getAttribute("data-praxis-document-summary") ?? "",
    docPath: card.getAttribute("data-praxis-document-md") ?? htmlPath.replace(/\.html$/i, ".md"),
    htmlPath
  };
}

function sanitizeModelHtml(html: string): string {
  const sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "");
  const doc = new DOMParser().parseFromString(sanitized, "text/html");
  normalizeInternalTermsInHtmlDocument(doc);
  return doc.body.innerHTML;
}

function fallbackMarkdownHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<main class="praxis-model-registry"><pre>${escaped}</pre></main>`;
}

function modelDocumentStatusLabel(state: ModelDocumentState): string {
  if (state === "ready") return "已载入";
  if (state === "missing") return "缺失";
  if (state === "generating") return "生成中";
  if (state === "error") return "错误";
  if (state === "loading") return "读取中";
  return "空闲";
}

function useCaseIdFromPath(path: string): string | undefined {
  const match = path.match(/docs\/design\/use-case-diagrams\/([^/\\]+)(?:\/|\.html$)/);
  return match?.[1] ? `use-case:${match[1]}` : undefined;
}

function formatGenericAgentResult(result: {
  answer?: string;
  guidance?: string;
  intent?: string;
  risks?: string[];
  questions?: string[];
  documentEdits?: Array<{ path: string; status: string; changed: boolean; message: string }>;
}): string {
  const lines = [
    result.answer || result.guidance || "Agent 已完成当前模型上下文内的处理。"
  ];
  if (result.guidance && result.guidance !== result.answer) lines.push("", result.guidance);
  if (result.documentEdits?.length) {
    lines.push("", "Document edits:");
    for (const edit of result.documentEdits) {
      lines.push(`- ${edit.path} (${edit.status}${edit.changed ? ", changed" : ""}): ${edit.message}`);
    }
  }
  if (result.risks?.length) {
    lines.push("", "Risks:");
    for (const risk of result.risks) lines.push(`- ${risk}`);
  }
  if (result.questions?.length) {
    lines.push("", "Questions:");
    for (const question of result.questions) lines.push(`- ${question}`);
  }
  return lines.join("\n");
}
