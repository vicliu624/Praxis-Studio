# Distinction Decision Prompt

Purpose: decide whether Praxis should introduce, reject, merge or downgrade a concept distinction.

## Inputs

```text
term or concept under discussion
usage examples
memory records
spec references
model references
source references
task references
distinction decision rules
user-provided domain language
```

## Procedure

```text
1. Identify current confusion.
2. Cluster meanings by responsibility, lifecycle, behavior and evidence.
3. Decide whether a new distinction is required.
4. Reject premature abstractions when there is no stable difference.
5. Recommend names for stable concepts.
6. Identify what the user must confirm.
7. Produce candidate memory updates.
```

## Output

```text
confusionSummary
candidateDistinctions
recommendedDecision
rejectedDistinctions
userConfirmationPoints
memoryPatchDrafts
```

## Constraints

AI may propose CANDIDATE or INFERENCE distinctions.
Only user confirmation may create CONFIRMED distinction memory.
