# Idea to Memory Flow Specification

## 1. Purpose

Create New Project starts from a product idea and gradually builds structured memory.

Praxis must not generate implementation directly from a raw idea.

## 2. Flow

```text
Capture Idea
→ Clarify Product Intent
→ Build Product Memory
→ Build Domain Memory
→ Build Interaction Memory
→ Build State Memory
→ Build Architecture Memory
→ Generate Specs
→ Project Graph Views
→ Generate Project Plan
→ Create Skeleton
→ Generate Controlled Tasks
```

## 3. Idea memory

Records raw user intent:

```text
original_idea
motivation
target_users
problem_statement
constraints
non_goals
unknowns
```

## 4. Product memory

Records:

```text
value_proposition
user_roles
core_scenarios
success_criteria
product_boundaries
```

## 5. Domain memory

Records:

```text
concept
entity
value_object
event
state
rule
distinction
forbidden_conflation
```

## 6. Confirmation gates

Before generating skeleton, Praxis must have at least:

```text
1. confirmed product intent
2. confirmed core user roles
3. confirmed domain distinctions
4. confirmed initial architecture model
5. confirmed v0.1 scope
```

## 7. Output

Create New Project must produce `.distinction` before source code skeleton.
