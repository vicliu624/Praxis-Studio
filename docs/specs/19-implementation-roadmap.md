# v0.1 Implementation Roadmap

## Phase 0 - Spec Freeze

Deliver:

```text
README.md aligned with current source-of-truth policy
LOCAL_KNOWLEDGE_SPEC.md aligned with .distinction cache / memory / model / view boundaries
schema contract frozen for cross-package and cross-process data
```

Primary specs:

```text
20-code-fact-graph.md
21-repository-understanding-patch.md
22-architecture-modeler-and-finding-detector.md
23-schema-contract.md
24-codegraph-provider.md
25-mcp-server.md
26-projection-engine.md
27-test-fixtures-and-golden-files.md
28-default-playbooks-v0.1.md
```

## Phase 1 - Repository Intelligence Core

Deliver packages:

```text
schema
repository-scanner
code-fact-graph
repository-understanding
project-profiler
local-knowledge
```

Prove:

```text
RepositorySnapshot is generated
CodeFactGraphSnapshot is generated
RepositoryUnderstandingPatch writes cache only
accept-understanding writes FACT memory only
```

## Phase 2 - Architecture And Finding Core

Deliver packages:

```text
architecture-modeler
finding-detector
governance-playbooks
prompt-procedure-registry
```

Prove:

```text
FACT memory can produce architecture model candidates
findings are structured memory with evidence
v0.1 playbook mapping can recommend one default remediation path
```

## Phase 3 - Projection And Context Core

Deliver packages:

```text
projection-engine
projection-invalidation
graph-anchored-context
context-builder
architecture-views
uml-projection
project-plan-views
memory-views
trace-views
quality-annotations
```

Prove:

```text
all projected views are rebuildable cache
projection manifest tracks fresh / stale / regenerating / failed
ContextPacket resolves back to memory / models / specs / tasks / traces / code facts
```

## Phase 4 - Runtime Surfaces

Deliver:

```text
runtime-cli
MCP server
agent-runtime explain / plan
task generation
external result import
```

Prove:

```text
desktop, CLI and MCP share the same contracts
external agents can use Praxis through MCP without Praxis UI
v0.1 apply boundaries are still enforced
```

## Phase 5 - Desktop Workspace

Deliver:

```text
Home
Open Existing Project
Project Intake Review
Development Graph Workspace
Inspector + Context Chat
Trace Panel
Quality Inbox
Projection Status UI
```

## Phase 6 - Create New Project

Deliver:

```text
product intent capture
modeling pipeline for new projects
spec generation
graph projection
controlled skeleton generation
coding task generation
```

## Phase 7 - Fixture And Golden Gates

Deliver:

```text
fixtures/
expected golden outputs
schema round-trip tests
fixture acceptance tests
praxis-self intake benchmark
```

Prove:

```text
acceptance is reproducible
contract drift is caught automatically
spec changes have executable consequences
```
