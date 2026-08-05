import type { AgentProposal } from "@gik/agent-lifecycle-exp";
import type { DurableTransitionAdapter } from "@gik/durable-runtime";
import type { BlueprintProposalReceipt, BlueprintProposalStore } from "./types";

export interface BlueprintProposalDurableState<TProposal extends AgentProposal = AgentProposal> {
  readonly receipts: Readonly<Record<string, BlueprintProposalReceipt<TProposal>>>;
}

export type BlueprintProposalDurableEvent<TProposal extends AgentProposal = AgentProposal> =
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
      state: events.reduce<BlueprintProposalDurableState<TProposal>>((current, event) => ({
        receipts: { ...current.receipts, [event.receipt.id]: event.receipt },
      }), state),
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
  const put = async (receipt: BlueprintProposalReceipt<TProposal>) => {
    await options.runtime.appendJournal({
      ...options.refs,
      entry: { type: "proposal-receipt-put", receipt } satisfies BlueprintProposalDurableEvent<TProposal>,
    });
    const result = await options.runtime.runEngine(options.refs);
    if (result.status !== "committed" && result.status !== "idle") {
      throw new Error(`Durable Blueprint proposal transition ended with '${result.status}'`);
    }
    return structuredClone(receipt);
  };
  return {
    async create(receipt) {
      const current = (await snapshot()).state.receipts[receipt.id];
      return current ? structuredClone(current) : put(receipt);
    },
    async get(id) {
      const receipt = (await snapshot()).state.receipts[id];
      return receipt ? structuredClone(receipt) : undefined;
    },
    update: put,
    async list() {
      return Object.values((await snapshot()).state.receipts).map((receipt) => structuredClone(receipt));
    },
  };
}