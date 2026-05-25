# Local Knowledge Spec

## 1. 定位

`.distinction/` 是 Praxis 项目内可版本化的长期开发记忆边界。

它承载的不是一张孤立的 graph cache，而是：

```text
durable project memory
durable models
confirmed specs and rules
governed tasks and reports
rebuildable intake / projection cache
```

Praxis 的 authority 不在 UI，不在 provider scratch，不在 graph cache。

---

## 2. 区分契约

### 2.1 当前容易混淆的对象

```text
.distinction/cache                    ≠ durable project memory
.distinction/views                    ≠ source of truth
provider scratch such as .codegraph/  ≠ Praxis authority
facts.jsonl                           ≠ architecture truth
model candidate                       ≠ confirmed model
report                                ≠ durable memory
```

### 2.2 正当区分

```text
project.json
  project identity and local Praxis metadata

cache/
  rebuildable artifacts from scanning, code fact extraction, modeling and projection

memory/
  durable structured knowledge records

models/
  durable model state or confirmed model candidates accepted into project memory

specs/
  confirmed or reviewable project-local spec documents

views/
  derived projection cache for graph and diagram surfaces

reports/
  human-readable derived summaries

rules/
  durable governance constraints and playbook overrides
```

### 2.3 非法区分

```text
Do not make .distinction/graph the source of truth.
Do not let provider output write directly into memory/ or models/.
Do not treat markdown notes as a replacement for structured memory.
Do not let views/ define architecture truth.
Do not write confirmed memory without explicit acceptance.
Do not bypass Tool Registry and local-knowledge write policy for durable writes.
```

---

## 3. v0.1 目录结构

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

### 4.1 Durable authority

Praxis 项目级 authority 是：

```text
.distinction/project.json
.distinction/memory/*.jsonl
.distinction/models/*.json
.distinction/rules/**/*.md
.distinction/specs/**/*.md
explicitly confirmed spec records
```

### 4.2 Rebuildable cache

这些文件可删除、可重建，不得被当作 authority：

```text
.distinction/cache/*.json
provider-local scratch such as .codegraph/
temporary extraction artifacts
```

### 4.3 Derived projections

这些文件是 projection cache，不是 authority：

```text
.distinction/views/**/*.json
.distinction/views/**/*.mmd
.distinction/reports/*.md
```

Projection status 应写入 `.distinction/cache/projection-manifest.json`，而不是混进 durable memory。

---

## 5. 写入规则

```text
1. 如果 .distinction 不存在，Praxis 可以初始化。
2. 如果 .distinction 已存在，不得盲目覆盖 durable files。
3. durable writes 必须通过 packages/local-knowledge 和 Tool Registry 约束执行。
4. provider outputs 只能先写入 cache/，不能直接写 memory/、models/、views/。
5. FACT / INFERENCE / CANDIDATE / CONFIRMED 的写入边界必须保持。
6. 所有 Apply、accept、external result import 都必须写 trace。
7. v0.1 不自动修改 existing source code；允许写入 .distinction、新 specs、新 tasks 和新工程骨架文件。
8. 所有 confirmed memory 必须可追溯到 user acceptance 或 explicit acceptance command。
```

### 5.1 Intake write boundary

```text
repository scan                  -> cache/repository-snapshot.json
code fact provider              -> cache/code-fact-graph.json
repository understanding        -> cache/repository-understanding-patch.json
accept understanding            -> memory/facts.jsonl
architecture model candidate    -> cache/architecture-model-patch.json
finding detector                -> cache/architecture-findings.json
projection engine               -> cache/projection-manifest.json + views/** + reports/**
```

### 5.2 Confirmed write boundary

以下内容进入 durable authority 前需要显式 acceptance：

```text
memory confirmations
decision records
model updates that become project truth
spec changes that become confirmed project constraints
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
4. markdown-only memory notes 应迁移为 structured jsonl memory and/or specs
5. legacy files may be archived under reports/legacy/ if preservation is needed
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

`.distinction/` 默认应可提交到 Git，因为它是项目记忆的一部分。

未来可选择忽略的通常是：

```text
large provider scratch
temporary extraction intermediates
very large local traces
machine-local secrets
```

模型供应商凭证属于 IDE 级设置，不属于项目 `.distinction` 记忆。
