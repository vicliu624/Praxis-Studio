# Local Knowledge / .distinction Migration Spec

## 1. 定位

Praxis 的终局项目记忆不是 `.distinction/`。

```text
Project Memory = docs 中所有格式化、规范化、完备化文档的集合 + Git 版本时间线
```

只要一个事实、决策、需求、设计、风险、任务理由或模型需要长期解释项目，它就必须最终有一个项目文档归宿，并通过 Git 历史形成可追溯时间线。

`.distinction/` 是 v0.1 和迁移期的运行态目录。它可以承载 cache、trace、索引、投影视图、任务交接和 legacy compatibility；它不再被定义为长期项目记忆边界，并且目标上必须退出 Project Memory authority。

从 Design Explorer 引入后，Praxis 还确立一条更高优先级的设计界面规则：

```text
All design-facing UI surfaces are projected from formatted, normalized and complete project documents.
```

也就是说，Use Case Diagram、Sequence Diagram、Class Collaboration Diagram、Pattern Map、Architecture Design View 等设计界面，必须能回溯到项目内可维护的规范化文档，包括干净 Markdown 和富 Semantic HTML。`.distinction/` 可以保存 cache、trace、结构化确认记录和迁移期镜像，但不能成为任何 Project Memory 的唯一 authority。

迁移期 `.distinction/` 承载的不是一张孤立的 graph cache，而是：

```text
runtime cache
projection views
trace and run records
task handoff artifacts
legacy structured memory/model mirrors
rebuildable intake / projection cache
```

Praxis 的 authority 不在 UI，不在 provider scratch，不在 graph cache，也不在 `.distinction`。Project Memory authority 必须落在 `docs/**`、`adr/**`、`rfcs/**`、`architecture/**`、`design/**` 或项目约定的规范化文档网络中；Git history 提供版本时间线。`.distinction` 中的记录只提供证据镜像、运行 trace、cache、投影索引和过渡期兼容。

---

## 2. 区分契约

### 2.1 当前容易混淆的对象

```text
.distinction/cache                    ≠ durable project memory
.distinction/views                    ≠ source of truth
normalized project docs               = project memory authority
Git history                           = project memory timeline
provider scratch such as .codegraph/  ≠ Praxis authority
facts.jsonl                           ≠ architecture truth
model candidate                       ≠ confirmed model
report                                ≠ durable memory
.distinction/memory                   ≠ final project memory
```

### 2.2 正当区分

```text
project.json
  transition-era local Praxis metadata

docs/ or project documentation network
  formatted, normalized and complete authority for project memory and design-facing surfaces

Git history
  version timeline for project memory changes

cache/
  rebuildable artifacts from scanning, code fact extraction, modeling and projection

memory/
  legacy structured memory mirror during migration

models/
  legacy structured model mirror or parse cache during migration

specs/
  legacy project-local spec mirror during migration; prefer docs/**

views/
  derived projection cache for graph and diagram surfaces

reports/
  human-readable derived summaries

rules/
  legacy governance mirror during migration; prefer docs/rules or project docs
```

### 2.3 非法区分

```text
Do not make .distinction/graph the source of truth.
Do not let provider output write directly into memory/ or models/.
Do not treat unstructured markdown notes as a replacement for structured memory.
Do not build a design surface from .distinction cache/views without a normalized document source.
Do not let views/ define architecture truth.
Do not write confirmed knowledge only into .distinction.
Do not bypass Tool Registry and local-knowledge write policy for transition/runtime writes.
Do not introduce new project-memory authority under .distinction.
```

---

## 3. v0.1 transition runtime layout

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

`project.json` 最小应包含：

```text
schemaVersion
projectId
root
createdAt
updatedAt
defaultModelProvider
activeProjectionManifest
```

---

## 4. Authority 与 Cache 规则

### 4.0 Project memory authority

项目记忆的终局 authority 是：

```text
docs/**/*.md
docs/**/*.html
adr/**/*.md
rfcs/**/*.md
architecture/**/*.md
design/**/*.md
project-defined normalized documents
Git history for those documents
```

这些文档集合及其版本时间线，应该足以解释项目为什么存在、如何设计、如何演进、哪些判断被接受、哪些判断被拒绝、哪些能力尚未完成、哪些约束不能破坏。

`.distinction` 不属于终局 authority。任何仍只存在于 `.distinction/memory/**`、`.distinction/models/**`、`.distinction/specs/**` 或 `.distinction/rules/**` 的长期知识，都应视为 migration debt。

### 4.1 Design surface document authority

所有设计界面必须遵守 docs-first authority：

```text
formatted project documents
  -> parsed design/source models
  -> projection engine
  -> .distinction/views/**
  -> Studio UI
```

文档必须具备：

```text
stable sections
stable anchors or IDs
machine-readable blocks when needed
human-readable explanation
status / confidence / evidence / changelog
links to related design sections
maintenance or invalidation cues
semantic DOM anchors for HTML design maps
```

`.distinction/cache/**` 可以保存从这些文档派生出的 JSON，以便快速加载、校验和投影。该 cache 可删除、可重建，不得被展示为设计 authority。

### 4.2 Transition runtime state

过渡期 `.distinction` 可以保存：

```text
.distinction/project.json
.distinction/cache/**/*.json
.distinction/views/**/*.json
.distinction/views/**/*.mmd
.distinction/reports/**/*.md
.distinction/tasks/**/*.md
.distinction/runs/**
.distinction/chat/**
.distinction/memory/traces.jsonl
```

以下 legacy mirror 允许存在，但不再是终局 authority：

```text
.distinction/memory/*.jsonl
.distinction/models/*.json
.distinction/rules/**/*.md
.distinction/specs/**/*.md
```

长期方向是把这些长期知识迁移到项目文档网络中；`.distinction` 继续承担机器记录、trace、任务交接、缓存和可重建投影，直到相关运行态能力也被替换或明确保留为 IDE-local state。

### 4.3 Rebuildable cache

这些文件可删除、可重建，不得被当作 authority：

```text
.distinction/cache/*.json
.distinction/cache/design/**/*.json
provider-local scratch such as .codegraph/
temporary extraction artifacts
```

### 4.4 Derived projections

这些文件是 projection cache，不是 authority：

```text
.distinction/views/**/*.json
.distinction/views/**/*.mmd
.distinction/reports/*.md
```

Projection status 应写入 `.distinction/cache/projection-manifest.json`，而不是混进 Project Memory。任何 Design Explorer surface 都必须能从规范化文档重新生成这些 views。

---

## 5. 写入规则

```text
1. 如果 .distinction 不存在，Praxis 可以初始化。
2. 如果 .distinction 已存在，不得盲目覆盖 transition runtime files。
3. transition/runtime writes 必须通过 packages/local-knowledge 和 Tool Registry 约束执行。
4. provider outputs 只能先写入 cache/，不能直接写 memory/、models/、views/。
5. FACT / INFERENCE / CANDIDATE / CONFIRMED 的写入边界必须保持。
6. 所有 Apply、accept、external result import 都必须写 trace。
7. v0.1 不自动修改 existing source code；允许写入 docs、.distinction runtime state、新 tasks 和新工程骨架文件。
8. 所有 confirmed project knowledge 必须可追溯到 user acceptance 或 explicit acceptance command，并最终落入规范化 docs。
9. 新增设计界面前，必须先存在或生成对应的规范化项目文档。
10. 设计图、列表和时间线的 UI 更新必须通过文档解析和 projection 产生，不得只写 UI 状态或 views。
11. 新增长期项目记忆不得只写入 .distinction/memory、models、specs 或 rules。
```

### 5.1 Intake write boundary

```text
repository scan                  -> cache/repository-snapshot.json
code fact provider              -> cache/code-fact-graph.json
repository understanding        -> cache/repository-understanding-patch.json
accept understanding            -> docs/** project memory + optional memory/facts.jsonl mirror
architecture model candidate    -> cache/architecture-model-patch.json
finding detector                -> cache/architecture-findings.json
design discovery                -> docs/design/use-case-diagrams-maps.md + docs/design/use-case-diagrams-maps.html + cache/design/**
projection engine               -> cache/projection-manifest.json + views/** + reports/**
```

### 5.2 Confirmed write boundary

以下内容成为 Project Memory 前需要显式 acceptance，并必须写入规范化 docs：

```text
fact confirmations
decision records
model updates that become project truth
spec changes that become confirmed project constraints
normalized design documents that become design surface authority
plan progress changes that become authoritative
```

---

## 6. Legacy Migration Rule

旧结构：

```text
.distinction/graph/
.distinction/memory/changes.md
.distinction/memory/decisions.md
.distinction/memory/do-not-repeat.md
```

在 v0.1 之后视为 legacy layout。

迁移规则：

```text
1. readers may import legacy graph data as seed projection cache
2. new writers must not emit .distinction/graph/
3. graph/ 应迁移到 views/ 或 cache/projection-manifest.json 管理
4. markdown-only memory notes 应迁移到 docs/** 中的规范化文档
5. structured memory/model/spec/rule authority 应逐步迁移到 docs/** 中的规范化文档
6. legacy files may be archived under reports/legacy/ if preservation is needed
```

Current CLI boundary:

```text
generate-graph / init-memory / create-project legacy graph files
  remain legacy DevelopmentGraph bootstrap flows

intake / model-architecture / detect-findings / project:view
  are the v0.1 projection pipeline
```

Legacy commands must label their output as legacy until they are migrated or retired.

---

## 7. 与 Git 的关系

规范化项目文档默认必须可提交到 Git。docs 的集合承载 Project Memory authority，Git history 承载 Project Memory timeline。

`.distinction/` 不再默认被视为长期项目记忆。迁移期可以提交其中少量为了复现、协作或兼容所需的 runtime state，但长期方向是：

```text
commit docs/**
commit generated source / tests / product artifacts
avoid committing rebuildable .distinction/cache/**
avoid committing rebuildable .distinction/views/**
move durable knowledge out of .distinction/memory, models, specs and rules
```

未来可选择忽略的通常是：

```text
large provider scratch
temporary extraction intermediates
very large local traces
machine-local secrets
```

模型供应商凭证属于 IDE 级设置，不属于项目 `.distinction` 记忆。
