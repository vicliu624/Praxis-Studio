# Schema Contract Specification

## 1. Purpose

Praxis now has enough moving parts that interface snippets embedded across documents are no longer sufficient.

Cross-package and cross-process data must be governed by one explicit schema contract.

This contract exists to prevent:

```text
type drift across packages
CLI / Desktop / MCP shape divergence
provider-specific JSON leaking into core runtime
tests that only validate behavior but not data compatibility
```

---

## 2. Scope

The contract applies to every structure that crosses one of these boundaries:

```text
package -> package
runtime -> file system
runtime -> Desktop UI
runtime -> MCP client
provider -> core normalization layer
cache -> durable memory
```

Purely internal helper objects may remain package-local.

---

## 3. Required Artifacts

Every governed schema must provide:

```text
1. TypeScript interface or type alias
2. Zod schema
3. top-level schemaVersion field
4. JSON fixture
5. round-trip test
```

Round-trip means:

```text
fixture JSON -> parse with Zod -> serialize -> parse again -> structurally equal
```

---

## 4. Priority Schema Set

The first governed set is:

```text
MemoryRecord
RepositorySnapshot
ProjectProfile
CodeFactGraphSnapshot
RepositoryUnderstandingPatch
ArchitectureModel
ArchitectureModelPatch
UmlModel
PlanModel
AntiPatternFinding
GovernancePlaybook
ContextPacket
RuntimeEvent
ProjectionManifest
ProjectionViewRecord
CodingAgentTask
```

If a new package introduces a cross-boundary structure outside this set, it must either:

```text
add it to packages/schema
or keep it package-local until it is ready to become a contract
```

---

## 5. Package Layout

Preferred boundary:

```text
packages/schema/
  src/
    memory.ts
    repository.ts
    project-profile.ts
    code-fact.ts
    patch.ts
    architecture.ts
    uml.ts
    plan.ts
    finding.ts
    governance.ts
    context-packet.ts
    runtime-event.ts
    projection.ts
    task.ts
  fixtures/
    memory/
    repository/
    code-fact/
    patch/
    projection/
  test/
    *.roundtrip.test.ts
```

Re-exporting through a single entrypoint is preferred for consumers:

```ts
export * from "./memory";
export * from "./repository";
export * from "./code-fact";
```

---

## 6. Versioning Rules

Top-level governed payloads must include:

```ts
schemaVersion: "praxis.<name>.v1"
```

Rules:

```text
major semantic change -> new version suffix
optional additive field -> same version allowed when backward-compatible
breaking rename / required field change -> new version
```

Nested sub-objects do not need their own `schemaVersion` unless they are independently persisted or transmitted.

---

## 7. Validation Rules

Zod validation must enforce:

```text
required ids
enum values
timestamp string presence where required
cross-reference shape sanity
knowledge kind constraints
source evidence presence where required
```

Additional semantic validation may live outside Zod, but shape validation must live in the shared schema package.

Examples:

```text
AI output must not parse as FACT or CONFIRMED memory when schema mode forbids it
ProjectionViewRecord.status must be one of fresh/stale/regenerating/failed
ContextPacket.anchor must be one supported anchor type
```

---

## 8. Fixture Rules

Each governed schema should have at least:

```text
one minimal valid fixture
one representative real-world fixture
one invalid fixture for negative testing when useful
```

Fixture paths should mirror module names:

```text
packages/schema/fixtures/code-fact/minimal.json
packages/schema/fixtures/context-packet/finding-anchor.json
```

---

## 9. Consumer Rules

Consumers must:

```text
import governed schemas from packages/schema
avoid redefining cross-boundary interfaces locally
parse external JSON at the boundary
serialize only schema-valid payloads
```

Consumers must not:

```text
copy-paste interface snippets into package-local code
silently accept unknown provider payload shapes into core runtime
emit unversioned durable artifacts
```

---

## 10. Test Gates

Minimum automated gates:

```text
npm run test:schemas
npm run test:fixtures
```

Required coverage:

```text
round-trip tests
invalid fixture rejection tests
selected integration tests proving CLI / MCP / Desktop share the same schema package
```

---

## 11. Acceptance Criteria

This contract is implemented when:

```text
1. Priority schemas live in a shared package.
2. Every durable or cross-process payload carries schemaVersion.
3. Zod validation is performed at runtime boundaries.
4. Fixtures and round-trip tests exist for governed schemas.
5. Desktop, CLI and MCP responses stop redefining their own parallel data shapes.
```
