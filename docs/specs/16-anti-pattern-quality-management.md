# Anti-pattern Quality Management Specification

## 1. Purpose

Praxis quality management is anti-pattern driven.

Quality issues are detected from structured memory, models, graph projections, source facts, project plans and runtime traces.

Anti-pattern findings are written as structured memory and projected back into graph views as annotations.

Users can select a finding and open context-bound chat to understand, plan and resolve it.

Resolution is not left as an open-ended user design exercise. A finding should resolve to an applicable governance playbook, which produces one recommended remediation path and explicit user intervention points.

```text
Repository / Memory / Model / Graph / Trace / Plan
      ↓
Anti-pattern Detector
      ↓
AntiPatternFinding Memory
      ↓
Graph Annotation
      ↓
Finding-anchored Chat
      ↓
Plan / Task / Apply
      ↓
Runtime Event
      ↓
Memory / Model / Plan Update
      ↓
Detector Rerun
      ↓
Live Graph Reprojection
```

## 2. Principle

Praxis must not treat quality as only lint, test, coverage or static analyzer output.

Anti-pattern remediation must be playbook-backed. Praxis should recommend one professional default path instead of leaving users to design remediation from scratch. The recommendation must remain explainable and overridable.

Quality includes:

```text
product clarity
domain modeling correctness
specification completeness
architecture boundary health
code structure health
task dependency health
agent construction discipline
memory consistency
projection consistency
quality feedback loop health
```

Definition:

```text
Quality Management
  = Anti-pattern Detection
  + Graph Annotation
  + Opinionated Governance Playbook
  + Context-bound Resolution
  + Live Reprojection
```

## 3. AntiPatternFinding

Anti-pattern recognition results are structured memory. They must not exist only as temporary UI warnings or reports.

```ts
export interface AntiPatternFinding {
  id: string;

  antiPatternId: string;
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
  summary: string;

  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";

  knowledgeKind: "FACT" | "INFERENCE" | "CANDIDATE" | "CONFIRMED";

  affectedMemoryIds: string[];
  affectedModelIds: string[];
  affectedGraphElementIds: string[];
  affectedSpecPaths: string[];
  affectedTaskIds: string[];
  affectedSourcePaths: string[];
  affectedTraceIds: string[];

  evidence: Evidence[];

  suggestedQuestions: string[];
  suggestedPlanActions: string[];

  status:
    | "open"
    | "acknowledged"
    | "planned"
    | "in_progress"
    | "mitigated"
    | "resolved"
    | "false_positive"
    | "accepted_risk";

  createdAt: string;
  updatedAt: string;
}
```

Findings should be stored in:

```text
.distinction/memory/findings.jsonl
```

or, if separated by category:

```text
.distinction/memory/anti-patterns.jsonl
```

## 4. Detector Types

```ts
export interface AntiPatternDetector {
  id: string;
  category: AntiPatternFinding["category"];
  title: string;

  requiredInputs: Array<
    | "memory"
    | "architecture_model"
    | "uml_model"
    | "plan_model"
    | "graph_views"
    | "trace"
    | "source_facts"
  >;

  detect(input: DetectionInput): Promise<AntiPatternFinding[]>;
}
```

Detector classes:

```text
Rule-based Detector
  deterministic checks over memory, models, source facts, graph views and traces

AI-assisted Detector
  model-assisted checks for semantic ambiguity, responsibility drift, conceptual confusion and plan quality
```

Rule-based detectors may produce FACT or high-confidence INFERENCE findings when evidence is deterministic.

AI-assisted detectors may produce CANDIDATE or INFERENCE findings. Only user-confirmed findings become CONFIRMED quality memory.

## 5. Required Categories

### Product / Requirement

```text
ambiguous_requirement
pseudo_requirement
scope_bloat
hidden_non_goal
missing_acceptance_criteria
role_confusion
scenario_gap
```

### Domain Modeling

```text
concept_confusion
anemic_domain_model
missing_state_model
undefined_illegal_transition
missing_domain_event
unclear_boundary_object
terminology_drift
candidate_used_as_confirmed
```

### Specification

```text
spec_island
unverifiable_spec
spec_implementation_drift
premature_technical_spec
duplicate_or_conflicting_spec
missing_spec_coverage
code_descriptive_spec
```

### Architecture

```text
god_module
god_component
circular_dependency
layer_violation
reverse_dependency
missing_glue_layer
implicit_coupling
responsibility_drift
boundary_leak
shotgun_surgery
divergent_change
feature_envy
adapter_bypass
policy_mechanism_mix
```

### Code Structure

```text
long_method
large_class
large_file
too_many_parameters
primitive_obsession
data_class
dead_code
duplicate_code
switch_explosion
magic_string_or_number
global_mutable_state
utility_dump
leaky_abstraction
temporal_coupling
inconsistent_naming
excessive_public_api
```

### Project Plan

```text
isolated_task
oversized_task
undersized_task
missing_prerequisite_task
inverted_dependency
implicit_blocker
inflated_progress
task_without_acceptance_criteria
task_architecture_disconnect
unclear_critical_path
```

### Agent Construction

```text
context_drift
over_search
repeated_read
plan_without_explain
apply_without_plan
permission_bypass
oversized_patch
modification_without_evidence
failure_loop
result_not_imported_to_memory
graph_not_updated_after_construction
```

### Memory / Projection

```text
memory_orphan
graph_orphan
stale_memory
conflicting_memory
unconfirmed_critical_inference
projection_drift
spec_drift
model_drift
trace_gap
silent_update
```

## 6. Graph Annotation

Every finding should be projectable onto at least one graph view when possible.

```text
Product / requirement findings
  Product Model Graph, Spec Coverage Graph, Project Plan Graph

Domain modeling findings
  Domain Model Graph, State Machine View, Memory Distinction Map

Specification findings
  Spec Coverage Graph, Memory Graph, Project Plan Graph

Architecture findings
  C4 Container View, Component View, Dependency View, UML View

Code structure findings
  UML Class Diagram, Symbol View, File / Code Unit Graph

Project plan findings
  Project Plan Graph, Gantt View, Progress View, Blocker View

Agent construction findings
  Trace Graph, Task Graph, Memory Graph, Live Projection View

Memory / projection findings
  Memory Graph, Projection Graph, Trace Graph
```

Findings without graph anchors are allowed, but they must appear in the Quality Inbox.

Graph annotations must not hide their source. The user must be able to inspect evidence, affected records and detector type.

## 7. Finding Lifecycle

```text
open
→ acknowledged
→ planned
→ in_progress
→ mitigated | resolved | false_positive | accepted_risk
```

State rules:

```text
open
  detector found the issue

acknowledged
  user saw the finding and did not dismiss it

planned
  there is a plan action or task for resolution

in_progress
  resolution task is active

mitigated
  risk reduced but not fully removed

resolved
  detector rerun no longer finds the issue or user confirms resolution

false_positive
  user rejects the finding as incorrect

accepted_risk
  user confirms it is a real issue but intentionally accepts it
```

## 8. Finding-anchored Chat

Selecting a finding creates an anti-pattern `ContextPacket`.

The packet must include:

```text
finding
affected graph nodes / edges
source memory
source paths
dependency evidence
related specs
related tasks
previous traces
suggested questions
suggested plan actions
detector type and confidence
applicable governance playbook candidates
```

The Agent must explain:

```text
1. what the anti-pattern is
2. why it was detected
3. what evidence supports it
4. which graph / memory / model / task / code it affects
5. which governance playbook applies
6. which remediation path Praxis recommends
7. which user intervention points matter
```

The Agent must not ask the user to design a remediation from scratch when a playbook can provide a professional default.

## 9. Resolution Workflow

```text
Finding detected
→ written to findings memory
→ graph annotation projected
→ user opens finding-anchored chat
→ Agent explains evidence
→ Agent proposes plan
→ user approves
→ task generated or memory/model patch proposed
→ construction happens
→ result imported
→ detector reruns
→ finding resolved, mitigated, downgraded, false_positive or accepted_risk
→ graph updates
```

Resolution must create:

```text
plan action
task or memory update
trace event
detector rerun
graph reprojection
```

For detailed playbook rules, see `docs/specs/17-opinionated-governance-playbooks.md`.

## 10. v0.1 Minimum Detectors

v0.1 should prove the quality loop with simple detectors:

```text
graph_node_without_source_memory_ids
task_without_acceptance_criteria
task_without_dependency_or_deliverable
projection_stale
package_dependency_cycle
architecture_dependency_without_evidence
candidate_used_as_confirmed
agent_repeated_read
agent_context_drift
```

These detectors are enough to demonstrate:

```text
finding memory
graph annotation
finding-anchored chat
playbook-backed recommended remediation
resolution task
detector rerun
live reprojection
```

## 11. Negative Rules

Praxis must not:

```text
silently hide findings
mark AI-detected finding as confirmed without user approval
resolve finding without evidence
detach finding from source memory
show graph warning without explainable source
treat quality as only lint/test output
write findings only to temporary UI state
delete findings without trace
force users to invent remediation strategy from scratch
present every remediation alternative as equally recommended
```

## 12. Acceptance Criteria

Anti-pattern quality management is implemented when:

```text
1. Findings are stored as structured memory.
2. Findings distinguish rule-based FACT/INFERENCE from AI-assisted CANDIDATE/INFERENCE.
3. Findings can annotate graph views.
4. Finding annotations can be selected as chat anchors.
5. Finding status lifecycle is persisted.
6. Resolution creates plan/task/memory/trace artifacts.
7. Detector rerun can resolve, mitigate or reopen findings.
8. Live graph reprojection reflects finding status changes.
9. Findings can resolve to opinionated governance playbooks.
10. Remediation recommendations include one professional default and explicit user intervention points.
```
