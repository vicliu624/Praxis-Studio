# Semantic Design HTML Specification

## 1. Purpose

Semantic Design HTML is the rich document form for Design Explorer.

Markdown remains the clean, readable and diff-friendly design document. Semantic HTML provides the richer interactive map that Design Explorer renders.

```text
Interaction Model JSON
  -> clean Markdown design document
  -> semantic HTML design map
  -> Design Explorer rich rendering
```

HTML is valuable because UML has a reading cost. A design map should not only show diagrams; it should help users understand what they are seeing.

Therefore, Semantic Design HTML may contain:

```text
UML / Mermaid / SVG base layer
agent explanation layer
user-confirmed explanation layer
evidence layer
risk layer
code mapping layer
timeline / changelog layer
open question layer
annotation layer
```

---

## 2. Non-Negotiable Rule

Semantic Design HTML is not edited by UI drawing tools.

```text
User selects a semantic DOM element in Design Explorer
  -> agent receives the selected anchor and context
  -> agent explains, corrects or annotates through chat
  -> agent proposes a governed DOM patch
  -> accepted patch updates the docs-backed HTML document
```

Design Explorer may render HTML, select anchors, toggle layers and send requests to the agent. It must not provide freeform drawing, drag-to-edit, arbitrary DOM editing or canvas-authoring tools.

The HTML document is maintained by the agent through governed patches and Tool Registry writes.

---

## 3. Authority Distinction

```text
Interaction Model JSON
  machine contract and managed snapshot

Markdown design document
  clean human-readable project memory

Semantic Design HTML
  rich human-readable and agent-addressable project memory

Design Explorer UI state
  transient interaction state, not project memory
```

HTML may be part of docs-backed Project Memory only when it follows this semantic contract. Arbitrary HTML is just a view artifact.

---

## 4. File Convention

For Use Case Diagrams:

```text
docs/design/use-case-diagrams-maps.md
docs/design/use-case-diagrams-maps.html
docs/design/use-case-diagrams/<story-id>.md
docs/design/use-case-diagrams/<story-id>.html
```

The map Markdown document is an index / map that links to independent story documents.
Each independent Use Case Diagram Markdown document is the clean human-readable story document.
Each independent Use Case Diagram HTML document is the rich semantic rendering for that story.
The HTML documents should remain navigable in a browser and addressable by Design Explorer.

Both files must share stable anchors for the same design objects.
Generated human-readable design documents default to Chinese. JSON keys, enum values, code identifiers, file paths and source excerpts may remain in their original language.

---

## 5. DOM Contract

The root document must declare the Praxis semantic schema:

```html
<article
  data-praxis-doc="use-case-diagrams-map"
  data-praxis-schema="praxis.semanticDesignHtml.v1"
  data-praxis-version="1.2.0"
  data-praxis-version-bump="minor"
  data-praxis-version-reason="Agent accepted a backward-compatible new story."
  data-praxis-git-branch="main"
  data-praxis-git-commit="abc123"
  data-praxis-git-dirty="false"
  data-praxis-source-md="docs/design/use-case-diagrams-maps.md"
>
</article>
```

Every selectable design object must expose a stable semantic anchor:

```html
<section
  id="use-case-diagram-refund-payment"
  data-praxis-kind="use_case"
  data-praxis-anchor="use-case:refund-payment"
  data-praxis-status="candidate"
  data-praxis-confidence="medium"
>
</section>
```

Allowed `data-praxis-kind` values include:

```text
design_context
actor
external_system
use_case
relation
sequence_step
class_collaboration
pattern_candidate
evidence
risk
question
annotation
```

Allowed layer values include:

```text
base
explanation
evidence
risk
code_mapping
timeline
question
annotation
agent_note
user_confirmed_note
```

Layer nodes must point back to the design anchor they explain:

```html
<aside
  data-praxis-layer="explanation"
  data-praxis-anchor="use-case:refund-payment"
  data-praxis-status="candidate"
  data-praxis-author="agent"
>
</aside>
```

---

## 6. Managed Blocks

Agent-maintained HTML must live inside managed blocks.

```html
<!-- praxis:managed:start anchor="use-case:refund-payment" layer="explanation" -->
<aside
  data-praxis-layer="explanation"
  data-praxis-anchor="use-case:refund-payment"
  data-praxis-status="candidate"
  data-praxis-author="agent"
>
  <h3>Explanation</h3>
  <p>...</p>
</aside>
<!-- praxis:managed:end -->
```

The agent may update managed blocks through governed patches.
The agent must not rewrite the whole HTML document unless the user explicitly requests regeneration.

---

## 7. Agent Patch Boundary

The agent may propose:

```text
add explanation layer for anchor
update explanation layer for anchor
add evidence layer for anchor
add risk layer for anchor
add code mapping layer for anchor
append timeline entry
mark an annotation candidate / confirmed / stale / rejected
regenerate deterministic base layer from Interaction Model
```

The agent must not:

```text
use arbitrary JavaScript as project memory
change a stable anchor without a migration entry
hide candidate/inference status
write explanation as confirmed without user acceptance
edit unrelated DOM outside the selected anchor or requested scope
make Design Explorer UI state the source of truth
```

---

## 8. Design Explorer Selection Contract

When the user selects an element, Design Explorer sends the agent a semantic selection:

```json
{
  "schemaVersion": "praxis.semanticSelection.v1",
  "documentPath": "docs/design/use-case-diagrams-maps.html",
  "sourceMarkdownPath": "docs/design/use-case-diagrams-maps.md",
  "anchor": "use-case:refund-payment",
  "kind": "use_case",
  "layer": "base",
  "status": "candidate",
  "confidence": "medium"
}
```

The agent response should explain the selected anchor, not the whole document, unless the user asks for broader context.

---

## 9. Changelog

Every accepted HTML patch must append or update a changelog entry:

```html
<section data-praxis-role="changelog">
  <article
    data-praxis-change="annotation"
    data-praxis-anchor="use-case:refund-payment"
    data-praxis-version="1.2.0"
    data-praxis-version-bump="patch"
    data-praxis-version-reason="Clarified the selected use case explanation without changing behavior."
    data-praxis-commit-scope="Clarify refund payment use case explanation"
    data-praxis-commit-summary="docs: clarify refund payment use case"
    data-praxis-git-branch="main"
    data-praxis-git-commit="abc123"
    data-praxis-git-dirty="false"
  >
    <time datetime="2026-06-15T00:00:00.000Z">2026-06-15</time>
    <p>Added candidate explanation for refund payment.</p>
  </article>
</section>
```

If the change affects persistent project memory, design meaning, code behavior, public contract or maintained documentation, the project semantic version must be decided by the Design Version Decision Agent according to the agent-governed version policy in `docs/specs/27-design-explorer.md`.

The HTML changelog is not a freeform audit note. It is a versioned design timeline. Each entry should preserve:

```text
program semantic version
agent-selected bump
version decision reason
atomic commit scope
commit summary
semantic diff explanation
changed design anchors
changed artifacts
git branch
git commit
dirty / clean state when rendered
```

The changelog entry must be readable as an explanation of the related atomic git diff. It should translate low-level file and line changes into product, design and code meaning:

```text
not just:
  "Modified docs/design/use-case-diagrams-maps.md"

but:
  "Added the Refund Payment use case as a backward-compatible design story,
   linked it to the Payment Lifecycle context, and recorded unresolved
   settlement callback questions."
```

The Semantic HTML changelog should remain traceable to Git, but it should not require the reader to open Git to understand the change. Git provides the factual delta; the Semantic HTML changelog provides the human and agent-readable interpretation.

The user must not hand-author `data-praxis-version` or choose `x.y.z` directly through the UI. The user discusses semantics and risk with the agent; the agent emits the version decision; runtime validates that `nextVersion` matches the selected bump.

---

## 10. Acceptance Criteria

```text
1. Design Discovery can generate Markdown and Semantic HTML from the same Interaction Model.
2. Design Explorer renders Semantic HTML, not raw JSON.
3. Users can select semantic DOM elements by stable anchor.
4. Agent explanations are scoped to the selected anchor.
5. Agent-maintained explanations are written as managed DOM blocks.
6. Candidate and confirmed explanations are visibly different.
7. Design Explorer does not provide freeform drawing or direct DOM editing tools.
8. Deleting rebuildable .distinction cache/views does not destroy Markdown or HTML design memory.
```
