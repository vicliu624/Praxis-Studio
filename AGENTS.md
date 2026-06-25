# AGENTS.md

This repository is Praxis Studio.

Read this file before making changes.

## Mission

Praxis Studio is an AI-native Product Development IDE centered on Development Graph and Project Memory.

Project Memory means the normalized project documentation set plus its Git version timeline.
`.distinction` is not the final memory authority. It is a v0.1 transition/runtime area for cache, trace, indexes, task handoff and legacy compatibility, and it must eventually exit the project-memory role.

Do not reduce this project to a code editor, a static diagram tool, or a Claude Code clone.

## v0.1 Goal

Build:

```text
Project Intake + Graph Agent + Controlled Coding Task MVP
```

v0.1 must support:

```text
Open Existing Project
Create New Project
Development Graph Workspace
Context-bound Chat
Explain / Plan / limited Apply
Coding Task Generation
Git-versioned docs as project memory
.distinction transition/runtime state
```

## Non-negotiable Principles

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
11. Design surfaces are projected from formatted, normalized, complete project documents.
12. Project Memory authority is docs plus Git history, not .distinction.
```

Design surface rule:

```text
Every design-facing UI in Praxis must be backed by durable project documents.
The UI may render projections, diagrams and indexes, but those views are not authority.
.distinction may hold cache, trace, structured acceptance records and migration-era memory, but new design surfaces must not be sourced only from .distinction cache/views.
When a design surface lacks a normalized document source, create or request that document instead of inventing a UI-only model.
Semantic HTML design maps are maintained by agent chat through governed DOM patches; Design Explorer must not become a freeform drawing tool or direct HTML editor.
```

Project memory rule:

```text
The complete docs set and its Git version timeline are the project memory.
If a fact, decision, requirement, design, task rationale or model is needed to explain the project, it must have a durable document home.
.distinction may mirror, index, cache or trace that knowledge during migration, but it must not be the only durable place where the knowledge exists.
```

## Do Not Do

```text
Do not make demo graph the main workflow.
Do not build a full coding agent in v0.1.
Do not automatically edit existing source code in v0.1.
Do not make Claude Code Best the product center.
Do not let prompts be scattered in UI components.
Do not write unconfirmed AI guesses as confirmed memory.
Do not bypass Tool Registry for writes.
Do not skip Trace.
Do not make .distinction cache/views the authority for a design surface.
Do not build a design UI whose source cannot be maintained as project documentation.
Do not let users directly draw, drag-edit, or freeform-edit Semantic Design HTML in the UI.
Do not introduce new durable project-memory concepts that only live under .distinction.
```

## Required Architecture

```text
apps/studio-desktop
  Tauri + React desktop shell

apps/runtime-cli
  CLI entry to shared runtime

packages/repository-scanner
  real repo scanning

packages/project-profiler
  project profile generation

packages/graph-generator
  DevelopmentGraphCandidate generation

packages/agent-runtime
  Explain / Plan / limited Apply runtime

packages/context-builder
  target-scoped context

packages/model-router
  model route resolution

packages/provider-deepseek
  DeepSeek provider

packages/prompt-registry
  prompt templates

packages/tool-registry
  governed tools

packages/trace-recorder
  runtime trace

packages/local-knowledge
  transition/runtime read/write for .distinction and docs-backed migration

packages/coding-agent-adapter
  ManualAdapter and external adapter skeletons
```

## Development Order

```text
1. HomePage
2. runtime-cli
3. repository-scanner
4. project-profiler
5. graph-generator
6. model-router + provider-deepseek
7. agent-runtime + prompt-registry
8. Project Intake Review UI
9. local-knowledge writer
10. Create New Project Wizard
11. Development Graph Workspace
12. Coding Task Agent + ManualAdapter
```

## Definition of Done for v0.1

Use Praxis Studio itself as the test project.

Open Existing Project must:

```text
scan this repo
detect Tauri + React + TypeScript + Rust
detect apps/studio-desktop
detect packages/*
generate DevelopmentGraphCandidate
show warnings/questions
accept graph
write docs-backed project memory
write transitional .distinction cache/trace when needed
enter graph workspace
select node/edge
explain
plan
generate coding task
```

Create New Project must:

```text
take product intent
generate requirements
generate architecture
generate Development Graph
generate README/docs and transitional .distinction runtime state
open the new project graph
```
