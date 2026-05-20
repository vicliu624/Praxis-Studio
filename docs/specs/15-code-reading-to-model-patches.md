# Code Reading to Model Patches Specification

## 1. Purpose

Praxis must support AI-assisted UML, architecture and Gantt updates without allowing AI to directly edit graph views.

The correct chain is:

```text
AI reads code
→ produces MemoryPatch / ModelPatch / PlanPatch
→ Praxis validates patch
→ user confirms or patch enters CANDIDATE state
→ Praxis updates .distinction/memory and .distinction/models
→ Projection Engine regenerates UML / C4 / dependency / Gantt views
→ UI refreshes live projections
```

The wrong chain is:

```text
AI reads code
→ AI directly writes Mermaid / UML / Gantt view cache
→ UI displays AI-authored diagram
```

AI must not directly edit:

```text
.distinction/views/architecture/component-view.json
.distinction/views/architecture/dependency-view.json
.distinction/views/architecture/class-diagram.mmd
.distinction/views/project-plan/gantt.json
.distinction/views/project-plan/task-graph.json
```

Those files are projection cache, not source of truth.

## 2. Layer Rule

Praxis separates three layers.

```text
Memory Layer
  records facts, inferences, candidates and confirmations produced from code reading, static analysis, user confirmation and runtime events

Model Layer
  organizes memory into UML, architecture and plan models

View Layer
  projects models into Mermaid, React Flow, PlantUML, Gantt JSON and other UI artifacts
```

Source of truth:

```text
.distinction/memory/*.jsonl
.distinction/models/*.json
confirmed specs and rules
```

Derived projection cache:

```text
.distinction/views/**/*.json
.distinction/views/**/*.mmd
.distinction/reports/*.md
```

## 3. Patch Types

AI and static analysis must produce structured patches.

```ts
export type PraxisPatch =
  | RepositoryUnderstandingPatch
  | MemoryPatch
  | ArchitectureModelPatch
  | UmlModelPatch
  | PlanModelPatch;
```

Patch lifecycle:

```text
proposed
→ validated
→ rejected | accepted_as_candidate | confirmed
→ applied_to_memory_or_model
→ projections_invalidated
→ projections_regenerated
```

AI may propose patches. Praxis validates them. User confirmation is required before a patch creates CONFIRMED memory.

## 4. RepositoryUnderstandingPatch

`RepositoryUnderstandingPatch` is produced by static analysis or AI-assisted code reading.

```ts
export interface RepositoryUnderstandingPatch {
  patchId: string;
  source: "static_analysis" | "agent_code_reading";
  scannedPaths: string[];
  memoryRecords: MemoryRecordDraft[];
  architectureHints: ArchitectureHint[];
  planHints: PlanHint[];
  questions: ClarificationQuestion[];
}
```

Static analysis should produce FACT memory. AI-assisted code reading should produce INFERENCE or CANDIDATE memory.

Example:

```json
{
  "patchId": "patch:understand:agent-loop:001",
  "source": "agent_code_reading",
  "scannedPaths": [
    "packages/agent-loop/src/index.ts",
    "packages/tool-registry/src/index.ts"
  ],
  "memoryRecords": [
    {
      "kind": "INFERENCE",
      "type": "component_responsibility",
      "subject": "packages/agent-loop",
      "predicate": "owns",
      "object": "governed agent execution loop",
      "summary": "packages/agent-loop appears to own model/tool iteration, permissions, compaction and run persistence.",
      "confidence": "medium",
      "evidence": [
        {
          "source": "packages/agent-loop/src/index.ts",
          "summary": "Defines AgentLoop, AgentRun, AgentStep, context compaction and tool execution."
        }
      ]
    }
  ],
  "architectureHints": [
    {
      "type": "component",
      "componentId": "component:packages/agent-loop",
      "name": "Agent Loop",
      "responsibility": "Governed model/tool execution loop"
    }
  ],
  "planHints": [],
  "questions": []
}
```

## 5. ArchitectureModelPatch

`ArchitectureModelPatch` updates the architecture model that C4, component and dependency views are projected from.

```ts
export interface ArchitectureModelPatch {
  patchId: string;
  targetModel: "architecture-model";
  operations: ArchitectureOperation[];
}

export type ArchitectureOperation =
  | UpsertSystem
  | UpsertContainer
  | UpsertComponent
  | UpsertInterface
  | UpsertDependency
  | MarkArchitectureElementStale
  | AddArchitectureRisk;
```

Architecture operations must include stable IDs, source paths and source memory IDs.

Example:

```json
{
  "patchId": "patch:arch:001",
  "targetModel": "architecture-model",
  "operations": [
    {
      "op": "upsert_component",
      "id": "component:agent-loop",
      "name": "AgentLoop",
      "containerId": "package:packages/agent-loop",
      "responsibility": "Runs model/tool loop, permission handling, compaction and run persistence.",
      "sourcePaths": ["packages/agent-loop/src/index.ts"],
      "sourceMemoryIds": ["mem:inference:agent-loop:responsibility"],
      "confidence": "medium"
    },
    {
      "op": "upsert_dependency",
      "id": "dep:agent-loop:tool-registry",
      "source": "component:agent-loop",
      "target": "package:tool-registry",
      "relation": "uses",
      "sourcePaths": ["packages/agent-loop/src/index.ts"],
      "knowledgeKind": "FACT"
    }
  ]
}
```

## 6. UmlModelPatch

UML requires symbol-level structure: packages, classes, interfaces, types, functions, methods, fields and relations.

```ts
export interface UmlModelPatch {
  patchId: string;
  targetModel: "uml-model";
  operations: UmlOperation[];
}

export type UmlOperation =
  | UpsertPackage
  | UpsertClass
  | UpsertInterface
  | UpsertType
  | UpsertFunction
  | UpsertMethod
  | UpsertField
  | UpsertAssociation
  | UpsertImplementation
  | UpsertCallRelation;
```

Example:

```json
{
  "patchId": "patch:uml:agent-loop:001",
  "targetModel": "uml-model",
  "operations": [
    {
      "op": "upsert_class",
      "id": "class:packages/agent-loop:AgentLoop",
      "name": "AgentLoop",
      "packageId": "package:packages/agent-loop",
      "sourcePath": "packages/agent-loop/src/index.ts",
      "visibility": "exported",
      "sourceMemoryIds": ["mem:fact:agent-loop:class:AgentLoop"]
    },
    {
      "op": "upsert_method",
      "id": "method:packages/agent-loop:AgentLoop.run",
      "classId": "class:packages/agent-loop:AgentLoop",
      "name": "run",
      "signature": "run(options: AgentLoopOptions): Promise<AgentLoopResult>",
      "sourcePath": "packages/agent-loop/src/index.ts"
    },
    {
      "op": "upsert_interface",
      "id": "interface:packages/agent-loop:AgentLoopOptions",
      "name": "AgentLoopOptions",
      "sourcePath": "packages/agent-loop/src/index.ts"
    },
    {
      "op": "upsert_association",
      "id": "assoc:AgentLoop:AgentLoopOptions",
      "source": "class:packages/agent-loop:AgentLoop",
      "target": "interface:packages/agent-loop:AgentLoopOptions",
      "relation": "uses_as_parameter"
    }
  ]
}
```

Mermaid is generated from `UmlModel`. Mermaid is not AI's authoritative output.

## 7. PlanModelPatch

Gantt and task dependency views are projected from `PlanModel`.

```ts
export interface PlanModelPatch {
  patchId: string;
  targetModel: "plan-model";
  operations: PlanOperation[];
}

export type PlanOperation =
  | UpsertGoal
  | UpsertMilestone
  | UpsertTask
  | UpsertTaskDependency
  | UpdateTaskStatus
  | UpdateTaskProgress
  | AddBlocker
  | LinkTaskToArchitecture
  | LinkTaskToSpec
  | LinkTaskToSourcePaths;
```

AI may propose task dependencies, blockers and progress suggestions. User confirmation is required before confirmed task progress is written.

## 8. Static Analysis vs AI

Static analysis produces FACT.

```text
file exists
class exists
interface exists
function exists
method signature
import relation
export relation
extends / implements
call expression
symbol reference
```

AI produces INFERENCE or CANDIDATE.

```text
component responsibility
architectural layer
boundary interpretation
dependency risk
missing specification
task dependency candidate
progress suggestion
```

The runtime must not let AI mark generated knowledge as FACT or CONFIRMED.

## 9. Core Models

### UmlModel

```ts
export interface UmlModel {
  id: string;
  packages: UmlPackage[];
  classes: UmlClass[];
  interfaces: UmlInterface[];
  types: UmlType[];
  functions: UmlFunction[];
  relations: UmlRelation[];
  updatedAt: string;
}

export interface UmlClass {
  id: string;
  name: string;
  packageId?: string;
  sourcePath: string;
  exported: boolean;
  methods: UmlMethod[];
  fields: UmlField[];
  sourceMemoryIds: string[];
  confidence: "low" | "medium" | "high";
}

export interface UmlRelation {
  id: string;
  source: string;
  target: string;
  kind:
    | "extends"
    | "implements"
    | "uses"
    | "creates"
    | "calls"
    | "depends_on"
    | "has_field"
    | "returns"
    | "accepts_parameter";
  sourceMemoryIds: string[];
  evidence: Evidence[];
}
```

### ArchitectureModel

```ts
export interface ArchitectureModel {
  id: string;
  systems: ArchitectureSystem[];
  containers: ArchitectureContainer[];
  components: ArchitectureComponent[];
  interfaces: ArchitectureInterface[];
  dependencies: ArchitectureDependency[];
  risks: ArchitectureRisk[];
  updatedAt: string;
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  kind:
    | "ui"
    | "runtime"
    | "domain"
    | "storage"
    | "infrastructure"
    | "adapter"
    | "model_provider"
    | "tooling";
  responsibility: string;
  containerId?: string;
  sourcePaths: string[];
  sourceMemoryIds: string[];
  knowledgeKind: "FACT" | "INFERENCE" | "CANDIDATE" | "CONFIRMED";
  confidence: "low" | "medium" | "high";
}
```

### PlanModel

```ts
export interface PlanModel {
  id: string;
  goals: PlanGoal[];
  milestones: Milestone[];
  tasks: PlanTask[];
  dependencies: TaskDependency[];
  blockers: Blocker[];
  updatedAt: string;
}

export interface PlanTask {
  id: string;
  title: string;
  status:
    | "draft"
    | "ready"
    | "in_progress"
    | "blocked"
    | "result_imported"
    | "verified"
    | "done"
    | "cancelled";
  progress: number;
  dependsOn: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  relatedMemoryIds: string[];
  relatedSpecPaths: string[];
  relatedArchitectureNodeIds: string[];
  relatedSourcePaths: string[];
  forbiddenPaths: string[];
  assignedAgent?: "manual" | "claude-code" | "codex" | "praxis-agent";
}
```

## 10. Patch Validation

All patches must be validated before application.

Validation checks:

```text
stable IDs are present
sourceMemoryIds exist
sourcePaths exist
relation source/target exists
FACT records have concrete evidence
AI does not write CONFIRMED memory
AI does not write FACT memory
progress is between 0 and 1
task dependencies do not form cycles
view cache files are not direct patch targets
```

Rejected patches must be traceable.

## 11. Diff Preview

Before applying AI-generated patches, Praxis should show a preview:

```text
added components
added dependencies
modified responsibilities
marked stale records
added tasks
added task dependencies
progress suggestions
affected projections
```

User options:

```text
Accept all
Accept selected
Reject
Ask revise
```

Accepting a patch as CANDIDATE does not make it CONFIRMED.

## 12. Code Change to UML Update

During construction, source changes should update UML through facts and patches.

```text
changed files
→ SymbolExtractor re-runs on changed files
→ SymbolSnapshot generated
→ SymbolDiff generated
→ FACT memory updated
→ related INFERENCE / CANDIDATE memory marked stale
→ UML model patched
→ UML / class diagram projections invalidated
→ projection engine regenerates affected views
```

`SymbolDiff` example:

```json
{
  "changedPaths": ["packages/agent-loop/src/index.ts"],
  "addedSymbols": [
    {
      "kind": "interface",
      "id": "interface:AgentLoopEvent",
      "name": "AgentLoopEvent",
      "path": "packages/agent-loop/src/index.ts"
    }
  ],
  "removedSymbols": [],
  "changedSymbols": [
    {
      "id": "class:AgentLoop",
      "changedMethods": ["run"]
    }
  ],
  "changedImports": [
    {
      "path": "packages/agent-loop/src/index.ts",
      "added": ["@praxis/memory-store"],
      "removed": []
    }
  ]
}
```

## 13. Task Result to Gantt Update

Gantt updates come from task state and result evidence, not direct AI editing.

Triggers:

```text
TaskStarted
TaskProgressSuggested
TaskResultImported
VerificationPassed
VerificationFailed
ApplyApproved
BlockerCreated
BlockerResolved
```

External results should create candidate progress memory first:

```json
{
  "kind": "CANDIDATE",
  "type": "task_progress_update",
  "subject": "TASK-001",
  "predicate": "progress_suggested",
  "value": 0.65,
  "summary": "External agent result suggests TASK-001 is 65% complete.",
  "evidence": [
    {
      "source": "TASK-001.result.json",
      "summary": "Changed projection model and typecheck passed."
    }
  ]
}
```

Only after user confirmation may `PlanModel.tasks[TASK-001].progress` be updated.

## 14. Projection Engine Outputs

The projection engine may produce:

```text
UML Mermaid from UmlModel
C4 / component / dependency views from ArchitectureModel
Task graph / Gantt view from PlanModel
Trace graph from runtime events
```

Projection functions must be deterministic with respect to input models and projection options.

Example:

```ts
function projectPlanToGantt(model: PlanModel): GanttView {
  return {
    id: "view:project-plan:gantt",
    generatedAt: new Date().toISOString(),
    tasks: model.tasks.map((task) => ({
      id: task.id,
      name: task.title,
      status: task.status,
      progress: task.progress,
      dependencies: task.dependsOn,
      relatedSourcePaths: task.relatedSourcePaths,
      relatedArchitectureNodeIds: task.relatedArchitectureNodeIds
    }))
  };
}
```

## 15. Minimum Implementation Path

Do not start with full UML.

Step 1:

```text
FACT-based dependency diagram
packages
imports
dependencies
source evidence
```

Step 2:

```text
AI responsibility summary
package responsibility
component boundary candidate
risk candidate
```

Step 3:

```text
UML-like symbol view
class
interface
type
function
method
relation
```

Gantt minimum path:

```text
spec sections → task list
AI proposes task dependencies
runtime events / external result → progress candidate
user confirmation → gantt update
```

## 16. Negative Rules

Praxis must not:

```text
let AI directly edit graph view cache
let Mermaid / PlantUML / Gantt JSON become authoritative truth
write CONFIRMED memory from AI output
write FACT memory from AI inference
accept model patches without source evidence
accept task progress without event source
apply task dependency cycles
hide patch validation failures
```

## 17. Acceptance Criteria

This mechanism is implemented when:

```text
1. AI code reading produces RepositoryUnderstandingPatch / ModelPatch / PlanPatch, not view files.
2. Static analysis produces FACT symbol/import memory.
3. AI produces only INFERENCE / CANDIDATE memory.
4. Patch validation rejects missing evidence and invalid dependencies.
5. UML is projected from UmlModel.
6. Architecture views are projected from ArchitectureModel.
7. Gantt is projected from PlanModel.
8. Code changes produce SymbolDiff and affected model/view invalidation.
9. Task results produce candidate progress before confirmed progress.
10. UI refreshes projections from updated memory/models.
```

