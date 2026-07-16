# T7 - Deployment continuity proof - working notes

> Scope: Beat 4 medium transversality. Prove that an interactive SSE client, MCP participants,
> and a headless worker can use one authoritative runtime without creating shadow state.
>
> Status: **PHASE 1 IMPLEMENTED (2026-07-15).** Transport-isolated continuation and reconnect
> replay are executable. Durable recovery across an authority-process restart is not yet proven.

## 1. Implemented proof

The `control-host` now has a `continuity` demo mode over one `ControlFace`:

```text
SSE renderer attaches at rev 0
  -> renderer disconnects
MCP control queues work
  -> kernel commits rev 1, requestedBy=mcp-control
headless worker reads state through agent-safe MCP
  -> worker completes through control-plane MCP
  -> kernel commits rev 2, completedBy=background-worker
agent-safe MCP reads the completed shared state
SSE renderer resumes from rev 0
  -> receives patch rev 1 and patch rev 2
  -> receives no duplicate manifest or document onboarding
```

The worker in `samples/control-host/continuity-worker.ts` has no kernel, store, or face reference.
It communicates only through HTTP MCP endpoints, so the same module can run in another process or
host. Transport carries projection and drive; it does not own state or policy.

## 2. Executable evidence

`samples/control-host/service.test.ts` proves all of the following in one scenario:

- the SSE client can detach before work begins;
- `/mcp-control` queues the job as an ordinary governed event;
- the headless worker observes the queue through read-only `/mcp`;
- the worker completes it through `/mcp-control`;
- shared state records requester, completer, status, and result;
- `/mcp` observes the completed state without drive privilege;
- `GET /gik/stream?fromRev=0` replays exactly revisions 1 and 2;
- resume sends patches only, not a second manifest/document onboarding.

Focused validation:

```bash
npx vitest run --project samples samples/control-host/service.test.ts
```

Manual two-process run:

```bash
GENUI_CONTROLFACE_DEMO=continuity npm run dev:controlface
npm run dev:continuity-worker
```

Queue the job before running the worker:

```bash
curl -X POST http://127.0.0.1:8788/mcp-control \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"emit","arguments":{"event":{"node":"continuity-controller","name":"queue"}}}}'
```

## 3. What this proves

- A renderer can leave while work continues through the same state authority.
- A headless participant can observe and drive work over MCP without embedding the kernel.
- Reconnecting SSE consumers recover missed revisions from the authority's patch history.
- Interactive and headless work remain causally attributed in shared state.
- MCP and SSE are transport projections over one runtime, not separate application backends.

## 4. Explicit boundary

This phase does **not** prove:

- state or patch-history survival after the control-host process restarts;
- durable queue leasing, retry, deduplication, or poison-job handling;
- multiple active authority processes coordinating through a shared database;
- network-partition conflict resolution;
- long-running work surviving termination of the background-worker process.

Those require a durable `StateModel`/patch-log adapter and a durable job transport. They are the
next phase of T7, not properties to infer from the in-memory continuity proof.

## 5. Next phase

1. Add a durable state and revision-log provider behind the existing `StateModel` boundary.
2. Add a durable queue adapter with job identity, lease, retry, and idempotency semantics.
3. Restart the control host between queue and completion, then prove MCP inspection and SSE resume.
4. Represent the tested topology and proof boundaries in the Deployment Atlas UI.