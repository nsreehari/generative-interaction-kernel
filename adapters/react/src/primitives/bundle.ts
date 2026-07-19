// The PLATFORM FLOOR, part 3: the bundle model + loader.
//
// A BUNDLE is the unit the generic host runs: { manifest, document, state, effects }. The console,
// the playground, preview, and every profile are bundles. `loadBundle` stands up a runtime for one
// (kernel + shared state + effect dispatcher) and returns a controller the React layer renders.
//
// Bundles COMPOSE: an `embed` primitive embeds a SerializableBundle (manifest + document + state,
// all JSON) as a nested runtime. That is what makes "a JSON bundle can be composed of other JSON
// bundles" real — e.g. the playground bundle embeds the edited profile's bundle.

import {
  InMemoryStateModel,
  CompositeStateModel,
  Kernel,
  bufferSink,
  unwrap,
  type OrchestratorResult,
  type DocumentMessage,
  type Enveloped,
  type Json,
  type ManifestPayload,
  type Orchestrator,
  type StateModel,
} from "@gik/kernel";
import { GenUIController } from "../controller";
import { createEffectDispatcher, type EffectHandlerMap } from "./effects";
import type { ProjectionView } from "../registry";

const BUNDLE_INIT_EFFECT = "$init";

/** The JSON-only part of a bundle — safe to store in state and embed via the `embed` primitive. */
export interface SerializableBundle {
  manifest: Enveloped<ManifestPayload>;
  document: DocumentMessage;
  /** Seed value per namespace (namespace -> initial object). */
  state?: Record<string, Json>;
}

/** A full bundle: the JSON parts plus any native code the bundle needs (functions). */
export interface Bundle extends SerializableBundle {
  /** Named native effect handlers routed by `invoke`. */
  effectHandlers?: EffectHandlerMap;
  /** EXTRA capability -> component, layered over the shared floor when this bundle renders. */
  projectionViews?: Record<string, ProjectionView>;
  /** Optional bundle-native service composition around its effect dispatcher. */
  wrapOrchestrator?: LoadBundleOptions["wrapOrchestrator"];
}

/** The native code a JSON bundle attaches when it loads: named effects and/or extra components. */
export interface BundleNative {
  effectHandlers?: EffectHandlerMap;
  projectionViews?: Record<string, ProjectionView>;
  wrapOrchestrator?: LoadBundleOptions["wrapOrchestrator"];
}

function isEnvelope(value: unknown, type: "manifest" | "document"): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === type &&
    "payload" in (value as object)
  );
}

/**
 * The "everything is JSON" entry point: turn a parsed-JSON bundle (an imported `.json` file, a
 * fetched document, a bundle stored in state) into a runnable `Bundle`, attaching only the native
 * code it needs (effect handlers and/or extra components). The manifest, document, and seed state
 * are pure data — adding an app is authoring JSON, not TypeScript.
 *
 * This is a system boundary, so the JSON is validated: a malformed bundle throws instead of failing
 * deep inside the kernel. The returned bundle is ready for `BundleHost` / `loadBundle`.
 */
export function bundleFromJson(json: unknown, native: BundleNative = {}): Bundle {
  if (!json || typeof json !== "object") {
    throw new Error("bundleFromJson: expected a bundle object");
  }
  const b = json as Partial<SerializableBundle>;
  if (!isEnvelope(b.manifest, "manifest")) {
    throw new Error("bundleFromJson: missing or invalid `manifest` (expected a GIK manifest message)");
  }
  if (!isEnvelope(b.document, "document")) {
    throw new Error("bundleFromJson: missing or invalid `document` (expected a GIK document message)");
  }
  if (b.state != null && (typeof b.state !== "object" || Array.isArray(b.state))) {
    throw new Error("bundleFromJson: `state` must be an object of namespace -> value");
  }
  return {
    manifest: b.manifest as SerializableBundle["manifest"],
    document: b.document as SerializableBundle["document"],
    state: b.state,
    effectHandlers: native.effectHandlers,
    projectionViews: native.projectionViews,
    wrapOrchestrator: native.wrapOrchestrator,
  };
}

/**
 * Enforce a bundle's `externals.effectHandlers` contract at mount: every effect-handler name the
 * manifest declares it needs must be present in the bundle's native `effectHandlers`. This turns the
 * declared-and-linted contract (authoring emits an `undeclared-effect` warning) into a hard mount-time
 * gate — a missing handler otherwise silently no-ops the `invoke` deep in the reducer at runtime.
 *
 * Scoped to `effectHandlers` only, on purpose: `externals.projectionViews` are provider imports
 * resolved against the floor/embed registries elsewhere (not against `bundle.projectionViews`), so
 * checking them here would false-positive on every floor import. Effect handlers do not cross the
 * `embed` boundary — each nested bundle gets its own dispatcher — so a bundle must itself supply every
 * effect it declares. Throws (fail-fast at the boundary) rather than warning; a no-op guard means an
 * undeclared `externals.effectHandlers` bundle is left untouched.
 */
export function assertExternalsSatisfied(bundle: Bundle): void {
  const required = unwrap(bundle.manifest).externals?.effectHandlers;
  if (!required || required.length === 0) return;
  const supplied = bundle.effectHandlers ?? {};
  const missing = required.filter((name) => !(name in supplied));
  if (missing.length > 0) {
    throw new Error(
      `bundle: missing required effect handler(s) declared in manifest externals.effectHandlers: ${missing.join(", ")}`
    );
  }
}

/** Build a seeded state model from a manifest's namespaces and a bundle's seed values. */
export function seedState(
  manifest: Enveloped<ManifestPayload>,
  state?: Record<string, Json>
): InMemoryStateModel {
  const namespaces = unwrap(manifest).namespaces ?? [];
  const model = new InMemoryStateModel(namespaces);
  if (state) {
    model.apply(
      Object.entries(state).map(([ns, value]) => ({ op: "set" as const, path: ns, value }))
    );
  }
  return model;
}

/** A bundle's live runtime: the controller plus the state model it reads/writes. */
export interface BundleRuntime {
  controller: GenUIController;
  state: InMemoryStateModel;
}

export interface LoadBundleOptions {
  contexts?: Record<string, StateModel>;
  wrapOrchestrator?: (fallback: Orchestrator, state: StateModel) => Orchestrator;
}

function applyBundleInit(bundle: Bundle, state: InMemoryStateModel): void {
  const init = bundle.effectHandlers?.[BUNDLE_INIT_EFFECT];
  if (!init) return;
  const result = init({
    get: (path) => state.get(path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: state,
  });
  if (result && typeof (result as Promise<unknown>).then === "function") {
    throw new Error(`bundle: ${BUNDLE_INIT_EFFECT} must be synchronous`);
  }
  const syncResult = result as OrchestratorResult | void;
  const ops = syncResult?.ops;
  if (ops && ops.length > 0) {
    state.apply(ops);
  }
}

/**
 * Stand up a runtime for a bundle, exposing BOTH the controller and its state model. Most hosts want
 * only the controller (`loadBundle`); the state is exposed for the rare host that must bridge two
 * bundles across kernel boundaries through an explicit host-owned integration.
 */
export function loadBundleRuntime(
  bundle: Bundle,
  contextsOrOptions?: Record<string, StateModel> | LoadBundleOptions
): BundleRuntime {
  assertExternalsSatisfied(bundle);
  const options = contextsOrOptions && ("contexts" in contextsOrOptions || "wrapOrchestrator" in contextsOrOptions)
    ? contextsOrOptions as LoadBundleOptions
    : { contexts: contextsOrOptions as Record<string, StateModel> | undefined };
  const contexts = options.contexts;
  const state = seedState(bundle.manifest, bundle.state);
  applyBundleInit(bundle, state);
  const runtimeState = contexts && Object.keys(contexts).length > 0
    ? new CompositeStateModel(state, contexts)
    : state;
  const fallback = createEffectDispatcher(runtimeState, bundle.effectHandlers ?? {});
  const bundleOrchestrator = bundle.wrapOrchestrator?.(fallback, runtimeState) ?? fallback;
  const orchestrator = options.wrapOrchestrator?.(bundleOrchestrator, runtimeState) ?? bundleOrchestrator;
  const kernel = new Kernel(bundle.manifest, bundle.document, {
    state: runtimeState,
    orchestrator,
    sink: bufferSink().sink,
  });
  return { controller: new GenUIController(kernel), state };
}

/** Stand up a runtime for a bundle and return its controller. */
export function loadBundle(
  bundle: Bundle,
  contextsOrOptions?: Record<string, StateModel> | LoadBundleOptions
): GenUIController {
  return loadBundleRuntime(bundle, contextsOrOptions).controller;
}

/** A stable signature so an embedded bundle only rebuilds when its JSON actually changes. */
export function bundleSignature(bundle: SerializableBundle | null | undefined): string {
  if (!bundle) return "";
  return JSON.stringify([bundle.manifest, bundle.document, bundle.state]);
}
