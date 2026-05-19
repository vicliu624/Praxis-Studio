# AGENTS.md

This repository is Praxis Studio.

Read this file before making changes.

## Mission

Praxis Studio is an AI-native Product Development IDE centered on Development Graph and Project Memory.

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
.distinction project memory
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
  .distinction read/write

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
write .distinction
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
generate README/docs/.distinction
open the new project graph
```
