# Praxis Studio

**Praxis Studio** 是一个以 **开发图谱（Development Graph）** 和 **项目记忆（Project Memory）** 为中心的 **AI-native Product Development IDE**。

它不是传统代码编辑器，也不是普通 coding agent。它的目标是帮助个人开发者从真实产品构想或真实代码工程出发，持续完成：

```text
产品构想
→ 需求拆解
→ 架构映射
→ 模块拆分
→ 胶水关系管理
→ Agent 施工任务
→ 验证反馈
→ 项目记忆沉淀
```

Praxis Studio 的核心不是“让 AI 更快写代码”，而是：

> 让一个人借助 AI 稳定承担产品、架构、开发、测试、项目管理和运营反馈等多种角色，并让这些角色之间的上下文连续、可追踪、可治理。

---

## 1. 为什么要做 Praxis Studio

AI 降低了产品、架构、开发、测试、运营等角色的上手门槛，使得个人开发者可以承担过去由多人分工完成的工作。

但是现有工具仍然是割裂的：

- IDE 以文件和代码为中心。
- Coding agent 以任务执行为中心。
- 项目管理工具以 ticket 为中心。
- 文档工具以页面为中心。
- 架构图工具以静态图为中心。
- Git 记录代码变化，但不记录产品意图和架构原因。
- Chat 记录对话，但不能稳定约束后续实现。

Praxis Studio 试图解决的问题是：

> 当一个人同时扮演产品经理、架构师、开发者、测试、项目经理和运营者时，他需要一个怎样的开发环境来管理整个产品从构想到实现的连续过程？

---

## 2. 产品定位

Praxis Studio 是：

```text
Graph-centered + Agent-runtime-governed AI-native Product Development IDE
```

中文：

```text
以开发图谱为中心、以可治理 Agent 运行时为执行层的 AI 原生产品开发 IDE
```

它由三层组成：

```text
Visual IDE Shell
  用户看见、选择、对话、确认

Development Graph
  表示需求、架构、模块、任务、代码、测试、记忆之间的关系

Governed Agent Runtime
  管理 AI 如何解释、计划、执行、留下痕迹
```

---

## 3. 和传统 IDE 的区别

传统 IDE 的中心是：

```text
文件
代码
符号
构建
调试
```

Praxis Studio 的中心是：

```text
产品意图
需求节点
架构节点
模块关系
胶水进度
Agent 任务
项目记忆
```

传统 IDE 回答：

```text
这个函数在哪里？
这个类谁调用？
这个文件怎么编译？
```

Praxis Studio 回答：

```text
这个模块来自哪个需求？
这个需求为什么存在？
这个架构节点负责什么？
这条边的胶水完成了吗？
改这个节点会影响哪些任务？
AI 施工时应该遵守哪些项目记忆？
这次修改为什么发生？
```

---

## 4. 和 Claude Code / Codex 的区别

Claude Code / Codex 的中心是：

```text
任务执行
代码修改
命令运行
测试修复
```

Praxis Studio 的中心是：

```text
开发过程治理
产品上下文
架构上下文
开发图谱
长期记忆
Agent 调度
```

Claude Code / Codex 是施工队。  
Praxis Studio 是产品开发过程的调度中心。

Praxis Studio 可以把任务交给 Claude Code / Codex / Claude Code Best / OpenCode 等外部 coding agent，但它自己必须拥有：

- Development Graph
- Project Memory
- Context Builder
- Model Router
- Tool Registry
- Trace Recorder
- Plan / Apply Controller

---

## 5. 第一版目标：Praxis Studio v0.1

第一版不是 demo graph，不是静态概念图，也不是完整 coding agent。

第一版目标是：

> **Project Intake + Graph Agent + Controlled Coding Task MVP**

也就是：

```text
1. 打开真实工程，生成 Development Graph Candidate
2. 从产品构想创建新工程，生成需求、架构、图谱、文档和 .distinction
3. 选中节点或边，通过 Agent 解释、计划、生成 coding task
4. 把确认后的结果写入 .distinction 项目记忆
```

---

## 6. 第一版必须支持的两条入口

### 6.1 Open Existing Project

用户选择一个真实本地工程目录：

```text
Open Existing Project
→ 扫描文件和配置
→ 识别技术栈和项目类型
→ 识别模块候选
→ 生成 Project Profile
→ Agent 分析模块职责、候选关系、风险和问题
→ 生成 Development Graph Candidate
→ 用户确认
→ 写入 .distinction/
→ 进入 Development Graph Workspace
```

这里不能依赖内置 demo graph。  
每一张图谱都必须来自真实工程。

### 6.2 Create New Project

用户输入产品构想：

```text
Create New Project
→ 输入产品构想
→ 选择项目类型
→ 选择技术栈
→ Agent 生成需求拆解
→ Agent 生成架构候选
→ Agent 生成 Development Graph
→ 生成 docs 和 .distinction
→ 用户确认
→ 创建工程目录
→ 进入 Development Graph Workspace
```

---

## 7. 第一版必须实现的 Agent

第一版必须有 Agent，但不是完整自动 coding agent。

### 第一版要做

```text
Project Intake Agent
  基于真实工程扫描结果生成项目画像、候选图谱、风险和问题。

Project Creation Agent
  基于产品构想生成需求、架构、图谱、文档和新工程骨架。

Graph Chat Agent
  选中节点或边后，解释它的职责、关系、进度、风险和缺口。

Plan Agent
  把用户指令转成图谱变更计划、任务计划和记忆事件候选。

Coding Task Agent
  把 Plan 转成可交给外部 coding agent 的施工任务。
```

### 第一版不做

```text
不自动大规模修改已有源码
不自动运行测试并循环修复
不自动 git commit
不完整替代 Claude Code / Codex
不把 shell 执行权限默认开放
```

---

## 8. Claude Code Best 的定位

`claude-code-best/claude-code` 可以作为重要参考，但不能成为 Praxis Studio 的产品中心。

### 可以吸收

- Agentic Loop
- Tool Registry
- Context Builder
- Permission / Plan Mode
- Trace
- MCP / ACP 思路
- 多模型 provider 结构
- CLI command organization
- coding agent task 执行经验

### 不应该做

- 不直接 fork 成 Praxis Studio 主工程。
- 不让 Development Graph 成为它的插件。
- 不把逆向/兼容 Claude Code 的逻辑作为 Praxis 主干。
- 不把外部 coding agent 当成产品中心。

### 正确关系

```text
Praxis Studio owns:
  Development Graph
  Project Memory
  Agent Runtime
  Context Builder
  Trace
  Progress
  Plans

External coding agents own:
  concrete code editing
  test running
  patch generation
```

也就是说：

> Claude Code / Codex / Claude Code Best / OpenCode 都是 Praxis 可以调度的施工队，而不是 Praxis 的地基。

---

## 9. 核心原则

第一版必须遵守以下原则：

```text
1. No demo-first workflow.
2. Every graph comes from a real repo or real product intent.
3. Local scan produces FACT.
4. Agent produces CANDIDATE / INFERENCE.
5. User confirmation produces CONFIRMED memory.
6. Chat is bound to selected node / edge / subgraph.
7. Explain before Plan.
8. Plan before Apply.
9. External coding agents are workers; Praxis owns graph, memory and progress.
10. Existing source code is not modified automatically in v0.1.
```

---

## 10. 第一版完成后的界面

### Home

- Open Existing Project
- Create New Project
- Recent Projects
- Model Settings

### Project Intake Review

- Project Profile
- Module Candidates
- Graph Candidate
- Warnings
- Questions
- Ask AI Improve
- Accept Graph

### Development Graph Workspace

- 左侧：Outline / 模块导航
- 中间：Development Graph
- 右侧：Selected Node / Edge Inspector + Context-bound Chat
- 底部：Trace / Memory Timeline

---

## 11. 项目记忆目录 `.distinction`

第一版确认后的项目状态写入：

```text
.distinction/
├─ graph/
│  ├─ nodes.json
│  ├─ edges.json
│  ├─ progress.json
│  └─ views.json
│
├─ memory/
│  ├─ changes.md
│  ├─ decisions.md
│  ├─ traces.jsonl
│  ├─ incidents.json
│  └─ do-not-repeat.md
│
├─ rules/
│  ├─ architecture.md
│  ├─ boundaries.md
│  └─ ai-constraints.md
│
├─ tasks/
│  └─ TASK-0001.md
│
├─ reports/
│  ├─ project-intake.md
│  └─ graph-plan.md
```

DeepSeek API keys and model route overrides are IDE settings stored outside the project, under the Praxis Studio app settings directory. They must not be written into `.distinction`.

---

## 12. 推荐工程结构

```text
praxis-studio/
├─ apps/
│  ├─ studio-desktop/
│  └─ runtime-cli/
│
├─ packages/
│  ├─ core/
│  ├─ development-graph/
│  ├─ graph-store/
│  ├─ local-knowledge/
│  ├─ repository-scanner/
│  ├─ project-profiler/
│  ├─ graph-generator/
│  ├─ project-wizard/
│  ├─ template-generator/
│  ├─ agent-runtime/
│  ├─ tool-registry/
│  ├─ context-builder/
│  ├─ prompt-registry/
│  ├─ plan-model/
│  ├─ file-generator/
│  ├─ model-router/
│  ├─ provider-deepseek/
│  ├─ trace-recorder/
│  ├─ coding-agent-adapter/
│  └─ ui-kit/
│
├─ docs/
└─ .distinction.example/
```

---

## 13. 技术路线

- Desktop Shell: Tauri
- UI: React + TypeScript + Vite
- Graph UI: React Flow / xyflow
- Runtime: TypeScript packages + Node sidecar CLI
- Local Memory: `.distinction/`
- Future Runtime Cache: SQLite
- Default Model: DeepSeek
- Multi Model: Model Router
- External Coding Agent: ManualAdapter first, Codex / Claude Code / Claude Code Best adapters later

---

## 14. 第一版验收标准

### Open Existing Project

以 Praxis Studio 自己作为验收工程：

```text
1. 启动桌面端
2. 点击 Open Existing Project
3. 选择 praxis-studio/
4. 成功扫描 RepositorySnapshot
5. 成功识别 Tauri + React + TypeScript + Rust
6. 成功识别 apps/studio-desktop 和 packages/*
7. 生成 DevelopmentGraphCandidate
8. 展示 warnings/questions
9. Accept Graph
10. 写入 .distinction/
11. 进入 DevelopmentGraphWorkspace
12. 选中节点可 Explain
13. 选中边可 Explain
14. 可生成 Plan
15. 可生成 CodingAgentTask
```

### Create New Project

```text
1. 输入产品构想
2. 选择 Documentation-first 或 Tauri Desktop
3. Agent 生成需求
4. Agent 生成架构
5. Agent 生成 Development Graph
6. 生成 docs
7. 生成 .distinction
8. 进入 DevelopmentGraphWorkspace
```

### Agent Boundary

```text
1. Explain 不修改
2. Plan 不应用
3. Apply 只能修改 .distinction / docs / tasks / 新工程
4. 不自动修改已有源码
5. 所有模型调用有 trace
6. 所有 apply 有 trace
```

---

## 15. 一句话总结

Praxis Studio v0.1 要证明的不是“AI 能写代码”，而是：

> 真实工程或真实构想可以被转化成可对话、可追踪、可治理、可交给 Agent 施工的 Development Graph。
