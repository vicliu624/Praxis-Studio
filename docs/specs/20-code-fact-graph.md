# Code Fact Graph Specification

## 1. Purpose

Praxis needs a code fact layer before it can turn repository observations into memory, models, findings, projections, context packets, and tasks.

The code fact graph is not the Development Graph. It is a provider-normalized cache of code-level facts.

```text
Repository Scanner / CodeGraph / LSP / SCIP
      ↓
CodeFactGraphSnapshot
      ↓
FACT memory
      ↓
ArchitectureModel / Finding / Projection / ContextPacket
```

## 2. Boundary

`CodeFactGraphSnapshot` records facts about files, symbols, imports, and code relationships.

It must not:

- become Praxis source of truth
- write confirmed memory
- directly define architecture truth
- directly drive the graph workspace
- bypass intake review or user confirmation

`.distinction/cache/code-fact-graph.json` is a derived cache. It may be deleted and rebuilt.

`.distinction/memory`, `.distinction/models`, and confirmed graph files remain the Praxis project memory authority.

## 3. Knowledge Rules

Local static observations are `FACT`.

Provider interpretation quality is represented by `confidence`, not by upgrading a fact into confirmed architecture meaning.

```text
file exists        = FACT
import exists      = FACT
symbol exists      = FACT when provider can identify it
module boundary    = INFERENCE unless confirmed
architecture role  = INFERENCE unless confirmed
finding severity   = CANDIDATE / INFERENCE until accepted
```

## 4. Snapshot Schema

The normalized snapshot uses this logical shape:

```ts
interface CodeFactGraphSnapshot {
  schemaVersion: "praxis.codeFactGraph.v1";
  root: string;
  generatedAt: string;
  provider: CodeFactProviderInfo;
  files: CodeFactFile[];
  nodes: CodeFactNode[];
  edges: CodeFactEdge[];
  statistics: CodeFactStatistics;
  warnings: CodeFactWarning[];
}
```

Providers may be:

```text
native
codegraph
lsp
scip
```

The initial implementation uses the native provider backed by `repository-scanner`.

## 5. Initial Native Provider

The native provider is intentionally conservative.

It emits:

- one `file` node per scanned source file
- one `import` node per import string
- one `imports` edge from file node to import node
- one `contains` edge from a synthetic project root node to each file node

It does not pretend to understand call graphs, class hierarchies, references, or symbol ownership.

Those facts are reserved for stronger providers such as CodeGraph, LSP, or SCIP.

## 6. CLI Contract

```bash
praxis-runtime code-facts --root .
```

Default behavior prints a summary.

```bash
praxis-runtime code-facts --root . --write-cache
```

writes:

```text
.distinction/cache/code-fact-graph.json
```

Optional output:

```bash
praxis-runtime code-facts --root . --out snapshot.json
```

## 7. Conceptual Constraint

The code fact graph answers:

```text
What code facts did a provider observe?
```

It does not answer:

```text
What does this project mean?
What is the architecture?
What should the user change?
What is confirmed project memory?
```

Those answers belong to Praxis memory, model, finding, projection, and review flows.
