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

import type { CapabilityDescriptor, Enveloped, ProjectedVocabularyManifest } from "@gik/kernel";

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
  "growing-container": { propsSchema: anyProps, slots: ["children"] }, // fills parent, owns overflow, follows appended content

  // --- Text / status ---
  text: { propsSchema: anyProps }, // value + variant (title|subtitle|body|caption|code|muted)
  heading: { propsSchema: anyProps }, // value + level
  note: { propsSchema: anyProps }, // value + tone (muted|info|toast|...)
  badge: { propsSchema: anyProps }, // value + tone
  alert: { propsSchema: anyProps }, // value + label + level (good|warn|bad|unknown)
  metric: { propsSchema: anyProps }, // label + value
  property: { propsSchema: anyProps }, // labeled body-size text attribute (identifier/enum/short phrase)
  narrative: { propsSchema: anyProps, dataProp: "text" }, // read-only narrative copy with empty fallback
  codeBlock: { propsSchema: anyProps }, // scrollable monospace block for JSON/code dumps (reads `code`)
  chart: { propsSchema: anyProps, dataProp: "data" }, // read-only chart: spec + bound data -> native render
  markdown: { propsSchema: anyProps, dataProp: "value" }, // markdown text, rendered read-only
  markup: { propsSchema: anyProps, dataProp: "value" }, // explicit alias of markdown
  todo: { propsSchema: anyProps, emits: ["save"], dataProp: "items" }, // committed todo list: bound items + save {items}
  timeline: { propsSchema: anyProps, dataProp: "items" }, // read-only time-ordered item list
  stats: { propsSchema: anyProps, dataProp: "items" }, // read-only metric list
  diff: { propsSchema: anyProps, dataProp: "value" }, // read-only before/after comparison: bound { before, after }
  maplist: { propsSchema: anyProps, dataProp: "rows" }, // read-only directional mapping rows: { from, to }
  vocabulary: { propsSchema: anyProps, dataProp: "groups" }, // read-only closed-grammar catalog: groups of terms
  actions: { propsSchema: anyProps, emits: ["press"], dataProp: "buttons" }, // button row, emits press {id}
  notes: { propsSchema: anyProps, emits: ["save"], dataProp: "content" }, // committed notes editor: content + save {content}
  "editable-table": { propsSchema: anyProps, emits: ["save"], dataProp: "rows" }, // committed editable grid: spec + bound rows -> save {rows}
  "multi-file-upload": { propsSchema: anyProps, emits: ["submit"], dataProp: "data" }, // grouped files + staged upload composer, submit emits metadata

  // --- Data display (bind data into `items`/`rows`) ---
  list: { propsSchema: anyProps, emits: ["select"] }, // items + field-key spec, emits select {id}
  table: { propsSchema: anyProps, emits: ["rowSelect"] }, // rows + columns, emits rowSelect {id}
  selection: { propsSchema: anyProps, emits: ["select"], dataProp: "options" }, // single-field committed picker

  // --- Inputs (emit interaction; documents route via `on`) ---
  field: { propsSchema: anyProps, emits: ["input"] }, // label + value + placeholder
  textarea: { propsSchema: anyProps, emits: ["input"] },
  select: { propsSchema: anyProps, emits: ["change"] }, // label + value + options
  form: { propsSchema: anyProps, emits: ["save"] }, // schema-ish committed form, emits save {values}
  "json-field": { propsSchema: anyProps, emits: ["save"], dataProp: "value" }, // single json textarea = one-field committed form, emits save {values}
  button: { propsSchema: anyProps, emits: ["press"] }, // label + tone + disabled
  "timer-button": { propsSchema: anyProps, emits: ["press"] }, // countdown button, emits press {reason}
  "math-challenge": { propsSchema: anyProps, emits: ["confirm", "cancel"] }, // destructive confirmation gate
  tabBar: { propsSchema: anyProps, emits: ["select"] }, // active + options, emits select {value}
  chips: { propsSchema: anyProps, emits: ["remove"] }, // items + emits remove {value}
  searchbox: { propsSchema: anyProps, emits: ["submit"], dataProp: "value" }, // committed single-field search input
  query: { propsSchema: anyProps, emits: ["submit"], dataProp: "value" }, // explicit alias of searchbox

  // --- Composition: embed a whole bundle/app as a nested runtime ---
  embed: { propsSchema: anyProps }, // props.app: registered app by name | props.bundle: inline { vocabulary, program, state }
};

/**
 * The floor's READ-KEY CONTRACT: for each capability that accepts bound document data, the named
 * props a lowering recipe may bind through `read` (canonical prop first, then any defensive aliases
 * the leaf also consumes). This is the machine-checkable half of "honor the contracts": a recipe
 * that binds `read.schema` on `ui:form` (which reads `fields`) or `read.items` on `ui:actions`
 * (which reads `buttons`) is a silent no-op at render time, and only this table catches it.
 *
 * Keep in sync with the leaf implementations in registry.tsx. Capabilities absent here accept no
 * bound `read` keys (pure props-configured leaves). The `dataProp` declared on a capability above
 * MUST appear in its entry here (enforced by the floor read-contract test).
 */
export const FLOOR_READ_KEYS: Record<string, string[]> = {
  // containers
  panel: ["data", "children"],
  // text / status / display
  metric: ["value", "label"],
  property: ["value", "label"],
  narrative: ["text", "value"],
  codeBlock: ["code"],
  chart: ["data"],
  markdown: ["value", "text"],
  markup: ["value", "text"],
  timeline: ["items"],
  stats: ["items"],
  diff: ["value", "data", "before", "after"],
  maplist: ["rows"],
  vocabulary: ["groups"],
  // committed / interactive
  todo: ["items"],
  actions: ["buttons", "items", "actions"],
  notes: ["content", "value"],
  "editable-table": ["rows"],
  "multi-file-upload": ["data", "files", "filegroups"],
  // data display
  list: ["items"],
  table: ["rows", "columns"],
  selection: ["options", "value"],
  // inputs
  field: ["value"],
  textarea: ["value"],
  select: ["value", "options"],
  "timer-button": ["durationMs", "disabled"],
  "math-challenge": ["message"],
  form: ["fields", "schema", "value", "data"],
  "json-field": ["value", "data"],
  searchbox: ["value"],
  query: ["value"],
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
export function bundleManifest(opts: BundleManifestOptions): Enveloped<ProjectedVocabularyManifest> {
  const primitives = Object.fromEntries(
    Object.entries(PRIMITIVE_CAPABILITIES).map(([k, v]) => [`${FLOOR_ALIAS}:${k}`, v])
  );
  return {
    gik: "0.1",
    type: "vocabulary",
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
