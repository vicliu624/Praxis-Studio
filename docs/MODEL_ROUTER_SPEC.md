# Model Router Spec

## 1. 目标

Praxis Studio 默认使用 DeepSeek，但必须支持多模型。

目标：

```text
低成本任务用便宜模型
高风险架构任务用推理模型
代码施工交给外部 agent
隐私任务可走本地模型
```

---

## 2. Task Types

```ts
export type ModelTaskType =
  | "project.intake.analyze"
  | "project.create.requirements"
  | "project.create.architecture"
  | "project.create.graph"
  | "graph.node.explain"
  | "graph.edge.explain"
  | "graph.node.plan"
  | "graph.edge.plan"
  | "coding.task.generate"
  | "memory.summarize"
  | "report.generate";
```

---

## 3. 默认配置

```yaml
default_provider: deepseek

providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com
    api_key_env: DEEPSEEK_API_KEY

routes:
  project.intake.analyze:
    provider: deepseek
    model: deepseek-v4-pro
    reasoning: true
    reasoning_effort: medium

  project.create.requirements:
    provider: deepseek
    model: deepseek-v4-flash
    reasoning: false

  project.create.architecture:
    provider: deepseek
    model: deepseek-v4-pro
    reasoning: true
    reasoning_effort: medium

  graph.node.explain:
    provider: deepseek
    model: deepseek-v4-flash
    reasoning: false

  graph.edge.explain:
    provider: deepseek
    model: deepseek-v4-pro
    reasoning: true
    reasoning_effort: medium

  graph.edge.plan:
    provider: deepseek
    model: deepseek-v4-pro
    reasoning: true
    reasoning_effort: high

  coding.task.generate:
    provider: deepseek
    model: deepseek-v4-pro
    reasoning: true
    reasoning_effort: high

  memory.summarize:
    provider: deepseek
    model: deepseek-v4-flash
    reasoning: false
```

---

## 4. v0.1 Providers

必须实现：

```text
MockProvider
DeepSeekProvider
```

预留：

```text
OpenAIProvider
AnthropicProvider
GeminiProvider
OllamaProvider
ExternalAgentProvider
```

---

## 5. 无 API Key 行为

无 API Key 时：

```text
Open Existing Project 仍然可用
本地规则生成基础图谱
Chat 使用 MockProvider
Create New Project 可生成最小模板，但不能 AI 拆需求
```

有 API Key 时：

```text
AI 生成需求
AI 生成架构
AI 改进图谱
AI 解释节点/边
AI 生成 Plan
AI 生成 Coding Task
```
