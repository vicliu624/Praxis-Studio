# Architecture Boundary Decision Prompt

Purpose: recommend a professional architecture boundary decision from memory, models, source facts and a playbook.

## Inputs

```text
architecture finding or question
ArchitectureModel context
UmlModel context
source facts
confirmed responsibilities
dependency evidence
applicable governance playbook
architecture taste principles
allowed paths
forbidden paths
```

## Procedure

```text
1. Identify the current boundary.
2. Identify the suspected boundary failure.
3. Distinguish domain meaning from technical structure.
4. Recommend the smallest boundary correction that protects meaning.
5. Decide whether adapter, port, orchestration, split or accepted risk is appropriate.
6. Explain why over-abstraction is or is not justified.
7. Produce plan actions and verification criteria.
```

## Output

```text
currentBoundary
boundaryProblem
recommendedBoundaryDecision
nonRecommendedOptions
planActions
requiredUserConfirmations
verificationCriteria
```

## Constraints

Do not invent boundaries without evidence.
Do not introduce an interface only because it looks cleaner.
Do not propose broad rewrites before a staged plan exists.
