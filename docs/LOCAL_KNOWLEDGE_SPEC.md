# Local Knowledge Spec

## 1. 定位

`.distinction/` 是项目内可版本化的长期开发记忆。

它保存：

```text
Development Graph
Project Memory
Agent Trace
Architecture Rules
AI Constraints
Coding Tasks
Reports
```

---

## 2. v0.1 目录结构

```text
.distinction/
├─ graph/
│  ├─ nodes.json
│  ├─ edges.json
│  ├─ progress.json
│  └─ views.json
│
├─ memory/
│  ├─ changes.md
│  ├─ decisions.md
│  ├─ traces.jsonl
│  ├─ incidents.json
│  └─ do-not-repeat.md
│
├─ rules/
│  ├─ architecture.md
│  ├─ boundaries.md
│  └─ ai-constraints.md
│
├─ tasks/
│  └─ TASK-0001.md
│
├─ reports/
│  ├─ project-intake.md
│  └─ graph-plan.md
```

---

## 3. 写入规则

```text
1. 如果 .distinction 不存在，初始化。
2. 如果 .distinction 已存在，不得盲目覆盖。
3. v0.1 可以做 backup-and-write。
4. 所有 Apply 必须写 trace。
5. 所有 Agent 生成内容默认不是 confirmed。
6. 用户确认后才能写入 confirmed memory。
```

---

## 4. Memory Files

### changes.md

记录需求、架构、图谱、任务、进度变化。

### decisions.md

记录被用户确认的重要设计决策。

### traces.jsonl

记录所有 Runtime 行为。

### do-not-repeat.md

记录用户纠正过的 AI 错误和项目禁忌。

### incidents.json

记录架构事故、耦合风险、失败修复。

---

## 5. 与 Git 的关系

`.distinction` 应该默认可提交到 Git。

但以下内容未来可考虑忽略：

```text
cache
temporary traces
large model logs
local secrets
```

模型供应商凭证属于 Praxis Studio IDE 级设置，不属于项目 `.distinction` 记忆。
