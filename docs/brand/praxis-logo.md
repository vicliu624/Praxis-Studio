# Praxis Studio Logo

Status: Confirmed.

Confirmed version: V6 Memory Document Graph.

Confirmed by: project owner.

Decision date: 2026-06-22.

## Selected Direction

Praxis Studio uses the Memory Document Graph logo direction.

The selected mark combines:

- an amber folded document for durable Project Memory: normalized docs plus Git history;
- three cyan governance nodes for FACT, CANDIDATE and CONFIRMED memory;
- short amber rails for controlled write-in to memory;
- a dark shell palette aligned with the desktop application.

This direction was chosen because it balances three needs that earlier candidates handled unevenly:

- it is more readable than the abstract Memory Axis direction;
- it is simpler than the Control Grid direction;
- it avoids the monogram ambiguity of the first P-like direction.

## Primary Assets

- Mark SVG: `docs/asset/praxis-logo-memory-doc-graph-mark.svg`
- Horizontal lockup SVG: `docs/asset/praxis-logo-memory-doc-graph-lockup.svg`
- App icon SVG: `docs/asset/praxis-logo-memory-doc-graph-app-icon.svg`
- Compact navigation mark SVG: `docs/asset/praxis-logo-memory-doc-graph-nav-mark.svg`

PNG exports:

- Mark PNG: `docs/asset/praxis-logo-memory-doc-graph-mark-1024.png`
- Dark lockup PNG: `docs/asset/praxis-logo-memory-doc-graph-lockup-dark-1440.png`
- App icon PNG: `docs/asset/praxis-logo-memory-doc-graph-app-icon-512.png`
- Compact navigation PNG: `docs/asset/praxis-logo-memory-doc-graph-nav-mark-256.png`

## Palette

- Praxis amber: `#E7A23C`
- Governance cyan: `#6EE7D8`
- Shell dark: `#0C1116`
- Raised surface: `#111820`
- Text white: `#EDF2F7`
- Muted text: `#8EA0B5`
- Border: `#263241`

## Usage

- Use the horizontal lockup for brand presentation and documentation headers.
- Use the app icon candidate when replacing the desktop app icon.
- Use the compact navigation mark for 24 to 32 pixel UI positions.
- Keep candidate history under `docs/brand/praxis-logo-candidate-*.md` for traceability, but treat this document as the current logo authority.

## Compiled Product Usage

The confirmed logo is wired into the desktop application build through these project-local compiled assets:

- Desktop header navigation mark: `apps/studio-desktop/src/assets/praxis-logo-nav-mark.svg`
- Tauri PNG icon: `apps/studio-desktop/src-tauri/icons/icon.png`
- Tauri Windows icon: `apps/studio-desktop/src-tauri/icons/icon.ico`

The source-of-truth brand assets remain in `docs/asset`. Application assets are compiled copies used by the desktop shell.

## Candidate History

- V1: too letter-bound and visually close to a `D`.
- V2: improved semantics but lacked visual order.
- V3: ordered but too complex.
- V4: simpler but too bracket-like.
- V5: clean but too abstract.
- V6: selected for readable project-memory meaning with acceptable simplicity.
