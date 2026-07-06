// The PLATFORM FLOOR, part 6: the COMMON Playground bundle builder.
//
// A Playground is the interactive surface a profile is exercised in. There is ONE builder — shared
// by every profile — that turns a profile spec (a name + its capabilities) into a SerializableBundle
// the `bundle` primitive embeds as a nested runtime. "Preview" is not a separate thing: it is simply
// the Playground built in `"preview"` mode (read-only cards). `"interactive"` mode adds per-card
// selection wired declaratively (each card's button `assign`s the nested bundle's own `pg.selected`),
// so the whole surface stays JSON — no bespoke React, no effect handlers, and it composes via the
// same bundle-in-bundle mechanism the console already uses.

import { assign, authorDocument, node, type DocNode } from "../../../../kernel/src/index";
import { bundleManifest } from "./manifest";
import type { SerializableBundle } from "./bundle";

export type PlaygroundMode = "preview" | "interactive";

export interface PlaygroundSpec {
  /** Title shown on the playground board. */
  name: string;
  /** The profile's capabilities — one card is rendered per capability. */
  capabilities: string[];
  /** `"preview"` = read-only cards (the Preview variant); `"interactive"` = selectable cards. */
  mode?: PlaygroundMode;
}

const PLAYGROUND_VERSION = "genui-playground/1.0";

function previewCard(cap: string): DocNode {
  return node("panel", `card-${cap}`, {
    props: { variant: "preview-card" },
    children: [
      node("text", `cap-${cap}`, { props: { value: cap, variant: "code" } }),
      node("text", `slot-${cap}`, { props: { value: "rendered region", variant: "caption" } }),
    ],
  });
}

function interactiveCard(cap: string): DocNode {
  // The card's button selects this capability by assigning a LITERAL value into the nested bundle's
  // own `pg.selected` — a UI-only edit, so it needs no effect handler and stays pure JSON.
  return node("panel", `card-${cap}`, {
    props: { variant: "preview-card" },
    children: [
      node("button", `pick-${cap}`, {
        props: { label: cap, tone: "default" },
        on: { press: [assign("pg.selected", cap)] },
      }),
      node("text", `slot-${cap}`, { props: { value: "click to select", variant: "caption" } }),
    ],
  });
}

/**
 * Build the shared Playground bundle for a profile spec. `mode` selects the variant:
 * `"preview"` (default) renders read-only cards; `"interactive"` makes each card selectable and
 * shows the current selection. The returned bundle is fully serializable, so it can be stored in a
 * host's state and embedded via the `bundle` primitive.
 */
export function buildPlaygroundBundle(spec: PlaygroundSpec): SerializableBundle {
  const mode: PlaygroundMode = spec.mode ?? "preview";
  const interactive = mode === "interactive";
  const caps = spec.capabilities;

  const cards: DocNode[] =
    caps.length > 0
      ? caps.map((cap) => (interactive ? interactiveCard(cap) : previewCard(cap)))
      : [
          node("note", "empty", {
            props: {
              value: "No capabilities yet — add some in the Editor tab.",
              tone: "muted",
            },
          }),
        ];

  const children: DocNode[] = [...cards];
  if (interactive) {
    // A footer that reflects the nested bundle's own selection state (value read, not inlined into
    // an expression — safe for any capability string), shown only once something is selected.
    children.push(
      node("note", "selection", {
        props: { tone: "info" },
        read: { value: "pg.selected" },
        gate: "pg.selected != ''",
      })
    );
  }

  const root = node("panel", "preview-root", {
    props: { variant: "preview-board", title: spec.name || "Untitled profile" },
    children,
  });

  return {
    manifest: bundleManifest({ version: PLAYGROUND_VERSION, namespaces: ["pg"] }),
    document: authorDocument(root, { manifest: PLAYGROUND_VERSION }),
    state: { pg: { selected: "" } },
  };
}

/**
 * The standalone Playground *app* — the same shared builder, wrapped as a named-mountable bundle.
 * Registered under a name (e.g. `"playground"`), it can be hosted anywhere: as the outermost mount
 * of an app shell, or as a `bundle` leaf inside another bundle (`props.app: "playground"`). This is
 * the concrete proof that "an app is just a bundle, hostable anywhere" — the standalone Playground
 * and an embedded one are the exact same bundle.
 */
export function playgroundApp(): SerializableBundle {
  return buildPlaygroundBundle({
    name: "Playground",
    capabilities: ["board", "metric", "table", "actions"],
    mode: "interactive",
  });
}
