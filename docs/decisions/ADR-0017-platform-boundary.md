# ADR-0017 — Platform boundary: the platform owns Interaction, Presentation, and Runtime

**Status:** Accepted — 2026-07-04

## Context

ADR-0016 stacked layers above the kernel (`Task -> Domain -> Interaction -> UI`). That left the
real question: **which layers does a UI Platform team actually own?** In 2015 a UI platform owned
rendering, layout, state, styling, navigation, accessibility — the UI DSL and its runtime. For an
AI-native platform that is now only ~30–40% of the story, because agents and users no longer reason
in components.

## Decision

Fix the ownership boundary as a five-layer charter:

| Layer | Owner |
|---|---|
| 1 — Intent (`{ "goal": "investigate incident" }`) | Agent platform / app — **not** the UI platform |
| 2 — Domain semantics (`{ "incidentId", "severity", "entities" }`) | Business domains (security, workflow, finance, HR) — **shared** |
| 3 — Interaction Model | **UI platform** |
| 4 — Presentation Model | **UI platform** |
| 5 — Rendering Runtime | **UI platform** |

Consequences of the boundary:

- **Intent is out of scope.** The UI platform stays domain-neutral; goals belong to Copilot / the
  agent framework / the business app.
- **Domain DSLs are shared ownership.** The domain team owns the *semantics* (an incident, a
  candidate, an expense); the platform owns only *how a domain DSL plugs in* — a **translation
  contract** (in code today, the profile `binding` from a domain/interaction shape to kernel
  vocabulary). Just as React does not own your business objects.
- **The platform's real surface starts at the Interaction Model, not the UI DSL.** Components /
  the UI DSL become an *implementation detail* — "as invisible as assembly language is to
  application developers." Agents and domains target interactions; the platform compiles down.

**The moat is the Interaction Taxonomy + the Interaction (Presentation) Compiler** — not the
renderer. That is the AI-native equivalent of what HTML was to browsers, or React components to web
apps.

## Alternatives considered

### A. The UI platform owns Intent and/or Domain semantics
**Rejected because:** it couples the platform to specific goals and business objects, destroys
domain-neutrality, and forces every domain team through the platform for meaning that is theirs.
The platform defines *how* domains plug in, not *what* they mean.

### B. The platform boundary stays at the UI DSL (components are the public surface)
**Rejected because:** it makes every domain team a UI expert (`grid`/`flex`/`column` everywhere) —
the ADR-0016 failure mode — and it mismatches how AI reasons. Users ask "compare these incidents,"
not "render a two-column table." Keeping the UI DSL public leaves the platform one layer too low.

## Consequences

- The platform surface is **Interaction (L3) + Presentation (L4) + Runtime (L5)**; Intent and
  Domain sit outside/above and reach it through a translation contract.
- The kernel's UI DSL is demoted to an internal target reached only through lowerings — reinforcing
  the "keep the UI DSL internal" guardrail from ADR-0016.
- Investment focus shifts to the **interaction taxonomy** and the **presentation compiler**
  (ADR-0018), which is where the durable value ("the moat") sits.
- No kernel or protocol change: this is a boundary/ownership decision realized by the layer
  packaging (`interaction/` owns L3–L4 lowering; `kernel/` owns L5's document + runtime).

> **Update (2026-07-13):** The L3–L4 framing is superseded by ADR-0038's layers/recipes model,
> and the `interaction/` source tree has been retired. Its generic profile machinery now lives in
> `@gik/profile` (`packages/profile/`) and the GenUI flavor in `@gik/profile-genui`
> (`packages/profile-genui/`). `kernel/` still owns the document + runtime.