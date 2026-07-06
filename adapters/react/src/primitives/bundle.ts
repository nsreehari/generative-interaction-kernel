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
  Kernel,
  bufferSink,
  unwrap,
  type DocumentMessage,
  type Enveloped,
  type Json,
  type ManifestPayload,
} from "../../../../kernel/src/index";
import { GenUIController } from "../controller";
import { createEffectDispatcher, type EffectHandlerMap } from "./effects";
import type { CapabilityView } from "../registry";

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
  effects?: EffectHandlerMap;
  /** EXTRA capability -> component, layered over the shared floor when this bundle renders. */
  components?: Record<string, CapabilityView>;
}

/** The native code a JSON bundle attaches when it loads: named effects and/or extra components. */
export interface BundleNative {
  effects?: EffectHandlerMap;
  components?: Record<string, CapabilityView>;
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
    throw new Error("bundleFromJson: missing or invalid `manifest` (expected a GUP manifest message)");
  }
  if (!isEnvelope(b.document, "document")) {
    throw new Error("bundleFromJson: missing or invalid `document` (expected a GUP document message)");
  }
  if (b.state != null && (typeof b.state !== "object" || Array.isArray(b.state))) {
    throw new Error("bundleFromJson: `state` must be an object of namespace -> value");
  }
  return {
    manifest: b.manifest as SerializableBundle["manifest"],
    document: b.document as SerializableBundle["document"],
    state: b.state,
    effects: native.effects,
    components: native.components,
  };
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

/**
 * Stand up a runtime for a bundle, exposing BOTH the controller and its state model. Most hosts want
 * only the controller (`loadBundle`); the state is exposed for the rare host that must bridge two
 * bundles across kernel boundaries (e.g. the workbench chrome reading its state to drive a guest) —
 * an irreducibly native seam the closed action grammar can't express.
 */
export function loadBundleRuntime(bundle: Bundle): BundleRuntime {
  const state = seedState(bundle.manifest, bundle.state);
  const orchestrator = createEffectDispatcher(state, bundle.effects ?? {});
  const kernel = new Kernel(bundle.manifest, bundle.document, {
    state,
    orchestrator,
    sink: bufferSink().sink,
  });
  return { controller: new GenUIController(kernel), state };
}

/** Stand up a runtime for a bundle and return its controller. */
export function loadBundle(bundle: Bundle): GenUIController {
  return loadBundleRuntime(bundle).controller;
}

/** A stable signature so an embedded bundle only rebuilds when its JSON actually changes. */
export function bundleSignature(bundle: SerializableBundle | null | undefined): string {
  if (!bundle) return "";
  return JSON.stringify([bundle.manifest, bundle.document, bundle.state]);
}
