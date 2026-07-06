// The console bundle's NATIVE side. The manifest/document/state are pure JSON (this folder's
// .json trio); the only code a bundle may carry is its named effect handlers and the apps its
// document may mount by name. Keeping them here — beside the JSON — is what "graduate a profile
// into an on-disk bundle" means: a portable trio plus a small, explicit native module.
//
// (Code AUTHORING — editing components/effects from inside the UI — is deliberately out of scope
// for now; these effects ship with the platform, they are not user-authored at runtime.)

import {
  playgroundApp,
  type AppRegistry,
  type BundleNative,
} from "../../../adapters/react/src/index";
import { consoleEffects } from "./store";

/** The console's consequential operations, routed by `invoke("<name>")`. */
export const consoleNative: BundleNative = { effects: consoleEffects };

/** Apps the console document may mount by name via an `embed` leaf (`props.app`). */
export const consoleApps: AppRegistry = { playground: playgroundApp };
