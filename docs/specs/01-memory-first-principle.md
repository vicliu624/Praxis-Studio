# Documented Memory-first Principle

## 1. Definition

Praxis Studio is documented-memory-first.

All authoritative project knowledge must be represented in formatted, normalized and complete project documents before it becomes a graph, model, plan, task, implementation context or UI surface.

The complete docs set plus its Git version timeline is Project Memory.
Structured records may be parsed from docs or mirrored during migration, but `.distinction` is not the final project-memory authority.

```text
Repository / Idea
      ↓
Normalized Project Docs + Git Timeline
      ↓
Parsed Structured Records / Models / Views / Plans / Tasks
```

## 2. Non-negotiable rules

```text
1. Graphs are not source of truth.
2. Specs and docs become source of truth when they are normalized, reviewable and versioned in Git.
3. Agent output is not source of truth until confirmed.
4. Repository scan produces FACT evidence, not final architecture truth.
5. Modeling organizes documented memory into a buildable conceptual world.
6. Projection converts docs and parsed models into graph views.
7. Apply mutates docs/task/runtime state, not arbitrary source code in v0.1.
8. Agent construction mutates docs/task/trace state through runtime events, which must invalidate or refresh affected projections.
9. Graph nodes and edges are context anchors, not source-of-truth objects.
10. ContextPacket is a bounded working context derived from docs, evidence and projection source links.
11. AI code reading produces document/model patches, not authoritative view files.
12. UML, architecture diagrams and Gantt are deterministic projections from documented models.
13. Anti-pattern findings must be documented findings, not temporary UI warnings.
14. Quality annotations are projections from findings, not independent truth.
15. Governance playbooks provide explainable defaults; they do not become source of truth without approved document/model/plan changes.
16. `.distinction` may cache, mirror or trace project knowledge during migration, but it must not be the only durable home for project memory.
```

## 3. Why documented-memory-first

Graph-first systems produce shallow diagrams. Prompt-first systems produce unstable text. Code-first systems lose product intent. `.distinction`-first systems hide memory in tool internals. Documented-memory-first systems preserve human maintainability, evidence, confidence, source, confirmation, trace and Git history.

Praxis uses documented-memory-first architecture to make AI collaboration durable over time.

## 4. Required distinction

```text
Project Document ≠ GraphNode
Git Timeline ≠ Passive Backup
MemoryRecord ≠ Project Memory Authority
GraphView ≠ Source of Truth
RuntimeEvent ≠ Passive Log Only
ContextPacket ≠ New Source of Truth
Mermaid / Gantt JSON ≠ Source of Truth
AI Patch ≠ Confirmed Knowledge
Quality Warning ≠ Confirmed Finding
Spec Without Git-tracked Document Home ≠ Project Memory
Model ≠ Diagram
Plan ≠ Apply
Task ≠ Execution
.distinction ≠ Final Project Memory
```

These distinctions must be encoded in normalized project documents once accepted by the user.

Governance recommendations are professional defaults. They are not confirmed decisions until the relevant document, model, plan or task change passes approval and trace.
