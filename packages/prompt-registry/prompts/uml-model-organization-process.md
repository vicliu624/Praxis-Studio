组织 / 过程模型用于描述组织、业务过程、参与者和可观察结果。

允许使用的 UML 元素包括：

- Actor
- UseCase
- Activity
- Class
- Association
- StateMachine
- Interaction

质量规则：

1. UseCase 描述 subject 能够执行并为 Actor 或 stakeholder 产生可观察结果的行为。
2. UseCase 不描述 subject 的内部结构。
3. Activity 解释业务流程、决策点、失败路径和并行/同步语义。
4. Interaction 解释业务参与者、系统和外部系统之间可观察的信息交换。
5. Class 可以表示客户、订单、合同、商品等现实世界概念；必须说明其业务语义，而不是代码路径。
6. 如果某个结构来自代码实现但没有业务语义解释，不要放入组织/过程模型。
