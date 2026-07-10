// The ONE generic host app. There is no per-app shell anymore: this entry runs ANY bundle by id.
// It picks a bundle (`?bundle=<id>`, defaulting to the console), recombines that bundle's on-disk
// pure-JSON trio + native module via the resolver, and hands it to the shared `BundleHost`.
// Swapping the id renders a different app with zero code change here.

import React from "react";
import { BundleHost } from "../../../../adapters/react/src/index";
import { DEFAULT_BUNDLE, resolveBundle } from "./bundles";
import { switcherBundle } from "./switcher/switcher";

export function Host(): React.ReactElement {
  const id = new URLSearchParams(window.location.search).get("bundle") ?? DEFAULT_BUNDLE;
  const { bundle, apps } = React.useMemo(() => resolveBundle(id), [id]);
  // The switcher is itself a bundle, mounted through the same host as an overlay — so host chrome
  // rides the ambient, host-owned theme instead of a hand-styled widget.
  const switcher = React.useMemo(() => switcherBundle(id), [id]);
  return (
    <>
      <BundleHost bundle={bundle} apps={apps} />
      <BundleHost bundle={switcher} />
    </>
  );
}
