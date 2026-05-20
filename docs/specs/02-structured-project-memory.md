# Structured Project Memory Specification

## 1. Purpose

Structured Project Memory is the authoritative knowledge layer of Praxis Studio.

It records facts, inferences, candidates, confirmations, decisions, incidents, traces and constraints.

## 2. MemoryRecord

```ts
export type KnowledgeKind = "FACT" | "INFERENCE" | "CANDIDATE" | "CONFIRMED";

export type MemoryStatus =
  | "active"
  | "stale"
  | "deprecated"
  | "conflicted"
  | "rejected";

export type MemorySource =
  | "repository_scan"
  | "static_analysis"
  | "agent_inference"
  | "user_confirmation"
  | "external_agent_result"
  | "runtime_trace"
  | "manual_edit";

export interface MemoryRecord {
  id: string;
  kind: KnowledgeKind;
  type: string;
  subject: string;
  predicate: string;
  object?: string;
  value?: unknown;
  summary: string;
  evidence: Evidence[];
  source: MemorySource;
  confidence: "low" | "medium" | "high";
  status: MemoryStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
```

## 3. Evidence

```ts
export interface Evidence {
  id: string;
  kind: KnowledgeKind;
  source: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  references?: string[];
  createdAt: string;
}
```

## 4. Memory files

```text
.distinction/memory/facts.jsonl
.distinction/memory/inferences.jsonl
.distinction/memory/candidates.jsonl
.distinction/memory/confirmations.jsonl
.distinction/memory/decisions.jsonl
.distinction/memory/findings.jsonl
.distinction/memory/incidents.jsonl
.distinction/memory/traces.jsonl
.distinction/memory/do-not-repeat.jsonl
```

## 5. Source-of-truth rule

The source of truth is memory, not graph cache.

```text
Authoritative:
  memory/*.jsonl
  models/*.json
  rules/*.md
  rules/playbooks/**/*.md
  confirmed specs

Derived:
  views/**/*.json
  views/**/*.mmd
  reports/*.md
```

## 6. Confirmation rule

Agent output must not be written as CONFIRMED unless the user explicitly confirms it.

Valid confirmation actions:

```text
Accept memory record
Accept model distinction
Accept architecture responsibility
Accept spec section
Approve plan action
Import verified external task result
```

## 7. Staleness rule

If repository facts change, related inferences, candidates, projections and specs must be marked stale or regenerated.

## 8. Patch rule

AI-assisted code reading must write structured patches, not confirmed memory and not view cache.

```text
static_analysis
  may produce FACT memory when evidence is deterministic

agent_code_reading
  may produce INFERENCE or CANDIDATE memory

user_confirmation
  may produce CONFIRMED memory
```

Patch-derived memory must preserve evidence and source paths.

## 9. Finding memory rule

Anti-pattern findings are memory records. They must preserve affected memory/model/spec/task/source/trace links and evidence.

Rule-based detectors may produce FACT or high-confidence INFERENCE findings when evidence is deterministic.

AI-assisted detectors may produce CANDIDATE or INFERENCE findings.

Only user confirmation may produce CONFIRMED quality memory.

## 10. Governance recommendation rule

Governance playbooks and prompt procedures may recommend remediation, but recommendations are not confirmed memory by themselves.

```text
playbook-selected recommendation
  writes trace and candidate plan actions

user-approved remediation
  may write confirmed decision memory or approved plan state

user-overridden recommendation
  must record the override reason when provided
```

Praxis must preserve the difference between:

```text
professional default recommendation
user-approved semantic decision
approved construction task
verified remediation result
```
