// The bundle switcher, as a BUNDLE — host chrome dogfooding the platform.
//
// Rather than a bespoke React widget wired imperatively into the host tree, the switcher is a tiny
// leaf bundle (this folder's manifest/document + a seeded `switcher` namespace) that the host mounts
// as an overlay through the SAME `BundleHost` it uses for every app. Its one custom capability,
// `host:applicationSwitcher`, is a dumb token-styled view: it reads its bound `items`/`current` props and
// reports a pick through `emit("select", { application })`. The kernel routes that to the document's `on`
// handler — `invoke("switchApplication")` — and the native effect below performs the consequential
// navigation. No colors are hardcoded: styling is `.gx-switcher*` classes bound to the ambient,
// host-owned theme roles (theme/roles.json), exactly like the floor.

import React from "react";
import manifest from "./manifest.json";
import document from "./document.json";
import {
  bundleFromJson,
  readProps,
  type Bundle,
  type ProjectionViewProps,
  type EffectHandlerMap,
} from "@gik/react";

/** A "layers/stack" glyph — bundles are stacked cards; picking one swaps the whole stack. */
function SwitcherIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

/** The `host:bundleSwitcher` view: a collapsed bubble that expands on hover into a bundle list. */
function ApplicationSwitcherView({ node, emit }: ProjectionViewProps): React.ReactElement {
  const p = readProps(node);
  const items = p.list<string>("items");
  const current = p.str("current");

  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="gx-switcher"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div className="gx-switcher-panel" role="menu" aria-label="Switch application">
          <div className="gx-switcher-head">Application</div>
          {items.map((id) => {
            const selected = id === current;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "gx-switcher-row selected" : "gx-switcher-row"}
                onClick={() => !selected && emit("select", { application: id })}
              >
                <span className="gx-switcher-check" aria-hidden="true">
                  {selected ? "\u2713" : ""}
                </span>
                <span>{id}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          className="gx-switcher-bubble"
          aria-label={`Current application: ${current}. Hover to switch.`}
          onClick={() => setOpen(true)}
        >
          <SwitcherIcon />
        </button>
      )}
    </div>
  );
}

const switcherEffects: EffectHandlerMap = {
  switchApplication(ctx) {
  const application = String(ctx.payload.application ?? "");
  if (!application) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("blueprint");
  url.searchParams.delete("bundle");
  url.searchParams.set("b", application);
  window.location.assign(url.toString());
  },
};

/*
 * Assemble the switcher bundle for the given Blueprint ids and active id. The switcher's
 * state is dynamic; navigation always targets the host's single `b` selector.
 */
export function switcherBundle(
  items: readonly string[],
  current: string
): Bundle {
  return bundleFromJson(
    {
      manifest,
      document,
      state: { switcher: { items: [...items], current } },
    },
    {
      projectionViews: { applicationSwitcher: ApplicationSwitcherView },
      effectHandlers: switcherEffects,
    }
  );
}
