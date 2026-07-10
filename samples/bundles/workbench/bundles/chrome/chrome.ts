// The chrome runtime helpers. The workbench's own panels + manifest + seed state are DATA — authored
// in ./bundle.json and loaded by the shared floor host (see Workbench.tsx), exactly like the console.
// The workbench dogfoods the platform down to its own chrome.
//
// What stays code here: the custom capability VIEWS (workbenchComponents) attached to each bundle,
// and the BRIDGE HELPERS below. The bridge (Workbench.tsx) reads the `workbench` namespace, re-runs
// the pure pipeline, and drives the guest across the native cross-kernel seam — behaviour the kernel
// action grammar can't express, so it stays native.

import {
  type Json,
  type ResolvedNode,
} from "../../../../../kernel/src/index";
import { bundleFromJson, type Bundle } from "../../../../../adapters/react/src/index";
import {
  emptyEdits,
  type AuthoredSession,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
  type PresentationEdits,
} from "../../../../../interaction/src/index";
import { workbenchComponents } from "../shared/registry";
import chromeBundleJson from "./bundle.json";

interface Option {
  value: string;
  label: string;
  [k: string]: string;
}

/** Flatten an imported artifact into the `importApply` event payload (every axis defaulted). */
export function authoredApplyPayload(a: AuthoredSession): Record<string, Json> {
  const ctx = a.context ?? { surface: "desktop" };
  const axis = (k: string): string => String((ctx as Record<string, unknown>)[k] ?? "");
  return {
    interaction: a.interaction.interaction,
    subject: a.interaction.subject ?? "",
    surface: ctx.surface ?? "desktop",
    device: axis("device"),
    space: axis("space"),
    attention: axis("attention"),
    expertise: axis("expertise"),
    edits: a.edits,
  };
}

/**
 * The chrome BUNDLE: the left control column as a self-contained app — manifest + document + seed
 * state authored in ./bundle.json, with its custom capability views attached here. Loaded by the
 * shared floor host (see Workbench.tsx), exactly like the console. The `workbench`->guest bridge (also
 * in Workbench.tsx) is the native seam that carries fired events across kernels.
 */
export const chromeBundle: Bundle = bundleFromJson(chromeBundleJson, { projectionViews: workbenchComponents });

/** The minimal read-only state surface the native bridge helpers need. */
export interface StateReader {
  get(path: string): Json | undefined;
}

/** Read the current guest inputs (interaction spec + presentation context + edits) out of state. */
export function readInputs(state: StateReader): {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
} {
  const interaction = (String(state.get("workbench.interaction") || "investigate") as InteractionKind);
  const subject = String(state.get("workbench.subject") ?? "");
  const ctx: PresentationContext = {
    surface: (String(state.get("workbench.surface") || "desktop") as PresentationContext["surface"]),
  };
  for (const axis of ["device", "space", "attention", "expertise"] as const) {
    const v = state.get(`workbench.${axis}`);
    if (v) (ctx as Record<string, unknown>)[axis] = v;
  }
  return { spec: { interaction, subject }, ctx, edits: readEdits(state) };
}

/** The authoring session's presentation overrides, read from state (seeded, so always present). */
export function readEdits(state: StateReader): PresentationEdits {
  const raw = state.get("workbench.edits");
  return raw ? (raw as unknown as PresentationEdits) : emptyEdits;
}

/** A stable signature of the guest inputs, so the bridge only rebuilds when they actually change. */
export function inputsSignature(inputs: {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
}): string {
  return JSON.stringify(inputs);
}

// --- Event bar (Increment C) ------------------------------------------------------

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

/** A fired event resolved from chrome state: the target/name/payload plus any parse error. */
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
