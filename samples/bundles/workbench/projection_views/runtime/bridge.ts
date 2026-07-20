// Native bridge helpers for the workbench guest surface.
//
// The workbench is a normal json bundle; its ONE native concern is the guest surface (the middle
// column) — the Interaction->Presentation->UI pipeline is a compiler and a fired event has to cross
// into the live guest kernel, neither of which the closed action grammar can express. These helpers
// read the guest inputs out of the `workbench` namespace, resolve event-bar fires, flatten imported
// artifacts, and reflect the guest's artifacts back for the inspector. They are the small, audited
// native seam the `wb:guestSurface` view uses (ADR-0034) — not app behaviour.

import { type Json, type Patch, type ResolvedNode, type TraceEvent } from "@gik/kernel";
import { type InteractionKind, type InteractionSpec, type PresentationContext, type PresentationEdits } from "@gik/profile";
import { emptyEdits } from "../libs/edits";
import type { AuthoredSession } from "../libs/authoring";
import { exportBundle } from "./export";
import type { Session } from "./session";

export interface Option {
  value: string;
  label: string;
  [k: string]: string;
}

/** The minimal read-only state surface the native guest-surface helpers need. */
export interface StateReader {
  get(path: string): Json | undefined;
}

/** Flatten an imported artifact into the `importApply` event payload (every axis defaulted). */
export function authoredApplyPayload(a: AuthoredSession): Record<string, Json> {
  const ctx = a.context ?? { surface: "desktop" };
  const axis = (k: string): string => String((ctx as Record<string, unknown>)[k] ?? "");
  return {
    interaction: a.interaction.interaction,
    subject: a.interaction.subject ?? "",
    surface: String((ctx as Record<string, unknown>).surface ?? "desktop"),
    device: axis("device"),
    space: axis("space"),
    attention: axis("attention"),
    expertise: axis("expertise"),
    edits: a.edits,
  };
}

/** Read the current guest inputs (interaction spec + presentation context + edits) out of state. */
export function readInputs(state: StateReader): {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
  profileId: string;
} {
  const interaction = String(state.get("workbench.interaction") || "investigate") as InteractionKind;
  const subject = String(state.get("workbench.subject") ?? "");
  const profileId = String(state.get("workbench.profile") || "live-cards");
  const ctx: PresentationContext = {
    surface: String(state.get("workbench.surface") || "desktop"),
  };
  for (const axis of ["device", "space", "attention", "expertise"] as const) {
    const v = state.get(`workbench.${axis}`);
    if (v) (ctx as Record<string, unknown>)[axis] = v;
  }
  return { spec: { interaction, subject }, ctx, edits: readEdits(state), profileId };
}

/** The authoring session's presentation overrides, read from state (seeded, so always present). */
export function readEdits(state: StateReader): PresentationEdits {
  const raw = state.get("workbench.edits");
  return raw ? (raw as unknown as PresentationEdits) : emptyEdits;
}

/** A stable signature of the guest inputs, so the surface only rebuilds when they actually change. */
export function inputsSignature(inputs: {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
  profileId: string;
}): string {
  return JSON.stringify(inputs);
}

/** Every resolved node id, depth-first — the set the event bar can target. */
function collectIds(tree: ResolvedNode | null): string[] {
  if (!tree) return [];
  const ids = [tree.id];
  for (const child of tree.children) ids.push(...collectIds(child));
  return ids;
}

/** The guest's node ids as `{ value, label }` options for the (state-bound) node select. */
export function nodeIdsAsOptions(tree: ResolvedNode | null): Option[] {
  return collectIds(tree).map((id) => ({ value: id, label: id }));
}

/** A fired event resolved from state: the target/name/payload plus any parse error. */
export interface FireRequest {
  node: string;
  name: string;
  payload: Record<string, unknown>;
  error: string;
}

/** Read + validate the event-bar fields; falls back to the first node when none is selected. */
export function readFireRequest(state: StateReader, tree: ResolvedNode | null): FireRequest {
  const target = String(state.get("workbench.eventNode") || collectIds(tree)[0] || "");
  const name = String(state.get("workbench.eventName") ?? "");
  const raw = String(state.get("workbench.eventPayload") ?? "").trim();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return { node: target, name, payload: {}, error: "payload is not valid JSON" };
    }
  }
  return { node: target, name, payload, error: "" };
}

/** The `snapshot` payload the surface feeds the inspector for the current guest state. */
export function inspectSnapshot(
  session: Session,
  tree: ResolvedNode | null,
  patch: Patch | null,
  edits: PresentationEdits
): Record<string, unknown> {
  const p = session.presentation;
  const bundle = exportBundle(session, edits);
  return {
    exportJson: JSON.stringify({ authored: bundle.authored, manifest: bundle.manifest }, null, 2),
    presentationHead: `${p.layout} · ${p.arrangement}`,
    regions: p.regions.map((r) => ({
      name: r.name,
      role: r.role,
      priority: r.priority,
      disclosure: r.disclosure,
      presentation: r.presentation ?? null,
      rationale: r.rationale ?? null,
    })),
    documentJson: JSON.stringify(session.document, null, 2),
    treeJson: JSON.stringify(tree, null, 2),
    traces: session.traces.map((t: TraceEvent) => ({
      event: t.event,
      node: t.node ?? "",
      detail: t.detail && Object.keys(t.detail).length > 0 ? JSON.stringify(t.detail) : "",
    })),
    patchLabel: `last patch: rev ${patch?.rev ?? "—"} · ${patch?.ops.length ?? 0} op(s)`,
  };
}
