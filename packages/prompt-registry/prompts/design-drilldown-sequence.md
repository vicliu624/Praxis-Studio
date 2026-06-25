## Sequence Diagram 下钻规则

Sequence Diagram 用于解释一个具体交互场景中的消息顺序。它不是完整调用图，也不是把代码调用链机械翻译成 UML。

## 适用条件

- Use Case 存在外部 actor、系统入口、应用服务、领域对象、端口、适配器或外部系统之间的关键交互。
- 一个 Sequence Diagram 只能覆盖一个明确 scenario。
- 如果存在主成功场景、回调、异步消息、失败补偿、超时重试、幂等冲突或外部系统拒绝等 materially different scenarios，必须输出多张 Sequence Diagram。

## 必须表达

- 外部 actor 或外部系统。
- 系统入口，例如 UI、API、CLI、message consumer、scheduled job。
- 应用服务或 use-case service。
- 关键领域对象、端口、策略或外部适配器。
- 关键返回、异常、事件或状态变化。
- 对分支使用 `alt` / `opt` / `loop` / `par`，不要把分支压成文字说明。

## 必须避免

- 不要把所有相关函数都塞进一张图。
- 不要把 repository/database 当作主要业务参与者，除非它对业务语义有解释价值。
- 不要只画同步 happy path 而遗漏已知回调、补偿、失败或重试。
- 不要用代码层调用顺序替代业务交互解释。

## Mermaid 要求

- `kind` 必须是 `sequence`。
- Mermaid 必须使用 `sequenceDiagram`。
- `mermaid` 字段必须是裸 Mermaid 源码字符串，第一行直接是 `sequenceDiagram`；禁止包含 ```mermaid、```、Markdown 标题、解释文字或 HTML。
- participant 名称应表达角色或结构职责，可以保留关键源码符号，但必须能解释业务协作。
- 如果仓库证据或已确认文档表明该交互跨越明确的层、模块、运行边界、外部系统边界或限界上下文，可以使用 Mermaid sequenceDiagram 支持的 `box ... end` 分组；分组名称必须来自工程真实边界，例如目录、包名、模块名、限界上下文、C4 container/component、运行节点或已确认文档。不要默认假设工程一定存在 UI / Application / Domain / Infrastructure 等分层；证据不足或工程没有清晰分层时，不要为了整齐强行分组。
- 使用 `box` 分组时，分组结束只能写 `end`。禁止写 `end box`，也禁止在 `sequenceDiagram` 中使用 `subgraph`。
- 使用分组的 sequence，参与者列表、消息时序和读图说明必须同步标注每个 participant 所属的真实工程边界，并说明这些边界来自哪些证据。不要只在 Mermaid 图中分组，而在文档文字里丢失边界语义。
- 如果用户指出当前 Sequence Diagram 缺少入口、通道分支、外部系统或层/模块边界，agent 必须主动回到仓库证据和相关 sibling UML 复核，能改则直接同步修改当前图和必要的兄弟图；不要要求用户提供证据路径。

## Coverage 要求

`coverage` 必须说明：

- `scenario`：这张图覆盖的具体交互场景，例如“主成功场景”“外部系统回调”“失败补偿”“超时重试”。
- `coveredUseCaseFlows`：覆盖 `mainSuccessScenario[x]`、`alternativeFlows[x]`、`failureFlows[x]` 中哪些路径。
- `boundary`：交互从哪个 actor/入口开始，到哪个可验证结果结束。
- `notCovered`：不覆盖的其他交互场景；复杂场景应拆成另一张 Sequence Diagram。
- `rationale`：为什么该交互场景需要单独解释。
- `implementationScope`：该交互场景实际落到的模块、入口、关键文件、代码锚点和不覆盖代码范围。不要列全量调用链，只列能解释当前消息顺序的最小必要锚点。
- `implementationScope` 必须从当前项目真实结构中归纳，不得默认 UI/Application/Domain/Infrastructure 分层；如果项目没有明确分层，就使用真实模块、包、服务、进程、限界上下文或 C4 Container 名称。

## Explanation 要求

必须输出 `explanation`，且四段不能雷同：

- `business`：说明该交互场景完成什么业务结果，参与方为什么需要按这个顺序协作。
- `uml`：说明读图方式：participant、同步/异步消息、返回、`alt/opt/loop/par`、异常或事件分别代表什么。
- `design`：说明该交互揭示的边界和协作责任，例如入口、应用服务、领域对象、端口、适配器、外部系统、回调或补偿如何分工。
- `implementation`：说明 `implementationScope` 中模块、入口、关键文件和代码锚点如何定位到这条交互的实现。

## 文档章节要求

Sequence Diagram 的文档不是通用 UML 说明。它必须能支撑交互场景、参与者 / 生命线、消息时序、同步 / 异步 / 回调、返回 / 异常 / 补偿、事务 / 幂等 / 重试边界、Sequence UML 读图说明、实现范围锚点和不覆盖场景这些章节。
