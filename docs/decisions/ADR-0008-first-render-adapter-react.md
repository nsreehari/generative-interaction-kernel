# ADR-0008: First render adapter — React

**Status:** Accepted

## Context

[ADR-0006](ADR-0006-render-adapter-infra-agnostic.md) fixed the `RenderAdapter` contract as
*resolved nodes + patches → events*, with no storage/transport concern. The reference kernel
([ADR-0007](ADR-0007-reference-kernel-implementation.md)) then made the protocol executable. To
prove the protocol actually drives a live UI end to end, a first concrete render adapter was needed,
and open item #3 ("first renderer") had to be resolved: React vs WinUI/Reactor.

## Decision

**React is the first render adapter** (`adapters/react/`). It matches the live-cards profile's
existing frontend and the primarily-embedded placement, and it round-trips the protocol with no
kernel change:

- A **`ComponentRegistry`** maps a capability id → React component, with a **graceful fallback**
  view for kernel-unknown capabilities *or* capabilities with no registered component (honoring the
  graceful-fallback invariant).
- A **pure renderer** (`renderNode`) turns a `ResolvedNode` tree into React elements: invisible
  nodes render nothing (gate), read-bound values arrive as props, children recurse.
- A framework-agnostic **`GenUIController`** runs the async loop — `init → resolve →` on event
  `dispatch → re-resolve → notify` — and is testable headlessly.
- A thin React binding (`useGenUI` / `GenUIRoot`) subscribes the controller to component state.
- Default **live-cards components** (`board`, `metric`, `table`, `actions`) supply the profile's
  vocabulary; they emit behavior events (`rowSelect`, `tap`) back through the controller.

The adapter depends on the kernel and on `react`/`react-dom`; the kernel remains framework-free.

## Alternatives considered

- **WinUI/Reactor first.** Deferred: it also needs the second (C#) kernel core, which is a larger,
  separate effort tracked as an open item. React proves the loop with the existing JS kernel now.
- **A bespoke DOM renderer (no React).** Rejected: React matches the profile's real frontend and
  gives component identity/keys and a familiar authoring model for the default components.

## Consequences

- The golden fixture renders as a live UI: the seeded table renders rows, selecting a row dispatches
  `rowSelect`, and the gated `Approve` button appears — a visual proof of the reduction contract.
- Renderers never touch the store: components only emit events; the controller dispatches to the
  kernel and re-resolves — preserving validate-before-commit and the pure-reducer law.
- Store seeding (e.g. `fetched_sources.orders`) is done via the `StateModel` provider; populating it
  from a real fetch is the Orchestrator's job (Phase 3), not the renderer's.
- A second render adapter (WinUI/Reactor) plus its C# kernel core remain open; reducer/render
  equivalence across adapters is a future conformance target.
