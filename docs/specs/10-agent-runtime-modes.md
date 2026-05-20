# Agent Runtime Modes Specification

## 1. Modes

```text
explain
plan
apply
execute
```

## 2. Explain

Purpose:

```text
Explain selected memory, model, graph node, graph edge, spec section or task.
```

Allowed:

```text
read memory
read models
read specs
read views
read source files
build context
```

Forbidden:

```text
write memory
write specs
write source
run shell
apply plan
```

## 3. Plan

Purpose:

```text
Generate candidate plan actions from selected context.
```

Allowed:

```text
read
write candidate plan
write trace
write candidate memory if explicitly marked CANDIDATE
select governance playbook
write candidate remediation recommendation
```

Forbidden:

```text
modify existing source
run shell without approval
commit changes
```

## 4. Apply

Purpose:

```text
Apply user-approved changes to memory, specs, views, tasks or new project skeleton.
```

Allowed in v0.1:

```text
.distinction/memory/**
.distinction/models/**
.distinction/specs/**
.distinction/tasks/**
.distinction/reports/**
new project skeleton files during Create New Project
```

Forbidden in v0.1:

```text
automatic modification of existing source code
unapproved shell execution
git commit
```

## 5. Execute

Reserved for future controlled external coding agent execution.

v0.1 must not expose unrestricted execute mode.

## 6. Projection Side Effects

Agent modes may trigger projection changes. These side effects must happen through runtime events, memory/model/task mutation, and projection invalidation. They must not directly treat graph views as source of truth.

```text
Explain:
  may update trace graph only.
  may not create confirmed memory.
  may not change architecture or plan projections except by marking trace activity.

Plan:
  may create candidate memory and candidate plan nodes.
  may select an opinionated governance playbook for a finding.
  may recommend one remediation path and user intervention points.
  must update project plan view as candidate state.
  must mark affected projections stale when candidate plans depend on changing memory or models.

Apply:
  may confirm memory/model/spec/task changes after approval.
  must invalidate and regenerate affected graph projections.
  must write trace for each approved mutation.

Execute:
  future mode.
  must stream trace and task progress into live graph views.
  must not mark task progress confirmed without event source and user-confirmation path.
```

The mode boundary is also a live projection boundary. A run can make the workspace visibly change, but only through allowed event effects.
