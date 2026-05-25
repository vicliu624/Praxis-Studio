# Repository Understanding Patch Specification

## 1. Purpose

Repository understanding converts code facts into reviewable memory patches.

It exists between the code fact cache and confirmed Praxis memory.

```text
CodeFactGraphSnapshot
      ↓
RepositoryUnderstandingPatch
      ↓
Project Intake Review / explicit accept
      ↓
.distinction/memory/facts.jsonl
```

This document defines the Phase 2 boundary. It is an enduring contract, not a progress report.

## 2. Authority

Use `20-code-fact-graph.md` for provider-normalized code facts.
Use `03-repository-understanding-to-memory.md` for the broader memory conversion model.
Use this document for the Phase 2 patch shape, write rules, and command behavior.

## 3. Scope

Phase 2 covers:

- converting code fact files into `code.file.exists` FACT memory patches
- converting code fact import edges into `code.import.exists` FACT memory patches
- writing `.distinction/cache/repository-understanding-patch.json`
- accepting the patch into `.distinction/memory/facts.jsonl`
- smoke tests that prove the patch boundary and accept boundary

Phase 2 does not cover:

- architecture model generation
- finding detection
- graph projection
- agent-authored inferences
- automatic confirmation
- source code modification

## 4. Distinction Contract

### 4.1 Current Confusions

- Code fact cache can look graph-like, but it is not the Development Graph.
- Repository understanding can create memory patches, but the patch is not confirmed memory.
- Accepting code-derived FACT records confirms their persistence in Praxis memory; it does not confirm architecture interpretation.
- Import facts are not architecture dependencies unless a later modeler elevates them as inference and the user reviews them.

### 4.2 Valid Distinctions

- `CodeFactGraphSnapshot` answers what a provider observed.
- `RepositoryUnderstandingPatch` answers which memory records Praxis proposes to write from those observations.
- `MemoryPatch` is a write candidate with evidence and review status.
- `facts.jsonl` is persistent Praxis memory after explicit acceptance.
- `reviewQuestions` capture things that require user or later agent interpretation.
- `warnings` capture provider or conversion limitations.

### 4.3 Invalid Distinctions

- Do not treat every import as an architecture boundary.
- Do not put generated architecture roles into FACT memory.
- Do not write `facts.jsonl` from `understand`.
- Do not let provider names define memory types.
- Do not write unconfirmed AI guesses as FACT or CONFIRMED memory.

## 5. Patch Schema

```ts
interface RepositoryUnderstandingPatch {
  schemaVersion: "praxis.repositoryUnderstandingPatch.v1";
  root: string;
  generatedAt: string;
  sourceSnapshot: {
    schemaVersion: "praxis.codeFactGraph.v1";
    generatedAt: string;
    provider: CodeFactProviderInfo;
    statistics: CodeFactStatistics;
  };
  memoryPatches: MemoryPatch[];
  modelPatches: [];
  findingPatches: [];
  reviewQuestions: ReviewQuestion[];
  warnings: UnderstandingWarning[];
  confidence: "low" | "medium" | "high";
}
```

`MemoryPatch` contains a proposed `MemoryRecord`.

The initial patch only emits records with `kind: "FACT"` and `status: "proposed"`.

## 6. Memory Record Rules

File facts:

```text
type: code.file.exists
subject: repository-relative file path
predicate: exists
object: file
source: code_fact_graph
```

Import facts:

```text
type: code.import.exists
subject: importing file path
predicate: imports
object: imported module string
source: code_fact_graph
```

Each record must include evidence from the code fact graph and must keep provider confidence separate from user confirmation.

Future providers may extend the patch with additional FACT families such as:

```text
code.symbol.exists
code.call.exists
code.type_relation.exists
code.route.exists
code.reference.exists
```

The durable-memory authority rule does not change when richer fact families are added.

## 7. CLI Contract

Generate review patch:

```bash
praxis-runtime understand --root .
```

writes:

```text
.distinction/cache/repository-understanding-patch.json
```

Accept review patch:

```bash
praxis-runtime accept-understanding --root .
```

writes:

```text
.distinction/memory/facts.jsonl
```

`accept-understanding` is the explicit user-confirmation boundary for persistence.
It may write FACT records because local scan and code fact providers observed them.
It must not generate architecture truth.

## 8. Required Smoke Gates

Phase 2 must keep smoke coverage for:

- file and import code facts become proposed FACT memory patches
- generated patches do not contain model or finding patches
- `understand` writes only cache
- `accept-understanding` writes `facts.jsonl`
- accepted jsonl contains only FACT records from the patch

These tests are small on purpose. They guard the boundary before richer architecture work begins.
