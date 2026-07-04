# ADR-0015: Behavioral conformance matrix — portable JSON cases + per-kernel runner

**Status:** Accepted

## Context

`npm run conformance` validated fixtures against the message *schemas* and asserted one golden
reduction contract as data; deeper behavior (gates, guards, machines, emit fan-out, rev sequencing,
negative validation, graceful fallback) lived only as inline TypeScript tests in the reference kernel.
Open item #11 asked for two things the platform's premise needs: a **full behavioral matrix** and a way
to check **reducer equivalence across kernels** (the JS reference vs a future C# core). Inline TS tests
serve neither — they are language-bound and can't be shared with a second implementation.

## Decision

Make the behavioral contract **data**, not code:

- **Language-neutral case files** under `conformance/cases/*.case.json`, each describing a document
  (inline or by `*Ref`), optional `seed` state, optional `expectInitialResolve` assertions, and a list
  of event `steps` with the *exact* `expectPatch` (`rev` + `ops`) and optional `expectResolve`
  assertions. A `conformance-case.schema.json` (draft-07) defines and gates the case shape.
- **A thin runner per kernel.** The reference runner (`kernel/test/conformance.test.ts`) loads every
  case, validates it against the schema, then executes seed → `init` → resolve/step assertions against
  the reference kernel. A future kernel ships its *own* runner over the *same* JSON files; identical
  expected patches across runners is exactly reducer equivalence.
- **The matrix covers the closed grammar's observable contract:** assign-from-`$event` + gate flip,
  guarded invoke skipped (and invoke never writes state), machine transition, rev monotonicity, derive,
  emit driving a machine within one dispatch, malformed-document rejection, and unknown-capability
  graceful fallback.
- **Two gates, matching cost.** Structural case validation runs in `npm run conformance` (fast, no TS
  runtime); behavioral execution runs in the kernel test suite (needs the interpreter/reducer).

The observable contract is deliberately **patches + resolved-tree properties**, not traces or effects —
those are the cross-kernel-portable truths; trace/effect shapes are implementation detail.

## Alternatives considered

- **Keep behavior as inline TS tests only.** Rejected: language-bound, so a second kernel can't reuse
  them, defeating the equivalence goal.
- **Assert traces/effects in cases.** Rejected: traces and orchestrator-effect shapes are internal and
  may legitimately differ between kernels; patches and resolved props are the portable contract.
- **Embed manifest/document in every case.** Rejected as the *only* option: cases may embed inline
  (small focused cases, negatives) or reference shared fixtures via `*Ref` to stay DRY and readable.
- **A bespoke runner DSL.** Rejected: plain JSON + JSON Schema is already portable and validatable in
  any language; no new grammar to implement per kernel.

## Consequences

- The platform now has a portable behavioral spec: 8 cases, all green against the reference kernel,
  structurally gated in `npm run conformance` and executed in the kernel suite.
- Reducer equivalence for a future C# core is now a concrete task — implement a runner over these
  files; no test translation needed.
- The matrix grows by adding JSON files (no code), lowering the cost of pinning new edge cases.
- Open surface: expand coverage (merge/remove ops, nested machines, multi-step emit chains, HITL
  confirm follow-ups) and stand up the second-kernel runner when a C# core exists.
