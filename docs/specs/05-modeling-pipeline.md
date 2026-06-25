# Modeling Pipeline Specification

## 1. Purpose

Modeling converts memory into a coherent buildable world.

Models are not diagrams. Diagrams are projections of models.

## 2. Required models

```text
Product Model
Domain Model
Interaction Model
Design Model
State Model
Architecture Model
Plan Model
UML Model
```

## 3. Product Model

Must define:

```text
product_goal
target_users
core_scenarios
value_proposition
non_goals
success_criteria
```

## 4. Domain Model

Must define:

```text
core_concepts
concept_distinctions
entities
value_objects
events
rules
lifecycles
forbidden_conflations
```

Domain Model is required before architecture generation.

## 5. Interaction Model

Must define:

```text
user_journeys
use_cases
actors
external_systems
system_boundaries
use_case_relations
entry_points
confirmation_points
failure_paths
open_questions
```

Interaction Model is required before requirements generation for new projects.
For existing projects, Interaction Model starts as recovered CANDIDATE / INFERENCE and must not be treated as confirmed product intent until user confirmation.

## 6. Design Model

Must define:

```text
sequence_candidates
class_collaboration_candidates
design_pattern_candidates
participant_roles
source_evidence
confidence
confirmation_status
```

Design Model connects use cases to execution flow and implementation collaboration.
It is the source model for Sequence Diagram, Class Collaboration Diagram and Pattern Map projections.

Design Pattern candidates must identify participant roles and evidence; a pattern label alone is not a design fact.

## 7. State Model

Must define:

```text
stateful_objects
states
transitions
illegal_transitions
trigger_events
```

## 8. Architecture Model

Must define:

```text
systems
containers
components
modules
responsibilities
interfaces
dependency_rules
forbidden_dependencies
external_systems
storage_boundaries
```

## 9. Plan Model

Must define:

```text
milestones
tasks
dependencies
blockers
deliverables
acceptance_criteria
progress
```

## 10. UML Model

Must define:

```text
packages
classes
interfaces
types
functions
methods
fields
relations
source paths
source memory ids
```

UML Model is fed primarily by static symbol extraction and may be enriched by AI-generated candidate relations. UML diagrams are projections of this model.

Code-level UML answers "what symbols exist and how they relate." Design Model answers "which collaborations and patterns carry a story."

## 11. Patch-based modeling

Models must be changed through validated patches.

```text
RepositoryUnderstandingPatch
→ MemoryPatch
→ InteractionModelPatch
→ DesignModelPatch
→ ArchitectureModelPatch
→ UmlModelPatch
→ PlanModelPatch
→ Projection invalidation
```

AI must not directly edit view cache. It may propose model patches with evidence.

## 12. Modeling quality gate

Praxis must not proceed to code skeleton if:

```text
- story baseline is missing
- use cases are undefined or unreviewed
- core concepts are undefined
- major distinctions are missing
- sequence or workflow for key use cases is unknown
- stateful objects have no lifecycle
- design pattern candidates are shown without evidence or confidence
- architecture modules have unclear responsibilities
- plan tasks have no dependencies or acceptance criteria
```
