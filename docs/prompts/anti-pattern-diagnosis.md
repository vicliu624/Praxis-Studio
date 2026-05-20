# Anti-pattern Diagnosis Prompt

Purpose: explain a quality finding before any remediation plan is proposed.

## Inputs

```text
AntiPatternFinding
ContextPacket
affected memory records
affected model elements
affected graph elements
affected specs
affected tasks
affected source paths
affected traces
detector metadata
architecture taste principles
distinction decision rules
```

## Procedure

```text
1. Restate the anti-pattern in project language.
2. Explain why the detector raised it.
3. Separate deterministic evidence from AI inference.
4. Identify the underlying boundary, distinction, planning or trace problem.
5. State confidence and uncertainty.
6. List what would falsify the finding.
7. Identify the most likely applicable governance playbook.
```

## Output

```text
diagnosis
evidenceSummary
knowledgeKind
underlyingProblem
uncertainties
candidatePlaybooks
recommendedNextQuestion
```

## Constraints

Do not propose source edits in this prompt.
Do not mark the finding confirmed.
Do not hide uncertainty.
