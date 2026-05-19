# Project Intake Spec

## 1. 目标

Project Intake 的目标是打开一个真实工程，生成可确认的 Development Graph Candidate。

Project Intake 不是 demo graph 加载器，也不是让 Agent 直接猜项目结构。它必须先生成本地扫描事实，再让 Agent 只在事实边界内产生候选解释。

流程：

```text
Open Existing Project
→ Repository Scanner
→ RepositorySnapshot
→ Project Profiler
→ ProjectProfile
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
User confirmation = CONFIRMED memory
```

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

Agent Prompt 必须包含以下规则：

```text
Local scan facts are FACT.
Your interpretation is CANDIDATE or INFERENCE.
Do not mark anything as CONFIRMED.
Generate questions for uncertain module ownership.
Do not invent source files, commands, dependencies, or manifests.
```

---

## 6. Intake Review

用户必须看到：

```text
Project Profile
Module Candidates
Graph Preview
Warnings
Questions
Accept Graph
Ask AI Improve
Cancel
```

确认后写入：

```text
.distinction/graph/nodes.json
.distinction/graph/edges.json
.distinction/reports/project-intake.md
.distinction/memory/changes.md
```

---

## 7. 验收

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
node progress candidates
edge progress candidates
warnings
unresolved questions
risk candidates
```
