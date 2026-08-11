import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentProposal } from "@gik/agent-lifecycle-exp";
import { createDurableRuntime } from "@gik/durable-runtime";
import { createMemoryStorage } from "@gik/durable-runtime/storage/memory";
import {
  createBlueprintProposalDurableTransitionAdapter,
  createBlueprintProposalHost,
  createDurableBlueprintProposalStore,
  createInMemoryBlueprintProposalStore,
  type BlueprintHostDecision,
} from "../src/index";

const proposal = (overrides: Partial<AgentProposal> = {}): AgentProposal => ({
  id: "proposal-1",
  capability: "use-blueprint",
  target: {
    kind: "blueprint-instance",
    id: "incident-report-explorer-1a",
    instanceId: "instance-1",
    expectedRevision: "1",
  },
  actions: [{ kind: "improve-report" }],
  createdAt: "2026-08-05T00:00:00.000Z",
  ...overrides,
});

function fixture(options: {
  authorization?: BlueprintHostDecision;
  admission?: BlueprintHostDecision;
  applicationAutomatic?: boolean;
  revision?: string;
} = {}) {
  let applications = 0;
  const store = createInMemoryBlueprintProposalStore();
  const host = createBlueprintProposalHost({
    store,
    authority: {
      inspect: (target) => ({ target, revision: options.revision ?? "1" }),
      validate: () => ({ ok: true }),
      apply: (receipt) => ({ receiptId: receipt.id, applications: ++applications }),
    },
    policySet: {
      authorization: {
        id: "fixture-authorization",
        version: "1",
        kind: "jsonata",
        phase: "authorization",
        expression: String(options.authorization?.ok ?? true),
        denyReason: options.authorization?.reason ?? "Authorization denied",
      },
      admission: {
        id: "fixture-admission",
        version: "1",
        kind: "jsonata",
        phase: "admission",
        expression: String(options.admission?.ok ?? true),
        denyReason: options.admission?.reason ?? "Admission denied",
      },
      application: {
        id: "fixture-application",
        version: "1",
        kind: "jsonata",
        phase: "application",
        expression: String(options.applicationAutomatic ?? true),
        denyReason: "Application is deferred",
      },
    },
  });
  return { host, store, applications: () => applications };
}

test("submit receives, authorizes, admits, and applies a proposal", async () => {
  const { host } = fixture();
  const receipt = await host.submit(proposal(), { id: "agent-1" });
  assert.equal(receipt.status, "applied");
  assert.deepEqual(receipt.audit.map(({ status }) => status), [
    "received", "authorized", "admitted", "applying", "applied",
  ]);
  assert.equal(receipt.actor.id, "agent-1");
});

test("authorization denial and revision mismatch become durable rejection statuses", async () => {
  const denied = await fixture({ authorization: { ok: false, reason: "actor denied" } })
    .host.submit(proposal(), { id: "agent-1" });
  assert.equal(denied.status, "rejected");
  assert.equal(denied.failure, "actor denied");

  const stale = await fixture({ revision: "2" }).host.submit(proposal(), { id: "agent-1" });
  assert.equal(stale.status, "rejected");
  assert.match(stale.failure ?? "", /Expected revision '1'/);

  const inadmissible = await fixture({ admission: { ok: false, reason: "policy denied" } })
    .host.submit(proposal(), { id: "agent-1" });
  assert.equal(inadmissible.status, "rejected");
  assert.equal(inadmissible.failure, "policy denied");
});

test("submit is idempotent by proposal id and applied receipts do not apply twice", async () => {
  const { host, applications } = fixture();
  const first = await host.submit(proposal(), { id: "agent-1" });
  const second = await host.submit(proposal(), { id: "agent-1" });
  const third = await host.apply(first);
  assert.equal(second.id, first.id);
  assert.equal(third.status, "applied");
  assert.equal(applications(), 1);
  await assert.rejects(
    host.submit(proposal({ actions: [{ kind: "save-report" }] }), { id: "agent-1" }),
    /already associated with different content/,
  );
});

test("reject and status expose terminal host decisions", async () => {
  const { host } = fixture({ applicationAutomatic: false });
  const admitted = await host.submit(proposal(), { id: "agent-1" });
  const rejected = await host.reject(admitted);
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(await host.status(rejected), rejected);
});

test("durable-runtime store replays receipt transitions into committed snapshots", async () => {
  const refs = {
    stateRef: "b64:eyJraW5kIjoiaW4tbWVtb3J5IiwidmFsdWUiOiJwcm9wb3NhbHMtc3RhdGUifQ",
    journalRef: "b64:eyJraW5kIjoiaW4tbWVtb3J5IiwidmFsdWUiOiJwcm9wb3NhbHMtam91cm5hbCJ9",
    effectsQueueRef: "b64:eyJraW5kIjoiaW4tbWVtb3J5IiwidmFsdWUiOiJwcm9wb3NhbHMtZWZmZWN0cyJ9",
  };
  const runtime = createDurableRuntime({
    runtimeId: "blueprint-proposal-host-test",
    providers: { "in-memory": createMemoryStorage() },
    transitionAdapter: createBlueprintProposalDurableTransitionAdapter(),
  });
  const store = await createDurableBlueprintProposalStore({ runtime, refs });
  const { host } = fixture({ applicationAutomatic: false });
  const receipt = await host.submit(proposal(), { id: "agent-1" });
  await store.create(receipt);
  const updated = { ...receipt, status: "rejected" as const, failure: "manual review" };
  await store.update(updated);
  assert.deepEqual(await store.get(receipt.id), updated);
  assert.deepEqual(await store.list(), [updated]);
});

test("apply forwards validated host application context to the authority", async () => {
  let context: unknown;
  const host = createBlueprintProposalHost({
    store: createInMemoryBlueprintProposalStore(),
    authority: {
      inspect: (target) => ({ target, revision: "1" }),
      validate: () => ({ ok: true }),
      apply: (_receipt, value) => { context = value; return { settled: true }; },
    },
    policySet: {
      authorization: {
        id: "context-authorization",
        version: "1",
        kind: "jsonata",
        phase: "authorization",
        expression: "true",
        denyReason: "Authorization denied",
      },
      admission: {
        id: "context-admission",
        version: "1",
        kind: "jsonata",
        phase: "admission",
        expression: "true",
        denyReason: "Admission denied",
      },
      application: {
        id: "context-application",
        version: "1",
        kind: "jsonata",
        phase: "application",
        expression: "false",
        denyReason: "Settlement validation must complete first",
      },
    },
  });
  const admitted = await host.submit(proposal(), { id: "agent-1" });
  const applied = await host.apply(admitted, { settlement: { ops: [] } });
  assert.deepEqual(context, { settlement: { ops: [] } });
  assert.equal(applied.status, "applied");
});

test("an applying receipt can recover through an idempotent authority", async () => {
  const { host, store, applications } = fixture({ applicationAutomatic: false });
  const admitted = await host.submit(proposal(), { id: "agent-1" });
  const applying = await store.update({ ...admitted, status: "applying" });
  const recovered = await host.apply(applying);
  assert.equal(recovered.status, "applied");
  assert.equal(applications(), 1);
});

test("declarative JSONata policies authorize and admit from trusted lifecycle facts", async () => {
  const host = createBlueprintProposalHost({
    store: createInMemoryBlueprintProposalStore(),
    authority: {
      inspect: (target) => ({ target, revision: "1" }),
      validate: () => ({ ok: true }),
      apply: () => ({ applied: true }),
    },
    policySet: {
      authorization: {
        id: "operator-only",
        version: "1",
        kind: "jsonata",
        phase: "authorization",
        expression: "actor.claims.role = 'operator'",
        denyReason: "Operator role is required",
      },
      admission: {
        id: "validated-small-proposal",
        version: "1",
        kind: "jsonata",
        phase: "admission",
        expression: "validation.ok = true and $count(proposal.actions) <= 2",
        denyReason: "Proposal is not admissible",
      },
      application: {
        id: "validated-application",
        version: "1",
        kind: "jsonata",
        phase: "application",
        expression: "false",
        denyReason: "Application is deferred",
      },
    },
  });
  const admitted = await host.submit(
    proposal(),
    { id: "agent-1", claims: { role: "operator" } },
  );
  assert.equal(admitted.status, "admitted");
  assert.deepEqual(admitted.authorization?.detail, {
    policyId: "operator-only",
    policyVersion: "1",
    policyKind: "jsonata",
  });

  const denied = await host.submit(
    proposal({ id: "proposal-2" }),
    { id: "agent-2", claims: { role: "viewer" } },
  );
  assert.equal(denied.status, "rejected");
  assert.equal(denied.failure, "Operator role is required");
});

test("declarative JSONata policies reject unsafe expressions during host construction", () => {
  assert.throws(() => createBlueprintProposalHost({
    store: createInMemoryBlueprintProposalStore(),
    authority: {
      inspect: (target) => ({ target, revision: "1" }),
      validate: () => ({ ok: true }),
      apply: () => ({ applied: true }),
    },
    policySet: {
      authorization: {
        id: "unsafe",
        version: "1",
        kind: "jsonata",
        phase: "authorization",
        expression: "$eval('true')",
        denyReason: "Denied",
      },
      admission: {
        id: "admit",
        version: "1",
        kind: "jsonata",
        phase: "admission",
        expression: "validation.ok",
        denyReason: "Denied",
      },
      application: {
        id: "defer",
        version: "1",
        kind: "jsonata",
        phase: "application",
        expression: "false",
        denyReason: "Deferred",
      },
    },
  }), /unsafe|invalid/i);
});