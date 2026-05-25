# README.md

# Praxis Studio

**Praxis Studio** 是一个 **memory-first、model-driven、graph-projected、agent-governed** 的 AI 原生产品开发 IDE。

中文定义：

> Praxis Studio 是一个以可靠结构化项目记忆为源、以建模为核心、以图谱投影为界面、以可治理 Agent 为执行层的产品开发环境。

Praxis Studio 不直接从代码仓库画图，也不直接从一个创意生成代码。它先从 **真实代码仓库** 或 **真实产品创意** 中构建可靠的结构化项目记忆，再从这些记忆中生长出模型、规格、图谱视图、计划、任务和受控施工流程。

```text
Idea / Repository
      ↓
Reliable Structured Project Memory
      ↓
Models
      ↓
Specifications
      ↓
Graph Projections
      ↓
Graph Anchor Selection
      ↓
ContextPacket
      ↓
Plans / Tasks
      ↓
Governed Agent Execution
      ↓
Runtime Events / Results / Trace
      ↓
Memory Updates
      ↺
Live Graph Reprojection
```

对于 Existing Project，这条链路中的 `RepositorySnapshot`、`CodeFactGraphSnapshot` 和 projection artifacts 都是可重建输入或缓存，不是 durable project authority。

---

## 1. Praxis Studio 解决什么问题

AI 已经让个人开发者可以承担过去由产品经理、架构师、开发者、测试、项目经理和运营者共同承担的工作。但现有工具仍然割裂：

- IDE 以文件和代码为中心。
- Coding agent 以一次性任务执行为中心。
- 项目管理工具以 ticket 为中心。
- 文档工具以页面为中心。
- 架构图工具以静态图为中心。
- Git 记录代码变化，但很难记录产品意图、领域模型和架构原因。
- Chat 记录对话，但不能稳定约束后续实现。

Praxis Studio 要解决的问题是：

> 当一个人借助 AI 同时承担产品、架构、开发、测试、项目管理和运营反馈时，他需要一个怎样的开发环境来维持产品语义、架构边界、任务依赖和执行 trace 的连续性？

Praxis Studio 的回答是：

> 先构建可靠结构化项目记忆，再以建模组织这些记忆，并把记忆和模型投影成架构图、项目计划图、规格、任务和可治理 Agent 施工上下文。

---

## 2. 核心原则

Praxis Studio 必须遵守以下原则：

```text
1. Memory is primary.
2. Graphs are projections from memory, not source of truth.
3. Models organize memory into a buildable world.
4. Specs are confirmed memory projected into document form.
5. Plans and tasks are projected from specs, models and memory.
6. Code is produced only after sufficient memory, modeling and specification.
7. Local repository understanding produces FACT memory.
8. Agent inference produces CANDIDATE or INFERENCE memory.
9. User confirmation produces CONFIRMED memory.
10. Explain before Plan. Plan before Apply.
11. Existing source code is not modified automatically in v0.1.
12. External coding agents are workers; Praxis owns memory, models, graphs, plans and trace.
13. Graph projections are live views. During agent construction, every approved memory / model / task / trace mutation must update or invalidate the relevant graph views.
14. Graph nodes and edges are context anchors. Selecting a graph element produces a bounded ContextPacket for Agent discussion, planning and controlled construction.
15. Agent must start from the anchored ContextPacket and expand scope only when necessary.
16. AI must not directly edit graph views. AI reads code and proposes MemoryPatch / ModelPatch / PlanPatch; Praxis validates patches and regenerates UML / C4 / Gantt projections.
17. Quality management is anti-pattern detection plus graph annotation plus finding-anchored resolution plus live reprojection.
18. Praxis provides opinionated governance defaults. Users intervene at meaning, risk, priority and scope points; they are not forced to design architecture from scratch.
19. Code fact providers write rebuildable cache first. Durable memory is written only through accepted patches.
20. Praxis runtime must remain reusable through CLI, Desktop and MCP without making any one surface the source of truth.
```

---

## 3. 为什么不是 Graph-first

早期的 Development Graph 很容易退化为：

```text
Project → Module → File → Warning → Task
```

这种图既不能像 C4 / UML 一样帮助理解代码结构，也不能像 OmniPlan / 甘特图一样帮助理解项目推进。

Praxis Studio 因此采用 **Memory-first, Graph-as-View**：

```text
Repository / Idea
      ↓
Structured Memory
      ↓
Projection Rules
      ↓
Graph Views
```

图不是事实本身。图是对可靠结构化记忆的投影。

---

## Live Graph During Agent Construction

Praxis graph views are not static diagrams generated once during intake. They are live projections over structured memory, models, specifications, plans, tasks and traces.

When an Agent reads information, generates a plan, requests permission, applies changes, generates a task, imports an external construction result or records trace, Praxis emits runtime events. These events update memory, mutate model / plan / task state, or mark related projections stale. The workspace then refreshes affected graph views incrementally.

```text
Agent Construction
      ↓
Runtime Events
      ↓
Memory / Model / Plan / Task / Trace Updates
      ↓
Projection Invalidation
      ↓
Live Graph Reprojection
      ↓
Workspace UI Patch
```

Architecture views show changing understanding.
Project plan views show task progress, dependencies and blockers.
Trace views show the active construction path.
Memory views show new candidates, confirmations, conflicts and corrections.

Graph changes must not hide their source. Every live visual change must be traceable to memory, model, specification, plan, task or trace records.

---

## Graph as Context Anchor

Graph projections are not only visual output. They are semantic entry points into structured memory.

When the user selects a graph node, graph edge, Gantt task, requirement, architecture component or trace node, Praxis resolves the selected element back to source memory, models, specs, tasks, traces and source paths. It then builds a bounded `ContextPacket` for Agent discussion, planning and controlled construction.

```text
User selects graph anchor
      ↓
ContextPacket
      ↓
Scoped Agent Discussion / Plan / Construction
      ↓
Runtime Events
      ↓
Memory Updates
      ↓
Live Graph Reprojection
```

The Agent must use the anchored `ContextPacket` first. It should not search the wider repository unless the anchored context is insufficient. If it expands scope, it must explain why and record the expansion.

For example, selecting a Gantt task should identify its related requirement, specs, architecture nodes, source paths, acceptance criteria, blockers and forbidden paths. This gives the Agent a pre-scoped work packet instead of forcing it to rediscover the project by searching the whole repository.

---

## AI Code Reading to UML / Gantt

Praxis does not ask AI to draw authoritative diagrams.

When AI reads code, it must produce structured patches:

```text
AI reads code
      ↓
RepositoryUnderstandingPatch
      ↓
MemoryPatch / ArchitectureModelPatch / UmlModelPatch / PlanModelPatch
      ↓
Patch Validation
      ↓
Memory / Model Update
      ↓
Projection Engine
      ↓
UML / C4 / Dependency / Gantt Views
```

UML diagrams are projections from `UmlModel`.
Architecture diagrams are projections from `ArchitectureModel`.
Gantt diagrams are projections from `PlanModel`.

The AI may propose INFERENCE or CANDIDATE knowledge. Static analysis may produce FACT knowledge. Only user confirmation may produce CONFIRMED knowledge.

Views remain derived cache:

```text
.distinction/views/**/*.json
.distinction/views/**/*.mmd
```

They must be regenerated from memory and models, not directly edited by AI.

---

## Anti-pattern Quality Management

Praxis quality management is not only lint, tests, coverage or static analyzer reports.

Praxis detects anti-patterns from structured memory, models, UML, architecture graphs, Gantt views, trace graphs, source facts and plan state. Findings are written as structured memory, projected into graph views as annotations, and opened as context-bound chat anchors.

```text
Memory / Models / Specs / Graphs / Trace / Plan
      ↓
Anti-pattern Detection
      ↓
AntiPatternFinding Memory
      ↓
Graph Annotation
      ↓
Finding-anchored Chat
      ↓
Plan / Task / Apply
      ↓
Runtime Events
      ↓
Memory / Model / Plan Update
      ↓
Detector Rerun
      ↓
Live Graph Reprojection
```

Quality includes product clarity, domain modeling correctness, specification completeness, architecture boundary health, code structure, task dependency health, Agent construction discipline, memory consistency and projection consistency.

The user should be able to click a warning on an architecture edge, UML class, Gantt task, trace node or memory node and enter a scoped chat that explains the anti-pattern, shows evidence, proposes a plan and generates a controlled improvement task.

---

## Opinionated Governance Playbooks

Praxis must not stop at reporting anti-patterns.

Most users should not be forced to make raw architecture, modeling or distinction decisions from a blank page. Praxis provides professional, opinionated and explainable governance defaults.

```text
Anti-pattern Detection
      ↓
Governance Playbook Selection
      ↓
Recommended Remediation
      ↓
User Intervention Points
      ↓
Controlled Plan / Task
      ↓
Agent Construction
      ↓
Verification / Detector Rerun
      ↓
Memory / Model / Graph Update
```

Praxis recommendations must be explainable through architecture taste principles, distinction decision rules, evidence and playbook steps.

The user should normally confirm semantics, naming, priority, risk acceptance, remediation strength and scope expansion. The user should not have to invent the architecture boundary, task split or remediation strategy from scratch.

Every remediation should produce one recommended path. Alternatives may be shown, but they must not be presented as equal when one path is professionally preferable.

v0.1 defaults to conservative governance: record memory, clarify models/specs, generate plan actions and controlled tasks, but do not automatically modify existing source code.

Prompt templates are only procedure executors. They must call into the same taste principles, distinction rules and governance playbooks instead of scattering product logic inside UI components.

---

## 4. 两条主入口

Praxis Studio v0.1 支持两条入口：

### 4.1 Open Existing Project

从真实代码仓库出发：

```text
Open Existing Project
→ Scan repository
→ Build RepositorySnapshot
→ Build CodeFactGraphSnapshot
→ Build RepositoryUnderstandingPatch
→ Accept repository FACT memory
→ Infer structure memory
→ Build architecture model candidate
→ Detect findings
→ Build graph projections
→ User review / confirm
→ Write .distinction
→ Enter workspace
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

### 4.2 Create New Project

从产品创意出发：

```text
Create New Project
→ Capture idea memory
→ Clarify product intent
→ Build product model
→ Build domain model
→ Build interaction model
→ Build state model
→ Build architecture model
→ Generate specifications
→ Project graph views
→ Generate project plan
→ Create skeleton
→ Generate controlled coding tasks
```

这条路径用于从创意生长出项目。

它必须遵守：

```text
不要从一句创意直接生成代码。
先构建记忆，再建模，再生成规格，再生成图和计划，最后才创建工程骨架和任务。
```

---

## 5. 记忆：Praxis 的第一性对象

Praxis 的核心不是 Graph，而是 **Reliable Structured Project Memory**。

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

### 5.1 Knowledge Kind

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

### 5.2 记忆来源

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

## 6. 建模：从记忆到可施工世界

建模不是实现后的文档整理。建模是从意图走向规格、架构、图谱、任务和代码的桥梁。

Praxis v0.1 至少需要以下模型：

```text
Product Model
  产品目标、用户、场景、价值主张。

Domain Model
  核心概念、术语区分、实体、规则、生命周期。

Interaction Model
  用户流程、用例、操作路径、确认点。

State Model
  对象状态、状态转换、非法转换、触发事件。

Architecture Model
  系统边界、模块职责、依赖方向、外部系统。

Plan Model
  里程碑、任务、依赖、阻塞、交付物、进度。
```

其中 **Domain Model** 是核心。它负责把模糊创意或混乱代码中的概念区分清楚。

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

## 7. 图谱：从记忆投影出来的视图

Praxis 不使用一张万能 Development Graph。Praxis 使用一组从结构化记忆和模型投影出的图视图。

```text
Structured Memory + Models + Projection Rules
      ↓
Graph Views
```

### 7.1 Architecture Views

用于理解代码结构和架构边界：

```text
C4 Context View
C4 Container View
Component View
Dependency View
Symbol / UML-like View
```

### 7.2 Project Plan Views

用于理解项目推进、前后依赖和进度：

```text
Task Dependency Graph
Timeline / Gantt View
Milestone View
Progress View
Blocker View
```

### 7.3 Memory Views

用于理解决策、规则和历史：

```text
Decision Map
Do-Not-Repeat Map
Incident Map
Concept Distinction Map
```

### 7.4 Trace Views

用于理解 Agent 做过什么：

```text
Agent Run Timeline
Tool Call Graph
Permission Flow
Model Call Trace
```

---

## 8. `.distinction` 项目记忆目录

`.distinction` 是 Praxis 的项目级第二大脑。它借鉴 OpenWolf 的 `.wolf/` 思想，但更强调结构化、可靠性、建模、projection status 和 provider/cache boundary。

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

Source of truth：

```text
project.json
memory/*.jsonl
models/*.json
specs/**/*.md
rules/*.md
rules/playbooks/**/*.md
confirmed project constraints
```

Rebuildable cache：

```text
cache/*.json
provider-local scratch such as .codegraph/
```

Derived / projection cache：

```text
views/**/*.json
views/**/*.mmd
reports/*.md
```

`cache/` 可删除、可重建。`views/` 和 `reports/` 是 derived projection cache。只有 accepted memory、models、rules 和 confirmed specs 才是 Praxis authority。

---

## 9. Agent 的定位

Praxis 的 Agent 不是直接施工的自动代码生成器。Praxis Agent 负责解释、建模、规格化、投影、计划和受控任务生成。

v0.1 需要以下 Agent：

```text
Repository Understanding Agent
  从真实仓库扫描结果生成结构化 FACT / INFERENCE memory。

Idea Clarifier Agent
  从用户创意中提取产品目标、用户、场景和约束。

Domain Modeling Agent
  提取核心概念、概念区分、实体、规则、状态候选。

Architecture Modeling Agent
  从产品模型和领域模型中生成架构候选。

Specification Agent
  从 confirmed memory 和 models 生成规格文档。

Projection Agent
  从 memory / models / specs 生成图谱视图。

Plan Agent
  从规格、模型和图谱生成任务依赖和施工计划。

Governance Agent
  从 finding、ContextPacket 和治理剧本生成有主张的默认修复路径、用户介入点和受控计划。

Coding Task Agent
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

## 10. 外部 Coding Agent 的定位

Claude Code、Codex、Claude Code Best、OpenCode 等都是 Praxis 可以调度的施工队，但不是 Praxis 的地基。

```text
Praxis owns:
  Memory
  Models
  Specs
  Graph Projections
  Plans
  Tasks
  Trace
  Permission / Apply Controller

External coding agents own:
  concrete code editing
  test running
  patch generation
```

v0.1 中，Coding Task 只生成受控任务文件，不自动执行外部 agent。

---

## 11. 技术路线

```text
Desktop Shell: Tauri
UI: React + TypeScript + Vite
Graph UI: React Flow / xyflow
Runtime: TypeScript packages + Node sidecar CLI
Repository Intelligence: repository-scanner + code-fact-graph + repository-understanding
Local Memory: .distinction/
Future Runtime Cache: SQLite
Default Model: DeepSeek
Multi Model: Model Router
External Protocol: MCP Server
External Coding Agent: ManualAdapter first, Codex / Claude Code adapters later
```
