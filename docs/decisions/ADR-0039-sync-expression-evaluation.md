# ADR-0039: Platform JSONata is pure — and a single canonical engine version, no divergent sync build

**Status:** Accepted

## Context

The `ExpressionProvider` seam ([ADR-0028](ADR-0028-safe-expression-subset.md)) exposes a single
`eval(expr, data, bindings) => Promise<Json>`. The canonical vendored engine (`jsonata.cjs` v2.2.1,
[ADR-0027](ADR-0027-own-jsonata-engine.md)) is **async by construction** — its `evaluate` returns a
`Promise` because the v2 interpreter is built on async generators. A resolved Promise's value is never
available in the same synchronous tick (it lands on the microtask queue), so **you cannot wrap the
async engine to be synchronous** — a naive `evalSync` would return `undefined`. The only ways to get a
value in-tick are a native blocking addon (`deasync`, not browser-safe) or a genuinely **synchronous
engine build**.

That raised a tempting shortcut: vendor a *second*, pre-2.0 (1.x) JSONata build (a synchronous one
already exists in `yaml-flow`) to serve sync positions. That shortcut was rejected, because two
different engine versions living side by side is a correctness hazard: two parsers, two function
libraries, and two ASTs mean the *same* expression could evaluate differently on the sync path than on
the async path — a silent divergence with no single source of truth.

## Decision

Two things, and they hold together:

1. **All JSONata expressions in this platform are assumed pure: basic math / logic / programming only
   — no I/O, no network, no timers, no async, no side effects. This is a hard, load-bearing
   assumption.** I/O and effects belong to the orchestrator effect seam
   ([ADR-0009](ADR-0009-orchestrator-effects.md)), never inside an expression. Any expression that
   would need I/O or async is a design error.

2. **Exactly one vendored JSONata engine version is canonical (currently v2.2.1). Never vendor a
   second, different version to obtain synchronous evaluation.** If a synchronous evaluation mode is
   ever genuinely required, it must be a sync **port of the same canonical version** — held to the
   same shared conformance corpus ([ADR-0015](ADR-0015-conformance-matrix.md)) — not an unrelated
   older build. Until such a need is real, no sync engine is added: the platform's current
   compile-time transforms (matcher/equality and `{{token}}` templating in the lowering primitives)
   are plain synchronous JavaScript and do not call JSONata at all.

The purity assumption (1) is what makes a future sync port sound: an expression that never performs
I/O and never suspends has a value available in the same tick, so a sync port of the canonical engine
would produce the identical result its async counterpart resolves to — only the calling convention
differs.

## Alternatives considered

- **Vendor a second 1.x sync build alongside v2.2.1.** Rejected: two versions = two behaviors for the
  same expression, a divergence hazard with no single source of truth. This is the option this ADR
  exists to forbid.
- **Downgrade the canonical engine to a dual-mode 1.8.x** (which offers both sync `evaluate(input,
  bindings)` and async-via-callback from one file). Rejected: it abandons the *latest* canonical
  engine and the v2.2.1-generated conformance corpus ([ADR-0027](ADR-0027-own-jsonata-engine.md)).
- **Sync wrapper over the async v2.2.1 engine.** Impossible: the microtask rule means the Promise's
  value cannot be read synchronously.
- **`deasync` / native blocking.** Rejected: a native Node addon, not browser-safe; defeats the
  zero-dependency browser+node portability the kernel exists to demonstrate
  ([ADR-0004](ADR-0004-protocol-over-sdk.md)).
- **Allow async/effectful expressions.** Rejected: expressions are UI-state math/logic; effects are an
  orchestrator concern. Keeping expressions pure is what licenses caching and cross-kernel
  conformance — and would license a faithful sync port later.

## Consequences

- One vendored engine version, one AST, one function library — no sync/async behavioral drift.
- The purity assumption is now a contract: reviewers reject any expression that reaches for I/O or
  async; such logic must be modeled as an orchestrator effect.
- Lowering and pure predicate/template code stay synchronous by using plain JavaScript primitives (the
  deduplicated matcher/renderer in the profile core), not by introducing an expression engine.
- If a compile-time position ever truly needs JSONata, the path is fixed in advance: port the *same*
  canonical version to sync and gate it on the shared corpus — never vendor a different version.
