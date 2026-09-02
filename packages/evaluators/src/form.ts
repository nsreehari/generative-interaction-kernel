import type { Json } from "gik-kernel";

import uiFormSchema from "../schemas/ui-form.schema.json" with { type: "json" };
import {
  runDeclarativeValidators,
  type DeclarativeValidationResult,
  type DeclarativeValidatorInput,
  type DeclarativeValidatorRunOptions,
} from "./validators";

export interface DeclarativeFormOption {
  value: Json;
  label: string;
}

export interface DeclarativeFormField {
  [key: string]: unknown;
  type?: "string" | "number" | "integer" | "boolean" | "array" | "json";
  title?: string;
  description?: string;
  hint?: string;
  format?: string;
  placeholder?: string;
  default?: Json;
  enum?: Json[];
  enumNames?: string[];
  oneOf?: Array<{ const: Json; title?: string }>;
  options?: Array<string | DeclarativeFormOption>;
  items?: DeclarativeFormField;
  readOnly?: boolean;
  disabled?: boolean;
  secret?: boolean;
  multiline?: boolean;
  rows?: number | string;
  colSpan?: number;
  span?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface DeclarativeFormSchema {
  type?: "object";
  properties: Record<string, DeclarativeFormField>;
  required?: string[];
  additionalProperties?: boolean;
  validators?: readonly DeclarativeValidatorInput[];
}

export interface DeclarativeFormSpec {
  fields: DeclarativeFormSchema;
  initialValue?: Record<string, Json>;
  saveLabel?: string;
  discardLabel?: string;
}

function jsonSchemaField(field: DeclarativeFormField): Record<string, unknown> {
  const {
    enumNames: _enumNames,
    options,
    readOnly: _readOnly,
    disabled: _disabled,
    secret: _secret,
    multiline: _multiline,
    rows: _rows,
    colSpan: _colSpan,
    span: _span,
    hint: _hint,
    ...schema
  } = field;
  if (schema.type === "json") delete schema.type;
  if (schema.items) schema.items = jsonSchemaField(schema.items);
  if (!schema.enum && !schema.oneOf && options) {
    const optionValues = options.map((option) => typeof option === "string" ? option : option.value);
    if (schema.type === "array") {
      schema.items = { ...(schema.items ?? {}), enum: optionValues };
    } else {
      schema.enum = optionValues;
    }
  }
  return schema;
}

function valueSchema(fields: DeclarativeFormSchema): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(fields.properties).map(([name, field]) => [name, jsonSchemaField(field)]),
    ),
    ...(fields.required ? { required: fields.required } : {}),
    ...(fields.additionalProperties !== undefined
      ? { additionalProperties: fields.additionalProperties }
      : {}),
  };
}

export function validateDeclarativeFormSpec(value: unknown): DeclarativeValidationResult {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: { $ref: `${uiFormSchema.$id}#/definitions/formSpec` },
    refs: [{ schema: uiFormSchema, key: uiFormSchema.$id }],
    message: "Invalid declarative form specification",
    code: "declarative-form-spec",
  }], value as Json);
}

export function validateDeclarativeFormValues(
  fields: DeclarativeFormSchema,
  values: Record<string, Json>,
  options: DeclarativeValidatorRunOptions = {},
): DeclarativeValidationResult {
  const schemaReport = runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: valueSchema(fields),
    message: "Invalid form values",
    code: "declarative-form-values",
  }], values);
  const validatorReport = runDeclarativeValidators(fields.validators, values, options);
  return {
    ok: schemaReport.ok && validatorReport.ok,
    errors: [...schemaReport.errors, ...validatorReport.errors],
    warnings: [...schemaReport.warnings, ...validatorReport.warnings],
  };
}

export function resolveDeclarativeFormInitialValue(
  spec: DeclarativeFormSpec | undefined,
  value: Readonly<Record<string, Json>> = {},
): Record<string, Json> {
  if (!spec) return structuredClone(value);
  const fieldDefaults = Object.fromEntries(
    Object.entries(spec.fields.properties).flatMap(([name, field]) =>
      field.default === undefined ? [] : [[name, structuredClone(field.default)]]),
  );
  return {
    ...fieldDefaults,
    ...structuredClone(spec.initialValue ?? {}),
    ...structuredClone(value),
  };
}
