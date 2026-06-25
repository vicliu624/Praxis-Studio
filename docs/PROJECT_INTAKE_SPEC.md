# Project Intake Spec

## 1. 目标

Project Intake 的目标是打开一个真实工程，生成可确认的 Development Graph Candidate。

Project Intake 不是 demo graph 加载器，也不是让 Agent 直接猜项目结构或产品故事。它必须先生成本地扫描事实，再让 Agent 只在事实边界内产生候选解释。

流程：

```text
Open Existing Project
→ Repository Scanner
→ RepositorySnapshot
→ Project Profiler
→ ProjectProfile
→ Design Discovery
→ DesignDiscoveryCandidate
→ docs/design/use-case-diagrams-maps.md candidate document
→ docs/design/use-case-diagrams-maps.html semantic design map
→ Graph Generator
→ DevelopmentGraphCandidate
→ Intake Review
→ User Confirm
→ .distinction
```

事实边界：

```text
RepositoryScanner output = FACT
ProjectProfiler rule output = FACT or evidence-backed CANDIDATE
Agent output = CANDIDATE / INFERENCE
User confirmation = CONFIRMED documented memory
```

已有项目中的业务故事、用例、时序和设计模式必须先作为候选恢复出来。除非用户确认，否则它们不能被展示为真实产品意图。

这里的 CONFIRMED memory 指 docs-backed Project Memory：确认后的长期知识必须进入规范化项目文档，并由 Git 记录时间线。`.distinction` 只可保存迁移期镜像、cache、trace 和 projection runtime state。

Project Intake 必须遵守设计界面文档优先规则：Design Explorer 中展示的 Use Case Diagram List、Sequence、Class Collaboration 和 Pattern 候选，必须先落到格式化、规范化、完备化的项目文档，再从文档投影到 `.distinction/views/**`。`.distinction/cache/**` 只可作为可重建缓存或迁移回退。

设计文档应同时支持干净 Markdown 和富 Semantic HTML。Markdown 适合阅读、Git diff 和 LLM 理解；Semantic HTML 适合 Design Explorer 渲染、选择 DOM anchor、叠加解释/证据/风险/代码映射/时间线图层。Semantic HTML 不能由 UI 画布工具直接编辑，只能由 agent 通过对话产生受控 DOM patch。

---

## 2. RepositorySnapshot

RepositorySnapshot 是扫描事实，不包含 AI 推断。

```ts
interface RepositorySnapshot {
  root: string;
  name: string;
  scannedAt: string;
  files: SourceFileSummary[];
  directories: DirectorySummary[];
  manifests: ProjectManifest[];
  docs: DocumentSummary[];
  git?: GitSummary;
  statistics: RepositoryStatistics;
}
```

### 扫描器必须忽略

```text
.git
node_modules
dist
build
target
.next
.turbo
.cache
.venv
__pycache__
```

### 扫描器必须识别

```text
package.json
tsconfig.json
vite.config.ts
tauri.conf.json
Cargo.toml
CMakeLists.txt
platformio.ini
pyproject.toml
README.md
docs/*
src/*
apps/*
packages/*
```

扫描器不能把文件名、目录名或 import 路径直接提升为架构事实。它只能记录证据，架构解释由 ProjectProfiler 和 Agent 在后续阶段产生。

---

## 3. ProjectProfile

ProjectProfile 是基于事实的项目画像。

```ts
interface ProjectProfile {
  name: string;
  root: string;

  projectKinds: ProjectKind[];
  languages: string[];
  frameworks: string[];
  buildSystems: string[];
  packageManagers: string[];

  entrypoints: string[];
  testFiles: string[];
  testCommands: string[];
  runCommands: string[];
  buildCommands: string[];

  moduleCandidates: ModuleCandidate[];
  entrypointCandidates: EntrypointCandidate[];
  documentationCandidates: DocumentationCandidate[];

  confidence: "low" | "medium" | "high";
  evidence: ProfileEvidence[];
}
```

---

## 4. ModuleCandidate

```ts
interface ModuleCandidate {
  id: string;
  title: string;
  path: string;
  kind:
    | "ui"
    | "application"
    | "domain"
    | "runtime"
    | "infrastructure"
    | "storage"
    | "agent"
    | "model"
    | "tooling"
    | "test"
    | "docs"
    | "unknown";

  confidence: "low" | "medium" | "high";
  evidence: string[];
}
```

---

## 5. Graph Generation

Graph Generator 分两段：

```text
Local Rule Graph
  从扫描事实生成基础图谱。

Agent Refined Graph
  Agent 只生成候选解释、风险、问题和关系优化。
```

本地规则生成：

```text
project contains module
module contains file
module depends_on module
docs records project
test validates module
risk impacts module
```

Agent 增强生成：

```text
module role explanation
candidate edge kind
architecture warning
unresolved question
risk candidate
```

---

## 6. Design Discovery

Design Discovery 从已有代码、文档、路由、测试和项目记忆中恢复候选设计故事。

它输出：

```text
DesignDiscoveryCandidate
InteractionModelCandidate
DesignModelCandidate
Use Case Diagram list
sequence candidates
class collaboration candidates
design pattern candidates
questions
```

Design Discovery 可以读取：

```text
README / docs / ADR / API docs
routes / controllers / CLI commands / UI pages
application services / command handlers
domain services / aggregates / entities / state machines
events / event handlers / projection handlers
repositories / ports / adapters
tests / fixtures / scenario names
package and module boundaries
.distinction memory, models, traces and findings
CodeFactGraphSnapshot nodes and edges
```

Design Discovery 必须区分：

```text
FACT:
  route, symbol, import, call, event, test, file and document evidence

CANDIDATE:
  recovered context, use case, actor, external system, sequence and class collaboration

INFERENCE:
  framework dispatch, callback meaning, business step name and design pattern role

CONFIRMED:
  only after user confirmation
```

不能仅凭表名、DTO 名或单个 Service 类名创建 confirmed use case。

Design Discovery 的持久化目标不是直接写 UI 图，也不是只写 `.distinction` cache。它必须优先生成或更新设计文档，例如：

```text
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
```

Markdown 文档必须包含可解析的列表、稳定章节、证据、状态、置信度和 changelog，供 Design Explorer 重建列表和时间线。
Semantic HTML 文档必须包含稳定 `data-praxis-*` anchor 和受控 managed blocks，供 Design Explorer 渲染富设计地图，并支持用户选择某个 DOM anchor 后让 agent 进行解释或固化注释。

Agent Prompt 必须包含以下规则：

```text
Local scan facts are FACT.
Your interpretation is CANDIDATE or INFERENCE.
Do not mark anything as CONFIRMED.
Generate questions for uncertain module ownership.
Do not invent source files, commands, dependencies, or manifests.
Do not mark recovered stories, use cases, sequences or design patterns as CONFIRMED.
Every use case candidate must include evidence, confidence and open questions when uncertain.
```

---

## 7. Intake Review

用户必须看到：

```text
Project Profile
Module Candidates
Design Discovery Candidates
Use Case Diagram List
Sequence / Class Collaboration / Pattern candidate counts
Graph Preview
Warnings
Questions
Accept Graph
Ask AI Improve
Cancel
```

确认后写入：

```text
.distinction/cache/repository-understanding-patch.json
docs/** confirmed project memory
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
.distinction/memory/facts.jsonl optional legacy mirror
.distinction/models/interaction-model.json optional legacy mirror
.distinction/models/design-model.json optional legacy mirror
.distinction/views/design/use-case-list.json
.distinction/views/architecture/dependency-view.json
.distinction/reports/project-intake.md
.distinction/cache/projection-manifest.json
```

Design Discovery 的候选项必须优先写入 `docs/design/use-case-diagrams-maps.md` 和 `docs/design/use-case-diagrams-maps.html` 作为 Git 可管理的设计文档；`.distinction/cache/design/**` 只作为机器可读缓存，不能替代 docs。候选项不能写入 confirmed memory，除非用户明确确认。用户确认后的修正必须先更新规范化设计文档，再刷新 `.distinction/cache/**` 和 `.distinction/views/**`。如果某个确认结论只存在于 `.distinction/memory/**` 或 `.distinction/models/**`，它仍然是迁移债务，不是终局项目记忆。

Intake Review 中的 Use Case Diagram List 必须支持：

```text
confirm story
rename story
split story
merge stories
reject story
mark as technical workflow
request more evidence
open graph-bound chat
```

---

## 8. 验收

以 praxis-studio 自身为样例：

```text
Open Existing Project: praxis-studio/
```

必须识别：

```text
desktop_app
monorepo
TypeScript
Rust
Tauri
React
Vite
apps/studio-desktop
packages/*
```

并生成候选图谱。

其中模块候选至少包括：

```text
apps/studio-desktop
packages/core
packages/development-graph
packages/agent-runtime
packages/model-router
packages/local-knowledge
packages/context-builder
packages/tool-registry
packages/trace-recorder
```

验收输出必须包含：

```text
module nodes
relationship edges
candidate design stories
Use Case Diagram list
sequence candidates
class collaboration candidates
design pattern candidates
node progress candidates
edge progress candidates
warnings
unresolved questions
risk candidates
```
