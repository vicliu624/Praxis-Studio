## Activity Diagram 下钻规则

Activity Diagram 用于解释 Use Case 的业务流程覆盖，不是函数调用流程、页面事件流水账或 repository 调用顺序。

## 适用条件

- Use Case 存在可观察业务流程、主路径、分支、失败路径、补偿路径或决策点。
- 如果 Use Case 已经成立，默认需要 Activity Diagram；如果证据不足以画完整流程，必须缩小 coverage、降低 confidence 或拆分为更小的流程片段。不要把完整性判断推给用户或后续 agent。
- 如果一个 Activity Diagram 无法清楚覆盖所有重要业务路径，应拆分多张 Activity Diagram，并在 coverage 中说明每张图覆盖哪一段。

## 必须表达

- 明确的开始点和结束点。
- 主成功路径。
- 至少一个关键决策点、备选路径、失败路径、补偿点或待确认缺口。
- 业务动作，而不是底层技术动作。
- 必要时用 `subgraph` 区分 Actor、System、External System 或关键业务阶段。

## 必须避免

- 不要把 Controller / Service / Repository 的调用顺序画成 Activity。
- 不要只画一条直线 happy path 后声称覆盖完成。
- 不要把 UI 点击、数据库写入、DTO 转换等技术细节当作业务活动。
- 不要为覆盖仓库而画全局大流程。
- 不要把证据不足写成“等待用户确认后补全流程”；当前文档必须直接说明已覆盖范围、不覆盖范围和置信度。

## Mermaid 要求

- `kind` 必须是 `activity`。
- Mermaid 必须使用 `flowchart`。
- `mermaid` 字段必须是裸 Mermaid 源码字符串，第一行直接是 `flowchart`；禁止包含 ```mermaid、```、Markdown 标题、解释文字或 HTML。
- 节点命名应使用稳定 ASCII id，节点标签必须能被业务用户理解。
- 节点 id 禁止使用 Mermaid 关键字或保留词，例如 `end`、`class`、`style`、`click`、`subgraph`、`direction`、`flowchart`、`graph`。开始和结束节点请使用 `startNode`、`endNode`、`successNode`、`failedEndNode` 这类 ASCII id；中文只能放在节点标签里。

## Coverage 要求

`coverage` 必须说明：

- `scenario`：这张图覆盖的业务流程场景。
- `coveredUseCaseFlows`：覆盖 `mainSuccessScenario[x]`、`alternativeFlows[x]`、`failureFlows[x]` 中哪些路径。
- `boundary`：流程边界，说明从哪里开始、到哪里结束。
- `notCovered`：不覆盖的流程、技术细节或待拆分场景。
- `rationale`：为什么这张 Activity Diagram 是必要的，或为什么需要拆成这张图。
- `implementationScope`：该流程实际落到的工程模块、入口、关键文件、代码锚点和不覆盖代码范围。Activity Diagram 不是代码覆盖率；只记录能帮助后续定位流程实现的最小必要锚点。

## Explanation 要求

必须输出 `explanation`，且四段不能雷同：

- `business`：用业务语言说明这条流程服务的目标、参与者、触发、成功结果、失败或补偿意义。
- `uml`：说明读图方式：开始/结束、活动节点、决策节点、分支、失败或补偿节点分别代表什么。
- `design`：说明该流程如何划分业务阶段，哪些决策点是领域规则，哪些路径应拆成独立图或等待确认。
- `implementation`：说明 `implementationScope` 中模块、入口、关键文件和代码锚点如何对应这条业务流程。

## 文档章节要求

Activity Diagram 的文档不是通用 UML 说明。它必须能支撑业务流程目标、流程边界、参与泳道 / 阶段、主成功路径、决策点与分支、失败 / 补偿路径、流程业务规则、Activity UML 读图说明、实现范围锚点和不覆盖范围这些章节。
