// The BUNDLE RESOLVER: the one place that pairs an on-disk pure-JSON bundle (its manifest/document/
// state trio) with the small native module it needs (effect handlers + mountable apps). The generic
// host asks for a bundle by id; this returns a runnable `Bundle` plus its app registry — or, for the
// one irreducibly-native composition (the workbench), a native root component to mount directly.
// Adding a bundle to the host is: drop a trio under samples/bundles/<id>/, add a native module, add a case.
//
// Everything the trio contains is portable JSON; the only code is the per-bundle native module.

import {
  bundleFromJson,
  type AppRegistry,
  type Bundle,
} from "../../../../adapters/react/src/index";
import type React from "react";

// --- console ---------------------------------------------------------------------
import consoleManifest from "../../../bundles/console/manifest.json";
import consoleDocument from "../../../bundles/console/document.json";
import consoleState from "../../../bundles/console/state.json";
import { consoleNative, consoleApps } from "../../../bundles/console/native";

// NOTE: there is no standalone `inspect` top-level bundle. Standalone it was only a seeded, guest-less
// demo shell (the floor-only scaffold from ADR-0032, since removed). The inspector does real work only
// embedded in the workbench composition (`bundles/workbench/bundles/inspect/inspect.ts`), driven by the
// live guest through the `inspectSnapshot` cross-kernel bridge.

// --- workbench -------------------------------------------------------------------
// The workbench is the one irreducibly-native bundle: `WorkbenchRoot` is a React root that mounts the
// chrome + inspect leaf bundles and bridges their kernels to a live guest runtime (the two cross-kernel
// seams the closed action grammar can't express). It has no JSON trio — the host mounts it directly.
import { WorkbenchRoot } from "../../../bundles/workbench/Workbench";

/** The bundle the host mounts when no `?bundle=<id>` is given. */
export const DEFAULT_BUNDLE = "console";

/** A resolved bundle: a runnable JSON leaf `Bundle` (+ the apps its document may mount by name), or a
 *  native root component for the one irreducibly-native composition. */
export type ResolvedBundle =
  | { bundle: Bundle; apps?: AppRegistry }
  | { Root: React.ComponentType };

/** The bundles this host knows how to mount, by id. */
export const BUNDLE_IDS = ["console", "workbench"] as const;

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
    case "workbench":
      return { Root: WorkbenchRoot };
    default:
      throw new Error(
        `resolveBundle: unknown bundle '${id}'. Known: ${BUNDLE_IDS.join(", ")}`
      );
  }
}
