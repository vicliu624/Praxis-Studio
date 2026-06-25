# Praxis Studio v0.1 Implementation Plan

## 1. 总体施工原则

v0.1 的首要闭环不是 demo graph，也不是 source-editing agent，而是：

```text
Open Existing Project
  -> Repository Intelligence
  -> Docs-backed Project Memory
  -> Architecture / Finding / Projection
  -> ContextPacket
  -> Explain / Plan / Task
  -> MCP / Desktop reuse
```

施工原则：

```text
Schema first, UI second.
Facts first, interpretation second.
Docs first, .distinction only as transition/runtime state.
Cache is allowed only as rebuildable runtime state; acceptance writes docs-backed memory.
Explain before Plan. Plan before Apply.
Open Existing Project first, Create New Project second.
MCP Server is a first-class external surface, not a later afterthought.
External coding agents are workers, not the Praxis foundation.
Existing source code is not modified automatically in v0.1.
```

---

## 2. v0.1 顺序

### Step 1. Schema Contracts

目标：

```text
freeze cross-package schemas
define schemaVersion policy
require TypeScript interface + Zod schema + JSON fixture + round-trip test
```

主要产物：

```text
packages/schema/
docs/specs/23-schema-contract.md
```

### Step 2. runtime-cli

目标：

```text
build the core runtime surface once
reuse it from desktop, tests and MCP server
```

关键命令：

```bash
praxis-runtime scan --root <path>
praxis-runtime code-facts --root <path> --provider <provider>
praxis-runtime profile --root <path>
praxis-runtime understand --root <path>
praxis-runtime accept-understanding --root <path>
praxis-runtime model-architecture --root <path>
praxis-runtime detect-findings --root <path>
praxis-runtime project:view <architecture|plan|memory|trace> --root <path>
praxis-runtime context:build --root <path> --anchor <anchor>
praxis-runtime chat --project-root <path> --target <anchor> --mode <explain|plan>
praxis-runtime task:generate --root <path> --anchor <anchor>
praxis-runtime serve --mcp --path <project>
praxis-runtime intake --root <path>
```

### Step 3. repository-scanner

目标：

```text
produce RepositorySnapshot from real repositories
```

主要包：

```text
packages/repository-scanner/
```

### Step 4. code-fact-graph + CodeGraphProvider

目标：

```text
normalize file / symbol / relation facts into CodeFactGraphSnapshot
support native provider first
keep CodeGraph as optional provider behind Praxis contract
```

主要包：

```text
packages/code-fact-graph/
docs/specs/20-code-fact-graph.md
docs/specs/24-codegraph-provider.md
```

### Step 5. project-profiler

目标：

```text
infer project kind, frameworks, module candidates and profile-level review questions
```

主要包：

```text
packages/project-profiler/
```

### Step 6. repository-understanding

目标：

```text
convert repository snapshot and code facts into reviewable FACT memory patches
```

主要包：

```text
packages/repository-understanding/
docs/specs/21-repository-understanding-patch.md
```

### Step 7. local-knowledge writer

目标：

```text
write docs-backed project memory and transitional .distinction runtime state
support initialization, merge review and backup-and-write
```

主要包：

```text
packages/local-knowledge/
docs/LOCAL_KNOWLEDGE_SPEC.md
```

### Step 8. architecture-modeler

目标：

```text
turn accepted documented FACT evidence into ArchitectureModelPatch
keep module and dependency meaning as reviewable inference
```

主要包：

```text
packages/architecture-modeler/
```

### Step 9. finding-detector

目标：

```text
emit structured AntiPatternFinding records
map findings to governance playbooks
```

主要包：

```text
packages/finding-detector/
docs/specs/22-architecture-modeler-and-finding-detector.md
docs/specs/28-default-playbooks-v0.1.md
```

### Step 10. projection-engine

目标：

```text
project normalized docs, parsed models, migration mirrors and rules into views and reports
track fresh / stale / regenerating / failed state
```

主要包：

```text
packages/projection-engine/
docs/specs/26-projection-engine.md
```

### Step 11. Project Intake Review UI

目标：

```text
review repository understanding, memory patches, architecture candidates and findings before acceptance
```

主要页面：

```text
HomePage
ProjectIntakeReviewPage
```

### Step 12. Development Graph Workspace

目标：

```text
show projected views instead of one authoritative graph
surface architecture / plan / memory / trace / finding annotations
```

### Step 13. context-builder / ContextPacket

目标：

```text
resolve graph nodes, edges, findings and tasks into bounded ContextPacket
include code fact references and scope policy
```

主要包：

```text
packages/context-builder/
docs/specs/14-graph-anchored-context.md
```

### Step 14. MCP Server

目标：

```text
expose Praxis memory/model/finding/context/task capability to external IDEs and agents
without requiring Praxis Desktop UI
```

主要规格：

```text
docs/specs/25-mcp-server.md
```

### Step 15. agent-runtime + prompt-registry

目标：

```text
run Explain / Plan / limited Apply over ContextPacket, governance playbooks and schema-validated outputs
```

主要包：

```text
packages/agent-runtime/
packages/prompt-registry/
packages/trace-recorder/
```

### Step 16. Coding Task Agent + ManualAdapter

目标：

```text
turn approved plans and findings into controlled external coding tasks
support manual result import and verification
```

主要包：

```text
packages/coding-agent-adapter/
```

### Step 17. Create New Project Wizard

目标：

```text
build the second closed loop after Open Existing Project is stable
generate memory, models, specs, graph projections, skeleton and controlled tasks from product intent
```

主要包：

```text
packages/project-wizard/
packages/template-generator/
packages/file-generator/
```

---

## 3. 先完成的闭环

Praxis v0.1 先证明这条链路：

```text
RepositorySnapshot
  -> CodeFactGraphSnapshot
  -> RepositoryUnderstandingPatch
  -> memory/facts.jsonl
  -> ArchitectureModelPatch
  -> findings
  -> ProjectionManifest + views
  -> ContextPacket
  -> Explain / Plan
  -> Coding task
  -> external result import
  -> detector rerun
```

Create New Project 是 v0.1 的第二条闭环，但不应抢在上面这条链路之前定义产品核心。

---

## 4. 验收重点

v0.1 完成时，至少要硬性证明：

```text
1. docs + Git timeline 是 Project Memory authority，`.distinction` 只是 transition/runtime state。
2. CodeFactGraphSnapshot 不会直接越权写 durable Project Memory。
3. Repository understanding、architecture modeling、finding detection、projection engine 有清晰命令和缓存边界。
4. Desktop UI 与 MCP Server 共享同一套 runtime contracts。
5. ContextPacket 能从 graph / finding / task anchor 稳定生成。
6. Acceptance 使用 fixtures + golden files，而不是只看手工演示。
```

本计划的详细契约以 `docs/specs/*.md` 为准。
