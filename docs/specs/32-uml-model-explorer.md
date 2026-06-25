# UML Model Explorer

## Status

Candidate specification for replacing the split Design / Engineering / Architecture explorer ontology with a UML 2.x model-first organization.

## Problem

Praxis previously treated Design Explorer, Engineering Explorer and Architecture Explorer as if they were three independent modeling authorities. That caused several failures:

- diagram kinds were used as pseudo-layers;
- business and technical explanations drifted apart;
- class diagrams were grouped by top-level directories or relationship density;
- C4 views competed with UML documents as an authority;
- Code Fact Graph terms leaked into user-facing language;
- `docs/design`, `docs/engineering` and `docs/architecture` evolved as separate memories.

This contradicts the project memory rule: durable docs and their Git timeline are the project memory, while UI surfaces are projections.

## UML 2.x Basis

Praxis uses the following UML 2.x concepts as the organization basis:

- `Model`: a Package describing a system from a specific viewpoint for specific stakeholders at a specific abstraction level.
- `Package`: a namespace and grouping mechanism for model elements. Packages may nest.
- `Classifier`: an element that describes a set of instances, such as Class, Component, Interface, Node, UseCase or Actor.
- `Feature`, internal structure and owned Behavior: local detail owned by a Classifier.
- Structure Diagram, Behavior Diagram and Interaction Diagram: diagram families that project parts of the model.
- Abstraction, Trace, Refine and Realize: cross-model correspondence and refinement relationships.

Praxis must not introduce a fixed UML layer scheme such as business layer, logic layer, technical layer and code layer.

## Model Set

Praxis v0.1 uses three model authorities and one projection family:

1. Organization / Process Model
   - Viewpoint: actors, business processes, observable outcomes and business concepts.
   - Typical elements: Actor, UseCase, Activity, Class, Association, StateMachine, Interaction.
   - Legacy projection: `docs/design`.

2. Software Structure Model
   - Viewpoint: modular structure, contracts, classifiers, owned behavior and runtime collaboration.
   - Typical elements: Package, Component, Interface, Port, Connector, Class, Property, Operation, Interaction, Activity, StateMachine.
   - Legacy projection: `docs/engineering`.

3. Deployment / Artifact Model
   - Viewpoint: physical artifacts and execution resources.
   - Typical elements: Artifact, Node, Device, ExecutionEnvironment, Deployment, DeploymentSpecification, CommunicationPath.
   - Legacy projection: deployment-related engineering documents.

4. Architecture Views
   - Projection family, not a separate memory authority.
   - C4 belongs here as a useful architecture viewpoint projection.
   - Legacy projection: `docs/architecture/c4`.

## Document Authority

The migration target is:

```text
docs/models/
  models-map.md
  models-map.html
  organization-process/
  software-structure/
  deployment-artifact/
  architecture-views/
  traceability/
```

`docs/models/models-map.md` and `docs/models/models-map.html` form the model registry. They organize existing projections and must include:

- model metadata;
- viewpoint;
- stakeholders;
- abstraction level;
- packages;
- diagrams;
- represented UML elements;
- trace/refine/realize/project links;
- legacy projection references.

During migration, `docs/design`, `docs/engineering` and `docs/architecture` remain readable projections. They are no longer allowed to define independent ontology.

## UI Rule

The primary surface is Model Explorer.

Legacy explorer pages may remain as shortcuts:

- Design Explorer opens the Organization / Process Model projection.
- Engineering Explorer opens the Software Structure Model projection.
- Architecture Explorer opens Architecture Views.

The UI must never treat a diagram as the source of truth. It renders documents and their embedded model registry.

## Agent Rule

All explorer agents are the same agent with different current scopes.

The current scope must include:

- project root;
- current Model;
- current Package;
- current Diagram;
- current document path;
- selected semantic element;
- trace/refine links;
- allowed document update roots.

When the agent edits a document, it must update the current document and any linked documents that the trace/refine relationship makes necessary.

## C4 Rule

C4 is a projection of UML model information. It can be useful for architecture conversations, but it must declare what it projects from:

- Organization / Process Model;
- Software Structure Model;
- Deployment / Artifact Model.

C4 must not import product-specific content from Praxis Studio when the opened project is another repository.

## Anti-Leak Rule

The following terms are implementation evidence and must not appear as user-facing model language:

- Code Fact Graph;
- fan-in;
- fan-out;
- internal node ids such as `C_...`;
- import/reference as a runtime interaction;
- relationship density as a class diagram boundary.

They may appear only in internal traces, debug logs or evidence payloads.

## Migration Plan

1. Add `docs/models` registry generated from existing documents.
2. Add Model Explorer UI that reads the registry.
3. Route old Explorer agent conversations through the current Model scope.
4. Refactor prompts around Model / Package / Diagram / Trace.
5. Gradually move document generation authority from `docs/design`, `docs/engineering` and `docs/architecture` into `docs/models`.
6. Remove the old Explorer ontology after all projections can be generated from the model registry.
