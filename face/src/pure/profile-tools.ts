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
import { structuralValidatorForLayer } from "../../../packages/profile/src/profile-core";
import { evalAsyncJsonata, evalSyncJsonata } from "../../../shared/libs/evaluators";
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

const defaultInputSchema = (decl: AuthoringToolDecl, layer?: LayerDefinition): Record<string, unknown> => {
  if (decl.op === "describe") return { type: "object", properties: {}, required: [], additionalProperties: false };
  if (decl.op === "validate" && layer?.input && typeof layer.input === "object" && !Array.isArray(layer.input)) {
    return {
      type: "object",
      properties: { spec: layer.input },
      required: ["spec"],
      additionalProperties: false,
    };
  }
  const key = decl.op === "project" ? "input" : "spec";
  return { type: "object", properties: { [key]: anyObj }, required: [key], additionalProperties: false };
};

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

const mergeReports = (parts: Partial<AuthoringReport>[]): AuthoringReport => {
  const errors = parts.flatMap((p) => p.errors ?? []);
  const warnings = parts.flatMap((p) => p.warnings ?? []);
  return { ok: errors.length === 0, errors, warnings };
};

type FormValidatorDecl = {
  expression?: unknown;
  detail?: unknown;
  level?: unknown;
  code?: unknown;
  node?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const pathLabel = (path: string[]): string => {
  if (path.length === 0) return "value";
  return path.reduce((acc, part) => {
    if (/^\d+$/.test(part)) return `${acc}[${part}]`;
    return acc.length === 0 ? part : `${acc}.${part}`;
  }, "");
};

const matchesType = (expected: unknown, value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(expected)) return expected.some((entry) => matchesType(entry, value));
  switch (expected) {
    case "json":
      return true;
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
};

const validateFormNode = (
  schema: unknown,
  value: unknown,
  rootArgs: Record<string, Json>,
  path: string[] = [],
  bindings: Record<string, Json> = {}
): Partial<AuthoringReport> => {
  if (!isRecord(schema)) return {};

  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const label = pathLabel(path);

  if (!matchesType(schema.type, value)) {
    const typeLabel = Array.isArray(schema.type) ? schema.type.join("|") : String(schema.type);
    errors.push({ detail: `${label} must be of type ${typeLabel}` });
    return { errors, warnings };
  }

  if (value !== undefined && Array.isArray(schema.enum) && !schema.enum.some((entry) => entry === value)) {
    errors.push({ detail: `${label} must be one of: ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}` });
  }

  if (value !== undefined && Array.isArray(schema.validators)) {
    for (const decl of schema.validators as FormValidatorDecl[]) {
      if (typeof decl.expression !== "string") continue;
      try {
        const ok = evalSyncJsonata(decl.expression, (value ?? null) as Json, {
          root: rootArgs,
          path: label,
          ...bindings,
        });
        if (!ok) {
          const detail = typeof decl.detail === "string" ? decl.detail : `${label} failed validation`;
          if (decl.level === "warning") {
            warnings.push({
              code: typeof decl.code === "string" ? decl.code : "validator-warning",
              node: typeof decl.node === "string" ? decl.node : label,
              detail,
            });
          } else {
            errors.push({ detail });
          }
        }
      } catch (error) {
        errors.push({
          detail: `${label} validator failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  if (isRecord(value) && Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === "string" && value[key] === undefined) {
        errors.push({ detail: `${pathLabel([...path, key])} is required` });
      }
    }
  }

  if (isRecord(schema.properties)) {
    const current = isRecord(value) ? value : {};
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      const child = validateFormNode(childSchema, current[key], rootArgs, [...path, key], bindings);
      errors.push(...(child.errors ?? []));
      warnings.push(...(child.warnings ?? []));
    }
  }

  if (isRecord(value) && isRecord(schema.additionalProperties)) {
    const declared = new Set(isRecord(schema.properties) ? Object.keys(schema.properties) : []);
    for (const [key, entry] of Object.entries(value)) {
      if (declared.has(key)) continue;
      const child = validateFormNode(schema.additionalProperties, entry, rootArgs, [...path, key], bindings);
      errors.push(...(child.errors ?? []));
      warnings.push(...(child.warnings ?? []));
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((entry, index) => {
      const child = validateFormNode(schema.items, entry, rootArgs, [...path, String(index)], bindings);
      errors.push(...(child.errors ?? []));
      warnings.push(...(child.warnings ?? []));
    });
  }

  return { errors, warnings };
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
    const layer = decl.layer ? layersById[decl.layer] : undefined;
    const base = {
      name: decl.id,
      inputSchema: decl.inputSchema ?? defaultInputSchema(decl, layer),
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
      const hasNamedProjector = typeof decl.projector === "string" && decl.projector.length > 0;
      const hasProjectExpression = typeof decl.projectExpression === "string" && decl.projectExpression.length > 0;
      if (!hasNamedProjector && !hasProjectExpression) {
        fail(decl.id, `op "project" needs a "projector" ref or "projectExpression"`);
      }
      const proj = hasNamedProjector ? registry.projectors?.[decl.projector!] : undefined;
      if (hasNamedProjector && !proj) fail(decl.id, `no registry.projectors entry for '${decl.projector}'`);
      return {
        ...base,
        description:
          decl.description ??
          (hasNamedProjector ? `Project via '${decl.projector}'.` : "Project via declarative expression."),
        handler: (args) => {
          const jsonArgs = asJsonArgs(args);
          if (proj) return proj(jsonArgs);
          return evalAsyncJsonata(decl.projectExpression!, jsonArgs);
        },
      };
    }

    // op === "validate": declarative form validation + optional structural validator + named checks.
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
        const catalog = Object.fromEntries(
          Object.entries(registry.describe ?? {}).map(([key, hook]) => [key, hook()])
        ) as Record<string, Json>;
        const parts: Partial<AuthoringReport>[] = [];
        parts.push(validateFormNode(base.inputSchema, jsonArgs, jsonArgs, [], { catalog }));
        parts.push(structural ? structural(jsonArgs) : emptyReport());
        // Only run semantic checks if the structural pass produced no errors.
        if (parts.every((part) => (part.errors?.length ?? 0) === 0)) {
          for (const check of checks) parts.push(check(jsonArgs));
        }
        return mergeReports(parts);
      },
    };
  });
}
