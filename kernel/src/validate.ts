// validate-before-commit: structural validation of a document message
// against the normative GUP document schema.

import Ajv, { type ValidateFunction } from "ajv";
import documentSchema from "../../schemas/document.schema.json" with { type: "json" };
import type { CapabilityDescriptor, DocNode, DocumentPayload } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(documentSchema);

export class ValidationError extends Error {
  constructor(message: string, readonly errors: unknown) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateDocumentMessage(message: unknown): void {
  if (!validateFn(message)) {
    const detail = (validateFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new ValidationError(`Invalid GUP document: ${detail}`, validateFn.errors);
  }
}

// Per-capability props validators, compiled once per `propsSchema` object (schemas are stable manifest
// data, so the object identity is a sound cache key).
const propsValidators = new WeakMap<object, ValidateFunction>();
function propsValidator(schema: object): ValidateFunction {
  let v = propsValidators.get(schema);
  if (!v) {
    v = ajv.compile(schema);
    propsValidators.set(schema, v);
  }
  return v;
}

/**
 * Enforce each capability's declared `propsSchema` against the STATIC props authored on every node —
 * the kernel boundary check for props (a peer of {@link validateDocumentMessage}). A prop supplied
 * dynamically by a `read`/`readExpr` edge is exempt from that schema's `required` list, since it lands
 * only at resolve time; the check therefore validates what the document actually authors without
 * false-positives on bound props. Nodes whose capability has no descriptor (external/fallback) are
 * skipped. Throws {@link ValidationError} listing every violation.
 */
export function validateDocumentProps(
  document: DocumentPayload,
  capabilities: Record<string, CapabilityDescriptor> | undefined
): void {
  const caps = capabilities ?? {};
  const errors: string[] = [];
  validateNodeProps(document.root, caps, errors);
  if (errors.length > 0) {
    throw new ValidationError(`Invalid node props: ${errors.join("; ")}`, errors);
  }
}

function validateNodeProps(
  node: DocNode,
  caps: Record<string, CapabilityDescriptor>,
  errors: string[]
): void {
  const schema = caps[node.capability]?.propsSchema;
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
  for (const child of node.edges?.children ?? []) validateNodeProps(child, caps, errors);
}
