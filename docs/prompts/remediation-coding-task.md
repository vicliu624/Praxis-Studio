# Remediation Coding Task Prompt

Purpose: produce a controlled external-worker task from an approved remediation plan.

## Inputs

```text
approved plan actions
AntiPatternFinding
GovernancePlaybook
ContextPacket
related specs
related memory
related source paths
allowed paths
forbidden paths
verification criteria
v0.1 safety boundary
```

## Procedure

```text
1. Restate the approved remediation goal.
2. Define allowed and forbidden scope.
3. List required files or paths to inspect first.
4. Define deliverables.
5. Define acceptance criteria.
6. Define verification commands only when allowed.
7. Require result import as memory/model/plan patch candidates.
```

## Output

```text
CodingTask
scope
constraints
deliverables
acceptanceCriteria
verificationPlan
resultImportInstructions
```

## Constraints

In v0.1, Praxis generates the task package but does not automatically modify existing source code.
External coding agents are workers; Praxis owns memory, graph, plan and progress.
