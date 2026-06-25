# Projection Engine Specification

## 1. Purpose

Praxis does not treat graph files as truth.

It projects normalized project documents, parsed models, migration mirrors and trace into view cache.
That process needs an explicit engine contract.

```text
formatted project docs + Git timeline + parsed/mirrored runtime state + trace
      ↓
ProjectionEngine
      ↓
docs/**/*.html
views/**/*.json
views/**/*.mmd
reports/*.md
cache/projection-manifest.json
```

---

## 2. Distinction Contract

### 2.1 Current Confusions

```text
The rendered graph is not the architecture truth.
A report is not the durable decision record.
Regenerating all views every time is allowed for bootstrap, but not a sufficient long-term contract.
Projection status belongs to projection cache management, not to durable memory semantics.
Design surfaces must not be sourced only from .distinction cache/views.
```

### 2.2 Valid Distinctions

```text
formatted project documents
  are the durable authority for design-facing surfaces

memory / models / rules / confirmed specs
  provide migration-era mirrors, confirmation indexes, constraints and structured runtime state

views / reports
  are deterministic outputs of projection

semantic HTML under docs
  is a docs-backed rich design document when it follows the Semantic Design HTML contract

projection-manifest
  records output status and source indexes
```

### 2.3 Invalid Distinctions

```text
Do not let AI write views directly.
Do not make stale projections appear fresh.
Do not hide sourceMemoryIds or sourceModelIds behind visual output.
Do not build a design UI whose source cannot be maintained as a normalized project document.
```

---

## 3. Inputs

Projection inputs may include:

```text
docs/**/*.md
docs/**/*.html
adr/**/*.md
rfcs/**/*.md
architecture/**/*.md
design/**/*.md
.distinction/memory/*.jsonl
.distinction/models/*.json
.distinction/specs/**/*.md
.distinction/rules/**/*.md
.distinction/tasks/*.md
.distinction/memory/traces.jsonl
.distinction/memory/findings.jsonl
```

Bootstrap implementations may also read cache files for convenience, but cache must not replace durable inputs.

For design-facing projections, project documents are the durable inputs. `.distinction/cache/**`, `.distinction/memory/**` and `.distinction/models/**` may be used only as rebuildable acceleration layers, parsed mirrors or migration fallbacks.

---

## 4. Outputs

Projection outputs may include:

```text
docs/design/**/*.html
.distinction/views/architecture/*.json
.distinction/views/architecture/*.mmd
.distinction/views/design/*.json
.distinction/views/design/**/*.mmd
.distinction/views/project-plan/*.json
.distinction/views/memory/*.json
.distinction/views/trace/*.json
.distinction/reports/*.md
.distinction/cache/projection-manifest.json
```

Design-facing Semantic HTML under `docs/**` is not `.distinction` view cache. It is a rich project document. It must be generated or patched through governed agent/runtime writes and must follow `docs/specs/29-semantic-design-html.md`.

v0.1 first implementation starts with:

```text
.distinction/views/architecture/dependency-view.json
.distinction/cache/projection-manifest.json
```

C4, UML, Gantt, memory and trace views remain later projections over the same manifest contract.

---

## 5. Projection Manifest

```ts
export interface ProjectionManifest {
  schemaVersion: "praxis.projectionManifest.v1";
  root: string;
  generatedAt: string;
  views: ProjectionViewRecord[];
}

export interface ProjectionViewRecord {
  id: string;
  kind:
    | "architecture_dependency"
    | "architecture_component"
    | "architecture_context"
    | "uml_class"
    | "design_use_case_list"
    | "design_use_case"
    | "design_activity"
    | "design_sequence"
    | "design_state_machine"
    | "design_class_collaboration"
    | "design_pattern_map"
    | "project_plan"
    | "memory_map"
    | "trace_graph"
    | "quality_inbox";

  path: string;

  authority: "review_cache" | "durable_model";
  sourceCachePaths: string[];
  sourceMemoryIds: string[];
  sourceModelIds: string[];
  sourceFindingIds: string[];
  sourceTaskIds: string[];
  sourceTraceIds: string[];
  sourceSpecPaths: string[];

  status: "fresh" | "stale" | "regenerating" | "failed";
  generatedAt?: string;
  error?: string;
}
```

`authority` tells consumers whether a view was projected from confirmed durable model state or from intake/review cache artifacts.
`sourceCachePaths` is required whenever `authority` is `review_cache`, so Desktop and MCP clients can label the view as review-derived instead of confirmed architecture truth.
`sourceSpecPaths` is required for docs-backed design surfaces, so Desktop and MCP clients can link each rendered design view back to the normalized document section that produced it.

---

## 6. Invalidation Rules

At minimum:

```text
memory changed
  -> invalidate dependent memory / architecture / plan / trace views

model changed
  -> invalidate dependent design / architecture / UML / plan views

finding changed
  -> invalidate annotation-bearing views and quality inbox

task changed
  -> invalidate project-plan and related trace/memory views

trace changed
  -> invalidate trace views and any runtime-linked projection surfaces

spec changed
  -> invalidate spec-backed design / plan / architecture / coverage views
```

The engine may initially over-invalidate.
It must still record which views became stale and why.

---

## 7. Determinism Rule

Projection functions must be deterministic with respect to:

```text
input authority data
projection options
renderer version
```

If a view differs, Praxis should be able to explain whether the cause was:

```text
input change
projection rule change
renderer bug
unsupported input
```

---

## 8. CLI Contract

Examples:

```bash
praxis-runtime project:view architecture --root .
praxis-runtime project:view plan --root .
praxis-runtime project:view memory --root .
praxis-runtime project:view trace --root .
praxis-runtime projections:refresh --root .
```

Expected behavior:

```text
updates manifest status
writes view files
marks failed views with explicit error
never writes durable project memory as a side effect of projection
never treats `.distinction` output as durable project memory
never mutates Semantic HTML outside governed managed blocks unless the user requested full regeneration
```

---

## 9. Acceptance Criteria

The projection engine contract is implemented when:

```text
1. Projection inputs and outputs are explicitly separated.
2. Every generated view has a manifest record.
3. Views expose fresh / stale / regenerating / failed state.
4. Memory/model/task/trace changes can invalidate affected views.
5. Projection cache remains rebuildable and non-authoritative.
6. Design-facing views can be rebuilt from formatted, normalized and complete project documents.
7. A design-facing view without a document source is labeled migration/cache-derived and cannot be presented as durable design authority.
8. Projection can run after deleting rebuildable `.distinction/cache/**` and `.distinction/views/**` when the normalized docs still exist.
9. Design-facing Semantic HTML can be generated from the same source model as Markdown and can be rendered by Design Explorer.
```
