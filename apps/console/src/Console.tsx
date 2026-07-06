// The console host. Under the "everything is JSON" model the console IS its data: its manifest,
// document, and seed state live in `console.bundle.json`, handed to the ONE generic `BundleHost`.
// The ONLY code is its consequential operations — the named effect handlers the shared dispatcher
// routes the document's `invoke`s to. Swapping the JSON for any other bundle renders a different app
// with zero code change; adding an app is authoring JSON, not TypeScript.

import React from "react";
import {
  BundleHost,
  bundleFromJson,
  playgroundApp,
  type AppRegistry,
  type Bundle,
} from "../../../adapters/react/src/index";
import consoleBundleJson from "./console.bundle.json";
import { consoleEffects } from "./store";

// The floor's JSON loader validates the imported bundle and attaches the native effect handlers.
const consoleBundle: Bundle = bundleFromJson(consoleBundleJson, { effects: consoleEffects });

// Apps the console's document may mount by name via an `embed` leaf (`props.app`). The Playground is
// not a separate app shell — it is this same registered bundle, hosted inside the console.
const apps: AppRegistry = {
  playground: playgroundApp,
};

export function Console(): React.ReactElement {
  return <BundleHost bundle={consoleBundle} apps={apps} />;
}
