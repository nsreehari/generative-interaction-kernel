# ADR-0023: Conformance runner contract — pin the language-neutral semantics a second kernel must honor

**Status:** Accepted

## Context

The behavioral matrix ([ADR-0015](ADR-0015-conformance-matrix.md)) makes the kernel contract
**data**: `conformance/cases/*.case.json` plus a thin per-kernel runner. The premise — "protocol over
SDK" ([ADR-0004](ADR-0004-protocol-over-sdk.md)) and cross-kernel reducer equivalence — is still
**unproven**, because only one kernel (the TypeScript reference) has a runner. The matrix is currently
validating the reference implementation against itself.

Before a second kernel (a C# core, item 2 / item 8 in [not-yet-decided](../not-yet-decided.md)) can be
written, we audited the reference runner (`kernel/test/conformance.test.ts`) and the case schema for
assumptions that are **implicit in TypeScript** and would let two "conforming" kernels silently
disagree:

- **Envelope-or-bare loading** — the runner calls `unwrap()`; the case format accepts either shape but
  never said so normatively.
- **Rev on no-op** — `dispatch` increments the rev unconditionally, so an empty-ops event still
  produces a patch at the next rev. A second kernel could plausibly return "no patch".
- **Op emission order** — `patch.ops` is compared with order-sensitive array equality, so op order is
  part of the contract, yet the rule (reducer ops → effect ops → follow-up event ops) was undocumented.
- **Number equality** — JSON has one number type; a typed runner comparing `1` against `1.0` (or
  `long` vs `double`) could fail spuriously.
- **Seed-before-init ordering, `props` partial-match, `fallback` = capability-absent** — all encoded
  only in the reference runner's code.

None of these are JSON-Schema-enforceable (they are behavioral, not structural), so a prose contract is
the right artifact.

## Decision

Publish a normative **conformance runner contract** at
[`conformance/README.md`](../../conformance/README.md) that every kernel's runner MUST honor, covering:

- **Case lifecycle** — unwrap enveloped-or-bare inputs; resolve `*Ref` relative to the case file;
  namespaces from `manifest.namespaces`; apply `seed` **then** `init`; `expectInvalid` = construction
  fails with validation on; then initial-resolve and per-step patch/resolve assertions.
- **Revision & patch rules** — one dispatch = one patch = one rev, **including empty-ops patches**;
  `init` is the rev-0 baseline so the first dispatch is rev 1; revisions strictly monotonic.
- **Op order is contractual** — reducer ops (in edge/emit-queue evaluation order) → Orchestrator effect
  `result.ops` → recursively, follow-up-event ops. Same ops in a different order do **not** conform.
- **Op semantics** — `set` replaces, `merge` shallow-combines, `remove` deletes the leaf; paths are
  dot-delimited and namespace-rooted.
- **Value equality** — numbers compare by numeric value (no int/float distinction); objects
  key-order-insensitive; arrays order-sensitive; `props` asserts only listed keys;
  `visible`/`fallback`/`capability` exact; nodes located by `id` via DFS; `fallback` iff the capability
  is absent from the registry.
- **Determinism** — the reduce/resolve path is pure (no clock, RNG, or IO).
- **Explicit out-of-scope** — traces/observability, Orchestrator effect scripting (the runner uses no
  Orchestrator), and streaming are **not** on the contract.

The contract documents existing reference-kernel behavior; it introduces no code or grammar change.

## Alternatives considered

- **Leave the semantics implicit in the reference runner.** Rejected: a second-kernel author would have
  to reverse-engineer them from TypeScript, and the subtle ones (rev-on-no-op, op order, number
  equality) are exactly where two kernels drift undetected — defeating the equivalence goal.
- **Encode the rules in the JSON Schema.** Rejected: they are behavioral (ordering, numeric equality,
  rev semantics), not structural; JSON Schema cannot express them.
- **Add a canonical machine-readable "expected trace" per case.** Rejected: traces are internal and may
  legitimately differ between kernels ([ADR-0020](ADR-0020-observability-sink.md)); patches and
  resolved props remain the portable truth.
- **Wait and derive the contract while writing the C# kernel.** Rejected: the audit is cheap now and
  writing it first turns the C# runner into a checklist rather than an archaeology exercise; it also
  hardens the reference runner's own guarantees.

## Consequences

- Writing the second (C#) kernel's runner is now a checklist against one document, not an inference from
  reference-kernel source.
- Ambiguities that would produce false "conformance" (op order, empty-patch rev, number equality) are
  closed before a second implementation exists.
- The contract is prose, so it is enforced by review, not by a schema; new behavioral rules must be
  added here as the grammar grows.
- Still open (item 8): the C# runner itself, and scripting Orchestrator `confirm`/`invoke` responses
  into JSON cases so HITL follow-ups join the language-neutral matrix.
