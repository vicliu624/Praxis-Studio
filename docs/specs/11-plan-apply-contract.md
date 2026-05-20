# Plan / Apply Contract Specification

## 1. Purpose

Plan creates candidate changes. Apply writes approved changes.

Plan must never mutate authoritative memory or source code without user confirmation.

## 2. GraphPlan

```ts
export interface GraphPlan {
  id: string;
  summary: string;
  missingGluePoints: MissingGluePoint[];
  actions: PlanAction[];
  codingTasks: CodingTaskDraft[];
  questions: string[];
}
```

## 3. PlanAction types

```text
create_memory_record
confirm_memory_record
mark_memory_stale
create_model_element
update_model_element
create_spec_section
update_spec_section
create_graph_projection
create_task
create_coding_task
select_governance_playbook
recommend_remediation
write_report
```

## 4. Apply rules

```text
1. Apply requires user approval.
2. Apply must record trace.
3. Apply must append memory change record.
4. Apply must not modify existing source code in v0.1.
5. Apply must report all skipped actions.
6. Apply must preserve source memory IDs.
7. Apply must not convert a governance recommendation into confirmed memory without explicit approval.
```

## 5. Coding task generation

`create_coding_task` only writes `.distinction/tasks/TASK-xxxx.md` in v0.1.

It must not automatically invoke external coding agents.
