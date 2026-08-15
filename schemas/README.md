# GIK Conformance Fixture

The normative schemas are owned and published by `@gik/evaluators` from
[`../packages/evaluators/schemas`](../packages/evaluators/schemas). This directory retains the
cross-package conformance runner and fixtures that exercise those schemas.

Spec prose: [../docs/03-protocol.md](../docs/03-protocol.md).

## Schemas (draft-07, one file per message)

| File | Message | Purpose |
|---|---|---|
| `packages/evaluators/schemas/vocabulary.schema.json` | `vocabulary` | the runtime vocabulary, including optional projection capabilities |
| `packages/evaluators/schemas/program.schema.json` | `program` | the executable program definition with optional projection |
| `packages/evaluators/schemas/patch.schema.json` | `patch` | state deltas (kernel → renderer) |
| `packages/evaluators/schemas/event.schema.json` | `event` | interactions (renderer → kernel) |
| `packages/evaluators/schemas/trace.schema.json` | `trace` | observability (kernel → sink) |
| `packages/evaluators/schemas/envelope.schema.json` | any | `oneOf` the five; requires all five loaded (resolved by `$id`) |

Each message schema is **self-contained** (inlined `definitions`) so any validator in any language
can load a single file. Only `envelope.schema.json` uses cross-file `$ref` (by `$id`).

## Golden conformance fixture

Drawn from the historical **live-cards** onboarding fixture:

| File | Role |
|---|---|
| `fixtures/live-cards.vocabulary.json` | a projected vocabulary (4 capabilities, 4 namespaces, jsonata) |
| `fixtures/example.program.json` | a projected program with a metric (`read`), a table (`on.rowSelect`), a gated action button, and an approval machine |
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
asserts the golden reduction contract is internally consistent with the program's behavior edge.
The reducer itself is future work; this fixture pins the contract it must satisfy.
