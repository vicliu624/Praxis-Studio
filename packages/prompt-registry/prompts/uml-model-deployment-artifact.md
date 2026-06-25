制品 / 部署模型用于描述开发、部署和运行过程中使用或产生的物理信息项，以及它们被分配到哪些计算资源。

允许使用的 UML 元素包括：

- Artifact
- Node
- Device
- ExecutionEnvironment
- Deployment
- DeploymentSpecification
- CommunicationPath

质量规则：

1. Artifact 是开发、部署或运行过程中使用或产生的物理信息项。
2. Node 是可以部署 Artifact 以供执行的计算资源。
3. Deployment 表示把 Artifact 或 Artifact 实例分配给 DeploymentTarget。
4. 不要把普通源码目录直接当成部署节点。
5. 只有存在配置、构建、容器、脚本、CI、运行命令或部署文档证据时，才生成部署关系。
6. 必须说明部署关系对发布、运行、配置和故障定位的影响。
