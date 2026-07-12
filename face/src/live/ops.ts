// ControlFace: the runtime control-plane surface over a LIVE kernel — the counterpart to
// AgentFace. Where AgentFace takes a manifest and is pure (JSON in, JSON out, design-time),
// these take the kernel and read/snapshot live state. They are the UI/API-facing ops, and the
// superset from which the agent-safe AgentFace projection is carved.
//
// Read + snapshot only: driving the kernel (emit) broadcasts a patch to every connection, which
// is inherently a broker concern — so that lives in the outer transport composition, not here.

import type {
  Checkpoint,
  Json,
  Kernel,
  RecordedEffect,
  ResolvedNode,
} from "../../../kernel/src/index";

/** The full current state, one JSON record keyed by namespace. */
export function getState(kernel: Kernel): Record<string, Json> {
  return kernel.state();
}

/** Resolve the live document into the medium-neutral renderable tree. */
export function getTree(kernel: Kernel): Promise<ResolvedNode> {
  return kernel.resolve();
}

/** Capture an immutable, rev-keyed snapshot of pure state (for a host's rollback substrate). */
export function checkpoint(kernel: Kernel): Checkpoint {
  return kernel.checkpoint();
}

/** The effects journaled after `rev`, in causal order — the host decides how (or whether) to use them. */
export function effectsSince(kernel: Kernel, rev: number): RecordedEffect[] {
  return kernel.effectsSince(rev);
}
