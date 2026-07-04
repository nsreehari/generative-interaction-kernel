# ADR-0019 — Human-in-the-loop `confirm` contract: standard prompt, outcomes, and event names

**Status:** Accepted — 2026-07-04

## Context

ADR-0009 made `confirm` an Orchestrator effect: the reducer requests it, the Orchestrator surfaces
a prompt to a human, and the answer returns as a follow-up event that re-enters the kernel. That
fixed the *mechanism* but left the *shape* undefined — what the prompt payload looks like, how an
approval differs from a denial on the wire, and how a document routes each. Without a convention,
every profile invents its own `args` keys and follow-up event names, so documents and orchestrators
can't be mixed across profiles and agents can't author a `confirm` portably.

## Decision

Standardize three things (`kernel/src/confirm.ts`), all as *conventions over the existing closed
grammar* — no new action family, no new wire message:

- **Prompt payload** — `ConfirmPrompt { title?, message?, confirmLabel?, cancelLabel?, danger?,
  timeoutMs? }`, read from a `confirm` action's `args` by `confirmPrompt(effect)`. Every field is
  optional, so a bare `confirm` still works.
- **Outcome vocabulary** — `ConfirmOutcome = "approved" | "denied" | "cancelled" | "timeout"`.
  `approved` is the only outcome that proceeds; the other three are non-approvals (explicit no,
  out-of-band cancel, expiry).
- **Follow-up event names** — `confirmOutcomeEvent(effect, outcome)` maps `approved` to the
  `CONFIRM_APPROVED_EVENT` (`"confirmed"`) and every other outcome to `CONFIRM_DISMISSED_EVENT`
  (`"dismissed"`), targeting the original node and carrying `{ outcome, confirmed }` merged over the
  effect payload. A document routes approval vs. denial by event name and can still read the specific
  outcome from the payload.

The kernel and reducer are unchanged; this is a helper module orchestrators and authors opt into.

## Alternatives considered

- **A single follow-up event with an `approved` boolean in the payload.** Forces every document to
  branch inside one handler; two named events (`confirmed`/`dismissed`) let the closed grammar route
  approval and denial as ordinary distinct events, and still expose the boolean for code that wants it.
- **A new `confirm` result message on the wire.** Reopens the five-message protocol for a concern the
  Orchestrator seam already covers via follow-up events.
- **Leaving the shape per-profile.** Blocks portable agent-authoring of `confirm` and cross-profile
  reuse — the exact fragmentation the platform exists to prevent.
- **Kernel-owned timeout timer.** Would make the kernel own time (violating ADR-0007's async-as-states
  stance); `timeoutMs` is a hint the Orchestrator honours, surfacing as the `timeout` outcome.

## Consequences

- Agents can author a `confirm` with predictable fields and wire `confirmed`/`dismissed` handlers.
- Orchestrators built for one profile drive confirmations in another.
- Still open (tracked in not-yet-decided): scripting an Orchestrator's confirm response inside the
  JSON conformance cases so HITL follow-ups become part of the language-neutral matrix (today they
  are covered by the kernel's orchestrator/confirm unit tests, which need a live Orchestrator).
