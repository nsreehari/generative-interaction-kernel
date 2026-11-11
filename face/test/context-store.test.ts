import assert from "node:assert/strict";
import { test } from "vitest";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type NativeServiceDeclaration,
  type Json,
} from "../../kernel/src/index";
import {
  CONTEXT_STORE_INGEST_CONTRACT,
  CONTEXT_STORE_QUERY_CONTRACT,
  DefaultServiceHost,
  ServiceKindRegistry,
  createContextStoreServiceKind,
  type ContextStoreExecutionRequest,
  type ServiceKindContext,
  type ServiceRequest,
} from "../src/index";

const record = {
  id: "observation-1",
  kind: "observation",
  observedAt: "2026-11-11T00:00:00Z",
  content: { answer: 42 },
  references: [{ url: "https://example.test/source" }],
  provenance: { source: "provider" },
};
const query = { scope: "portfolio-1", requestKey: "refresh-1", query: { kind: "observation" }, limit: 1 };
const identity = { blueprintId: "portfolio", blueprintRevision: "1", serviceId: "context" };
const settlement = { transform: { kind: "jsonata" as const, expr: "{'ops':[]}" } };
const declaration: NativeServiceDeclaration = {
  kind: "context-store",
  version: "1",
  config: { storeRef: "host/portfolio-context" },
  operations: {
    queryContext: { operation: "query", contract: CONTEXT_STORE_QUERY_CONTRACT, settlement },
    ingestContext: { operation: "ingest", contract: CONTEXT_STORE_INGEST_CONTRACT, settlement },
  },
};

function registry(execute?: ServiceKindContext["execute"]) {
  const result = new ServiceKindRegistry({ execute });
  result.register(createContextStoreServiceKind());
  return result;
}

function request(operation: "query" | "ingest", input: Json): ServiceRequest {
  return {
    id: "request-1",
    createdAt: "2026-11-11T00:00:00Z",
    service: "context",
    providerId: "context-store",
    operation,
    capabilityId: operation === "query" ? CONTEXT_STORE_QUERY_CONTRACT : CONTEXT_STORE_INGEST_CONTRACT,
    actorId: "owner",
    idempotencyKey: "write-1",
    input,
  };
}

test("context-store requires host integration and validates native declarations", async () => {
  assert.equal((await registry().validate(declaration)).ok, false);
  const kinds = registry(async () => null);
  assert.equal((await kinds.validate(declaration)).ok, true);
  const invalidDeclarations: NativeServiceDeclaration[] = [
    { ...declaration, config: {} },
    { ...declaration, config: { storeRef: "" } },
    { ...declaration, config: { storeRef: "store", endpoint: "https://example.test" } },
    { ...declaration, version: "2" },
    { ...declaration, operations: { query: { operation: "query", contract: CONTEXT_STORE_INGEST_CONTRACT, settlement } } },
    { ...declaration, operations: { remove: { operation: "remove", contract: "remove/v1", settlement } } },
  ];
  for (const invalid of invalidDeclarations) {
    assert.equal((await kinds.validate(invalid)).ok, false);
  }
  await assert.rejects(registry().materialize(identity, declaration), /host execute backend/);
});

test("context-store delegates query and ingest with host-owned store and request context", async () => {
  const calls: ContextStoreExecutionRequest[] = [];
  const kinds = registry(async (value) => {
    const call = value as ContextStoreExecutionRequest;
    calls.push(call);
    return call.operation === "query"
      ? { scope: call.input.scope, requestKey: call.input.requestKey, records: [record] }
      : { scope: call.input.scope, recordIds: call.input.records.map(({ id }) => id), status: "stored" };
  });
  const adapter = await kinds.materialize(identity, declaration);
  const signal = new AbortController().signal;
  assert.deepEqual((await adapter.discover()).capabilities.map(({ id }) => id), [
    CONTEXT_STORE_QUERY_CONTRACT, CONTEXT_STORE_INGEST_CONTRACT,
  ]);
  assert.deepEqual(await adapter.execute(request("query", query), { signal }), {
    output: { scope: query.scope, requestKey: query.requestKey, records: [record] },
  });
  const ingest = { scope: query.scope, records: [record] };
  assert.deepEqual(await adapter.execute(request("ingest", ingest), {}), {
    output: { scope: query.scope, recordIds: [record.id], status: "stored" },
  });
  assert.deepEqual(calls.map(({ operation, input }) => ({ operation, input })), [
    { operation: "query", input: query }, { operation: "ingest", input: ingest },
  ]);
  assert.equal(calls[0].kind, "context-store");
  assert.equal(calls[0].storeRef, "host/portfolio-context");
  assert.deepEqual(calls[0].identity, identity);
  assert.equal(calls[0].request.actorId, "owner");
  assert.equal(calls[1].request.idempotencyKey, "write-1");
  assert.equal(calls[0].signal, signal);
  assert.equal(await kinds.materialize(identity, declaration), adapter);
  assert.notEqual(await kinds.materialize(identity, { ...declaration, scope: "per-invocation" }), adapter);
});

test("context-store rejects malformed inputs before delegating", async () => {
  let executions = 0;
  const adapter = await registry(async () => { executions++; }).materialize(identity, declaration);
  const inputs = [
    { ...query, scope: "" },
    { ...query, requestKey: "" },
    { ...query, query: [] },
    { scope: query.scope, requestKey: query.requestKey, limit: 1 },
    ...[0, -1, 1.5, 1001].map((limit) => ({ ...query, limit })),
  ];
  for (const input of inputs) {
    const invalid = request("query", input);
    assert.equal((await adapter.validate!(invalid, {})).ok, false);
    await assert.rejects(Promise.resolve().then(() => adapter.execute(invalid, {})), /Invalid context-store input/);
  }
  for (const invalidRecord of [{ ...record, id: "" }, { ...record, observedAt: 12 }, { ...record, references: {} }]) {
    await assert.rejects(async () => adapter.execute(request("ingest", { scope: query.scope, records: [invalidRecord] }), {}), /Invalid context-store input/);
  }
  await assert.rejects(async () => adapter.execute({ ...request("query", query), capabilityId: "wrong/v1" }, {}), /contract/);
  assert.equal(executions, 0);
});

test("context-store fails closed on malformed or mismatched backend query responses", async () => {
  let response: unknown;
  const adapter = await registry(async () => response).materialize(identity, declaration);
  for (const invalid of [
    undefined,
    { scope: query.scope, requestKey: query.requestKey, records: [{ id: "incomplete" }] },
    { scope: "another-portfolio", requestKey: query.requestKey, records: [record] },
    { scope: query.scope, requestKey: "another-request", records: [record] },
    { scope: query.scope, requestKey: query.requestKey, records: [record, record] },
    { scope: query.scope, requestKey: query.requestKey, records: [{ ...record, content: { invalid: Infinity } }] },
  ]) {
    response = invalid;
    await assert.rejects(async () => adapter.execute(request("query", query), {}), /context-store/);
  }
});

test("context-store requires an explicit matching ingest acknowledgment and propagates backend failure", async () => {
  let response: unknown;
  const adapter = await registry(async () => response).materialize(identity, declaration);
  const ingest = request("ingest", { scope: query.scope, records: [record] });
  for (const invalid of [
    undefined,
    { scope: query.scope, recordIds: [record.id], status: "accepted" },
    { scope: "another-portfolio", recordIds: [record.id], status: "stored" },
    { scope: query.scope, recordIds: [], status: "stored" },
    { scope: query.scope, recordIds: ["wrong-id"], status: "stored" },
  ]) {
    response = invalid;
    await assert.rejects(async () => adapter.execute(ingest, {}), /context-store/);
  }
  const failed = await registry(async () => { throw new Error("storage unavailable"); }).materialize(identity, declaration);
  await assert.rejects(async () => failed.execute(ingest, {}), /storage unavailable/);
});

test("native host authorization denies context-store access before backend execution", async () => {
  let executions = 0;
  const host = new DefaultServiceHost({
    ...identity,
    declarations: { context: declaration },
    registry: registry(async () => { executions++; }),
    state: new InMemoryStateModel(["work"]),
    expression: new JsonataExpressionProvider({ safe: true }),
    authorizeInvocation: () => ({ outcome: "rejected", reason: "scope not granted" }),
  });
  const outcome = await host.invoke({
    kind: "invoke", node: "portfolio", control: { tool: "queryContext" }, data: query,
  });
  assert.equal(outcome?.outcome, "rejected");
  assert.equal(executions, 0);
});
