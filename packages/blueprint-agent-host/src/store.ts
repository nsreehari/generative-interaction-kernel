import type { AgentProposal } from "gik-agent-lifecycle-exp";
import type { BlueprintProposalReceipt, BlueprintProposalStore } from "./types";

export function assertSameProposal(expected: AgentProposal, actual: AgentProposal): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Blueprint proposal id '${expected.id}' is already associated with different content`);
  }
}

export function createInMemoryBlueprintProposalStore<TProposal extends AgentProposal = AgentProposal>(): BlueprintProposalStore<TProposal> {
  const receipts = new Map<string, BlueprintProposalReceipt<TProposal>>();
  const proposalIds = new Map<string, string>();
  const clone = (value: BlueprintProposalReceipt<TProposal>) => structuredClone(value);
  return {
    create(receipt) {
      const currentId = proposalIds.get(receipt.proposal.id);
      const current = currentId === undefined ? undefined : receipts.get(currentId);
      if (current) {
        assertSameProposal(current.proposal, receipt.proposal);
        return clone(current);
      }
      if (receipts.has(receipt.id)) throw new Error(`Blueprint proposal receipt id '${receipt.id}' is already in use`);
      receipts.set(receipt.id, clone(receipt));
      proposalIds.set(receipt.proposal.id, receipt.id);
      return clone(receipt);
    },
    get(id) {
      const receipt = receipts.get(id);
      return receipt ? clone(receipt) : undefined;
    },
    update(receipt) {
      const current = receipts.get(receipt.id);
      if (!current) throw new Error(`Unknown Blueprint proposal receipt '${receipt.id}'`);
      assertSameProposal(current.proposal, receipt.proposal);
      receipts.set(receipt.id, clone(receipt));
      return clone(receipt);
    },
    list() {
      return [...receipts.values()].map(clone);
    },
  };
}