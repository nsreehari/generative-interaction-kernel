# ADR-0035: Stop the C#/.NET port — master becomes TypeScript-only

**Status:** Accepted

## Context

The platform grew a full second implementation in C#/.NET alongside the canonical TypeScript
reference:

- a second kernel core (`kernel-dotnet/GenUI.Kernel`) plus its conformance runner
  (`kernel-dotnet/GenUI.Conformance`) and an in-progress hand-written JSONata engine
  (`kernel-dotnet/GenUI.Jsonata*`) — [ADR-0024](ADR-0024-second-kernel-csharp.md),
  [ADR-0025](ADR-0025-orchestrator-scripting-conformance.md), [ADR-0027](ADR-0027-own-jsonata-engine.md);
- a renderer-agnostic C# render adapter core and its WinUI/Reactor toolkit edge
  (`adapters/dotnet/GenUI.Render*`) — [ADR-0026](ADR-0026-second-render-adapter-dotnet.md),
  [ADR-0029](ADR-0029-winui-reactor-binding.md);
- a C# transport broker + HTTP/SSE server (`adapters/dotnet/GenUI.Transport.HttpSse`) and a unified
  host session (`adapters/dotnet/GenUI.Render/Session.cs`);
- a C# AgentFace surface and its MCP/HTTP wrappers (`agentface/dotnet/GenUI.AgentFace*`).

The .NET port served its purpose: it proved the **protocol-over-SDK** thesis
([ADR-0004](ADR-0004-protocol-over-sdk.md)) — an independent kernel reimplementation passing the same
language-neutral conformance matrix ([ADR-0015](ADR-0015-conformance-matrix.md),
[ADR-0023](ADR-0023-conformance-runner-portability.md)) — and demonstrated a second render adapter on a
different UI toolkit. That evidence now exists and is recorded.

Maintaining two full implementations in lockstep is, going forward, a cost the project no longer wants
to carry. Every kernel, provider, interaction, presentation, transport, and agentface change has had to
be mirrored across languages and re-verified in both. The TypeScript reference is the canonical source
of truth; the shared, language-neutral **conformance matrix, GUP protocol, and JSON schemas** remain the
contract any future re-implementation (in any language) can be built and verified against without the
port living in-tree.

## Decision

**Stop the C#/.NET port.** `master` becomes TypeScript-only.

1. The .NET port is **frozen and preserved** on a dedicated branch `dotnet-port`, cut at the point this
   ADR is added and pushed to `origin`. It is not deleted from history — it remains fully recoverable.
2. On `master`, all .NET-port-specific source is **removed**:
   - `kernel-dotnet/` (GenUI.Kernel, GenUI.Conformance, GenUI.Jsonata\*)
   - `adapters/dotnet/` (GenUI.Render, GenUI.Render.Reactor, GenUI.Transport.HttpSse, and their Checks)
   - `agentface/dotnet/` (GenUI.AgentFace, .Http, and their Checks)
   - `samples/bundles/inspect/components/dotnet`
   - the `test:dotnet*` npm scripts and their inclusion in the aggregate `npm test` / `typecheck`.
3. The **language-neutral assets stay**: the GUP protocol, the JSON schemas, and the `conformance/`
   cases (they serve the TypeScript kernel and remain the portable contract for any future port).
4. The historical ADRs describing the port (0024, 0025, 0026, 0027, 0029, and any .NET notes in others)
   are **kept as immutable records**; this ADR supersedes their forward-looking intent. The port is
   done as a proof, not as a maintained artifact.

## Alternatives considered

- **Keep both implementations in lockstep.** Rejected: the mirroring cost is the exact burden this
  decision removes; the proof it bought has already been captured.
- **Delete the port outright (no preservation branch).** Rejected: the work is valuable reference and
  the protocol-over-SDK evidence should stay recoverable. A frozen `dotnet-port` branch pushed to
  `origin` preserves it without taxing day-to-day `master` work.
- **Move the port to a separate repository now.** Rejected as premature: a branch is the cheapest
  durable preservation. Extracting it to its own repo can happen later from the branch if ever needed.

## Consequences

- `master` builds and tests with the Node/TypeScript toolchain only; no .NET SDK is required to run
  `npm test` or `npm run typecheck`.
- The protocol/schema/conformance contract is unchanged, so a future re-port (C# or otherwise) can be
  reconstructed against the same matrix from the preserved branch.
- WinUI/Reactor rendering is no longer shipped from this repo on `master`; it lives on `dotnet-port`.
- The canonical reference is unambiguously the TypeScript implementation.
