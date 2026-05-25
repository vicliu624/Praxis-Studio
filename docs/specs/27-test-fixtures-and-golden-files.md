# Test Fixtures And Golden Files Specification

## 1. Purpose

Praxis acceptance is now rich enough that product-level prose is no longer sufficient.

We need executable fixtures and golden outputs to prevent implementation drift.

---

## 2. Fixture Catalog

Minimum fixture set:

```text
fixtures/
├─ tiny-ts-monorepo/
├─ layered-app-with-violation/
├─ cyclic-dependency-app/
├─ docs-first-project/
├─ stale-projection-project/
└─ praxis-self/
```

Each fixture should include:

```text
project files
scenario.md
expected/
```

---

## 3. Expected Outputs

Each fixture should provide goldens for the stages it covers.

Minimum recommended set:

```text
expected/
├─ repository-snapshot.json
├─ code-fact-graph.json
├─ repository-understanding-patch.json
├─ facts.jsonl
├─ architecture-model-patch.json
├─ findings.jsonl
├─ dependency-view.json
└─ projection-manifest.json
```

Some fixtures may add:

```text
uml-model.json
task-graph.json
gantt.json
quality-inbox.json
```

---

## 4. Test Commands

Repository-level commands:

```bash
npm run test:fixtures
npm run test:schemas
```

Useful orchestration command:

```bash
praxis-runtime intake --root fixtures/layered-app-with-violation
```

Low-level stage commands remain valuable for debugging:

```bash
praxis-runtime scan --root fixtures/tiny-ts-monorepo
praxis-runtime code-facts --root fixtures/tiny-ts-monorepo --provider native
praxis-runtime understand --root fixtures/tiny-ts-monorepo
praxis-runtime accept-understanding --root fixtures/tiny-ts-monorepo
praxis-runtime model-architecture --root fixtures/tiny-ts-monorepo
praxis-runtime detect-findings --root fixtures/tiny-ts-monorepo
praxis-runtime project:view architecture --root fixtures/tiny-ts-monorepo
```

---

## 5. Golden Rules

Goldens must be:

```text
small enough to review
stable enough to diff
schema-valid
traceable to a fixture scenario
```

When a golden changes, reviewers should be able to tell whether the cause was:

```text
legitimate schema evolution
provider normalization change
projection rule change
unexpected regression
```

---

## 6. Coverage Goals

The fixture suite should prove at least:

```text
repository scan output stability
code fact normalization stability
understanding accept boundary
architecture candidate generation
finding generation
projection manifest status handling
playbook recommendation selection
praxis-self intake baseline behavior
```

---

## 7. Acceptance Criteria

This contract is implemented when:

```text
1. Fixture directories exist for core scenarios.
2. Goldens cover the intake-to-projection pipeline.
3. Schema validation runs against fixture outputs.
4. Acceptance regressions fail automatically instead of being discovered only in demos.
```
