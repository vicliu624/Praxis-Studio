# Memory-first Principle

## 1. Definition

Praxis Studio is memory-first.

All authoritative project knowledge must be represented as reliable structured project memory before it becomes a graph, model, specification, plan, task, or implementation context.

```text
Repository / Idea
      ↓
Structured Memory
      ↓
Models / Specs / Views / Plans / Tasks
```

## 2. Non-negotiable rules

```text
1. Graphs are not source of truth.
2. Specs are not source of truth unless backed by confirmed memory.
3. Agent output is not source of truth until confirmed.
4. Repository scan produces FACT memory, not final architecture truth.
5. Modeling organizes memory into a buildable conceptual world.
6. Projection converts memory/model/spec into graph views.
7. Apply mutates memory/spec/task state, not arbitrary source code in v0.1.
8. Agent construction mutates memory/model/task/trace state through runtime events, which must invalidate or refresh affected projections.
9. Graph nodes and edges are context anchors, not source-of-truth objects.
10. ContextPacket is a bounded working context derived from memory and projection source links.
11. AI code reading produces patches to memory and models, not authoritative view files.
12. UML, architecture diagrams and Gantt are deterministic projections from models.
13. Anti-pattern findings are structured memory, not temporary UI warnings.
14. Quality annotations are projections from findings, not independent truth.
15. Governance playbooks provide explainable defaults; they do not become source of truth without approved memory/model/plan changes.
```

## 3. Why memory-first

Graph-first systems produce shallow diagrams. Prompt-first systems produce unstable text. Code-first systems lose product intent. Memory-first systems preserve evidence, confidence, source, confirmation and trace.

Praxis uses memory-first architecture to make AI collaboration durable over time.

## 4. Required distinction

```text
MemoryRecord ≠ GraphNode
GraphView ≠ Source of Truth
RuntimeEvent ≠ Passive Log Only
ContextPacket ≠ New Source of Truth
Mermaid / Gantt JSON ≠ Source of Truth
AI Patch ≠ Confirmed Knowledge
Quality Warning ≠ Confirmed Finding
Spec ≠ Memory
Model ≠ Diagram
Plan ≠ Apply
Task ≠ Execution
```

These distinctions must be encoded as confirmed memory once accepted by the user.

Governance recommendations are professional defaults. They are not confirmed decisions until the relevant memory, model, plan or task change passes approval and trace.
