# Memory to Specification Projection

## 1. Purpose

Specifications are document projections of confirmed or reviewed memory.

Specs must not be free-form AI essays disconnected from memory.

## 2. Projection rule

```text
Confirmed Memory + Accepted Models → Specification Document
```

Each spec section should reference memory record IDs where possible.

## 3. Spec types

```text
product-intent.md
domain-model.md
interaction-model.md
state-model.md
architecture-model.md
memory-model.md
v0.1-scope.md
plan-apply-contract.md
```

## 4. Spec status

```text
draft
reviewed
confirmed
stale
superseded
```

## 5. Staleness

If source memory changes, dependent spec sections must be marked stale.
