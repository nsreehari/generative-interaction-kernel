// validate-before-commit: structural validation of a program message
// against the normative GIK program schema.

import Ajv, { type ValidateFunction } from "ajv";
import programSchema from "../../schemas/program.schema.json" with { type: "json" };
import type { CapabilityDescriptor, DocNode, ExecutableProgramDefinition } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(programSchema);

export class ValidationError extends Error {
  constructor(message: string, readonly errors: unknown) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateProgramMessage(message: unknown): void {
  if (!validateFn(message)) {
    const detail = (validateFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new ValidationError(`Invalid GIK program: ${detail}`, validateFn.errors);
  }
}

// Per-capability props validators, compiled once per `propsSchema` object (schemas are stable manifest
// data, so the object identity is a sound cache key).
const propsValidators = new WeakMap<object, ValidateFunction>();
const propsValidatorsById = new Map<string, { source: string; validate: ValidateFunction }>();
function propsValidator(schema: object): ValidateFunction {
  let v = propsValidators.get(schema);
  if (!v) {
    const schemaId = (schema as { $id?: unknown }).$id;
    if (typeof schemaId === "string") {
      const source = JSON.stringify(schema);
      const existing = propsValidatorsById.get(schemaId);
      if (existing) {
        if (existing.source !== source) {
          throw new Error(`Conflicting props schemas declare $id ${JSON.stringify(schemaId)}`);
        }
        propsValidators.set(schema, existing.validate);
        return existing.validate;
      }
      v = ajv.compile(schema);
      propsValidatorsById.set(schemaId, { source, validate: v });
      propsValidators.set(schema, v);
      return v;
    }
    v = ajv.compile(schema);
    propsValidators.set(schema, v);
  }
  return v;
}

/**
 * Enforce each capability's declared `propsSchema` against the STATIC props authored on every node —
 * the kernel boundary check for props (a peer of {@link validateProgramMessage}). A prop supplied
 * dynamically by a `read`/`readExpr` edge is exempt from that schema's `required` list, since it lands
 * only at resolve time; the check therefore validates what the document actually authors without
 * false-positives on bound props. Nodes whose capability has no descriptor (external/fallback) are
 * skipped. Throws {@link ValidationError} listing every violation.
 */
export function validateProgramDefinition(
  program: ExecutableProgramDefinition,
  capabilities: Record<string, CapabilityDescriptor> | undefined
): void {
  const caps = capabilities ?? {};
  const errors: string[] = [];
  if (program.root) validateNodeProps(program.root, caps, errors);
  if (errors.length > 0) {
    throw new ValidationError(`Invalid node props: ${errors.join("; ")}`, errors);
  }
}

const LIST_LIKE_DATA_PROPS = new Set(["rows", "items", "options", "groups", "buttons"]);

function isBracketWrappedArrayExpr(expr: string): boolean {
  const trimmed = expr.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

function schemaExpectsArrayProp(schema: object | undefined, prop: string): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  const propSchema = properties?.[prop];
  if (!propSchema || typeof propSchema !== "object" || Array.isArray(propSchema)) return false;
  const type = (propSchema as { type?: unknown }).type;
  return type === "array" || (Array.isArray(type) && type.includes("array"));
}

function requiresBracketWrappedReadExpr(descriptor: CapabilityDescriptor | undefined, prop: string): boolean {
  if (!descriptor || descriptor.dataProp !== prop) return false;
  return LIST_LIKE_DATA_PROPS.has(prop) || schemaExpectsArrayProp(descriptor.propsSchema, prop);
}

function validateNodeProps(
  node: DocNode,
  caps: Record<string, CapabilityDescriptor>,
  errors: string[]
): void {
  const descriptor = caps[node.capability];
  const schema = descriptor?.propsSchema;
  if (schema) {
    const validate = propsValidator(schema);
    if (!validate(node.props ?? {})) {
      const dynamic = new Set([
        ...Object.keys(node.edges?.read ?? {}),
        ...Object.keys(node.edges?.readExpr ?? {}),
      ]);
      for (const e of validate.errors ?? []) {
        const missing = (e.params as { missingProperty?: string } | undefined)?.missingProperty;
        if (e.keyword === "required" && missing !== undefined && dynamic.has(missing)) continue;
        errors.push(`${node.id} (${node.capability})${e.instancePath} ${e.message}`);
      }
    }
  }
  for (const [prop, expr] of Object.entries(node.edges?.readExpr ?? {})) {
    if (requiresBracketWrappedReadExpr(descriptor, prop) && !isBracketWrappedArrayExpr(expr)) {
      errors.push(
        `${node.id} (${node.capability}) readExpr.${prop} must use bracket-wrapped JSONata to materialize an array result`
      );
    }
  }
  for (const child of node.edges?.children ?? []) validateNodeProps(child, caps, errors);
}
