import type { AgentProposal } from "gik-agent-lifecycle-exp";
import type { DurableTransitionAdapter } from "gik-durable-runtime";
import { assertSameProposal } from "./store";
import type { BlueprintProposalReceipt, BlueprintProposalStore } from "./types";

export interface BlueprintProposalDurableState<TProposal extends AgentProposal = AgentProposal> {
  readonly receipts: Readonly<Record<string, BlueprintProposalReceipt<TProposal>>>;
}

export type BlueprintProposalDurableEvent<TProposal extends AgentProposal = AgentProposal> =
  | { readonly type: "proposal-receipt-create"; readonly receipt: BlueprintProposalReceipt<TProposal> }
  | { readonly type: "proposal-receipt-put"; readonly receipt: BlueprintProposalReceipt<TProposal> };

export interface BlueprintProposalDurableRuntime {
  initializeRuntime(request: BlueprintProposalDurableRefs): Promise<unknown>;
  appendJournal<T>(request: BlueprintProposalDurableRefs & { entry: T }): Promise<unknown>;
  runEngine(request: BlueprintProposalDurableRefs): Promise<{ status: string }>;
  readSnapshot<TState, TSpec>(request: Omit<BlueprintProposalDurableRefs, "journalRef">): Promise<{
    state: TState;
    spec: TSpec;
    revision: string;
  }>;
}

export interface BlueprintProposalDurableRefs {
  readonly stateRef: string;
  readonly journalRef: string;
  readonly effectsQueueRef: string;
  readonly effectsLane?: string;
}

export function createBlueprintProposalDurableTransitionAdapter<TProposal extends AgentProposal = AgentProposal>(): DurableTransitionAdapter<
  BlueprintProposalDurableState<TProposal>,
  Record<string, never>,
  BlueprintProposalDurableEvent<TProposal>,
  never,
  never
> {
  return {
    initialState: () => ({ receipts: {} }),
    initialSpec: () => ({}),
    transition: ({ state, events }) => ({
      state: events.reduce<BlueprintProposalDurableState<TProposal>>((current, event) => {
        const existing = Object.values(current.receipts).find(({ proposal }) => proposal.id === event.receipt.proposal.id);
        // Keep the first committed identity; the caller checks conflicts after
        // replay so a losing creation cannot poison the shared journal.
        if (event.type === "proposal-receipt-create" && (existing || current.receipts[event.receipt.id])) return current;
        if (existing && (existing.id !== event.receipt.id
          || JSON.stringify(existing.proposal) !== JSON.stringify(event.receipt.proposal))) return current;
        const receipt = current.receipts[event.receipt.id];
        if (receipt && JSON.stringify(receipt.proposal) !== JSON.stringify(event.receipt.proposal)) return current;
        return { receipts: { ...current.receipts, [event.receipt.id]: event.receipt } };
      }, state),
      effects: [],
    }),
    applySpecUpdates: ({ spec }) => spec,
  };
}

export async function createDurableBlueprintProposalStore<TProposal extends AgentProposal = AgentProposal>(options: {
  readonly runtime: BlueprintProposalDurableRuntime;
  readonly refs: BlueprintProposalDurableRefs;
}): Promise<BlueprintProposalStore<TProposal>> {
  await options.runtime.initializeRuntime(options.refs);
  const snapshot = () => options.runtime.readSnapshot<BlueprintProposalDurableState<TProposal>, Record<string, never>>(options.refs);
  const put = async (type: BlueprintProposalDurableEvent<TProposal>["type"], receipt: BlueprintProposalReceipt<TProposal>) => {
    await options.runtime.appendJournal({
      ...options.refs,
      entry: { type, receipt } satisfies BlueprintProposalDurableEvent<TProposal>,
    });
    const deadline = Date.now() + 30_000;
    for (;;) {
      const result = await options.runtime.runEngine(options.refs);
      if (result.status === "idle") break;
      if (!["committed", "busy", "conflict", "lease-lost"].includes(result.status)) {
        throw new Error(`Durable Blueprint proposal transition ended with '${result.status}'`);
      }
      if (Date.now() >= deadline) throw new Error("Timed out committing durable Blueprint proposal receipt");
      if (result.status !== "committed") await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const current = Object.values((await snapshot()).state.receipts)
      .find((entry) => entry.proposal.id === receipt.proposal.id);
    if (!current) throw new Error(`Blueprint proposal receipt id '${receipt.id}' is already in use`);
    assertSameProposal(current.proposal, receipt.proposal);
    return structuredClone(current);
  };
  return {
    async create(receipt) {
      return put("proposal-receipt-create", receipt);
    },
    async get(id) {
      const receipt = (await snapshot()).state.receipts[id];
      return receipt ? structuredClone(receipt) : undefined;
    },
    async update(receipt) {
      const current = (await snapshot()).state.receipts[receipt.id];
      if (!current) throw new Error(`Unknown Blueprint proposal receipt '${receipt.id}'`);
      assertSameProposal(current.proposal, receipt.proposal);
      return put("proposal-receipt-put", receipt);
    },
    async list() {
      return Object.values((await snapshot()).state.receipts).map((receipt) => structuredClone(receipt));
    },
  };
}