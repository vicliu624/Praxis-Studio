# Development Graph Spec

## 1. 定位

Development Graph 是 Praxis Studio 的核心数据模型。

它表达：

```text
产品构想
需求
架构
模块
任务
代码
测试
风险
记忆
```

之间的关系。

树只能表达归属，图才能表达真实开发关系。

---

## 2. Node

节点表示开发过程中的对象。

```ts
export type DevelopmentNodeKind =
  | "product_intent"
  | "requirement"
  | "feature"
  | "architecture_component"
  | "task"
  | "code_unit"
  | "test_case"
  | "memory_event"
  | "risk"
  | "decision"
  | "document"
  | "project";
```

```ts
export interface DevelopmentNode {
  id: string;
  kind: DevelopmentNodeKind;
  title: string;
  description?: string;

  status: "draft" | "active" | "wip" | "blocked" | "done" | "stale" | "deprecated";
  progress: number;

  confidence: "low" | "medium" | "high";
  knowledgeKind: "fact" | "candidate" | "inference" | "confirmed";

  tags?: string[];
  evidence?: Evidence[];
  metadata?: Record<string, unknown>;
}
```

---

## 3. Edge

边表示节点之间的关系。边本身也是项目管理对象。

```ts
export type DevelopmentEdgeKind =
  | "contains"
  | "depends_on"
  | "constrains"
  | "implements"
  | "validates"
  | "impacts"
  | "blocks"
  | "records"
  | "derived_from"
  | "conflicts_with"
  | "replaces"
  | "temporary_for";
```

```ts
export interface DevelopmentEdge {
  id: string;
  source: string;
  target: string;
  kind: DevelopmentEdgeKind;
  title?: string;
  description?: string;

  status: "draft" | "active" | "wip" | "blocked" | "done" | "stale" | "deprecated";
  progress: number;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  blockedReason?: string;

  confidence: "low" | "medium" | "high";
  knowledgeKind: "fact" | "candidate" | "inference" | "confirmed";

  evidence?: Evidence[];
  metadata?: Record<string, unknown>;
}
```

---

## 4. Node Progress

节点进度表示模块或对象自身完成度。

示例：

```text
Requirement Engine    55%
Architecture Memory   42%
Local Knowledge       64%
Validation Layer      28%
```

进度来源必须记录：

```text
estimated_by_scan
estimated_by_agent
user_confirmed
verified_by_test
```

---

## 5. Edge Progress

边进度表示模块之间胶水、集成、约束传递、验证链路的完成度。

示例：

```text
Architecture Memory --records--> Local Knowledge    40%
Requirement Engine --constrains--> Agent Runtime    33%
Validation Layer --validates--> Requirement Engine  24%
```

边进度是 Praxis Studio 的关键差异化。很多项目失败不是因为模块没写，而是模块之间的胶水没有完成。

---

## 6. Graph Candidate

自动生成图谱不能直接成为事实。

```ts
export interface DevelopmentGraphCandidate {
  graph: DevelopmentGraph;
  generatedAt: string;
  source: "repository_scan" | "product_intent" | "ai_assisted" | "user_edited";
  confidence: "low" | "medium" | "high";
  assumptions: GraphAssumption[];
  warnings: GraphWarning[];
  unresolvedQuestions: GraphQuestion[];
}
```

用户确认后，候选图谱才能写入 `.distinction/memory/`、`.distinction/models/`，并投影到 `.distinction/views/`。

---

## 7. Views

第一版支持这些视图：

```text
Outline View
  看归属和层级。

Relations View
  看节点与节点之间的关系。

Progress View
  看节点进度和边进度。

Risk View
  看风险、阻塞和不合理耦合。

Memory View
  看图谱变化历史。
```

第一版 UI 可以先实现 Outline + Relations + Progress。
