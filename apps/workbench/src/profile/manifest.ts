// The WORKBENCH PROFILE — the chrome's own GUP manifest. It is a profile in exactly the same
// sense as live-cards: a manifest (capability vocabulary) + a React registry (see registry.tsx).
// This is the workbench dogfooding the platform: the tool's panels are a declarative GenUI
// document rendered by the same kernel + adapter, not hand-written React.
//
// The controls are form-like: each reads its value from the `workbench` namespace (a `read` edge)
// and writes back on interaction (an `on` handler running `assignFrom`), so a knob turn is just a
// kernel event that patches state. A bridge (see chrome.ts) watches that state and re-runs the
// pure pipeline to drive the guest.

import type { Enveloped, ManifestPayload } from "../../../../kernel/src/index";

/** Loose object schema — the workbench trusts its own authored document, so props stay permissive. */
const anyProps = { type: "object", additionalProperties: true } as const;

export const WORKBENCH_MANIFEST: Enveloped<ManifestPayload> = {
  gup: "0.1",
  type: "manifest",
  payload: {
    version: "workbench-chrome/1.0",
    expression: "jsonata",
    namespaces: ["workbench", "inspect"],
    actions: ["assign", "derive", "emit", "invoke", "navigate", "confirm"],
    capabilities: {
      // A transparent grouping node: renders its children in order (the column body).
      panelGroup: { propsSchema: anyProps, slots: ["children"] },
      // A titled section (floor `panel`, styled to match the chrome).
      panel: { propsSchema: anyProps, slots: ["children"] },
      // A labelled <select>; value binds from state, choosing emits `change` with { value }.
      select: { propsSchema: anyProps, emits: ["change"] },
      // A labelled text <input> (floor `field`); typing emits `input` with { value }.
      field: { propsSchema: anyProps, emits: ["input"] },
      // A read-only list of the interaction's facets ({ name, role, required }[]).
      facetList: { propsSchema: anyProps },
      // The editing surface: an editable list of regions. Toggling / re-prioritizing / disclosing /
      // reordering a region emits `edit` with the full override set ({ edits }).
      regionEditor: { propsSchema: anyProps, emits: ["edit"] },
      // --- Event bar (Increment C) ---
      // A labelled <textarea> (JSON payload); typing emits `input` with { value }.
      textarea: { propsSchema: anyProps, emits: ["input"] },
      // A push button; clicking emits `press`.
      button: { propsSchema: anyProps, emits: ["press"] },
      // A one-line status/error note (shown via a gate).
      note: { propsSchema: anyProps },
      // The agent tour as a numbered step list; the active step (bound to `active`) is highlighted.
      stepList: { propsSchema: anyProps },
      // --- Inspector (Increment B) ---
      // A row of tab buttons; selecting one emits `select` with { value }.
      tabBar: { propsSchema: anyProps, emits: ["select"] },
      // The Presentation-DSL region table (head string + region rows).
      regionTable: { propsSchema: anyProps },
      // A read-only pretty-printed code/JSON block.
      codeBlock: { propsSchema: anyProps },
      // The live trace list (label + trace rows).
      traceList: { propsSchema: anyProps },
    },
  },
};
