import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReviewPromptCategory =
  | "foundation_integrity"
  | "architecture_boundaries"
  | "dependencies_coupling"
  | "build_release"
  | "testing_verification"
  | "security_secrets"
  | "configuration_environment"
  | "code_quality_maintainability"
  | "api_contracts_data_flow"
  | "performance_resources"
  | "documentation_knowledge";

export type PromptName =
  | "project-intake-analyze"
  | "project-overview-discovery"
  | "project-change-plan"
  | "project-create-requirements"
  | "project-create-architecture"
  | "project-create-graph"
  | "code-understanding-spine"
  | "uml-model-discovery"
  | "uml-model-organization-process"
  | "uml-model-software-structure"
  | "uml-model-deployment-artifact"
  | "uml-model-traceability"
  | "design-discovery-use-cases"
  | "design-story-intake"
  | "design-drilldown-activity"
  | "design-drilldown-sequence"
  | "design-drilldown-state-machine"
  | "design-drilldown-class-collaboration"
  | "design-diagram-discussion"
  | "design-version-decision"
  | "engineering-discovery-diagrams"
  | "engineering-diagram-package"
  | "engineering-diagram-component"
  | "engineering-diagram-class-structural"
  | "engineering-diagram-sequence"
  | "engineering-diagram-deployment"
  | "engineering-diagram-hotspot"
  | "engineering-diagram-discussion"
  | "architecture-discovery-c4"
  | "architecture-c4-system-context"
  | "architecture-c4-container"
  | "architecture-c4-component"
  | "architecture-c4-code"
  | "architecture-c4-discussion"
  | "graph-node-explain"
  | "graph-edge-explain"
  | "graph-node-plan"
  | "graph-edge-plan"
  | "coding-task-generate"
  | "memory-summarize"
  | "review-finding-discussion"
  | "review-quality-base"
  | "review-architecture-boundaries"
  | "review-dependencies-coupling"
  | "review-build-release"
  | "review-testing-verification"
  | "review-security-secrets"
  | "review-configuration-environment"
  | "review-code-quality-maintainability"
  | "review-api-contracts-data-flow"
  | "review-performance-resources"
  | "review-documentation-knowledge";

export interface PromptTemplate {
  name: PromptName;
  body: string;
  sourcePath?: string;
}

export interface PromptLookupOptions {
  overrideDirs?: string[];
}

const promptFileNames: Record<PromptName, string> = {
  "project-intake-analyze": "project-intake-analyze.md",
  "project-overview-discovery": "project-overview-discovery.md",
  "project-change-plan": "project-change-plan.md",
  "project-create-requirements": "project-create-requirements.md",
  "project-create-architecture": "project-create-architecture.md",
  "project-create-graph": "project-create-graph.md",
  "code-understanding-spine": "code-understanding-spine.md",
  "uml-model-discovery": "uml-model-discovery.md",
  "uml-model-organization-process": "uml-model-organization-process.md",
  "uml-model-software-structure": "uml-model-software-structure.md",
  "uml-model-deployment-artifact": "uml-model-deployment-artifact.md",
  "uml-model-traceability": "uml-model-traceability.md",
  "design-discovery-use-cases": "design-discovery-use-cases.md",
  "design-story-intake": "design-story-intake.md",
  "design-drilldown-activity": "design-drilldown-activity.md",
  "design-drilldown-sequence": "design-drilldown-sequence.md",
  "design-drilldown-state-machine": "design-drilldown-state-machine.md",
  "design-drilldown-class-collaboration": "design-drilldown-class-collaboration.md",
  "design-diagram-discussion": "design-diagram-discussion.md",
  "design-version-decision": "design-version-decision.md",
  "engineering-discovery-diagrams": "engineering-discovery-diagrams.md",
  "engineering-diagram-package": "engineering-diagram-package.md",
  "engineering-diagram-component": "engineering-diagram-component.md",
  "engineering-diagram-class-structural": "engineering-diagram-class-structural.md",
  "engineering-diagram-sequence": "engineering-diagram-sequence.md",
  "engineering-diagram-deployment": "engineering-diagram-deployment.md",
  "engineering-diagram-hotspot": "engineering-diagram-hotspot.md",
  "engineering-diagram-discussion": "engineering-diagram-discussion.md",
  "architecture-discovery-c4": "architecture-discovery-c4.md",
  "architecture-c4-system-context": "architecture-c4-system-context.md",
  "architecture-c4-container": "architecture-c4-container.md",
  "architecture-c4-component": "architecture-c4-component.md",
  "architecture-c4-code": "architecture-c4-code.md",
  "architecture-c4-discussion": "architecture-c4-discussion.md",
  "graph-node-explain": "graph-node-explain.md",
  "graph-edge-explain": "graph-edge-explain.md",
  "graph-node-plan": "graph-node-plan.md",
  "graph-edge-plan": "graph-edge-plan.md",
  "coding-task-generate": "coding-task-generate.md",
  "memory-summarize": "memory-summarize.md",
  "review-finding-discussion": "review-finding-discussion.md",
  "review-quality-base": "review-quality-base.md",
  "review-architecture-boundaries": "review-architecture-boundaries.md",
  "review-dependencies-coupling": "review-dependencies-coupling.md",
  "review-build-release": "review-build-release.md",
  "review-testing-verification": "review-testing-verification.md",
  "review-security-secrets": "review-security-secrets.md",
  "review-configuration-environment": "review-configuration-environment.md",
  "review-code-quality-maintainability": "review-code-quality-maintainability.md",
  "review-api-contracts-data-flow": "review-api-contracts-data-flow.md",
  "review-performance-resources": "review-performance-resources.md",
  "review-documentation-knowledge": "review-documentation-knowledge.md"
};

const reviewPromptNames: Record<ReviewPromptCategory, PromptName> = {
  foundation_integrity: "review-documentation-knowledge",
  architecture_boundaries: "review-architecture-boundaries",
  dependencies_coupling: "review-dependencies-coupling",
  build_release: "review-build-release",
  testing_verification: "review-testing-verification",
  security_secrets: "review-security-secrets",
  configuration_environment: "review-configuration-environment",
  code_quality_maintainability: "review-code-quality-maintainability",
  api_contracts_data_flow: "review-api-contracts-data-flow",
  performance_resources: "review-performance-resources",
  documentation_knowledge: "review-documentation-knowledge"
};

const fallbackPromptBodies: Record<PromptName, string> = {
  "project-intake-analyze": "You are Praxis Studio's Project Intake Agent. Local scan facts are FACT. Your output is CANDIDATE or INFERENCE. Output JSON only.",
  "project-overview-discovery": "你是 Praxis Studio 的 Project Overview Agent。只在项目概要文档缺失时运行；根据 README、CHANGELOG、AGENTS 和可用本地事实生成 docs/project/project-overview.md 与 docs/project/project-timeline.md 的结构化草稿。输出严格 JSON。",
  "project-change-plan": "你是 Praxis Studio 的 Project Change Plan Agent。根据 docs 中的设计、工程、架构和项目概要文档，编排项目变更项、开发计划、语义化版本和预期 changelog。输出严格 JSON。",
  "project-create-requirements": "You are Praxis Studio's Requirement Agent. Generate requirements, assumptions, non-goals, and questions. Output JSON only.",
  "project-create-architecture": "You are Praxis Studio's Architecture Agent. Generate architecture component candidates and risks. Output JSON only.",
  "project-create-graph": "You are Praxis Studio's Graph Creation Agent. Generate a Development Graph candidate from confirmed product intent. Output JSON only.",
  "code-understanding-spine": "你是 Praxis Studio 的 Code-First Discovery Spine Agent。只从仓库代码和本地仓库证据恢复 Design / Engineering / Architecture 共享的代码理解骨架；输出严格 JSON。",
  "uml-model-discovery": "你是 Praxis Studio 的 UML Model Discovery Agent。根据 UML 2.x 的 Model、Package、Classifier、Behavior、Diagram Projection 和 Trace / Refine 概念，把项目文档组织为 docs/models 下的统一模型注册表。业务与技术通过 Model viewpoint、stakeholder 和 abstraction level 区分，而不是通过图种或固定分层区分。输出严格 JSON。",
  "uml-model-organization-process": "组织/过程模型描述 Actor、UseCase、Activity、Interaction、StateMachine 和业务概念 Class。UseCase 只描述 subject 对 Actor 或 stakeholder 产生的可观察结果，不描述 subject 内部结构。",
  "uml-model-software-structure": "软件结构模型描述 Package、Component、Interface、Port、Connector、Class、Property、Operation 以及 owned Behavior。它解释模块化、接口契约、结构协作和运行时行为，不把目录、import/reference、fan-in/fan-out 或工具节点 ID 当成模型对象。",
  "uml-model-deployment-artifact": "制品/部署模型描述 Artifact、Node、Device、ExecutionEnvironment、Deployment、DeploymentSpecification 和 CommunicationPath。它解释物理信息项和执行资源之间的分配关系。",
  "uml-model-traceability": "Traceability 负责在不同 Model 之间建立 Abstraction、Trace、Refine 或 Realize 关系。C4 和旧 Explorer 只能作为投影存在，必须声明它们投影自哪些 UML Model 元素。",
  "design-discovery-use-cases": "你是 Praxis Studio 的 Design Discovery Agent。请从证据中恢复候选业务故事和用例，并只输出 praxis.interactionModel.v1 JSON。",
  "design-story-intake": "你是 Praxis Studio 的 Design Story Intake Agent。只判断用户是否在描述新业务故事；若成立，输出可新增 Use Case Diagram 的严格 JSON；若不成立，给出缺口说明。",
  "design-drilldown-activity": "Activity Diagram 用于解释 Use Case 的业务流程覆盖，不是函数调用流程。输出必须说明覆盖场景、边界、不覆盖内容和证据。",
  "design-drilldown-sequence": "Sequence Diagram 用于解释一个具体交互场景，不是完整调用图。复杂 Use Case 必须按场景拆分多张。",
  "design-drilldown-state-machine": "State Machine Diagram 只用于解释有证据支持的关键业务对象生命周期；没有状态证据时不要输出。",
  "design-drilldown-class-collaboration": "Class / Structural Collaboration Diagram 用于解释 Use Case 的结构协作切片，不是全量类图或目录结构图。",
  "design-diagram-discussion": "你是 Praxis Studio 的 Design Diagram Discussion Agent。只围绕当前选中的 Use Case Diagram 解释、讨论或提出候选操作；输出严格 JSON。",
  "design-version-decision": "你是 Praxis Studio 的 Design Version Decision Agent。根据一次原子化设计/需求变更决定 Semantic Versioning bump，并输出严格 JSON。",
  "engineering-discovery-diagrams": "你是 Praxis Studio 的 Engineering Discovery Diagrams Agent。根据本地仓库证据和 Code-First Discovery Spine 生成代码优先的技术复杂度 UML 文档，必须解释图内元素、关系意义、下钻意图、证据和变更影响。",
  "engineering-diagram-package": "Package Diagram 解释工程技术边界和跨模块依赖。每个包节点和依赖节点都必须说明角色、关系意义、证据、下钻意图和变更影响。",
  "engineering-diagram-component": "Component Diagram 解释关键技术对象、入口、文件、被引用/调用关系和对外依赖/调用关系。每个元素都必须说明技术职责、关系意义和治理风险。",
  "engineering-diagram-class-structural": "Class / Structural Diagram 解释模块内结构协作切片，不是全量类图。必须解释对象角色、结构关系、设计含义和下钻意图。",
  "engineering-diagram-sequence": "Sequence Diagram 解释技术协作片段和消息意义。必须区分静态 import、调用、引用、异步、回调、失败或补偿证据。",
  "engineering-diagram-deployment": "Deployment Diagram 解释运行、构建、打包、CI 和环境节点。必须说明配置节点、运行节点和交付风险。",
  "engineering-diagram-hotspot": "Technical Hotspot Diagram 解释复杂度集中点，不等于已确认缺陷。必须说明热点成因、影响面、证据和治理优先级。",
  "engineering-diagram-discussion": "你是 Praxis Studio 的 Engineering Diagram Discussion Agent。只从技术复杂度角度解释当前工程 UML 文档、选中锚点、下钻路径或治理建议；输出严格 JSON。",
  "architecture-discovery-c4": "你是 Praxis Studio 的 Architecture Discovery C4 Agent。根据真实仓库事实、本地仓库证据和 Code-First Discovery Spine 生成 C4 System Context、Container、Component、Code 文档。C4 必须是 System Context -> Container -> Component View -> Code View 的树型下钻结构。",
  "architecture-c4-system-context": "C4 System Context 解释系统与人、外部系统、仓库、项目记忆和模型/worker 边界之间的关系。它不得展开内部模块。",
  "architecture-c4-container": "C4 Container 解释可独立理解的应用、服务、运行边界或职责边界。必须说明为什么这个边界达到 Container 层，而不是普通目录。",
  "architecture-c4-component": "C4 Component 解释 Container 内部的关键架构组件、入口、接口、适配器或共享对象。它不是全量类图。",
  "architecture-c4-code": "C4 Code View 只在必须追溯架构组件到具体代码锚点时使用。它不是代码浏览器，也不能替代 Engineering Explorer。",
  "architecture-c4-discussion": "你是 Praxis Studio 的 Architecture Diagram Discussion Agent。只从 C4 架构抽象层级解释当前文档、选中锚点、边界和下钻路径；输出严格 JSON。",
  "graph-node-explain": "You are Praxis Studio's Graph Chat Agent. Explain only the selected node and one-hop context. Do not modify files. Output concise JSON.",
  "graph-edge-explain": "You are Praxis Studio's Graph Chat Agent. Explain only the selected edge and one-hop context. Do not modify files. Output concise JSON.",
  "graph-node-plan": "You are Praxis Studio's Graph Planning Agent. Plan actions for the selected node. Do not apply changes. Output JSON only.",
  "graph-edge-plan": "You are Praxis Studio's Graph Planning Agent. Identify missing glue points for the selected edge and generate actions and coding task drafts. Output JSON only.",
  "coding-task-generate": "You are Praxis Studio's Coding Task Agent. Generate a controlled CodingAgentTask for an external coding agent. Output JSON only.",
  "memory-summarize": "You are Praxis Studio's Memory Agent. Summarize changes as candidate memory unless user confirmed. Output JSON only.",
  "review-finding-discussion": "你是 Praxis Studio 的 Review Finding Discussion Agent。只围绕当前选中的评审问题解释、追问、转入 docs-backed 项目变更计划，或在证据充分时由 agent 判定误报并写回 docs/review；不要让用户手工关闭问题；输出严格 JSON。",
  "review-quality-base": "You are a Praxis Studio engineering quality review agent. Inspect the repository with read-only tools and return a transient structured review payload. Praxis renders that payload into docs/review Markdown/HTML documents; those documents are the durable review authority. Do not treat any architecture style as a universal default rule.",
  "review-architecture-boundaries": "检查源码目录、架构模型、模块候选和架构 finding 是否能解释真实模块边界、所有权和演进方向；不得默认套用六边形、Clean Architecture、DDD 分层或显性架构；只输出可证据化的候选问题。",
  "review-dependencies-coupling": "检查 import/code fact、架构依赖、循环、未映射依赖和隐性耦合；区分扫描事实、真实工程风险和外部架构范式建议；不要把投影/读模型写入默认判定为领域边界违规。",
  "review-build-release": "检查构建入口、发布产物、构建输出污染、桌面打包和可验证发布路径；输出会影响构建可信度的候选问题。",
  "review-testing-verification": "检查真实测试项目、单元/集成/UI 验证、覆盖率证据和受控编码任务验收证据；没有 100% 覆盖率证据、只有单元测试、测试入口缺失或测试无法覆盖发布形态都必须输出候选问题。",
  "review-security-secrets": "检查密钥、凭据、pem/pfx/key/cert 文件、敏感配置、构建产物中的私钥、评审上下文泄露和外部执行输入风险；只输出有路径或事实证据的问题。",
  "review-configuration-environment": "检查环境变量、配置文件、开发/生产差异、平台配置和运行前置条件是否有清晰所有权。",
  "review-code-quality-maintainability": "检查源码规模、生成源码混入、超大文件、缺少符号级复杂度证据、重复事实和会让后续维护变脆弱的结构；输出具体维护问题，而不是抽象分数。",
  "review-api-contracts-data-flow": "检查 runtime、桌面端、schema、HTTP 客户端、服务接口、DTO/Request/Response、MCP/tool/worker 之间的契约是否可追踪；缺少契约测试、消费者证据或版本边界都必须输出候选问题。",
  "review-performance-resources": "检查扫描范围、构建产物、二进制/超大文件、上下文膨胀、热更新/文件监听和资源密集路径是否会拖慢 intake、agent 或桌面体验。",
  "review-documentation-knowledge": "检查 README、AGENTS、docs、Git 可追溯文档、.distinction 迁移镜像、投影视图和 trace 是否足以支撑团队理解与后续 agent 工作。"
};

export const promptTemplates: Record<PromptName, PromptTemplate> = Object.fromEntries(
  Object.entries(fallbackPromptBodies).map(([name, body]) => [name, { name, body }])
) as Record<PromptName, PromptTemplate>;

export function getPrompt(name: PromptName, options: PromptLookupOptions = {}): PromptTemplate {
  const loaded = loadPromptBody(name, options.overrideDirs);
  const body = loaded?.body ?? promptTemplates[name].body;
  return { name, body: composePromptBody(name, body, options.overrideDirs), sourcePath: loaded?.sourcePath };
}

export function reviewPromptNameForCategory(category: ReviewPromptCategory): PromptName {
  return reviewPromptNames[category];
}

function loadPromptBody(name: PromptName, overrideDirs: string[] = []): { body: string; sourcePath: string } | undefined {
  const fileName = promptFileNames[name];
  const dirs = [
    ...overrideDirs,
    ...defaultPromptDirs()
  ].filter((dir) => dir.trim().length > 0);

  for (const dir of dirs) {
    const filePath = path.resolve(dir, fileName);
    if (!existsSync(filePath)) continue;
    const body = readFileSync(filePath, "utf8").trim();
    if (body) return { body, sourcePath: filePath };
  }
  return undefined;
}

function composePromptBody(name: PromptName, body: string, overrideDirs: string[] = []): string {
  const sharedSpineRule = sharedCodeUnderstandingSpinePrompt(overrideDirs);
  const sharedModelRule = sharedUmlModelPrompt(overrideDirs);
  const drilldownPromptNames: PromptName[] = [
    "design-drilldown-activity",
    "design-drilldown-sequence",
    "design-drilldown-state-machine",
    "design-drilldown-class-collaboration"
  ];
  if (name === "engineering-discovery-diagrams") {
    const engineeringPromptNames: PromptName[] = [
      "engineering-diagram-package",
      "engineering-diagram-component",
      "engineering-diagram-class-structural",
      "engineering-diagram-sequence",
      "engineering-diagram-deployment",
      "engineering-diagram-hotspot"
    ];
    const sections = engineeringPromptNames.map((promptName) => {
      const loaded = loadPromptBody(promptName, overrideDirs);
      const sectionBody = loaded?.body ?? fallbackPromptBodies[promptName];
      return [`## 引用规则：${promptName}`, "", sectionBody].join("\n");
    });
    return [
      sharedModelRule,
      "",
      sharedSpineRule,
      "",
      body,
      "",
      "## Engineering UML 独立质量规则",
      "",
      "以下规则是 prompt-registry 中独立维护的 Engineering UML 质量规则。生成 `docs/engineering` 下任何 diagram markdown/html 时必须同时遵守这些规则。",
      "",
      ...sections
    ].join("\n");
  }
  if (name === "architecture-discovery-c4") {
    const architecturePromptNames: PromptName[] = [
      "architecture-c4-system-context",
      "architecture-c4-container",
      "architecture-c4-component",
      "architecture-c4-code"
    ];
    const sections = architecturePromptNames.map((promptName) => {
      const loaded = loadPromptBody(promptName, overrideDirs);
      const sectionBody = loaded?.body ?? fallbackPromptBodies[promptName];
      return [`## 引用规则：${promptName}`, "", sectionBody].join("\n");
    });
    return [
      sharedModelRule,
      "",
      sharedSpineRule,
      "",
      body,
      "",
      "## C4 独立质量规则",
      "",
      "以下规则是 prompt-registry 中独立维护的 C4 质量规则。生成 `docs/architecture/c4` 下任何 markdown/html 时必须同时遵守这些规则。",
      "",
      ...sections
    ].join("\n");
  }
  if (name !== "design-discovery-use-cases" && name !== "design-story-intake") return body;
  const sections = drilldownPromptNames.map((promptName) => {
    const loaded = loadPromptBody(promptName, overrideDirs);
    const sectionBody = loaded?.body ?? fallbackPromptBodies[promptName];
    return [`## 引用规则：${promptName}`, "", sectionBody].join("\n");
  });
  return [
    sharedModelRule,
    "",
    sharedSpineRule,
    "",
    body,
    "",
    "## 第一层 UML 下钻独立质量规则",
    "",
    "以下规则是 prompt-registry 中独立维护的下钻 UML 质量规则。生成 `useCaseDrilldowns` 或 `drilldownDiagrams` 时必须同时遵守这些规则。",
    "",
    ...sections
  ].join("\n");
}

function sharedUmlModelPrompt(overrideDirs: string[] = []): string {
  const promptNames: PromptName[] = [
    "uml-model-discovery",
    "uml-model-organization-process",
    "uml-model-software-structure",
    "uml-model-deployment-artifact",
    "uml-model-traceability"
  ];
  const sections = promptNames.map((promptName) => {
    const loaded = loadPromptBody(promptName, overrideDirs);
    return [`## UML Model 规则：${promptName}`, "", loaded?.body ?? fallbackPromptBodies[promptName]].join("\n");
  });
  return [
    "## 共享 UML Model 组织规则",
    "",
    ...sections
  ].join("\n");
}

function sharedCodeUnderstandingSpinePrompt(overrideDirs: string[] = []): string {
  const loaded = loadPromptBody("code-understanding-spine", overrideDirs);
  return [
    "## 共享 Code-First Discovery Spine 规则",
    "",
    loaded?.body ?? fallbackPromptBodies["code-understanding-spine"]
  ].join("\n");
}

function defaultPromptDirs(): string[] {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(distDir, "..");
  return [path.join(packageRoot, "prompts")];
}
