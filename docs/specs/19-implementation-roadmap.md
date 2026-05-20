# v0.1 Implementation Roadmap

## Phase 0 — Spec Freeze

Deliver:

```text
README.md updated
all docs/specs written
package responsibilities reviewed
```

## Phase 1 — Memory Core

Deliver packages:

```text
memory-model
memory-store
repository-understanding
patch-model
patch-validator
finding-model
governance-playbook-model
```

Migrate:

```text
repository-scanner → FACT memory
project-profiler → INFERENCE memory
```

## Phase 2 — Modeling Core

Deliver packages:

```text
modeling-pipeline
domain-model
architecture-model
uml-model
project-plan-model
symbol-extractor
symbol-diff
anti-pattern-detectors
governance-playbooks
prompt-procedure-registry
```

## Phase 3 — Projection Core

Deliver packages:

```text
graph-projection
projection-invalidation
live-projection-loop
graph-anchored-context
context-packet-builder
uml-projection
architecture-views
project-plan-views
memory-views
trace-views
quality-annotations
quality-inbox
governance-recommendation-cards
```

## Phase 4 — CLI Vertical Slice

Deliver CLI commands:

```text
praxis memory:init
praxis repo:understand
praxis repo:symbols
praxis model:architecture
praxis model:patch
praxis quality:detect
praxis quality:list
praxis quality:explain
praxis quality:recommend
praxis playbook:list
praxis playbook:show
praxis project:view architecture
praxis project:view uml
praxis project:view plan
praxis context:build
praxis chat explain
praxis chat plan
praxis apply
praxis task:generate
```

## Phase 5 — Desktop Workspace

Deliver:

```text
Home
Open Existing Project
Create New Project
Memory Review
Model Review
Architecture View
UML / Symbol View
Project Plan View
Graph Anchored Context Panel
Inspector + Context Chat
Trace Panel
Live Projection Status
Patch Preview
Quality Inbox
Finding Anchored Chat
Governance Recommendation Card
Remediation Strength Selector
```

## Phase 6 — Controlled Coding Task

Deliver:

```text
TASK generation
Task anchored ContextPacket
ManualAdapter
External result import
Progress suggestion
Memory update after confirmation
PlanModel progress update after confirmation
Gantt refresh
Finding generation
Quality annotation refresh
Governance playbook selection
Recommended remediation generation
User intervention capture
Detector rerun after task result
```
