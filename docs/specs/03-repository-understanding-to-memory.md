# Repository Understanding to Memory Specification

## 1. Purpose

Existing projects are understood by converting repository observations into structured memory.

The repository scanner and code fact providers must not directly create final graph truth.

```text
RepositorySnapshot
      +
CodeFactGraphSnapshot
      ↓
RepositoryUnderstandingPatch
      ↓
FACT Memory
      ↓
INFERENCE Memory
      ↓
Architecture Model Candidate
      ↓
Graph Projection
```

## 2. FACT memory from repository scan

The repository scanner provides the coarse repository baseline.

The scanner may produce FACT records for:

```text
file_exists
directory_exists
manifest_exists
package_exists
script_exists
import_exists
export_exists
document_exists
test_file_exists
entrypoint_exists
git_repository_exists
```

Example:

```json
{
  "kind": "FACT",
  "type": "file_exists",
  "subject": "packages/agent-loop/src/index.ts",
  "predicate": "exists",
  "summary": "File exists in repository scan.",
  "source": "repository_scan",
  "confidence": "high"
}
```

## 3. FACT memory from code facts

When stronger code extraction is available, Praxis may additionally derive FACT memory from `CodeFactGraphSnapshot`.

These normalized fact families include:

```text
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

These remain code facts, not architecture truth.

Examples:

```text
symbol exists
  FACT when provider evidence is direct

call exists
  FACT when provider can identify the caller/callee relation

module boundary
  still INFERENCE unless confirmed later
```

## 4. INFERENCE memory from profiling

The profiler may produce INFERENCE records for:

```text
module_candidate
package_role
entrypoint_role
framework_detected
architecture_layer_candidate
dependency_relation_candidate
responsibility_candidate
```

Example:

```json
{
  "kind": "INFERENCE",
  "type": "package_role",
  "subject": "packages/local-knowledge",
  "predicate": "likely_owns",
  "object": "project memory persistence",
  "summary": "packages/local-knowledge likely owns .distinction persistence.",
  "source": "static_analysis",
  "confidence": "medium"
}
```

## 5. CANDIDATE memory from Agent

Agent may propose:

```text
responsibility_summary
architecture_boundary
risk_candidate
missing_test_candidate
module_refactor_candidate
spec_gap_candidate
```

Agent output must remain CANDIDATE until confirmed.

## 6. Projection boundary

Architecture graphs must be projected from memory and models, not directly from repository scan.
