# Agent Runtime Spec

## 1. 定位

Praxis Agent Runtime 是 Praxis Studio 的行动治理层。

它不等同于完整 coding agent。它负责：

```text
构造上下文
选择模型
加载 prompt
调用工具
生成解释
生成计划
生成任务
写入项目记忆
记录 trace
```

完整代码修改可以委派给外部 coding agent。

---

## 2. Runtime 的核心对象

Praxis Runtime 的目标对象不是文件，而是：

```text
project
node
edge
subgraph
plan
memory event
decision
coding task
```

---

## 3. Modes

### Explain Mode

只读解释。

```text
允许：
- read graph
- read memory
- build context
- call model
- produce explanation
- record trace

禁止：
- write graph
- write files
- create tasks
- run shell
```

### Plan Mode

生成计划。

```text
允许：
- read graph
- read memory
- call model
- produce plan
- produce proposed graph changes
- produce proposed tasks
- record trace

禁止：
- apply changes
- modify source code
```

### Apply Mode

有限应用。

v0.1 允许修改：

```text
.distinction/
docs/
tasks/
new project files
```

v0.1 禁止自动修改：

```text
existing src/
build scripts
test files
production config
```

### Execute Mode

v0.1 不默认启用。

未来可用于：

```text
run tests
invoke external coding agent
run shell command
git operation
```

---

## 4. Agentic Loop

```text
Input
  selected target + user instruction

Context Builder
  builds target-scoped context

Model Router
  selects provider and model

Prompt Registry
  loads prompt template

Model Provider
  returns structured output

Output Parser
  validates schema

Plan / Apply Controller
  decides whether mutation is allowed

Trace Recorder
  records all steps
```

---

## 5. Tool Registry

### ToolDefinition

```ts
export type ToolRiskLevel =
  | "read"
  | "plan"
  | "write_memory"
  | "write_docs"
  | "write_source"
  | "shell"
  | "network";

export interface ToolDefinition<Input, Output> {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  riskLevel: ToolRiskLevel;
  requiredMode: "explain" | "plan" | "apply" | "execute";
  isReadOnly: boolean;
  call(input: Input, context: ToolContext): Promise<Output>;
}

export interface ToolContext {
  projectRoot: string;
  traceId: string;
  mode: RuntimeMode;
  permissions: PermissionSet;
}
```

### v0.1 Tools

Project Intake tools:

```text
ScanRepositoryTool
ProfileProjectTool
GenerateGraphCandidateTool
WriteLocalKnowledgeTool
RenderProjectIntakeReportTool
```

Development Graph tools:

```text
ReadDevelopmentGraphTool
WriteDevelopmentGraphTool
UpdateNodeProgressTool
UpdateEdgeProgressTool
CreateNodeTool
CreateEdgeTool
CreateRiskNodeTool
CreateTaskNodeTool
```

Memory tools:

```text
CreateMemoryEventTool
CreateDecisionRecordTool
AppendChangeLogTool
AppendTraceTool
ReadAiConstraintsTool
ReadDoNotRepeatTool
```

Agent tools:

```text
BuildContextTool
GeneratePlanTool
GenerateCodingTaskTool
RenderCodingTaskMarkdownTool
```

预留但不默认启用：

```text
EditSourceFileTool
RunShellCommandTool
RunTestsTool
GitCommitTool
```

---

## 6. Context Builder

Context Builder 是 Runtime 质量的核心。

### Project Intake Context

```ts
interface ProjectIntakeContext {
  snapshotSummary: {
    name: string;
    languages: string[];
    manifests: string[];
    docs: string[];
    fileCount: number;
  };

  profile: ProjectProfile;
  moduleCandidates: ModuleCandidate[];
  importRelations: ImportRelationSummary[];
  readmeSummary?: string;

  rules: {
    factCandidateBoundary: string;
    noAstAssumption: string;
    graphGenerationPolicy: string;
  };
}
```

### Node Context

```ts
interface NodeContext {
  node: DevelopmentNode;
  incomingEdges: DevelopmentEdge[];
  outgoingEdges: DevelopmentEdge[];
  relatedNodes: DevelopmentNode[];
  progress: number;
  blockedReasons: string[];
  memoryEvents: MemoryEvent[];
  relevantRules: string[];
}
```

### Edge Context

```ts
interface EdgeContext {
  edge: DevelopmentEdge;
  sourceNode: DevelopmentNode;
  targetNode: DevelopmentNode;
  progress: number;
  blockedReason?: string;
  riskLevel: RiskLevel;
  relatedTasks: DevelopmentNode[];
  relatedMemoryEvents: MemoryEvent[];
  relevantRules: string[];
}
```

---

## 7. Prompt Registry

Prompts 不允许散落在代码中。

目录：

```text
packages/prompt-registry/prompts/
  project-intake-analyze.md
  project-create-requirements.md
  project-create-architecture.md
  graph-node-explain.md
  graph-edge-explain.md
  graph-edge-plan.md
  coding-task-generate.md
  memory-summarize.md
```

每个 prompt 必须声明：

```text
role
input schema
output schema
rules
forbidden behavior
```

---

## 8. Trace

每次 Runtime 行动必须记录 Trace。

```ts
interface TraceEvent {
  id: string;
  traceId: string;
  timestamp: string;
  kind:
    | "project.opened"
    | "repository.scanned"
    | "profile.generated"
    | "context.built"
    | "model.called"
    | "plan.generated"
    | "task.generated"
    | "graph.updated"
    | "memory.recorded"
    | "permission.denied";

  target?: {
    type: "project" | "node" | "edge" | "subgraph";
    id?: string;
  };

  summary: string;
  data?: Record<string, unknown>;
}
```

写入：

```text
.distinction/memory/traces.jsonl
```

---

## 9. 从 Claude Code Best 吸收什么

可以吸收：

```text
agentic loop 思路
tool registry 结构
权限分级
model provider adapter
trace / monitoring 事件结构
CLI 组织方式
MCP / ACP adapter 边界
```

不要吸收：

```text
Claude Code 兼容逻辑
反编译相关代码
登录/账号相关逻辑
远程控制默认能力
与 Praxis Development Graph 无关的复杂功能
```

Praxis Runtime 必须围绕 Development Graph 重写。

---

## 10. Runtime Agents

v0.1 的 Agent Runtime 对外表现为多个受治理 agent，但它们共享同一条 runtime loop、tool registry、model router、prompt registry 和 trace recorder。

```text
Project Intake Agent
  基于 RepositorySnapshot 和 ProjectProfile 生成 DevelopmentGraphCandidate、warnings、questions 和风险候选。

Project Creation Agent
  基于产品构想生成 requirements、architecture candidates、Development Graph、docs 和 .distinction。

Graph Chat Agent
  绑定选中的 node / edge / subgraph，解释职责、关系、进度、风险和缺口。

Plan Agent
  生成图谱变更计划、记忆事件候选、决策候选和 coding task 候选。

Coding Task Agent
  把已确认或待确认 plan 转为 CodingAgentTask。
```

这些 agent 都不能绕过 Tool Registry 写文件或改图谱。

---

## 11. Plan-to-Apply Boundary

Praxis Plan 不是普通文本。Plan item 必须能落到受控动作之一：

```text
create_node
create_edge
update_node_progress
update_edge_progress
create_memory_event
create_decision
create_coding_task
write_report
```

v0.1 Apply 只能执行：

```text
.distinction writes
docs writes
task markdown writes
new project file writes
```

v0.1 Apply 必须拒绝：

```text
existing source edits
build script edits
production config edits
test execution loops
git commit / PR
```

每次拒绝都要记录 `permission.denied` trace。
