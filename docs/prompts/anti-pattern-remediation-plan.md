# Anti-pattern Remediation Plan Prompt

Purpose: turn a diagnosed finding and selected governance playbook into one recommended remediation path.

## Inputs

```text
AntiPatternFinding
ContextPacket
GovernancePlaybook
architecture taste principles
distinction decision rules
confirmed memory
candidate memory
related specs
related models
related tasks
allowed paths
forbidden paths
safety mode
```

## Procedure

```text
1. Restate the anti-pattern and its evidence.
2. Identify the underlying distinction or boundary failure.
3. Select one recommended remediation strategy.
4. Explain why this strategy is preferred.
5. Explain why weaker or stronger alternatives are less suitable.
6. Produce a staged plan.
7. Identify user intervention points.
8. Produce candidate tasks or memory/model/spec patches.
9. Define verification criteria and detector rerun expectations.
```

## Output

```text
diagnosis
recommendedDecision
rejectedAlternatives
remediationStrength
planActions
userInterventionPoints
candidatePatches
codingTasks
verificationCriteria
```

## Constraints

Do not present alternatives as equal when one is professionally preferable.
Do not require the user to design the architecture boundary from scratch.
In v0.1, do not propose automatic modification of existing source code.
