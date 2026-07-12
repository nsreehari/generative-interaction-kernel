// The leaf/capability authoring track — a SEPARATE validator from document authoring. Document
// validation asks "does this document use capabilities correctly?"; this asks "is this capability
// definition well-formed?". JSON-shaped, transport-free; the C# peer is CapabilityAuthoring.

import { unwrap } from "../../kernel/src/index";
import type { CapabilityDescriptor } from "../../kernel/src/index";

export interface CapabilityReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: { code: string; node?: string; detail: string }[];
}

/** A minimal view of the registry: which capability ids have a render binding, and which are floor. */
export interface RegistryView {
  bindings?: string[];
  floor?: string[];
}

/** Validate a capability descriptor as a definition. An optional registry view enables the
 *  render-binding and floor-shadow warnings. Errors are fatal; warnings are non-fatal. */
export function validateCapability(
  capability: unknown,
  registryView?: RegistryView
): CapabilityReport {
  const cap = unwrap(capability) as CapabilityDescriptor & { id?: unknown };
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const id = typeof cap.id === "string" ? cap.id : undefined;
  const warn = (code: string, detail: string) => warnings.push({ code, node: id, detail });

  if (!id) errors.push({ detail: "capability.id (non-empty string) is required" });

  const propsSchema = cap.propsSchema;
  if (
    propsSchema !== undefined &&
    (typeof propsSchema !== "object" || propsSchema === null || Array.isArray(propsSchema))
  ) {
    errors.push({ detail: "capability.propsSchema must be an object (JSON Schema)" });
  }

  if (
    cap.emits !== undefined &&
    (!Array.isArray(cap.emits) || cap.emits.some((e) => typeof e !== "string"))
  ) {
    errors.push({ detail: "capability.emits must be an array of strings" });
  }

  if (
    cap.slots !== undefined &&
    (!Array.isArray(cap.slots) || cap.slots.some((s) => typeof s !== "string"))
  ) {
    errors.push({ detail: "capability.slots must be an array of strings" });
  }

  if (cap.dataProp !== undefined) {
    if (typeof cap.dataProp !== "string") {
      errors.push({ detail: "capability.dataProp must be a string" });
    } else {
      const props = (propsSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
      if (props && typeof props === "object" && !(cap.dataProp in props)) {
        warn("dataprop-not-in-schema", `dataProp '${cap.dataProp}' is not a property of propsSchema`);
      }
    }
  }

  if (registryView && id) {
    const bindings = new Set(registryView.bindings ?? []);
    const floor = new Set(registryView.floor ?? []);
    if (bindings.size > 0 && !bindings.has(id)) {
      warn("missing-render-binding", `capability '${id}' has no render binding in the registry`);
    }
    if (floor.has(id)) {
      warn("shadows-floor", `capability '${id}' shadows a shared-floor capability (additive overlay wins on collision)`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
