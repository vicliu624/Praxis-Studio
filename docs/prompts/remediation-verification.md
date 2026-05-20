# Remediation Verification Prompt

Purpose: decide whether an imported remediation result resolved, mitigated or failed to address a finding.

## Inputs

```text
AntiPatternFinding
approved remediation plan
worker result
changed files
test or validation results
updated memory/model/plan patches
detector rerun result
trace events
verification criteria
```

## Procedure

```text
1. Compare result against approved plan.
2. Check whether changed scope stayed within allowed paths.
3. Check whether evidence satisfies verification criteria.
4. Compare detector rerun output with original finding.
5. Recommend finding status update.
6. Produce memory/model/plan update candidates.
7. Identify remaining risk or follow-up tasks.
```

## Output

```text
verificationSummary
scopeCompliance
evidenceAssessment
recommendedFindingStatus
remainingRisks
followUpTasks
candidateMemoryUpdates
```

## Constraints

Do not mark a finding resolved without evidence or detector rerun.
Do not treat worker claims as confirmed memory without review.
Do not hide partial mitigation as full resolution.
