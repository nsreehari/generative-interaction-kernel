# ADR-0018 — Interaction Model / Presentation Model split, with a presentation compiler

**Status:** Accepted — 2026-07-04

## Context

ADR-0016 treated "Interaction -> UI" as a single lowering. In practice two very different concerns
were hiding in that one step:

- **What experience is the user having?** (investigate / compare / review / approve …)
- **How is that experience materialized right now?** (a desktop workspace vs a mobile stack vs a
  copilot narrative).

These change independently. The interaction "investigate an incident" is the same whether it is
shown on a phone or a desktop; only the materialization differs. Collapsing them loses the most
valuable seam.

## Decision

Split the platform-owned span into **two layers** with a **context-aware compiler** between them.

- **Layer 3 — Interaction Model.** A domain-neutral *human goal pattern*, not a screen or a
  component. A small owned **taxonomy** (`investigate`, `compare`, `review`, `approve`, `monitor`,
  `explore`, `create`, `configure`, `collaborate`, `plan`, `learn`, `decide`) plus, per kind, the
  **facets** it is made of (investigate = context / evidence / timeline / relationships / actions).
  The app states the interaction; the platform already knows the facets. Shape:
  `{ interaction, subject, capabilities?, intent?, data? }`. (Here "capabilities" = experience
  facets — a different concept from a kernel *capability*; resolved internally as `facets`.)

- **Layer 4 — Presentation Model.** A materialization plan: `{ layout, regions }` — closer to
  XAML/JSX territory. It answers "given this experience, how should it appear *now*?"

- **The Presentation Compiler** (`InteractionSpec + PresentationContext -> PresentationSpec`) sits
  between them. Same interaction, different context ⇒ different presentation: desktop → a named
  workspace layout, mobile → a single-column stack, copilot → a narrative subset. This is the
  layer the charter (ADR-0017) calls **the moat**.

Layer 4 then lowers to the kernel's UI document via a profile-supplied **region binding** (a
translation contract): each region maps to one of the profile's kernel capabilities; regions with
no mapping fall back to the region name as the capability, which the kernel renders as a graceful
fallback node — the forward-compatible path for a facet a profile has not implemented yet.

Full span: `Domain -> Interaction (L3) -> [compiler + context] -> Presentation (L4) -> UI document`.
It composes through the kernel's existing `pipeline`/`lowerToDocument` seam (ADR-0016) — no new
grammar, no new wire message.

## Why this matters for AI

Users say "help me understand why this alert fired," not "render a table." The AI naturally emits at
**Layer 3** (`{ "interaction": "investigate", "object": "security_alert" }`) and the platform
generates the rest. Historically developers hand-authored Layer 4; AI operates a layer above it.

## Alternatives considered

### A. Keep a single Interaction -> UI lowering (ADR-0016's shape)
**Rejected because:** it fuses "what experience" with "how it appears," so context-adaptation
(surface/device/attention/space) has nowhere clean to live and the reusable interaction taxonomy
can't be shared across presentations. The single most valuable seam — the presentation compiler —
would not exist.

### B. Make presentation context part of the Interaction Model
**Rejected because:** it re-couples the domain-neutral goal to a device/surface, defeating "same
interaction, many presentations." Context belongs to the compiler, not the interaction.

### C. Hard-code layouts per interaction (no compiler)
**Rejected because:** every interaction would render identically everywhere; adaptivity (the whole
AI-native point) is lost. The compiler is deliberately a replaceable seam a profile can enrich.

## Consequences

- Two owned layers (`interaction/src/interaction.ts`, `interaction/src/presentation.ts`) and a
  planner seam (`defaultPresentationPlanner`) that a profile may replace with a richer one.
- The interaction taxonomy is the platform's public vocabulary; the UI DSL stays internal.
- The presentation compiler is the investment centre ("the moat" from ADR-0017); the reference
  compiler is intentionally simple to keep the seam concrete and testable.
- Region → capability binding is the profile's translation contract; unbound facets are safe via
  graceful fallback, so a profile can target facets it has not yet implemented.

## Follow-up (2026-07-04): facets, context taxonomy, and layout templates seeded

The three open items below are now given concrete (still-replaceable) shapes in code:

- **Facets per interaction.** A `Facet` is `{ name, role, required }`. `role: FacetRole` is a
  semantic display role (`summary | collection | detail | timeline | graph | narrative | metrics |
  status | form | actions | comparison | recommendation`) — still not a component. `required`
  marks the facets an interaction cannot be itself without. All 12 kinds are fully specified in
  `interactionTaxonomy`. Accessors: `facetsOf`, `requiredFacets`, `resolveFacets` (explicit
  `capabilities` override; unknown names → required `detail`), `facetsFor` (names).
- **Presentation context taxonomy.** `PresentationContext` gains `surface`
  (`desktop | web | mobile | copilot | teams`), `device` (`pointer | touch | voice`), `space`
  (`compact | regular | expanded`), `attention` (`focused | glanceable`), and `expertise`
  (`novice | intermediate | expert`). The reference compiler reads surface + space + attention.
- **Named layout templates.** `layoutTemplates` is a small catalog of `LayoutTemplate`
  (`{ name, arrangement, maxRegions? }`) with arrangements
  `stack | narrative | split | grid | dashboard | wizard`. `selectTemplate` picks one from the
  interaction (compare→comparison, monitor→dashboard, create/configure→wizard) then the context
  (glanceable→narrative, compact→stack, else the generic `workspace` grid, named
  `${interaction}_workspace`).
- **Required facets are structurally protected.** A capped template (e.g. `narrative`,
  `maxRegions: 3`) sheds only *optional* facets; the region trim keeps every required facet even
  when they exceed the cap.
- **Binding by role.** `PresentationBinding` gains `roleCapability` (bind once per facet *role*),
  with `regionCapability` as a per-region override. Resolution order is
  `regionCapability[region] → roleCapability[role] → region name` (fallback). The live-cards
  binding now binds by role; `graph` and `form` are intentionally unmapped to exercise fallback.

Kernel grammar and the wire protocol are unchanged — all of the above is compile-time lowering.

## Follow-up (2026-07-04): richer Presentation DSL + explicit Planner / Compiler split

The "Role of AI" in the platform vision distinguishes two stages the first cut had fused: an *AI
Presentation Planner* (interaction → Presentation DSL) and a *Presentation Compiler* (Presentation
DSL → UI DSL). These are now named and separated, and the DSL itself is made a first-class artifact:

- **Planner vs. Compiler.** The `interaction + context → PresentationSpec` seam is renamed
  `PresentationPlanner` (`defaultPresentationPlanner` is the deterministic reference; an AI planner
  drops into this exact slot). `lowerPresentation` is the Presentation *Compiler* (`PresentationSpec
  → kernel document`). `compileInteraction(spec, ctx, binding, planner?)` runs planner then compiler.
- **Enriched regions.** A region is no longer a bare name. `PresentationRegion` is
  `{ name, role, priority, disclosure, presentation? }`: `priority`
  (`primary | secondary | tertiary`) is information hierarchy, `disclosure`
  (`always | collapsed | on-demand`) is progressive disclosure, and `presentation?` is a concrete
  presentation-type hint (e.g. `relationship_graph`). The lead region is primary; other required
  facets are secondary; optional facets are tertiary. Disclosure tightens one step on a constrained
  surface (mobile / copilot / compact / glanceable), so the compiler now does attention management
  and progressive disclosure, not just layout selection. These ride into the UI DSL as node props.
- **The Presentation DSL is validatable.** `schemas/presentation.schema.json` (draft-07) plus
  `validatePresentationSpec` / `isValidPresentationSpec` make a planner's output a structurally
  checkable artifact — a buggy planner is caught at this boundary, not at render time.

Kernel grammar and the wire protocol remain unchanged.


