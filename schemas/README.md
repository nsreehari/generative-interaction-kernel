# GIK Schemas & Conformance Fixture

Normative wire schemas for the **GIK Protocol (GIK) v0.1** — the first build artifact. Every
kernel, renderer, and orchestrator is written *against* these schemas and verified by the golden
fixture.

Spec prose: [../docs/03-protocol.md](../docs/03-protocol.md).

## Schemas (draft-07, one file per message)

| File | Message | Purpose |
|---|---|---|
| `manifest.schema.json` | `manifest` | the capability vocabulary a domain speaks |
| `document.schema.json` | `document` | the portable UI-intent artifact (nodes + machines) |
| `patch.schema.json` | `patch` | state deltas (kernel → renderer) |
| `event.schema.json` | `event` | interactions (renderer → kernel) |
| `trace.schema.json` | `trace` | observability (kernel → sink) |
| `envelope.schema.json` | any | `oneOf` the five; requires all five loaded (resolved by `$id`) |

Each message schema is **self-contained** (inlined `definitions`) so any validator in any language
can load a single file. Only `envelope.schema.json` uses cross-file `$ref` (by `$id`).

## Golden conformance fixture

Drawn from the **live-cards** first onboarding profile
([../docs/04-first-onboarding-profile.md](../docs/04-first-onboarding-profile.md)):

| File | Role |
|---|---|
| `fixtures/live-cards.manifest.json` | a manifest (4 capabilities, 4 namespaces, jsonata) |
| `fixtures/example.document.json` | a board with a metric (`read`), a table (`on.rowSelect`), a gated action button, and an approval machine |
| `fixtures/example.event.json` | a `rowSelect` event carrying `{ id: "order-42" }` |
| `fixtures/expected.patch.json` | the patch a conforming kernel MUST produce from that event |

**Golden reduction contract:** the `rowSelect` event on `table-orders` resolves that node's
`on.rowSelect` `assign` edge, writing the event's id into `card_data.selected` →
`set card_data.selected = "order-42"`. Any conforming kernel must produce exactly
`expected.patch.json`.

## Run

```bash
npm install
npm run conformance
```

The runner validates every fixture against its message schema and through the envelope, then
asserts the golden reduction contract is internally consistent with the document's behavior edge.
The reducer itself is future work; this fixture pins the contract it must satisfy.
