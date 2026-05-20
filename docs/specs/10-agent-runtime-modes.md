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