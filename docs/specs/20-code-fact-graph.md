# Code Fact Graph Specification

## 1. Purpose

Praxis needs a code fact layer stronger than a coarse repository scan, but weaker than confirmed architecture meaning.

The code fact graph is that layer.

```text
RepositorySnapshot
  + provider-specific extraction
      ↓
CodeFactGraphSnapshot
      ↓
RepositoryUnderstandingPatch
      ↓
FACT memory
      ↓
ArchitectureModel / Finding / Projection / ContextPacket
```

`CodeFactGraphSnapshot` is not the Development Graph.
It is a provider-normalized cache of code-level facts.

---

## 2. Distinction Contract

### 2.1 Current Confusions

```text
Code fact graph can look graph-like, but it is not the graph workspace authority.
Provider-local scratch such as .codegraph/ can be useful, but it is not Praxis memory.
Symbol and call facts are still code facts; they are not automatically architecture boundaries.
Impact relations can be fact-like provider output, but they do not become plan or risk truth by themselves.
```

### 2.2 Valid Distinctions

```text
RepositorySnapshot
  answers what files, directories, manifests and repository metadata exist

CodeFactGraphSnapshot
  answers what code-level structures and relations a provider observed

RepositoryUnderstandingPatch
  answers which FACT memory records Praxis proposes to persist from those observations

ArchitectureModelPatch
  answers which architecture interpretations Praxis infers from accepted memory
```

### 2.3 Invalid Distinctions

```text
Do not treat every import as an architecture dependency.
Do not treat every symbol cluster as a component boundary.
Do not let provider names define business meaning.
Do not let code fact cache write directly to views/ or models/.
Do not write confirmed memory from code fact extraction alone.
```

---

## 3. Authority Boundary

`CodeFactGraphSnapshot` may be written to:

```text
.distinction/cache/code-fact-graph.json
```

Provider-local caches such as:

```text
.codegraph/
.scip/
temporary LSP indexes
```

are rebuildable scratch space.

The code fact graph must not:

```text
write .distinction/memory/*.jsonl directly
write .distinction/models/*.json directly
write .distinction/views/**/*.json directly
write confirmed architecture truth
bypass Project Intake Review or acceptance commands
```

---

## 4. Snapshot Schema

The normalized snapshot uses this logical shape:

```ts
export interface CodeFactGraphSnapshot {
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

export interface CodeFactProviderInfo {
  name: string;
  source: "native" | "codegraph" | "lsp" | "scip";
  version?: string;
  runId?: string;
  capabilities: CodeFactCapability[];
}

export type CodeFactCapability =
  | "file_structure"
  | "imports_exports"
  | "symbols"
  | "calls"
  | "type_relations"
  | "routes"
  | "references"
  | "impact";

export interface CodeFactFile {
  id: string;
  path: string;
  language: string;
  extension: string;
  sizeBytes: number;
  hash?: string;
  lineCount: number;
  roleHint: string;
  nodeIds: string[];
  evidence: CodeFactEvidenceRef[];
}
```

### 4.1 Node Kinds

```ts
export type CodeFactNodeKind =
  | "project"
  | "file"
  | "module"
  | "class"
  | "struct"
  | "interface"
  | "trait"
  | "function"
  | "method"
  | "property"
  | "field"
  | "variable"
  | "constant"
  | "enum"
  | "enum_member"
  | "type_alias"
  | "namespace"
  | "import"
  | "export"
  | "route";
```

```ts
export interface CodeFactNode {
  id: string;
  kind: CodeFactNodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: string;
  range?: CodeFactRange;
  signature?: string;
  docSummary?: string;
  visibility?: "public" | "private" | "protected" | "internal";
  evidence: CodeFactEvidenceRef[];
}
```

### 4.2 Edge Kinds

```ts
export type CodeFactEdgeKind =
  | "contains"
  | "imports"
  | "exports"
  | "calls"
  | "references"
  | "instantiates"
  | "extends"
  | "implements"
  | "type_of"
  | "overrides"
  | "decorates"
  | "returns"
  | "impacts";

export interface CodeFactEdge {
  id: string;
  kind: CodeFactEdgeKind;
  sourceId: string;
  targetId: string;
  filePath?: string;
  range?: Partial<CodeFactRange>;
  confidence: number;
  evidence: CodeFactEvidenceRef[];
}
```

Provider-level `confidence` is numeric because extraction engines often produce scores.
Memory and finding layers may map that number into `"low" | "medium" | "high"` when writing Praxis memory.

### 4.3 Statistics

```ts
export interface CodeFactStatistics {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  filesByLanguage: Record<string, number>;
  nodesByKind: Record<string, number>;
  edgesByKind: Record<string, number>;
}

export interface CodeFactWarning {
  id: string;
  severity: "info" | "warning";
  summary: string;
}
```

---

## 5. Fact Families

The code fact layer must be able to express at least these normalized fact families:

```text
code.file.exists
code.directory.exists
code.manifest.exists
code.package.exists
code.import.exists
code.export.exists
code.symbol.exists
code.call.exists
code.type_relation.exists
code.route.exists
code.implements.exists
code.extends.exists
code.instantiates.exists
code.reference.exists
code.file_dependency.exists
code.symbol_impact.exists
```

Interpretation rules:

```text
file / directory / import / export / symbol / call / route / reference
  can be FACT when provider evidence is direct

architecture boundary / module ownership / responsibility / risk
  remain INFERENCE or CANDIDATE until later stages
```

Provider confidence measures extraction quality.
It must not silently upgrade code facts into confirmed architecture meaning.

---

## 6. Provider Capability Levels

### 6.1 Native Provider

The native provider is conservative and always available.

It should emit:

```text
files
directories
package/manifests
imports
exports
basic file dependency edges
```

It may emit symbol-level facts only when extraction is deterministic and cheap.

### 6.2 Stronger Providers

Optional providers such as CodeGraph, LSP and SCIP may additionally emit:

```text
classes / interfaces / functions / methods / fields
calls
extends / implements
references
routes
impact edges
```

Absence of a capability does not imply absence of a fact.
It only means the current provider did not observe or normalize it.

---

## 7. Mapping Boundary

`CodeFactGraphSnapshot` does not persist directly into durable Project Memory.

The correct write chain is:

```text
CodeFactGraphSnapshot
  -> RepositoryUnderstandingPatch
  -> explicit acceptance
  -> docs-backed Project Memory
  -> optional .distinction/memory/facts.jsonl legacy mirror
```

The initial repository-understanding phase may choose to persist only a subset of fact families.
That implementation limit must not narrow the schema contract.

---

## 8. CLI Contract

Generate a snapshot:

```bash
praxis-runtime code-facts --root . --provider native
```

Write cache:

```bash
praxis-runtime code-facts --root . --provider native --write-cache
```

Provider selection:

```bash
praxis-runtime code-facts --root . --provider codegraph
praxis-runtime code-facts --root . --provider lsp
praxis-runtime code-facts --root . --provider scip
```

v0.1 must accept provider selection at the CLI boundary.
Providers that are not implemented yet must fail explicitly instead of silently falling back to native extraction.

Optional output:

```bash
praxis-runtime code-facts --root . --provider native --out snapshot.json
```

All variants must return schema-valid JSON.

---

## 9. Acceptance Gates

The code fact graph contract is implemented when:

```text
1. Snapshot writes only cache by default.
2. Provider name and capabilities are recorded.
3. File/import facts are normalized consistently across providers.
4. Stronger providers can add symbol / call / type / route / reference / impact facts without changing durable-memory authority rules.
5. Snapshot does not directly generate architecture model, graph view or confirmed memory.
6. Contract tests verify schema validity and provider normalization.
```
