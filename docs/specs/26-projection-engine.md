# Projection Engine Specification

## 1. Purpose

Praxis does not treat graph files as truth.

It projects memory, models, rules and trace into view cache.
That process needs an explicit engine contract.

```text
memory + models + specs + rules + tasks + trace
      ↓
ProjectionEngine
      ↓
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
```

### 2.2 Valid Distinctions

```text
memory / models / rules / confirmed specs
  are the inputs of projection

views / reports
  are deterministic outputs of projection

projection-manifest
  records output status and source indexes
```

### 2.3 Invalid Distinctions

```text
Do not let AI write views directly.
Do not make stale projections appear fresh.
Do not hide sourceMemoryIds or sourceModelIds behind visual output.
```

---

## 3. Inputs

Projection inputs may include:

```text
.distinction/memory/*.jsonl
.distinction/models/*.json
.distinction/specs/**/*.md
.distinction/rules/**/*.md
.distinction/tasks/*.md
.distinction/memory/traces.jsonl
.distinction/memory/findings.jsonl
```

Bootstrap implementations may also read cache files for convenience, but cache must not replace durable inputs.

---

## 4. Outputs

Projection outputs may include:

```text
.distinction/views/architecture/*.json
.distinction/views/architecture/*.mmd
.distinction/views/project-plan/*.json
.distinction/views/memory/*.json
.distinction/views/trace/*.json
.distinction/reports/*.md
.distinction/cache/projection-manifest.json
```

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
    | "project_plan"
    | "memory_map"
    | "trace_graph"
    | "quality_inbox";

  path: string;

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

---

## 6. Invalidation Rules

At minimum:

```text
memory changed
  -> invalidate dependent memory / architecture / plan / trace views

model changed
  -> invalidate dependent architecture / UML / plan views

finding changed
  -> invalidate annotation-bearing views and quality inbox

task changed
  -> invalidate project-plan and related trace/memory views

trace changed
  -> invalidate trace views and any runtime-linked projection surfaces

spec changed
  -> invalidate spec-backed plan / architecture / coverage views
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
never writes durable memory as a side effect of projection
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
```
