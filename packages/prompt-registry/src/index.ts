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
  | "project-create-requirements"
  | "project-create-architecture"
  | "project-create-graph"
  | "graph-node-explain"
  | "graph-edge-explain"
  | "graph-node-plan"
  | "graph-edge-plan"
  | "coding-task-generate"
  | "memory-summarize"
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
  "project-create-requirements": "project-create-requirements.md",
  "project-create-architecture": "project-create-architecture.md",
  "project-create-graph": "project-create-graph.md",
  "graph-node-explain": "graph-node-explain.md",
  "graph-edge-explain": "graph-edge-explain.md",
  "graph-node-plan": "graph-node-plan.md",
  "graph-edge-plan": "graph-edge-plan.md",
  "coding-task-generate": "coding-task-generate.md",
  "memory-summarize": "memory-summarize.md",
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
  "project-create-requirements": "You are Praxis Studio's Requirement Agent. Generate requirements, assumptions, non-goals, and questions. Output JSON only.",
  "project-create-architecture": "You are Praxis Studio's Architecture Agent. Generate architecture component candidates and risks. Output JSON only.",
  "project-create-graph": "You are Praxis Studio's Graph Creation Agent. Generate a Development Graph candidate from confirmed product intent. Output JSON only.",
  "graph-node-explain": "You are Praxis Studio's Graph Chat Agent. Explain only the selected node and one-hop context. Do not modify files. Output concise JSON.",
  "graph-edge-explain": "You are Praxis Studio's Graph Chat Agent. Explain only the selected edge and one-hop context. Do not modify files. Output concise JSON.",
  "graph-node-plan": "You are Praxis Studio's Graph Planning Agent. Plan actions for the selected node. Do not apply changes. Output JSON only.",
  "graph-edge-plan": "You are Praxis Studio's Graph Planning Agent. Identify missing glue points for the selected edge and generate actions and coding task drafts. Output JSON only.",
  "coding-task-generate": "You are Praxis Studio's Coding Task Agent. Generate a controlled CodingAgentTask for an external coding agent. Output JSON only.",
  "memory-summarize": "You are Praxis Studio's Memory Agent. Summarize changes as candidate memory unless user confirmed. Output JSON only.",
  "review-quality-base": "You are a Praxis Studio engineering quality review worker. Inspect the repository with read-only tools and return strict JSON findings.",
  "review-architecture-boundaries": "检查源码目录、架构模型、模块候选和架构 finding 是否能解释真实模块边界、所有权和演进方向；只输出可证据化的候选问题。",
  "review-dependencies-coupling": "检查 import/code fact、架构依赖、循环、未映射依赖和隐性耦合；区分扫描事实与候选判断。",
  "review-build-release": "检查构建入口、发布产物、构建输出污染、桌面打包和可验证发布路径；输出会影响构建可信度的候选问题。",
  "review-testing-verification": "检查真实测试项目、单元/集成/UI 验证、覆盖率证据和受控编码任务验收证据；没有 100% 覆盖率证据、只有单元测试、测试入口缺失或测试无法覆盖发布形态都必须输出候选问题。",
  "review-security-secrets": "检查密钥、凭据、pem/pfx/key/cert 文件、敏感配置、构建产物中的私钥、外部 worker 上下文泄露和 agent prompt 输入风险；只输出有路径或事实证据的问题。",
  "review-configuration-environment": "检查环境变量、配置文件、开发/生产差异、平台配置和运行前置条件是否有清晰所有权。",
  "review-code-quality-maintainability": "检查源码规模、生成源码混入、超大文件、缺少符号级复杂度证据、重复事实和会让后续维护变脆弱的结构；输出具体维护问题，而不是抽象分数。",
  "review-api-contracts-data-flow": "检查 runtime、桌面端、schema、HTTP 客户端、服务接口、DTO/Request/Response、MCP/tool/worker 之间的契约是否可追踪；缺少契约测试、消费者证据或版本边界都必须输出候选问题。",
  "review-performance-resources": "检查扫描范围、构建产物、二进制/超大文件、上下文膨胀、热更新/文件监听和资源密集路径是否会拖慢 intake、agent 或桌面体验。",
  "review-documentation-knowledge": "检查 README、AGENTS、.distinction、投影视图、trace 和候选/确认记忆是否足以支撑团队理解与后续 agent 工作。"
};

export const promptTemplates: Record<PromptName, PromptTemplate> = Object.fromEntries(
  Object.entries(fallbackPromptBodies).map(([name, body]) => [name, { name, body }])
) as Record<PromptName, PromptTemplate>;

export function getPrompt(name: PromptName, options: PromptLookupOptions = {}): PromptTemplate {
  const loaded = loadPromptBody(name, options.overrideDirs);
  if (loaded) return { name, body: loaded.body, sourcePath: loaded.sourcePath };
  return promptTemplates[name];
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

function defaultPromptDirs(): string[] {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(distDir, "..");
  return [path.join(packageRoot, "prompts")];
}
