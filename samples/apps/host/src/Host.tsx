// The generic host app opens a Blueprint selected by `?b=<id>` through GikDemoBlueprintHost. The app
// owns URL canonicalization and the switcher overlay.

import React from "react";
import { BlueprintHost } from "@gik/react";
import { GikDemoBlueprintHost } from "@gik/demo-runner-host";
import blueprintRegistry from "../../../blueprints/registry.json";
import { resolveBundleProjectionViews } from "./bundles";
import {
  canonicalizeHostUrl,
  readHostQuery,
} from "./host-query";
import { FLOOR_COMPONENTS } from "../../../bundles/floor/projection_views";
import { resolveBlueprintNative } from "../../../shared/sample-bundles";
import { resolveSampleBlueprintSource } from "../../../shared/blueprints";

const embeddedHostStyle: React.CSSProperties = { height: "100vh" };
const { blueprints: blueprintIds, default: DEFAULT_BLUEPRINT } = blueprintRegistry;

export function Host(): React.ReactElement {
  const query = readHostQuery(window.location.search);
  const targetId = query.targetId ?? DEFAULT_BLUEPRINT;
  React.useEffect(() => {
    const canonicalUrl = canonicalizeHostUrl(window.location.href);
    if (canonicalUrl !== window.location.href) window.history.replaceState(null, "", canonicalUrl);
  }, []);
  const resolveProvider = React.useCallback(
    (from: string) => (from === "floor" ? FLOOR_COMPONENTS : resolveBundleProjectionViews(from)),
    []
  );
  return (
    <HostView targetId={targetId} resolveLeavesProvider={resolveProvider} />
  );
}

function HostView({
  targetId,
  resolveLeavesProvider,
}: {
  targetId: string;
  resolveLeavesProvider: (from: string) => ReturnType<typeof resolveBundleProjectionViews>;
}): React.ReactElement {
  const id = targetId;
  const { blueprint, native } = React.useMemo(() => ({
    blueprint: resolveSampleBlueprintSource(id),
    native: resolveBlueprintNative(id),
  }), [id]);

  return (
    <>
      <GikDemoBlueprintHost
        HostComponent={BlueprintHost}
        blueprint={blueprint}
        native={native}
        context={blueprint.payload.context}
        resolveLeavesProvider={resolveLeavesProvider}
        style={embeddedHostStyle}
      />
      <ApplicationSwitcher currentId={id} />
    </>
  );
}

function ApplicationSwitcher({ currentId }: { currentId: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
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
          aria-label={`Current application: ${currentId}. Hover to switch.`}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">Layers</span>
        </button>
      )}
    </div>
  );
}
