# ADR-0027: Own the JSONata engine in both kernels — do not depend on or publish a package

**Status:** Accepted

## Context

The platform owns the full JSONata expression language in **both** reference kernels: the TS kernel
vendors the canonical `jsonata.cjs` v2.2.1 ([ab8f474]), and the C# kernel now ships a from-scratch,
synchronous port (`kernel-dotnet/GenUI.Jsonata`) that reproduces the same shared conformance corpus.
The C# port replaced the hand-written `MiniJsonataProvider` subset behind the unchanged
`IExpressionProvider` seam ([ADR-0024](ADR-0024-second-kernel-csharp.md)).

Two questions arose once the port passed the corpus:

1. **Should the C# port be extracted into a standalone community package** (e.g. under
   `Reactor-Community`) so expression evaluation is an independent provider?
2. **Given `Jsonata.Net.Native` already exists on NuGet, do we even need our own C# port?**

## Decision

**Keep our own JSONata engine in both kernels. Do not take a third-party dependency, and do not
publish our port as a separate package.**

### Why our own port, not `Jsonata.Net.Native`

- **The offline, zero-NuGet island is the second kernel's defining property.** `GenUI.Kernel` and
  `GenUI.Jsonata` are `net10.0`, `System.Text.Json`-only, zero-NuGet, and build offline. The whole
  point of the C# kernel is to prove *protocol-over-SDK* with a minimal, auditable core
  ([ADR-0004](ADR-0004-protocol-over-sdk.md)). Pulling in a third-party engine (and its transitive
  surface / its own JSON model) undercuts exactly the property the kernel exists to demonstrate.
- **Value-model alignment.** The platform speaks `System.Text.Json.Nodes`. `Jsonata.Net.Native` is
  **not** System.Text.Json-native — it carries its own JSON model. Adopting it would marshal across
  three JSON representations at the hottest seam in the kernel. Our port bridges one internal model in
  a single thin adapter (`JsonataExpressionProvider`, ~90 lines). A dependency-free,
  System.Text.Json-native JSONata engine is a genuine gap in the .NET ecosystem.
- **Corpus-gated cross-kernel equivalence.** Our port is held to the **same** conformance corpus whose
  `expected` values are generated from the canonical vendored TS engine. That is what makes the TS and
  C# kernels *provably* equivalent — reducer + expression equivalence is a core project claim
  ([ADR-0015](ADR-0015-conformance-matrix.md)). A third-party engine has its own interpretation and
  version drift and is not gated against our canonical source of truth.

For a general-purpose C# application that merely needs to evaluate JSONata, `Jsonata.Net.Native` is the
pragmatic choice and building your own would be reinventing a maintained wheel. That is not this
situation.

### Why not publish our port as a package

- The provider decoupling the extraction would buy is **already achieved logically** by the
  `IExpressionProvider` + `JsonataExpressionProvider` seam. A NuGet split makes it physical but the
  architecture does not need it to be honest.
- A published package competes head-on with the established `Jsonata.Net.Native`. Our only
  differentiators — System.Text.Json-native + zero-dependency + canonical-corpus-gated — matter to
  *this platform* but are a narrow niche for outside consumers, not worth the support, versioning, and
  completeness commitments of a public package.
- **Naming.** A "`Reactor.Community.ReactorJSONata`" package would be a category error: JSONata is a
  UI- and OS-agnostic JSON expression language with no relationship to `Microsoft.UI.Reactor`. The
  `Reactor` prefix would signal a WinUI dependency that does not exist, dilute the Reactor-Community
  brand, and collide with `jsonata-js` / `Jsonata.Net.Native`. If it were ever extracted it would take
  a neutral name in its own home, not the Reactor org.

### Completeness commitment

Because the engine is platform-internal, its bar is faithfulness to canonical JSONata for the language
surface the platform exercises — verified case-by-case against the shared corpus, never hand-computed.

**Implemented and corpus-gated in this detour** (the C# port now reproduces the canonical result for
every case): the full function library — aggregation, string/number/array/object utilities, the
higher-order functions (`$map`/`$filter`/`$reduce`/`$sift`/`$single`/`$each`/`$zip`/`$spread`/`$merge`),
`$eval`/`$clone`/`$error`/`$assert`, Base64 and URL encode/decode, `$formatBase`, `$random`/`$shuffle`,
basic date/time (`$now`/`$millis`/`$fromMillis`/`$toMillis` in ISO-8601 form) — plus the **regex**
surface (`/pat/flags` literals as callable matchers, `$match`, and the regex-accepting forms of
`$contains`/`$replace`/`$split`), and the **transform** (`~> | pattern | update, delete |`) and
**partial application** (`$fn(?, x)`) language operators.

**Deliberately out of scope** for the platform-internal engine — these are XPath-3.1 F&O locale
machinery or advanced streaming operators that the platform's UI-state expressions do not use, and
porting them faithfully would be disproportionate. They **fail loudly** (a `U12xx` error with an
actionable message) rather than silently mis-evaluating:

- The **locale number/integer formatting layer**: `$formatNumber` (XPath picture strings),
  `$formatInteger` and `$parseInteger` (roman/words/sequence formatting).
- **Date/time picture strings**: the optional picture/timezone arguments to `$now`/`$fromMillis`/`$toMillis`
  (the default ISO-8601 behavior is supported).
- **Tuple-stream binders**: the `@` context and `#` index operators.

If a concrete need for any of these appears, it becomes its own scoped task (implement faithfully +
corpus-gate), not a silent partial behavior.

## Alternatives considered

- **Depend on `Jsonata.Net.Native`.** Rejected: breaks the offline/zero-NuGet island, introduces a
  non-System.Text.Json value model, and removes canonical-corpus-gated cross-kernel equivalence.
- **Extract and publish our port (optionally under Reactor-Community).** Rejected: no architectural
  need (the seam already decouples it), narrow external niche against an established package, ongoing
  support/versioning cost, and the Reactor branding would misrepresent a UI-agnostic library.

## Consequences

- Both kernels remain dependency-light and provably equivalent through one shared corpus.
- The platform carries the maintenance of a JSONata engine — accepted, and bounded by the corpus.
- If a compelling external demand for a System.Text.Json-native JSONata engine ever appears, extraction
  remains possible: the public `JsonataEngine.Compile/Evaluate` API and the shared corpus would travel
  with it, under a neutral name and its own repo — a deliberate, separate workstream, not a mid-detour
  pivot.
