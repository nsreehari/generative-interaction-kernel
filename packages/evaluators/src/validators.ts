import Ajv, { type ValidateFunction } from "ajv";

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

type DeclarativeValidatorLevel = "error" | "warning";

type DeclarativeValidationIssue = {
  detail: string;
  code?: string;
  node?: string;
};

type DeclarativeValidationResult = {
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

type DeclarativeValidator =
  | JsonataDeclarativeValidator
  | AjvSchemaDeclarativeValidator
  | JsonataExpressionDeclarativeValidator
  | TypeDefDeclarativeValidator;

type DeclarativeValidatorInput =
  | [string, string?]
  | { kind?: "jsonata"; expr: string; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "ajv-schema"; schema: Record<string, unknown>; refs?: readonly { schema: Record<string, unknown>; key?: string }[]; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "jsonata-expression"; mode?: JsonataExpressionValidationMode; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string }
  | { kind: "typedef"; type: DeclarativeTypeName | readonly DeclarativeTypeName[]; message?: string; level?: DeclarativeValidatorLevel; code?: string; node?: string };

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type DeclarativeValidatorRunOptions = {
  bindings?: Record<string, JsonValue>;
  jsonataValueMode?: "wrapped-data" | "root";
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