# Modeling Pipeline Specification

## 1. Purpose

Modeling converts memory into a coherent buildable world.

Models are not diagrams. Diagrams are projections of models.

## 2. Required models

```text
Product Model
Domain Model
Interaction Model
State Model
Architecture Model
Plan Model
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
entry_points
confirmation_points
failure_paths
```

## 6. State Model

Must define:

```text
stateful_objects
states
transitions
illegal_transitions
trigger_events
```

## 7. Architecture Model

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

## 8. Plan Model

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

## 9. Modeling quality gate

Praxis must not proceed to code skeleton if:

```text
- core concepts are undefined
- major distinctions are missing
- stateful objects have no lifecycle
- architecture modules have unclear responsibilities
- plan tasks have no dependencies or acceptance criteria
```