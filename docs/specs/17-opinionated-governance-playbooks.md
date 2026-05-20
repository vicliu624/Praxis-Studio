# Opinionated Governance Playbooks Specification

## 1. Purpose

Praxis must not merely report anti-patterns.

Most users should not be forced to make raw architecture, modeling or distinction decisions from a blank page. Praxis must provide professional, opinionated and explainable remediation behavior.

The user keeps intervention and override power, but Praxis supplies the default judgment, the recommended remediation path and the staged construction plan.

```text
Anti-pattern Detection
      -> Opinionated Governance Playbook
      -> Recommended Remediation
      -> User Intervention Points
      -> Controlled Plan / Task
      -> Agent Construction
      -> Verification / Detector Rerun
      -> Memory / Model / Graph Update
```

## 2. Core Rule

Praxis quality management is not:

```text
detect problem -> show warning -> make the user design the fix
```

It is:

```text
detect problem
  -> diagnose underlying boundary or distinction failure
  -> select a professional default playbook
  -> recommend one remediation path
  -> expose meaningful user intervention points
  -> create a controlled plan or task
  -> verify by evidence and detector rerun
```

Praxis may be opinionated, but it must not be opaque. Every recommendation must be explainable through principles, evidence and playbook steps.

## 3. Architecture Taste Principles

Praxis governance recommendations must be constrained by a small set of stable taste principles.

```text
explicit_boundaries_over_implicit_coupling
  Prefer explicit boundaries over implicit coupling.

domain_meaning_before_technical_structure
  Clarify domain meaning before choosing technical structure.

stable_concepts_deserve_names
  Stable concepts should be named and recorded as memory.

one_reason_to_change
  A module should have a clear reason to change.

adapters_protect_the_core
  Adapters protect core meaning from external details.

plans_follow_models_and_specs
  Plans and tasks should follow memory, models and specs.

user_confirms_meaning_not_mechanics
  User confirmation should focus on semantics, intent, priority and risk.

small_reversible_changes_first
  Prefer small reversible remediation over heroic rewrites.

no_abstraction_without_stable_distinction
  Do not introduce abstractions before a stable distinction exists.

recurring_confusion_must_be_named
  Recurring confusion should become an explicit distinction.
```

These principles are not UI copy. They are inputs to detector explanation, remediation planning, prompt templates and plan validation.

## 4. Distinction Decision Rules

Praxis should help users decide when a distinction is needed, when an abstraction is premature and when concepts should be merged.

### 4.1 Introduce a Distinction

Praxis should recommend introducing a new distinction when:

```text
one term carries different responsibilities in different contexts
one object is used as fact, view and task at the same time
a status code is standing in for a business concept
a module changes for multiple unrelated reasons
a data structure serves storage, UI and Agent context at once
a recurring confusion appears in memory, specs, code or tasks
```

### 4.2 Avoid Premature Abstraction

Praxis should recommend against a new abstraction when:

```text
there is only one implementation and no stable variation direction
the split only makes code look clean without protecting meaning
there is no behavioral, lifecycle or responsibility difference
the user has not confirmed the conceptual boundary
the abstraction would only forward calls without protecting a boundary
```

### 4.3 Merge or Downgrade Concepts

Praxis should recommend merging or downgrading concepts when:

```text
two concepts always change together and have no independent lifecycle
an abstraction only mirrors another object without rules or behavior
a model is only a DTO shadow and has no independent meaning
a layer exists only as ceremony and does not protect the core
```

## 5. Opinionated Default and User Override

Every governance remediation should produce one recommended path.

Alternatives may be shown, but they must not be presented as equal if one path is professionally preferable.

Recommended response shape:

```text
Praxis recommends Strategy A.

Why:
  - matches confirmed memory
  - preserves the current architecture boundary
  - is the smallest reversible change
  - avoids premature abstraction

Less suitable alternatives:
  Strategy B is too aggressive now.
  Strategy C hides the distinction instead of naming it.

User may:
  accept recommendation
  choose conservative strength
  choose aggressive strength
  rename the proposed distinction
  accept risk and defer
```

## 6. User Intervention Points

Users should intervene at semantic and risk points, not be asked to design architecture from scratch.

Valid intervention points:

```text
confirm distinction
rename concept
accept risk
choose remediation strength
delay task
approve plan
reject recommendation
mark false positive
protect a path from modification
allow scoped expansion
```

Praxis should not ask users to decide low-level design mechanics unless the decision changes meaning, risk, priority or source boundaries.

## 7. Remediation Strength

Each playbook must support remediation strength:

```text
conservative
  Record memory/spec/task, clarify boundaries and generate follow-up work.

balanced
  Recommended default after v0.1. Correct the boundary with small scoped tasks.

aggressive
  More thorough restructuring, renaming or module migration.
```

v0.1 default is `conservative` because existing source code must not be modified automatically.

Later versions may default to `balanced` when source-editing workers are governed by approval, patch preview and verification.

## 8. GovernancePlaybook Schema

```ts
export interface GovernancePlaybook {
  id: string;
  antiPatternIds: string[];
  category:
    | "product"
    | "domain_modeling"
    | "specification"
    | "architecture"
    | "code_structure"
    | "project_plan"
    | "agent_construction"
    | "memory"
    | "projection"
    | "quality_feedback";

  title: string;

  appliesWhen: string[];
  diagnosisProcedure: string[];
  tastePrinciples: string[];
  distinctionRules: string[];

  recommendedStrategy: RemediationStrategy;
  alternatives: RemediationStrategy[];

  userInterventionPoints: UserInterventionPoint[];

  planActionTemplates: PlanActionTemplate[];
  codingTaskTemplate?: CodingTaskTemplate;
  verificationCriteria: string[];
}

export interface RemediationStrategy {
  id: string;
  strength: "conservative" | "balanced" | "aggressive";
  summary: string;
  recommended: boolean;
  rationale: string[];
  expectedArtifacts: Array<
    | "memory_patch"
    | "model_patch"
    | "spec_patch"
    | "plan_patch"
    | "coding_task"
    | "detector_rerun"
  >;
  risks: string[];
}

export interface UserInterventionPoint {
  id: string;
  kind:
    | "confirm_distinction"
    | "rename_concept"
    | "choose_strength"
    | "accept_risk"
    | "delay_task"
    | "approve_plan"
    | "reject_recommendation"
    | "scope_override";
  question: string;
  defaultAnswer?: string;
}
```

## 9. Playbook Catalog

Praxis should maintain a governance playbook catalog.

Possible package / directory boundary:

```text
packages/governance-playbooks
```

Project-level overrides may later live in:

```text
.distinction/rules/playbooks/
```

Initial catalog:

```text
architecture/
  god-module
  cross-layer-dependency
  circular-dependency
  boundary-leak
  adapter-bypass

domain/
  concept-confusion
  missing-state-model
  primitive-obsession
  terminology-drift

specification/
  unverifiable-spec
  spec-gap
  spec-drift

planning/
  oversized-task
  missing-dependency
  false-progress

agent/
  context-drift
  repeated-read
  patch-too-large
  permission-bypass
```

## 10. Required Playbooks

### 10.1 God Module

Default diagnosis:

```text
1. Identify different reasons to change.
2. Cluster responsibilities by stable concept boundary.
3. Separate core, adapter, orchestration, persistence and UI candidates.
4. Recommend the smallest reversible split.
5. In v0.1, update memory/model/spec/task before any source change.
```

User intervention:

```text
accept recommended boundary
choose conservative / balanced / aggressive
protect a path from modification
keep one responsibility in the original module
```

### 10.2 Concept Confusion

Default diagnosis:

```text
1. Collect term usage from memory, specs, tasks and source paths.
2. Cluster meanings by context and responsibility.
3. Propose named distinctions.
4. Write candidate distinction memory.
5. Update specs, model labels and graph labels only after approval.
```

User intervention:

```text
accept recommended names
rename a concept
merge two candidate concepts
temporarily keep a concept ambiguous
```

### 10.3 Cross-layer Dependency

Default diagnosis:

```text
1. Confirm the dependency evidence.
2. Decide whether the dependency violates a confirmed layer boundary.
3. Recommend dependency inversion, port, adapter or accepted risk.
4. Generate a minimal staged task.
```

User intervention:

```text
accept port / adapter strategy
accept risk for now
defer to later task
allow scoped source inspection
```

### 10.4 Oversized Task

Default diagnosis:

```text
1. Split by deliverable.
2. Order by dependencies.
3. Create child tasks.
4. Keep original task as milestone or epic.
5. Refresh Gantt and task graph projections.
```

User intervention:

```text
accept split
merge two child tasks
change priority
mark task as intentionally large
```

### 10.5 Agent Context Drift

Default diagnosis:

```text
1. Compare tool activity with ContextPacket allowed scope.
2. Mark trace finding.
3. Stop or pause the run when risk is high.
4. Rebuild ContextPacket.
5. Tighten allowedPaths / forbiddenPaths.
6. Require explanation before widening scope.
```

User intervention:

```text
allow expansion
reject expansion
add newly discovered path to scope
accept drift as intentional
```

## 11. Agent Procedure

Prompt templates are playbook executors. They must not invent governance behavior independently.

Each remediation prompt must receive:

```text
AntiPatternFinding
ContextPacket
related memory records
related model elements
related specs
related source paths
applicable GovernancePlaybook
architecture taste principles
distinction decision rules
allowed paths
forbidden paths
safety mode
```

Required output:

```text
diagnosis
recommendedDecision
rejectedAlternatives
planActions
userInterventionPoints
codingTasks
verificationCriteria
```

## 12. Runtime and Memory Effects

Applying a governance recommendation may create:

```text
MemoryPatch
ModelPatch
SpecPatch
PlanPatch
CodingTask
PermissionRequest
TraceEvent
DetectorRerun
ProjectionInvalidation
```

The playbook itself is not source of truth. Confirmed memory, validated models, approved plans and trace records remain the durable authority.

## 13. Negative Rules

Praxis must not:

```text
present all options as equal when one is professionally preferable
ask users to invent architecture boundaries from scratch
apply large rewrites without staged plan
introduce abstractions without stable distinctions
hide the principle behind a recommendation
mark a remediation as resolved without detector rerun or evidence
write user-overridden recommendations as confirmed memory without approval
let prompt templates bypass playbooks
let project-specific playbooks override v0.1 safety boundaries
```

## 14. Acceptance Criteria

Opinionated governance playbooks are implemented when:

```text
1. A finding can resolve to an applicable playbook.
2. A playbook produces one recommended remediation path.
3. The recommendation cites taste principles and distinction rules.
4. The user can intervene at semantic, priority, scope and risk points.
5. v0.1 defaults to conservative remediation.
6. Prompt templates execute playbooks instead of inventing free-form fixes.
7. Remediation creates plan/task/memory/trace artifacts.
8. Verification requires evidence or detector rerun.
```
