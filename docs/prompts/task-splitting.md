# Task Splitting Prompt

Purpose: convert an oversized, under-specified or dependency-poor task into a better PlanModel patch.

## Inputs

```text
PlanTask
PlanModel
related specs
related memory
related architecture nodes
related source paths
project milestone
applicable planning playbook
```

## Procedure

```text
1. Explain why the current task shape is weak.
2. Split by deliverable, dependency and verification boundary.
3. Preserve the original task as milestone or epic when useful.
4. Recommend child task order.
5. Define acceptance criteria for each child task.
6. Preserve source path and architecture links.
7. Produce PlanModelPatch.
```

## Output

```text
taskDiagnosis
recommendedSplit
childTasks
taskDependencies
acceptanceCriteria
PlanModelPatch
userInterventionPoints
```

## Constraints

Do not split tasks just to create more tickets.
Do not create tasks without deliverables or acceptance criteria.
Do not treat task progress as confirmed without evidence.
