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

---

## 3. Startup Contract

```bash
praxis-runtime serve --mcp --path <project>
```

Expected behavior:

```text
loads .distinction if present
can initialize read-only intake context when .distinction is absent
exposes the same governed schemas used by CLI and Desktop
refuses unsupported write operations in v0.1
```

---

## 4. Tool Catalog

v0.1 tool surface:

```text
praxis_status
praxis_project_profile
praxis_memory_search
praxis_code_facts
praxis_callers
praxis_callees
praxis_impact
praxis_findings
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

praxis_memory_search({
  query: string;
  kinds?: Array<"FACT" | "INFERENCE" | "CANDIDATE" | "CONFIRMED">;
  limit?: number;
}): MemorySearchResult

praxis_code_facts({
  path?: string;
  symbolId?: string;
  refresh?: boolean;
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

praxis_context_packet({
  anchor: ContextAnchor;
  expansionLevel?: ContextExpansionLevel;
}): ContextPacket

praxis_explain_anchor({
  anchor: ContextAnchor;
}): ExplainResult

praxis_plan_from_finding({
  findingId: string;
  strength?: "conservative" | "balanced" | "aggressive";
}): GovernancePlanResult

praxis_generate_task({
  anchor?: ContextAnchor;
  findingId?: string;
  adapter?: "manual" | "codex" | "claude-code" | "claude-code-best" | "opencode";
}): CodingAgentTask

praxis_record_external_result({
  taskId: string;
  summary: string;
  evidencePaths?: string[];
  suggestedProgress?: number;
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
task generation
external result import
candidate memory or trace creation through approved runtime commands
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
praxis_plan_from_finding
praxis_generate_task
```

without using Praxis's built-in chat loop.

---

## 7. Acceptance Criteria

The MCP contract is implemented when:

```text
1. Praxis can run headless through `praxis-runtime serve --mcp`.
2. Desktop UI is not required for MCP use.
3. MCP tools use the same schema package as CLI and Desktop.
4. External agents can retrieve ContextPacket, findings and tasks through MCP.
5. v0.1 write safety boundaries remain enforced.
```
