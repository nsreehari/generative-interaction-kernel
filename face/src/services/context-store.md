# Context store service kind

Register `createContextStoreServiceKind()` with the ordinary `ServiceKindRegistry`.
It requires native kind/version `context-store`/`1`, config `{ "storeRef": "host/store" }`,
and a host-supplied `ServiceKindContext.execute`. No storage implementation, network
transport, credentials, or in-memory fallback is provided.

| Operation | Contract | Input | Output |
| --- | --- | --- | --- |
| `query` | `context-store.query/v1` | `{scope, requestKey, query, limit}` | `{scope, requestKey, records}` |
| `ingest` | `context-store.ingest/v1` | `{scope, records}` | `{scope, recordIds, status: "stored"}` |

`scope`, `requestKey`, and `storeRef` are nonempty strings. `query` is a JSON object;
`limit` is an integer from 1 through 1000. Records require nonempty string `id`,
`kind`, and `observedAt` fields, with optional JSON `content`, JSON-array
`references`, and arbitrary JSON metadata/provenance fields. `observedAt` is not
parsed or normalized. Empty record arrays are allowed.

The host callback receives `ContextStoreExecutionRequest`:
`{kind: "context-store", storeRef, identity, request, signal, operation, input}`.
`identity` identifies the native Blueprint/service, `request` carries normal
actor/idempotency/correlation fields, and `signal` carries cancellation. The callback
returns the raw operation output, **not** a `{output}` envelope.

The adapter validates both directions, requires matching scope/requestKey, enforces
the query limit, and requires ingest acknowledgment IDs to match submitted IDs
(order-independent, including multiplicity). It never synthesizes a successful
write acknowledgment. The host backend must return `stored` only after its
configured storage has acknowledged the write; durability and idempotent writes
remain backend responsibilities.

Use the existing native service host authorization policy to authorize store,
operation, actor, and scope before dispatch. A scope or `storeRef` is not an
authority grant. Host dispatch must resolve and authorize the opaque `storeRef`;
if it resolves to an endpoint, the host owns endpoint authorization and secrets.
The adapter neither accepts endpoint configuration nor contacts endpoints.

Types, `contextRecordSchema`, the four `contextStore{Query,Ingest}{Input,Output}Schema`
objects, contract constants, and the query bound are exported from
`face/src/services/context-store.ts` and `face/src/index.ts`.
