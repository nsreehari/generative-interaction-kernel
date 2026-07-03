// validate-before-commit: structural validation of a document message
// against the normative GUP document schema.

import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaUrl = new URL("../../schemas/document.schema.json", import.meta.url);
const documentSchema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), "utf8"));

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
