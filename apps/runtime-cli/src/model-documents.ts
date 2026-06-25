import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readProjectGitVersion, readProjectSemanticVersion, type DesignGitVersionInfo } from "./design-documents.js";

export const UML_MODEL_ROOT_DOC_RELATIVE_PATH = "docs/models/models-map.md";
export const UML_MODEL_ROOT_HTML_RELATIVE_PATH = "docs/models/models-map.html";
export const UML_MODEL_REGISTRY_START = "<!-- praxis:uml-model-registry:start -->";
export const UML_MODEL_REGISTRY_END = "<!-- praxis:uml-model-registry:end -->";

type UmlModelKind =
  | "organization_process"
  | "software_structure"
  | "deployment_artifact";

type UmlDiagramKind =
  | "use_case"
  | "activity"
  | "class"
  | "component"
  | "composite_structure"
  | "sequence"
  | "communication"
  | "state_machine"
  | "deployment"
  | "object"
  | "package"
  | "architecture_projection"
  | "technical_hotspot";

type UmlModelStatus = "candidate" | "inference" | "confirmed";

type UmlElementKind =
  | "package"
  | "actor"
  | "use_case"
  | "class"
  | "component"
  | "interface"
  | "port"
  | "connector"
  | "property"
  | "operation"
  | "activity"
  | "state_machine"
  | "interaction"
  | "artifact"
  | "node"
  | "device"
  | "execution_environment"
  | "deployment"
  | "deployment_specification"
  | "communication_path"
  | "instance_specification"
  | "slot"
  | "unknown";

type UmlElementRole =
  | "namespace"
  | "classifier"
  | "feature"
  | "internal_structure"
  | "owned_behavior"
  | "artifact"
  | "deployment_target"
  | "relationship"
  | "projection";

type UmlProjectionKind =
  | "design_explorer"
  | "engineering_explorer"
  | "architecture_c4";

export interface UmlModelRegistry {
  schemaVersion: "praxis.umlModelRegistry.v1";
  generatedAt: string;
  projectVersion: string;
  git: DesignGitVersionInfo;
  rootDocPath: string;
  rootHtmlPath: string;
  summary: {
    modelCount: number;
    packageCount: number;
    elementCount: number;
    diagramCount: number;
    traceCount: number;
    projectionCount: number;
  };
  principles: string[];
  models: UmlModelEntry[];
  elements: UmlModelElement[];
  projections: UmlProjectionEntry[];
  traces: UmlTraceLink[];
  /** @deprecated Use projections. Kept for v0.1 compatibility with older documents. */
  legacyProjections: UmlLegacyProjection[];
}

export interface UmlModelEntry {
  id: string;
  kind: UmlModelKind;
  title: string;
  viewpoint: string;
  stakeholder: string[];
  abstractionLevel: string;
  purpose: string;
  authority: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: UmlModelStatus;
  packages: UmlPackageEntry[];
  elements: UmlModelElement[];
  diagrams: UmlDiagramEntry[];
}

export interface UmlPackageEntry {
  id: string;
  title: string;
  packagePath: string;
  summary: string;
  modelId: string;
  parentPackageId?: string;
  childPackageIds: string[];
  level: number;
  elementCount: number;
  elements: UmlModelElement[];
  diagramCount: number;
  diagrams: UmlDiagramEntry[];
}

export interface UmlModelElement {
  id: string;
  kind: UmlElementKind;
  role: UmlElementRole;
  name: string;
  summary: string;
  modelId: string;
  packageId: string;
  packagePath: string;
  ownerElementId?: string;
  representedByDiagramIds: string[];
  traceIds: string[];
  status: UmlModelStatus;
  confidence: "low" | "medium" | "high";
  sourcePaths: string[];
}

export interface UmlDiagramEntry {
  id: string;
  kind: UmlDiagramKind;
  title: string;
  summary: string;
  modelId: string;
  packagePath: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: UmlModelStatus;
  confidence: "low" | "medium" | "high";
  projectionOf?: string[];
  representedElements: string[];
}

export interface UmlTraceLink {
  id: string;
  relation: "trace" | "refine" | "realize" | "project";
  sourceId: string;
  targetId: string;
  summary: string;
  sourceModelId?: string;
  targetModelId?: string;
}

export interface UmlProjectionEntry {
  id: string;
  kind: UmlProjectionKind;
  title: string;
  source: "design" | "engineering" | "architecture";
  docPath: string;
  htmlPath: string;
  projectionOf: string[];
  status: UmlModelStatus;
  confidence: "low" | "medium" | "high";
  summary: string;
  diagrams: UmlDiagramEntry[];
}

export interface UmlLegacyProjection {
  id: string;
  title: string;
  source: "design" | "engineering" | "architecture";
  docPath: string;
  htmlPath: string;
  modelId: string;
  status: UmlModelStatus;
  summary: string;
}

interface EngineeringMapIndexLike {
  categories?: Array<{
    kind?: string;
    title?: string;
    summary?: string;
    items?: Array<{
      id?: string;
      kind?: string;
      title?: string;
      summary?: string;
      docPath?: string;
      htmlPath?: string;
      anchor?: string;
      status?: string;
      confidence?: string;
      scope?: {
        packageId?: string;
        filePath?: string;
      };
    }>;
  }>;
}

interface ArchitectureMapIndexLike {
  categories?: Array<{
    level?: string;
    title?: string;
    summary?: string;
    items?: Array<{
      id?: string;
      level?: string;
      title?: string;
      summary?: string;
      docPath?: string;
      htmlPath?: string;
      anchor?: string;
      status?: string;
      confidence?: string;
      scope?: {
        packageId?: string;
      };
    }>;
  }>;
}

interface InteractionModelLike {
  useCases?: Array<{
    id?: string;
    title?: string;
    summary?: string;
    status?: string;
    confidence?: string;
    contextId?: string;
  }>;
  contexts?: Array<{
    id?: string;
    title?: string;
    summary?: string;
    kind?: string;
    parentContextId?: string;
    scope?: string;
    responsibility?: string;
    businessTerms?: string[];
  }>;
  useCaseDrilldowns?: Array<{
    id?: string;
    useCaseId?: string;
    kind?: string;
    title?: string;
    summary?: string;
    status?: string;
    confidence?: string;
    htmlPath?: string;
    markdownPath?: string;
  }>;
}

export async function buildUmlModelRegistry(root: string, generatedAt = new Date().toISOString()): Promise<UmlModelRegistry> {
  const projectVersion = await readProjectSemanticVersion(root) ?? "0.1.0";
  const git = await readProjectGitVersion(root);
  const design = await readDesignModelProjection(root);
  const engineering = await readEngineeringModelProjection(root);
  const architecture = await readArchitectureModelProjection(root);

  const organizationModel = organizationProcessModel(design);
  const softwareModel = softwareStructureModel(engineering);
  const deploymentModel = deploymentArtifactModel(engineering);
  const models = [organizationModel, softwareModel, deploymentModel];
  const projections = buildProjectionEntries(design, engineering, architecture);
  const traces = buildTraceLinks(models, projections);
  const packageCount = models.reduce((sum, model) => sum + model.packages.length, 0);
  const elementCount = models.reduce((sum, model) => sum + model.elements.length, 0);
  const diagramCount = models.reduce((sum, model) => sum + model.diagrams.length, 0);
  const legacyProjections = [
    legacyProjection("legacy:design", "组织/过程模型投影", "design", "docs/design/use-case-diagrams-maps.md", "docs/design/use-case-diagrams-maps.html", organizationModel.id, design.available),
    legacyProjection("legacy:engineering", "软件结构模型投影", "engineering", "docs/engineering/engineering-maps.md", "docs/engineering/engineering-maps.html", softwareModel.id, engineering.available),
    legacyProjection("legacy:architecture", "C4 架构投影", "architecture", "docs/architecture/c4/c4-model-maps.md", "docs/architecture/c4/c4-model-maps.html", softwareModel.id, architecture.available)
  ];

  return {
    schemaVersion: "praxis.umlModelRegistry.v1",
    generatedAt,
    projectVersion,
    git,
    rootDocPath: UML_MODEL_ROOT_DOC_RELATIVE_PATH,
    rootHtmlPath: UML_MODEL_ROOT_HTML_RELATIVE_PATH,
    summary: {
      modelCount: models.length,
      packageCount,
      elementCount,
      diagramCount,
      traceCount: traces.length,
      projectionCount: projections.length
    },
    principles: [
      "业务与技术通过 Model 的 viewpoint、stakeholder 和 abstraction level 区分，而不是通过 UML 图种硬编码分层。",
      "整体到局部使用 Model -> Package -> Classifier -> Feature / internal structure / owned Behavior 组织。",
      "Structure Diagram 与 Behavior Diagram 是正交视角；同一 Package 可以拥有多张互补图。",
      "C4 只能作为架构视角投影存在，不是 docs 记忆中的独立真相源。",
      "内部仓库分析指标、关系计数和工具节点 ID 只是证据与生成过程，不得成为用户可见模型语言。"
    ],
    models,
    elements: models.flatMap((model) => model.elements),
    projections,
    traces,
    legacyProjections
  };
}

export async function writeUmlModelRegistryDocuments(root: string, registry?: UmlModelRegistry): Promise<{
  markdownPath: string;
  htmlPath: string;
  registry: UmlModelRegistry;
}> {
  const modelRegistry = registry ?? await buildUmlModelRegistry(root);
  const markdownPath = path.join(root, UML_MODEL_ROOT_DOC_RELATIVE_PATH);
  const htmlPath = path.join(root, UML_MODEL_ROOT_HTML_RELATIVE_PATH);
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, renderUmlModelRegistryMarkdown(modelRegistry), "utf8");
  await writeFile(htmlPath, renderUmlModelRegistryHtml(modelRegistry), "utf8");
  for (const model of modelRegistry.models) {
    const modelMarkdownPath = path.join(root, model.docPath);
    const modelHtmlPath = path.join(root, model.htmlPath);
    await mkdir(path.dirname(modelMarkdownPath), { recursive: true });
    await writeFile(modelMarkdownPath, renderUmlModelDocumentMarkdown(modelRegistry, model), "utf8");
    await writeFile(modelHtmlPath, renderUmlModelDocumentHtml(modelRegistry, model), "utf8");
  }
  return { markdownPath, htmlPath, registry: modelRegistry };
}

function organizationProcessModel(projection: DesignProjection): UmlModelEntry {
  const diagrams = projection.diagrams.length ? projection.diagrams : [placeholderDiagram({
    id: "model:organization-process:missing-design",
    modelId: "model:organization-process",
    kind: "use_case",
    title: "尚未生成组织/过程模型",
    summary: "运行 Design Discovery 后，这里会显示 UseCase、Activity、Interaction、StateMachine 和业务概念类图。",
    docPath: "docs/design/use-case-diagrams-maps.md",
    htmlPath: "docs/design/use-case-diagrams-maps.html",
    packagePath: "candidate"
  })];
  return modelEntry({
    id: "model:organization-process",
    kind: "organization_process",
    title: "组织 / 过程模型",
    viewpoint: "描述参与者、业务过程、用例目标、可观察结果和业务概念",
    stakeholder: ["业务负责人", "产品负责人", "领域专家", "开发者"],
    abstractionLevel: "system intent / business process / observable behavior",
    purpose: "解释系统要改变或稳定的业务秩序；UseCase 不描述 subject 内部结构，内部结构由 Trace / Refine 连接到软件结构模型。",
    authority: "docs/models/organization-process 是归一化模型目录；docs/design 作为组织/过程模型的兼容投影输入共同承载。",
    diagrams
  });
}

function softwareStructureModel(projection: EngineeringProjection): UmlModelEntry {
  const diagrams = projection.diagrams.filter((item) => item.kind !== "deployment" && item.kind !== "technical_hotspot");
  return modelEntry({
    id: "model:software-structure",
    kind: "software_structure",
    title: "软件结构模型",
    viewpoint: "描述 Package、Component、Interface、Port、Class、Connector、结构协作和运行时 Interaction",
    stakeholder: ["架构师", "开发者", "维护者", "评审者"],
    abstractionLevel: "package / component / classifier / owned behavior",
    purpose: "解释软件如何被模块化、如何通过接口协作、哪些结构承载业务用例；不把目录、调用密度或工具指标当成模型对象。",
    authority: "docs/models/software-structure 是归一化模型目录；docs/engineering 作为软件结构模型的兼容投影输入共同承载。",
    diagrams: diagrams.length ? diagrams : [placeholderDiagram({
      id: "model:software-structure:missing-engineering",
      modelId: "model:software-structure",
      kind: "package",
      title: "尚未生成软件结构模型",
      summary: "运行 Engineering Discovery 后，这里会显示 Package、Component、Class、Sequence 和技术热点投影。",
      docPath: "docs/engineering/engineering-maps.md",
      htmlPath: "docs/engineering/engineering-maps.html",
      packagePath: "candidate"
    })]
  });
}

function buildProjectionEntries(design: DesignProjection, engineering: EngineeringProjection, architecture: ArchitectureProjection): UmlProjectionEntry[] {
  return [
    {
      id: "projection:design-explorer",
      kind: "design_explorer",
      title: "Design Explorer 投影",
      source: "design",
      docPath: "docs/design/use-case-diagrams-maps.md",
      htmlPath: "docs/design/use-case-diagrams-maps.html",
      projectionOf: ["model:organization-process"],
      status: design.available ? "candidate" : "inference",
      confidence: design.available ? "high" : "low",
      summary: design.available
        ? "从组织/过程模型投影出业务故事、Use Case 和第一层下钻图。"
        : "Design Explorer 投影文档尚未生成；应由 agent 根据项目意图或仓库证据补齐。",
      diagrams: design.diagrams
    },
    {
      id: "projection:engineering-explorer",
      kind: "engineering_explorer",
      title: "Engineering Explorer 投影",
      source: "engineering",
      docPath: "docs/engineering/engineering-maps.md",
      htmlPath: "docs/engineering/engineering-maps.html",
      projectionOf: ["model:software-structure", "model:deployment-artifact"],
      status: engineering.available ? "candidate" : "inference",
      confidence: engineering.available ? "high" : "low",
      summary: engineering.available
        ? "从软件结构模型与制品/部署模型投影出工程结构、协作、运行链路和复杂度候选。"
        : "Engineering Explorer 投影文档尚未生成；应由 agent 根据本地仓库证据补齐。",
      diagrams: engineering.diagrams
    },
    {
      id: "projection:architecture-c4",
      kind: "architecture_c4",
      title: "Architecture Explorer / C4 投影",
      source: "architecture",
      docPath: "docs/architecture/c4/c4-model-maps.md",
      htmlPath: "docs/architecture/c4/c4-model-maps.html",
      projectionOf: ["model:organization-process", "model:software-structure", "model:deployment-artifact"],
      status: architecture.available ? "candidate" : "inference",
      confidence: architecture.available ? "high" : "low",
      summary: architecture.available
        ? "把三类 UML Model 投影为 C4 的 System Context、Container、Component 与 Code 缩放层级。"
        : "C4 投影文档尚未生成；它必须从已有模型和仓库证据派生，不能成为独立真相源。",
      diagrams: architecture.diagrams
    }
  ];
}

function inferModelElements(modelId: string, modelKind: UmlModelKind, diagrams: UmlDiagramEntry[]): UmlModelElement[] {
  const elements = new Map<string, UmlModelElement>();
  for (const diagram of diagrams) {
    const descriptor = elementDescriptorForDiagram(modelKind, diagram);
    const name = primaryElementName(diagram);
    const packagePath = normalizePackagePath(diagram.packagePath);
    const id = `${modelId}:element:${safeId(`${descriptor.kind}:${name}:${diagram.anchor}`)}`;
    const existing = elements.get(id);
    if (existing) {
      existing.representedByDiagramIds.push(diagram.id);
      existing.sourcePaths = uniqueStrings([...existing.sourcePaths, diagram.docPath, diagram.htmlPath]);
      continue;
    }
    elements.set(id, {
      id,
      kind: descriptor.kind,
      role: descriptor.role,
      name,
      summary: elementSummary(modelKind, diagram, descriptor.kind, descriptor.role),
      modelId,
      packageId: packageIdFor(modelId, packagePath),
      packagePath,
      representedByDiagramIds: [diagram.id],
      traceIds: [],
      status: diagram.status,
      confidence: diagram.confidence,
      sourcePaths: uniqueStrings([diagram.docPath, diagram.htmlPath])
    });
  }
  return [...elements.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function elementDescriptorForDiagram(modelKind: UmlModelKind, diagram: UmlDiagramEntry): { kind: UmlElementKind; role: UmlElementRole } {
  if (diagram.kind === "use_case") return { kind: "use_case", role: "classifier" };
  if (diagram.kind === "activity") return { kind: "activity", role: "owned_behavior" };
  if (diagram.kind === "sequence" || diagram.kind === "communication") return { kind: "interaction", role: "owned_behavior" };
  if (diagram.kind === "state_machine") return { kind: "state_machine", role: "owned_behavior" };
  if (diagram.kind === "class") return { kind: "class", role: "classifier" };
  if (diagram.kind === "component") return { kind: "component", role: "classifier" };
  if (diagram.kind === "composite_structure") return { kind: modelKind === "software_structure" ? "component" : "class", role: "internal_structure" };
  if (diagram.kind === "deployment") return { kind: "deployment", role: modelKind === "deployment_artifact" ? "relationship" : "projection" };
  if (diagram.kind === "object") return { kind: "instance_specification", role: "internal_structure" };
  if (diagram.kind === "package") return { kind: "package", role: "namespace" };
  return { kind: "unknown", role: "projection" };
}

function primaryElementName(diagram: UmlDiagramEntry): string {
  const useCase = diagram.projectionOf?.[0]?.replace(/^use-case:/, "");
  if (diagram.kind === "activity" && useCase) return `${useCase}::activity`;
  if ((diagram.kind === "sequence" || diagram.kind === "communication") && useCase) return `${useCase}::interaction`;
  if (diagram.kind === "state_machine" && useCase) return `${useCase}::state-machine`;
  if (diagram.kind === "class" && useCase) return `${useCase}::class`;
  return diagram.title
    .replace(/\s+(Use Case|Activity|Sequence|Class|Component|Deployment|Diagram)$/i, "")
    .replace(/^(结构协作|动态协作|容器边界|组件职责|代码锚点)\s*[：:]\s*/u, "")
    .trim() || diagram.anchor || diagram.id;
}

function elementSummary(modelKind: UmlModelKind, diagram: UmlDiagramEntry, kind: UmlElementKind, role: UmlElementRole): string {
  if (kind === "use_case") {
    return `${diagram.title} 是组织/过程模型中的 UseCase，描述参与者能够观察到的目标和结果；它不定义 subject 的内部结构。`;
  }
  if (role === "owned_behavior") {
    return `${diagram.title} 是 ${modelKindLabel(modelKind)} 中的局部行为，用于解释某个 Classifier、UseCase 或 Component 在特定场景下的动作、消息或状态变化。`;
  }
  if (kind === "component") {
    return `${diagram.title} 表示软件结构模型中的 Component 候选，重点是可替换模块、提供/需要的接口以及连接关系。`;
  }
  if (kind === "class") {
    return `${diagram.title} 表示 ${modelKindLabel(modelKind)} 中的 Classifier 候选；它应使用仓库或业务语言中的真实名称，不允许用工具生成的匿名代号替代。`;
  }
  if (kind === "deployment") {
    return `${diagram.title} 表示制品、运行节点或部署关系；它解释 Artifact 如何被分配到 Node 或 ExecutionEnvironment。`;
  }
  if (kind === "package") {
    return `${diagram.title} 表示 Package 命名空间或包含关系，用于组织模型元素，不等同于任意文件夹清单。`;
  }
  return diagram.summary || `${diagram.title} 是 ${modelKindLabel(modelKind)} 中的模型元素候选。`;
}

function modelKindLabel(kind: UmlModelKind): string {
  if (kind === "organization_process") return "组织/过程模型";
  if (kind === "software_structure") return "软件结构模型";
  return "制品/部署模型";
}

function deploymentArtifactModel(engineering: EngineeringProjection): UmlModelEntry {
  const engineeringDeployment = engineering.diagrams.filter((item) => item.kind === "deployment");
  return modelEntry({
    id: "model:deployment-artifact",
    kind: "deployment_artifact",
    title: "制品 / 部署模型",
    viewpoint: "描述 Artifact、Node、Device、ExecutionEnvironment、Deployment 和 CommunicationPath",
    stakeholder: ["架构师", "运维", "发布负责人", "开发者"],
    abstractionLevel: "artifact / node / execution environment / deployment",
    purpose: "解释开发、部署和运行中使用或产生的物理信息项，以及它们被分配到哪些计算资源上执行。",
    authority: "docs/models/deployment-artifact 与 docs/engineering 的 deployment 投影共同承载。",
    diagrams: engineeringDeployment.length ? engineeringDeployment : [placeholderDiagram({
      id: "model:deployment-artifact:missing-deployment",
      modelId: "model:deployment-artifact",
      kind: "deployment",
      title: "尚未生成制品 / 部署模型",
      summary: "运行 Engineering 或 Architecture Discovery 后，这里会显示部署、制品、运行节点和通信路径。",
      docPath: "docs/models/deployment-artifact/model.md",
      htmlPath: "docs/models/deployment-artifact/model.html",
      packagePath: "candidate"
    })]
  });
}

function modelEntry(input: Omit<UmlModelEntry, "anchor" | "docPath" | "htmlPath" | "status" | "packages" | "elements"> & { diagrams: UmlDiagramEntry[] }): UmlModelEntry {
  const normalizedDiagrams = input.diagrams.map((diagram) => ({ ...diagram, modelId: input.id }));
  const elements = inferModelElements(input.id, input.kind, normalizedDiagrams);
  return {
    ...input,
    anchor: input.id,
    docPath: `docs/models/${input.id.replace(/^model:/, "")}/model.md`,
    htmlPath: `docs/models/${input.id.replace(/^model:/, "")}/model.html`,
    status: normalizedDiagrams.some((diagram) => diagram.status === "confirmed") ? "confirmed" : "candidate",
    packages: packagesFromDiagrams(input.id, input.title, normalizedDiagrams, elements),
    elements,
    diagrams: normalizedDiagrams
  };
}

function packagesFromDiagrams(modelId: string, modelTitle: string, diagrams: UmlDiagramEntry[], elements: UmlModelElement[]): UmlPackageEntry[] {
  type MutablePackage = UmlPackageEntry;
  const byPath = new Map<string, MutablePackage>();
  const ensurePackage = (packagePath: string, title: string, parentPackageId: string | undefined, level: number): MutablePackage => {
    const normalizedPath = normalizePackagePath(packagePath);
    const id = packageIdFor(modelId, normalizedPath);
    const existing = byPath.get(normalizedPath);
    if (existing) return existing;
    const entry: MutablePackage = {
      id,
      title,
      packagePath: normalizedPath,
      summary: "",
      modelId,
      parentPackageId,
      childPackageIds: [],
      level,
      elementCount: 0,
      elements: [],
      diagramCount: 0,
      diagrams: []
    };
    byPath.set(normalizedPath, entry);
    if (parentPackageId) {
      const parent = [...byPath.values()].find((candidate) => candidate.id === parentPackageId);
      if (parent && !parent.childPackageIds.includes(id)) parent.childPackageIds.push(id);
    }
    return entry;
  };
  ensurePackage(".", modelTitle, undefined, 0);
  for (const diagram of diagrams) {
    const pathSegments = packageSegments(diagram.packagePath);
    let currentPath = ".";
    let parentId = packageIdFor(modelId, ".");
    if (!pathSegments.length) {
      const rootPackage = ensurePackage(".", modelTitle, undefined, 0);
      rootPackage.diagrams.push(diagram);
      continue;
    }
    pathSegments.forEach((segment, index) => {
      currentPath = currentPath === "." ? segment : `${currentPath}/${segment}`;
      const entry = ensurePackage(currentPath, segment, parentId, index + 1);
      parentId = entry.id;
      if (index === pathSegments.length - 1) entry.diagrams.push(diagram);
    });
  }
  for (const element of elements) {
    const packagePath = normalizePackagePath(element.packagePath);
    const leaf = ensurePackage(packagePath, packageTitle(packagePath), packageIdFor(modelId, parentPackagePath(packagePath) ?? "."), packageSegments(packagePath).length);
    leaf.elements.push(element);
  }
  for (const entry of byPath.values()) {
    entry.diagramCount = entry.diagrams.length;
    entry.elementCount = entry.elements.length;
    entry.summary = packageSummary(entry.packagePath, entry.diagrams, entry.elements);
  }
  return [...byPath.values()].sort((left, right) => {
    if (left.level !== right.level) return left.level - right.level;
    return left.packagePath.localeCompare(right.packagePath);
  });
}

function buildTraceLinks(models: UmlModelEntry[], projections: UmlProjectionEntry[]): UmlTraceLink[] {
  const organization = models.find((model) => model.kind === "organization_process");
  const software = models.find((model) => model.kind === "software_structure");
  const deployment = models.find((model) => model.kind === "deployment_artifact");
  const traces: UmlTraceLink[] = [];
  if (organization && software) {
    traces.push({
      id: "trace:model:organization-process:software-structure",
      relation: "refine",
      sourceId: organization.id,
      targetId: software.id,
      sourceModelId: organization.id,
      targetModelId: software.id,
      summary: "组织/过程模型中的 UseCase、Activity 和业务概念需要通过 Trace / Refine 连接到承载它们的软件结构。"
    });
  }
  if (software && deployment) {
    traces.push({
      id: "trace:model:software-structure:deployment-artifact",
      relation: "realize",
      sourceId: software.id,
      targetId: deployment.id,
      sourceModelId: software.id,
      targetModelId: deployment.id,
      summary: "软件结构中的 Component、Interface 和 Classifier 最终应映射到 Artifact、Node 或 ExecutionEnvironment。"
    });
  }
  for (const projection of projections) {
    for (const modelId of projection.projectionOf) {
      traces.push({
        id: `trace:${safeId(modelId)}:${safeId(projection.id)}`,
        relation: "project",
        sourceId: modelId,
        targetId: projection.id,
        sourceModelId: modelId,
        summary: `${projection.title} 是 ${modelId} 的展示投影；它可以帮助讨论，但不能覆盖 Model / Package / Element 的权威边界。`
      });
    }
  }
  for (const model of models) {
    const elementsByDiagram = new Map(model.elements.flatMap((element) => element.representedByDiagramIds.map((diagramId) => [diagramId, element] as const)));
    const sourceElements = new Map(model.elements.map((element) => [element.name, element]));
    for (const diagram of model.diagrams) {
      if (!diagram.projectionOf?.length) continue;
      const target = elementsByDiagram.get(diagram.id);
      if (!target) continue;
      for (const sourceName of diagram.projectionOf) {
        const source = sourceElements.get(sourceName) ?? sourceElements.get(sourceName.replace(/^use-case:/, ""));
        if (!source) continue;
        traces.push({
          id: `trace:${safeId(source.id)}:${safeId(target.id)}`,
          relation: "refine",
          sourceId: source.id,
          targetId: target.id,
          sourceModelId: model.id,
          targetModelId: model.id,
          summary: `${target.name} 细化 ${source.name}；它是同一 Model 内从可观察目标进入局部结构或行为的下钻。`
        });
      }
    }
  }
  return traces;
}

interface DesignProjection {
  available: boolean;
  diagrams: UmlDiagramEntry[];
}

interface EngineeringProjection {
  available: boolean;
  diagrams: UmlDiagramEntry[];
}

interface ArchitectureProjection {
  available: boolean;
  diagrams: UmlDiagramEntry[];
}

async function readDesignModelProjection(root: string): Promise<DesignProjection> {
  const markdown = await readOptionalProjectFile(root, "docs/design/use-case-diagrams-maps.md");
  const model = markdown ? extractDesignInteractionModel(markdown) : undefined;
  if (!model) return { available: false, diagrams: [] };
  const contexts = new Map((model.contexts ?? []).map((context) => [context.id ?? "", context]));
  const useCasesById = new Map((model.useCases ?? []).map((useCase) => [useCase.id ?? "", useCase]));
  const diagrams: UmlDiagramEntry[] = [];
  for (const useCase of model.useCases ?? []) {
    const useCaseId = useCase.id ?? safeId(useCase.title ?? "use-case");
    const packagePath = designContextPathLabel(model, useCase.contextId) ?? contexts.get(useCase.contextId ?? "")?.title ?? useCase.contextId ?? "业务过程";
    const useCaseSlug = useCaseSlugFromId(useCaseId);
    diagrams.push({
      id: `model:organization-process:diagram:${safeId(useCaseId)}`,
      kind: "use_case",
      title: useCase.title ?? useCaseId,
      summary: useCase.summary ?? "候选 Use Case Diagram。",
      modelId: "model:organization-process",
      packagePath,
      docPath: `docs/design/use-case-diagrams/${useCaseSlug}.md`,
      htmlPath: `docs/design/use-case-diagrams/${useCaseSlug}.html`,
      anchor: useCaseId,
      status: statusValue(useCase.status),
      confidence: confidenceValue(useCase.confidence),
      representedElements: ["UseCase", "Actor", "Association"]
    });
  }
  for (const drilldown of model.useCaseDrilldowns ?? []) {
    const useCaseId = drilldown.useCaseId ?? "unknown-use-case";
    const parentUseCase = useCasesById.get(useCaseId);
    const resolvedPaths = await resolveDesignDrilldownDocumentPaths(root, drilldown);
    diagrams.push({
      id: `model:organization-process:diagram:${safeId(drilldown.id ?? `${useCaseId}:${drilldown.kind}`)}`,
      kind: designKindToUmlDiagramKind(drilldown.kind),
      title: drilldown.title ?? `${drilldown.kind ?? "diagram"} · ${useCaseId}`,
      summary: drilldown.summary ?? "Use Case 的第一层行为或结构下钻。",
      modelId: "model:organization-process",
      packagePath: designContextPathLabel(model, parentUseCase?.contextId) ?? useCaseId.replace(/^use-case:/, ""),
      docPath: resolvedPaths.markdownPath,
      htmlPath: resolvedPaths.htmlPath,
      anchor: drilldown.id ?? `${useCaseId}:${drilldown.kind}`,
      status: statusValue(drilldown.status),
      confidence: confidenceValue(drilldown.confidence),
      projectionOf: [useCaseId],
      representedElements: representedElementsForDiagramKind(designKindToUmlDiagramKind(drilldown.kind))
    });
  }
  return { available: diagrams.length > 0, diagrams };
}

function designContextPathLabel(model: InteractionModelLike, contextId: string | undefined): string | undefined {
  if (!contextId) return undefined;
  const contexts = new Map((model.contexts ?? []).map((context) => [context.id ?? "", context]));
  const path: string[] = [];
  const visited = new Set<string>();
  let current = contexts.get(contextId);
  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.title ?? current.id);
    current = current.parentContextId ? contexts.get(current.parentContextId) : undefined;
  }
  return path.length ? path.join(" / ") : undefined;
}

async function resolveDesignDrilldownDocumentPaths(
  root: string,
  drilldown: NonNullable<InteractionModelLike["useCaseDrilldowns"]>[number]
): Promise<{ htmlPath: string; markdownPath: string }> {
  const useCaseSlug = useCaseSlugFromId(drilldown.useCaseId ?? "unknown-use-case");
  const htmlCandidates = designDrilldownPathCandidates(useCaseSlug, drilldown, "html");
  const markdownCandidates = designDrilldownPathCandidates(useCaseSlug, drilldown, "md");
  const htmlPath = await firstExistingProjectPath(root, htmlCandidates) ?? htmlCandidates[0];
  const markdownPath = await firstExistingProjectPath(root, markdownCandidates) ?? htmlToMarkdownPath(htmlPath) ?? markdownCandidates[0];
  return { htmlPath, markdownPath };
}

function designDrilldownPathCandidates(
  useCaseSlug: string,
  drilldown: NonNullable<InteractionModelLike["useCaseDrilldowns"]>[number],
  extension: "html" | "md"
): string[] {
  const base = `docs/design/use-case-diagrams/${useCaseSlug}`;
  const kind = drilldown.kind ?? "diagram";
  const idSlug = safeFilePart((drilldown.id ?? kind).replace(/:/g, "-"));
  const provided = extension === "html"
    ? drilldown.htmlPath
    : drilldown.markdownPath ?? htmlToMarkdownPath(drilldown.htmlPath);
  const candidates = [
    provided,
    kind === "activity" ? `${base}/activity.${extension}` : undefined,
    kind === "sequence" ? `${base}/sequences/${idSlug}.${extension}` : undefined,
    kind === "sequence" ? `${base}/sequences/sequence-${useCaseSlug}-sequence.${extension}` : undefined,
    kind === "sequence" ? `${base}/sequence.${extension}` : undefined,
    kind === "class_collaboration" ? `${base}/realization/class-collaboration.${extension}` : undefined,
    kind === "class_collaboration" ? `${base}/class-collaboration.${extension}` : undefined,
    kind === "class_collaboration" ? `${base}/class_collaboration.${extension}` : undefined,
    kind === "state_machine" ? `${base}/states/state-machine.${extension}` : undefined,
    kind === "state_machine" ? `${base}/state-machine.${extension}` : undefined,
    kind === "state_machine" ? `${base}/state_machine.${extension}` : undefined,
    `${base}/${safeFilePart(kind)}.${extension}`,
    `${base}/${idSlug}.${extension}`
  ];
  return uniqueStrings(candidates.filter((candidate): candidate is string => Boolean(candidate)));
}

async function firstExistingProjectPath(root: string, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const content = await readOptionalProjectFile(root, candidate);
    if (content !== undefined) return candidate;
  }
  return undefined;
}

async function readEngineeringModelProjection(root: string): Promise<EngineeringProjection> {
  const html = await readOptionalProjectFile(root, "docs/engineering/engineering-maps.html")
    ?? await readOptionalProjectFile(root, "docs/engineering/technical-complexity-maps.html");
  const index = html ? extractJsonScript<EngineeringMapIndexLike>(html, "praxis-engineering-map-index") : undefined;
  const diagrams: UmlDiagramEntry[] = [];
  for (const category of index?.categories ?? []) {
    for (const item of category.items ?? []) {
      const kind = engineeringKindToUmlDiagramKind(item.kind ?? category.kind);
      const packagePath = item.scope?.packageId ?? item.scope?.filePath ?? category.title ?? kind;
      diagrams.push({
        id: item.id ?? `model:software-structure:diagram:${safeId(item.title ?? kind)}`,
        kind,
        title: item.title ?? `${category.title ?? "Diagram"}`,
        summary: item.summary ?? category.summary ?? "软件结构模型投影。",
        modelId: "model:software-structure",
        packagePath,
        docPath: item.docPath ?? categoryPathFallback("docs/engineering", item.title, "md"),
        htmlPath: item.htmlPath ?? categoryPathFallback("docs/engineering", item.title, "html"),
        anchor: item.anchor ?? item.id ?? safeId(item.title ?? kind),
        status: statusValue(item.status),
        confidence: confidenceValue(item.confidence),
        representedElements: representedElementsForDiagramKind(kind)
      });
    }
  }
  return { available: diagrams.length > 0, diagrams };
}

async function readArchitectureModelProjection(root: string): Promise<ArchitectureProjection> {
  const html = await readOptionalProjectFile(root, "docs/architecture/c4/c4-model-maps.html");
  const index = html ? extractJsonScript<ArchitectureMapIndexLike>(html, "praxis-architecture-c4-index") : undefined;
  const diagrams: UmlDiagramEntry[] = [];
  for (const category of index?.categories ?? []) {
    for (const item of category.items ?? []) {
      const packagePath = item.scope?.packageId ?? category.title ?? item.level ?? "architecture";
      diagrams.push({
        id: item.id ?? `projection:architecture-c4:diagram:${safeId(item.title ?? "c4")}`,
        kind: "architecture_projection",
        title: item.title ?? `${category.title ?? "Architecture View"}`,
        summary: item.summary ?? category.summary ?? "Architecture View 投影。",
        modelId: "projection:architecture-c4",
        packagePath,
        docPath: item.docPath ?? categoryPathFallback("docs/architecture/c4", item.title, "md"),
        htmlPath: item.htmlPath ?? categoryPathFallback("docs/architecture/c4", item.title, "html"),
        anchor: item.anchor ?? item.id ?? safeId(item.title ?? "c4"),
        status: statusValue(item.status),
        confidence: confidenceValue(item.confidence),
        projectionOf: ["model:organization-process", "model:software-structure", "model:deployment-artifact"],
        representedElements: ["Architecture View", "C4 Projection"]
      });
    }
  }
  return { available: diagrams.length > 0, diagrams };
}

function renderUmlModelRegistryMarkdown(registry: UmlModelRegistry): string {
  const lines = [
    "# UML Model Registry",
    "",
    UML_MODEL_REGISTRY_START,
    "",
    "## 元数据",
    "",
    `项目版本：${registry.projectVersion}`,
    `Git 分支：${registry.git.branch}`,
    `Git 提交：${registry.git.commit}`,
    `Git 工作区状态：${registry.git.dirty ? "dirty" : "clean"}`,
    `更新于：${registry.generatedAt}`,
    "",
    "## 建模原则",
    "",
    ...registry.principles.map((item) => `- ${item}`),
    "",
    "## Model 概览图",
    "",
    "```mermaid",
    renderUmlModelRegistryMermaid(registry),
    "```",
    "",
    "## Model 索引",
    "",
    "| Model | Viewpoint | Abstraction Level | Packages | Elements | Diagrams | Authority |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...registry.models.map((model) => `| ${model.title} | ${model.viewpoint} | ${model.abstractionLevel} | ${model.packages.length} | ${model.elements.length} | ${model.diagrams.length} | ${model.authority} |`),
    "",
    "## Package / Element / Diagram 索引",
    "",
    ...registry.models.flatMap((model) => [
      `### ${model.title}`,
      "",
      model.purpose,
      "",
      "| Package | Element | Element Kind | Diagram | Diagram Kind | 文档 | 状态 | 置信度 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...(model.diagrams.length
        ? model.diagrams.map((diagram) => {
          const element = model.elements.find((candidate) => candidate.representedByDiagramIds.includes(diagram.id));
          return `| ${diagram.packagePath} | ${element?.name ?? "_待识别_"} | ${element?.kind ?? "_未知_"} | ${diagram.title} | ${diagram.kind} | [HTML](${relativeLink(diagram.htmlPath)}) | ${diagram.status} | ${diagram.confidence} |`;
        })
        : ["| _无_ | _尚未生成_ | _不适用_ | _不适用_ | _不适用_ | _不适用_ | _不适用_ | _不适用_ |"]),
      ""
    ]),
    "## 投影索引",
    "",
    "| Projection | Source | Projection Of | 文档 | 状态 | 说明 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...registry.projections.map((projection) => `| ${projection.title} | ${projection.source} | ${projection.projectionOf.join("、")} | [HTML](${relativeLink(projection.htmlPath)}) | ${projection.status} | ${projection.summary} |`),
    "",
    "## Trace / Refine",
    "",
    ...registry.traces.map((trace) => `- ${trace.relation.toUpperCase()}：${trace.sourceId} -> ${trace.targetId}。${trace.summary}`),
    "",
    UML_MODEL_REGISTRY_END,
    ""
  ];
  return lines.join("\n");
}

function renderUmlModelDocumentMarkdown(registry: UmlModelRegistry, model: UmlModelEntry): string {
  const lines = [
    `# ${model.title}`,
    "",
    UML_MODEL_REGISTRY_START,
    "",
    "## 定位",
    "",
    `- Viewpoint：${model.viewpoint}`,
    `- Stakeholder：${model.stakeholder.join("、")}`,
    `- Abstraction Level：${model.abstractionLevel}`,
    `- Authority：${model.authority}`,
    `- 状态：${model.status}`,
    "",
    "## 解释目标",
    "",
    model.purpose,
    "",
    "## Package 概览图",
    "",
    "```mermaid",
    renderUmlModelPackageMermaid(model),
    "```",
    "",
    "## Package / Diagram",
    "",
    ...model.packages.flatMap((pkg) => [
      `### ${pkg.title}`,
      "",
      pkg.summary,
      "",
      pkg.elements.length ? "#### Elements" : "",
      "",
      ...(pkg.elements.length ? pkg.elements.map((element) => `- ${element.kind} / ${element.role}：${element.name}。${element.summary}`) : []),
      "",
      "| Diagram | Kind | 文档 | 状态 | 置信度 | 代表元素 |",
      "| --- | --- | --- | --- | --- | --- |",
      ...pkg.diagrams.map((diagram) => `| ${diagram.title} | ${diagram.kind} | [HTML](${relativeLink(diagram.htmlPath)}) / [Markdown](${relativeLink(diagram.docPath)}) | ${diagram.status} | ${diagram.confidence} | ${diagram.representedElements.join("、")} |`),
      ""
    ]),
    "## Trace / Refine",
    "",
    ...registry.traces
      .filter((trace) => trace.sourceModelId === model.id || trace.targetModelId === model.id)
      .map((trace) => `- ${trace.relation.toUpperCase()}：${trace.sourceId} -> ${trace.targetId}。${trace.summary}`),
    "",
    UML_MODEL_REGISTRY_END,
    ""
  ];
  return lines.join("\n");
}

function renderUmlModelRegistryHtml(registry: UmlModelRegistry): string {
  const modelCards = registry.models.map((model) => `
    <section
      class="model-card model-card--summary"
      data-praxis-anchor="${escapeHtmlAttr(model.anchor)}"
      data-praxis-kind="uml_model"
      data-praxis-model-id="${escapeHtmlAttr(model.id)}"
      data-praxis-document-title="${escapeHtmlAttr(model.title)}"
      data-praxis-document-summary="${escapeHtmlAttr(model.purpose)}"
      data-praxis-document-md="${escapeHtmlAttr(model.docPath)}"
      data-praxis-document-html="${escapeHtmlAttr(model.htmlPath)}"
    >
      <header class="model-card-header">
        <div>
          <span class="model-kind-pill">${escapeHtml(model.kind)}</span>
          <h2>${escapeHtml(model.title)}</h2>
        </div>
        <span class="model-status-pill">${escapeHtml(model.status)}</span>
      </header>
      <p class="model-primary-copy">${escapeHtml(model.purpose)}</p>
      <p class="model-secondary-copy">${escapeHtml(model.viewpoint)}</p>
      <div class="model-count-row" aria-label="${escapeHtmlAttr(model.title)} 文档数量">
        <span><strong>${model.packages.length}</strong> Packages</span>
        <span><strong>${model.elements.length}</strong> Elements</span>
        <span><strong>${model.diagrams.length}</strong> Diagrams</span>
      </div>
      <dl class="model-brief-grid">
        <div><dt>用于谁</dt><dd>${escapeHtml(model.stakeholder.join("、"))}</dd></div>
        <div><dt>抽象层级</dt><dd>${escapeHtml(model.abstractionLevel)}</dd></div>
      </dl>
      <p class="model-authority-note">${escapeHtml(model.authority)}</p>
    </section>`).join("\n");
  const projectionCards = registry.projections.map((projection) => `
    <article
      class="projection-card"
      data-praxis-anchor="${escapeHtmlAttr(projection.id)}"
      data-praxis-kind="uml_projection"
      data-praxis-document-title="${escapeHtmlAttr(projection.title)}"
      data-praxis-document-summary="${escapeHtmlAttr(projection.summary)}"
      data-praxis-document-md="${escapeHtmlAttr(projection.docPath)}"
      data-praxis-document-html="${escapeHtmlAttr(projection.htmlPath)}"
    >
      <header>
        <strong>${escapeHtml(projection.title)}</strong>
        <span>${escapeHtml(projection.source)} · ${escapeHtml(projection.status)} · ${escapeHtml(projection.confidence)}</span>
      </header>
      <p>${escapeHtml(projection.summary)}</p>
      <small>Projection of: ${escapeHtml(projection.projectionOf.join(" / "))}</small>
    </article>`).join("\n");
  const packageSections = registry.models.map((model) => `
    <section class="model-section" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:packages" data-praxis-kind="uml_model_packages">
      <h2>${escapeHtml(model.title)}</h2>
      ${model.packages.map((pkg) => `
        <article class="package-card" data-praxis-anchor="${escapeHtmlAttr(pkg.id)}" data-praxis-kind="uml_package">
          <header>
            <div>
              <strong>${escapeHtml(pkg.title)}</strong>
              <span>${escapeHtml(pkg.summary)}</span>
            </div>
            <em>${pkg.elementCount} elements · ${pkg.diagramCount} diagrams</em>
          </header>
          ${pkg.elements.length ? `<ul class="element-list">${pkg.elements.map((element) => `<li><strong>${escapeHtml(element.name)}</strong><span>${escapeHtml(element.kind)} · ${escapeHtml(element.role)}</span><small>${escapeHtml(element.summary)}</small></li>`).join("")}</ul>` : ""}
          <div class="diagram-list">
            ${pkg.diagrams.map((diagram) => `
              <button
                type="button"
                class="diagram-entry-card"
                data-praxis-anchor="${escapeHtmlAttr(diagram.anchor)}"
                data-praxis-kind="uml_diagram"
                data-praxis-document-title="${escapeHtmlAttr(diagram.title)}"
                data-praxis-document-summary="${escapeHtmlAttr(diagram.summary)}"
                data-praxis-document-md="${escapeHtmlAttr(diagram.docPath)}"
                data-praxis-document-html="${escapeHtmlAttr(diagram.htmlPath)}"
              >
                <span>${escapeHtml(diagram.kind)}</span>
                <strong>${escapeHtml(diagram.title)}</strong>
                <small>${escapeHtml(diagram.summary)}</small>
              </button>`).join("\n")}
          </div>
        </article>`).join("\n")}
    </section>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>UML Model Registry</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #091017; color: #d8e8f5; }
    body { margin: 0; padding: 18px; background: #091017; }
    .praxis-model-registry { display: grid; gap: 14px; }
    .registry-header, .model-card, .model-section, .package-card { border: 1px solid #244056; border-radius: 8px; background: #101a23; padding: 12px; }
    .registry-header h1, .model-card h2, .model-section h2 { margin: 0 0 6px; }
    .registry-header p, .model-card p, .package-card span, .diagram-entry-card small, .model-section-header p { color: #9bb5cc; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .model-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    .projection-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    .metric-card { border: 1px solid #244056; border-radius: 8px; padding: 10px; background: #0c141d; }
    .metric-card strong { display: block; font-size: 24px; margin-top: 5px; }
    .model-section { display: grid; gap: 10px; }
    .model-section-header h2, .model-section-header p { margin: 0; }
    .model-overview-section pre.mermaid { max-height: 240px; }
    .model-card { display: grid; gap: 8px; }
    .model-card-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .model-kind-pill, .model-status-pill { display: inline-flex; border: 1px solid #244056; border-radius: 999px; padding: 2px 7px; color: #80d4ff; font-size: 12px; }
    .model-status-pill { color: #74f2c8; white-space: nowrap; }
    .model-primary-copy { color: #f3f7fb; font-weight: 650; }
    .model-secondary-copy, .model-authority-note { color: #9bb5cc; font-size: 12px; }
    .model-count-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .model-count-row span { border: 1px solid #1d3447; border-radius: 7px; padding: 7px; background: #0b121a; color: #9bb5cc; }
    .model-count-row strong { display: block; color: #f8fbff; font-size: 18px; }
    .model-card dl { display: grid; gap: 6px; margin: 0; }
    .model-brief-grid div { border-top: 1px solid #1d3447; padding-top: 6px; }
    .model-card dt { color: #7fa6c3; font-size: 12px; }
    .model-card dd { margin: 0; }
    .diagram-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 10px; }
    .element-list { display: grid; gap: 6px; list-style: none; padding: 0; margin: 10px 0 0; }
    .element-list li, .projection-card { border: 1px solid #1d3447; border-radius: 7px; padding: 8px; background: #0b121a; display: grid; gap: 4px; }
    .element-list li span, .projection-card span, .projection-card small { color: #80d4ff; font-size: 12px; }
    .element-list li small, .projection-card p { color: #9bb5cc; }
    .diagram-entry-card { text-align: left; border: 1px solid #244056; border-radius: 7px; padding: 9px; background: #0b121a; color: inherit; cursor: pointer; display: grid; gap: 5px; }
    .diagram-entry-card:hover { border-color: #3b82f6; }
    .diagram-entry-card span { color: #80d4ff; font-size: 12px; }
    .diagram-entry-card strong { font-size: 14px; }
    pre.mermaid { border: 1px solid #244056; border-radius: 8px; padding: 12px; background: #0b121a; overflow: auto; }
    .trace-list { border: 1px solid #244056; border-radius: 8px; background: #101a23; padding: 12px; }
    @media (max-width: 1100px) { .metric-grid, .model-grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
<main class="praxis-model-registry" data-praxis-anchor="models:root" data-praxis-kind="uml_model_registry" data-praxis-status="candidate">
  <section class="registry-header">
    <span>Praxis Model Explorer</span>
    <h1>UML Model Registry</h1>
    <p>这里把项目记忆组织为 UML 2.x 的 Model / Package / Element / Diagram / Trace。Design、Engineering 和 Architecture 都是入口投影，不是独立真相层。</p>
  </section>
  <section class="metric-grid">
    <article class="metric-card"><span>Model</span><strong>${registry.summary.modelCount}</strong></article>
    <article class="metric-card"><span>Package</span><strong>${registry.summary.packageCount}</strong></article>
    <article class="metric-card"><span>Element</span><strong>${registry.summary.elementCount}</strong></article>
    <article class="metric-card"><span>Diagram</span><strong>${registry.summary.diagramCount}</strong></article>
    <article class="metric-card"><span>Projection</span><strong>${registry.summary.projectionCount}</strong></article>
    <article class="metric-card"><span>Trace</span><strong>${registry.summary.traceCount}</strong></article>
  </section>
  <section class="model-section model-list-section" data-praxis-anchor="models:list" data-praxis-kind="uml_model_index">
    <header class="model-section-header">
      <h2>权威 UML Models</h2>
      <p>每个 Model 表示一个 viewpoint 和 abstraction level；C4 与旧 Explorer 只作为下方 Projection 使用。</p>
    </header>
    <section class="model-grid">${modelCards}</section>
  </section>
  <section class="model-section model-overview-section" data-praxis-anchor="models:overview" data-praxis-kind="uml_model_overview">
    <header class="model-section-header">
      <h2>Model 关系图</h2>
      <p>只展示权威 Model 与投影入口之间的 Trace / Refine / Project 关系；具体图种在各 Model 内部展开。</p>
    </header>
    <pre class="mermaid" data-praxis-anchor="models:overview:diagram" data-praxis-kind="package_diagram">${escapeHtml(renderUmlModelRegistryMermaid(registry))}</pre>
  </section>
  <section class="model-section projection-list-section" data-praxis-anchor="models:projections" data-praxis-kind="uml_projection_index">
    <header class="model-section-header">
      <h2>Projection 入口</h2>
      <p>这些入口帮助阅读和讨论，但不能反过来定义 Model 边界。</p>
    </header>
    <section class="projection-grid">${projectionCards}</section>
  </section>
  ${packageSections}
  <section class="trace-list">
    <h2>Trace / Refine</h2>
    <ul>${registry.traces.map((trace) => `<li><strong>${escapeHtml(trace.relation)}</strong> ${escapeHtml(trace.sourceId)} -> ${escapeHtml(trace.targetId)}：${escapeHtml(trace.summary)}</li>`).join("")}</ul>
  </section>
  <script type="application/json" id="praxis-uml-model-registry">${escapeScriptJson(JSON.stringify(registry))}</script>
</main>
</body>
</html>`;
}

function renderUmlModelDocumentHtml(registry: UmlModelRegistry, model: UmlModelEntry): string {
  const relatedTraces = registry.traces.filter((trace) => trace.sourceModelId === model.id || trace.targetModelId === model.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #091017; color: #d8e8f5; }
    body { margin: 0; padding: 18px; background: #091017; }
    .praxis-model-document { display: grid; gap: 14px; }
    .model-doc-header, .model-doc-section, .package-card, .trace-list { border: 1px solid #244056; border-radius: 8px; background: #101a23; padding: 12px; }
    h1, h2, h3, p { margin: 0; }
    p, li, dd, dt, small { color: #9bb5cc; }
    .meta-grid, .diagram-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
    .meta-grid div, .diagram-entry-card { border: 1px solid #244056; border-radius: 7px; padding: 9px; background: #0b121a; }
    .element-list { display: grid; gap: 6px; list-style: none; padding: 0; margin: 10px 0; }
    .element-list li { border: 1px solid #1d3447; border-radius: 7px; padding: 8px; background: #0b121a; display: grid; gap: 4px; }
    .element-list li span { color: #80d4ff; font-size: 12px; }
    .diagram-entry-card { color: inherit; cursor: pointer; text-align: left; display: grid; gap: 5px; }
    .diagram-entry-card:hover { border-color: #3b82f6; }
    pre.mermaid { border: 1px solid #244056; border-radius: 8px; padding: 12px; background: #0b121a; overflow: auto; }
  </style>
</head>
<body>
<main class="praxis-model-document" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}" data-praxis-kind="uml_model" data-praxis-status="${escapeHtmlAttr(model.status)}">
  <section class="model-doc-header">
    <span>Praxis Model Explorer</span>
    <h1>${escapeHtml(model.title)}</h1>
    <p>${escapeHtml(model.purpose)}</p>
  </section>
  <section class="model-doc-section" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:position" data-praxis-kind="model_position">
    <h2>定位</h2>
    <div class="meta-grid">
      <div><dt>Viewpoint</dt><dd>${escapeHtml(model.viewpoint)}</dd></div>
      <div><dt>Stakeholder</dt><dd>${escapeHtml(model.stakeholder.join("、"))}</dd></div>
      <div><dt>Abstraction Level</dt><dd>${escapeHtml(model.abstractionLevel)}</dd></div>
      <div><dt>Authority</dt><dd>${escapeHtml(model.authority)}</dd></div>
      <div><dt>Packages</dt><dd>${model.packages.length}</dd></div>
      <div><dt>Elements</dt><dd>${model.elements.length}</dd></div>
      <div><dt>Diagrams</dt><dd>${model.diagrams.length}</dd></div>
    </div>
  </section>
  <section class="model-doc-section" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:package-overview" data-praxis-kind="package_diagram">
    <h2>Package 概览图</h2>
    <pre class="mermaid" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:package-overview:diagram" data-praxis-kind="package_diagram">${escapeHtml(renderUmlModelPackageMermaid(model))}</pre>
  </section>
  <section class="model-doc-section" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:diagrams" data-praxis-kind="diagram_index">
    <h2>Package / Element / Diagram</h2>
    ${model.packages.map((pkg) => `
      <article class="package-card" data-praxis-anchor="${escapeHtmlAttr(pkg.id)}" data-praxis-kind="uml_package">
        <h3>${escapeHtml(pkg.title)}</h3>
        <p>${escapeHtml(pkg.summary)}</p>
        ${pkg.elements.length ? `<ul class="element-list">${pkg.elements.map((element) => `<li data-praxis-anchor="${escapeHtmlAttr(element.id)}" data-praxis-kind="uml_element"><strong>${escapeHtml(element.name)}</strong><span>${escapeHtml(element.kind)} · ${escapeHtml(element.role)} · ${escapeHtml(element.confidence)}</span><small>${escapeHtml(element.summary)}</small></li>`).join("")}</ul>` : ""}
        <div class="diagram-list">
          ${pkg.diagrams.map((diagram) => `
            <button
              type="button"
              class="diagram-entry-card"
              data-praxis-anchor="${escapeHtmlAttr(diagram.anchor)}"
              data-praxis-kind="uml_diagram"
              data-praxis-document-title="${escapeHtmlAttr(diagram.title)}"
              data-praxis-document-summary="${escapeHtmlAttr(diagram.summary)}"
              data-praxis-document-md="${escapeHtmlAttr(diagram.docPath)}"
              data-praxis-document-html="${escapeHtmlAttr(diagram.htmlPath)}"
            >
              <span>${escapeHtml(diagram.kind)} · ${escapeHtml(diagram.status)} · ${escapeHtml(diagram.confidence)}</span>
              <strong>${escapeHtml(diagram.title)}</strong>
              <small>${escapeHtml(diagram.summary)}</small>
            </button>`).join("\n")}
        </div>
      </article>`).join("\n")}
  </section>
  <section class="trace-list" data-praxis-anchor="${escapeHtmlAttr(model.anchor)}:trace" data-praxis-kind="trace_index">
    <h2>Trace / Refine</h2>
    <ul>${(relatedTraces.length ? relatedTraces : [{ relation: "trace", sourceId: model.id, targetId: model.id, summary: "当前 Model 尚未发现跨 Model Trace。"}]).map((trace) => `<li><strong>${escapeHtml(trace.relation)}</strong> ${escapeHtml(trace.sourceId)} -> ${escapeHtml(trace.targetId)}：${escapeHtml(trace.summary)}</li>`).join("")}</ul>
  </section>
  <script type="application/json" id="praxis-uml-model-document">${escapeScriptJson(JSON.stringify({ model, relatedTraces }))}</script>
</main>
</body>
</html>`;
}

function placeholderDiagram(input: {
  id: string;
  modelId: string;
  kind: UmlDiagramKind;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  packagePath: string;
}): UmlDiagramEntry {
  return {
    ...input,
    anchor: input.id,
    status: "candidate",
    confidence: "low",
    representedElements: representedElementsForDiagramKind(input.kind)
  };
}

function legacyProjection(
  id: string,
  title: string,
  source: UmlLegacyProjection["source"],
  docPath: string,
  htmlPath: string,
  modelId: string,
  available: boolean
): UmlLegacyProjection {
  return {
    id,
    title,
    source,
    docPath,
    htmlPath,
    modelId,
    status: available ? "candidate" : "inference",
    summary: available ? "已有旧 Explorer 投影文档，已挂入对应 UML Model。" : "旧 Explorer 投影文档尚未生成。"
  };
}

function designKindToUmlDiagramKind(kind: string | undefined): UmlDiagramKind {
  if (kind === "activity") return "activity";
  if (kind === "sequence") return "sequence";
  if (kind === "state_machine") return "state_machine";
  if (kind === "class_collaboration") return "class";
  if (kind === "communication") return "communication";
  if (kind === "timing") return "sequence";
  if (kind === "object_snapshot") return "object";
  if (kind === "composite_structure") return "composite_structure";
  return "use_case";
}

function engineeringKindToUmlDiagramKind(kind: string | undefined): UmlDiagramKind {
  if (kind === "package") return "package";
  if (kind === "component") return "component";
  if (kind === "deployment") return "deployment";
  if (kind === "class_structural") return "class";
  if (kind === "sequence") return "sequence";
  if (kind === "state_machine") return "state_machine";
  if (kind === "technical_hotspot") return "technical_hotspot";
  return "package";
}

function representedElementsForDiagramKind(kind: UmlDiagramKind): string[] {
  if (kind === "use_case") return ["UseCase", "Actor", "Association", "Subject"];
  if (kind === "activity") return ["Activity", "Action", "ControlFlow", "DecisionNode", "MergeNode"];
  if (kind === "sequence") return ["Interaction", "Lifeline", "Message"];
  if (kind === "communication") return ["Interaction", "Lifeline", "Message", "Connector"];
  if (kind === "state_machine") return ["StateMachine", "State", "Transition", "Event"];
  if (kind === "class") return ["Class", "Interface", "Association", "Generalization", "Realization"];
  if (kind === "component") return ["Component", "Interface", "Port", "Connector"];
  if (kind === "composite_structure") return ["Classifier", "Property", "Port", "Connector"];
  if (kind === "deployment") return ["Artifact", "Node", "Device", "ExecutionEnvironment", "Deployment"];
  if (kind === "object") return ["InstanceSpecification", "Slot", "Link"];
  if (kind === "package") return ["Package", "PackageImport", "Dependency"];
  if (kind === "architecture_projection") return ["Projection", "Abstraction", "Trace"];
  return ["Comment", "Constraint"];
}

function extractDesignInteractionModel(markdown: string): InteractionModelLike | undefined {
  const start = markdown.indexOf("<!-- praxis:interaction-model:start -->");
  const end = markdown.indexOf("<!-- praxis:interaction-model:end -->");
  if (start < 0 || end <= start) return undefined;
  const block = markdown.slice(start, end);
  const match = block.match(/```json\s*([\s\S]*?)```/);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as InteractionModelLike;
  } catch {
    return undefined;
  }
}

function extractJsonScript<T>(html: string, id: string): T | undefined {
  const regex = new RegExp(`<script[^>]+id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/script>`);
  const match = html.match(regex);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(unescapeScriptJson(match[1])) as T;
  } catch {
    return undefined;
  }
}

async function readOptionalProjectFile(root: string, relativePath: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    return undefined;
  }
}

function statusValue(value: unknown): UmlModelStatus {
  return value === "confirmed" ? "confirmed" : value === "inference" ? "inference" : "candidate";
}

function confidenceValue(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "diagram";
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "item";
}

function htmlToMarkdownPath(htmlPath: string | undefined): string | undefined {
  return htmlPath ? htmlPath.replace(/\.html$/i, ".md") : undefined;
}

function categoryPathFallback(root: string, title: string | undefined, extension: "md" | "html"): string {
  return `${root}/${safeFilePart(title ?? "diagram")}.${extension}`;
}

function useCaseSlugFromId(useCaseId: string): string {
  return safeFilePart(useCaseId.replace(/^use-case:/, "")).toLowerCase();
}

function packageTitle(packagePath: string): string {
  if (packagePath === ".") return "Model Root";
  if (packagePath === "candidate") return "候选模型";
  if (packagePath === "root") return "Root";
  const parts = packagePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? packagePath;
}

function packageSummary(packagePath: string, diagrams: UmlDiagramEntry[], elements: UmlModelElement[]): string {
  const kinds = [...new Set(diagrams.map((diagram) => diagram.kind))].join("、");
  if (packagePath === ".") return `Model 根命名空间下组织 ${elements.length} 个直接模型元素，并通过 ${diagrams.length} 张 ${kinds || "UML"} 图呈现。`;
  return `${packagePath} 命名空间下组织 ${elements.length} 个直接模型元素，并通过 ${diagrams.length} 张 ${kinds || "UML"} 图呈现。`;
}

function packageIdFor(modelId: string, packagePath: string): string {
  const normalized = normalizePackagePath(packagePath);
  return `${modelId}:package:${safeId(normalized === "." ? "root" : normalized)}`;
}

function normalizePackagePath(packagePath: string | undefined): string {
  const value = String(packagePath ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!value || value === "root" || value === ".") return ".";
  return value;
}

function packageSegments(packagePath: string | undefined): string[] {
  const normalized = normalizePackagePath(packagePath);
  if (normalized === ".") return [];
  return normalized.split(/[/:]+/).map((part) => part.trim()).filter(Boolean);
}

function parentPackagePath(packagePath: string): string | undefined {
  const segments = packageSegments(packagePath);
  if (segments.length <= 1) return ".";
  return segments.slice(0, -1).join("/");
}

function relativeLink(relativePath: string): string {
  return relativePath.replace(/^docs\/models\//, "");
}

function renderUmlModelRegistryMermaid(registry: UmlModelRegistry): string {
  const lines = [
    "flowchart LR"
  ];
  const modelIds = new Map<string, string>();
  registry.models.forEach((model, index) => {
    const modelId = `model_${index}`;
    modelIds.set(model.id, modelId);
    lines.push(`  ${modelId}["${mermaidLabel(model.title)}"]`);
  });
  const projectionIds = new Map<string, string>();
  registry.projections.forEach((projection, index) => {
    const projectionId = `projection_${index}`;
    projectionIds.set(projection.id, projectionId);
    lines.push(`  ${projectionId}(["${mermaidLabel(projection.title)}"])`);
  });
  registry.traces.forEach((trace) => {
    if (!trace.sourceModelId) return;
    const sourceId = modelIds.get(trace.sourceModelId);
    const targetId = trace.targetModelId ? modelIds.get(trace.targetModelId) : projectionIds.get(trace.targetId);
    if (!sourceId || !targetId) return;
    lines.push(`  ${sourceId} -. "${mermaidLabel(trace.relation)}" .-> ${targetId}`);
  });
  lines.push("  classDef primary fill:#1d3550,stroke:#78b7ff,color:#f8fbff;");
  lines.push("  classDef secondary fill:#182631,stroke:#486985,color:#d8e8f5;");
  lines.push("  classDef projection fill:#15212b,stroke:#67e8f9,stroke-dasharray: 5 5,color:#d8e8f5;");
  if (registry.models[0]) {
    lines.push("  class model_0 primary;");
  }
  if (registry.models.length > 1) {
    const secondaryIds: string[] = registry.models.slice(1).map((_, index) => `model_${index + 1}`);
    lines.push(`  class ${secondaryIds.join(",")} secondary;`);
  }
  if (registry.projections.length) {
    lines.push(`  class ${registry.projections.map((_, index) => `projection_${index}`).join(",")} projection;`);
  }
  return lines.join("\n");
}

function renderUmlModelPackageMermaid(model: UmlModelEntry): string {
  const lines = [
    "flowchart TD",
    `  model["${mermaidLabel(model.title)}"]`
  ];
  const packages = model.packages.slice(0, 80);
  const packageNodeIds = new Map<string, string>();
  packages.forEach((pkg, index) => {
    const packageId = `pkg_${index}`;
    packageNodeIds.set(pkg.id, packageId);
    lines.push(`  ${packageId}["${mermaidLabel(pkg.title)}"]`);
    const parentId = pkg.parentPackageId ? packageNodeIds.get(pkg.parentPackageId) : "model";
    lines.push(`  ${parentId ?? "model"} --> ${packageId}`);
    if (pkg.elementCount || pkg.diagramCount) {
      lines.push(`  ${packageId} --> ${packageId}_contents["${pkg.elementCount} elements / ${pkg.diagramCount} diagrams"]`);
    }
  });
  if (model.packages.length > packages.length) {
    lines.push(`  omitted["另有 ${model.packages.length - packages.length} 个 Package，见下方索引"]`);
    lines.push("  model --> omitted");
  }
  return lines.join("\n");
}

function mermaidLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "'")
    .replace(/\r?\n/g, " ")
    .slice(0, 120);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: unknown): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c");
}

function unescapeScriptJson(value: string): string {
  return value.replace(/\\u003c/g, "<");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
