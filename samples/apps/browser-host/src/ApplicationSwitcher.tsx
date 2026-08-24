// The host-owned application switcher. It is deliberately shared by both host routes: selecting a
// Blueprint always sets `?b=<id>`, which is the one URL shape that opens the full single-Blueprint
// route, whether the user starts from the application root page or from another Blueprint.

import React from "react";
import { getSampleBlueprintCatalog } from "../../../catalog/blueprint-catalog";

export function ApplicationSwitcher({ currentId }: { currentId?: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const blueprintIds = getSampleBlueprintCatalog().blueprints;
  const selectBlueprint = (id: string) => {
    if (id === currentId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("b", id);
    window.location.assign(url.toString());
  };

  return (
    <div className="gx-switcher" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {open ? (
        <div className="gx-switcher-panel" role="menu" aria-label="Switch application">
          <div className="gx-switcher-head">Application</div>
          {blueprintIds.map((id) => {
            const selected = id === currentId;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "gx-switcher-row selected" : "gx-switcher-row"}
                onClick={() => selectBlueprint(id)}
              >
                <span className="gx-switcher-check" aria-hidden="true">{selected ? "\u2713" : ""}</span>
                <span>{id}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          className="gx-switcher-bubble"
          aria-label={currentId
            ? `Current application: ${currentId}. Hover to switch.`
            : "Open an application. Hover to browse."}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">&nbsp;</span>
        </button>
      )}
    </div>
  );
}
