// The console host. Under the "everything is JSON" model the console is just a BUNDLE — manifest +
// document + seed state + named effect handlers — handed to the ONE generic `BundleHost`. There is
// no console-specific React here: the shared primitive registry renders the pixels and the shared
// effect dispatcher routes the document's `invoke`s to the console's handlers. Swapping the bundle
// for any other JSON bundle would render a different app with zero code change.

import React from "react";
import {
  BundleHost,
  playgroundApp,
  type AppRegistry,
  type Bundle,
} from "../../../adapters/react/src/index";
import { CONSOLE_MANIFEST } from "./manifest";
import { buildConsoleDocument } from "./document";
import { consoleEffects, seedConsoleData } from "./store";

const consoleBundle: Bundle = {
  manifest: CONSOLE_MANIFEST,
  document: buildConsoleDocument(),
  state: seedConsoleData(),
  effects: consoleEffects,
};

// Apps the console's document may mount by name via a `bundle` leaf (`props.app`). The Playground is
// not a separate app shell — it is this same registered bundle, hosted inside the console.
const apps: AppRegistry = {
  playground: playgroundApp,
};

export function Console(): React.ReactElement {
  return <BundleHost bundle={consoleBundle} apps={apps} />;
}
