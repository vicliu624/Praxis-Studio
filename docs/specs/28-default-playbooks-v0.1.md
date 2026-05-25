# Default Playbooks v0.1

## 1. Purpose

`17-opinionated-governance-playbooks.md` defines the general playbook system.

This document defines the initial v0.1 default mapping so the runtime has an executable starting catalog instead of only abstract principles.

---

## 2. Default Mapping Table

```text
layer_violation
  -> restore-layer-boundary

circular_dependency
  -> break-cycle-through-port

package_dependency_cycle
  -> break-cycle-through-port

god_module
  -> split-responsibility-by-reason-to-change

task_without_acceptance_criteria
  -> add-acceptance-criteria

projection_stale
  -> regenerate-or-invalidate-projection

candidate_used_as_confirmed
  -> downgrade-or-confirm-memory

agent_context_drift
  -> rebuild-context-boundary
```

---

## 3. v0.1 Playbook Summaries

### restore-layer-boundary

Use when:

```text
dependency evidence crosses a confirmed or likely layer boundary
```

Recommended default:

```text
conservative
record finding evidence
clarify boundary in memory/spec
generate staged task for port/adapter or dependency inversion
```

### break-cycle-through-port

Use when:

```text
package or component dependency cycle is observed
```

Recommended default:

```text
conservative
name the responsibilities on both sides
identify the smallest reversible boundary cut
propose interface / port / adapter extraction as the preferred direction
```

### split-responsibility-by-reason-to-change

Use when:

```text
one module changes for multiple unrelated reasons
```

Recommended default:

```text
conservative
cluster responsibilities
write memory/spec distinctions
create follow-up split tasks before source edits
```

### add-acceptance-criteria

Use when:

```text
a task exists without testable completion conditions
```

Recommended default:

```text
conservative
derive acceptance from related memory/spec/model
write plan patch
refresh project-plan projections
```

### regenerate-or-invalidate-projection

Use when:

```text
projection manifest says stale or source links are missing
```

Recommended default:

```text
conservative
mark affected views stale explicitly
regenerate if inputs are available
otherwise keep failure visible and traceable
```

### downgrade-or-confirm-memory

Use when:

```text
candidate or inference records are being treated as confirmed truth
```

Recommended default:

```text
conservative
downgrade usage immediately
surface confirmation task or review question
repair dependent projections after confirmation state is fixed
```

### rebuild-context-boundary

Use when:

```text
agent behavior drifts outside ContextPacket scope
```

Recommended default:

```text
conservative
pause expansion
explain drift evidence
rebuild ContextPacket
request approval before widening scope
```

---

## 4. Expected User Intervention Points

The initial playbook bundle should consistently expose these kinds of intervention:

```text
confirm distinction
rename concept
choose strength
accept risk
approve plan
scope override
defer task
mark false positive
```

---

## 5. Artifact Expectations

v0.1 default playbooks should typically emit combinations of:

```text
memory_patch
model_patch
spec_patch
plan_patch
coding_task
detector_rerun
projection_invalidation
trace_event
```

v0.1 defaults remain conservative:

```text
prefer memory/spec/model/task correction before source modification
```

---

## 6. Acceptance Criteria

This default bundle is implemented when:

```text
1. Core v0.1 findings can map to a concrete playbook id.
2. Each mapped playbook recommends one default path.
3. Runtime can surface intervention points consistently.
4. Detector rerun or projection refresh is part of the expected closure.
```
