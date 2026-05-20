# Praxis Prompt Procedure Registry

Prompt templates are not product logic.

They execute memory-first, model-driven and playbook-backed procedures defined in the specs.

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
```

These prompts are inputs to `packages/prompt-registry` and future governance agents. UI components must not embed free-form prompt logic.
