# Architecture Modeler And Finding Detector Specification

## 1. Purpose

Phase 3 converts accepted repository facts into an architecture model candidate and basic architecture findings.

It must preserve the distinction between observed code facts and inferred architecture meaning.

```text
.distinction/memory/facts.jsonl
      ↓
ArchitectureModelPatch
      ↓
.distinction/cache/architecture-model-patch.json
      ↓
FindingDetector
      ↓
.distinction/cache/architecture-findings.json
```

This phase generates candidates and inferences. It does not confirm architecture truth.

## 2. Authority

Use `05-modeling-pipeline.md` for the model pipeline.
Use `08-architecture-graph-view.md` for architecture view expectations.
Use `16-anti-pattern-quality-management.md` for finding lifecycle expectations.
Use this document for Phase 3 package boundaries and smoke gates.

## 3. Scope

Phase 3 covers:

- reading accepted FACT memory records from `.distinction/memory/facts.jsonl`
- inferring module candidates from repository paths
- inferring package-level dependencies from `code.import.exists` facts
- writing `.distinction/cache/architecture-model-patch.json`
- detecting basic architecture findings from the model patch
- writing `.distinction/cache/architecture-findings.json`

Phase 3 does not cover:

- graph projection
- UML symbol modeling
- user confirmation of architecture model
- writing confirmed model files
- AI-authored responsibility summaries
- source code modification

## 4. Distinction Contract

### 4.1 Current Confusions

- A package path is not automatically an architecture boundary.
- An import fact is not automatically an architectural dependency with design intent.
- A detector finding is not automatically confirmed risk.
- A role such as `ui`, `runtime`, or `storage` is an inference until user confirmation.

### 4.2 Valid Distinctions

- `MemoryRecord(kind=FACT)` records accepted local observations.
- `ArchitectureModule` is an inferred model element with evidence.
- `ArchitectureDependency` is an inferred dependency relation grounded in import facts.
- `ArchitectureFinding` is a rule-based finding with explicit status and evidence.
- `.distinction/cache/*` files are generated review artifacts.

### 4.3 Invalid Distinctions

- Do not write architecture candidates into `facts.jsonl`.
- Do not directly edit `.distinction/views`.
- Do not mark findings as `CONFIRMED` without user action.
- Do not produce dependency edges without source memory or evidence.
- Do not create empty aspirational packages before they have executable behavior and tests.

## 5. Architecture Model Patch

```ts
interface ArchitectureModelPatch {
  schemaVersion: "praxis.architectureModelPatch.v1";
  root: string;
  generatedAt: string;
  modules: ArchitectureModule[];
  dependencies: ArchitectureDependency[];
  warnings: ArchitectureModelWarning[];
  confidence: "low" | "medium" | "high";
}
```

Initial module inference:

```text
apps/<name>      -> application | ui when name contains studio/desktop
packages/<name>  -> package role inferred from name
docs             -> docs
```

Initial package dependency inference:

```text
code.import.exists:
  subject = importing file path
  object  = import string

if subject belongs to module A
and object is @praxis/<name>
and packages/<name> exists as module B
then A depends_on B
```

Every dependency must retain source memory ids and evidence.

## 6. Findings

The initial finding detector emits only reviewable findings.

Supported Phase 3 findings:

- `architecture_dependency_without_evidence`
- `package_dependency_cycle`

Finding records must include:

- category `architecture`
- status `open`
- knowledgeKind `INFERENCE`
- evidence and affected modules/source paths
- suggested questions and plan actions

## 7. CLI Contract

Generate architecture model patch:

```bash
praxis-runtime model-architecture --root .
```

writes:

```text
.distinction/cache/architecture-model-patch.json
```

Detect findings:

```bash
praxis-runtime detect-findings --root .
```

writes:

```text
.distinction/cache/architecture-findings.json
```

## 8. Required Smoke Gates

Phase 3 must keep smoke coverage for:

- FACT memory records infer modules from `apps/*` and `packages/*`
- `@praxis/*` import facts infer package dependencies with evidence
- dependencies without evidence produce findings
- package cycles produce findings
- CLI generates architecture model and finding cache files

These tests are boundary tests. They prevent the modeler from silently writing confirmed memory or projection cache.
