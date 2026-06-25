import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeFactGraphSnapshot, CodeFactNode, CodeUnderstandingSpine } from "@praxis/schema";
import {
  buildEngineeringComplexityModel,
  type EngineeringComplexityModel,
  type EngineeringComponent,
  type EngineeringPackage
} from "./engineering-documents.js";
import { readProjectGitVersion, readProjectSemanticVersion, type DesignGitVersionInfo } from "./design-documents.js";

export const ARCHITECTURE_C4_ROOT_MAP_DOC_RELATIVE_PATH = "docs/architecture/c4/c4-model-maps.md";
export const ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH = "docs/architecture/c4/c4-model-maps.html";
const ARCHITECTURE_C4_OUTPUT_ROOT_RELATIVE_PATH = "docs/architecture/c4";

type ArchitectureC4Level = "system_context" | "container" | "component" | "code";
type ArchitectureC4Confidence = "high" | "medium" | "low";

export interface ArchitectureC4Model {
  schemaVersion: "praxis.architectureC4Model.v1";
  root: string;
  generatedAt: string;
  source: "code_facts";
  projectVersion: string;
  git: DesignGitVersionInfo;
  summary: {
    systemContextCount: number;
    containerCount: number;
    componentViewCount: number;
    codeViewCount: number;
  };
  codeUnderstandingSpine?: EngineeringComplexityModel["codeUnderstandingSpine"];
  documents: ArchitectureC4Document[];
}

export interface ArchitectureC4MapIndex {
  schemaVersion: "praxis.architectureC4MapIndex.v1";
  generatedAt: string;
  projectVersion: string;
  git: DesignGitVersionInfo;
  rootDocPath: string;
  rootHtmlPath: string;
  summary: ArchitectureC4Model["summary"];
  codeUnderstandingSpine?: ArchitectureC4Model["codeUnderstandingSpine"];
  tree: ArchitectureC4TreeNode[];
  categories: ArchitectureC4Category[];
}

export interface ArchitectureC4TreeNode {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: "candidate";
  confidence: ArchitectureC4Confidence;
  children: ArchitectureC4TreeNode[];
}

export interface ArchitectureC4Category {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  directory: string;
  summary: string;
  count: number;
  items: ArchitectureC4Document[];
}

export interface ArchitectureC4Document {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  status: "candidate";
  confidence: ArchitectureC4Confidence;
  mermaid: string;
  responsibility: string;
  boundary: string;
  relationships: string[];
  businessRelation: string[];
  engineeringRelation: string[];
  evidencePaths: string[];
  questions: string[];
  scope: {
    packageId?: string;
    filePath?: string;
  };
  elements: ArchitectureC4Element[];
  drilldowns: ArchitectureC4Link[];
  relatedEngineeringDocs: ArchitectureC4Link[];
}

interface ArchitectureC4LayerView {
  level: ArchitectureC4Level;
  label: string;
  title: string;
  diagramTitle: string;
  summary: string;
  docPath?: string;
  htmlPath?: string;
  mermaid: string;
  highlightLabels: string[];
  current: boolean;
  missing?: boolean;
}

export interface ArchitectureC4Element {
  id: string;
  label: string;
  level: ArchitectureC4Level | "person" | "external_system" | "repository" | "project_memory";
  anchor: string;
  summary: string;
  responsibility: string;
  boundary: string;
  relationshipMeaning: string;
  whyThisLevel: string;
  drilldownIntent: string;
  evidence: string[];
  confidence: ArchitectureC4Confidence;
  drilldowns: ArchitectureC4Link[];
}

type ArchitectureC4ElementOptions = Partial<Pick<
  ArchitectureC4Element,
  "responsibility" | "relationshipMeaning" | "whyThisLevel" | "drilldownIntent" | "evidence" | "confidence"
>>;

export interface ArchitectureC4Link {
  id: string;
  level: ArchitectureC4Level;
  title: string;
  summary: string;
  docPath: string;
  htmlPath: string;
  anchor: string;
  relation: "contains" | "realizes" | "details" | "related_engineering" | "parent";
  reason: string;
}

export async function buildArchitectureC4Model(
  root: string,
  codeFacts: CodeFactGraphSnapshot,
  generatedAt: string,
  codeUnderstandingSpine?: CodeUnderstandingSpine
): Promise<ArchitectureC4Model> {
  const engineering = await buildEngineeringComplexityModel(root, codeFacts, generatedAt, codeUnderstandingSpine);
  const git = await readProjectGitVersion(root);
  const projectVersion = await readProjectSemanticVersion(root) ?? "0.1.0";
  const containerPackages = architectureContainerPackages(engineering, codeFacts);
  const containerPackageIds = new Set(containerPackages.map((item) => item.path));
  const c4Components = c4ComponentsFromCodeFacts(codeFacts, containerPackageIds);
  const containerDocs = containerPackages.map((item) => architectureContainerDocument(item, engineering, containerPackageIds, c4Components));
  const componentDocs = buildArchitectureComponentDocuments(engineering, containerPackageIds, c4Components);
  const codeDocs = buildArchitectureCodeDocuments(engineering, containerPackageIds, c4Components);
  const systemContext = architectureSystemContextDocument(root, engineering, containerPackages);
  const documents = [systemContext, ...containerDocs, ...componentDocs, ...codeDocs];
  connectArchitectureC4Drilldowns(documents);
  return {
    schemaVersion: "praxis.architectureC4Model.v1",
    root,
    generatedAt,
    source: "code_facts",
    projectVersion,
    git,
    summary: {
      systemContextCount: 1,
      containerCount: containerDocs.length,
      componentViewCount: componentDocs.length,
      codeViewCount: codeDocs.length
    },
    codeUnderstandingSpine: engineering.codeUnderstandingSpine,
    documents
  };
}

export async function writeArchitectureC4Documents(root: string, model: ArchitectureC4Model): Promise<{
  markdownPath: string;
  htmlPath: string;
  diagramDocumentCount: number;
}> {
  const index = buildArchitectureC4MapIndex(model);
  await rm(path.join(root, ARCHITECTURE_C4_OUTPUT_ROOT_RELATIVE_PATH), { recursive: true, force: true });
  const writes: Array<{ filePath: string; content: string }> = [
    {
      filePath: path.join(root, ARCHITECTURE_C4_ROOT_MAP_DOC_RELATIVE_PATH),
      content: renderArchitectureC4RootMarkdown(index)
    },
    {
      filePath: path.join(root, ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH),
      content: renderArchitectureC4RootHtml(index)
    },
    ...model.documents.flatMap((item) => [
      { filePath: path.join(root, item.docPath), content: renderArchitectureC4DocumentMarkdown(item, index) },
      { filePath: path.join(root, item.htmlPath), content: renderArchitectureC4DocumentHtml(item, index, model.documents) }
    ])
  ];
  for (const write of writes) {
    await mkdir(path.dirname(write.filePath), { recursive: true });
    await writeFile(write.filePath, write.content, "utf8");
  }
  return {
    markdownPath: path.join(root, ARCHITECTURE_C4_ROOT_MAP_DOC_RELATIVE_PATH),
    htmlPath: path.join(root, ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH),
    diagramDocumentCount: model.documents.length
  };
}

function architectureSystemContextDocument(root: string, engineering: EngineeringComplexityModel, containerPackages: EngineeringPackage[]): ArchitectureC4Document {
  const base = "docs/architecture/c4/system-context/system-context";
  const projectName = path.basename(root);
  const evidencePaths = architectureSystemContextEvidencePaths(containerPackages);
  return {
    id: "architecture:c4:system-context",
    level: "system_context",
    title: `系统上下文：${projectName}`,
    summary: `从 C4 System Context 层解释 ${projectName} 这个目标软件系统所处的环境：谁使用它、它依赖或协作哪些外部系统，以及它作为一个黑盒的边界在哪里。`,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: "architecture:c4:system-context",
    status: "candidate",
    confidence: "high",
    mermaid: renderSystemContextMermaid(projectName),
    responsibility: `${projectName} 是当前打开并被分析的目标项目。System Context 只把它作为一个整体软件系统来观察，先说明谁会使用或调用它、它可能与哪些外部系统协作，再进入 Container 层解释内部边界。`,
    boundary: `System Context 必须围绕 ${projectName} 这个目标系统本身；开发工具、模型服务、文档生成流程和 IDE 工作流不属于目标系统业务上下文，除非它们是目标项目自身实现的一部分。`,
    relationships: [
      `${projectName} 是当前 C4 树的系统边界；内部实现只通过 Container 下钻展开。`,
      "外部使用者、调用方或上游系统在当前仓库证据中没有被命名，因此本图只保留未命名外部参与者，不用工具侧角色代替真实业务角色。",
      "外部系统和第三方服务只有在仓库证据能够支撑时才细化；当前证据不足时，图中保留未命名外部系统占位并标注证据缺口。"
    ],
    businessRelation: [
      "组织/过程模型负责解释业务故事和用例；System Context 只保留这些业务能力进入系统边界的外部角色或外部系统入口。",
      "如果业务参与者或业务外部系统尚未被文档确认，本图必须标记为候选，不得用工具侧角色替代真实业务上下文。"
    ],
    engineeringRelation: [
      `软件结构模型基于本地仓库证据识别出 ${engineering.summary.packageCount} 个 package/module、${engineering.summary.componentCount} 个 component 和 ${engineering.summary.hotspotCount} 个复杂度候选点。`,
      `System Context 是架构视图的最高层入口；继续下钻到 ${containerPackages.length} 个 Container 后，才能把系统边界落到可检查的应用、服务、数据存储或运行单元。`
    ],
    evidencePaths,
    questions: [
      "当前本地证据尚未稳定命名真实外部使用者、调用方或上游系统，因此 System Context 保持黑盒系统与外部协作占位。",
      "外部系统、第三方服务或基础设施依赖只有在接口、配置、部署或业务文档提供证据时才细化为具体节点。",
      "Container 候选必须来自运行入口、部署/构建配置、服务边界、应用边界或数据存储证据；普通目录、分层 package 和治理文件不会自动成为 Container。"
    ],
    scope: {},
    elements: [
      c4Element("architecture:c4:person:external-actor", "未命名外部参与者", "person", `触发或使用 ${projectName} 能力的人类角色、上游系统操作者或外部调用方。`, "该参与者位于目标系统之外；当前只说明交互边界，不假设具体业务身份。", {
        confidence: "low",
        evidence: evidencePaths
      }),
      c4Element("architecture:c4:system:target", projectName, "system_context", `${projectName} 的整体软件系统边界。`, "当前图只把目标项目作为一个整体系统，不展开内部模块、代码、文档生成流程或 IDE 运行机制。", {
        evidence: evidencePaths,
        relationshipMeaning: `${projectName} 是所有后续 Container、Component 和 Code View 的共同父边界；任何下钻都必须能回到这个目标系统，而不是开发工具自身的工作流。`
      }),
      c4Element("architecture:c4:external:system-placeholder", "未命名外部系统", "external_system", `${projectName} 可能调用或被调用的外部系统边界。`, "当前仓库证据没有足够的接口、配置、依赖、部署或业务文档证据来命名具体外部系统，因此保留泛化边界。", {
        confidence: "low",
        evidence: evidencePaths,
        relationshipMeaning: "这个节点表达外部协作证据不足的判定结果；不能用开发工具、模型服务或文档生成流程来填补目标系统的业务外部边界。"
      })
    ],
    drilldowns: [],
    relatedEngineeringDocs: []
  };
}

function architectureContainerDocument(
  item: EngineeringPackage,
  engineering: EngineeringComplexityModel,
  containerPackageIds: Set<string>,
  c4Components: EngineeringComponent[]
): ArchitectureC4Document {
  const slug = diagramSlug(item.path);
  const base = `docs/architecture/c4/containers/${slug}/container`;
  const architectureDependencies = item.dependencies.filter((dep) => containerPackageIds.has(dep));
  const componentCount = componentsForC4Container(engineering, item.path, c4Components, "component").length;
  const runtimeCount = engineering.runtimeFlows.filter((flow) => isPathInside(flow.packagePath, item.path) || isPathInside(flow.sourcePath, item.path) || isPathInside(flow.targetPath, item.path)).length;
  const deploymentCount = engineering.deploymentNodes.filter((node) => isPathInside(node.filePath, item.path)).length;
  const engineeringPackagePath = relatedEngineeringPackagePath(engineering, item.path);
  const engineeringSlug = diagramSlug(engineeringPackagePath);
  return {
    id: `architecture:c4:container:${slug}`,
    level: "container",
    title: `容器边界：${item.title}`,
    summary: `${item.title} 是 C4 Container 层候选边界：它必须表现为应用、服务、数据存储、可运行单元或可独立部署/执行的系统部分，而不是普通目录、代码分层或共享工具集合。`,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: `architecture:c4:container:${slug}`,
    status: "candidate",
    confidence: item.confidence,
    mermaid: renderContainerMermaid(item, architectureDependencies),
    responsibility: containerResponsibility(item),
    boundary: `边界来自仓库路径 ${item.path}。C4 Container 不等于任意 package 或代码 layer；只有具备应用、服务、数据存储、运行入口、部署单元、对外接口或独立执行语义的边界才进入本层。普通配置文件、文档目录、CI 目录、仓库治理文件和纯代码分层只能作为证据或软件结构模型对象，不作为 Container。`,
    relationships: [
      architectureDependencies.length ? `依赖其他 Container：${architectureDependencies.join("、")}。` : "当前本地仓库证据未观察到与其他 Container 的直接依赖。",
      `包含 ${componentCount} 个候选组件视图对象、${runtimeCount} 条运行/协作链路、${deploymentCount} 个运行或构建节点。`
    ],
    businessRelation: [
      "这个 Container 不是业务用例本身；它只解释业务能力进入或通过哪个软件系统内部应用/服务/数据存储/运行单元。",
      "如果组织/过程模型中的 Use Case 引用该边界，应在 Use Case 下钻文档中说明它如何进入这个 Container，而不是把业务流程写进 C4 Container 图。"
    ],
    engineeringRelation: [
      `对应软件结构模型 Package Diagram：docs/engineering/package-diagrams/${engineeringSlug}/package-diagram.html。`,
      "继续进入软件结构模型可以查看下钻 UML、结构协作、运行链路和复杂度候选点。"
    ],
    evidencePaths: item.evidencePaths,
    questions: [
      "该边界必须由运行入口、构建/部署配置、服务接口、应用入口、数据存储或独立执行证据支撑；仅靠目录名、文件数量或依赖数量不足以成立。",
      "缺少运行、部署、接口或数据存储证据时，生成流程会降低置信度或不生成独立 Container。"
    ],
    scope: { packageId: item.path, filePath: item.path },
    elements: [
      c4Element(
        `architecture:c4:container:${slug}:self`,
        item.title,
        "container",
        `图中这个节点代表 ${item.title} 这个 C4 Container；当前文档记录 ${componentCount} 个组件下钻入口、${runtimeCount} 条运行协作线索和 ${deploymentCount} 个运行或构建节点。`,
        `边界来自仓库路径 ${item.path}；该路径下的入口、服务接口、应用代码、运行配置和部署证据共同支撑它进入 Container 层，普通配置文件、文档目录或纯代码分层不会单独形成 Container。`,
        {
          responsibility: containerResponsibility(item),
          relationshipMeaning: architectureDependencies.length
            ? `图中从 ${item.title} 指向外部边界，表示这个可运行边界会调用、引用或依赖其他 Container；这些关系用于判断部署、接口和变更影响。`
            : "当前视图只确认该 Container 自身的运行边界，未观察到需要在 C4 Container 层表达的外部 Container 协作。",
          whyThisLevel: "该节点进入 Container 层，是因为本地仓库证据显示它具备应用、服务、数据存储、运行入口、部署单元、对外接口或独立执行语义；不是因为它只是一个目录或 package。",
          evidence: item.evidencePaths.slice(0, 8),
          confidence: item.confidence
        }
      ),
      ...architectureDependencies.slice(0, 8).map((dep) => c4Element(
        `architecture:c4:container:${slug}:dep:${safeId(dep)}`,
        dep,
        "container",
        `${item.title} 依赖 ${dep}。`,
        `${dep} 不属于 ${item.path} 的内部边界；它在当前图中只是被依赖的相邻模块。`,
        {
          relationshipMeaning: `${item.title} -> ${dep} 表示本地仓库证据中存在跨边界调用、引用或配置依赖；它说明技术协作方向，但不能单独证明业务流程关系。`,
          whyThisLevel: `${dep} 按路径归属被投影为相邻 Container 候选，而不是 ${item.title} 内部 Component。`,
          drilldownIntent: `进入 ${dep} 的独立 Container 文档，可以查看它自己的职责和证据；如果没有独立文档，则只把它当作外部依赖事实。`,
          evidence: [`dependency edge: ${item.path} -> ${dep}`],
          confidence: "medium"
        }
      ))
    ],
    drilldowns: [],
    relatedEngineeringDocs: [engineeringLink(`docs/engineering/package-diagrams/${engineeringSlug}/package-diagram`, `${engineeringPackagePath} Package Diagram`, "查看该 Container 所属软件结构 package/module 的边界、依赖和复杂度候选点。")]
  };
}

function buildArchitectureComponentDocuments(
  engineering: EngineeringComplexityModel,
  containerPackageIds: Set<string>,
  c4Components: EngineeringComponent[]
): ArchitectureC4Document[] {
  return Array.from(containerPackageIds)
    .map((packageId) => [packageId, componentsForC4Container(engineering, packageId, c4Components, "component")] as const)
    .filter(([, components]) => components.length > 0)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 16)
    .map(([packageId, components]) => architectureComponentDocument(packageId, components, engineering));
}

function architectureComponentDocument(packageId: string, components: EngineeringComponent[], engineering: EngineeringComplexityModel): ArchitectureC4Document {
  const slug = diagramSlug(packageId);
  const base = `docs/architecture/c4/components/${slug}/component`;
  const selected = components.slice(0, 12);
  return {
    id: `architecture:c4:component:${slug}`,
    level: "component",
    title: `组件职责：${packageId}`,
    summary: `从 C4 Component 层解释 ${packageId} 内部的关键职责单元：入口、页面、命令、接口、注册表、adapter 或共享对象。`,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: `architecture:c4:component:${slug}`,
    status: "candidate",
    confidence: selected.some((item) => item.confidence === "high") ? "high" : "medium",
    mermaid: renderComponentViewMermaid(packageId, selected),
    responsibility: `解释 ${packageId} 这个 Container 内部由哪些关键组件承担架构职责。Component 层不是全量类/函数列表，只保留对理解系统边界、协作或变更影响有帮助的对象。`,
    boundary: `Component View 的边界被限制在 ${packageId} Container 内；跨容器关系应该回到 Container 或 Engineering Sequence 视角解释。`,
    relationships: selected.map((item) => `${item.title}: ${item.summary}`),
    businessRelation: [
      "组件层帮助把业务故事连接到实际入口、编排、适配或基础设施对象。",
      "如果某个组件直接承载 Use Case，应在组织/过程模型的下钻文档中出现对应证据。"
    ],
    engineeringRelation: [
      `对应 Engineering Class / Structural Diagram：docs/engineering/class-structural-diagrams/${slug}/class-structural-diagram.html。`,
      "组件级复用迹象、外部协作迹象和复杂度候选点仍由软件结构模型负责解释。"
    ],
    evidencePaths: selected.map((item) => codeAnchorText(item.filePath, item.line)),
    questions: ["Component 候选只保留入口、编排、接口、适配器、配置、任务、消费者或生产者等组件级职责对象；方法、路由和局部函数下沉到 Code View。"],
    scope: { packageId, filePath: packageId },
    elements: selected.map((item) => c4Element(
      item.id,
      item.title,
      "component",
      `${item.title} 是 ${packageId} 内的 ${item.kind} 候选组件，证据锚点是 ${codeAnchorText(item.filePath, item.line)}；当前仓库证据显示它有 ${relationProfileText(item)}。`,
      `它属于 ${packageId} Container 内部；超出该路径的协作应回到 Container 或软件结构模型中的 Sequence 视角解释。`,
      {
        responsibility: architectureComponentResponsibility(item),
        relationshipMeaning: `${item.title} 被放入 Component View，是因为它能把 ${packageId} 的架构职责落到一个可检查的入口、编排、适配、契约或共享对象上。复用迹象和外部协作迹象用于提示它更像共享核心、对外编排者，还是普通局部对象。`,
        whyThisLevel: `它有明确代码锚点，但当前解释目标不是源码细节，而是 ${packageId} 内部职责如何拆分，所以属于 C4 Component 层。`,
        drilldownIntent: `下钻到 Code View 或软件结构模型的 Component Diagram，用来查看 ${item.title} 的文件锚点、直接协作和是否存在变更扩散风险。`,
        evidence: [codeAnchorText(item.filePath, item.line), relationEvidenceText(item, "复用迹象"), relationEvidenceText(item, "外部协作迹象")],
        confidence: item.confidence
      }
    )),
    drilldowns: [],
    relatedEngineeringDocs: [engineeringLink(`docs/engineering/class-structural-diagrams/${slug}/class-structural-diagram`, `${packageId} Class / Structural Diagram`, "查看该 Container 内部结构协作和关键技术对象。")]
  };
}

function buildArchitectureCodeDocuments(
  engineering: EngineeringComplexityModel,
  containerPackageIds: Set<string>,
  c4Components: EngineeringComponent[]
): ArchitectureC4Document[] {
  return Array.from(containerPackageIds)
    .map((packageId) => [packageId, componentsForC4Container(engineering, packageId, c4Components, "code")] as const)
    .filter(([, components]) => components.length >= 2)
    .sort((left, right) => right[1].reduce((sum, item) => sum + item.fanIn + item.fanOut, 0) - left[1].reduce((sum, item) => sum + item.fanIn + item.fanOut, 0))
    .slice(0, 12)
    .map(([packageId, components]) => architectureCodeDocument(packageId, components));
}

function isC4ComponentCandidate(item: EngineeringComponent): boolean {
  const normalizedTitle = normalizeC4CandidateText(item.title);
  const normalizedKind = normalizeC4CandidateText(item.kind);
  const normalizedSummary = normalizeC4CandidateText(item.summary);
  const normalizedPath = normalizeC4CandidateText(item.filePath);
  const combined = `${normalizedTitle} ${normalizedKind} ${normalizedSummary} ${normalizedPath}`;
  if (isPlainDataOrDomainObjectCandidate(combined)) return false;
  if (normalizedTitle.includes("::") && !hasC4ComponentRoleSignal(combined)) return false;
  if (normalizedKind.includes("method") || normalizedKind.includes("function")) return hasC4ComponentRoleSignal(combined);
  return hasC4ComponentRoleSignal(combined);
}

function hasC4ComponentRoleSignal(value: string): boolean {
  return /\b(application|configuration|config|controller|resource|endpoint|route|router|handler|command|query|service|applicationservice|domainservice|repository|gateway|adapter|provider|client|connector|port|interface|facade|orchestrator|coordinator|processor|consumer|producer|listener|scheduler|worker|job|queue|registry|factory|strategy|policy|resolver|mapper|store|cache|page|panel|view|component|screen|hook|plugin)\b/.test(value)
    || /(application|configuration|controller|resource|endpoint|router|handler|command|service|repository|gateway|adapter|provider|client|connector|facade|orchestrator|processor|listener|scheduler|worker|registry|factory|strategy|resolver|store|page|panel|component|plugin)/.test(value);
}

function isPlainDataOrDomainObjectCandidate(value: string): boolean {
  return /\b(dto|vo|valueobject|value-object|entity|enum|constant|constants|exception|error|money|amount|id|ids|request|response|event|record|model|pojo|bean|commonutils|utils?|helper)\b/.test(value)
    && !hasC4ComponentRoleSignal(value);
}

function normalizeC4CandidateText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_:/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function architectureCodeDocument(packageId: string, components: EngineeringComponent[]): ArchitectureC4Document {
  const slug = diagramSlug(packageId);
  const base = `docs/architecture/c4/code/${slug}/code`;
  const selected = components.slice(0, 10);
  return {
    id: `architecture:c4:code:${slug}`,
    level: "code",
    title: `代码锚点：${packageId}`,
    summary: `从 C4 Code 层解释 ${packageId} 内少量关键代码锚点。Code 层不是代码浏览器，只在需要理解架构组件如何落到具体文件/符号时使用。`,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: `architecture:c4:code:${slug}`,
    status: "candidate",
    confidence: "medium",
    mermaid: renderCodeViewMermaid(packageId, selected),
    responsibility: `把 ${packageId} 的架构组件进一步落到具体文件、函数、类、接口或组件锚点，帮助用户理解实现入口和变更影响面。`,
    boundary: "Code View 只展示必要锚点，不列全量源码；完整结构解释、代码片段和复杂度候选点仍应回到软件结构模型或 IDE 查看。",
    relationships: selected.map((item) => `${item.title} -> ${codeAnchorText(item.filePath, item.line)}`),
    businessRelation: ["Code View 不是业务解释入口；它只在业务故事需要追溯到实现锚点时提供底层证据。"],
    engineeringRelation: ["软件结构模型负责继续解释复用迹象、外部协作迹象、Sequence、复杂度候选点和代码证据预览。"],
    evidencePaths: selected.map((item) => codeAnchorText(item.filePath, item.line)),
    questions: ["Code View 只列少量能够追溯 Component 实现的文件/符号锚点；它不是源码浏览器，也不承载业务流程或完整类图。"],
    scope: { packageId, filePath: packageId },
    elements: selected.map((item) => c4Element(
      item.id,
      item.title,
      "code",
      `${item.title} 是 ${packageId} 的关键代码锚点，位置为 ${codeAnchorText(item.filePath, item.line)}；当前仓库证据显示它有 ${relationProfileText(item)}。`,
      `该锚点只解释 ${packageId} 的一处架构落点；它不是完整源码结构，也不能替代软件结构模型的代码证据预览。`,
      {
        responsibility: architectureCodeResponsibility(item),
        relationshipMeaning: `${item.title} 被放入 Code View，是因为它能把上层 Component 的职责追溯到具体文件/符号。当它被大量对象引用或调用时，应优先理解谁依赖它；当它向外依赖过多对象时，应优先理解它编排了哪些外部能力。`,
        whyThisLevel: `它有精确文件和行号证据 ${codeAnchorText(item.filePath, item.line)}，因此属于 C4 Code 层；如果只讨论职责边界，应回到 Component 或 Container。`,
        drilldownIntent: `下钻或切到软件结构模型时，应查看该锚点的直接协作、附近复杂度候选点和代码片段，判断改动是否会扩散。`,
        evidence: [codeAnchorText(item.filePath, item.line), relationEvidenceText(item, "复用迹象"), relationEvidenceText(item, "外部协作迹象")],
        confidence: item.confidence
      }
    )),
    drilldowns: [],
    relatedEngineeringDocs: []
  };
}

function c4ComponentsFromCodeFacts(codeFacts: CodeFactGraphSnapshot, containerPackageIds: Set<string>): EngineeringComponent[] {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of codeFacts.edges) {
    fanOut.set(edge.sourceId, (fanOut.get(edge.sourceId) ?? 0) + 1);
    fanIn.set(edge.targetId, (fanIn.get(edge.targetId) ?? 0) + 1);
  }
  const byId = new Map<string, EngineeringComponent>();
  for (const node of codeFacts.nodes) {
    const containerPath = containerPathForNode(node, containerPackageIds);
    if (!containerPath || !isC4CodeFactNodeComponentCandidate(node)) continue;
    const stableId = `architecture:c4:code-anchor:${safeId(`${node.kind}:${displayCodeFactNodeName(node)}:${normalizeRepoPath(node.filePath)}:${node.range?.startLine ?? ""}`)}`;
    byId.set(stableId, {
      id: stableId,
      sourceNodeId: node.id,
      title: displayCodeFactNodeName(node),
      kind: node.kind,
      filePath: normalizeRepoPath(node.filePath),
      line: node.range?.startLine,
      fanIn: fanIn.get(node.id) ?? 0,
      fanOut: fanOut.get(node.id) ?? 0,
      packageId: containerPath,
      summary: c4ComponentSummaryFromNode(node, containerPath),
      confidence: c4ComponentConfidenceFromNode(node)
    });
  }
  return Array.from(byId.values()).sort((left, right) =>
    c4ComponentSortScore(right) - c4ComponentSortScore(left)
    || left.title.localeCompare(right.title)
  );
}

function containerPathForNode(node: CodeFactNode, containerPackageIds: Set<string>): string | undefined {
  const filePath = normalizeRepoPath(node.filePath);
  return Array.from(containerPackageIds)
    .filter((containerPath) => isPathInside(filePath, containerPath))
    .sort((left, right) => right.length - left.length)[0];
}

function isC4CodeFactNodeComponentCandidate(node: CodeFactNode): boolean {
  const kind = node.kind.toLowerCase();
  if (kind === "file" || kind === "field" || kind === "variable" || kind === "parameter") return false;
  const label = `${node.name} ${node.qualifiedName} ${node.filePath}`;
  const normalized = normalizeC4CandidateText(label);
  if (kind === "function" && looksLikeExternalImportNode(node)) return false;
  if (isPlainDataOrDomainObjectCandidate(normalized)) return false;
  if (kind === "class" || kind === "interface" || kind === "struct") return hasC4ComponentRoleSignal(normalized);
  if (kind === "method" || kind === "function") return hasC4ComponentRoleSignal(normalized) && !looksLikeAccessorOrTinyMethod(node);
  return hasC4ComponentRoleSignal(normalized);
}

function looksLikeExternalImportNode(node: CodeFactNode): boolean {
  const name = node.name.trim();
  return name.includes(".")
    && !name.includes("::")
    && !name.endsWith("Application")
    && (node.range?.startLine ?? 9999) <= 40;
}

function looksLikeAccessorOrTinyMethod(node: CodeFactNode): boolean {
  const name = node.name.toLowerCase();
  return /^(get|set|is|has)[A-Z_]/.test(node.name) || name === "tostring" || name === "equals" || name === "hashcode";
}

function displayCodeFactNodeName(node: CodeFactNode): string {
  const qualifiedName = node.qualifiedName?.trim();
  const name = node.name?.trim();
  if (qualifiedName && !qualifiedName.includes(".")) return qualifiedName;
  if (name && !name.includes(".")) return name;
  const fileBase = path.posix.basename(normalizeRepoPath(node.filePath)).replace(/\.[^.]+$/, "");
  return fileBase || name || qualifiedName || node.id;
}

function c4ComponentSummaryFromNode(node: CodeFactNode, containerPath: string): string {
  const role = componentRoleNameFromText(`${node.name} ${node.qualifiedName} ${node.filePath}`);
  return `${displayCodeFactNodeName(node)} 是 ${containerPath} 内的${role}，证据来自 ${codeAnchorText(normalizeRepoPath(node.filePath), node.range?.startLine)}。`;
}

function c4ComponentConfidenceFromNode(node: CodeFactNode): "high" | "medium" | "low" {
  const normalized = normalizeC4CandidateText(`${node.name} ${node.qualifiedName} ${node.filePath}`);
  if (/\b(application|controller|service|repository|gateway|adapter|client|configuration|worker|consumer|producer)\b/.test(normalized)) return "high";
  if (hasC4ComponentRoleSignal(normalized)) return "medium";
  return "low";
}

function c4ComponentSortScore(item: EngineeringComponent): number {
  const normalized = normalizeC4CandidateText(`${item.title} ${item.kind} ${item.filePath}`);
  let score = item.fanIn + item.fanOut;
  if (/\b(application|controller|endpoint|resource|handler|router)\b/.test(normalized)) score += 1000;
  if (/\b(service|gateway|adapter|client|repository|configuration|worker|consumer|producer)\b/.test(normalized)) score += 700;
  if (item.kind.toLowerCase() === "class" || item.kind.toLowerCase() === "interface") score += 200;
  return score;
}

function componentRoleNameFromText(value: string): string {
  const normalized = normalizeC4CandidateText(value);
  if (/\b(application)\b/.test(normalized)) return "应用启动组件";
  if (/\b(controller|resource|endpoint)\b/.test(normalized)) return "请求入口组件";
  if (/\b(service|handler|command|query)\b/.test(normalized)) return "应用服务或处理组件";
  if (/\b(repository|store)\b/.test(normalized)) return "持久化访问组件";
  if (/\b(gateway|adapter|provider|client|connector)\b/.test(normalized)) return "外部系统适配组件";
  if (/\b(configuration|config)\b/.test(normalized)) return "运行配置组件";
  if (/\b(worker|consumer|producer|job|scheduler|listener)\b/.test(normalized)) return "后台任务或消息组件";
  if (/\b(page|panel|view|component|screen)\b/.test(normalized)) return "界面组件";
  return "主要架构组件";
}

function connectArchitectureC4Drilldowns(documents: ArchitectureC4Document[]): void {
  const byLevel = new Map<ArchitectureC4Level, ArchitectureC4Document[]>();
  for (const item of documents) byLevel.set(item.level, [...(byLevel.get(item.level) ?? []), item]);
  const containers = byLevel.get("container") ?? [];
  const components = byLevel.get("component") ?? [];
  const code = byLevel.get("code") ?? [];
  for (const item of documents) {
    if (item.level === "system_context") {
      item.drilldowns = containers.slice(0, 18).map((child) => c4Link(child, "contains", architectureDrilldownReason(item, child, "contains")));
    } else if (item.level === "container") {
      item.drilldowns = [
        ...components.filter((child) => child.scope.packageId === item.scope.packageId).map((child) => c4Link(child, "contains", architectureDrilldownReason(item, child, "contains"))),
        ...code.filter((child) => child.scope.packageId === item.scope.packageId).map((child) => c4Link(child, "details", architectureDrilldownReason(item, child, "details")))
      ];
    } else if (item.level === "component") {
      item.drilldowns = code.filter((child) => child.scope.packageId === item.scope.packageId).map((child) => c4Link(child, "details", architectureDrilldownReason(item, child, "details")));
    } else if (item.level === "code") {
      item.drilldowns = components.filter((child) => child.scope.packageId === item.scope.packageId).map((child) => c4Link(child, "parent", architectureDrilldownReason(item, child, "parent")));
    }
    for (const element of item.elements) {
      element.drilldowns = item.drilldowns
        .filter((link) => link.title.includes(element.label) || (item.level === "system_context" && element.level === "system_context"))
        .slice(0, 6);
    }
  }
}

function buildArchitectureC4MapIndex(model: ArchitectureC4Model): ArchitectureC4MapIndex {
  const categories: ArchitectureC4Category[] = [
    architectureCategory("system_context", "System Context", "system-context", "目标软件系统与外部参与者、外部系统和内部容器下钻入口之间的关系。", model.documents.filter((item) => item.level === "system_context")),
    architectureCategory("container", "Containers", "containers", "目标系统内部的应用、服务、数据存储或可运行/部署单元。", model.documents.filter((item) => item.level === "container")),
    architectureCategory("component", "Components", "components", "某个 Container 内部承担清晰职责、接口或协作契约的主要组件。", model.documents.filter((item) => item.level === "component")),
    architectureCategory("code", "Code Views", "code", "某个 Component 落到代码实现时才需要查看的少量关键代码元素。", model.documents.filter((item) => item.level === "code"))
  ];
  return {
    schemaVersion: "praxis.architectureC4MapIndex.v1",
    generatedAt: model.generatedAt,
    projectVersion: model.projectVersion,
    git: model.git,
    rootDocPath: ARCHITECTURE_C4_ROOT_MAP_DOC_RELATIVE_PATH,
    rootHtmlPath: ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH,
    summary: model.summary,
    codeUnderstandingSpine: undefined,
    tree: buildArchitectureC4Tree(model.documents),
    categories
  };
}

function buildArchitectureC4Tree(documents: ArchitectureC4Document[]): ArchitectureC4TreeNode[] {
  const systemContexts = documents.filter((item) => item.level === "system_context");
  const containers = documents.filter((item) => item.level === "container");
  const components = documents.filter((item) => item.level === "component");
  const codeViews = documents.filter((item) => item.level === "code");
  return systemContexts.map((systemContext) => documentToTreeNode(systemContext, containers.map((container) => {
    const packageId = container.scope.packageId;
    const componentChildren = components
      .filter((component) => component.scope.packageId === packageId)
      .map((component) => documentToTreeNode(
        component,
        codeViews
          .filter((code) => code.scope.packageId === component.scope.packageId)
          .map((code) => documentToTreeNode(code, []))
      ));
    return documentToTreeNode(container, componentChildren);
  })));
}

function documentToTreeNode(document: ArchitectureC4Document, children: ArchitectureC4TreeNode[]): ArchitectureC4TreeNode {
  return {
    id: document.id,
    level: document.level,
    title: document.title,
    summary: document.summary,
    docPath: document.docPath,
    htmlPath: document.htmlPath,
    anchor: document.anchor,
    status: document.status,
    confidence: document.confidence,
    children
  };
}

function architectureCategory(level: ArchitectureC4Level, title: string, directoryName: string, summary: string, items: ArchitectureC4Document[]): ArchitectureC4Category {
  return {
    id: `architecture:c4:category:${level}`,
    level,
    title,
    directory: `docs/architecture/c4/${directoryName}`,
    summary,
    count: items.length,
    items
  };
}

function renderArchitectureC4RootMarkdown(index: ArchitectureC4MapIndex): string {
  return [
    "# C4 Model Maps",
    "",
    "架构视图以 C4 抽象层级解释系统架构：System Context、Container、Component、Code。它是 UML Model 的投影，不替代组织/过程模型的业务故事，也不替代软件结构模型的结构证据。",
    "",
    "## 元数据",
    "",
    `项目版本：${index.projectVersion}`,
    `Git：${index.git.shortCommit} / ${index.git.branch} / ${index.git.dirty ? "dirty" : "clean"}`,
    `更新于：${index.generatedAt}`,
    "",
    "## C4 层级索引",
    "",
    "| Level | Count | Maps | Explanation |",
    "| --- | ---: | --- | --- |",
    ...index.categories.map((category) => {
      const firstItemPath = category.items[0]?.docPath ?? index.rootDocPath;
      return `| ${category.title} | ${category.count} | [${category.directory}](${relativeLinkFrom(index.rootDocPath, firstItemPath)}) | ${escapeMarkdownTable(category.summary)} |`;
    }),
    "",
    "## C4 下钻树",
    "",
    ...renderArchitectureTreeMarkdown(index.tree, index.rootDocPath),
    "",
    "## 文档列表",
    "",
    ...index.categories.flatMap((category) => [
      `### ${category.title}`,
      "",
      ...(category.items.length ? category.items.map((item) => `- [${item.title}](${relativeLinkFrom(index.rootDocPath, item.docPath)}) - ${item.summary}`) : ["- 暂无。"]),
      ""
    ]),
    "## 变更记录",
    "",
    `### ${index.projectVersion} - ${index.generatedAt}`,
    "",
    "- 更新 C4 Model Maps，并按 C4 抽象层级生成架构视图文档。",
    ""
  ].join("\n");
}

function renderArchitectureC4RootHtml(index: ArchitectureC4MapIndex): string {
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head><meta charset=\"utf-8\" /><title>C4 Model Maps</title></head>",
    "<body>",
    `<main class="praxis-architecture-map" data-praxis-anchor="architecture:c4:root" data-praxis-kind="architecture_c4_root" data-praxis-status="candidate" data-praxis-confidence="high">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Architecture View</p>",
    "    <h1>C4 Model Maps</h1>",
    "    <p>按 C4 抽象层级解释系统架构：System Context、Container、Component、Code。它是 UML Model 的架构投影，而不是独立真相源。</p>",
    "    <div class=\"meta-row\">",
    `      <span>项目版本：${escapeHtmlText(index.projectVersion)}</span>`,
    `      <span>Git：${escapeHtmlText(index.git.shortCommit)} / ${escapeHtmlText(index.git.branch)} / ${index.git.dirty ? "dirty" : "clean"}</span>`,
    `      <span>更新于：<time datetime="${escapeHtmlAttr(index.generatedAt)}">${escapeHtmlText(index.generatedAt)}</time></span>`,
    "    </div>",
    "  </header>",
    "  <section class=\"metric-index-layer\" data-praxis-anchor=\"architecture:c4:metrics\" data-praxis-kind=\"architecture_c4_metrics\">",
    "    <h2>C4 层级索引</h2>",
    "    <div class=\"metric-index-grid\">",
    renderMetricCard("System Context", index.summary.systemContextCount, "系统与外部人/系统的边界"),
    renderMetricCard("Container", index.summary.containerCount, "可独立解释的架构边界"),
    renderMetricCard("Component", index.summary.componentViewCount, "容器内部关键组件"),
    renderMetricCard("Code", index.summary.codeViewCount, "必要代码锚点"),
    "    </div>",
    "  </section>",
    "  <section class=\"semantic-layer architecture-c4-document-tree\" data-praxis-anchor=\"architecture:c4:document-tree\" data-praxis-kind=\"architecture_c4_document_tree\">",
    "    <h2>C4 文档树</h2>",
    "    <p>System Context 包含 Containers，Container 包含 Component Views，Component View 包含 Code Views；这才是当前 C4 下钻结构。</p>",
    renderArchitectureTreeHtml(index.tree),
    "  </section>",
    `  <script type="application/json" id="praxis-architecture-c4-index">${escapeScriptJson(JSON.stringify(index))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderArchitectureC4DocumentMarkdown(item: ArchitectureC4Document, index: ArchitectureC4MapIndex): string {
  return [
    `# ${item.title}`,
    "",
    `C4 层级：${c4LevelLabel(item.level)}`,
    `状态：${item.status}`,
    `置信度：${item.confidence}`,
    `项目版本：${index.projectVersion}`,
    `Git：${index.git.shortCommit} / ${index.git.branch} / ${index.git.dirty ? "dirty" : "clean"}`,
    `更新于：${index.generatedAt}`,
    "",
    "## 定位",
    "",
    item.summary,
    "",
    "## C4 层级路径",
    "",
    ...renderMarkdownBullets(c4LayerPathLines(item)),
    "",
    "## 责任",
    "",
    item.responsibility,
    "",
    "## 边界",
    "",
    item.boundary,
    "",
    "## 关系",
    "",
    ...renderMarkdownBullets(item.relationships),
    "",
    "## 与业务复杂度的关联",
    "",
    ...renderMarkdownBullets(item.businessRelation),
    "",
    "## 与技术复杂度的关联",
    "",
    ...renderMarkdownBullets(item.engineeringRelation),
    "",
    `## ${c4DiagramTitle(item.level)}`,
    "",
    "```mermaid",
    item.mermaid,
    "```",
    "",
    "## 图内元素解释",
    "",
    ...(item.elements.length ? item.elements.flatMap((element) => [
      `### ${element.label}`,
      "",
      `- 层级：${element.level}`,
      `- 说明：${element.summary}`,
      ...renderOptionalMarkdownField("责任", element.responsibility),
      ...renderOptionalMarkdownField("边界", element.boundary),
      ...renderOptionalMarkdownField("关系意义", element.relationshipMeaning),
      ...renderOptionalMarkdownField("为什么属于该层", element.whyThisLevel),
      ...renderOptionalMarkdownField("下钻意图", element.drilldownIntent),
      `- 置信度：${element.confidence}`,
      ...(element.evidence.length ? ["- 证据：", ...element.evidence.map((line) => `  - ${line}`)] : []),
      ...(element.drilldowns.length ? ["- 可下钻：", ...element.drilldowns.map((link) => `  - [${link.title}](${relativeLinkFrom(item.docPath, link.docPath)}) - ${link.reason}`)] : []),
      ""
    ]) : ["- 当前没有元素级解释。", ""]),
    "## 可下钻 C4",
    "",
    ...(item.drilldowns.length ? item.drilldowns.map((link) => `- [${link.title}](${relativeLinkFrom(item.docPath, link.docPath)}) - ${link.reason}`) : ["- 当前没有下钻 C4 文档。"]),
    "",
    "## 关联软件结构模型",
    "",
    ...(item.relatedEngineeringDocs.length ? item.relatedEngineeringDocs.map((link) => `- [${link.title}](${relativeLinkFrom(item.docPath, link.docPath)}) - ${link.reason}`) : ["- 当前没有关联 Engineering 文档。"]),
    "",
    "## 证据",
    "",
    ...renderMarkdownBullets(item.evidencePaths.length ? item.evidencePaths : ["当前文档没有可列出的证据路径。"]),
    "",
    "## 判定依据",
    "",
    ...renderMarkdownBullets(item.questions.length ? item.questions : ["当前没有额外判定说明。"]),
    "",
    "## 变更记录",
    "",
    `### ${index.projectVersion} - ${index.generatedAt}`,
    "",
    `- 基于本地仓库证据重新生成 ${item.title}。`,
    ""
  ].join("\n");
}

function renderArchitectureC4DocumentHtml(item: ArchitectureC4Document, index: ArchitectureC4MapIndex, documents: ArchitectureC4Document[]): string {
  const layerViews = buildArchitectureC4LayerViews(item, documents);
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    `<head><meta charset="utf-8" /><title>${escapeHtmlText(item.title)}</title></head>`,
    "<body>",
    `<main class="praxis-architecture-map" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}" data-praxis-kind="architecture_c4_${item.level}" data-praxis-status="${item.status}" data-praxis-confidence="${item.confidence}" data-praxis-document-path="${escapeHtmlAttr(item.htmlPath)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(item.drilldowns))}">`,
    "  <header class=\"praxis-design-map-header\">",
    "    <p>Praxis Architecture View</p>",
    `    <h1>${escapeHtmlText(item.title)}</h1>`,
    `    <p>${escapeHtmlText(item.summary)}</p>`,
    "    <div class=\"meta-row\">",
    `      <span>${escapeHtmlText(c4LevelLabel(item.level))}</span>`,
    `      <span>${escapeHtmlText(item.status)} / ${escapeHtmlText(item.confidence)}</span>`,
    `      <span>${escapeHtmlText(index.projectVersion)} · ${escapeHtmlText(index.git.shortCommit)} / ${escapeHtmlText(index.git.branch)}</span>`,
    "    </div>",
    "  </header>",
    renderHtmlListSection("architecture:c4:layer-path", "C4 层级路径", c4LayerPathLines(item)),
    renderHtmlTextSection("architecture:c4:responsibility", "责任", item.responsibility),
    renderHtmlTextSection("architecture:c4:boundary", "边界", item.boundary),
    renderHtmlListSection("architecture:c4:relationships", "关系", item.relationships),
    renderHtmlListSection("architecture:c4:business-relation", "与业务复杂度的关联", item.businessRelation),
    renderHtmlListSection("architecture:c4:engineering-relation", "与技术复杂度的关联", item.engineeringRelation),
    "  <section class=\"semantic-layer diagram-section\" data-praxis-anchor=\"architecture:c4:diagram\" data-praxis-kind=\"architecture_c4_diagram\">",
    `    <h2>${escapeHtmlText(c4DiagramTitle(item.level))}</h2>`,
    `    <pre class="mermaid" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}:c4" data-praxis-c4-current-level="${escapeHtmlAttr(item.level)}" data-praxis-c4-layer-views="${escapeHtmlAttr(JSON.stringify(layerViews))}">${escapeHtmlText(item.mermaid)}</pre>`,
    "  </section>",
    renderHtmlElementSection(item),
    renderHtmlLinkSection("architecture:c4:drilldowns", "可下钻 C4", item.drilldowns),
    renderHtmlLinkSection("architecture:c4:engineering-links", "关联软件结构模型", item.relatedEngineeringDocs),
    renderHtmlListSection("architecture:c4:evidence", "证据", item.evidencePaths),
    renderHtmlListSection("architecture:c4:questions", "判定依据", item.questions.length ? item.questions : ["当前没有额外判定说明。"]),
    `  <script type="application/json" id="praxis-architecture-c4-document">${escapeScriptJson(JSON.stringify(item))}</script>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderArchitectureTreeMarkdown(nodes: ArchitectureC4TreeNode[], fromPath: string, depth = 0): string[] {
  if (!nodes.length) return depth === 0 ? ["- 暂无。"] : [];
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}- [${escapeMarkdownTable(node.title)}](${relativeLinkFrom(fromPath, node.docPath)}) - ${c4LevelLabel(node.level)} / ${node.confidence}`,
    ...renderArchitectureTreeMarkdown(node.children, fromPath, depth + 1)
  ]);
}

function renderArchitectureTreeHtml(nodes: ArchitectureC4TreeNode[]): string {
  if (!nodes.length) return "    <p>暂无。</p>";
  return [
    "    <ol class=\"architecture-c4-tree-root\">",
    ...nodes.map((node) => renderArchitectureTreeNodeHtml(node)),
    "    </ol>"
  ].join("\n");
}

function renderArchitectureTreeNodeHtml(node: ArchitectureC4TreeNode): string {
  return [
    `      <li data-praxis-anchor="${escapeHtmlAttr(node.anchor)}" data-praxis-kind="architecture_c4_tree_node">`,
    `        <article class="layer-card document-entry-card" role="link" tabindex="0" data-praxis-anchor="${escapeHtmlAttr(node.anchor)}" data-praxis-kind="architecture_c4_${node.level}" data-praxis-document-title="${escapeHtmlAttr(node.title)}" data-praxis-document-summary="${escapeHtmlAttr(node.summary)}" data-praxis-document-md="${escapeHtmlAttr(node.docPath)}" data-praxis-document-html="${escapeHtmlAttr(node.htmlPath)}">`,
    `          <h3>${escapeHtmlText(node.title)}</h3>`,
    `          <p>${escapeHtmlText(c4LevelLabel(node.level))} · ${escapeHtmlText(node.confidence)}</p>`,
    `          <p>${escapeHtmlText(node.summary)}</p>`,
    "        </article>",
    ...(node.children.length ? [
      "        <ol>",
      ...node.children.map((child) => renderArchitectureTreeNodeHtml(child)),
      "        </ol>"
    ] : []),
    "      </li>"
  ].join("\n");
}

function renderArchitectureCategoryCard(category: ArchitectureC4Category): string {
  return [
    `      <article class="layer-card document-entry-card" role="link" tabindex="0" data-praxis-anchor="${escapeHtmlAttr(category.id)}" data-praxis-kind="architecture_c4_category" data-praxis-document-title="${escapeHtmlAttr(category.title)}" data-praxis-document-summary="${escapeHtmlAttr(category.summary)}" data-praxis-document-md="${escapeHtmlAttr(category.items[0]?.docPath ?? ARCHITECTURE_C4_ROOT_MAP_DOC_RELATIVE_PATH)}" data-praxis-document-html="${escapeHtmlAttr(category.items[0]?.htmlPath ?? ARCHITECTURE_C4_ROOT_MAP_HTML_RELATIVE_PATH)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(category.items.slice(0, 12).map((item) => c4Link(item, "contains", architectureCategoryDrilldownReason(category, item)))))}">`,
    `        <h3>${escapeHtmlText(category.title)}</h3>`,
    `        <p>${escapeHtmlText(category.count)} document(s) · ${escapeHtmlText(category.directory)}</p>`,
    `        <p>${escapeHtmlText(category.summary)}</p>`,
    "      </article>"
  ].join("\n");
}

function renderMetricCard(label: string, value: number, summary: string): string {
  return [
    `      <article class="metric-group" data-praxis-anchor="architecture:c4:metric:${safeId(label)}" data-praxis-kind="architecture_c4_metric">`,
    `        <header><strong>${escapeHtmlText(label)}</strong><span>${escapeHtmlText(value)}</span></header>`,
    `        <p>${escapeHtmlText(summary)}</p>`,
    "      </article>"
  ].join("\n");
}

function renderHtmlTextSection(anchor: string, title: string, content: string): string {
  return [
    `  <section class="semantic-layer" data-praxis-anchor="${escapeHtmlAttr(anchor)}" data-praxis-kind="architecture_c4_text">`,
    `    <h2>${escapeHtmlText(title)}</h2>`,
    `    <p>${escapeHtmlText(content)}</p>`,
    "  </section>"
  ].join("\n");
}

function renderHtmlListSection(anchor: string, title: string, items: string[]): string {
  return [
    `  <section class="semantic-layer" data-praxis-anchor="${escapeHtmlAttr(anchor)}" data-praxis-kind="architecture_c4_list">`,
    `    <h2>${escapeHtmlText(title)}</h2>`,
    items.length ? "    <ul>" : "    <p>暂无。</p>",
    ...(items.length ? items.map((item) => `      <li>${escapeHtmlText(item)}</li>`) : []),
    items.length ? "    </ul>" : "",
    "  </section>"
  ].join("\n");
}

function renderHtmlElementSection(item: ArchitectureC4Document): string {
  return [
    `  <section class="semantic-layer architecture-c4-elements" data-praxis-anchor="${escapeHtmlAttr(item.anchor)}:elements" data-praxis-kind="architecture_c4_elements">`,
    "    <h2>图内元素解释</h2>",
    item.elements.length ? "    <div class=\"layer-grid\">" : "    <p>暂无元素级解释。</p>",
    ...(item.elements.length ? item.elements.map((element) => [
      `      <article class="layer-card" data-praxis-anchor="${escapeHtmlAttr(element.anchor)}" data-praxis-kind="architecture_c4_element" data-praxis-confidence="${escapeHtmlAttr(element.confidence)}" data-praxis-drilldowns="${escapeHtmlAttr(JSON.stringify(element.drilldowns))}">`,
      `        <h3>${escapeHtmlText(element.label)}</h3>`,
      `        <p>${escapeHtmlText(c4LevelLabel(element.level))} · ${escapeHtmlText(element.confidence)}</p>`,
      `        <p>${escapeHtmlText(element.summary)}</p>`,
      renderElementDefinitionList(element),
      "      </article>"
    ].join("\n")) : []),
    item.elements.length ? "    </div>" : "",
    "  </section>"
  ].join("\n");
}

function renderElementDefinitionList(element: ArchitectureC4Element): string {
  const candidates: Array<[string, string]> = [
    ["责任", element.responsibility],
    ["边界", element.boundary],
    ["关系意义", element.relationshipMeaning],
    ["为什么属于该层", element.whyThisLevel],
    ["下钻意图", element.drilldownIntent]
  ];
  const rows = candidates.filter(([, value]) => Boolean(value && value.trim()));

  if (!rows.length) return "";

  return [
    "        <dl>",
    ...rows.map(([label, value]) => `          <div><dt>${escapeHtmlText(label)}</dt><dd>${escapeHtmlText(value)}</dd></div>`),
    "        </dl>"
  ].join("\n");
}

function renderHtmlLinkSection(anchor: string, title: string, links: ArchitectureC4Link[]): string {
  return [
    `  <section class="semantic-layer architecture-c4-links" data-praxis-anchor="${escapeHtmlAttr(anchor)}" data-praxis-kind="architecture_c4_links">`,
    `    <h2>${escapeHtmlText(title)}</h2>`,
    links.length ? "    <div class=\"layer-grid\">" : "    <p>暂无。</p>",
    ...(links.length ? links.map((link) => [
      `      <article class="layer-card document-entry-card" role="link" tabindex="0" data-praxis-anchor="${escapeHtmlAttr(link.anchor)}" data-praxis-kind="architecture_c4_link" data-praxis-document-title="${escapeHtmlAttr(link.title)}" data-praxis-document-summary="${escapeHtmlAttr(link.reason)}" data-praxis-document-md="${escapeHtmlAttr(link.docPath)}" data-praxis-document-html="${escapeHtmlAttr(link.htmlPath)}">`,
      `        <strong>${escapeHtmlText(link.title)}</strong>`,
      `        <span>${escapeHtmlText(link.relation)}</span>`,
      `        <p>${escapeHtmlText(link.reason)}</p>`,
      link.summary ? `        <small>${escapeHtmlText(link.summary)}</small>` : "",
      "      </article>"
    ].join("\n")) : []),
    links.length ? "    </div>" : "",
    "  </section>"
  ].join("\n");
}

function renderSystemContextMermaid(projectName: string): string {
  return [
    "flowchart LR",
    "  actor[\"未命名外部参与者\"]",
    `  system["${escapeMermaidLabel(projectName)}"]`,
    "  external[\"未命名外部系统\"]",
    "  actor -->|使用 / 调用| system",
    "  system -.->|候选集成| external"
  ].join("\n");
}

function renderContainerMermaid(item: EngineeringPackage, dependencies: string[]): string {
  const center = "container";
  const lines = ["flowchart LR", `  ${center}["${escapeMermaidLabel(item.title)}"]`];
  for (const [index, dep] of dependencies.slice(0, 8).entries()) {
    const depId = `dependency_${index + 1}`;
    lines.push(`  ${depId}["${escapeMermaidLabel(dep)}"]`);
    lines.push(`  ${center} --> ${depId}`);
  }
  return lines.join("\n");
}

function buildArchitectureC4LayerViews(item: ArchitectureC4Document, documents: ArchitectureC4Document[]): ArchitectureC4LayerView[] {
  const systemContext = documents.find((document) => document.level === "system_context");
  const packageId = item.scope.packageId;
  const samePackage = packageId
    ? (level: ArchitectureC4Level) => documents.find((document) => document.level === level && document.scope.packageId === packageId)
    : () => undefined;
  const byLevel = new Map<ArchitectureC4Level, ArchitectureC4Document | undefined>([
    ["system_context", systemContext],
    ["container", packageId ? samePackage("container") : undefined],
    ["component", packageId ? samePackage("component") : undefined],
    ["code", packageId ? samePackage("code") : undefined]
  ]);

  return (["system_context", "container", "component", "code"] as ArchitectureC4Level[]).map((level) => {
    const target = byLevel.get(level);
    const hasOverviewProjection = item.level === "system_context" && level !== "system_context" && documents.some((document) => document.level === level);
    const mermaid = c4LayerViewMermaid(level, item, target, documents);
    return {
      level,
      label: c4LevelLabel(level),
      title: target?.title ?? (hasOverviewProjection ? `${c4LevelLabel(level)} 总览` : c4MissingLayerTitle(level, item)),
      diagramTitle: c4DiagramTitle(level),
      summary: c4LayerViewSummary(level, item, target, hasOverviewProjection),
      docPath: target?.docPath,
      htmlPath: target?.htmlPath,
      mermaid,
      highlightLabels: c4LayerHighlightLabels(level, item, target),
      current: target?.id === item.id || level === item.level,
      missing: !target && !hasOverviewProjection
    };
  });
}

function c4LayerViewMermaid(
  level: ArchitectureC4Level,
  item: ArchitectureC4Document,
  target: ArchitectureC4Document | undefined,
  documents: ArchitectureC4Document[]
): string {
  if (level === "system_context") {
    const system = documents.find((document) => document.level === "system_context");
    return target?.mermaid ?? renderSystemContextMermaid(stripC4TitlePrefix(system?.title ?? "目标系统"));
  }
  if (target) return target.mermaid;
  const sameLevel = documents.filter((document) => document.level === level);
  if (sameLevel.length && item.level === "system_context") return renderC4LayerOverviewMermaid(level, sameLevel);
  return renderMissingC4LayerMermaid(level, item);
}

function renderC4LayerOverviewMermaid(level: ArchitectureC4Level, documents: ArchitectureC4Document[]): string {
  const rootId = "c4_level";
  const lines = [
    "flowchart LR",
    `  ${rootId}["${escapeMermaidLabel(c4LevelLabel(level))}"]`
  ];
  for (const [index, item] of documents.slice(0, 14).entries()) {
    const id = `level_item_${index + 1}`;
    lines.push(`  ${rootId} --> ${id}["${escapeMermaidLabel(stripC4TitlePrefix(item.title))}"]`);
  }
  if (!documents.length) lines.push(`  ${rootId} -.-> missing["尚未生成 ${escapeMermaidLabel(c4LevelLabel(level))} 层"]`);
  return lines.join("\n");
}

function renderMissingC4LayerMermaid(level: ArchitectureC4Level, item: ArchitectureC4Document): string {
  const focus = stripC4TitlePrefix(item.scope.packageId ?? item.title);
  return [
    "flowchart LR",
    `  focus["${escapeMermaidLabel(focus)}"]`,
    `  missing["尚未生成 ${escapeMermaidLabel(c4LevelLabel(level))} 投影"]`,
    "  focus -.-> missing"
  ].join("\n");
}

function c4LayerViewSummary(
  level: ArchitectureC4Level,
  item: ArchitectureC4Document,
  target: ArchitectureC4Document | undefined,
  hasOverviewProjection = false
): string {
  if (target?.id === item.id) {
    return `当前正在阅读 ${c4LevelLabel(level)} 层；下方正式图就是这一层的架构投影。`;
  }
  if (target) {
    if (level === "system_context" && item.level !== "system_context") {
      return `System Context 只展示目标软件系统与外部人/系统的关系，不直接展开内部 ${c4LevelLabel(item.level)}；这里高亮的是“${stripC4TitlePrefix(item.title)}”所属的软件系统边界。`;
    }
    return `切到 ${c4LevelLabel(level)} 层时，高亮会标出“${stripC4TitlePrefix(item.title)}”在该层正式文档中的对应位置。`;
  }
  if (hasOverviewProjection) {
    return `从 System Context 切到 ${c4LevelLabel(level)} 总览，查看目标系统在该层已经生成的全部投影入口。`;
  }
  return `当前对象没有单独的 ${c4LevelLabel(level)} 文档；生成流程不会把证据不足的层级画成正式 C4 图。`;
}

function c4MissingLayerTitle(level: ArchitectureC4Level, item: ArchitectureC4Document): string {
  return `${stripC4TitlePrefix(item.title)} · ${c4LevelLabel(level)} 未生成`;
}

function c4LayerHighlightLabels(level: ArchitectureC4Level, item: ArchitectureC4Document, target: ArchitectureC4Document | undefined): string[] {
  const labels = new Set<string>();
  const packageId = item.scope.packageId ?? target?.scope.packageId;
  if (packageId) {
    labels.add(packageId);
    labels.add(`${packageId} Container`);
    labels.add(`${packageId}（系统内部 Container）`);
    labels.add(path.posix.basename(packageId.replace(/\\/g, "/")));
  }
  if (item.level === "system_context" && !target && level !== "system_context") labels.add(c4LevelLabel(level));
  labels.add(stripC4TitlePrefix(item.title));
  if (target) labels.add(stripC4TitlePrefix(target.title));
  return Array.from(labels).filter((label) => label.trim().length > 0);
}

function stripC4TitlePrefix(value: string): string {
  return value
    .replace(/^(系统上下文|容器边界|组件职责|代码锚点)：/, "")
    .trim();
}

function architectureSystemContextEvidencePaths(containerPackages: EngineeringPackage[]): string[] {
  const paths = containerPackages
    .slice(0, 8)
    .map((item) => item.path);
  return paths.length ? paths : ["."];
}

function architectureContainerPackages(engineering: EngineeringComplexityModel, codeFacts: CodeFactGraphSnapshot): EngineeringPackage[] {
  const seen = new Set<string>();
  const runtimePackages = runtimeContainerPackagesFromCodeFacts(codeFacts);
  const runtimePackagePaths = new Set(runtimePackages.map((item) => item.path));
  return [
    ...runtimePackages,
    ...engineering.packages.filter((item) => isArchitectureContainerPackage(item) && !hasMoreSpecificRuntimeContainer(item.path, runtimePackagePaths))
  ]
    .sort((left, right) => architectureContainerRank(right) - architectureContainerRank(left))
    .filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    });
}

function hasMoreSpecificRuntimeContainer(parentPath: string, runtimePackagePaths: Set<string>): boolean {
  const normalizedParent = normalizeRepoPath(parentPath);
  return Array.from(runtimePackagePaths).some((candidate) =>
    candidate !== normalizedParent
    && candidate.startsWith(`${normalizedParent}/`)
  );
}

function isArchitectureContainerPackage(item: EngineeringPackage): boolean {
  const normalized = normalizeRepoPath(item.path);
  if (!normalized || normalized === ".") return false;
  if (isRepositoryGovernanceOrArtifactPath(normalized)) return false;
  if (!hasArchitectureContainerEvidence(item)) return false;
  return hasC4ContainerBoundaryEvidence(item);
}

function runtimeContainerPackagesFromCodeFacts(codeFacts: CodeFactGraphSnapshot): EngineeringPackage[] {
  const byPath = new Map<string, { evidence: Set<string>; files: Set<string>; nodes: Set<string> }>();
  for (const file of codeFacts.files) {
    const filePath = normalizeRepoPath(file.path);
    if (isRepositoryGovernanceOrArtifactPath(filePath)) continue;
    const boundary = runtimeContainerBoundaryFromEvidencePath(filePath);
    if (!boundary) continue;
    const item = byPath.get(boundary) ?? { evidence: new Set<string>(), files: new Set<string>(), nodes: new Set<string>() };
    item.evidence.add(filePath);
    byPath.set(boundary, item);
  }
  for (const file of codeFacts.files) {
    const filePath = normalizeRepoPath(file.path);
    for (const [boundary, item] of byPath) {
      if (!isPathInside(filePath, boundary)) continue;
      item.files.add(filePath);
      for (const nodeId of file.nodeIds ?? []) item.nodes.add(nodeId);
    }
  }
  return Array.from(byPath.entries()).map(([containerPath, item]): EngineeringPackage => ({
    id: `architecture:c4:runtime-container:${safeId(containerPath)}`,
    title: containerPath,
    path: containerPath,
    fileCount: item.files.size,
    nodeCount: item.nodes.size,
    incoming: 0,
    outgoing: 0,
    dependencies: [],
    evidencePaths: Array.from(item.evidence).sort(),
    confidence: item.evidence.size >= 2 ? "high" : "medium"
  }));
}

function runtimeContainerBoundaryFromEvidencePath(filePath: string): string | undefined {
  if (!isRuntimeContainerEvidencePath(filePath)) return undefined;
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  if (isRepositoryGovernanceOrArtifactPath(parts[0] ?? "")) return undefined;
  if ((parts[0] === "apps" || parts[0] === "services") && parts[1]) return `${parts[0]}/${parts[1]}`;
  const boundaryIndex = parts.findIndex((part, index) => index < 4 && isRuntimeContainerName(part));
  if (boundaryIndex >= 0) return parts.slice(0, boundaryIndex + 1).join("/");
  if (isRuntimeContainerName(parts[0] ?? "")) return parts[0];
  return undefined;
}

function isRuntimeContainerEvidencePath(filePath: string): boolean {
  const normalized = normalizeRepoPath(filePath).toLowerCase();
  return /(^|\/)(dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/i.test(normalized)
    || /(^|\/)[a-z0-9_.$-]*application\.(java|kt|scala)$/i.test(normalized)
    || /(^|\/)(main|server|app|cli)\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt)$/i.test(normalized)
    || /(^|\/)(package\.json|tauri\.conf\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s)$/i.test(normalized);
}

function isRuntimeContainerName(value: string): boolean {
  return /(^|[-_])(app|api|backend|frontend|web|mobile|server|client|worker|gateway|job|consumer|producer|service)([-_]|$)/i.test(value);
}

function hasC4ContainerBoundaryEvidence(item: EngineeringPackage): boolean {
  const normalized = normalizeRepoPath(item.path);
  if (hasRuntimeOrDeploymentEvidence(item)) return true;
  return isExplicitRuntimeBoundaryPath(normalized);
}

function isExplicitRuntimeBoundaryPath(value: string): boolean {
  const parts = value.split("/").filter(Boolean);
  const first = (parts[0] ?? "").toLowerCase();
  const second = (parts[1] ?? "").toLowerCase();
  if ((first === "apps" || first === "services") && second) return true;
  if (["api", "backend", "frontend", "web", "mobile", "server", "client", "worker", "gateway"].includes(first)) return true;
  if (/(^|[-_])(service|app|api|backend|frontend|server|client|worker|gateway)$/i.test(first)) return true;
  return false;
}

function hasRuntimeOrDeploymentEvidence(item: EngineeringPackage): boolean {
  const haystack = [item.path, ...item.evidencePaths].map((value) => normalizeRepoPath(value).toLowerCase());
  return haystack.some((value) => isRuntimeContainerEvidencePath(value) || /(^|\/)(kubernetes|k8s|helm|chart\.ya?ml)(\/|$)/i.test(value));
}

function hasArchitectureContainerEvidence(item: EngineeringPackage): boolean {
  return item.fileCount >= 2 || item.nodeCount >= 5 || item.dependencies.length > 0;
}

function isRepositoryGovernanceOrArtifactPath(value: string): boolean {
  const parts = value.split("/").filter(Boolean);
  const first = (parts[0] ?? "").toLowerCase();
  if (!first) return true;
  if (first.startsWith(".")) return true;
  const excludedRoots = new Set([
    "doc",
    "docs",
    "documentation",
    "artifacts",
    "target",
    "dist",
    "build",
    "coverage",
    "node_modules",
    "tmp",
    "temp",
    "test",
    "tests",
    "integration-test",
    "scripts",
    "history"
  ]);
  if (excludedRoots.has(first)) return true;
  if (parts.length === 1 && /\.[a-z0-9]+$/i.test(first)) return true;
  return false;
}

function architectureContainerRank(item: EngineeringPackage): number {
  const normalized = normalizeRepoPath(item.path);
  const first = normalized.split("/")[0]?.toLowerCase() ?? "";
  let score = item.fileCount + (item.nodeCount / 20) + item.dependencies.length * 4;
  if (normalized.startsWith("apps/")) score += 1200;
  if (normalized.startsWith("services/")) score += 1150;
  if (hasRuntimeOrDeploymentEvidence(item)) score += 1000;
  if (first === "api" || first === "backend" || first === "frontend" || first === "server" || first === "client" || first === "worker" || first === "gateway") score += 900;
  return score;
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function renderComponentViewMermaid(packageId: string, components: EngineeringComponent[]): string {
  const lines = ["flowchart TB", `  container["${escapeMermaidLabel(packageId)} Container"]`];
  for (const [index, component] of components.slice(0, 10).entries()) {
    const id = `component_${index + 1}`;
    lines.push(`  ${id}["${escapeMermaidLabel(component.title)}"]`);
    lines.push(`  container --> ${id}`);
  }
  return lines.join("\n");
}

function renderCodeViewMermaid(packageId: string, components: EngineeringComponent[]): string {
  const lines = ["flowchart TB", `  package["${escapeMermaidLabel(packageId)}"]`];
  for (const [index, component] of components.slice(0, 8).entries()) {
    const fileId = `file_${index + 1}`;
    const componentId = `code_${index + 1}`;
    lines.push(`  ${fileId}["${escapeMermaidLabel(component.filePath)}"]`);
    lines.push(`  ${componentId}["${escapeMermaidLabel(component.title)}"]`);
    lines.push(`  package --> ${fileId}`);
    lines.push(`  ${fileId} --> ${componentId}`);
  }
  return lines.join("\n");
}

type C4ComponentSelectionMode = "component" | "code";

function componentsForC4Container(
  engineering: EngineeringComplexityModel,
  packageId: string,
  c4Components: EngineeringComponent[],
  mode: C4ComponentSelectionMode
): EngineeringComponent[] {
  void engineering;
  const components = c4Components;
  const seen = new Set<string>();
  return components
    .filter((component) => isPathInside(component.filePath, packageId))
    .filter((component) => isC4ComponentSelectionCandidate(component, mode))
    .filter((component) => {
      const key = c4ComponentSelectionKey(component, mode);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => c4ComponentSortScore(right) - c4ComponentSortScore(left) || left.title.localeCompare(right.title));
}

function isC4ComponentSelectionCandidate(item: EngineeringComponent, mode: C4ComponentSelectionMode): boolean {
  if (!isC4ComponentCandidate(item)) return false;
  if (mode === "code") return true;
  const normalizedKind = normalizeC4CandidateText(item.kind);
  if (normalizedKind.includes("method") || normalizedKind.includes("function") || normalizedKind.includes("route")) return false;
  if (item.title.includes("::") || /^(GET|POST|PUT|PATCH|DELETE)\s+/i.test(item.title)) return false;
  return true;
}

function c4ComponentSelectionKey(item: EngineeringComponent, mode: C4ComponentSelectionMode): string {
  const title = item.title.toLowerCase();
  const filePath = normalizeRepoPath(item.filePath).toLowerCase();
  if (mode === "component") return `${title}:${filePath}`;
  if (item.title.includes("::") || /^(GET|POST|PUT|PATCH|DELETE)\s+/i.test(item.title)) {
    return `${title}:${filePath}:${item.line ?? ""}`;
  }
  return `${title}:${filePath}:${item.kind.toLowerCase()}`;
}

function relatedEngineeringPackagePath(engineering: EngineeringComplexityModel, containerPath: string): string {
  if (engineering.packages.some((item) => item.path === containerPath)) return containerPath;
  const candidates = engineering.packages
    .filter((item) => isPathInside(containerPath, item.path))
    .sort((left, right) => right.path.length - left.path.length);
  return candidates[0]?.path ?? moduleIdForPath(containerPath);
}

function isPathInside(filePath: string, candidateRoot: string): boolean {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const normalizedRoot = normalizeRepoPath(candidateRoot);
  return normalizedFilePath === normalizedRoot || normalizedFilePath.startsWith(`${normalizedRoot}/`);
}

function containerResponsibility(item: EngineeringPackage): string {
  const path = item.path.toLowerCase();
  if (item.path.startsWith("apps/")) return `${item.title} 是应用级 Container 候选：仓库证据显示它靠近可运行入口、桌面/前端/后端应用壳或用户可感知的系统能力。`;
  if (item.path.startsWith("services/")) return `${item.title} 是服务级 Container 候选：它应代表一个可独立运行、部署或对外提供接口的服务边界。`;
  if (path.includes("backend") || path.includes("api") || path.includes("server") || path.includes("gateway")) return `${item.title} 承载服务端或 API 入口，负责把外部请求、协议适配或系统间调用接入目标软件系统内部。`;
  if (path.includes("frontend") || path.includes("web") || path.includes("mobile") || path.includes("applet") || path.includes("client")) return `${item.title} 承载用户界面或客户端入口，负责把用户操作转换为目标软件系统可处理的请求或交互。`;
  if (path.includes("worker") || path.includes("job") || path.includes("consumer") || path.includes("scheduler")) return `${item.title} 承载后台任务、消息消费或定时作业，负责异步处理、批量处理或系统内部自动化流程。`;
  return `${item.title} 承载一个可独立讨论的运行/部署边界；当前证据显示它具备运行入口、构建部署、服务接口、应用入口、数据存储或独立执行语义。`;
}

function c4Element(
  id: string,
  label: string,
  level: ArchitectureC4Element["level"],
  summary: string,
  boundary: string,
  options: ArchitectureC4ElementOptions = {}
): ArchitectureC4Element {
  return {
    id,
    label,
    level,
    anchor: id,
    summary,
    responsibility: options.responsibility ?? summary,
    boundary,
    relationshipMeaning: options.relationshipMeaning ?? defaultC4RelationshipMeaning(level, label),
    whyThisLevel: options.whyThisLevel ?? defaultC4LevelReason(level),
    drilldownIntent: options.drilldownIntent ?? defaultC4DrilldownIntent(level, label),
    evidence: options.evidence ?? [],
    confidence: options.confidence ?? (level === "system_context" || level === "person" || level === "external_system" ? "high" : "medium"),
    drilldowns: []
  };
}

function architectureComponentResponsibility(item: EngineeringComponent): string {
  const role = componentArchitectureRole(item);
  return `${item.title} 在当前 C4 Component View 中被视为${role}。这个判断不是由名称单独决定，而是由 ${codeAnchorText(item.filePath, item.line)}、${item.kind} 类型和 ${relationProfileText(item)} 共同支撑。`;
}

function relationProfileText(item: EngineeringComponent): string {
  if (item.fanOut > item.fanIn && item.fanOut >= 5) return "较强的外部协作/编排迹象";
  if (item.fanIn > item.fanOut && item.fanIn >= 5) return "较强的被复用/被依赖迹象";
  if (item.fanIn + item.fanOut >= 8) return "存在多处协作线索，需要结合上下文判断职责";
  return "局部关系迹象，适合作为候选锚点而非完整结论";
}

function relationEvidenceText(item: EngineeringComponent, label: string): string {
  const count = label.includes("复用") ? item.fanIn : item.fanOut;
  const direction = label.includes("复用") ? "incoming" : "outgoing";
  return `${label}：${architectureRelationTextFromCount(count, direction)}`;
}

function architectureRelationTextFromCount(count: number, direction: "incoming" | "outgoing"): string {
  if (direction === "incoming") {
    if (count <= 0) return "当前未观察到明显复用线索";
    if (count >= 20) return "被多个对象复用或依赖";
    return "存在局部复用或依赖线索";
  }
  if (count <= 0) return "当前未观察到明显外部协作线索";
  if (count >= 20) return "协调多个外部对象或能力";
  return "存在局部外部协作线索";
}

function architectureCodeResponsibility(item: EngineeringComponent): string {
  if (item.fanOut > item.fanIn && item.fanOut >= 5) {
    return `${item.title} 更像一个对外编排或聚合锚点：它从 ${codeAnchorText(item.filePath, item.line)} 发出较多关系，改动时要优先检查它调用或引用的下游能力。`;
  }
  if (item.fanIn > item.fanOut && item.fanIn >= 5) {
    return `${item.title} 更像一个被复用或被依赖锚点：它在 ${codeAnchorText(item.filePath, item.line)} 被多处关系指向，改动时要优先检查上游调用者和契约稳定性。`;
  }
  return `${item.title} 是一个局部实现锚点：它把上层组件职责落到 ${codeAnchorText(item.filePath, item.line)}，当前关系压力不高，但仍可作为理解实现入口的证据。`;
}

function componentArchitectureRole(item: EngineeringComponent): string {
  const normalized = `${item.kind} ${item.title} ${item.summary}`.toLowerCase();
  if (normalized.includes("page") || normalized.includes("component")) return "用户界面或页面入口组件";
  if (normalized.includes("command") || normalized.includes("handler")) return "命令/请求处理入口";
  if (normalized.includes("adapter") || normalized.includes("client") || normalized.includes("provider")) return "外部能力适配组件";
  if (normalized.includes("schema") || normalized.includes("type")) return "契约或数据结构组件";
  if (item.fanOut >= 8) return "编排/聚合组件";
  if (item.fanIn >= 8) return "共享核心或被依赖组件";
  return "候选架构组件";
}

function architectureDrilldownReason(
  parent: ArchitectureC4Document,
  child: ArchitectureC4Document,
  relation: ArchitectureC4Link["relation"]
): string {
  const packageId = child.scope.packageId ?? parent.scope.packageId ?? child.title;
  if (parent.level === "system_context" && child.level === "container") {
    return `从系统上下文进入 ${child.title}，是为了把目标系统放大到 ${packageId} 这个应用、服务、数据存储或运行单元，判断它如何承担系统内部的 C4 Container 职责。`;
  }
  if (parent.level === "container" && child.level === "component") {
    return `进入 ${child.title} 可以回答“${parent.title} 由哪些内部组件承载”。重点看入口、编排、适配、契约和共享对象，而不是浏览全量文件。`;
  }
  if ((parent.level === "container" || parent.level === "component") && child.level === "code") {
    return `进入 ${child.title} 是为了把 ${parent.title} 的架构职责追溯到具体文件/符号锚点；只有需要判断实现入口或变更影响面时才应下钻到 Code。`;
  }
  if (parent.level === "code" && child.level === "component") {
    return `回到 ${child.title} 可以避免只从代码锚点理解架构，重新检查这些锚点共同承担的组件职责和边界。`;
  }
  if (relation === "related_engineering") return `切到 ${child.title} 可以查看技术复杂度证据，例如被引用/调用关系、对外依赖/调用关系、调用片段、热点和代码预览。`;
  return `打开 ${child.title}，用于从 ${parent.title} 继续下钻到更具体的 C4 架构证据。`;
}

function architectureCategoryDrilldownReason(category: ArchitectureC4Category, item: ArchitectureC4Document): string {
  if (category.level === "system_context") return "打开系统上下文，先查看目标软件系统与外部参与者、外部系统和内部容器入口的边界判定。";
  if (category.level === "container") return `打开 ${item.title}，判断这个应用、服务、数据存储或运行单元如何处在目标系统内部，而不是把普通目录当成架构层。`;
  if (category.level === "component") return `打开 ${item.title}，查看 Container 内部哪些对象承担入口、编排、适配、契约或共享职责。`;
  if (category.level === "code") return `打开 ${item.title}，把上层组件追溯到少量关键代码锚点，并判断变更影响面。`;
  return item.summary;
}

function defaultC4RelationshipMeaning(level: ArchitectureC4Element["level"], label: string): string {
  if (level === "person") return `${label} 是目标系统外部参与者；关系意义在于说明谁触发、使用或接收系统能力。`;
  if (level === "external_system") return `${label} 是目标系统边界外的协作系统；关系意义在于说明哪些能力依赖外部服务或被外部调用。`;
  if (level === "repository") return `${label} 是代码和版本事实来源；关系意义在于把架构解释绑定到 Git 与真实仓库。`;
  if (level === "project_memory") return `${label} 是项目文档或记忆承载物；只有当目标系统自身以它为运行或协作边界时才应进入 System Context。`;
  return `${label} 是当前 C4 层级中的候选架构对象；关系意义需要结合相邻节点、证据路径和下钻文档判断。`;
}

function defaultC4LevelReason(level: ArchitectureC4Element["level"]): string {
  if (level === "person" || level === "external_system" || level === "repository" || level === "project_memory") return "它位于系统边界外或系统边界交界处，因此只在 System Context 层解释。";
  if (level === "system_context") return "它代表整体系统边界，不展开内部实现。";
  if (level === "container") return "它代表目标软件系统内部的应用、服务、数据存储或可独立运行/部署单元；当前层级必须由入口、接口、配置、部署、运行或数据存储证据支撑。";
  if (level === "component") return "它解释 Container 内部职责分配，而不是源码细节。";
  return "它有具体代码锚点，因此只在 Code View 中解释。";
}

function defaultC4DrilldownIntent(level: ArchitectureC4Element["level"], label: string): string {
  if (level === "system_context") return `从 ${label} 下钻到 Container，用来查看系统能力落在哪些架构边界。`;
  if (level === "container") return `从 ${label} 下钻到 Component，用来查看边界内部的职责分解。`;
  if (level === "component") return `从 ${label} 下钻到 Code View，用来查看职责对应的文件/符号证据。`;
  if (level === "code") return `从 ${label} 回到 Component 或软件结构模型，用来避免把单个代码锚点误读成完整架构。`;
  return `围绕 ${label} 的下钻用于解释系统边界、外部协作或项目记忆证据。`;
}

function c4Link(item: ArchitectureC4Document, relation: ArchitectureC4Link["relation"], reason: string): ArchitectureC4Link {
  return {
    id: item.id,
    level: item.level,
    title: item.title,
    summary: item.summary,
    docPath: item.docPath,
    htmlPath: item.htmlPath,
    anchor: item.anchor,
    relation,
    reason
  };
}

function engineeringLink(base: string, title: string, reason: string): ArchitectureC4Link {
  return {
    id: `architecture:c4:engineering-link:${safeId(base)}`,
    level: "code",
    title,
    summary: reason,
    docPath: `${base}.md`,
    htmlPath: `${base}.html`,
    anchor: `architecture:c4:engineering-link:${safeId(base)}`,
    relation: "related_engineering",
    reason
  };
}

function c4LevelLabel(level: ArchitectureC4Level | ArchitectureC4Element["level"]): string {
  if (level === "system_context") return "System Context";
  if (level === "container") return "Container";
  if (level === "component") return "Component";
  if (level === "code") return "Code";
  if (level === "person") return "Person";
  if (level === "external_system") return "External System";
  if (level === "repository") return "Repository";
  if (level === "project_memory") return "Generated Artifacts";
  return String(level);
}

function c4DiagramTitle(level: ArchitectureC4Level): string {
  if (level === "system_context") return "C4 System Context 图";
  if (level === "container") return "C4 Container 图";
  if (level === "component") return "C4 Component 图";
  return "C4 Code View 图";
}

function c4LayerPathLines(item: ArchitectureC4Document): string[] {
  if (item.level === "system_context") {
    return [
      "当前层：System Context，解释目标软件系统与外部参与者、外部系统之间的边界。",
      "上层：无，这是当前 C4 树的根层。",
      "下层：Container，进入系统内部的应用、服务、数据存储或运行单元。"
    ];
  }
  if (item.level === "container") {
    return [
      "当前层：Container，解释目标系统内部一个可独立理解的应用、服务、数据存储或运行单元。",
      "上层：System Context，说明该 Container 属于哪个目标软件系统。",
      "下层：Component，解释该 Container 内部的入口、接口、编排、适配、契约或共享对象。"
    ];
  }
  if (item.level === "component") {
    return [
      "当前层：Component，解释某个 Container 内部的关键职责单元。",
      "上层：Container，限定这些组件所属的架构边界。",
      "下层：Code View，只在需要追溯实现入口或变更影响面时进入少量关键代码锚点。"
    ];
  }
  return [
    "当前层：Code View，解释上层 Component 如何落到具体文件、函数、类、接口或组件锚点。",
    "上层：Component，说明这些代码锚点共同服务的组件职责。",
    "下层：无；继续理解细节时应回到 IDE、代码预览或软件结构模型，而不是把 Code View 当成完整源码浏览器。"
  ];
}

function moduleIdForPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) return "root";
  if ((parts[0] === "apps" || parts[0] === "packages") && parts[1]) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "docs") return parts[1] && !parts[1].includes(".") ? `docs/${parts[1]}` : "docs";
  return parts[0];
}

function codeAnchorText(filePath: string, line?: number): string {
  return line ? `${filePath}#L${line}` : filePath;
}

function diagramSlug(value: string): string {
  return safeId(value)
    .replace(/[:.]+/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase() || "diagram";
}

function relativeLinkFrom(fromPath: string, toPath: string): string {
  const relative = path.posix.relative(path.posix.dirname(fromPath.replace(/\\/g, "/")), toPath.replace(/\\/g, "/"));
  return relative || path.posix.basename(toPath);
}

function renderMarkdownBullets(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- 暂无。"];
}

function renderOptionalMarkdownField(label: string, value: string): string[] {
  const trimmed = value.trim();
  return trimmed ? [`- ${label}：${trimmed}`] : [];
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "item";
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, "'");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function escapeHtmlText(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/`/g, "&#96;");
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
