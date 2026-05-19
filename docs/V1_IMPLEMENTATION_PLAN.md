# Praxis Studio v0.1 Implementation Plan

## 1. 总体实施顺序

v0.1 按以下顺序施工：

```text
Step 1  重构入口：HomePage
Step 2  runtime-cli
Step 3  repository-scanner
Step 4  project-profiler
Step 5  graph-generator
Step 6  model-router + provider-deepseek
Step 7  agent-runtime + prompt-registry
Step 8  Project Intake Review UI
Step 9  local-knowledge writer
Step 10 Create New Project Wizard
Step 11 Development Graph Workspace
Step 12 Coding Task Agent + ManualAdapter
```

实施原则：

```text
CLI first, UI second.
Schema first, prompt second.
Facts first, AI candidates second.
Plan first, Apply second.
```

---

## 2. Step 1：重构入口

### 目标

启动后不显示 demo graph，而显示 HomePage。

### 文件

```text
apps/studio-desktop/src/pages/HomePage.tsx
apps/studio-desktop/src/App.tsx
apps/studio-desktop/src/routes.ts
```

### UI

```text
Praxis Studio

[ Open Existing Project ]
[ Create New Project ]
[ Recent Projects ]
[ Model Settings ]
```

### 验收

```text
启动桌面端后可以看到 HomePage。
点击 Open Existing Project 进入项目选择流程。
点击 Create New Project 进入新建项目向导。
```

---

## 3. Step 2：runtime-cli

### 目标

把核心能力做成 CLI，供 Tauri、VS Code 插件、后续 MCP Server 复用。

### 目录

```text
apps/runtime-cli/
```

### 命令

```bash
praxis-runtime scan --root <path>
praxis-runtime profile --snapshot <snapshot.json>
praxis-runtime generate-graph --snapshot <snapshot.json> --profile <profile.json>
praxis-runtime init-memory --root <path> --graph <graph.json>
praxis-runtime create-project --plan <plan.json>
praxis-runtime chat --project-root <path> --target <node-or-edge-id> --mode explain
praxis-runtime generate-task --plan <plan.json>
```

### 技术

- Node.js
- TypeScript
- commander 或 cac
- JSON 输入输出
- 所有命令必须可单独测试

### 验收

```text
npm run build 后可以执行 runtime-cli。
scan/profile/generate-graph 三个命令可以串起来运行。
```

---

## 4. Step 3：repository-scanner

### 目标

扫描真实工程，输出 RepositorySnapshot。

### 包

```text
packages/repository-scanner/
```

### 需要实现

```text
walk files
ignore patterns
manifest detection
language detection
role hint
import extraction
repository statistics
```

### 忽略目录

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

### 输出模型

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

### 验收

对 praxis-studio 自身运行：

```bash
praxis-runtime scan --root .
```

必须识别：

```text
package.json
tsconfig.base.json
apps/studio-desktop
packages/*
src-tauri
```

---

## 5. Step 4：project-profiler

### 目标

从 RepositorySnapshot 生成 ProjectProfile。

### 包

```text
packages/project-profiler/
```

### 需要识别

```text
projectKinds
languages
frameworks
buildSystems
packageManagers
entrypoints
testFiles
testCommands
runCommands
buildCommands
moduleCandidates
confidence
evidence
```

### 规则

```text
package.json + workspaces → monorepo
tauri.conf.json → desktop_app / tauri
Cargo.toml → rust
vite.config.ts → vite
apps/* → application module
packages/* → architecture/runtime/domain modules
docs/* → docs module
```

### 验收

对 praxis-studio 识别：

```text
ProjectKind: desktop_app, monorepo
Languages: TypeScript, Rust
Frameworks: Tauri, React, Vite
Modules:
  apps/studio-desktop
  packages/core
  packages/development-graph
  packages/agent-runtime
  packages/model-router
```

---

## 6. Step 5：graph-generator

### 目标

从 ProjectProfile 生成 DevelopmentGraphCandidate。

### 包

```text
packages/graph-generator/
```

### 本地规则

节点：

```text
project node
module nodes
document nodes
test nodes
risk candidate nodes
```

边：

```text
project contains module
module depends_on module
docs records project
test validates module
risk impacts module
```

### Agent 增强

如果配置模型，则调用 `project.intake.analyze`，生成：

```text
assumptions
warnings
questions
candidate edge labels
candidate module role refinement
```

### 验收

对 praxis-studio 生成：

```text
nodes.json candidate
edges.json candidate
warnings
questions
```

---

## 7. Step 6：model-router + provider-deepseek

### 目标

默认 DeepSeek，但架构支持多模型。

### 包

```text
packages/model-router/
packages/provider-deepseek/
```

### 必须实现

```text
MockProvider
DeepSeekProvider
ModelRouter
models.yaml loading
route resolution
JSON response validation
usage logging
```

### 验收

```text
没有 API Key 时使用 MockProvider。
有 DEEPSEEK_API_KEY 时可以调用 DeepSeekProvider。
```

---

## 8. Step 7：agent-runtime + prompt-registry

### 目标

实现 Explain / Plan / limited Apply 的基础运行时。

### 包

```text
packages/agent-runtime/
packages/prompt-registry/
packages/context-builder/
packages/plan-model/
packages/trace-recorder/
```

### Runtime Flow

```text
selected target
→ build context
→ choose mode
→ resolve model
→ load prompt
→ call model
→ parse output
→ validate schema
→ return result
→ record trace
```

### Mode

```text
Explain:
  no mutation

Plan:
  no mutation, outputs plan

Apply:
  only .distinction/docs/tasks/new project files
```

### 验收

```text
选中 node 可以 explain。
选中 edge 可以 explain。
edge explain 可以生成 plan。
所有模型调用写入 trace。
```

---

## 9. Step 8：Project Intake Review UI

### 目标

展示候选图谱，让用户确认。

### 页面

```text
apps/studio-desktop/src/pages/ProjectIntakeReviewPage.tsx
```

### 组件

```text
ProjectProfilePanel
ModuleCandidateTable
GraphCandidatePreview
WarningsPanel
QuestionsPanel
IntakeActions
```

### 操作

```text
Accept Graph
Ask AI Improve
Cancel
```

第一版 `Edit Before Save` 可先不做复杂图编辑，只做字段编辑或预留。

### 验收

```text
打开真实工程后进入 Intake Review。
能看到项目画像、模块候选、warnings、questions。
点击 Accept Graph 写入 .distinction。
```

---

## 10. Step 9：local-knowledge writer

### 目标

把确认后的 graph 和记忆写入项目。

### 包

```text
packages/local-knowledge/
```

### 写入结构

```text
.distinction/
├─ graph/nodes.json
├─ graph/edges.json
├─ graph/progress.json
├─ graph/views.json
├─ memory/changes.md
├─ memory/decisions.md
├─ memory/traces.jsonl
├─ memory/incidents.json
├─ memory/do-not-repeat.md
├─ rules/architecture.md
├─ rules/boundaries.md
├─ rules/ai-constraints.md
├─ tasks/
├─ reports/project-intake.md
└─ models.yaml
```

### 覆盖策略

```text
如果 .distinction 不存在：创建
如果已存在：进入 Merge Review 或备份
第一版可以实现 backup-and-write
```

### 验收

```text
Accept Graph 后真实项目目录出现 .distinction。
重新打开项目可以读取已有 graph。
```

---

## 11. Step 10：Create New Project Wizard

### 目标

从产品构想创建真实工程。

### 页面

```text
CreateProjectWizardPage
```

### 步骤

```text
1. Product Intent
2. Project Type
3. Stack Preference
4. Generated Plan Review
5. Apply
```

### 包

```text
packages/project-wizard/
packages/template-generator/
packages/file-generator/
```

### 输出文件

```text
README.md
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
.distinction/*
```

### 验收

```text
输入产品构想后能生成新工程目录。
新工程能被 Praxis 打开并显示 Development Graph。
```

---

## 12. Step 11：Development Graph Workspace

### 目标

展示图谱，并支持节点/边 Chat。

### 技术

```text
React Flow / xyflow
```

### 区域

```text
Left: Outline
Center: Graph
Right: Inspector + Chat
Bottom: Trace / Memory Timeline
```

### 节点显示

```text
title
kind
status
progress
risk badge
```

### 边显示

```text
kind
progress
risk
blocked indicator
```

### 验收

```text
能显示真实工程图谱。
能选中节点。
能选中边。
右侧 Chat 上下文随选择变化。
```

---

## 13. Step 12：Coding Task Agent + ManualAdapter

### 目标

从 Plan 生成外部 coding agent 可执行任务。

### 包

```text
packages/coding-agent-adapter/
```

### 输出

```text
.distinction/tasks/TASK-0001.md
```

### Adapter

```text
ManualAdapter
ClaudeCodeBestAdapter skeleton
CodexAdapter skeleton
ClaudeCodeAdapter skeleton
```

### 验收

```text
从一个 edge plan 生成 TASK.md。
TASK.md 可以复制给 Claude Code / Codex / CCB。
用户可以手动回填结果并更新节点/边进度。
```

---

## 14. v0.1 完成定义

v0.1 完成时，必须能完成：

```text
Open Existing Project → Graph → Chat → Plan → Task
Create New Project → Requirements → Architecture → Graph → Files
```

这两个闭环跑通，v0.1 才算完成。
