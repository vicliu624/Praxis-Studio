## State Machine Diagram 下钻规则

State Machine Diagram 只用于解释有证据支持的关键业务对象生命周期。没有生命周期证据时不要输出。

## 允许输出的证据条件

至少需要出现以下证据之一：

- 明确状态字段。
- 明确状态枚举。
- 明确状态迁移事件。
- 文档中描述对象生命周期。
- 代码中存在状态机、状态模式、审批流、业务流程状态、任务流或其它明确的生命周期语义。
- 测试中验证状态迁移。

## 必须表达

- 被建模的业务对象名称。
- 初始状态。
- 关键稳定状态。
- 触发迁移的事件。
- 必要的 guard / condition。
- 成功终态或失败终态。
- 非法迁移或待确认迁移必须进入 questions。

## 必须避免

- 不要把页面 loading/error/success 状态当作业务状态机。
- 不要把临时技术执行状态当作业务生命周期。
- 不要只有两个普通状态也硬画状态机。
- 不要在没有证据时虚构状态字段、状态枚举或状态迁移。

## Mermaid 要求

- `kind` 必须是 `state_machine`。
- Mermaid 必须使用 `stateDiagram-v2`。
- `mermaid` 字段必须是裸 Mermaid 源码字符串，第一行直接是 `stateDiagram-v2`；禁止包含 ```mermaid、```、Markdown 标题、解释文字或 HTML。
- 状态名称必须表达业务状态，而不是 UI 状态或技术过程状态。

## Coverage 要求

`coverage` 必须说明：

- `scenario`：这张图覆盖哪个业务对象的生命周期。
- `coveredUseCaseFlows`：该生命周期解释了 Use Case 的哪些主路径、备选路径或失败路径。
- `boundary`：生命周期从哪个业务状态开始，到哪些终态或稳定状态结束。
- `notCovered`：不覆盖的对象、页面状态、技术状态或未确认迁移。
- `rationale`：说明支持画状态机的证据；如果没有证据，不应输出该图。
- `implementationScope`：状态字段、状态枚举、状态迁移事件、handler、领域对象或测试实际落到的模块、关键文件、代码锚点和不覆盖代码范围。没有这些证据时不要输出状态机。

## Explanation 要求

必须输出 `explanation`，且四段不能雷同：

- `business`：说明被建模对象在业务生命周期中解决什么问题，哪些状态对用户或业务结果有意义。
- `uml`：说明读图方式：初始状态、稳定状态、事件、guard、终态、非法迁移或待确认迁移分别代表什么。
- `design`：说明状态机如何约束领域对象生命周期、事件处理、非法迁移、补偿或失败终态，避免把 UI 状态或技术执行状态混入业务状态。
- `implementation`：说明 `implementationScope` 中模块、状态字段/枚举、迁移事件、handler、测试或代码锚点如何定位该状态机实现。

## 文档章节要求

State Machine Diagram 的文档不是通用 UML 说明。它必须能支撑被建模的业务对象、状态证据、初始状态、稳定状态、状态迁移事件、Guard / Condition、终态、非法 / 待确认迁移、状态不变量 / 设计约束和 State Machine UML 读图说明这些章节。
