# Praxis Prompt Procedure Registry

Prompt templates are not product logic.

They execute documented-memory-first, model-driven and playbook-backed procedures defined in the specs.

## Required Rule

```text
Principles -> Playbooks -> Prompt Procedures -> Runtime Events -> Memory / Model / Plan Updates
```

Prompts must not bypass:

```text
memory source-of-truth
knowledge kind rules
ContextPacket scope
permission policy
governance playbooks
trace recording
v0.1 source-edit boundary
```

## Prompt Files

```text
anti-pattern-diagnosis.md
anti-pattern-remediation-plan.md
distinction-decision.md
architecture-boundary-decision.md
task-splitting.md
remediation-coding-task.md
remediation-verification.md
design-discovery-use-cases.md
design-story-intake.md
design-drilldown-activity.md
design-drilldown-sequence.md
design-drilldown-state-machine.md
design-drilldown-class-collaboration.md
design-diagram-discussion.md
design-version-decision.md
engineering-discovery-diagrams.md
engineering-diagram-package.md
engineering-diagram-component.md
engineering-diagram-class-structural.md
engineering-diagram-sequence.md
engineering-diagram-deployment.md
engineering-diagram-hotspot.md
engineering-diagram-discussion.md
```

These prompts are inputs to `packages/prompt-registry` and future governance agents. UI components must not embed free-form prompt logic.
