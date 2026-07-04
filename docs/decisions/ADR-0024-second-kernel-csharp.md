# ADR-0024: Second kernel — an independent C# reimplementation verified by the conformance matrix

**Status:** Accepted

## Context

The platform's premise is "protocol over SDK" ([ADR-0004](ADR-0004-protocol-over-sdk.md)): the
behavioral contract lives in the GUP protocol plus a **language-neutral conformance matrix**
([ADR-0015](ADR-0015-conformance-matrix.md)), not in any one implementation. Until now there was a
single kernel (TypeScript), so the matrix only checked the reference against itself — the premise was
**unproven**, and embedded placement ([ADR-0005](ADR-0005-kernel-placement.md)) for a C#/WinUI renderer
implies a second core regardless. Open item 2 asked *whether* that second core should be an independent
spec-conformant reimplementation or a shared portable core compiled to both targets. Item 8 asked to
stand up its runner. The runner contract ([ADR-0023](ADR-0023-conformance-runner-portability.md)) had
just pinned the cross-language semantics, making the second kernel a checklist rather than an inference.

## Decision

Ship a **second kernel as an independent C# reimplementation** under `kernel-dotnet/`, verified by the
**same** `conformance/cases/*.case.json` as the TypeScript reference:

- **`GenUI.Kernel`** — a dependency-free class library (only `System.Text.Json` from the shared
  framework, so it builds and runs offline): namespaced store with `set`/`merge`/`remove` op semantics,
  `ManifestRegistry`, an `IExpressionProvider`, the interpreter (`gate → capability → props → children`),
  the pure reducer (six action families, machines, emit cascade via an in-dispatch queue), structural
  validate-before-commit, and a `Kernel` where one dispatch = one patch = one rev (empty ops included).
- **`GenUI.Conformance`** — a console runner mirroring `kernel/test/conformance.test.ts`: it loads every
  case and asserts the exact patches and resolved-tree properties per the runner contract. Wired as
  `npm run test:dotnet` and into the aggregate `npm test`.
- **Expression provider is a bounded subset.** `MiniJsonataProvider` implements exactly the JSONata
  forms the matrix uses (path navigation, `$event`, `*`, `=`, `!=`, literals), `truthy()`-wrapped to
  match jsonata-js as observed through the contract — behind the `IExpressionProvider` seam so a richer
  case can swap in a full JSONata port.

All ten cases pass on the C# kernel: identical expected patches across two independent runners **is**
reducer equivalence — the first real proof of the protocol-over-SDK premise.

This resolves item 2 (**independent reimplementation**, not a shared compiled core) and the runner half
of item 8.

## Alternatives considered

- **A shared portable core compiled to both targets** (e.g. one core transpiled/AOT to JS and .NET).
  Rejected: it would prove "the same code runs twice," not "the contract is implementable
  independently." Two independent implementations agreeing over the matrix is the stronger, and the
  honest, evidence for a protocol-first platform. A shared core also couples release cadence and
  language idioms across very different renderer runtimes.
- **Defer the second kernel until the WinUI adapter needs it.** Rejected: the matrix + runner contract
  made it cheap *now*, and doing it first turns any future divergence into a caught test failure rather
  than a production surprise; it also validates the contract itself while it is small.
- **Reuse a full JSONata C# port immediately.** Deferred, not rejected: it adds a dependency and
  semantic-matching surface the matrix doesn't yet exercise. The subset keeps the second kernel
  dependency-free and offline; the seam preserves the upgrade path.
- **Port the reference unit tests to C# as well.** Rejected as the equivalence mechanism: unit tests are
  language-bound. The JSON matrix is the shared contract; the C# kernel's own idiomatic tests (if added)
  are for its internal quality, not for cross-kernel equivalence.

## Consequences

- The protocol-over-SDK premise is now demonstrated, not asserted: two kernels, one matrix, all green.
- `npm test` fails if the kernels diverge on any case — equivalence is guarded continuously (given a
  .NET SDK; the script is also runnable standalone).
- The C# core is the foundation the WinUI/Reactor render adapter (item 3) will sit on.
- Still open (item 8): scripting an Orchestrator's `confirm`/`invoke` response inside JSON cases so HITL
  follow-ups join the language-neutral matrix; and broadening expression coverage may eventually justify
  a full JSONata port behind `IExpressionProvider`.
