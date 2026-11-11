import Ajv, { type ValidateFunction } from "ajv";
import type { Json } from "../../../kernel/src/index";
import type { ServiceRequest, ServiceRequestInput, ServiceValidationReport } from "./queueface";
import {
  serviceConfig,
  type BlueprintServiceIdentity,
  type ServiceKindFactory,
} from "./service-kinds";

export interface ContextRecord {
  [key: string]: Json | undefined;
  id: string;
  kind: string;
  observedAt: string;
  content?: Json;
  references?: Json[];
}

export interface ContextStoreQueryInput {
  scope: string;
  requestKey: string;
  query: Record<string, Json>;
  limit: number;
}

export interface ContextStoreQueryOutput {
  scope: string;
  requestKey: string;
  records: ContextRecord[];
}

export interface ContextStoreIngestInput {
  scope: string;
  records: ContextRecord[];
}

export interface ContextStoreIngestOutput {
  scope: string;
  recordIds: string[];
  status: "stored";
}

/** Host dispatch envelope; storeRef and scope are identifiers, not authorization grants. */
export type ContextStoreExecutionRequest = {
  kind: "context-store";
  storeRef: string;
  identity?: BlueprintServiceIdentity;
  request: ServiceRequest;
  signal?: AbortSignal;
} & (
  | { operation: "query"; input: ContextStoreQueryInput }
  | { operation: "ingest"; input: ContextStoreIngestInput }
);

export const CONTEXT_STORE_QUERY_CONTRACT = "context-store.query/v1";
export const CONTEXT_STORE_INGEST_CONTRACT = "context-store.ingest/v1";
export const CONTEXT_STORE_MAX_QUERY_LIMIT = 1000;

const text = { type: "string", minLength: 1 };
const definitions = {
  json: {
    anyOf: [
      { type: ["string", "number", "boolean", "null"] },
      { type: "array", items: { $ref: "#/$defs/json" } },
      { type: "object", additionalProperties: { $ref: "#/$defs/json" } },
    ],
  },
  record: {
    type: "object",
    required: ["id", "kind", "observedAt"],
    properties: {
      id: text,
      kind: text,
      observedAt: text,
      content: { $ref: "#/$defs/json" },
      references: { type: "array", items: { $ref: "#/$defs/json" } },
    },
    additionalProperties: { $ref: "#/$defs/json" },
  },
};

export const contextRecordSchema = { $defs: definitions, ...definitions.record };
export const contextStoreQueryInputSchema = {
  $defs: definitions,
  type: "object",
  required: ["scope", "requestKey", "query", "limit"],
  properties: {
    scope: text,
    requestKey: text,
    query: { type: "object", additionalProperties: { $ref: "#/$defs/json" } },
    limit: { type: "integer", minimum: 1, maximum: CONTEXT_STORE_MAX_QUERY_LIMIT },
  },
  additionalProperties: false,
};
export const contextStoreQueryOutputSchema = {
  $defs: definitions,
  type: "object",
  required: ["scope", "requestKey", "records"],
  properties: {
    scope: text,
    requestKey: text,
    records: { type: "array", items: { $ref: "#/$defs/record" } },
  },
  additionalProperties: false,
};
export const contextStoreIngestInputSchema = {
  $defs: definitions,
  type: "object",
  required: ["scope", "records"],
  properties: {
    scope: text,
    records: { type: "array", items: { $ref: "#/$defs/record" } },
  },
  additionalProperties: false,
};
export const contextStoreIngestOutputSchema = {
  type: "object",
  required: ["scope", "recordIds", "status"],
  properties: {
    scope: text,
    recordIds: { type: "array", items: text },
    status: { const: "stored" },
  },
  additionalProperties: false,
};

export function createContextStoreServiceKind(): ServiceKindFactory {
  const provider = { id: "context-store", version: "1" };
  const ajv = new Ajv({ allErrors: true, strict: false, strictNumbers: true });
  const operations = {
    query: {
      contract: CONTEXT_STORE_QUERY_CONTRACT,
      inputSchema: contextStoreQueryInputSchema,
      outputSchema: contextStoreQueryOutputSchema,
      input: ajv.compile(contextStoreQueryInputSchema),
      output: ajv.compile(contextStoreQueryOutputSchema),
    },
    ingest: {
      contract: CONTEXT_STORE_INGEST_CONTRACT,
      inputSchema: contextStoreIngestInputSchema,
      outputSchema: contextStoreIngestOutputSchema,
      input: ajv.compile(contextStoreIngestInputSchema),
      output: ajv.compile(contextStoreIngestOutputSchema),
    },
  };
  function operation(name: string) {
    if (name !== "query" && name !== "ingest") throw new Error(`Unsupported context-store operation '${name}'`);
    return operations[name];
  }
  function check(validator: ValidateFunction, value: unknown, label: string): void {
    if (!validator(value)) {
      throw new Error(`Invalid context-store ${label}: ${ajv.errorsText(validator.errors)}`);
    }
  }
  function validateInput(request: ServiceRequestInput): ServiceValidationReport {
    try {
      check(operation(request.operation).input, request.input, "input");
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [String(error)] };
    }
  }
  return {
    manifest: {
      ...provider,
      title: "Host-backed context store",
      configSchema: {
        type: "object",
        required: ["storeRef"],
        properties: { storeRef: text },
        additionalProperties: false,
      },
      executionModes: ["immediate", "queued"],
      subjects: ["cell", "substrate-agent", "chat", "task"],
    },
    validate(declaration, context) {
      if (!context.execute) return { ok: false, errors: ["context-store requires a host execute backend"] };
      if (declaration.version !== "1") return { ok: false, errors: ["context-store supports version 1 only"] };
      const supported = Object.values(declaration.operations).every((entry) =>
        (entry.operation === "query" || entry.operation === "ingest")
        && entry.contract === operations[entry.operation].contract && !entry.sense,
      );
      return supported ? { ok: true } : {
        ok: false,
        errors: ["context-store requires query/context-store.query/v1 or ingest/context-store.ingest/v1 bounded operations"],
      };
    },
    create(declaration, context) {
      const execute = context.execute;
      if (!execute) throw new Error("context-store requires a host execute backend");
      const storeRef = String(serviceConfig(declaration).storeRef);
      return {
        provider,
        async discover() {
          return {
            provider,
            revision: "1",
            discoveredAt: new Date().toISOString(),
            capabilities: Object.entries(operations).map(([name, entry]) => ({
              id: entry.contract,
              operation: name,
              version: "1",
              inputSchema: entry.inputSchema,
              outputSchema: entry.outputSchema,
              assurance: "declared-and-locally-validated" as const,
              supports: { validate: true },
            })),
          };
        },
        validate: validateInput,
        async execute(request, adapterContext) {
          const entry = operation(request.operation);
          if (request.capabilityId !== entry.contract) throw new Error("context-store contract does not match operation");
          check(entry.input, request.input, "input");
          const input = structuredClone(request.input) as unknown as ContextStoreQueryInput | ContextStoreIngestInput;
          const expected = structuredClone(input);
          const envelope = {
            kind: "context-store",
            storeRef,
            identity: context.identity,
            request: structuredClone(request),
            signal: adapterContext.signal,
            operation: request.operation,
            input,
          } as ContextStoreExecutionRequest;
          const output = await execute(envelope);
          check(entry.output, output, "output");
          const result = output as ContextStoreQueryOutput | ContextStoreIngestOutput;
          if (result.scope !== expected.scope) throw new Error("context-store response scope does not match request");
          if ("requestKey" in expected) {
            const queried = result as ContextStoreQueryOutput;
            if (queried.requestKey !== expected.requestKey) throw new Error("context-store response requestKey does not match request");
            if (queried.records.length > expected.limit) throw new Error("context-store response exceeds query limit");
          } else {
            const stored = result as ContextStoreIngestOutput;
            const requestedIds = expected.records.map(({ id }) => id).sort();
            if (JSON.stringify([...stored.recordIds].sort()) !== JSON.stringify(requestedIds)) {
              throw new Error("context-store acknowledgment recordIds do not match request");
            }
          }
          return { output: output as Json };
        },
      };
    },
  };
}
