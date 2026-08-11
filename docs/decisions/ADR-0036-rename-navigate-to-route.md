# ADR-0036: Rename the `navigate` action verb to `route`

**Status:** Accepted

## Context

The kernel exposes a fixed, closed grammar of action families —
`assign`, `derive`, `emit`, `invoke`, `route`, `confirm` — that every runtime actor (human or
agent) expresses itself through ([ADR-0001](ADR-0001-closed-grammar-kernel.md),
[ADR-0002](ADR-0002-interaction-as-edge.md)). Five of those six verbs are medium-neutral in name.
The sixth was `navigate`.

The kernel is deliberately **medium-blind**: the reducer is a pure `(state, event) → patch`
evaluator, and `invoke` / `confirm` / `navigate` are handed to an `Orchestrator` provider *after*
reduction ([ADR-0009](ADR-0009-orchestrator-effects.md)). The kernel never assumes a screen — the
`navigate` effect only carries a `to` value and is interpreted entirely by the host. A backend host
uses that same effect as a routing verb (route an order to a fulfillment queue; advance a workflow
stage) with no notion of a view.

So the concept was already neutral; only the **word** was anchored to the UI instance of it. That
lexical mismatch undercut the "the grammar reads identically for any medium" property the platform
leans on: a workflow or API host authoring `navigate` reads as if it were driving screens.

Two facts made this the right moment to fix it:

1. The .NET port was removed and `master` is TypeScript-only
   ([ADR-0035](ADR-0035-stop-dotnet-port.md)), so the blast radius is TypeScript + JSON schemas +
   docs, verifiable in one `npm test` — not a cross-language protocol migration.
2. The wire protocol is pre-1.0 (`GIK_VERSION = "0.1"`), so a closed-grammar vocabulary change is
   still cheap; every additional bundle that hard-codes `"navigate"` only raises the future cost.

## Decision

**Rename the action verb `navigate` to `route`** across the closed grammar and everything that
names it:

- the action `do: "route"`, the `OrchestratorEffect` `kind: "route"`, the `Orchestrator.route`
  method, and the `route(...)` authoring helper;
- the JSON schemas (`document`/`manifest`/conformance-case), the built-in `actions` defaults, and
  every current manifest / bundle that lists the built-ins;
- the conformance cases, kernel/provider tests, and the reference docs.

`route` names the real concept: **a handoff of control flow to a named destination** — a view in a
UI host, a queue or stage in a backend host. The effect payload (`to`) and its post-reduction
Orchestrator routing are unchanged; this is a rename, not a semantic change.

### Scope boundary

- **Changed:** current source, schemas, manifests/bundles, conformance cases, tests, and reference
  docs (`README`, `02-architecture`, `03-protocol`, `conformance/README`, the core GIK docs).
- **Left as historical record:** prior ADRs (0002, 0007, 0009, 0013, 0025, 0033, 0034), the ADR
  index title for ADR-0009, and `discussion-log.md` — renaming there would rewrite the past.
- **Left untouched:** generated `dist/` bundles (regenerated on build) and unrelated prose (e.g.
  "JSONata *navigates* dotted paths" in the reactive `StateModel`, which is not the action verb).

## Consequences

- The closed grammar is now uniformly medium-neutral in name, matching the medium-blind kernel it
  describes; the backend-order Blueprint and test (`samples/blueprints/backend-order-processing/`,
  `kernel/test/backend-host.test.ts`) read correctly as routing, not screen navigation.
- This is a **breaking wire-vocabulary change**: documents/manifests authored against `0.1` that
  used `navigate` must switch to `route`. Acceptable pre-1.0; no compatibility shim is provided.
- Any future re-implementation verified against the language-neutral conformance matrix inherits
  `route` for free, since the cases and schemas moved with the rename.
