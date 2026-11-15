import { test, expect } from "vitest";
import { connectDurableProvider } from "../src/connectors/rpc";

test("RPC connector only forwards cancellation for reads and preserves transition receipts", async () => {
  const calls: { operation: string; args: unknown[]; signal?: AbortSignal }[] = [];
  const receipt = { ok: true, revision: "next" };
  const provider = connectDurableProvider(async (operation, args, signal) => {
    calls.push({ operation, args, signal });
    return receipt;
  });
  const signal = new AbortController().signal;
  const refs = { stateRef: "state", journalRef: "journal", effectsQueueRef: "effects", runtimeId: "sample", signal };
  await provider.readSnapshot(refs);
  expect(await provider.appendJournal({ ...refs, entry: { name: "save" } })).toBe(receipt);
  expect(calls.map(call => call.signal)).toEqual([signal, undefined]);
  expect(calls[0].args[0]).not.toHaveProperty("signal");
  expect(calls[1].args[0]).not.toHaveProperty("signal");
});
