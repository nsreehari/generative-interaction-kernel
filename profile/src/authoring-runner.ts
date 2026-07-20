import type { Json } from "../../kernel/src/index";
import { evalAsyncJsonata, runDeclarativeValidators } from "@gik/evaluators";
import { structuralValidatorForLayer } from "./profile-core";
import type {
  AuthoringRegistry,
  AuthoringReport,
  AuthoringToolDecl,
  LayerDefinition,
  Profile,
} from "./profile-core";

const anyObj = { type: "object" } as const;

const asJsonArgs = (args: Record<string, unknown>): Record<string, Json> => args as Record<string, Json>;

const withLayerContext = (args: Record<string, Json>, layer?: LayerDefinition): Record<string, Json> => {
  if (!layer) return args;
  return { ...args, __layer: layer as unknown as Json };
};

export const defaultAuthoringInputSchema = (
  decl: AuthoringToolDecl,
  layer?: LayerDefinition
): Record<string, unknown> => {
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
    const report = runDeclarativeValidators(
      schema.validators as unknown[],
      (value ?? null) as Json,
      {
        bindings: {
          root: rootArgs,
          path: label,
          ...bindings,
        },
        jsonataValueMode: "root",
      }
    );
    errors.push(...report.errors.map((issue) => ({ detail: issue.detail })));
    warnings.push(
      ...report.warnings.map((issue) => ({
        code: issue.code ?? "validator-warning",
        ...(issue.node ? { node: issue.node } : {}),
        detail: issue.detail,
      }))
    );
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

export interface AuthoringToolBinding {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  agentSafe?: boolean;
  handler: (args: Record<string, unknown>) => Json | Promise<Json>;
}

export function bindAuthoringTools(profile: Profile, registry: AuthoringRegistry): AuthoringToolBinding[] {
  const layersById: Record<string, LayerDefinition> = Object.fromEntries(
    profile.layers.map((l) => [l.id, l])
  );
  const fail = (id: string, detail: string): never => {
    throw new Error(`profile '${profile.id}' authoring tool '${id}': ${detail}`);
  };

  return (profile.authoring?.tools ?? []).map((decl): AuthoringToolBinding => {
    const layer = decl.layer ? layersById[decl.layer] : undefined;
    const inputSchema = decl.inputSchema ?? defaultAuthoringInputSchema(decl, layer);

    if (decl.op === "describe") {
      const key = decl.describe ?? decl.layer;
      if (!key) fail(decl.id, `op "describe" needs a "layer" or "describe" ref`);
      const hook = registry.describe?.[key!];
      if (!hook) fail(decl.id, `no registry.describe entry for '${key}'`);
      return {
        name: decl.id,
        description: decl.description ?? `Describe the '${key}' vocabulary.`,
        inputSchema,
        agentSafe: decl.agentSafe,
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
        name: decl.id,
        description:
          decl.description ??
          (hasNamedProjector ? `Project via '${decl.projector}'.` : "Project via declarative expression."),
        inputSchema,
        agentSafe: decl.agentSafe,
        handler: (args) => {
          const jsonArgs = asJsonArgs(args);
          if (proj) return proj(jsonArgs);
          return evalAsyncJsonata(decl.projectExpression!, jsonArgs);
        },
      };
    }

    if (decl.layer && !layer) fail(decl.id, `references unknown layer '${decl.layer}'`);
    const structural = structuralValidatorForLayer(layer, registry);
    if (layer?.schema && !structural) fail(decl.id, `no registry.validators entry for schema '${layer.schema}'`);
    const checks = (decl.checks ?? []).map((c) => {
      const fn = registry.checks?.[c];
      if (!fn) fail(decl.id, `no registry.checks entry for '${c}'`);
      return fn!;
    });

    return {
      name: decl.id,
      description: decl.description ?? `Validate a '${decl.layer ?? "spec"}' artifact.`,
      inputSchema,
      agentSafe: decl.agentSafe,
      handler: (args) => {
        const jsonArgs = asJsonArgs(args);
        const catalog = Object.fromEntries(
          Object.entries(registry.describe ?? {}).map(([key, hook]) => [key, hook()])
        ) as Record<string, Json>;
        const contextualArgs = withLayerContext(jsonArgs, layer);
        const parts: Partial<AuthoringReport>[] = [];
        parts.push(validateFormNode(inputSchema, jsonArgs, jsonArgs, [], { catalog }));
        parts.push(structural ? structural(jsonArgs) : emptyReport());
        if (parts.every((part) => (part.errors?.length ?? 0) === 0)) {
          for (const check of checks) parts.push(check(contextualArgs));
        }
        return mergeReports(parts) as unknown as Json;
      },
    };
  });
}