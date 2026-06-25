## Class / Structural Collaboration Diagram 下钻规则

Class / Structural Collaboration Diagram 用于解释 Use Case 的结构承载方式。它不是全量类图、包结构图，也不是把目录下所有类都画出来。

## 适用条件

- Use Case 需要解释由哪些结构角色、接口、策略、端口、适配器、领域对象或应用服务承载。
- 一个图只覆盖一个 Use Case 的结构协作切片；如果存在多个独立协作机制，可以拆分多张。

## 优先包含

- Application Service / Use Case Service。
- Domain Object / Aggregate / Domain Service。
- Port / Interface。
- Adapter / Gateway / Repository。
- Strategy / Policy / Specification。
- Event / Command / Query。
- 关键 DTO 只有在它承载业务边界或外部契约时才加入。

## 必须表达

- 谁负责用例编排。
- 哪些对象承载业务规则。
- 哪些接口隔离外部系统或基础设施。
- 是否存在策略模式、端口适配器、工厂、状态模式、规格模式等设计模式。
- 哪些依赖是稳定设计关系，哪些只是实现细节。
- 如果用户指出候选类图遗漏策略实现、端口适配器或关键领域对象，agent 必须先自行探索仓库证据和 sibling UML，再决定是否修改当前图、Activity、Sequence 或 Use Case 文档；不要把“请提供证据路径”作为默认回复。

## 必须避免

- 不要把目录下所有类全部画进去。
- 不要把 DTO、Mapper、Repository 堆成技术结构图。
- 不要只画继承关系而不解释职责协作。
- 不要为了展示代码覆盖而扩大 Use Case 边界。
- 不要把只属于其他 Use Case 的对象混入当前结构切片；如果同一对象确实复用，必须说明它是共享支撑、策略族、端口或基础设施适配，并给出证据。

## Mermaid 要求

- `kind` 必须是 `class_collaboration`。
- Mermaid 必须使用 `classDiagram`。
- `mermaid` 字段必须是裸 Mermaid 源码字符串，第一行直接是 `classDiagram`；禁止包含 ```mermaid、```、Markdown 标题、解释文字或 HTML。
- 类名可以保留源码标识，但 title、summary、coverage、evidence summary 必须使用中文解释。
- 关系应优先表达职责依赖、接口实现、策略选择、端口适配或领域协作，不要只罗列属性。

## Coverage 要求

`coverage` 必须说明：

- `scenario`：这张图解释 Use Case 的哪个结构承载切片。
- `coveredUseCaseFlows`：该结构协作支撑 Use Case 的哪些路径或场景。
- `boundary`：图中哪些结构属于该切片，哪些结构故意排除。
- `notCovered`：不覆盖的全量类、无解释价值技术类、目录结构或其他 Use Case 的实现。
- `rationale`：为什么这些结构角色足以解释该 Use Case 的设计承载关系。
- `implementationScope`：该结构协作切片实际落到的模块、入口、关键文件、代码锚点和不覆盖代码范围。不要列全量类；只列能解释当前 Use Case 设计承载关系的最小必要锚点。

## Explanation 要求

必须输出 `explanation`，且四段不能雷同：

- `business`：说明这些结构角色共同承载哪个业务目标，以及哪些业务规则或约束需要被保护。
- `uml`：说明读图方式：类、接口、抽象、实现、依赖、组合/聚合、策略/端口/适配器关系分别代表什么。
- `design`：必须说明设计承载，而不只是描述类名。至少回答：谁编排 Use Case，谁承载领域规则，哪些接口隔离外部或基础设施，是否体现策略模式、端口适配器、工厂、状态、规格或其他设计模式，哪些依赖是稳定设计关系，哪些只是实现细节。
- `implementation`：说明 `implementationScope` 中模块、入口、关键文件和代码锚点如何定位该结构协作切片。

## 文档章节要求

Class / Structural Collaboration Diagram 的文档不是通用 UML 说明。它必须能支撑结构承载目标、协作角色清单、应用服务 / Use Case Service、领域对象 / 聚合 / 领域服务、Port / Interface、Adapter / Gateway / Repository、Strategy / Policy / Specification、Command / Query / Event、设计模式说明、稳定依赖关系、实现细节排除、Class Diagram 读图说明和实现范围锚点这些章节。它不是全量类图，也不是代码清单。
