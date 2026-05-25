# Praxis Studio Product Spec

## 1. Product Position

Praxis Studio 是一个以 **Development Graph** 和 **Project Memory** 为中心的 AI-native Product Development IDE。

它不是代码编辑器、静态图谱工具、Claude Code / Codex 的壳，也不是完整自动 coding agent。它的产品中心是：

```text
真实工程 / 真实产品构想
→ Development Graph
→ Context-bound Agent collaboration
→ Controlled coding task
→ .distinction project memory
```

Praxis Studio 的核心判断是：

```text
UI 是入口
Development Graph 是世界模型
Agent Runtime 是行动系统
.distinction 是长期记忆
External Agent 是代码施工队
```

## 2. v0.1 Name

第一版命名为：

```text
Praxis Studio v0.1: Project Intake + Graph Agent + Controlled Coding Task MVP
```

中文：

```text
项目接入 + 开发图谱 Agent + 受控代码任务 MVP
```

v0.1 要完成三件事：

1. 打开真实工程，生成 `DevelopmentGraphCandidate`。
2. 从产品构想创建新工程，生成需求、架构、图谱、文档和 `.distinction`。
3. 选中节点、边或子图，通过 Agent 解释、计划、生成 coding task，并可交给外部 coding agent。

第一版的 Agent 不是可有可无的增强功能，而是核心闭环的一部分。

## 3. v0.1 Agent Scope

v0.1 必须实现：

```text
Project Intake Agent
Project Creation Agent
Graph Chat Agent
Plan Agent
Coding Task Agent
ManualAdapter
External Coding Agent Adapter skeletons
```

v0.1 明确不做：

```text
完整替代 Claude Code / Codex
自动跨文件修改已有源码
自动运行测试并循环修复
完整 shell sandbox
全自动 git commit / PR
```

## 4. Product Loop

### 4.1 Open Existing Project

```text
Open Existing Project
→ 选择本地仓库
→ 本地扫描生成 RepositorySnapshot
→ 规则识别 ProjectProfile
→ Agent 分析模块职责、风险、候选关系
→ 生成 DevelopmentGraphCandidate
→ 用户确认
→ 写入 .distinction/
→ 进入 Development Graph Workspace
→ 选中节点/边与 Agent 对话
→ 生成 Plan / Coding Task
```

以 Praxis Studio 自身验收时，系统必须识别：

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

并生成模块节点、关系边、节点进度、边进度、待确认问题和风险候选。

### 4.2 Create New Project

```text
Create New Project
→ 输入产品构想
→ 选择项目类型
→ 选择技术栈
→ Agent 生成需求拆解
→ Agent 生成架构候选
→ Agent 生成 Development Graph
→ Agent 生成 docs 和 .distinction
→ 用户确认
→ 创建工程目录
→ 进入 Development Graph Workspace
```

必须能生成：

```text
README.md
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
.distinction/project.json
.distinction/memory/candidates.jsonl
.distinction/memory/decisions.jsonl
.distinction/models/architecture-model.json
.distinction/views/architecture/component-view.json
.distinction/rules/ai-constraints.md
```

### 4.3 Context-bound Graph Collaboration

用户选中节点、边或子图后，Chat 必须绑定当前对象。默认上下文不能扩散到全仓库。

示例：

```text
Architecture Memory --records--> Local Knowledge
```

用户问：

```text
这条 records 关系为什么只有 40%，缺什么？
```

Agent 应围绕这条边及其一跳上下文回答：

```text
缺 Memory Event schema
缺 report → memory event 转换
缺 stale knowledge detection
缺 trace 与 memory 的关联
```

用户确认计划后，Praxis 可以：

```text
更新相关 memory/model records 并触发 graph reprojection
写入 .distinction/memory/candidates.jsonl
写入 .distinction/tasks/TASK-0001.md
```

但 v0.1 不自动修改已有源码。

## 5. Non-negotiable Principles

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

## 6. Product Distinctions

树表达归属，图表达关系。

节点和边都是可选择对象。节点有模块进度，边有胶水进度。很多项目失败不是模块没有写，而是模块之间的集成、约束传递、验证链路和记忆写入没有完成。

Agent 输出默认是 `CANDIDATE` 或 `INFERENCE`。只有用户确认后，内容才可以成为 `CONFIRMED` memory。

External coding agents 是施工队。Praxis 负责图谱、记忆、上下文、计划、权限和进度；外部 agent 负责具体代码修改、测试运行和 patch 生成。

## 7. Definition of Done

v0.1 完成时必须跑通两个闭环：

```text
Open Existing Project → Graph Candidate → Confirm → Workspace → Explain → Plan → Coding Task
```

```text
Create New Project → Requirements → Architecture → Graph → Docs → .distinction → Workspace
```

Praxis Studio v0.1 要证明的不是“AI 能写代码”，而是：

```text
真实工程或真实构想可以被转化成可对话、可追踪、可治理、可交给 Agent 施工的 Development Graph。
```
