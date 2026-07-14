import Ajv, { type ValidateFunction } from "ajv";

import { evalSyncJsonata } from "./evaluators";

type DeclarativeTypeName =
  | "json"
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

interface JsonataDeclarativeValidator {
  kind: "jsonata";
  expr: string;
  message: string;
}

interface AjvSchemaDeclarativeValidator {
  kind: "ajv-schema";
  schema: Record<string, unknown>;
  refs?: readonly { schema: Record<string, unknown>; key?: string }[];
  message: string;
}

interface TypeDefDeclarativeValidator {
  kind: "typedef";
  type: DeclarativeTypeName | readonly DeclarativeTypeName[];
  message: string;
}

type DeclarativeValidator =
  | JsonataDeclarativeValidator
  | AjvSchemaDeclarativeValidator
  | TypeDefDeclarativeValidator;

type DeclarativeValidatorInput =
  | [string, string?]
  | { kind?: "jsonata"; expr: string; message?: string }
  | { kind: "ajv-schema"; schema: Record<string, unknown>; refs?: readonly { schema: Record<string, unknown>; key?: string }[]; message?: string }
  | { kind: "typedef"; type: DeclarativeTypeName | readonly DeclarativeTypeName[]; message?: string };

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const ajvErrorDetail = (errors: unknown): string => {
  if (!Array.isArray(errors)) return "schema validation failed";
  const parts = errors
    .map((error) => {
      if (!error || typeof error !== "object") return "schema validation failed";
      const candidate = error as { instancePath?: unknown; message?: unknown };
      const instancePath = typeof candidate.instancePath === "string" && candidate.instancePath.length > 0
        ? candidate.instancePath
        : "/";
      const message = typeof candidate.message === "string" ? candidate.message : "is invalid";
      return `${instancePath} ${message}`;
    })
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join("; ") : "schema validation failed";
};

const ajvErrorDetails = (errors: unknown): string[] => {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((error) => {
      if (!error || typeof error !== "object") return "schema validation failed";
      const candidate = error as { instancePath?: unknown; message?: unknown };
      const instancePath = typeof candidate.instancePath === "string" && candidate.instancePath.length > 0
        ? candidate.instancePath
        : "/";
      const message = typeof candidate.message === "string" ? candidate.message : "is invalid";
      return `${instancePath} ${message}`;
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

function normalizeDeclarativeValidators(raw: unknown): DeclarativeValidator[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclarativeValidator[] = [];
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const expr = typeof entry[0] === "string" ? entry[0].trim() : "";
      if (expr) out.push({ kind: "jsonata", expr, message: typeof entry[1] === "string" ? entry[1] : "Invalid value" });
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
          });
        }
        continue;
      }
      const expr = typeof candidate.expr === "string" ? candidate.expr.trim() : "";
      if (expr) {
        out.push({
          kind: "jsonata",
          expr,
          message: typeof candidate.message === "string" ? candidate.message : "Invalid value",
        });
      }
    }
  }
  return out;
}

export function runDeclarativeValidators(
  rawValidators: readonly DeclarativeValidatorInput[] | unknown,
  value: JsonValue
): string[] {
  const validators = normalizeDeclarativeValidators(rawValidators);
  if (validators.length === 0) return [];
  const root = { data: value };
  const errors: string[] = [];
  for (const validator of validators) {
    if (validator.kind === "jsonata") {
      let ok = false;
      try {
        ok = evalSyncJsonata(validator.expr, root) === true;
      } catch {
        ok = false;
      }
      if (!ok) errors.push(validator.message);
      continue;
    }

    if (validator.kind === "typedef") {
      if (!matchesType(validator.type, value)) {
        errors.push(validator.message ? `${validator.message}: expected ${typeLabel(validator.type)}` : `expected ${typeLabel(validator.type)}`);
      }
      continue;
    }

    const validate = compiledSchemaValidatorFor(validator);
    if (validate(value)) continue;

    const details = ajvErrorDetails(validate.errors);
    if (details.length === 0) {
      errors.push(validator.message);
      continue;
    }

    for (const detail of details) {
      errors.push(validator.message ? `${validator.message}: ${detail}` : detail);
    }
  }
  return errors;
}