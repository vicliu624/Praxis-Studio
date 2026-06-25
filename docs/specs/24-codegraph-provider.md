# CodeGraph Provider Specification

## 1. Purpose

Praxis should be able to use stronger code extraction engines without making them the project authority.

`CodeGraphProvider` is the adapter boundary for that integration.

---

## 2. Core Rule

CodeGraph is an optional provider, not the Praxis source of truth.

```text
CodeGraphProvider
  -> CodeFactGraphSnapshot
  -> RepositoryUnderstandingPatch
  -> explicit acceptance
  -> Praxis memory
```

It must not:

```text
write ArchitectureModel directly
write views directly
write confirmed memory directly
define graph workspace truth
replace Praxis local-knowledge policy
```

---

## 3. Distinction Contract

### 3.1 Valid Distinctions

```text
.codegraph/
  provider-local scratch or cache

.distinction/cache/code-fact-graph.json
  Praxis-normalized provider output

.distinction/memory/*.jsonl
  legacy mirror during Project Memory migration
```

### 3.2 Invalid Distinctions

```text
Do not treat CodeGraph schema as Praxis schema.
Do not persist provider-native payloads as durable Project Memory.
Do not treat `.distinction/memory/*.jsonl` as the final Project Memory authority.
Do not make CodeGraph availability a prerequisite for Praxis intake.
Do not make Praxis a wrapper shell around CodeGraph.
```

---

## 4. Provider Interface

```ts
export interface CodeFactGraphProvider {
  id: "native" | "codegraph" | "lsp" | "scip";
  capabilities: CodeFactCapability[];

  isAvailable(request: CodeFactScanRequest): Promise<ProviderAvailability>;
  scan(request: CodeFactScanRequest): Promise<CodeFactGraphSnapshot>;
}

export interface CodeFactScanRequest {
  root: string;
  includePaths?: string[];
  excludePaths?: string[];
  changedPaths?: string[];
  cachePolicy?: "reuse" | "refresh";
}

export interface ProviderAvailability {
  available: boolean;
  reason?: string;
}
```

The provider may call an npm dependency, local binary, library API, or language service.
The output handed to Praxis core must always be `CodeFactGraphSnapshot`.

---

## 5. Cache Policy

Provider-specific working artifacts may live in:

```text
.codegraph/
.scip/
.cache/praxis-code-facts/
```

Praxis-owned normalized output must live in:

```text
.distinction/cache/code-fact-graph.json
```

Rules:

```text
provider-local cache may be deleted and rebuilt
normalized snapshot may be deleted and rebuilt
neither cache is durable authority
provider-local cache path must not be required by downstream consumers
```

---

## 6. Phase Plan

### Phase 1

Use a pragmatic provider boundary:

```text
npm dependency or local library integration when available
provider implementation inside packages/code-fact-graph
CLI selection through --provider codegraph
```

### Phase 2

If necessary, absorb mechanisms through clean-room borrowing:

```text
study extraction/query mechanisms
define Praxis-owned interfaces first
reimplement only what is worth owning
keep provider-specific compatibility logic outside core contracts
```

This phase must follow `docs/CLEAN_ROOM_BORROWING_SPEC.md`.

---

## 7. CLI Contract

```bash
praxis-runtime code-facts --root . --provider native
praxis-runtime code-facts --root . --provider codegraph
```

Expected behavior:

```text
if provider unavailable -> explicit error with reason
if provider succeeds -> schema-valid CodeFactGraphSnapshot
if provider emits richer facts -> durable-memory authority rules still unchanged
```

---

## 8. Acceptance Criteria

This provider boundary is implemented when:

```text
1. CodeGraph is optional and replaceable.
2. Provider-native output is normalized before core consumption.
3. Provider output writes only rebuildable cache.
4. Native provider remains the fallback path.
5. Clean-room borrowing rules are explicitly preserved.
```
