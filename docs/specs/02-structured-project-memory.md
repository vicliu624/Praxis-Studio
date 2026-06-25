# Documented Project Memory and Structured Mirror Specification

## 1. Purpose

Documented Project Memory is the authoritative knowledge layer of Praxis Studio.

```text
Project Memory = normalized project documents + Git version timeline
```

Structured records are useful as parsed indexes, validation targets, agent context and migration mirrors. They are not the final authority when they live only under `.distinction`.

Facts, inferences, candidates, confirmations, decisions, incidents, traces and constraints must ultimately have a durable document home. `.distinction/memory/**` may mirror or cache those records during v0.1 migration, but it must not be the only place where project memory exists.

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

## 4. Documented memory files

Project memory should be maintained in normalized docs such as:

```text
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/design/**/*.md
docs/design/**/*.html
docs/decisions/**/*.md
docs/requirements/**/*.md
docs/risks/**/*.md
docs/tasks/**/*.md
adr/**/*.md
rfcs/**/*.md
project-defined normalized documents
```

The Git timeline for these documents is part of the memory because it records when requirements, designs, decisions and explanations changed.

## 5. Legacy structured mirror files

The following files are allowed as v0.1 transition/runtime mirrors:

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

They must be treated as parsed indexes, trace-adjacent records, migration compatibility or runtime acceleration. Any long-lived knowledge that exists only in these files is migration debt.

## 6. Source-of-truth rule

The source of truth is documented project memory, not graph cache and not `.distinction`.

```text
Authoritative:
  docs/**/*.md
  adr/**/*.md
  rfcs/**/*.md
  architecture/**/*.md
  design/**/*.md
  project-defined normalized documents
  Git history for those documents

Transition / derived:
  .distinction/memory/*.jsonl
  .distinction/models/*.json
  .distinction/rules/**/*.md
  .distinction/specs/**/*.md
  .distinction/views/**/*.json
  .distinction/views/**/*.mmd
  .distinction/reports/*.md
```

## 7. Confirmation rule

Agent output must not be written as CONFIRMED unless the user explicitly confirms it.

Confirmed knowledge must be written into normalized project documents. Writing only a `.distinction/memory/*.jsonl` record is not enough for durable project memory.

Valid confirmation actions:

```text
Accept memory record
Accept model distinction
Accept architecture responsibility
Accept spec section
Approve plan action
Import verified external task result
```

## 8. Staleness rule

If repository facts change, related docs, inferences, candidates, projections and structured mirrors must be marked stale or regenerated.

## 9. Patch rule

AI-assisted code reading must write document/model patches, not confirmed memory and not view cache.

```text
static_analysis
  may produce FACT evidence when evidence is deterministic

agent_code_reading
  may produce INFERENCE or CANDIDATE document patches

user_confirmation
  may produce CONFIRMED documented memory
```

Patch-derived documented memory must preserve evidence and source paths.

## 10. Finding memory rule

Anti-pattern findings are documented project knowledge. They must preserve affected document/model/spec/task/source/trace links and evidence.

Rule-based detectors may produce FACT or high-confidence INFERENCE findings when evidence is deterministic.

AI-assisted detectors may produce CANDIDATE or INFERENCE findings.

Only user confirmation may produce CONFIRMED quality memory, and that confirmation must have a document home.

## 11. Governance recommendation rule

Governance playbooks and prompt procedures may recommend remediation, but recommendations are not confirmed memory by themselves.

```text
playbook-selected recommendation
  writes trace and candidate plan actions

user-approved remediation
  may write confirmed decision docs or approved plan state

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
