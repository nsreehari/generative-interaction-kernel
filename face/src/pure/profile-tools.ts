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
import type { Json } from "../../../kernel/src/index";
import type {
  AuthoringRegistry,
  AuthoringReport,
  AuthoringToolDecl,
  LayerDefinition,
  Profile,
} from "../../../packages/profile/src/profile-core";

export type { AuthoringRegistry, AuthoringReport } from "../../../packages/profile/src/profile-core";

const anyObj = { type: "object" } as const;

const asJsonArgs = (args: Record<string, unknown>): Record<string, Json> => args as Record<string, Json>;

const defaultInputSchema = (decl: AuthoringToolDecl): Record<string, unknown> => {
  if (decl.op === "describe") return { type: "object", properties: {}, required: [], additionalProperties: false };
  const key = decl.op === "project" ? "input" : "spec";
  return { type: "object", properties: { [key]: anyObj }, required: [key], additionalProperties: false };
};

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

const mergeReports = (parts: Partial<AuthoringReport>[]): AuthoringReport => {
  const errors = parts.flatMap((p) => p.errors ?? []);
  const warnings = parts.flatMap((p) => p.warnings ?? []);
  return { ok: errors.length === 0, errors, warnings };
};

/**
 * Materialize a profile's declared authoring tools into `McpTool`s, binding each op to the supplied
 * registry. Fails fast (throws) if a declaration references a layer or a registry entry that does
 * not exist, so a misdeclared profile is caught at build time, not at call time.
 */
export function toolsFromProfile(profile: Profile, registry: AuthoringRegistry): McpTool[] {
  const layersById: Record<string, LayerDefinition> = Object.fromEntries(
    profile.layers.map((l) => [l.id, l])
  );
  const fail = (id: string, detail: string): never => {
    throw new Error(`profile '${profile.id}' authoring tool '${id}': ${detail}`);
  };

  return (profile.authoring?.tools ?? []).map((decl): McpTool => {
    const base = {
      name: decl.id,
      inputSchema: decl.inputSchema ?? defaultInputSchema(decl),
      agentSafe: decl.agentSafe,
    };

    if (decl.op === "describe") {
      const key = decl.describe ?? decl.layer;
      if (!key) fail(decl.id, `op "describe" needs a "layer" or "describe" ref`);
      const hook = registry.describe?.[key!];
      if (!hook) fail(decl.id, `no registry.describe entry for '${key}'`);
      return {
        ...base,
        description: decl.description ?? `Describe the '${key}' vocabulary.`,
        handler: () => hook!(),
      };
    }

    if (decl.op === "project") {
      if (!decl.projector) fail(decl.id, `op "project" needs a "projector" ref`);
      const proj = registry.projectors?.[decl.projector!];
      if (!proj) fail(decl.id, `no registry.projectors entry for '${decl.projector}'`);
      return {
        ...base,
        description: decl.description ?? `Project via '${decl.projector}'.`,
        handler: (args) => proj!(asJsonArgs(args)),
      };
    }

    // op === "validate": optional structural validator (by the layer's schema ref) + named checks.
    const layer = decl.layer ? layersById[decl.layer] : undefined;
    if (decl.layer && !layer) fail(decl.id, `references unknown layer '${decl.layer}'`);
    const structural = layer?.schema ? registry.validators?.[layer.schema] : undefined;
    if (layer?.schema && !structural) fail(decl.id, `no registry.validators entry for schema '${layer.schema}'`);
    const checks = (decl.checks ?? []).map((c) => {
      const fn = registry.checks?.[c];
      if (!fn) fail(decl.id, `no registry.checks entry for '${c}'`);
      return fn!;
    });

    return {
      ...base,
      description: decl.description ?? `Validate a '${decl.layer ?? "spec"}' artifact.`,
      handler: (args) => {
        const jsonArgs = asJsonArgs(args);
        const parts: Partial<AuthoringReport>[] = [];
        parts.push(structural ? structural(jsonArgs) : emptyReport());
        // Only run semantic checks if the structural pass produced no errors.
        if ((parts[0].errors?.length ?? 0) === 0) {
          for (const check of checks) parts.push(check(jsonArgs));
        }
        return mergeReports(parts);
      },
    };
  });
}
