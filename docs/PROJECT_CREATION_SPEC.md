# Project Creation Spec

## 1. Goal

Project Creation turns a real product story into a new project directory with use cases, requirements, architecture, a Development Graph, and docs-backed Project Memory.

`.distinction` may be generated as transitional runtime state for cache, trace, views and task handoff, but it is not the final project-memory authority.

It is not a template picker. It is the second required v0.1 product loop:

```text
Story Canvas
→ Interaction Agent
→ Use Case Diagram Review
→ Normalized design documents
→ Requirement Agent
→ Architecture Agent
→ Graph Generator
→ File Generator
→ Review
→ Apply
→ Development Graph Workspace
```

## 2. Wizard Flow

```text
Step 1 Story Canvas
Step 2 Use Case Diagram Review
Step 3 Project Type / Constraints
Step 4 Requirements Review
Step 5 Architecture & Design Views Review
Step 6 Generated Plan Review
Step 7 Apply
```

The user must review the story baseline before requirements and architecture generation.
The user must confirm the generated plan before files are written.

Project Creation must follow the design surface document rule:

```text
story and interaction candidates
  -> formatted, normalized, complete design docs
  -> Markdown and Semantic HTML design maps
  -> projected Use Case / Sequence / Collaboration views
  -> Design Explorer preview
```

The preview must not be backed only by UI state or `.distinction/views/**`.
If the preview renders Semantic HTML, that HTML must be generated or patched by the agent through governed document writes. Project Creation must not provide direct drawing, canvas editing or freeform DOM editing tools.

## 3. Project Types

v0.1 must support at least:

```text
documentation_first
tauri_desktop
```

`documentation_first` creates specs, graph, memory, and rules without application source code.

`tauri_desktop` may create a minimal Tauri skeleton, but v0.1 must not pretend to support every stack. Unsupported stacks should be recorded as assumptions or questions instead of silently generating unreliable code.

## 4. NewProjectPlan

```ts
export interface NewProjectPlan {
  projectName: string;
  story: string;
  productIdea: string;
  projectKind: ProjectKind;
  stack: string[];

  interaction: InteractionModelCandidate;
  requirements: RequirementItem[];
  architecture: ArchitectureComponentCandidate[];
  graph: DevelopmentGraph;

  files: GeneratedFile[];
  assumptions: GraphAssumption[];
  questions: GraphQuestion[];
}
```

All AI-generated actors, use cases, requirements, architecture components, graph nodes, and graph edges start as `candidate` or `inference`. User confirmation is required before writing confirmed memory.

## 5. Required Files

v0.1 must generate:

```text
README.md
docs/PRODUCT_SPEC.md
docs/INTERACTION_MODEL.md
docs/USE_CASES.md
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/decisions/README.md
docs/tasks/README.md
.distinction/project.json
.distinction/memory/candidates.jsonl
.distinction/models/interaction-model.json
.distinction/models/architecture-model.json
.distinction/views/design/use-case-list.json
.distinction/views/design/use-case-diagram.mmd
.distinction/views/architecture/component-view.json
.distinction/rules/ai-constraints.md
.distinction/memory/decisions.jsonl
```

The docs above are the durable Project Memory. The `.distinction` files are transition/runtime artifacts and must be rebuildable or explainable from docs and trace wherever possible.

When useful, it may also generate:

```text
.distinction/cache/projection-manifest.json
.distinction/memory/traces.jsonl
.distinction/memory/incidents.jsonl
.distinction/memory/do-not-repeat.jsonl
.distinction/rules/architecture.md
.distinction/rules/boundaries.md
.distinction/reports/project-creation.md
```

## 6. Agent Responsibilities

### Interaction Agent

Input:

```text
story
known actors
known external systems
non-goals
constraints
```

Output:

```text
InteractionModelCandidate
actors
external systems
use cases
use case relations
assumptions
questions
normalized design document patch
Use Case Diagram projection derived from that document
Semantic HTML design map patch when rich preview is requested
```

The Interaction Agent must not generate final requirements or architecture. It only structures the story and exposes uncertainty.

### Requirement Agent

Input:

```text
confirmed or reviewed story baseline
interaction model candidates
project type
stack preference
known constraints
```

Output:

```text
requirements
non-goals
assumptions
questions
```

### Architecture Agent

Input:

```text
reviewed story baseline
interaction model candidates
requirements
project type
stack preference
constraints
```

Output:

```text
architecture component candidates
responsibilities
dependencies
risks
questions
```

### Graph Generator

Input:

```text
interaction model candidates
requirements
architecture component candidates
generated docs
```

Output:

```text
DevelopmentGraphCandidate
node progress defaults
edge progress defaults
warnings
unresolved questions
```

### File Generator

Input:

```text
NewProjectPlan
confirmed output file list
target directory
```

Output:

```text
GeneratedFile[]
write report
trace event
```

## 7. Apply Boundary

Project Creation Apply may write only inside the new project directory selected by the user.

It must not write into an existing repository unless the user explicitly chooses that repository as the target and confirms merge behavior.

If the target directory already exists, v0.1 must use one of:

```text
abort
create timestamped sibling
enter merge review
```

It must not silently overwrite existing files.

## 8. Review UI

The review step must show:

```text
requirements
use cases and actors
architecture candidates
Design Explorer preview
Use Case Diagram preview
Development Graph preview
files to be generated
assumptions
questions
AI constraints
```

v0.1 may support only simple field editing. Full graph editing is not required for the first release.

## 9. Acceptance Criteria

```text
1. User describes a story in Story Canvas.
2. Agent generates Interaction Model candidates and a Use Case Diagram projection.
3. User reviews the story baseline and unresolved questions.
4. User chooses Documentation-first or Tauri Desktop and confirms constraints.
5. Agent generates requirements from the reviewed story baseline.
6. Agent generates architecture and design view candidates.
7. Agent generates Development Graph.
8. Praxis shows files, assumptions, Design Explorer preview and Development Graph preview before writing.
9. User confirms.
10. Praxis writes docs-backed Project Memory and transitional .distinction runtime state.
11. Praxis opens the new project in Development Graph Workspace with Design Explorer available.
12. Deleting `.distinction/cache/design/**` does not destroy the design baseline because Design Explorer can rebuild from docs.
13. Rich Design Explorer preview renders Semantic HTML when available, and that HTML is maintained by agent chat rather than UI drawing tools.
```
