import type { AgentProposal } from "gik-agent-lifecycle-exp";
import type { BlueprintProposalReceipt, BlueprintProposalStore } from "./types";

export function createInMemoryBlueprintProposalStore<TProposal extends AgentProposal = AgentProposal>(): BlueprintProposalStore<TProposal> {
  const receipts = new Map<string, BlueprintProposalReceipt<TProposal>>();
  const clone = (value: BlueprintProposalReceipt<TProposal>) => structuredClone(value);
  return {
    create(receipt) {
      const current = receipts.get(receipt.id);
      if (current) return clone(current);
      receipts.set(receipt.id, clone(receipt));
      return clone(receipt);
    },
    get(id) {
      const receipt = receipts.get(id);
      return receipt ? clone(receipt) : undefined;
    },
    update(receipt) {
      if (!receipts.has(receipt.id)) throw new Error(`Unknown Blueprint proposal receipt '${receipt.id}'`);
      receipts.set(receipt.id, clone(receipt));
      return clone(receipt);
    },
    list() {
      return [...receipts.values()].map(clone);
    },
  };
}