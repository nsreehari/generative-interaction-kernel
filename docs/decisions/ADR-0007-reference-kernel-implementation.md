# ADR-0007: Reference kernel implementation — TypeScript first, JSONata default

**Status:** Accepted

## Context

The protocol (GIK) and its normative schemas + golden conformance fixture existed, but the fixture
was only validated structurally and reduced by an ad-hoc runner. To make GIK *executable* and to
prove the closed grammar and the pure-reducer law actually run, a reference kernel was needed.

Two choices had to be made:

1. **Language & runtime of the first core.** Embedded placement ([ADR-0005]) implies the kernel core
   runs inside each renderer runtime (JS **and**, later, C#).
2. **Default `ExpressionProvider` dialect.** The expression language is a provider seam, but the
   reference kernel must ship a concrete default so gates, guards, and `derive`/`assign from` work
   out of the box.

## Decision

- **TypeScript / JavaScript is the first reference core.** It matches the primary renderer target
  (the existing React frontend of the first onboarding profile) and the "primarily embedded"
  placement. The core is a small, pure package (`kernel/`): `types`, `providers` (in-memory
  `StateModel`, `JsonataExpressionProvider`, manifest-derived `CapabilityRegistry`), an interpreter
  (`gate → capability → props(read) → children`), and a pure reducer (`assign`, `derive`, `emit`;
  `invoke`/`navigate`/`confirm` traced and deferred to Phase 3; declared machines reduced by
  `reduce(state, event) → state`).
- **JSONata is the default `ExpressionProvider`**, pinned to a patched major (`jsonata@^2.2.1`).
  It is the dialect already used by the live-cards profile, so the golden fixture's expressions run
  unchanged. Because v2's `evaluate` is async, the kernel's eval path (interpret + reduce + dispatch)
  is async — which also aligns with the async Orchestrator/`invoke` seam.
- **Verification is the golden fixture, executed.** The fixture goes green by *running* through the
  kernel (not just schema validation), plus negative/behavioral cases.

## Alternatives considered

- **Pin the profile's vendored sync JSONata build (`jsonata-sync.cjs`).** Rejected: it is a
  profile-owned artifact (importing it inverts the kernel→profile dependency the closed-grammar
  kernel forbids, [ADR-0001]); it is JSONata v1.x, inside the range of a **critical** prototype-
  pollution advisory (GHSA-fqg8-vfv7-8fj8) and frozen from security updates; and its only rationale
  (a synchronous browser/UMD build) is a profile *deployment* concern, not a kernel requirement. A
  profile that wants byte-identical semantics can still supply it via the `ExpressionProvider` seam.
- **C# / WinUI core first.** Deferred: the first renderer target is React; the C# core is tracked as
  an open item and will be verified against the same fixture.
- **A non-JSONata default expression language.** Deferred: JSONata keeps the golden fixture's
  expressions unchanged; the seam remains open for other dialects per profile.

## Consequences

- GIK is now executable: `Kernel(manifest, document).init()/dispatch(event)/resolve()` yields
  patches and a resolved tree, with validate-before-commit and an observability sink.
- The kernel dispatch/resolve API is **async** (a consequence of the patched JSONata major).
- A second (C#) core remains required for the embedded WinUI runtime and must reduce identically —
  reducer equivalence across kernels becomes an explicit conformance target.
- The expression **safe-subset** question (sandboxing agent-authored guards) remains open.

[ADR-0001]: ADR-0001-closed-grammar-kernel.md
[ADR-0005]: ADR-0005-kernel-placement.md
