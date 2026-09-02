import type { AgentHostLifecycleOps, AgentProposal } from "gik-agent-lifecycle-exp";
import {
  evaluateBlueprintJsonataApplicationPolicy,
  evaluateBlueprintJsonataPolicy,
  validateBlueprintJsonataPolicySet,
  type BlueprintJsonataPolicySet,
} from "./policy";
import type {
  BlueprintAuthority,
  BlueprintHostDecision,
  BlueprintProposalActor,
  BlueprintProposalReceipt,
  BlueprintProposalStatus,
  BlueprintProposalStore,
} from "./types";

export interface BlueprintProposalHostOptions<TProposal extends AgentProposal = AgentProposal> {
  readonly store: BlueprintProposalStore<TProposal>;
  readonly authority: BlueprintAuthority<TProposal>;
  readonly policySet: BlueprintJsonataPolicySet;
}

export interface BlueprintProposalHost<TProposal extends AgentProposal = AgentProposal>
  extends AgentHostLifecycleOps<TProposal, BlueprintProposalReceipt<TProposal>> {
  receive(proposal: TProposal): Promise<BlueprintProposalReceipt<TProposal>>;
  authorize(receipt: BlueprintProposalReceipt<TProposal>): Promise<BlueprintProposalReceipt<TProposal>>;
  admit(receipt: BlueprintProposalReceipt<TProposal>): Promise<BlueprintProposalReceipt<TProposal>>;
  apply(receipt: BlueprintProposalReceipt<TProposal>, context?: unknown): Promise<BlueprintProposalReceipt<TProposal>>;
  reject(receipt: BlueprintProposalReceipt<TProposal>): Promise<BlueprintProposalReceipt<TProposal>>;
  status(receipt: BlueprintProposalReceipt<TProposal>): Promise<BlueprintProposalReceipt<TProposal>>;
  submit(proposal: TProposal, actor: BlueprintProposalActor): Promise<BlueprintProposalReceipt<TProposal>>;
}

const terminal = new Set<BlueprintProposalStatus>(["applied", "rejected", "failed"]);

export function createBlueprintProposalHost<TProposal extends AgentProposal = AgentProposal>(
  options: BlueprintProposalHostOptions<TProposal>,
): BlueprintProposalHost<TProposal> {
  const now = () => new Date().toISOString();
  const policySet = validateBlueprintJsonataPolicySet(options.policySet);
  const transition = async (
    receipt: BlueprintProposalReceipt<TProposal>,
    status: BlueprintProposalStatus,
    fields: Partial<BlueprintProposalReceipt<TProposal>> = {},
    detail?: string,
  ) => options.store.update({
    ...receipt,
    ...fields,
    status,
    updatedAt: now(),
    audit: [...receipt.audit, { status, at: now(), ...(detail ? { detail } : {}) }],
  });
  const decision = (value: unknown): BlueprintHostDecision => value as BlueprintHostDecision;
  const requireReceipt = async (input: BlueprintProposalReceipt<TProposal>) => {
    const current = await options.store.get(input.id);
    if (!current) throw new Error(`Unknown Blueprint proposal receipt '${input.id}'`);
    return current;
  };
  const rejectWith = async (receipt: BlueprintProposalReceipt<TProposal>, result: BlueprintHostDecision) =>
    transition(receipt, "rejected", { failure: result.reason }, result.reason);

  const host: BlueprintProposalHost<TProposal> = {
    manifest: () => ({
      id: "host-blueprint",
      version: "1.0.0",
      description: "Authorize, admit, apply, reject, and inspect Blueprint agent proposals.",
      operations: Object.fromEntries(["receive", "authorize", "admit", "apply", "reject", "status"].map((name) => [name, {
        description: `${name} a Blueprint agent proposal.`,
        inputSchema: { type: "object" },
      }])) as never,
    }),
    async receive(proposal) {
      const existing = await options.store.list();
      const duplicate = existing.find((receipt) => receipt.proposal.id === proposal.id);
      if (duplicate) {
        if (JSON.stringify(duplicate.proposal) !== JSON.stringify(proposal)) {
          throw new Error(`Blueprint proposal id '${proposal.id}' is already associated with different content`);
        }
        return duplicate;
      }
      const at = now();
      return options.store.create({
        id: crypto.randomUUID(),
        proposal,
        actor: { id: "unknown" },
        status: "received",
        createdAt: at,
        updatedAt: at,
        audit: [{ status: "received", at }],
      });
    },
    async authorize(input) {
      const receipt = await requireReceipt(input);
      if (receipt.status !== "received") return receipt;
      const snapshot = await options.authority.inspect(receipt.proposal.target);
      const result = decision(evaluateBlueprintJsonataPolicy(policySet.authorization, {
        proposal: receipt.proposal,
        actor: receipt.actor,
        snapshot,
      }));
      return result.ok
        ? transition(receipt, "authorized", { authorization: result })
        : rejectWith(receipt, result);
    },
    async admit(input) {
      const receipt = await requireReceipt(input);
      if (receipt.status !== "authorized") return receipt;
      const snapshot = await options.authority.inspect(receipt.proposal.target);
      const expected = receipt.proposal.target.expectedRevision;
      if (expected !== undefined && String(expected) !== String(snapshot.revision)) {
        return rejectWith(receipt, { ok: false, reason: `Expected revision '${expected}' but found '${snapshot.revision}'` });
      }
      const validation = decision(await options.authority.validate(receipt.proposal, snapshot));
      if (!validation.ok) return rejectWith(receipt, validation);
      const result = decision(evaluateBlueprintJsonataPolicy(policySet.admission, {
        proposal: receipt.proposal,
        actor: receipt.actor,
        snapshot,
        validation,
      }));
      if (!result.ok) return rejectWith(receipt, result);
      const applicationPolicy = evaluateBlueprintJsonataApplicationPolicy(policySet.application, {
        proposal: receipt.proposal,
        actor: receipt.actor,
        snapshot,
        validation,
      });
      return transition(receipt, "admitted", { admission: result, applicationPolicy });
    },
    async apply(input, context) {
      let receipt = await requireReceipt(input);
      if (receipt.status === "applied" || receipt.status === "rejected") return receipt;
      if (receipt.status !== "admitted" && receipt.status !== "applying") {
        throw new Error(`Blueprint proposal receipt '${receipt.id}' cannot apply from '${receipt.status}'`);
      }
      if (receipt.status === "admitted") receipt = await transition(receipt, "applying");
      try {
        const application = await options.authority.apply(receipt, context);
        return transition(receipt, "applied", { application });
      } catch (error) {
        return transition(receipt, "failed", { failure: error instanceof Error ? error.message : String(error) });
      }
    },
    async reject(input) {
      const receipt = await requireReceipt(input);
      if (terminal.has(receipt.status)) return receipt;
      return transition(receipt, "rejected", { failure: "Rejected by host" }, "Rejected by host");
    },
    async status(input) {
      return requireReceipt(input);
    },
    async submit(proposal, actor) {
      let receipt = await host.receive(proposal);
      if (receipt.actor.id === "unknown") {
        receipt = await options.store.update({ ...receipt, actor });
      }
      receipt = await host.authorize(receipt);
      if (receipt.status !== "authorized") return receipt;
      receipt = await host.admit(receipt);
      if (receipt.status !== "admitted" || receipt.applicationPolicy?.automatic !== true) return receipt;
      return host.apply(receipt);
    },
  };
  return host;
}