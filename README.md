# Praxis Studio

Praxis Studio 是一个 **文档驱动的 AI 原生产品开发 IDE**。

它的核心不是代码编辑器，不是静态 UML 工具，也不是把 Claude Code、Codex 或其他 coding agent 包一层壳。Praxis Studio 想解决的是更靠前、更难的一段开发过程：

```text
先把设计说清楚，并把它落成可维护的项目文档；
再根据设计文档分析它与当前代码之间的差异；
再把差异编排成有版本、有依赖、有验收标准的开发计划；
最后让 agent 按计划燃尽任务，并把进度、变更和新结论回写到文档与 Git 时间线。
```

换句话说，Praxis Studio 的主循环是：

```text
设计文档
  ↓
设计与代码差异分析
  ↓
项目变更项与开发计划
  ↓
Agent 执行计划
  ↓
代码、文档、版本与变更记录同步更新
  ↺
新的项目记忆
```

记忆、版本控制、评审队列、多 agent 协作、UML/C4、甘特图、trace、上下文锚点，都是围绕这条主循环生长出来的能力。它们不是平行的卖点，也不应该反过来支配产品。

当前快速启动见 [docs/START.md](docs/START.md)。

---

## 为什么要这样做

普通 AI coding workflow 很容易跳过设计，直接从一句需求进入代码修改。短期看很快，长期会出现三个问题：

- 需求意图没有稳定的落点，后续对话会漂移。
- 代码变了，但为什么这么变、哪些设计也被影响，很难追溯。
- Git diff 对多数人都不直观，它说明文件怎么变了，却不能自然说明产品和设计为什么变。

Praxis Studio 的判断是：

> 对一个真实工程来说，最重要的不是“AI 能不能写代码”，而是“人和 AI 能不能共同维护一个可解释、可演进、可验证的项目”。

所以 Praxis 不鼓励从聊天直接改代码。它要求先形成设计文档，再由文档导出开发计划，再由计划约束 agent 的执行。代码只是最终产物之一，文档和 Git 时间线共同解释这次变化为什么成立。

---

## 项目记忆是什么

Praxis Studio 中的 Project Memory 不是一个隐藏数据库，也不是某个 UI 状态。

Project Memory 的目标形态是：

```text
项目 docs 中的规范化文档集合
        +
Git 记录下来的版本时间线
```

如果一个事实、设计、决策、需求、风险、计划或变更理由足以解释这个项目，它最终都应该有一个文档归宿，并被 Git 记录。UI 可以渲染图、列表、时间线和看板，但这些只是文档的投影。

`.distinction` 在 v0.1 中仍然存在，但它的定位已经收窄：

```text
.distinction = runtime cache + trace + index + task handoff + migration compatibility
```

它不是终局的项目记忆权威。新的设计界面必须来自格式化、规范化、可维护的项目文档，而不是只来自 `.distinction` 缓存。

---

## 核心工作流

### 1. 完成设计：先把世界切清楚

Praxis 的第一步不是让 agent 猜代码怎么写，而是让用户与 agent 把故事、对象、边界、结构、行为和部署关系说明白。

这些设计不会只停留在聊天记录里。它们会被写入项目文档，例如：

```text
docs/models/
docs/design/
docs/engineering/
docs/architecture/
docs/project/
docs/review/
```

Markdown 负责干净、可读、适合 Git diff 和 LLM 理解。Semantic HTML 负责富展示、可交互锚点、解释图层、证据和代码片段预览。HTML 不是自由画布，也不是用户拖拽出来的图；它由 agent 根据文档和受控 DOM patch 维护。

### 2. 分析差异：设计与代码必须对账

设计文档不是装饰。它会被用来追问：

- 当前代码是否实现了这个设计？
- 哪些设计在代码中缺失？
- 哪些代码行为没有对应设计说明？
- 哪些文档与代码事实冲突？
- 哪些 UML、C4、计划或评审文档需要联动更新？

已有项目会先从真实仓库扫描和文档中恢复候选模型。Agent 的输出默认只是 `CANDIDATE` 或 `INFERENCE`，不能直接冒充产品真相。用户确认后，才会成为稳定项目记忆。

### 3. 编排开发计划：版本、任务和验收一起决定

当设计变化成立后，Praxis 会把它转成项目变更项和开发计划。

计划不是普通 todo list。它必须说明：

- 这次变化属于哪个语义版本变更：`major`、`minor` 还是 `patch`。
- 哪些设计文档、工程文档、架构文档和评审问题被影响。
- 需要修改哪些代码区域、测试、文档和验收点。
- 哪些任务可以并行，哪些任务必须串行。
- 预期 changelog 应该是什么。

版本控制在这里不是附属步骤。Praxis 的目标是让每个原子化变更都能对应清晰的 SemVer 决策和 Git 变化。人可以裁决语义，但 agent 负责根据规则提出版本判断和 changelog 草案。

### 4. Agent 燃尽计划：不能绕过计划施工

Agent 的职责不是随意改文件，而是按计划工作。

进入执行阶段后，agent 应该读取 `docs/project/project-change-plan.md`，沿着计划中的任务、验收标准、风险和关联文档推进。每完成一段工作，都要把进度、状态、证据和下一步风险回写到计划文档，让计划 / 甘特图页面能实时展示变化。

未来多 agent 并行也是从这里自然生长出来的：不是“开很多 agent 乱跑”，而是把一个已确认的开发计划拆成多个有边界、有依赖、有验收标准的工作包，再交给不同 worker 并行燃尽。

---

## 主要工作区

### Project Overview

打开项目后的概要面板。它不再展示一次扫描过程本身，而是从 README、changelog、`docs/project/project-overview.md` 和 `docs/project/project-timeline.md` 这类文档中展示项目当前状态。

如果概要文档缺失，Praxis 会让 agent 生成规范化文档。生成后，页面只读取文档。

### Model Explorer

模型入口。它按 UML 2.x 更稳妥的组织方式理解项目：

```text
Model
  → Package
    → Classifier
      → Feature / internal structure / owned Behavior
```

业务与技术不由图种决定，而由 Model 的 viewpoint、stakeholder 和 abstraction level 决定。Design、Engineering 和 Architecture 都只是模型的不同观察入口，不能各自发明一套互相冲突的解释体系。

### Design Explorer

偏业务复杂度的入口。它关注组织或过程模型中的故事、Actor、Use Case、Activity、Sequence、State Machine、Class Diagram 等，用来解释业务动作、流程、状态和业务概念。

它适合回答：

```text
这个系统有哪些业务故事？
某个 Use Case 的主成功场景和失败路径是什么？
它如何通过时序、活动和类协作被解释？
```

### Engineering Explorer

偏软件结构和技术复杂度的入口。它关注软件结构模型中的 Package、Component、Interface、Port、Connector、Class、Interaction、Activity、StateMachine 等，用来解释模块、组件、接口、运行协作和技术风险。

它不应该把代码统计词、内部节点 id 或 “fan-in/fan-out” 这类分析器术语暴露给用户。它要解释的是工程结构为什么这样组织，以及这种组织如何影响后续修改。

### Architecture Explorer

架构视角入口，当前主要承载 C4 视图。

C4 在 Praxis 中不是独立记忆权威，而是一种用于架构沟通的结构缩放视图：

```text
Software System
  → Container
    → Component
      → Code
```

C4 的价值是防止架构图把系统、应用、模块、类等抽象层级混在一张图里。它必须说明当前图处在哪一层、上层是什么、下层是什么、每个元素为什么属于这一层。

### Review Queue

评审队列不是“消消乐”页面。它读取 `docs/review` 中的评审文档，展示工程评审项、证据和待解决问题。

当用户决定解决某个问题时，正确路径不是在评审页面直接把问题勾掉，而是把它转化为项目变更项，进入计划 / 甘特图，再由计划约束 agent 修复。

### Plan / Gantt

这是 Praxis 的施工中枢。

左侧展示项目变更项，中间展示 agent 编排出的开发计划和进度，右侧展示当前版本预期 changelog 与计划 agent。它负责把设计变化、评审问题、工程风险和版本决策连接成一条可执行路径。

---

## Agent 的定位

Praxis 中所有页面使用的是同一个 agent 体系，只是当前页面会预设不同讨论范围：

```text
Design scope       → 讨论业务故事、Use Case、活动、时序、状态和业务概念。
Engineering scope  → 讨论软件结构、组件、接口、运行协作和技术复杂度。
Architecture scope → 讨论 C4 层级、架构边界和结构缩放。
Review scope       → 讨论评审问题、证据和应转入计划的治理任务。
Plan scope         → 讨论项目变更项、开发计划、版本、changelog 和执行进度。
Global scope       → Praxis Assistant，全局协作入口。
```

Agent 可以修改文档，但这种修改必须受当前 scope、选中语义锚点、关联文档和工具权限约束。用户在 Design / Engineering / Architecture 中讨论一个 UML 或 C4 元素时，agent 首先要知道当前上下文就是这个元素，同时也要理解相关文档可能需要联动修改。

Praxis Assistant 是同一 agent 的全局入口，不是另一套对话系统。页面内 agent 与 Assistant 应共享会话历史、工具过程展示和 agent 工作日志，只是当前 scope 不同。

---

## 版本与 Git

Praxis 把版本控制放进产品流程，而不是放在流程尾部。

一次设计变化进入开发计划时，agent 应该根据 SemVer 规则判断版本变化：

```text
fix / 内部修复             → patch
向后兼容的新能力           → minor
破坏兼容或改变核心契约     → major
```

实际规则必须参考语义化版本号，而不是只靠这三条例子。目标是让每个版本变化都对应可解释的原子化变更，让 changelog 成为 Git diff 的人类可读解释。

---

## v0.1 边界

v0.1 的重点不是做一个全自动程序员，而是先把 docs-first 的开发闭环跑通：

```text
打开已有项目
→ 生成或读取项目概要
→ 生成 Model / Design / Engineering / Architecture 文档投影
→ 与 agent 围绕文档和图讨论
→ 形成项目变更计划
→ 通过计划页面进入受控开发
→ 回写文档、进度、版本和 changelog
```

```text
创建新项目
→ 先描述故事
→ agent 形成 Use Case / Model 文档
→ 用户围绕文档继续对话
→ 形成项目结构、计划和受控编码任务
```

v0.1 仍然强调受控执行。外部 coding agent 是 worker，不是项目记忆、设计和计划的主人。Praxis 拥有文档、模型、计划、版本、trace 和进度。

---

## 代码结构

```text
apps/studio-desktop
  Tauri + React 桌面壳。

apps/runtime-cli
  桌面端、CLI 和后续 MCP 可复用的 runtime 命令入口。

packages/repository-scanner
packages/project-profiler
packages/code-fact-graph
packages/repository-understanding
  本地仓库事实和理解基础。

packages/prompt-registry
  可外部维护的提示词模板。

packages/agent-runtime
packages/agent-loop
packages/context-builder
packages/model-router
packages/provider-deepseek
  agent 执行、上下文、模型路由和 provider。

packages/tool-registry
packages/mcp-server
  受治理工具和外部协议。

packages/local-knowledge
packages/trace-recorder
  `.distinction` 迁移期状态、trace 和 docs-backed memory 读写。

packages/coding-agent-adapter
  外部 coding agent worker 适配层。
```

---

## 开发命令

```bash
npm install
npm run typecheck
npm run build
```

桌面端开发：

```bash
npm run dev:desktop
```

Windows 桌面打包：

```bash
npm run package:desktop:windows
```

固定产物目录：

```text
artifacts/desktop/windows/praxis-studio.exe
artifacts/desktop/windows/bundle/msi/
artifacts/desktop/windows/bundle/nsis/
```

---

## 一句话

Praxis Studio 要做的不是让 AI 更快地把代码写出来，而是让人和 AI 在真实工程中先共同形成设计文档，再把设计变成计划，把计划变成代码，把代码变化重新沉淀回文档、版本和 Git 时间线。

这条闭环，才是 Praxis Studio 的产品中心。
