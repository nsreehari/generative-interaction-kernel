// The console's bundle manifest.
//
// The console no longer defines its own capabilities — under the "everything is JSON" model it uses
// the platform's fixed primitive vocabulary (screen/panel/list/field/button/tabBar/chips/table/
// text/note/bundle...) declared once in the floor's `bundleManifest`. All this file provides is the
// manifest header (version + the `console` namespace); the document composes primitives and the
// named effect handlers (store.ts) perform the consequential operations.

import { bundleManifest } from "../../../adapters/react/src/index";

export const CONSOLE_MANIFEST = bundleManifest({
  version: "genui-console/1.0",
  namespaces: ["console"],
});
