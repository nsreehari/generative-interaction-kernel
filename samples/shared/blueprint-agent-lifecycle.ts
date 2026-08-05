import { BLUEPRINT_USE_SCHEMAS, useBlueprint, type AgentProposal, type AgentTargetRef } from "@gik/agent-lifecycle-exp";
import {
  createBlueprintProposalHost,
  createInMemoryBlueprintProposalStore,
  type BlueprintProposalHost,
  type BlueprintProposalReceipt,
  type BlueprintProposalStore,
} from "@gik/blueprint-agent-host";
import type { Json, OrchestratorResult, PatchOp, StateModel } from "../../kernel/src/index";
import type { BlueprintRuntime } from "../../face/src/live/controlface";

type UseIntent = {
  kind: string;
  target: AgentTargetRef;
  payloadJson: string;
  rationale: string | null;
};

export type UseProposal = AgentProposal<{ kind: string; payload: Json }>;

function targetMatches(runtime: BlueprintRuntime, candidate: AgentTargetRef | undefined): boolean {
  return candidate?.id === runtime.blueprintId && candidate?.instanceId === runtime.instanceId;
}

export interface BlueprintAgentLifecycleOptions {
  proposalStore?: BlueprintProposalStore<UseProposal>;
}

export function createBlueprintAgentLifecycle(
  runtime: BlueprintRuntime,
  state: StateModel,
  options: BlueprintAgentLifecycleOptions = {},
) {
  const authored = runtime.definition.payload.agentLifecycle?.profiles?.use;
  if (!authored) return { tools: [], settle: undefined };
  const store = options.proposalStore ?? createInMemoryBlueprintProposalStore<UseProposal>();
  const proposalHost: BlueprintProposalHost<UseProposal> = createBlueprintProposalHost({
    store,
    authority: {
      inspect: (candidate) => {
        if (!targetMatches(runtime, candidate)) throw new Error("Target does not match the active Blueprint instance");
        return { target: candidate, revision: runtime.revision, value: state.snapshot() };
      },
      validate: (proposal) => {
        const errors = proposal.actions
          .filter((action) => !authored.intentKinds.includes(action.kind))
          .map((action) => `Intent kind '${action.kind}' is not declared`);
        return { ok: errors.length === 0, reason: errors.join("; ") || undefined };
      },
      apply: (_receipt, context) => {
        const application = context as { settlement?: OrchestratorResult };
        const settlement = application?.settlement;
        if (!settlement) throw new Error("Validated Blueprint settlement is required");
        if (settlement.events?.length) throw new Error("HBX sample authority does not support settlement events");
        state.apply((settlement.ops ?? []) as PatchOp[]);
        return { applied: true, operationCount: settlement.ops?.length ?? 0 };
      },
    },
    policySet: {
      authorization: {
        id: "sample-blueprint-agent",
        version: "1.0.0",
        kind: "jsonata",
        phase: "authorization",
        expression: "actor.id = 'foundry-agent'",
        denyReason: "Actor is not authorized for this Blueprint",
      },
      admission: {
        id: "sample-valid-blueprint-proposal",
        version: "1.0.0",
        kind: "jsonata",
        phase: "admission",
        expression: "validation.ok = true",
        denyReason: "Blueprint proposal validation failed",
      },
      application: {
        id: "sample-validated-settlement",
        version: "1.0.0",
        kind: "jsonata",
        phase: "application",
        expression: "false",
        denyReason: "Validated settlement is required before application",
      },
    },
  });
  const target: AgentTargetRef = {
    kind: "blueprint-instance",
    id: runtime.blueprintId,
    instanceId: runtime.instanceId,
    expectedRevision: runtime.revision,
  };
  const targetErrors = (candidate: AgentTargetRef | undefined) =>
    targetMatches(runtime, candidate)
      ? []
      : ["Target does not match the active Blueprint instance"];
  const validate = (intent: UseIntent) => {
    const errors: string[] = [];
    if (!authored.intentKinds.includes(intent?.kind)) errors.push(`Intent kind '${intent?.kind}' is not declared`);
    errors.push(...targetErrors(intent?.target));
    try {
      if (typeof intent?.payloadJson !== "string") throw new Error("missing payloadJson");
      JSON.parse(intent.payloadJson);
    } catch {
      errors.push("Intent payloadJson is not valid JSON");
    }
    return { ok: errors.length === 0, errors };
  };
  const tools = useBlueprint({
    blueprint: runtime.definition,
    schemas: BLUEPRINT_USE_SCHEMAS,
    host: {
      discover: () => ({ targets: [target] }),
      inspect: (candidate: AgentTargetRef) => {
        const errors = targetErrors(candidate);
        if (errors.length > 0) throw new Error(errors[0]);
        return { target, revision: runtime.revision, state: state.snapshot() };
      },
      validate,
      simulate: (intent: UseIntent) => ({ ...validate(intent), applied: false, changes: [] }),
      preflight: (intent: UseIntent) => ({ ...validate(intent), revision: runtime.revision, ready: validate(intent).ok }),
      propose: async (intent: UseIntent): Promise<BlueprintProposalReceipt<UseProposal>> => {
        const report = validate(intent);
        if (!report.ok) throw new Error(`Invalid Blueprint use intent: ${report.errors.join("; ")}`);
        const proposal: UseProposal = {
          id: crypto.randomUUID(),
          capability: authored.id,
          target,
          actions: [{ kind: intent.kind, payload: JSON.parse(intent.payloadJson) as Json }],
          createdAt: new Date().toISOString(),
          rationale: intent.rationale ?? undefined,
        };
        return proposalHost.submit(proposal, { id: "foundry-agent" });
      },
    },
  });
  return {
    tools,
    settle: async (input: { receiptId: string; settlement: OrchestratorResult }) => {
      const receipt = await store.get(input.receiptId);
      if (!receipt) throw new Error(`Unknown Blueprint proposal receipt '${input.receiptId}'`);
      const applied = await proposalHost.apply(receipt, { settlement: input.settlement });
      if (applied.status !== "applied") throw new Error(applied.failure ?? "Blueprint proposal application failed");
      return { outcome: "applied", detail: { proposalReceiptId: applied.id } } as OrchestratorResult;
    },
  };
}

export function createBlueprintUseTools(
  runtime: BlueprintRuntime,
  state: StateModel,
  options: BlueprintAgentLifecycleOptions = {},
) {
  return createBlueprintAgentLifecycle(runtime, state, options).tools;
}