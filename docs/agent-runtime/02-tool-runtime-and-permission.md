# 02. Tool Runtime and Permission Spec

Status: draft  
Depends on: `packages/tool-registry`, `docs/CLEAN_ROOM_BORROWING_SPEC.md`

## 1. Principle

A tool is not a function. A tool is a governed runtime capability.

Every tool must declare:

```text
name
description
input schema
output schema
risk level
read/write behavior
permission requirement
context contribution
UI rendering summary
trace behavior
whether it is safe to run concurrently
whether it can be exposed to the model in the current mode
```

This is how Praxis prevents the runtime from becoming a pile of prompts and arbitrary callbacks.

## 2. Tool Definition

```ts
export type ToolRiskLevel =
  | "read"
  | "plan"
  | "write_memory"
  | "write_graph"
  | "write_docs"
  | "write_task"
  | "write_source"
  | "shell"
  | "network"
  | "external_agent";

export interface ToolDefinition<Input, Output> {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  riskLevel: ToolRiskLevel;
  requiredMode: "explain" | "plan" | "apply" | "execute";
  isReadOnly: boolean;
  isDestructive: boolean;
  canRunConcurrently: boolean;
  renderInputSummary(input: Input): string;
  renderOutputSummary(output: Output): string;
  checkPermissions(input: Input, context: ToolContext): Promise<PermissionDecision>;
  call(input: Input, context: ToolContext): Promise<Output>;
}
```

## 3. Tool Categories

Praxis tool categories are derived from product objects, not from file editing alone.

```text
Project Intake
  ScanRepositoryTool
  ProfileProjectTool
  GenerateGraphCandidateTool
  RenderProjectIntakeReportTool

Development Graph
  ReadDevelopmentGraphTool
  ProposeGraphChangeTool
  ApplyGraphChangeTool
  UpdateNodeProgressTool
  UpdateEdgeProgressTool
  CreateRiskNodeTool
  CreateDecisionNodeTool

Context
  BuildProjectContextTool
  BuildNodeContextTool
  BuildEdgeContextTool
  BuildSubgraphContextTool
  RecallRelevantMemoryTool

Planning
  GeneratePlanTool
  VerifyPlanBoundaryTool
  ConvertPlanToActionsTool

Memory
  CreateMemoryEventTool
  CreateDecisionRecordTool
  AppendChangeLogTool
  MarkKnowledgeConfirmedTool

Tasks
  GenerateCodingTaskTool
  RenderCodingTaskMarkdownTool
  ImportCodingTaskResultTool

External Workers
  PrepareExternalAgentTaskTool
  RunExternalAgentTool
  ReadExternalAgentResultTool

Future Execution
  RunShellCommandTool
  RunTestsTool
  RunLspQueryTool
  WebFetchTool
  WebSearchTool
```

v0.1 should not expose source-editing tools to the model for automatic execution.

## 4. Permission Model

Permission is not only a security prompt. In Praxis it is also product and architecture governance.

A permission policy answers:

```text
May this tool be shown to the model?
May this exact input be executed?
Does this require user approval?
What object does it affect?
What knowledge state will it create?
What trace must be recorded?
```

Two checks are required.

```text
Tool exposure filtering
  before the model call
  removes tools that are impossible in the current mode or policy

Execution permission check
  before the tool runs
  evaluates the concrete input and affected objects
```

## 5. Permission Modes

```ts
export type PermissionMode =
  | "read_only"
  | "plan_only"
  | "apply_limited"
  | "execute_guarded";
```

Mode rules:

```text
read_only
  may read graph, memory, docs and repo summary
  may call model
  may not create plan actions with side effects

plan_only
  may produce proposed actions
  may not apply mutations

apply_limited
  may write .distinction, graph, docs and task artifacts after approval
  may not modify existing source code in v0.1

execute_guarded
  future mode for shell, tests, web, browser, external agent execution
  must require explicit permission and visible command preview
```

## 6. Approval Request

```ts
export interface PermissionRequestView {
  id: string;
  title: string;
  description: string;

  actionType:
    | "apply_plan"
    | "write_memory"
    | "write_graph"
    | "write_docs"
    | "write_task"
    | "generate_task"
    | "import_task_result"
    | "run_external_agent"
    | "run_shell";

  riskLevel: ToolRiskLevel;
  affectedPaths: string[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  commandPreview?: string;

  options: Array<{
    id: "approve" | "reject" | "modify";
    label: string;
  }>;
}
```

Rules:

```text
1. Permission card must show affected objects before approval.
2. Shell or external command permission must show command preview.
3. Reject must append a transcript message and trace event.
4. Modify must return control to the composer with editable intent.
5. Approval must resume the same run or start a linked continuation run.
```

## 7. v0.1 Write Boundary

Allowed after approval:

```text
.distinction/chat/*
.distinction/memory/*
.distinction/graph/*
.distinction/runs/*
.distinction/tasks/*
docs/*
new project scaffold files during Create New Project
```

Denied in v0.1 unless the user explicitly leaves the v0.1 safety boundary:

```text
existing src/
existing tests/
build scripts
production configuration
git commit / push
arbitrary shell mutation
```

## 8. Tool Result Contract

Every tool result must be represented in three forms:

```text
runtime result
  typed output used by the loop

transcript view
  compact user-visible card or summary

trace event
  audit details for debugging and recovery
```

The transcript is allowed to be concise. Trace may be more detailed. Memory must only record durable product knowledge after the correct confirmation path.

## 9. Tool Discovery

Large tool sets should support deferred discovery.

```text
small core tool prefix
  stable tools used frequently

searchable extra tools
  not always included in model context

execute discovered tool
  invoked only after the model requests or user selects it
```

The goal is to reduce context pollution and preserve prompt cache stability.

## 10. Acceptance Criteria

```text
1. No write bypasses Tool Registry.
2. Tool exposure respects current permission mode.
3. Concrete tool execution checks affected paths and graph objects.
4. Permission prompts are visible and resumable.
5. Rejections and modifications are durable transcript events.
6. Shell / external commands are never invisible while waiting for approval.
7. Tool call cards show name, status, input summary, output summary and risk.
```

