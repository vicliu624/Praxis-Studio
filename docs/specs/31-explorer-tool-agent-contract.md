# Explorer Tool Agent Contract

## 1. Purpose

Design Explorer, Engineering Explorer and Architecture Explorer are document-backed design surfaces. Their right-side agents are not passive chat assistants and not suggestion-only models.

They are scoped tool agents whose job is to:

```text
read the current document and selected semantic anchor
read linked project documents
use local repository evidence when code facts are relevant
decide whether the user request implies a persistent document change
write governed Markdown / Semantic HTML document patches
keep related documents consistent
surface only genuinely human decisions as questions
```

The UI is a projection. The durable authority is the normalized docs set plus Git history.

## 2. Core Distinction

Valid distinction:

```text
Explorer Agent
  a scoped document tool agent that can read evidence and produce governed docs patches.

External Coding Agent
  a worker that may later modify source code from a reviewed plan.

Explorer UI
  a projection and interaction shell over project documents.

Project Memory
  the complete docs set and its Git version timeline.
```

Invalid distinction:

```text
Do not treat an Explorer Agent as a Q&A model.
Do not treat documentEdits as optional suggestions when the user explicitly asks for a correction.
Do not ask the user to provide code evidence that the agent can inspect itself.
Do not let the UI become the authority for diagram state.
Do not modify source code from Explorer discussion agents in v0.1.
```

## 3. Shared Rule

Every Explorer discussion agent must obey this rule:

```text
If the answer can be determined from current UML/C4/Engineering document,
linked docs, local repository evidence, source excerpts or existing project memory,
the agent must decide and act.

If acting means changing design, engineering or architecture meaning,
the agent must emit governed document patches for the corresponding docs tree.

The agent may ask questions only when the missing information is genuinely
human-owned product meaning, boundary judgment, confirmation status or governance preference.
```

This means the following user requests are not questions for the user:

```text
"这里漏了一个实现"
"这不是一个类，而是一个策略模式"
"这个图混入了错误的包"
"当前 sequence 没有体现回调"
"这个 C4 Container 边界不对"
```

For these, the agent must inspect available evidence and either:

```text
produce documentEdits
or report the exact evidence gap and mark affected documents for agent-side follow-up
```

It must not respond with:

```text
请提供代码路径
代码中是否确实存在这个类
是否需要同步兄弟图
如果存在，请告诉我
```

## 4. Scope By Explorer

Design Explorer agent:

```text
Allowed writes: docs/design
Primary focus: current Use Case / Activity / Sequence / State Machine / Class Collaboration document
Linked scope: parent Use Case, sibling UML, design maps, design changelog
Forbidden: source code edits, generic project chat, new story intake from detail page
```

Engineering Explorer agent:

```text
Allowed writes: docs/engineering
Primary focus: technical complexity diagrams and selected technical anchors
Linked scope: package, component, class/structural, sequence/runtime, deployment and hotspot documents
Forbidden: business-story confirmation, C4-only architecture decisions, source code edits
```

Architecture Explorer agent:

```text
Allowed writes: docs/architecture
Primary focus: C4 System Context, Container, Component and Code View documents
Linked scope: C4 maps, related engineering documents and architecture changelog
Forbidden: business-flow authoring, hotspot治理 as primary task, source code edits
```

## 5. Evidence Contract

Runtime must provide Explorer agents with:

```text
current document Markdown and HTML excerpts
selected semantic anchor payload
map/index excerpts
linked document excerpts where available
local repository evidence nodes and relationships
source excerpts around relevant symbols
allowed write roots
document edit protocol
```

The agent response must expose:

```text
what it changed
which documents were touched
which linked documents were reviewed or need follow-up
which evidence supported the correction
which risks remain candidate/inference
which questions truly require human decision
```

## 6. Runtime Direction

The current v0.1 bridge may apply JSON `documentEdits` returned by a model call. That is a compatibility implementation detail.

The target runtime is:

```text
Explorer UI conversation
  -> scoped tool-agent runner
  -> read/search/list/source-preview tools
  -> governed docs write tools
  -> trace and progress events
  -> projection invalidation / live document refresh
  -> version decision / project plan linkage when persistent change exists
```

The product concept must remain the same during migration:

```text
Explorer discussion agents are tool agents.
They do not merely advise; they maintain the docs-backed project memory inside their scope.
```
