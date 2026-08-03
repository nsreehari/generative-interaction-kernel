# Cached incident report explorer

This read-only Blueprint renders checked-in incident intelligence fixtures through the same projection renderer as `incident-report-explorer`. It has no Foundry service, access gate, editor, or Analyze command.

Open it locally at:

```text
http://localhost:5175/cached/incident-report-explorer/
```

The fixtures contain the validated v1 semantic items and projection candidates returned for each sample report. Do not store the provider transport envelope, conversation IDs, credentials, rendered HTML, or screenshots.

Validate changes with:

```bash
cd samples
npx vitest run tests/cached-incident-report-explorer.test.ts
```
