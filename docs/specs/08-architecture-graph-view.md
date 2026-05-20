# Architecture Graph View Specification

## 1. Purpose

Architecture views help users understand code structure, architecture boundaries, module responsibilities and dependencies.

They are inspired by C4 Model, UML and dependency graphs.

## 2. Views

```text
C4 Context View
  Shows system, user, external systems, model providers, filesystem, coding agents.

C4 Container View
  Shows desktop app, runtime CLI, packages, stores, providers, sidecars.

Component View
  Shows components inside a package or container.

Dependency View
  Shows package/module dependencies with evidence.

Symbol View
  Shows key types, interfaces, classes and functions when available.
```

## 3. Architecture nodes

```text
person
software_system
external_system
container
package
component
interface
class
type
function
file
store
adapter
tool
prompt
```

## 4. Architecture edges

```text
uses
calls
imports
exports
contains
persists_to
reads_from
writes_to
adapts_to
depends_on
forbidden_dependency
```

## 5. Minimum v0.1 behavior

For an existing TypeScript monorepo, Praxis must show:

```text
- apps/* as applications / containers
- packages/* as packages
- package responsibilities
- imports between @praxis/* packages
- dependency evidence from source files
- local memory persistence boundary
- model provider adapter boundary
- agent runtime boundary
```

## 6. Selection behavior

Selecting an architecture node must show:

```text
responsibility
source memory
confidence
evidence
incoming dependencies
outgoing dependencies
related files
related tasks
related decisions
```