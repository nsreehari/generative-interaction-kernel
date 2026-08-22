import Ajv, { type ValidateFunction } from "ajv";

import blueprintSchema from "../schemas/blueprint.schema.json" with { type: "json" };
import cellSchema from "../schemas/cell.schema.json" with { type: "json" };
import loweringRecipeSchema from "../schemas/lowering-recipe.schema.json" with { type: "json" };
import programSchema from "../schemas/program.schema.json" with { type: "json" };
import tierSchema from "../schemas/tier.schema.json" with { type: "json" };
import uiFormSchema from "../schemas/ui-form.schema.json" with { type: "json" };
import { validateCell } from "./cell";
import { evalSyncJsonata, validateJsonataExpression, type JsonataExpressionValidationMode } from "./evaluators";

type DeclarativeTypeName =
  | "json"
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export type DeclarativeValidatorLevel = "error" | "warning";

export type DeclarativeValidationIssue = {
  detail: string;
  code?: string;
  node?: string;
};

export type DeclarativeValidationResult = {
  ok: boolean;
  errors: DeclarativeValidationIssue[];
  warnings: DeclarativeValidationIssue[];
};

interface JsonataDeclarativeValidator {
  kind: "jsonata";
  expr: string;
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface AjvSchemaDeclarativeValidator {
  kind: "ajv-schema";
  schema: Record<string, unknown>;
  refs?: readonly { schema: Record<string, unknown>; key?: string }[];
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface JsonataExpressionDeclarativeValidator {
  kind: "jsonata-expression";
  mode: JsonataExpressionValidationMode;
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface TypeDefDeclarativeValidator {
  kind: "typedef";
  type: DeclarativeTypeName | readonly DeclarativeTypeName[];
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface BlueprintCellDeclarativeValidator {
  kind: "blueprint-cell";
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface BlueprintTierDeclarativeValidator {
  kind: "blueprint-tier";
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface BlueprintLoweringRecipeDeclarativeValidator {
  kind: "blueprint-lowering-recipe";
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

interface BlueprintDeclarativeValidator {
  kind: "blueprint";
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

/** Checks that every capability a generated child Blueprint declares/uses (its own
 * `presentation.allowedCapabilities`, plus every view/decorator `capability` it references, across
 * both authored `cells[*].potentialViews` and un-lowered `recipes[*].representations[*].views`) is
 * a subset of an accepted-capabilities list read from the validated request's own input -- the
 * declarative form of the "generated Blueprint may only use capabilities it was told it could use"
 * check, reusable across any source that authors such a request field. */
interface BlueprintCapabilityAcceptanceDeclarativeValidator {
  kind: "blueprint-capability-acceptance";
  /** Key read from the `request` binding holding the accepted capability list. Defaults to
   * `"acceptedCapabilities"`. */
  acceptedField?: string;
  message: string;
  level: DeclarativeValidatorLevel;
  code?: string;
  node?: string;
}

type DeclarativeValidator =
  | JsonataDeclarativeValidator
  | AjvSchemaDeclarativeValidator
  | JsonataExpressionDeclarativeValidator
  | TypeDefDeclarativeValidator
  | BlueprintCellDeclarativeValidator
  | BlueprintTierDeclarativeValidator
  | BlueprintLoweringRecipeDeclarativeValidator
  | BlueprintDeclarativeValidator
  | BlueprintCapabilityAcceptanceDeclarativeValidator;

export type DeclarativeValidatorInput =
  | [string, string?]
  | { kind?: "jsonata"; expr: string; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "ajv-schema"; schema: Record<string, unknown>; refs?: readonly { schema: Record<string, unknown>; key?: string }[]; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "jsonata-expression"; mode?: JsonataExpressionValidationMode; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "typedef"; type: DeclarativeTypeName | readonly DeclarativeTypeName[]; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "blueprint-cell"; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "blueprint-tier"; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "blueprint-lowering-recipe"; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "blueprint"; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "blueprint-capability-acceptance"; acceptedField?: string; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string };


type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type DeclarativeValidatorRunOptions = {
  bindings?: Record<string, JsonValue>;
  jsonataValueMode?: "wrapped-data" | "root";
};

const ajvErrorDetails = (errors: unknown): string[] => {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((error) => {
      if (!error || typeof error !== "object") return "schema validation failed";
      const candidate = error as { instancePath?: unknown; message?: unknown; params?: { additionalProperty?: unknown } };
      const instancePath = typeof candidate.instancePath === "string" && candidate.instancePath.length > 0
        ? candidate.instancePath
        : "/";
      const message = typeof candidate.message === "string" ? candidate.message : "is invalid";
      const property = typeof candidate.params?.additionalProperty === "string"
        ? ` '${candidate.params.additionalProperty}'`
        : "";
      return `${instancePath} ${message}${property}`;
    })
    .filter((part) => part.length > 0);
};

const matchesType = (expected: DeclarativeTypeName | readonly DeclarativeTypeName[], value: unknown): boolean => {
  if (Array.isArray(expected)) return expected.some((entry) => matchesType(entry, value));
  switch (expected) {
    case "json":
      return true;
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
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

const typeLabel = (expected: DeclarativeTypeName | readonly DeclarativeTypeName[]): string => {
  if (Array.isArray(expected)) return expected.join("|");
  return String(expected);
};

const compiledSchemaValidators = new WeakMap<AjvSchemaDeclarativeValidator, ValidateFunction>();

const compiledSchemaValidatorFor = (validator: AjvSchemaDeclarativeValidator): ValidateFunction => {
  const cached = compiledSchemaValidators.get(validator);
  if (cached) return cached;
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const ref of validator.refs ?? []) {
    ajv.addSchema(ref.schema, ref.key);
  }
  const compiled = ajv.compile(validator.schema);
  compiledSchemaValidators.set(validator, compiled);
  return compiled;
};

const issueMetadata = (candidate: Record<string, unknown>) => ({
  ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  ...(typeof candidate.node === "string" ? { node: candidate.node } : {}),
});

function normalizeDeclarativeValidators(raw: unknown): DeclarativeValidator[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclarativeValidator[] = [];
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const expr = typeof entry[0] === "string" ? entry[0].trim() : "";
      if (expr) out.push({ kind: "jsonata", expr, message: typeof entry[1] === "string" ? entry[1] : "Invalid value", level: "error" });
    } else if (entry && typeof entry === "object") {
      const candidate = entry as Record<string, unknown>;
      if (candidate.kind === "ajv-schema") {
        if (candidate.schema && typeof candidate.schema === "object" && !Array.isArray(candidate.schema)) {
          out.push({
            kind: "ajv-schema",
            schema: candidate.schema as Record<string, unknown>,
            refs: Array.isArray(candidate.refs)
              ? candidate.refs.filter((ref): ref is { schema: Record<string, unknown>; key?: string } =>
                !!ref &&
                typeof ref === "object" &&
                !Array.isArray(ref) &&
                "schema" in ref &&
                !!(ref as { schema?: unknown }).schema &&
                typeof (ref as { schema?: unknown }).schema === "object" &&
                !Array.isArray((ref as { schema?: unknown }).schema)
              ).map((ref) => ({
                schema: ref.schema,
                ...(typeof ref.key === "string" ? { key: ref.key } : {}),
              }))
              : undefined,
            message: typeof candidate.message === "string" ? candidate.message : "Invalid value",
            level: candidate.level === "warning" ? "warning" : "error",
            ...issueMetadata(candidate),
          });
        }
        continue;
      }
      if (candidate.kind === "typedef") {
        const type = candidate.type;
        const validType = typeof type === "string" || (Array.isArray(type) && type.every((entry) => typeof entry === "string"));
        if (validType) {
          out.push({
            kind: "typedef",
            type: type as DeclarativeTypeName | readonly DeclarativeTypeName[],
            message: typeof candidate.message === "string" ? candidate.message : "Invalid value",
            level: candidate.level === "warning" ? "warning" : "error",
            ...issueMetadata(candidate),
          });
        }
        continue;
      }
      if (candidate.kind === "jsonata-expression") {
        out.push({
          kind: "jsonata-expression",
          mode: candidate.mode === "safe" ? "safe" : "full",
          message: typeof candidate.message === "string" ? candidate.message : "Invalid JSONata expression",
          level: candidate.level === "warning" ? "warning" : "error",
          ...issueMetadata(candidate),
        });
        continue;
      }
      if (candidate.kind === "blueprint-capability-acceptance") {
        out.push({
          kind: "blueprint-capability-acceptance",
          ...(typeof candidate.acceptedField === "string" ? { acceptedField: candidate.acceptedField } : {}),
          message: typeof candidate.message === "string" ? candidate.message : "Blueprint uses a capability outside the accepted set",
          level: candidate.level === "warning" ? "warning" : "error",
          ...issueMetadata(candidate),
        });
        continue;
      }
      if (
        candidate.kind === "blueprint-cell" ||
        candidate.kind === "blueprint-tier" ||
        candidate.kind === "blueprint-lowering-recipe" ||
        candidate.kind === "blueprint"
      ) {
        out.push({
          kind: candidate.kind,
          message: typeof candidate.message === "string"
            ? candidate.message
            : candidate.kind === "blueprint"
              ? "Invalid Blueprint"
              : candidate.kind === "blueprint-cell"
                ? "Invalid Blueprint Cell"
                : candidate.kind === "blueprint-tier"
                  ? "Invalid Blueprint Tier"
                  : "Invalid Blueprint lowering recipe",
          level: candidate.level === "warning" ? "warning" : "error",
          ...issueMetadata(candidate),
        });
        continue;
      }
      const expr = typeof candidate.expr === "string" ? candidate.expr.trim() : "";
      if (expr) {
        out.push({
          kind: "jsonata",
          expr,
          message: typeof candidate.message === "string" ? candidate.message : "Invalid value",
          level: candidate.level === "warning" ? "warning" : "error",
          ...issueMetadata(candidate),
        });
      }
    }
  }
  return out;
}

export function runDeclarativeValidators(
  rawValidators: readonly DeclarativeValidatorInput[] | unknown,
  value: JsonValue,
  options: DeclarativeValidatorRunOptions = {}
): DeclarativeValidationResult {
  const validators = normalizeDeclarativeValidators(rawValidators);
  if (validators.length === 0) return { ok: true, errors: [], warnings: [] };
  const jsonataInput = options.jsonataValueMode === "root" ? value : { data: value };
  const errors: DeclarativeValidationIssue[] = [];
  const warnings: DeclarativeValidationIssue[] = [];
  const pushIssue = (validator: DeclarativeValidator, detail: string) => {
    const issue = {
      detail,
      ...(typeof validator.code === "string" ? { code: validator.code } : {}),
      ...(typeof validator.node === "string" ? { node: validator.node } : {}),
    };
    (validator.level === "warning" ? warnings : errors).push(issue);
  };
  for (const validator of validators) {
    if (
      validator.kind === "blueprint-cell" ||
      validator.kind === "blueprint-tier" ||
      validator.kind === "blueprint-lowering-recipe" ||
      validator.kind === "blueprint"
    ) {
      const schema = validator.kind === "blueprint"
        ? blueprintSchema
        : validator.kind === "blueprint-cell"
          ? cellSchema
          : validator.kind === "blueprint-tier"
            ? tierSchema
            : { $ref: `${loweringRecipeSchema.$id}#/definitions/loweringRecipe` };
      const schemaValidator: AjvSchemaDeclarativeValidator = {
        kind: "ajv-schema",
        schema,
        refs: [
          { schema: blueprintSchema, key: blueprintSchema.$id },
          { schema: cellSchema, key: cellSchema.$id },
          { schema: programSchema, key: programSchema.$id },
          { schema: tierSchema, key: tierSchema.$id },
          { schema: loweringRecipeSchema, key: loweringRecipeSchema.$id },
          { schema: uiFormSchema, key: uiFormSchema.$id },
        ].filter(({ key }) => key !== ("$id" in schema ? schema.$id : undefined)),
        message: validator.message,
        level: validator.level,
        ...(validator.code ? { code: validator.code } : {}),
        ...(validator.node ? { node: validator.node } : {}),
      };
      const validate = compiledSchemaValidatorFor(schemaValidator);
      if (!validate(value)) {
        const details = ajvErrorDetails(validate.errors);
        for (const detail of details.length > 0 ? details : [validator.message]) {
          pushIssue(validator, detail === validator.message ? detail : `${validator.message}: ${detail}`);
        }
        continue;
      }

      if (validator.kind === "blueprint-tier") continue;
      if (validator.kind === "blueprint-lowering-recipe") {
        for (const issue of validateLoweringRecipeSemantics(value)) {
          pushIssue(validator, `${validator.message}: ${issue.detail}`);
        }
        continue;
      }

      if (validator.kind === "blueprint") {
        const recipes = (value as { payload?: { recipes?: JsonValue[] } }).payload?.recipes ?? [];
        for (const recipe of recipes) {
          for (const issue of validateLoweringRecipeSemantics(recipe)) {
            pushIssue(validator, `${validator.message}: Recipe '${String((recipe as { id?: unknown }).id)}': ${issue.detail}`);
          }
        }
      }

      const cells = validator.kind === "blueprint"
        ? Object.entries(((value as { payload?: { cells?: Record<string, unknown> } }).payload?.cells ?? {}))
        : [[(value as { id?: unknown }).id, value] as const];
      for (const [cellId, cell] of cells) {
        const report = validateCell(cell);
        for (const issue of report.errors) {
          pushIssue(
            validator,
            `${validator.message}: Cell '${String(cellId)}': ${issue.detail}`,
          );
        }
      }
      continue;
    }

    if (validator.kind === "blueprint-capability-acceptance") {
      const acceptedField = validator.acceptedField ?? "acceptedCapabilities";
      const request = options.bindings?.request;
      const acceptedRaw = request && typeof request === "object" && !Array.isArray(request)
        ? (request as Record<string, JsonValue>)[acceptedField]
        : undefined;
      const accepted = new Set(Array.isArray(acceptedRaw) ? acceptedRaw.filter((entry) => typeof entry === "string") : []);
      const used = [...new Set(collectBlueprintCapabilities(value))];
      const violations = used.filter((capability) => !accepted.has(capability));
      if (violations.length > 0) {
        pushIssue(validator, `${validator.message}: ${violations.join(", ")}`);
      }
      continue;
    }

    if (validator.kind === "jsonata") {
      let ok = false;
      try {
        ok = evalSyncJsonata(validator.expr, jsonataInput, options.bindings ?? {}) === true;
      } catch {
        ok = false;
      }
      if (!ok) pushIssue(validator, validator.message);
      continue;
    }

    if (validator.kind === "typedef") {
      if (!matchesType(validator.type, value)) {
        pushIssue(validator, validator.message ? `${validator.message}: expected ${typeLabel(validator.type)}` : `expected ${typeLabel(validator.type)}`);
      }
      continue;
    }

    if (validator.kind === "jsonata-expression") {
      if (typeof value !== "string") {
        pushIssue(validator, validator.message ? `${validator.message}: expected string` : "expected string");
        continue;
      }
      const result = validateJsonataExpression(value, { mode: validator.mode });
      if (!result.ok) {
        pushIssue(
          validator,
          result.error && result.error.length > 0
            ? `${validator.message}: ${result.error}`
            : validator.message
        );
      }
      continue;
    }

    const validate = compiledSchemaValidatorFor(validator);
    if (validate(value)) continue;

    const details = ajvErrorDetails(validate.errors);
    if (details.length === 0) {
      pushIssue(validator, validator.message);
      continue;
    }

    for (const detail of details) {
      pushIssue(validator, validator.message ? `${validator.message}: ${detail}` : detail);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** Every `capability` a Blueprint (enveloped or bare) declares or uses, across both an already
 * materialized shape (`payload.cells[*].potentialViews`) and an un-lowered recipe shape
 * (`payload.recipes[*].representations[*]`), so the same check works regardless of which tier a
 * generated Blueprint document happens to be authored at. */
function collectBlueprintCapabilities(value: JsonValue): string[] {
  const out: string[] = [];
  const addDecoration = (decoration: unknown): void => {
    if (decoration && typeof decoration === "object" && typeof (decoration as { capability?: unknown }).capability === "string") {
      out.push((decoration as { capability: string }).capability);
    }
  };
  const addView = (view: unknown): void => {
    if (!view || typeof view !== "object") return;
    const v = view as { capability?: unknown; before?: unknown; after?: unknown };
    if (typeof v.capability === "string") out.push(v.capability);
    for (const decoration of Array.isArray(v.before) ? v.before : []) addDecoration(decoration);
    for (const decoration of Array.isArray(v.after) ? v.after : []) addDecoration(decoration);
  };
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
  const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
    ? record.payload as Record<string, JsonValue>
    : record;

  const cells = payload.cells && typeof payload.cells === "object" && !Array.isArray(payload.cells)
    ? payload.cells as Record<string, JsonValue>
    : {};
  for (const cell of Object.values(cells)) {
    if (!cell || typeof cell !== "object") continue;
    const potentialViews = (cell as { potentialViews?: unknown }).potentialViews;
    if (potentialViews && typeof potentialViews === "object") {
      for (const view of Object.values(potentialViews as Record<string, unknown>)) addView(view);
    }
  }

  const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
  for (const recipe of recipes) {
    if (!recipe || typeof recipe !== "object") continue;
    const representations = (recipe as { representations?: unknown }).representations;
    for (const representation of Array.isArray(representations) ? representations : []) {
      if (!representation || typeof representation !== "object") continue;
      const rep = representation as { views?: unknown; presentation?: unknown; decorators?: unknown };
      const allowedCapabilities = rep.presentation && typeof rep.presentation === "object"
        ? (rep.presentation as { allowedCapabilities?: unknown }).allowedCapabilities
        : undefined;
      for (const capability of Array.isArray(allowedCapabilities) ? allowedCapabilities : []) {
        if (typeof capability === "string") out.push(capability);
      }
      if (rep.views && typeof rep.views === "object") {
        for (const cellViews of Object.values(rep.views as Record<string, unknown>)) {
          if (!cellViews || typeof cellViews !== "object") continue;
          for (const view of Object.values(cellViews as Record<string, unknown>)) addView(view);
        }
      }
      for (const decorator of Array.isArray(rep.decorators) ? rep.decorators : []) {
        if (!decorator || typeof decorator !== "object") continue;
        addDecoration((decorator as { before?: unknown }).before);
        addDecoration((decorator as { after?: unknown }).after);
      }
    }
  }
  return out;
}

function validateLoweringRecipeSemantics(value: JsonValue): DeclarativeValidationResult["errors"] {
  const recipe = value as {
    representations?: {
      id?: unknown;
      when?: unknown;
      extends?: unknown;
      decorators?: { select?: unknown }[];
    }[];
    fallback?: unknown;
    implementationPrograms?: { id?: unknown; when?: unknown }[];
    implementationFallback?: unknown;
  };
  const errors: DeclarativeValidationIssue[] = [];
  const validateVariants = (
    variants: readonly { id?: unknown; when?: unknown }[],
    fallback: unknown,
    label: string,
  ) => {
    const ids = new Set<string>();
    for (const variant of variants) {
      if (typeof variant.id === "string") {
        if (ids.has(variant.id)) errors.push({ detail: `duplicate ${label} '${variant.id}'` });
        ids.add(variant.id);
      }
      if (typeof variant.when === "string") {
        const result = validateJsonataExpression(variant.when, { mode: "full" });
        if (!result.ok) errors.push({ detail: `${label} '${String(variant.id)}' has invalid when expression: ${result.error}` });
      }
    }
    if (typeof fallback === "string" && !ids.has(fallback)) {
      errors.push({ detail: `${label} fallback '${fallback}' does not reference a declared ${label}` });
    }
    return ids;
  };

  if (Array.isArray(recipe.representations)) {
    const ids = validateVariants(recipe.representations, recipe.fallback, "representation");
    const parents = new Map<string, string>();
    for (const representation of recipe.representations) {
      if (typeof representation.extends === "string" && !ids.has(representation.extends)) {
        errors.push({ detail: `representation '${String(representation.id)}' extends unknown representation '${representation.extends}'` });
      } else if (typeof representation.id === "string" && typeof representation.extends === "string") {
        parents.set(representation.id, representation.extends);
      }
      for (const decorator of representation.decorators ?? []) {
        if (typeof decorator.select !== "string") continue;
        const result = validateJsonataExpression(decorator.select, { mode: "full" });
        if (!result.ok) {
          errors.push({
            detail: `representation '${String(representation.id)}' has invalid decorator select expression: ${result.error}`,
          });
        }
      }
    }
    for (const id of ids) {
      const visited = new Set<string>();
      let cursor: string | undefined = id;
      while (cursor !== undefined) {
        if (visited.has(cursor)) {
          errors.push({ detail: `representation inheritance contains a cycle at '${cursor}'` });
          break;
        }
        visited.add(cursor);
        cursor = parents.get(cursor);
      }
    }
  }
  if (Array.isArray(recipe.implementationPrograms)) {
    validateVariants(recipe.implementationPrograms, recipe.implementationFallback, "implementation program");
  }
  return errors;
}

export function validateTier(value: JsonValue): DeclarativeValidationResult {
  return runDeclarativeValidators([{ kind: "blueprint-tier" }], value);
}

export function validateLoweringRecipe(value: JsonValue): DeclarativeValidationResult {
  return runDeclarativeValidators([{ kind: "blueprint-lowering-recipe" }], value);
}

export const validateRecipe = validateLoweringRecipe;