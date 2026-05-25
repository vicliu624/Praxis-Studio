# Project Creation Spec

## 1. Goal

Project Creation turns a real product intent into a new project directory with requirements, architecture, a Development Graph, docs, and `.distinction` memory.

It is not a template picker. It is the second required v0.1 product loop:

```text
Product Intent
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
Step 1 Product Intent
Step 2 Project Type
Step 3 Stack Preference
Step 4 Generated Plan Review
Step 5 Apply
```

The user must confirm the generated plan before files are written.

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
  productIdea: string;
  projectKind: ProjectKind;
  stack: string[];

  requirements: RequirementItem[];
  architecture: ArchitectureComponentCandidate[];
  graph: DevelopmentGraph;

  files: GeneratedFile[];
  assumptions: GraphAssumption[];
  questions: GraphQuestion[];
}
```

All AI-generated requirements, architecture components, graph nodes, and graph edges start as `candidate` or `inference`. User confirmation is required before writing confirmed memory.

## 5. Required Files

v0.1 must generate:

```text
README.md
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
.distinction/project.json
.distinction/memory/candidates.jsonl
.distinction/models/architecture-model.json
.distinction/views/architecture/component-view.json
.distinction/rules/ai-constraints.md
.distinction/memory/decisions.jsonl
```

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

### Requirement Agent

Input:

```text
product intent
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
architecture candidates
Development Graph preview
files to be generated
assumptions
questions
AI constraints
```

v0.1 may support only simple field editing. Full graph editing is not required for the first release.

## 9. Acceptance Criteria

```text
1. User enters a product intent.
2. User chooses Documentation-first or Tauri Desktop.
3. Agent generates requirements.
4. Agent generates architecture.
5. Agent generates Development Graph.
6. Praxis shows files and assumptions before writing.
7. User confirms.
8. Praxis writes docs and .distinction.
9. Praxis opens the new project graph in Development Graph Workspace.
```
