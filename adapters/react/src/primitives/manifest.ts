// The PLATFORM FLOOR, part 1: the fixed, shared primitive capability vocabulary.
//
// This is the GenUI equivalent of the demo-boards-frontend's Tier-1 `cardViewEntries`: a single,
// shared set of leaf capabilities that EVERY app/tool/profile composes from. Apps do not declare
// their own capabilities — they reuse these. Adding an app is JSON; only adding a *primitive* (a
// rare, platform-level event) touches this file and the matching component in registry.tsx.
//
// Each capability is generic and configured through props (its open "spec" namespace) plus read
// edges that bind data into named props. `emits` documents the events a primitive raises so
// documents can wire `on` handlers to them.

import type { CapabilityDescriptor, Enveloped, ManifestPayload } from "../../../../kernel/src/index";

const anyProps = { type: "object", additionalProperties: true } as const;

/** The closed set of standardized action verbs available to any bundle's documents. */
export const PRIMITIVE_ACTIONS = [
  "assign",
  "assignFrom",
  "derive",
  "invoke",
  "route",
  "confirm",
  "emit",
] as const;

/**
 * The shared primitive vocabulary. Kinds are intentionally generic (screen/row/col/panel/text/
 * list/field/button/...) so the same set renders the console, the playground, preview, and any
 * domain profile.
 */
export const PRIMITIVE_CAPABILITIES: Record<string, CapabilityDescriptor> = {
  // --- Layout / containers ---
  screen: { propsSchema: anyProps, slots: ["children"] }, // app shell: title/subtitle band + body
  row: { propsSchema: anyProps, slots: ["children"] }, // horizontal stack
  col: { propsSchema: anyProps, slots: ["children"] }, // vertical stack
  panel: { propsSchema: anyProps, slots: ["children"] }, // titled/variant container

  // --- Text / status ---
  text: { propsSchema: anyProps }, // value + variant (title|subtitle|body|caption|code|muted)
  heading: { propsSchema: anyProps }, // value + level
  note: { propsSchema: anyProps }, // value + tone (muted|info|toast|...)
  badge: { propsSchema: anyProps }, // value + tone
  metric: { propsSchema: anyProps }, // label + value
  codeBlock: { propsSchema: anyProps }, // scrollable monospace block for JSON/code dumps (reads `code`)
  chart: { propsSchema: anyProps, dataProp: "data" }, // read-only chart: spec + bound data -> native render
  markdown: { propsSchema: anyProps, dataProp: "value" }, // markdown text, rendered read-only
  markup: { propsSchema: anyProps, dataProp: "value" }, // explicit alias of markdown
  todo: { propsSchema: anyProps, emits: ["save"], dataProp: "items" }, // committed todo list: bound items + save {items}
  editableTable: { propsSchema: anyProps, emits: ["save"], dataProp: "rows" }, // committed editable grid: spec + bound rows -> save {rows}
  multiFileUpload: { propsSchema: anyProps, emits: ["submit"], dataProp: "data" }, // grouped files + staged upload composer, submit emits metadata

  // --- Data display (bind data into `items`/`rows`) ---
  list: { propsSchema: anyProps, emits: ["select"] }, // items + field-key spec, emits select {id}
  table: { propsSchema: anyProps, emits: ["rowSelect"] }, // rows + columns, emits rowSelect {id}
  selection: { propsSchema: anyProps, emits: ["select"], dataProp: "options" }, // single-field committed picker

  // --- Inputs (emit interaction; documents route via `on`) ---
  field: { propsSchema: anyProps, emits: ["input"] }, // label + value + placeholder
  textarea: { propsSchema: anyProps, emits: ["input"] },
  select: { propsSchema: anyProps, emits: ["change"] }, // label + value + options
  button: { propsSchema: anyProps, emits: ["press"] }, // label + tone + disabled
  tabBar: { propsSchema: anyProps, emits: ["select"] }, // active + options, emits select {value}
  chips: { propsSchema: anyProps, emits: ["remove"] }, // items + emits remove {value}
  searchbox: { propsSchema: anyProps, emits: ["submit"], dataProp: "value" }, // committed single-field search input
  query: { propsSchema: anyProps, emits: ["submit"], dataProp: "value" }, // explicit alias of searchbox

  // --- Composition: embed a whole bundle/app as a nested runtime ---
  embed: { propsSchema: anyProps }, // props.app: registered app by name | props.bundle: inline { manifest, document, state }
};

export interface BundleManifestOptions {
  version: string;
  namespaces?: string[];
  /** Extra capabilities beyond the shared primitives (rarely needed). Keys must be namespaced. */
  extraCapabilities?: Record<string, CapabilityDescriptor>;
}

/** The alias every bundleManifest imports the shared floor primitives under. */
export const FLOOR_ALIAS = "ui";

/**
 * Build a manifest for a bundle. Its capabilities are the shared primitives (plus any rare extras),
 * imported under the `ui` alias from the floor provider — so every capability is referenced as
 * `ui:name` and the bundle declares its outward dependency contract in `externals`. A bundle only
 * has to declare its state namespaces and a version — never its own vocabulary.
 */
export function bundleManifest(opts: BundleManifestOptions): Enveloped<ManifestPayload> {
  const primitives = Object.fromEntries(
    Object.entries(PRIMITIVE_CAPABILITIES).map(([k, v]) => [`${FLOOR_ALIAS}:${k}`, v])
  );
  return {
    gup: "0.1",
    type: "manifest",
    payload: {
      version: opts.version,
      expression: "jsonata",
      namespaces: opts.namespaces ?? [],
      actions: [...PRIMITIVE_ACTIONS],
      capabilities: { ...primitives, ...(opts.extraCapabilities ?? {}) },
      externals: { projectionViews: { [FLOOR_ALIAS]: { from: "floor" } } },
    },
  };
}
