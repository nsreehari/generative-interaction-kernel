# Cached incident report explorer 3

This read-only Blueprint renders checked-in semantic-model fixtures through the same Story and Canvas projections as `incident-report-explorer-3`. It has no Foundry service, access gate, editor, or Analyze command.

Open it locally at:

```text
http://localhost:5175/cached/incident-report-explorer-3/
```

## Refresh a fixture

1. Open the live `incident-report-explorer-3` Blueprint and enter the local access key.
2. Select one sample, run **Analyze report**, and inspect both flights.
3. In the browser Network panel, open the successful `POST /api/agent/chat` response.
4. Parse the JSON string in its `reply` property and save that object, formatted as JSON, to `fixtures/<sample-id>.json`.
5. Run:

```bash
npx vitest run samples/tests/cached-incident-report-explorer-3.test.ts
npm run typecheck --workspace=@gik/samples
```

The fixture test validates the live semantic response contract and all entity, phase, event, and evidence references. Do not save the transport envelope, conversation IDs, credentials, rendered HTML, or screenshots as the fixture.
