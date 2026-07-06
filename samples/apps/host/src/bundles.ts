// The BUNDLE RESOLVER: the one place that pairs an on-disk pure-JSON bundle (its manifest/document/
// state trio) with the small native module it needs (effect handlers + mountable apps). The generic
// host asks for a bundle by id; this returns a runnable `Bundle` plus its app registry. Adding a
// bundle to the host is: drop a trio under samples/bundles/<id>/, add a native module, add a case.
//
// Everything the trio contains is portable JSON; the only code is the per-bundle native module.

import {
  bundleFromJson,
  type AppRegistry,
  type Bundle,
} from "../../../../adapters/react/src/index";

// --- console ---------------------------------------------------------------------
import consoleManifest from "../../../bundles/console/manifest.json";
import consoleDocument from "../../../bundles/console/document.json";
import consoleState from "../../../bundles/console/state.json";
import { consoleNative, consoleApps } from "../../../bundles/console/native";

/** The bundle the host mounts when no `?bundle=<id>` is given. */
export const DEFAULT_BUNDLE = "console";

/** A resolved bundle: the runnable `Bundle` plus the apps its document may mount by name. */
export interface ResolvedBundle {
  bundle: Bundle;
  apps?: AppRegistry;
}

/** The bundles this host knows how to mount, by id. */
export const BUNDLE_IDS = ["console"] as const;

/** Recombine a bundle's on-disk trio into a runnable `Bundle` and attach its native module. */
export function resolveBundle(id: string): ResolvedBundle {
  switch (id) {
    case "console":
      return {
        bundle: bundleFromJson(
          { manifest: consoleManifest, document: consoleDocument, state: consoleState },
          consoleNative
        ),
        apps: consoleApps,
      };
    default:
      throw new Error(
        `resolveBundle: unknown bundle '${id}'. Known: ${BUNDLE_IDS.join(", ")}`
      );
  }
}
