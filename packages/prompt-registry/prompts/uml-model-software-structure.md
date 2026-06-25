软件结构模型用于描述软件如何模块化、如何通过接口协作，以及哪些结构承载业务能力。

允许使用的 UML 元素包括：

- Package
- Component
- Interface
- Port
- Connector
- Class
- Property
- Operation
- Interaction
- Activity
- StateMachine

质量规则：

1. Package 是模型元素组织和命名空间，不等同于代码目录。
2. Component 是封装内容、可替换的模块化系统部分；必须说明其提供/需要的 Interface 或协作契约。
3. Class Diagram 必须围绕明确的结构切片或上下文，不得按顶层 layer、目录或内部扫描指标粗暴聚合。
4. Interaction 必须来自真实调用、消息、异步、回调或运行时协作证据；不要把 import/reference 画成 Sequence。
5. 不要把方法级热点、工具节点 ID 或原始关系计数放进类图主节点；如果必须表达关系压力，要转写成可理解的复用迹象、外部协作迹象和变更影响。
6. 每个结构对象都要说明职责、边界、关系意义、变更影响和可下钻原因。
