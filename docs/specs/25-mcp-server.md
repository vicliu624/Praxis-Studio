# MCP Server Specification

## 1. Purpose

Praxis must not be trapped inside its own Desktop UI or built-in Agent runtime.

The MCP server exposes Praxis project intelligence to external IDEs and agents.

```text
Praxis Core
  -> CLI
  -> Desktop
  -> MCP Server
```

All three surfaces must share the same schema contracts and authority rules.

---

## 2. Boundary

The MCP server is an external adapter over Praxis core.

It is:

```text
headless
UI-independent
project-memory aware
model-aware
finding-aware
context-packet aware
```

It is not:

```text
the source of truth
a replacement for local-knowledge policy
a requirement to use Praxis's own Agent
a source-editing bypass in v0.1
```

External agents may use Praxis through MCP without using Praxis Desktop UI.

Praxis's built-in Pi Agent Engine may also consume the same MCP tool definitions through a Pi extension. This keeps Pi from inventing a parallel memory/context channel:

```text
Pi Agent Engine
  -> Praxis MCP bridge extension
  -> shared MCP tool definitions
  -> Praxis schemas / .distinction / docs-backed memory
```

The bridge is a tool adapter, not a new authority layer. Read-only tools may be enabled by default to reduce token-heavy repository rediscovery. Governed artifact write tools remain opt-in and still only write Praxis artifacts, never source files or confirmed memory.

---

## 3. Startup Contract

```bash
praxis-runtime serve --mcp --path <project>
```

Expected behavior:

```text
loads .distinction if present
exposes the same governed schemas used by CLI and Desktop
refuses unsupported write operations in v0.1
allows only governed artifact writes, never source-editing bypasses
```

---

## 4. Tool Catalog

v0.1 tool surface:

```text
praxis_status
praxis_project_profile
praxis_code_facts
praxis_callers
praxis_callees
praxis_impact
praxis_findings
praxis_finding_audit
praxis_projection_views
praxis_context_packet
praxis_explain_anchor
praxis_plan_from_finding
praxis_generate_task
praxis_record_external_result
```

### 4.1 Tool Shapes

```ts
praxis_status({}): PraxisStatus

praxis_project_profile({
  refresh?: boolean;
}): ProjectProfile

praxis_code_facts({
  path?: string;
  kind?: CodeFactNodeKind;
  name?: string;
  limit?: number;
}): CodeFactQueryResult

praxis_callers({
  symbolId: string;
  depth?: number;
}): CodeFactRelationResult

praxis_callees({
  symbolId: string;
  depth?: number;
}): CodeFactRelationResult

praxis_impact({
  symbolId: string;
  depth?: number;
}): CodeFactRelationResult

praxis_findings({
  category?: string;
  status?: string;
  limit?: number;
}): FindingListResult

// Read-only. It never accepts a patch, mutates memory, or reruns detectors.
praxis_finding_audit({
  findingId?: string;
  state?: string;
  limit?: number;
}): FindingAuditResult

praxis_projection_views({
  kind?: ProjectedGraphViewKind;
  anchor?: GraphAnchor;
  limit?: number;
}): ProjectionViewsResult

praxis_context_packet({
  anchor: GraphAnchor;
  purpose?: ContextPacketPurpose;
}): ContextPacket

praxis_explain_anchor({
  anchor: GraphAnchor;
}): ExplainResult

praxis_plan_from_finding({
  findingId: string;
  strength?: "conservative" | "balanced" | "aggressive";
}): GovernancePlanResult

praxis_generate_task({
  anchor?: GraphAnchor;
  findingId?: string;
  adapter?: "manual" | "codex" | "claude-code" | "claude-code-best" | "opencode";
}): CodingAgentTask

praxis_record_external_result({
  taskId: string;
  status: "done" | "partial" | "failed";
  summary: string;
  changedFiles?: string[];
  testResult?: string;
  evidencePaths?: string[];
}): ExternalResultReceipt
```

### 4.2 Output Rule

All MCP outputs must:

```text
be schema-validated
be traceable to source memory/model/cache files when applicable
carry stable IDs for follow-up calls
respect durable-vs-cache boundaries
```

---

## 5. Write Policy

v0.1 MCP writes are limited to governed project artifacts such as:

```text
PlanPatch under .distinction/cache/plan-patches/
CodingAgentTask under .distinction/tasks/
ExternalAgentResult under .distinction/reports/external-results/
Trace event append under .distinction/memory/traces.jsonl
```

ExternalAgentResult acceptance is intentionally outside the MCP write itself:

```text
praxis-runtime accept-external-result
  -> materializes MemorySuggestionPatch and FindingStatusPatch review artifacts

praxis-runtime accept-memory-suggestion
  -> converts selected MemorySuggestionPatch records into confirmed docs-backed Project Memory and optional transition mirrors

praxis-runtime accept-finding-status
  -> confirms selected FindingStatusPatch, writes finding status docs/mirror records, and reruns detector reconciliation
```

v0.1 MCP must not:

```text
edit existing source code automatically
write confirmed memory without explicit acceptance flow
edit views/**/*.json directly
bypass Tool Registry or trace recording
```

---

## 6. Runtime Relationship

The MCP server stands beside the Agent runtime.

```text
Agent Runtime
  executes explain / plan / limited apply workflows

MCP Server
  exposes project intelligence capabilities to external tools
```

An external agent may call:

```text
praxis_context_packet
praxis_findings
praxis_finding_audit
praxis_projection_views
praxis_plan_from_finding
praxis_generate_task
praxis_record_external_result
```

without using Praxis's built-in chat loop.

---

## 7. Acceptance Criteria

The MCP contract is implemented when:

```text
1. Praxis can run headless through `praxis-runtime serve --mcp`.
2. Desktop UI is not required for MCP use.
3. MCP tools use the same schema package as CLI and Desktop.
4. External agents can retrieve ContextPacket, findings, projected graph views and tasks through MCP.
5. v0.1 write safety boundaries remain enforced.
```
