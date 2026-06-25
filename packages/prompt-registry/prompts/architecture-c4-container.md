C4 Container 用来解释“目标软件系统内部由哪些应用、服务、数据存储、可运行单元或可部署单元组成”。

Container 是 C4 的静态结构缩放层级，不是普通 package、目录、代码 layer、共享库或职责标签。只有具备运行入口、部署/构建配置、服务接口、数据存储、应用入口、独立执行或清晰运行时边界证据时，才可以进入 Container 层。

## 必须解释

- 这个边界为什么达到 Container 层，而不是普通目录、普通 package、代码 layer、共享库或临时代码集合。
- Container 的主要责任、输入、输出、持久化对象、外部依赖、运行入口和运行/构建/部署形态。
- Container 与其他 Container 的关系意义：调用、依赖、共享契约、插件、适配、数据流或配置。
- Container 与业务能力的关系：它承载、编排、暴露还是支撑业务能力。
- 进入 Component 层时应该关注哪些内部职责。

## 不要做

- 不要只列依赖数量。
- 不要把每个 package 都无条件认定为 Container。
- 不要把 `domain-layer`、`application-layer`、`infra-*`、`plugins`、`packages/*`、`libs/*`、`modules/*` 按名称直接认定为 Container；如果缺少运行、部署、接口或数据存储证据，应留在软件结构模型，而不是 C4 Container。
- 不要把 `.github`、README/CHANGELOG/AGENTS/CLAUDE、根目录配置文件、docs/doc/documentation、test/tests/integration-test、scripts、target/dist/build/coverage 等仓库治理、文档、测试或构建产物认定为 Container；它们只能作为证据、制品或部署材料被引用。
- 不要把 Container Diagram 画成全量目录树。
- 不要把 C4 Container 当作业务能力或业务场景；业务场景应由组织/过程模型解释。
