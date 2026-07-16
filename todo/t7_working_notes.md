# T7 - Governed work beyond the interface - working notes

> Scope: Beat 4 medium transversality. Prove that a GIK interaction is authoritative work that
> humans, agents, devices, and background processes can leave and rejoin without losing state,
> causality, or authority.
>
> Status: **PHASE 1 PROTOCOL FIXTURE IMPLEMENTED (2026-07-15); PRODUCT PROOF REFRAMED
> (2026-07-16).** The control-host proves transport-isolated continuation and revision resume against
> one running in-memory authority. The next proof should build on the hosted board-runtime pattern
> already exercised in `yaml-flow` and `demo-boards-ns-code`, not turn control-host into a parallel
> application platform.

## 1. Claim and audience

T7's claim is not merely that MCP and SSE work:

> The interface is a projection onto governed work, not the container that owns the work. A client
> may detach while safe work continues, then rejoin the same substrate with state, attribution,
> causal history, and authorization boundaries intact.

The primary audience is application architects and product stakeholders:

- architects need evidence that the UI is not a hidden application runtime or source of truth;
- product stakeholders need a visible journey that is meaningfully different from an AI feature
  embedded in one page;
- agent-platform engineers need a transport-neutral participation surface that does not require
  browser automation or bespoke UI APIs;
- security and operations stakeholders need proof that unattended work does not bypass policy,
  role, confirmation, or audit boundaries.

## 2. Existing hosted-runtime precedent

T7 should explicitly build on two existing integration proofs.

### `yaml-flow/examples/board/test/server-http-test.js`

This test already demonstrates:

- server-owned board state and computation;
- headless HTTP mutations without a connected UI;
- SSE as an optional observation channel;
- persisted cards, files, chat state, and computed values;
- disconnect/reconnect using `Last-Event-ID`;
- recovery through a complete authoritative snapshot with a continuing frame identity.

It proves the core transport and hydration mechanics. It does not prove durable actor identity,
authorization, or a GIK causal journal.

### `demo-boards-ns-code/demo-board/test/my-http-test.js`

This is the stronger topology reference. It already demonstrates:

- a hosted runtime as the authority;
- HTTP/MCP command, query, action, and control-plane surfaces;
- a separate queue runner performing asynchronous work;
- SSE consumers applying the same state reduction used by the frontend;
- one-shot hydration of current authoritative state;
- persisted boards, cards, attachments, chat turns, and layout metadata;
- multiple concurrent operations sharing one runtime;
- a public-versus-control-plane visibility boundary.

This is close to the deployment shape T7 needs. It should be treated as precedent to reuse or adapt,
not functionality to independently recreate in GIK's control-host.

## 3. GIK-specific evidence still required

The board tests establish hosted and headless mechanics. T7 must add evidence for GIK's particular
contract:

1. **One authoritative GIK substrate.** Server state and revision identity remain authoritative;
   browser, native, MCP, and worker clients do not maintain competing application truth.
2. **One event/effect contract.** Headless work enters through the same governed operation surface as
   interactive work rather than a privileged side channel.
3. **Durable attribution.** Initiator, contributor, operation, result, and affected state remain
   identifiable after disconnect and resume.
4. **Causal recovery.** A returning projection receives current state plus enough causal history to
   explain what changed during its absence.
5. **Authority continuity.** Work allowed to proceed may continue unattended; consequential work
   remains blocked until the required human role authorizes or redirects it.
6. **Cross-projection continuity.** A different projection can join the same work and render the
   current substrate without reconstructing a separate session.

T7 does not require command replay or transport-frame replay as an end in itself. A valid resume
contract may be:

```text
authoritative snapshot
  + current revision
  + causal journal entries since the client's known revision
```

Delta replay is useful when available, but snapshot-plus-causal-history is sufficient if it restores
state and explanation deterministically.

## 4. Implemented Phase 1 fixture

The GIK `control-host` has a `continuity` demo mode over one `ControlFace`:

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

The worker in `samples/control-host/continuity-worker.ts` has no kernel, store, or face reference. It
communicates only through HTTP MCP endpoints and can therefore run in another process or host.

`samples/control-host/service.test.ts` proves:

- the SSE renderer can detach before work begins;
- MCP queues the job through an ordinary event;
- a transport-only worker observes and completes the job;
- shared state records requester, completer, status, and result;
- read-only MCP observes completion without drive privilege;
- SSE resume returns exactly the missed revisions without duplicate onboarding.

Focused validation:

```bash
npx vitest run --project samples samples/control-host/service.test.ts
```

Manual two-process run:

```bash
GENUI_CONTROLFACE_DEMO=continuity npm run dev:controlface
npm run dev:continuity-worker
```

This fixture proves that GIK's current protocol surfaces can support detached participation. It is a
narrow conformance proof, not the target hosted product architecture.

## 5. Target demonstration

The Beat 4 journey should make the claim visible without centering transport diagnostics:

```text
Morgan starts governed work from an interactive projection
  -> the hosted GIK runtime persists the work and attribution
the projection disconnects
  -> a background agent continues the safe investigative portion
  -> a consequential operation remains blocked for Priya
Priya joins from another projection
  -> current state and missed causal entries hydrate
  -> Priya authorizes, rejects, or redirects the pending operation
the operation completes
  -> every projection observes one result and one causal record
```

MCP, SSE, queue processing, hydration, and revision identity are supporting evidence. The audience
should primarily see continuous governed work, not a reconnect counter.

## 6. Explicit proof boundary

Phase 1 does **not** prove:

- state or causal-history survival after the authority process restarts;
- durable queue leasing, retry, deduplication, or poison-job handling;
- stable user identity and authorization across reconnect;
- multiple authority processes coordinating through shared storage;
- network-partition conflict resolution;
- exactly-once distributed execution;
- long-running work surviving termination of its worker process.

The board-runtime precedents prove several adjacent storage and queue mechanics, but they do not by
themselves prove the GIK attribution, governance, and cross-projection chain.

## 7. Next implementation phase

1. Choose the hosted board runtime as the reference topology and identify the smallest adapter seam
   for hosting a GIK substrate, rather than expanding control-host into another runtime platform.
2. Define the resume contract explicitly: authoritative snapshot, revision identity, and causal
   entries since the client's known revision.
3. Persist a work item with initiator, operation identity, authorization state, and causal metadata.
4. Run the safe portion through the existing queue-runner pattern while no projection is attached.
5. Hydrate a second projection and prove that it renders the same state and explanatory history.
6. Attempt a consequential background operation and prove it remains blocked until the required
   human role acts.
7. Represent the topology and honest proof boundaries in the Deployment Atlas UI.

The next design decision is therefore not "which durable store should control-host invent?" It is
"what is the thinnest GIK hosting and causal-resume contract over the already proven hosted-runtime
pattern?"