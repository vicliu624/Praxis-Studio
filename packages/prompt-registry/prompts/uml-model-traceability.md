Traceability 用于连接不同 viewpoint 和 abstraction level 下的 Model。

允许使用的关系包括：

- Abstraction
- Trace
- Refine
- Realize

质量规则：

1. 组织/过程模型中的 UseCase、Activity 和业务概念，应通过 Trace / Refine 连接到软件结构模型中的 Component、Interface、Class 或 Interaction。
2. 软件结构模型中的 Component、Interface 和 Classifier，应通过 Realize 或 Deployment 连接到制品/部署模型。
3. C4 只能作为架构视角投影，必须声明 projectionOf。
4. 如果找不到对应关系，不要编造 trace，也不要把判断责任写给用户或后续 agent。应直接把该关系判定为“未建立”，写明当前缺少哪类证据，并把相关图保持为低置信候选或拆出为独立投影。
5. Trace 解释“为什么这两个模型元素相关”，不是简单的文件路径引用。
