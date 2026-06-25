# Design Explorer Specification

## 1. Purpose

Design Explorer is the story-first design entry for Praxis Studio.

It exists because code structure diagrams are not enough for a design-driven IDE. A class list can show implementation shape, but it cannot reliably show:

```text
- which business stories the system serves
- which actors and external systems participate
- how one use case flows through controllers, services, domain objects, events and adapters
- which class collaborations carry a design pattern
- which parts are FACT, CANDIDATE, INFERENCE or CONFIRMED memory
```

Design Explorer must not become a generic diagram gallery. It is the user-facing surface for understanding and governing design stories.

---

## 2. Distinction Contract

### 2.1 Current Confusions

```text
Class diagram != design understanding
Mermaid diagram != source of truth
Call graph != business sequence
Route list != use case model
Package/module name != bounded context
Design pattern label != confirmed design fact
.distinction view != design authority
```

### 2.2 Valid Distinctions

```text
Story / use case
  explains what world change the system supports.

Interaction Model
  stores actors, use cases, entry points, confirmation points and failure paths.

Design Model
  stores sequence candidates, class collaboration candidates and pattern candidates.

UML / Mermaid / graph views
  are projections from documented models and docs-backed Project Memory.

Formatted design documents
  are the durable, maintainable source for design-facing surfaces.

Agent discovery
  produces CANDIDATE / INFERENCE.

User confirmation
  produces CONFIRMED design memory.
```

### 2.3 Invalid Distinctions

```text
Do not let AI write final UML views as authority.
Do not treat recovered stories from an existing project as confirmed intent.
Do not treat a use case diagram as the model itself.
Do not treat a static call edge as a full sequence step without interpretation and evidence.
Do not claim a design pattern is present without participant roles and source evidence.
Do not display a design surface that cannot be traced back to a normalized document section.
```

---

## 3. Document Authority Rule

Design Explorer follows the Praxis design surface rule:

```text
formatted, normalized, complete project documents
  -> parsed Interaction / Design / Architecture source models
  -> Markdown and Semantic HTML design maps
  -> projected graph, Mermaid and HTML views
  -> Design Explorer UI
```

Therefore, Design Explorer must not use `.distinction/views/**`, `.distinction/cache/**` or ad hoc UI state as the authority for any story, diagram, pattern or timeline. Those files may accelerate loading, preserve trace and support migration, but the user-maintainable source is the project documentation network.

Every design document that feeds Design Explorer should provide:

```text
stable title and ID
status and confidence
human-readable explanation
machine-readable block or parseable table when needed
evidence links
changelog / timeline
links to related design sections
maintenance or invalidation notes
```

The first concrete design map is:

```text
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
```

Future Sequence Diagram, Class Collaboration Diagram and Pattern Map surfaces must follow the same docs-first rule instead of becoming separate `.distinction` authorities.

Markdown is the clean document form. Semantic HTML is the rich interactive map form. Design Explorer should render Semantic HTML when available and fall back to Markdown/Mermaid rendering only when HTML has not been generated yet.

Semantic HTML must follow:

```text
docs/specs/29-semantic-design-html.md
```

Design Explorer must not provide drawing tools, direct DOM editing tools or canvas authoring for this HTML. The HTML is maintained through agent chat and governed DOM patches only.

Explorer agent behavior must follow:

```text
docs/specs/31-explorer-tool-agent-contract.md
```

The Design Explorer detail-page agent is a scoped document tool agent. When a user points out a wrong diagram, missing strategy implementation, incomplete sequence, incorrect state transition or weak explanation, the agent must use the current UML document, linked design documents and local repository evidence to decide whether to patch `docs/design`. It must not ask the user to provide code evidence that the runtime can inspect.

---

### 3.1 Agent-Governed Version Rule

Design Explorer changes are versioned project changes, not loose UI edits.

Praxis uses Semantic Versioning for design-affecting changes, but the version number is decided by the agent workflow rather than typed by the user.

```text
user describes story / correction / design operation
  -> scoped agent classifies whether a real persistent change exists
  -> Design Version Decision Agent decides major / minor / patch / none
  -> runtime writes normalized docs/design artifacts with the version decision
  -> one atomic git commit records the corresponding project and design change
  -> Design Explorer renders the docs-backed changelog timeline
```

Version responsibility:

```text
Agent
  decides the Semantic Versioning bump and next version
  explains the applied SemVer rule
  proposes the atomic commit scope and commit summary

User
  confirms or corrects business meaning, compatibility risk and scope
  does not manually choose x.y.z

Runtime
  validates that nextVersion matches the selected bump
  persists the version decision into docs/design Markdown and Semantic HTML
  keeps .distinction derivatives rebuildable from docs
```

SemVer policy for Praxis design changes:

```text
MAJOR
  incompatible actor boundary, system boundary, core story responsibility,
  public API, command, data contract or persisted memory contract change

MINOR
  backward-compatible new story, Use Case Diagram, actor, external system,
  supported flow, design capability or rich design layer

PATCH
  backward-compatible fix, clarification, evidence update, explanation layer,
  diagram layout correction or non-behavioral documentation change

NONE
  rejected input, insufficient story, pure discussion or no persistent change
```

Every version change must correspond to one atomic git commit. A single commit must not mix unrelated stories, fixes, style work and architectural changes under one version bump. If a user request contains multiple unrelated changes, the agent must split it into multiple versioned tasks before writing.

### 3.2 Semantic Diff Explanation Rule

The timeline exists because raw `git diff` is too low-level for the product surface.

Git remains the factual version ledger, but Design Explorer must not force users to understand project evolution by reading patches, hunks, file paths and line changes. Even programmers often need extra work to reconstruct business meaning from a raw diff.

Design Explorer therefore renders a semantic explanation of the atomic commit:

```text
raw git diff
  -> factual changed files, hunks and commit hash
  -> agent explanation of the product / design / code meaning
  -> docs-backed changelog entry
  -> user-readable timeline in Design Explorer
```

This explanation layer is not a replacement for Git. It is a governed, docs-backed interpretation of Git history that lowers the threshold for understanding change.

Each versioned timeline entry should answer:

```text
what changed in product or design language
why the change was made
which story / use case / diagram / design anchor changed
whether the change is MAJOR, MINOR, PATCH or NONE
why that SemVer level was selected
what the atomic commit boundary is
which docs/code artifacts changed
what a user should inspect next if they need more detail
```

The raw git commit and branch remain visible so the explanation can be traced back to Git. However, the primary reading experience is the agent-authored semantic explanation, not the raw diff.

The timeline must not degrade into:

```text
commit list only
file list only
raw patch viewer
generic changelog with no design anchors
agent summary that cannot be traced back to a git commit
```

The Design Explorer left timeline must expose:

```text
program semantic version
git branch
git commit
dirty / clean state when rendered
change type
agent version decision reason
atomic commit scope / summary when available
semantic diff explanation
changed design anchors
changed artifacts
```

### 3.3 Agent Conversation Projection Rule

The user-facing "agent thinking" surface is not a loading label and not a Design Explorer-only widget. It is a shared projection of the agent conversation and runtime event stream.

Praxis pages that run or scope an agent conversation should render the same event vocabulary:

```text
user message
assistant message
command run
tool call
file edit
validation
permission request
plan
final summary
error
```

Design Explorer uses this surface in two places:

```text
missing docs / Design Discovery generation
  shows the generation transcript while docs are being recovered and persisted

story / diagram side conversation
  shows the scoped user-agent conversation for creating, explaining or governing a story / Use Case Diagram
```

Praxis Assistant uses the same surface for its project / node / edge-bound transcript. Individual pages may map their runtime data into the shared event vocabulary, but they must not create separate ad hoc "thinking" components that hide commands, validation failures, permission requests or file writes.

The transcript may be backed by polling if the provider/runtime cannot stream token-level model output yet. In that case, the UI should still expose all durable intermediate events produced by the runtime rather than freezing behind a single "generating" message.

---

## 4. Product Placement

Praxis has two design-entry modes:

```text
Create New Project
  → Story Canvas
  → Use Case Diagram Review
  → Requirements / Architecture / Graph generation

Open Existing Project
  → Design Discovery
  → Use Case Diagram List
  → User confirmation / correction
  → Design Explorer
```

The main workspace must expose a top-level tab:

```text
Design Explorer
```

For existing projects, the first screen of this tab is:

```text
Use Case Diagrams
```

This is a list of recovered or confirmed design stories. It is not one global diagram.

---

## 5. Existing Project: Use Case Diagram List

When opening an existing project, Praxis must recover candidate design stories from the repository and docs-backed Project Memory.

The Design Explorer first screen shows a list:

```text
Design Explorer
└─ Use Case Diagrams
   ├─ <Context or Story A>
   ├─ <Context or Story B>
   └─ <Context or Story C>
```

Each list item must show:

```text
title
summary
status: candidate | confirmed | stale | conflicted | rejected
confidence: low | medium | high
actors
external systems
use case count
sequence diagram count
class collaboration count
pattern candidate count
evidence count
open question count
last generated / stale reason
```

Opening a list item shows:

```text
Overview
Use Case Diagram
Sequence Diagrams
Class Collaboration Diagrams
Pattern Candidates
Code UML
Evidence
Questions
```

The list exists to prevent a large existing project from collapsing into an unreadable global use case diagram.

---

## 6. New Project: Story Canvas

For new projects, the first user input must be a story, not a stack choice or requirements table.

The first screen is:

```text
Story Canvas
```

It contains:

```text
story input
Use Case Diagram projection
agent conversation bound to the current story / use case / actor / relation
open questions
candidate changes
```

The user describes:

```text
who is involved
what they are trying to accomplish
what the system changes in the world
which external systems participate
what failure or exception paths matter
what is out of scope
```

Agent output must update the Interaction Model as CANDIDATE. The Use Case Diagram is regenerated from that model. The user does not edit Mermaid directly.
The user also does not directly draw or edit Semantic HTML. The user selects a semantic HTML element, talks with the agent, and the agent proposes a governed document patch.

Praxis must not proceed to requirements or architecture generation until a story baseline has been reviewed.

---

## 7. Design Discovery Inputs

For existing projects, Design Discovery may read:

```text
README / docs / ADR / API docs
routes / controllers / CLI commands / UI pages
application services / command handlers / use case services
domain services / aggregates / entities / state machines
events / event handlers / projection handlers
repositories / ports / adapters
tests / fixtures / scenario names
package and module boundaries
docs-backed Project Memory
.distinction memory, models, traces and findings as legacy mirrors or runtime evidence
CodeFactGraphSnapshot nodes and edges
```

Evidence strength must be explicit:

```text
route + application service + domain event + docs
  → stronger use case evidence

class name only
  → weak capability evidence

table name or DTO only
  → insufficient to define a use case
```

---

## 8. Interaction Model

The Interaction Model is the source model for Use Case Diagram projections.

```ts
export interface InteractionModel {
  schemaVersion: "praxis.interactionModel.v1";
  root: string;
  generatedAt: string;
  contexts: DesignContextCandidate[];
  actors: ActorCandidate[];
  externalSystems: ExternalSystemCandidate[];
  useCases: UseCaseCandidate[];
  relations: UseCaseRelationCandidate[];
  questions: DesignQuestion[];
}
```

Required candidate fields:

```text
id
title
summary
status: candidate | confirmed | stale | conflicted | rejected
confidence: low | medium | high
sourceMemoryIds
sourceModelIds
sourceSpecPaths
sourceCodeFactIds
evidence
questions
```

Use case relations include:

```text
actor_participates
includes
extends
depends_on
triggers
conflicts_with
out_of_scope_for
```

---

## 9. Design Model

The Design Model connects stories to execution and implementation design.

```ts
export interface DesignModel {
  schemaVersion: "praxis.designModel.v1";
  root: string;
  generatedAt: string;
  sequences: SequenceCandidate[];
  classCollaborations: ClassCollaborationCandidate[];
  patternCandidates: DesignPatternCandidate[];
}
```

### SequenceCandidate

Represents the execution view of one use case.

Required fields:

```text
id
useCaseId
title
participants
steps
status
confidence
evidence
openQuestions
```

Each step must distinguish:

```text
FACT call / reference / route / event
INFERENCE framework dispatch / callback / async relation
CANDIDATE business step name
```

### ClassCollaborationCandidate

Represents the class/interface collaboration that carries a use case or design concern.

Required fields:

```text
id
useCaseId
title
participants
relations
responsibilities
status
confidence
evidence
```

It must not include every class in a module. It includes only design-relevant participants.

### DesignPatternCandidate

Represents a possible design pattern.

Required fields:

```text
id
patternName
context
participants
roleMapping
evidence
confidence
status: candidate | confirmed | rejected | stale
```

A pattern candidate is valid only when it identifies participant roles, not just a class name.

Examples of supported pattern names:

```text
Strategy
Factory
Repository
Adapter
Observer / Event Handler
CQRS
Event Sourcing
Template Method
State
```

---

## 10. Projections

Design Explorer uses these projected views:

```text
design.use_case_list
design.use_case_diagram
design.activity
design.sequence
design.state_machine
design.class_collaboration
design.pattern_map
```

The durable design map has two docs-backed forms:

```text
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
docs/design/use-case-diagrams/<story-id>.md
docs/design/use-case-diagrams/<story-id>.html
docs/design/use-case-diagrams/<story-id>/activity.md
docs/design/use-case-diagrams/<story-id>/sequences/*.md
docs/design/use-case-diagrams/<story-id>/state-machines/*.md
docs/design/use-case-diagrams/<story-id>/realization/*.md
```

The map Markdown document must include a fixed Use Case Diagram Index whose entries link to each independent Use Case Diagram document. It is an index / map, not the full body of every story.
Each independent Use Case Diagram Markdown document is the clean, diff-friendly story document for one candidate or confirmed story.
Each independent Use Case Diagram HTML document is the rich semantic rendering for that story.
Each first-level drilldown document is a docs-backed explanation of one Use Case slice. Drilldown diagrams are not fixed-count decorations. They are generated according to coverage need:

```text
Activity Diagram -> business flow, branches, failure paths and decisions
Sequence Diagram -> one concrete interaction scenario; multiple sequence diagrams are allowed
State Machine Diagram -> only when lifecycle/state-transition evidence exists
Class / Structural Collaboration Diagram -> structural collaboration slice, not a full class diagram
```

Every drilldown diagram must declare coverage:

```text
scenario
coveredUseCaseFlows
boundary
notCovered
rationale
```

This coverage contract prevents a single coarse diagram from masquerading as complete Use Case explanation.
The map Semantic HTML document may expose the same objects as selectable DOM anchors and render richer layers for explanation, evidence, risk, code mapping, timeline, questions and annotations.

These documents are the authority for the Use Case Diagram list, individual story documents and rich design map; `.distinction/cache/design/interaction-model-candidate.json` is only a machine-readable derivative.

All generated human-readable design documents must be Chinese by default. JSON keys, enum values, file paths, class names, function names, command names and code excerpts may keep their original language.

Projections may then produce Semantic HTML, Mermaid or graph JSON:

```text
docs/design/use-case-diagrams-maps.html
docs/design/use-case-diagrams/<story-id>.html
.distinction/views/design/use-case-list.json
.distinction/views/design/<context-id>/use-case-diagram.mmd
.distinction/views/design/<use-case-id>/sequence.mmd
.distinction/views/design/<use-case-id>/class-collaboration.mmd
.distinction/views/design/<context-id>/pattern-map.json
```

Projection output must preserve:

```text
sourceMemoryIds
sourceModelIds
sourceSpecPaths
sourceCodeFactIds
sourceTraceIds
confidence
status
stale reason
```

Runtime entry points:

```text
praxis-runtime design:discover --root <project>
praxis-runtime design:discover --root <project> --candidate <interaction-model.json>
praxis-runtime project:view design --root <project>
```

The first command asks the Design Discovery agent to produce and persist the design map:

```text
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
docs/design/use-case-diagrams/<story-id>.md
docs/design/use-case-diagrams/<story-id>.html
```

The same flow also refreshes `.distinction/cache/design/interaction-model-candidate.json` as a machine-readable cache derived from the docs map.
The second command uses the same docs-first persistence/projection path for imported agent output.
The third command is deterministic: it reads `docs/design/use-case-diagrams-maps.md` and/or `docs/design/use-case-diagrams-maps.html` when present and rebuilds Design Explorer projections without calling a model.

When Design Story Intake accepts a new story, the runtime must call:

```text
design.version_decision
```

before writing the updated design documents. The version decision is persisted into the Markdown metadata, Use Case changelog, Map changelog and Semantic HTML `data-praxis-*` attributes.

---

## 11. User Corrections

Users must correct models, not diagrams.

Allowed actions from the Use Case Diagram List:

```text
confirm story
rename story
split story
merge stories
reject story
mark as technical workflow
mark as external system capability
request more evidence
open graph-bound chat
```

Allowed actions from a diagram node or edge:

```text
correct actor
correct external system
move use case to another context
mark relation wrong
add missing failure path
mark sequence step as inferred / wrong
reject pattern candidate
confirm pattern candidate
ask agent to explain selected HTML anchor
ask agent to add candidate explanation layer
ask agent to confirm or reject an explanation layer
ask agent to add evidence / risk / code mapping layer
```

Every correction becomes a patch:

```text
InteractionModelPatch
DesignModelPatch
DocumentPatch
MemoryPatch
Projection invalidation
```

The accepted correction must update the normalized design document first, then rebuild `.distinction/cache/**` and `.distinction/views/**` from that document.

For Semantic HTML, corrections and explanations must be applied through agent-produced governed DOM patches. Design Explorer may select anchors and request changes, but must not directly mutate the document.

---

## 12. Status and Authority

Design Explorer must visibly separate:

```text
FACT
  directly scanned code, route, symbol, event, call or document evidence

INFERENCE
  agent interpretation of framework dispatch, callback, use case meaning or design role

CANDIDATE
  waiting for user confirmation

CONFIRMED
  accepted docs-backed Project Memory or model state with a document home

STALE
  sources changed after projection

CONFLICTED
  docs, code, memory or trace disagree
```

The UI must never present a recovered use case or pattern as confirmed unless user confirmation exists.
The UI must also expose the document source path or section anchor for every design surface. If a surface is shown from migration cache only, it must be labeled as migration/cache-derived and not durable.
When rendering Semantic HTML, the UI must preserve `data-praxis-*` attributes so selected DOM elements can be passed back to the agent as semantic anchors.

---

## 13. Acceptance Criteria

For an existing project:

```text
1. Project Intake discovers candidate design stories.
2. Design Explorer appears as a top-level tab.
3. The first Design Explorer screen is a Use Case Diagram list.
4. Each list item exposes evidence, confidence, status and open questions.
5. Opening a list item shows Use Case Diagram, Sequence, Class Collaboration, Pattern Candidates, Code UML, Evidence and Questions.
6. User corrections create model/memory patches, not direct diagram edits.
7. Confirmed stories become docs-backed Project Memory and invalidate affected projections.
8. Use Case Diagram list is parseable from `docs/design/use-case-diagrams-maps.md`.
9. Design Explorer can rebuild its design projections after `.distinction/cache/design/**` is deleted.
10. Design Explorer renders `docs/design/use-case-diagrams-maps.html` when present.
11. Users can select semantic DOM anchors in the HTML and ask the agent for scoped explanation.
12. Agent explanations are persisted as governed Semantic HTML managed blocks, not UI state.
13. Design Explorer does not provide direct drawing or freeform DOM editing tools.
```

For a new project:

```text
1. Create New Project starts with Story Canvas.
2. Agent turns the story into Interaction Model candidates.
3. Use Case Diagram is projected while the user talks with the agent.
4. User reviews the story baseline before requirements and architecture generation.
5. Requirements, architecture, graph and generated files remain downstream of the story baseline.
6. Generated design surfaces are backed by normalized docs before they appear in Design Explorer.
```
