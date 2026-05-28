# README.md

# Praxis Studio

**Praxis Studio** 是一个 **记忆优先（memory-first）、模型驱动（model-driven）、图谱投影（graph-projected）、Agent 可治理（agent-governed）** 的 AI 原生产品开发 IDE。

快速启动和当前可用路径见 [START.md](docs/START.md)。

中文定义：

> Praxis Studio 是一个以可靠结构化项目记忆为源、以建模为核心、以图谱投影为界面、以可治理 Agent 为执行层的产品开发环境。

Praxis Studio 不直接从代码仓库画图，也不直接从一个创意生成代码。它先从 **真实代码仓库** 或 **真实产品创意** 中构建可靠的结构化项目记忆，再从这些记忆中生长出模型、规格、图谱视图、计划、任务和受控施工流程。

```text
创意 / 仓库（Idea / Repository）
      ↓
可靠结构化项目记忆（Reliable Structured Project Memory）
      ↓
模型（Models）
      ↓
规格（Specifications）
      ↓
图谱投影（Graph Projections）
      ↓
图谱锚点选择（Graph Anchor Selection）
      ↓
上下文包（ContextPacket）
      ↓
计划 / 任务（Plans / Tasks）
      ↓
可治理 Agent 执行（Governed Agent Execution）
      ↓
运行时事件 / 结果 / 追踪（Runtime Events / Results / Trace）
      ↓
记忆更新（Memory Updates）
      ↺
实时图谱再投影（Live Graph Reprojection）
```

对于已有项目（Existing Project），这条链路中的 `RepositorySnapshot`、`CodeFactGraphSnapshot` 和投影产物（projection artifacts）都是可重建输入或缓存，不是持久项目权威（durable project authority）。

---

## 1. Praxis Studio 解决什么问题

AI 已经让个人开发者可以承担过去由产品经理、架构师、开发者、测试、项目经理和运营者共同承担的工作。但现有工具仍然割裂：

- IDE 以文件和代码为中心。
- 编码 Agent（coding agent）以一次性任务执行为中心。
- 项目管理工具以工单（ticket）为中心。
- 文档工具以页面为中心。
- 架构图工具以静态图为中心。
- Git 记录代码变化，但很难记录产品意图、领域模型和架构原因。
- Chat 记录对话，但不能稳定约束后续实现。

Praxis Studio 要解决的问题是：

> 当一个人借助 AI 同时承担产品、架构、开发、测试、项目管理和运营反馈时，他需要一个怎样的开发环境来维持产品语义、架构边界、任务依赖和执行追踪（trace）的连续性？

Praxis Studio 的回答是：

> 先构建可靠结构化项目记忆，再以建模组织这些记忆，并把记忆和模型投影成架构图、项目计划图、规格、任务和可治理 Agent 的施工上下文。

---

## 2. 核心原则

Praxis Studio 必须遵守以下原则：

```text
1. 记忆优先（Memory is primary）。
2. 图谱是从记忆投影出的视图，不是真相来源（source of truth）。
3. 模型把记忆组织成可施工的世界。
4. 规格是被确认的记忆投影成文档后的形态。
5. 计划和任务从规格、模型和记忆中投影出来。
6. 只有在具备足够记忆、建模和规格之后，才允许进入代码生产。
7. 本地仓库理解产生 FACT 记忆。
8. Agent 推理产生 CANDIDATE 或 INFERENCE 记忆。
9. 用户确认产生 CONFIRMED 记忆。
10. 先解释（Explain），再计划（Plan），最后才允许应用（Apply）。
11. v0.1 不自动修改已有源码。
12. 外部编码 Agent 是施工队；Praxis 拥有记忆、模型、图谱、计划和追踪。
13. 图谱投影是实时视图。Agent 施工过程中，任何被批准的记忆 / 模型 / 任务 / 追踪变更，都必须更新或使相关图谱视图失效。
14. 图谱节点和边是上下文锚点（context anchors）。选择一个图谱元素会生成有边界的 ContextPacket，用于 Agent 讨论、计划和受控施工。
15. Agent 必须从被锚定的 ContextPacket 出发，只有在必要时才扩大作用域。
16. AI 不得直接编辑图谱视图。AI 读取代码并提出 MemoryPatch / ModelPatch / PlanPatch；Praxis 校验 patch 并重新生成 UML / C4 / Gantt 投影。
17. 质量治理是反模式检测、图谱标注、以 finding 为锚点的解决过程和实时再投影的组合。
18. Praxis 提供有主张的治理默认值。用户在意义、风险、优先级和作用域上介入，而不是被迫从零设计架构。
19. 代码事实提供者（code fact providers）先写入可重建缓存；只有被接受的 patch 才能写入持久记忆。
20. Praxis runtime 必须能被 CLI、Desktop 和 MCP 复用，不能让任何单一入口成为真相来源。
```

---

## 3. 为什么不是图谱优先（Graph-first）

早期的开发图谱（Development Graph）很容易退化为：

```text
项目（Project）→ 模块（Module）→ 文件（File）→ 警告（Warning）→ 任务（Task）
```

这种图既不能像 C4 / UML 一样帮助理解代码结构，也不能像 OmniPlan / 甘特图一样帮助理解项目推进。

Praxis Studio 因此采用 **记忆优先，图谱作为视图（Memory-first, Graph-as-View）**：

```text
仓库 / 创意（Repository / Idea）
      ↓
结构化记忆（Structured Memory）
      ↓
投影规则（Projection Rules）
      ↓
图谱视图（Graph Views）
```

图不是事实本身。图是对可靠结构化记忆的投影。

---

## 4. Agent 施工过程中的实时图谱（Live Graph）

Praxis 的图谱视图不是在项目摄取（intake）时一次性生成的静态图。它们是覆盖结构化记忆、模型、规格、计划、任务和追踪的实时投影。

当 Agent 读取信息、生成计划、请求许可、应用变更、生成任务、导入外部施工结果或记录追踪时，Praxis 会发出运行时事件（runtime events）。这些事件会更新记忆、改变模型 / 计划 / 任务状态，或者把相关投影标记为过期（stale）。随后，工作区会增量刷新受影响的图谱视图。

```text
Agent 施工（Agent Construction）
      ↓
运行时事件（Runtime Events）
      ↓
记忆 / 模型 / 计划 / 任务 / 追踪更新
      ↓
投影失效（Projection Invalidation）
      ↓
实时图谱再投影（Live Graph Reprojection）
      ↓
工作区 UI Patch（Workspace UI Patch）
```

架构视图展示不断变化的理解。
项目计划视图展示任务进度、依赖和阻塞。
追踪视图展示当前施工路径。
记忆视图展示新的候选、确认、冲突和修正。

图谱变化不能隐藏来源。每一次实时视觉变化都必须能追溯到记忆、模型、规格、计划、任务或追踪记录。

---

## 5. 图谱作为上下文锚点（Graph as Context Anchor）

图谱投影不只是视觉输出。它们是进入结构化记忆的语义入口。

当用户选择一个图谱节点、图谱边、甘特任务、需求、架构组件或追踪节点时，Praxis 会把被选元素解析回源记忆、模型、规格、任务、追踪和源码路径。然后 Praxis 会为 Agent 讨论、计划和受控施工构建一个有边界的 `ContextPacket`。

```text
用户选择图谱锚点（graph anchor）
      ↓
ContextPacket
      ↓
有作用域的 Agent 讨论 / 计划 / 施工
      ↓
运行时事件（Runtime Events）
      ↓
记忆更新（Memory Updates）
      ↓
实时图谱再投影（Live Graph Reprojection）
```

Agent 必须优先使用被锚定的 `ContextPacket`。除非锚定上下文不足，否则它不应该搜索更大的仓库范围。如果它扩大作用域，就必须解释原因并记录这次扩展。

例如，选择一个甘特任务时，系统应该识别它关联的需求、规格、架构节点、源码路径、验收标准、阻塞和禁止路径。这样 Agent 得到的是预先限定好作用域的工作包，而不是被迫重新搜索整个仓库来发现项目。

---

## 6. AI 读码到 UML / Gantt 投影

Praxis 不要求 AI 绘制权威图。

当 AI 读取代码时，它必须产生结构化 patch：

```text
AI 读取代码
      ↓
RepositoryUnderstandingPatch
      ↓
MemoryPatch / ArchitectureModelPatch / UmlModelPatch / PlanModelPatch
      ↓
Patch 校验（Patch Validation）
      ↓
记忆 / 模型更新（Memory / Model Update）
      ↓
投影引擎（Projection Engine）
      ↓
UML / C4 / 依赖 / Gantt 视图
```

UML 图是从 `UmlModel` 投影出来的。
架构图是从 `ArchitectureModel` 投影出来的。
甘特图是从 `PlanModel` 投影出来的。

AI 可以提出 INFERENCE 或 CANDIDATE 知识。静态分析可以产生 FACT 知识。只有用户确认可以产生 CONFIRMED 知识。

视图始终是派生缓存：

```text
.distinction/views/**/*.json
.distinction/views/**/*.mmd
```

它们必须从记忆和模型重新生成，不能由 AI 直接编辑。

---

## 7. 反模式质量治理（Anti-pattern Quality Management）

Praxis 的质量治理不只是 lint、测试、覆盖率或静态分析报告。

Praxis 会从结构化记忆、模型、UML、架构图、甘特视图、追踪图、源码事实和计划状态中检测反模式。发现项（findings）会作为结构化记忆写入，被投影到图谱视图中作为标注，并作为有上下文边界的聊天锚点打开。

```text
记忆 / 模型 / 规格 / 图谱 / 追踪 / 计划
      ↓
反模式检测（Anti-pattern Detection）
      ↓
AntiPatternFinding 记忆
      ↓
图谱标注（Graph Annotation）
      ↓
以 finding 为锚点的聊天（Finding-anchored Chat）
      ↓
计划 / 任务 / 应用（Plan / Task / Apply）
      ↓
运行时事件（Runtime Events）
      ↓
记忆 / 模型 / 计划更新
      ↓
检测器重跑（Detector Rerun）
      ↓
实时图谱再投影（Live Graph Reprojection）
```

质量包括产品清晰度、领域建模正确性、规格完整性、架构边界健康度、代码结构、任务依赖健康度、Agent 施工纪律、记忆一致性和投影一致性。

用户应该能够点击架构边、UML 类、甘特任务、追踪节点或记忆节点上的警告，进入一个有作用域的聊天：它会解释反模式、展示证据、提出计划，并生成受控改进任务。

---

## 8. 有主张的治理剧本（Opinionated Governance Playbooks）

Praxis 不能止步于报告反模式。

大多数用户不应该被迫从空白页面开始做原始的架构、建模或概念区分决策。Praxis 提供专业、有主张且可解释的治理默认值。

```text
反模式检测（Anti-pattern Detection）
      ↓
治理剧本选择（Governance Playbook Selection）
      ↓
推荐修复路径（Recommended Remediation）
      ↓
用户介入点（User Intervention Points）
      ↓
受控计划 / 任务（Controlled Plan / Task）
      ↓
Agent 施工（Agent Construction）
      ↓
验证 / 检测器重跑（Verification / Detector Rerun）
      ↓
记忆 / 模型 / 图谱更新
```

Praxis 的推荐必须能通过架构品味原则（architecture taste principles）、区分决策规则（distinction decision rules）、证据和治理剧本步骤来解释。

用户通常只需要确认语义、命名、优先级、风险接受、修复强度和作用域扩展。用户不应该被迫从零发明架构边界、任务拆分或修复策略。

每次修复都应该产生一条推荐路径。可以展示替代方案，但当其中一条路径在专业上更可取时，不能把所有方案呈现为完全等价。

v0.1 默认采用保守治理：记录记忆、澄清模型 / 规格、生成计划动作和受控任务，但不自动修改已有源码。

Prompt 模板只是流程执行器。它们必须调用同一套品味原则、区分规则和治理剧本，而不是把产品逻辑散落在 UI 组件里。

---

## 9. 两条主入口

Praxis Studio v0.1 支持两条入口：

### 9.1 打开已有项目（Open Existing Project）

从真实代码仓库出发：

```text
打开已有项目（Open Existing Project）
→ 扫描仓库（Scan repository）
→ 构建 RepositorySnapshot
→ 构建 CodeFactGraphSnapshot
→ 构建 RepositoryUnderstandingPatch
→ 接受仓库 FACT 记忆
→ 推断结构记忆
→ 构建架构模型候选
→ 检测 findings
→ 构建图谱投影
→ 用户 review / confirm
→ 写入 .distinction
→ 进入工作区
```

这条路径用于理解已有项目。

它必须回答：

```text
这个项目由哪些系统 / 容器 / 组件组成？
模块职责是什么？
依赖关系是什么？
哪些关系是事实？哪些是推断？
哪些架构风险需要确认？
哪些后续任务依赖这些架构理解？
```

### 9.2 创建新项目（Create New Project）

从产品创意出发：

```text
创建新项目（Create New Project）
→ 捕获创意记忆（Capture idea memory）
→ 澄清产品意图（Clarify product intent）
→ 构建产品模型（Product Model）
→ 构建领域模型（Domain Model）
→ 构建交互模型（Interaction Model）
→ 构建状态模型（State Model）
→ 构建架构模型（Architecture Model）
→ 生成规格（Specifications）
→ 投影图谱视图（Graph Views）
→ 生成项目计划（Project Plan）
→ 创建工程骨架（Skeleton）
→ 生成受控编码任务（Controlled Coding Tasks）
```

这条路径用于从创意生长出项目。

它必须遵守：

```text
不要从一句创意直接生成代码。
先构建记忆，再建模，再生成规格，再生成图和计划，最后才创建工程骨架和任务。
```

---

## 10. 记忆：Praxis 的第一性对象

Praxis 的核心不是图谱（Graph），而是 **可靠结构化项目记忆（Reliable Structured Project Memory）**。

每条记忆必须有：

```text
id
kind: FACT | INFERENCE | CANDIDATE | CONFIRMED
type
subject
predicate
object / value
summary
evidence[]
source
confidence
status
createdAt
updatedAt
```

### 10.1 知识类别（Knowledge Kind）

```text
FACT
  来自本地扫描、静态分析、真实文件、真实 manifest、真实 import/export。

INFERENCE
  来自规则、启发式分析、静态结构推断。

CANDIDATE
  来自 Agent 的解释、计划、建模候选、规格候选。

CONFIRMED
  来自用户确认、显式接受、修正后的稳定约束。
```

### 10.2 记忆来源（Memory Source）

```text
repository_scan
static_analysis
agent_inference
user_confirmation
external_agent_result
runtime_trace
manual_edit
```

---

## 11. 建模：从记忆到可施工世界

建模不是实现后的文档整理。建模是从意图走向规格、架构、图谱、任务和代码的桥梁。

Praxis v0.1 至少需要以下模型：

```text
产品模型（Product Model）
  产品目标、用户、场景、价值主张。

领域模型（Domain Model）
  核心概念、术语区分、实体、规则、生命周期。

交互模型（Interaction Model）
  用户流程、用例、操作路径、确认点。

状态模型（State Model）
  对象状态、状态转换、非法转换、触发事件。

架构模型（Architecture Model）
  系统边界、模块职责、依赖方向、外部系统。

计划模型（Plan Model）
  里程碑、任务、依赖、阻塞、交付物、进度。
```

其中 **领域模型（Domain Model）** 是核心。它负责把模糊创意或混乱代码中的概念区分清楚。

典型区分包括：

```text
MemoryRecord ≠ GraphNode
GraphView ≠ Source of Truth
Model ≠ Specification
Specification ≠ Plan
Plan ≠ Apply
Task ≠ Execution
Candidate ≠ Confirmed
Architecture Graph ≠ Project Plan Graph
```

这些区分一旦被用户确认，就必须成为后续 Agent 的硬约束。

---

## 12. 图谱：从记忆投影出来的视图

Praxis 不使用一张万能开发图谱（Development Graph）。Praxis 使用一组从结构化记忆和模型投影出的图谱视图。

```text
结构化记忆 + 模型 + 投影规则
      ↓
图谱视图（Graph Views）
```

### 12.1 架构视图（Architecture Views）

用于理解代码结构和架构边界：

```text
C4 上下文视图（C4 Context View）
C4 容器视图（C4 Container View）
组件视图（Component View）
依赖视图（Dependency View）
符号 / 类 UML 视图（Symbol / UML-like View）
```

### 12.2 项目计划视图（Project Plan Views）

用于理解项目推进、前后依赖和进度：

```text
任务依赖图（Task Dependency Graph）
时间线 / 甘特图（Timeline / Gantt View）
里程碑视图（Milestone View）
进度视图（Progress View）
阻塞视图（Blocker View）
```

### 12.3 记忆视图（Memory Views）

用于理解决策、规则和历史：

```text
决策地图（Decision Map）
不要重复地图（Do-Not-Repeat Map）
事故地图（Incident Map）
概念区分地图（Concept Distinction Map）
```

### 12.4 追踪视图（Trace Views）

用于理解 Agent 做过什么：

```text
Agent 运行时间线（Agent Run Timeline）
工具调用图（Tool Call Graph）
权限流（Permission Flow）
模型调用追踪（Model Call Trace）
```

---

## 13. `.distinction` 项目记忆目录

`.distinction` 是 Praxis 的项目级第二大脑。它借鉴 OpenWolf 的 `.wolf/` 思想，但更强调结构化、可靠性、建模、投影状态（projection status）和提供者 / 缓存边界（provider/cache boundary）。

建议 v0.1 目录结构：

```text
.distinction/
├─ project.json
│
├─ cache/
│  ├─ repository-snapshot.json
│  ├─ code-fact-graph.json
│  ├─ project-profile.json
│  ├─ repository-understanding-patch.json
│  ├─ architecture-model-patch.json
│  ├─ architecture-findings.json
│  └─ projection-manifest.json
│
├─ memory/
│  ├─ facts.jsonl
│  ├─ inferences.jsonl
│  ├─ candidates.jsonl
│  ├─ confirmations.jsonl
│  ├─ decisions.jsonl
│  ├─ findings.jsonl
│  ├─ incidents.jsonl
│  ├─ traces.jsonl
│  └─ do-not-repeat.jsonl
│
├─ models/
│  ├─ product-model.json
│  ├─ domain-model.json
│  ├─ interaction-model.json
│  ├─ state-model.json
│  ├─ architecture-model.json
│  ├─ uml-model.json
│  └─ plan-model.json
│
├─ specs/
│  ├─ product-intent.md
│  ├─ domain-model.md
│  ├─ architecture-model.md
│  ├─ memory-model.md
│  └─ v0.1-scope.md
│
├─ views/
│  ├─ architecture/
│  │  ├─ c4-context.json
│  │  ├─ c4-container.json
│  │  ├─ component-view.json
│  │  ├─ dependency-view.json
│  │  └─ class-diagram.mmd
│  │
│  ├─ project-plan/
│  │  ├─ task-graph.json
│  │  ├─ gantt.json
│  │  └─ progress.json
│  │
│  ├─ memory/
│  │  ├─ decision-map.json
│  │  └─ distinction-map.json
│  │
│  └─ trace/
│     └─ agent-run-graph.json
│
├─ tasks/
│  └─ TASK-0001.md
│
├─ reports/
│  ├─ project-intake.md
│  ├─ model-review.md
│  └─ projection-report.md
│
└─ rules/
   ├─ architecture.md
   ├─ modeling.md
   ├─ boundaries.md
   ├─ ai-constraints.md
   └─ playbooks/
      ├─ architecture/
      ├─ domain/
      ├─ specification/
      ├─ planning/
      └─ agent/
```

权威真相（Source of truth）：

```text
project.json
memory/*.jsonl
models/*.json
specs/**/*.md
rules/*.md
rules/playbooks/**/*.md
confirmed project constraints
```

可重建缓存（Rebuildable cache）：

```text
cache/*.json
provider-local scratch，例如 .codegraph/
```

派生 / 投影缓存（Derived / projection cache）：

```text
views/**/*.json
views/**/*.mmd
reports/*.md
```

`cache/` 可删除、可重建。`views/` 和 `reports/` 是派生投影缓存（derived projection cache）。只有被接受的记忆、模型、规则和被确认的规格才是 Praxis 权威（Praxis authority）。

---

## 14. Agent 的定位

Praxis 的 Agent 不是直接施工的自动代码生成器。Praxis Agent 负责解释、建模、规格化、投影、计划和受控任务生成。

v0.1 需要以下 Agent：

```text
仓库理解 Agent（Repository Understanding Agent）
  从真实仓库扫描结果生成结构化 FACT / INFERENCE memory。

创意澄清 Agent（Idea Clarifier Agent）
  从用户创意中提取产品目标、用户、场景和约束。

领域建模 Agent（Domain Modeling Agent）
  提取核心概念、概念区分、实体、规则、状态候选。

架构建模 Agent（Architecture Modeling Agent）
  从产品模型和领域模型中生成架构候选。

规格 Agent（Specification Agent）
  从 confirmed memory 和 models 生成规格文档。

投影 Agent（Projection Agent）
  从 memory / models / specs 生成图谱视图。

计划 Agent（Plan Agent）
  从规格、模型和图谱生成任务依赖和施工计划。

治理 Agent（Governance Agent）
  从 finding、ContextPacket 和治理剧本生成有主张的默认修复路径、用户介入点和受控计划。

编码任务 Agent（Coding Task Agent）
  把受控计划转成外部 coding agent 可执行的任务文件。
```

v0.1 不做：

```text
不自动大规模修改已有源码。
不自动运行测试并循环修复。
不自动 git commit。
不完整替代 Claude Code / Codex。
不默认开放 shell 执行权限。
```

---

## 15. 外部编码 Agent 的定位

Claude Code、Codex、Claude Code Best、OpenCode 等都是 Praxis 可以调度的施工队，但不是 Praxis 的地基。

```text
Praxis 拥有：
  记忆（Memory）
  模型（Models）
  规格（Specs）
  图谱投影（Graph Projections）
  计划（Plans）
  任务（Tasks）
  追踪（Trace）
  权限 / 应用控制器（Permission / Apply Controller）

外部编码 Agent 拥有：
  具体代码编辑（concrete code editing）
  测试运行（test running）
  patch 生成（patch generation）
```

v0.1 中，编码任务（Coding Task）只生成受控任务文件，不自动执行外部 Agent。

---

## 16. 技术路线

```text
桌面壳（Desktop Shell）：Tauri
UI：React + TypeScript + Vite
图谱 UI（Graph UI）：React Flow / xyflow
运行时（Runtime）：TypeScript packages + Node sidecar CLI
仓库智能（Repository Intelligence）：repository-scanner + code-fact-graph + repository-understanding
本地记忆（Local Memory）：.distinction/
未来运行时缓存（Future Runtime Cache）：SQLite
默认模型（Default Model）：DeepSeek
多模型路由（Multi Model）：Model Router
外部协议（External Protocol）：MCP Server
外部编码 Agent（External Coding Agent）：先使用 ManualAdapter，后续接入 Codex / Claude Code adapter
```
