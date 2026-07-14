// The generic profile->tools engine. A profile declares its authoring surface as data
// (`profile.authoring.tools`: an operation over a declared layer, or a named projector); this
// materializes those declarations into `McpTool`s by binding each op to a profile-family REGISTRY
// (the small, named, irreducible code seam — the same shape as the lowering stage executors).
//
// What is genuinely declarative: which tools exist, their descriptions, input schemas, layer
// bindings, and agent-safety all come from the profile JSON. Structural validation is derived from
// the layer's `schema` ref via a registry validator. What stays code: the semantic checks and
// projectors, referenced by NAME. This module knows nothing GenUI-specific.

import type { McpTool } from "../tool-surface";
import type {
  AuthoringRegistry,
  AuthoringReport,
  Profile,
} from "../../../packages/profile/src/profile-core";
import { bindAuthoringTools } from "../../../packages/profile/src/authoring-runner";

export type { AuthoringRegistry, AuthoringReport } from "../../../packages/profile/src/profile-core";

/**
 * Materialize a profile's declared authoring tools into `McpTool`s, binding each op to the supplied
 * registry. Fails fast (throws) if a declaration references a layer or a registry entry that does
 * not exist, so a misdeclared profile is caught at build time, not at call time.
 */
export function toolsFromProfile(profile: Profile, registry: AuthoringRegistry): McpTool[] {
  return bindAuthoringTools(profile, registry).map((binding) => ({
    name: binding.name,
    description: binding.description,
    inputSchema: binding.inputSchema,
    agentSafe: binding.agentSafe,
    handler: binding.handler,
  }));
}
