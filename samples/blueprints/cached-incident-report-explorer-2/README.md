# Cached incident report explorer 2

This read-only Blueprint renders checked-in semantic-model fixtures through the same operational and brief projections as `incident-report-explorer-2`. It has no Foundry service, access gate, editor, or Analyze command.

Open it locally at:

```text
http://localhost:5175/cached/incident-report-explorer-2/
```

The effect module reuses the v3 semantic fixtures. The focused test validates every fixture against the live v2 response contract, so this sharing remains an explicit compatibility boundary.

Validate changes with:

```bash
cd samples
npx vitest run tests/cached-incident-report-explorer-2.test.ts
```
