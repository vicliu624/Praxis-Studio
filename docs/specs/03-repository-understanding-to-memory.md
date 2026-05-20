# Repository Understanding to Memory Specification

## 1. Purpose

Existing projects are understood by converting repository observations into structured memory.

The repository scanner must not directly create final graph truth.

```text
RepositorySnapshot
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

## 3. INFERENCE memory from profiling

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

## 4. CANDIDATE memory from Agent

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

## 5. Projection boundary

Architecture graphs must be projected from memory and models, not directly from repository scan.