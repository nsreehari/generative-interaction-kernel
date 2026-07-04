// The human-in-the-loop `confirm` contract (ADR-0019).
//
// `confirm` is an Orchestrator effect: the reducer requests it, the Orchestrator surfaces a
// prompt to a human, and the human's answer returns as a follow-up event that re-enters the
// kernel. ADR-0009 fixed the mechanism; this fixes the *shape*: a standard prompt payload, a
// standard outcome vocabulary, and standard follow-up event names — so a document can wire
// approval and denial with conventional, portable names instead of ad-hoc strings.

import type { GupEvent, Json, OrchestratorEffect } from "./types";

/**
 * The standardized prompt an Orchestrator renders for a `confirm`. Every field is optional
 * (a bare `confirm` still works); the field names below are the contract a `confirm` action's
 * `args` should use.
 */
export interface ConfirmPrompt {
  title?: string;
  message?: string;
  /** label for the approving control (default host-decided, e.g. "Confirm"). */
  confirmLabel?: string;
  /** label for the dismissing control (default host-decided, e.g. "Cancel"). */
  cancelLabel?: string;
  /** hint that the action is destructive, so the host can style/guard it. */
  danger?: boolean;
  /** auto-resolve to a `timeout` outcome after this many ms; 0/undefined = wait indefinitely. */
  timeoutMs?: number;
}

/**
 * How a confirmation resolved. `approved` is the only outcome that proceeds; the other three
 * are all non-approvals (an explicit no, an out-of-band cancel, or an expiry).
 */
export type ConfirmOutcome = "approved" | "denied" | "cancelled" | "timeout";

/** The follow-up event name for an approved confirmation. */
export const CONFIRM_APPROVED_EVENT = "confirmed";
/** The follow-up event name for any non-approval (denied / cancelled / timeout). */
export const CONFIRM_DISMISSED_EVENT = "dismissed";

/** Read a `confirm` effect's `args` into the standardized {@link ConfirmPrompt}. */
export function confirmPrompt(effect: OrchestratorEffect): ConfirmPrompt {
  const a = effect.args ?? {};
  const prompt: ConfirmPrompt = {};
  if (typeof a.title === "string") prompt.title = a.title;
  if (typeof a.message === "string") prompt.message = a.message;
  if (typeof a.confirmLabel === "string") prompt.confirmLabel = a.confirmLabel;
  if (typeof a.cancelLabel === "string") prompt.cancelLabel = a.cancelLabel;
  if (typeof a.danger === "boolean") prompt.danger = a.danger;
  if (typeof a.timeoutMs === "number") prompt.timeoutMs = a.timeoutMs;
  return prompt;
}

/**
 * Build the standardized follow-up event for a resolved confirmation. `approved` yields the
 * {@link CONFIRM_APPROVED_EVENT}; every other outcome yields {@link CONFIRM_DISMISSED_EVENT}.
 * Both events target the original node and carry `{ outcome, confirmed }` merged over the
 * effect's payload, so a document routes approval vs. denial by event name and can still read
 * the specific outcome from the payload.
 */
export function confirmOutcomeEvent(
  effect: OrchestratorEffect,
  outcome: ConfirmOutcome
): GupEvent {
  const confirmed = outcome === "approved";
  const payload: Record<string, Json> = {
    ...(effect.payload ?? {}),
    outcome,
    confirmed,
  };
  return {
    node: effect.node,
    name: confirmed ? CONFIRM_APPROVED_EVENT : CONFIRM_DISMISSED_EVENT,
    payload,
  };
}
