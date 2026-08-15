// Time-travel sketch: checkpoint/restore of pure state + effect-journal compensation.
//
// The split under test:
//   - Kernel owns pure-STATE rollback (closed, total: state is JSON, restore = overwrite).
//   - Kernel journals the effects it fired and, on restore, hands the ones after the checkpoint
//     back as compensation *requests* (newest-first) — it never synthesizes the inverse itself.
//   - Host owns the inverse: orchestrator.compensate maps a fired `charge` to a real `refund`,
//     a no-op, or a refusal. An unhandled compensation is traced, never silently pretended-away.

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel } from "../src/index";
import type { Orchestrator, OrchestratorEffect, TraceEvent } from "../src/index";

const manifest = {
  version: "rollback-test/1",
  namespaces: ["card_data", "payments"],
  capabilities: {},
};

// A button that (a) marks the card charged in state and (b) fires a `charge` effect.
const doc = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "actions",
      id: "btn-charge",
      props: { label: "Charge" },
      edges: {
        on: {
          tap: [
            { do: "assign", target: "card_data.status", args: { value: "charged" } },
            { do: "invoke", control: { tool: "charge" }, data: { amount: 500 } },
          ],
        },
      },
    },
  },
};

// The forward orchestrator: charging writes a receipt into state.
const charging: Orchestrator = {
  async invoke(effect: OrchestratorEffect) {
    if (effect.kind !== "invoke" || effect.control.tool !== "charge") return;
    return { ops: [{ op: "set", path: "payments.receipt", value: "ch_1" }] };
  },
};

test("checkpoint captures an immutable snapshot; later dispatch does not mutate it", async () => {
  const k = new Kernel(manifest as any, doc as any, { orchestrator: charging });
  k.init();

  const cp = k.checkpoint();
  assert.equal(cp.rev, 0);

  await k.dispatch({ node: "btn-charge", name: "tap" });
  await k.whenIdle();

  // The live state advanced...
  assert.equal((k.state() as any).card_data.status, "charged");
  // ...but the checkpoint stayed frozen (deep-cloned, not a live reference).
  assert.deepEqual(cp.state.card_data, {});
});

test("restore rolls pure state to a checkpoint and touches nothing else (usable standalone)", async () => {
  const k = new Kernel(manifest as any, doc as any, { orchestrator: charging });
  k.init();
  const cp = k.checkpoint();

  const forward = await k.dispatch({ node: "btn-charge", name: "tap" });
  assert.equal(forward.rev, 1);
  assert.equal((k.state() as any).card_data.status, "charged");
  await k.whenIdle();
  assert.equal((k.state() as any).payments.receipt, "ch_1");

  const patch = await k.restore(cp);

  // Pure STATE is fully reverted — each namespace overwritten with its checkpoint value.
  assert.equal(patch.rev, 3, "invocation settlement and rollback each allocate a rev");
  assert.deepEqual((k.state() as any).card_data, {});
  assert.deepEqual((k.state() as any).payments, {});
});

test("effectsSince reports fired effects in causal order, tagged with rev + seq (no timestamp)", async () => {
  const k = new Kernel(manifest as any, doc as any, { orchestrator: charging });
  k.init();
  const cp = k.checkpoint();
  await k.dispatch({ node: "btn-charge", name: "tap" });
  await k.whenIdle();

  const since = k.effectsSince(cp.rev);
  assert.equal(since.length, 1);
  assert.equal(since[0].rev, 1);
  assert.equal(since[0].seq, 0);
  assert.equal(since[0].effect.kind === "invoke" && since[0].effect.control.tool, "charge");
  assert.equal(since[0].effect.data.amount, 500);
  // No wall-clock time is stamped: ordering is rev + seq only.
  assert.equal((since[0] as any).ts, undefined);
});

test("compensate routes effects in the order the host supplies; the host owns the inverse", async () => {
  const compensated: OrchestratorEffect[] = [];
  const orchestrator: Orchestrator = {
    ...charging,
    async compensate(effect) {
      compensated.push(effect);
      // The HOST knows the inverse of `charge` is a refund; the kernel never did.
      if (effect.kind === "invoke" && effect.control.tool === "charge") {
        return { ops: [{ op: "set", path: "payments.refunded", value: true }] };
      }
    },
  };

  const k = new Kernel(manifest as any, doc as any, { orchestrator });
  k.init();
  const cp = k.checkpoint();
  await k.dispatch({ node: "btn-charge", name: "tap" });
  await k.whenIdle();

  await k.restore(cp);
  // The host reverses the array itself for LIFO undo — the kernel does not pre-reverse.
  const toUndo = k.effectsSince(cp.rev).map((e) => e.effect).reverse();
  const patch = await k.compensate(toUndo);

  assert.deepEqual(compensated.map((e) => e.kind === "invoke" ? e.control.tool : undefined), ["charge"]);
  assert.equal((k.state() as any).payments.refunded, true);
  assert.equal(patch.rev, 4, "settlement, rollback, and compensation are distinct revs");
});

test("an unhandled compensation is traced, never silently pretended-away", async () => {
  const traces: TraceEvent[] = [];
  // Orchestrator can charge but has NO compensate handler — the effect is not reversible here.
  const k = new Kernel(manifest as any, doc as any, { orchestrator: charging, sink: (t) => traces.push(t) });
  k.init();
  const cp = k.checkpoint();
  await k.dispatch({ node: "btn-charge", name: "tap" });
  await k.whenIdle();

  await k.restore(cp);
  await k.compensate(k.effectsSince(cp.rev).map((e) => e.effect));

  const unhandled = traces.find((t) => (t.detail as any)?.compensate && (t.detail as any)?.unhandled);
  assert.ok(unhandled, "the un-reversed effect is surfaced in the trace");
});

test("a host with its own substrate ignores effects: restore alone round-trips state", async () => {
  const k = new Kernel(manifest as any, doc as any, { orchestrator: charging });
  k.init();
  const before = k.checkpoint();
  await k.dispatch({ node: "btn-charge", name: "tap" });
  await k.whenIdle();
  const after = k.checkpoint();

  // Ping-pong purely on state, never touching the effect journal (git-style rev usage).
  await k.restore(before);
  assert.deepEqual((k.state() as any).card_data, {});
  await k.restore(after);
  assert.equal((k.state() as any).card_data.status, "charged");
  await k.restore(before);
  assert.deepEqual((k.state() as any).card_data, {});
});
