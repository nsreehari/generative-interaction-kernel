import {
  BLUEPRINT_STATIC_AUTHOR_SCHEMAS,
  BLUEPRINT_USE_SCHEMAS,
  STATIC_AUTHORING_OPERATIONS,
  authorBlueprint,
  resolveLifecycleProfileOperations,
  useBlueprint,
  type AgentProposal,
  type AgentProposalDraft,
  type AgentTargetRef,
  type AgentToolExecutionContext,
  type BlueprintUseSource,
} from "@gik/agent-lifecycle-exp";
import { materializeBlueprint, validateBlueprintForAuthoring, type BlueprintArtifact } from "@gik/blueprint";
import {
  createBlueprintProposalHost,
  createInMemoryBlueprintProposalStore,
  type BlueprintProposalHost,
  type BlueprintProposalStore,
} from "@gik/blueprint-agent-host";
import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import type { Json, OrchestratorResult, PatchOp, StateModel } from "@gik/kernel";
import {
  getSampleBlueprintCatalog,
  installUserBlueprints,
  readUserBlueprintArtifacts,
  writeUserBlueprintArtifacts,
} from "../../../../catalog/blueprint-catalog";

type UseAction = { kind: string; payload: Json };
type UseProposalDraft = AgentProposalDraft<UseAction>;
type AuthorAction = { kind: "publish-blueprint"; artifact: BlueprintArtifact };
type AuthorProposalDraft = AgentProposalDraft<AuthorAction>;
type AuthorProposal = AgentProposal<AuthorAction>;

export type UseProposal = AgentProposal<UseAction>;

/** `@gik/agent-lifecycle-exp` deliberately describes a Blueprint via its own independent,
 * structurally-typed `BlueprintUseSource` shape rather than importing `@gik/blueprint`'s canonical
 * type -- `agentLifecycle` is an optional extension that Blueprint's own schema does not (and need
 * not) declare. This is a type-only view, not a runtime transform. */
function lifecycleSource(runtime: BlueprintRuntime): BlueprintUseSource {
  return runtime.definition as unknown as BlueprintUseSource;
}

function targetMatches(runtime: BlueprintRuntime, candidate: AgentTargetRef | undefined): boolean {
  return candidate?.id === runtime.blueprintId && candidate?.instanceId === runtime.instanceId;
}

function proposalScope(context: AgentToolExecutionContext | undefined): string {
  return context?.requestId ?? "direct";
}

export interface BlueprintAgentLifecycleOptions {
  proposalStore?: BlueprintProposalStore<UseProposal>;
  authorProposalStore?: BlueprintProposalStore<AuthorProposal>;
}

function createStaticBlueprintAuthorTools(
  runtime: BlueprintRuntime,
  store: BlueprintProposalStore<AuthorProposal>,
) {
  const authored = lifecycleSource(runtime).payload.agentLifecycle?.profiles?.author;
  if (!authored) throw new Error("Blueprint does not declare an author lifecycle profile");
  const target: AgentTargetRef = {
    kind: "blueprint-authoring-workspace",
    id: runtime.blueprintId,
    instanceId: runtime.instanceId,
  };
  const drafts = new Map<string, AuthorProposalDraft>();
  const validate = (draft: AuthorProposalDraft) => {
    const action = draft?.actions?.[0];
    if (draft?.actions?.length !== 1 || action?.kind !== "publish-blueprint") {
      return {
        ...validateBlueprintForAuthoring(undefined),
        errors: ["Static authoring requires exactly one publish-blueprint action"],
      };
    }
    return validateBlueprintForAuthoring(action.artifact);
  };
  const proposalHost = createBlueprintProposalHost<AuthorProposal>({
    store,
    authority: {
      inspect: () => ({ target, revision: runtime.revision }),
      validate: (proposal) => {
        const report = validate({ actions: proposal.actions, rationale: proposal.rationale });
        return { ok: report.valid, reason: report.errors.join("; ") || undefined, detail: report };
      },
      apply: async (receipt) => {
        const report = validate({ actions: receipt.proposal.actions, rationale: receipt.proposal.rationale });
        if (!report.valid || !report.artifact) {
          throw new Error(`Invalid Blueprint candidate: ${report.errors.join("; ")}`);
        }
        const id = report.artifact.payload.id;
        if (getSampleBlueprintCatalog().seedEntries[id]) {
          throw new Error(`Repository Blueprint '${id}' is read-only`);
        }
        const stored = await readUserBlueprintArtifacts();
        stored.blueprints[id] = report.artifact;
        await writeUserBlueprintArtifacts(stored.blueprints);
        installUserBlueprints(stored.blueprints);
        return { receiptId: receipt.id, blueprintId: id };
      },
    },
    policySet: {
      authorization: {
        id: "static-blueprint-author",
        version: "1.0.0",
        kind: "jsonata",
        phase: "authorization",
        expression: "actor.id = 'ai-agent'",
        denyReason: "Actor is not authorized to author Blueprints",
      },
      admission: {
        id: "valid-static-blueprint",
        version: "1.0.0",
        kind: "jsonata",
        phase: "admission",
        expression: "validation.ok = true",
        denyReason: "Blueprint authoring validation failed",
      },
      application: {
        id: "deferred-static-blueprint-settlement",
        version: "1.0.0",
        kind: "jsonata",
        phase: "application",
        expression: "false",
        denyReason: "Static Blueprint settlement occurs after agent completion",
      },
    },
  });
  const tools = authorBlueprint({
    blueprint: lifecycleSource(runtime),
    schemas: BLUEPRINT_STATIC_AUTHOR_SCHEMAS,
    host: {
      validate,
      simulate: (draft: AuthorProposalDraft) => {
        const report = validate(draft);
        if (!report.valid || !report.artifact) return report;
        try {
          const materialized = materializeBlueprint({ blueprint: report.artifact });
          return {
            ...report,
            initialState: materialized.payload.initialState,
            presentation: materialized.payload.terminalBlueprint.payload.presentation ?? null,
          };
        } catch (error) {
          return { ...report, valid: false, errors: [error instanceof Error ? error.message : String(error)] };
        }
      },
      read_in_progress_proposal: (_input: unknown, context?: AgentToolExecutionContext) =>
        drafts.get(proposalScope(context)),
      set_in_progress_proposal: (draft: AuthorProposalDraft, context?: AgentToolExecutionContext) => {
        const report = validate(draft);
        if (!report.valid || !report.artifact) {
          throw new Error(`Invalid Blueprint candidate: ${report.errors.join("; ")}`);
        }
        const normalized: AuthorProposalDraft = {
          actions: [{ kind: "publish-blueprint", artifact: report.artifact }],
          rationale: draft.rationale ?? null,
        };
        drafts.set(proposalScope(context), normalized);
        return normalized;
      },
    },
  });
  return {
    tools,
    hasDraft: (scope: string) => drafts.has(scope),
    finalize: async (scope: string) => {
      const draft = drafts.get(scope);
      if (!draft) throw new Error(`No in-progress Blueprint author proposal for request '${scope}'`);
      const receipt = await proposalHost.submit({
        id: crypto.randomUUID(),
        capability: authored.id,
        target,
        actions: draft.actions,
        createdAt: new Date().toISOString(),
        rationale: draft.rationale ?? undefined,
      }, { id: "ai-agent" });
      const applied = await proposalHost.apply(receipt);
      if (applied.status !== "applied") throw new Error(applied.failure ?? "Blueprint author proposal application failed");
      drafts.delete(scope);
      return applied;
    },
  };
}

function createBlueprintAuthorTools(runtime: BlueprintRuntime, store: BlueprintProposalStore<AuthorProposal>) {
  const authored = lifecycleSource(runtime).payload.agentLifecycle?.profiles?.author;
  if (!authored) return undefined;
  const operations = resolveLifecycleProfileOperations(authored);
  if (operations.length !== STATIC_AUTHORING_OPERATIONS.length
    || STATIC_AUTHORING_OPERATIONS.some((operation) => !operations.includes(operation))) {
    throw new Error("Blueprint author profiles must select the static authoring operation set");
  }
  return createStaticBlueprintAuthorTools(runtime, store);
}

export function createBlueprintAgentLifecycle(
  runtime: BlueprintRuntime,
  state: StateModel,
  options: BlueprintAgentLifecycleOptions = {},
) {
  const authored = lifecycleSource(runtime).payload.agentLifecycle?.profiles?.use;
  const authorStore = options.authorProposalStore ?? createInMemoryBlueprintProposalStore<AuthorProposal>();
  const authorLifecycle = createBlueprintAuthorTools(runtime, authorStore);
  const authorTools = authorLifecycle?.tools ?? [];
  if (!authored) return {
    tools: authorTools,
    settle: authorLifecycle
      ? async (input: { proposalScopeId: string }) => {
          const applied = await authorLifecycle.finalize(input.proposalScopeId);
          return { outcome: "applied", detail: { proposalReceiptId: applied.id } } as OrchestratorResult;
        }
      : undefined,
  };
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
        expression: "actor.id = 'ai-agent'",
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
  const drafts = new Map<string, UseProposalDraft>();
  const validate = (draft: UseProposalDraft) => {
    const errors: string[] = [];
    if (!Array.isArray(draft?.actions) || draft.actions.length === 0) errors.push("Proposal actions must not be empty");
    for (const action of draft?.actions ?? []) {
      if (!authored.intentKinds.includes(action.kind)) errors.push(`Intent kind '${action.kind}' is not declared`);
    }
    return { ok: errors.length === 0, errors };
  };
  const tools = useBlueprint({
    blueprint: lifecycleSource(runtime),
    schemas: BLUEPRINT_USE_SCHEMAS,
    host: {
      discover: () => ({ targets: [target] }),
      inspect: (candidate: AgentTargetRef) => {
        if (!targetMatches(runtime, candidate)) throw new Error("Target does not match the active Blueprint instance");
        return { target, revision: runtime.revision, state: state.snapshot() };
      },
      validate,
      simulate: (draft: UseProposalDraft) => ({ ...validate(draft), applied: false, changes: [] }),
      preflight: (draft: UseProposalDraft) => ({ ...validate(draft), revision: runtime.revision, ready: validate(draft).ok }),
      read_in_progress_proposal: (_input: unknown, context?: AgentToolExecutionContext) =>
        drafts.get(proposalScope(context)),
      set_in_progress_proposal: (draft: UseProposalDraft, context?: AgentToolExecutionContext) => {
        const report = validate(draft);
        if (!report.ok) throw new Error(`Invalid Blueprint use intent: ${report.errors.join("; ")}`);
        drafts.set(proposalScope(context), draft);
        return draft;
      },
    },
  });
  return {
    tools: [...tools, ...authorTools],
    settle: async (input: { proposalScopeId: string; settlement: OrchestratorResult }) => {
      const hasUseDraft = drafts.has(input.proposalScopeId);
      const hasAuthorDraft = authorLifecycle?.hasDraft(input.proposalScopeId) === true;
      if (hasUseDraft && hasAuthorDraft) throw new Error("A request cannot finalize both use and author proposals");
      if (hasUseDraft) {
        const draft = drafts.get(input.proposalScopeId)!;
        const receipt = await proposalHost.submit({
          id: crypto.randomUUID(),
          capability: authored.id,
          target,
          actions: draft.actions,
          createdAt: new Date().toISOString(),
          rationale: draft.rationale ?? undefined,
        }, { id: "ai-agent" });
        const applied = await proposalHost.apply(receipt, { settlement: input.settlement });
        if (applied.status !== "applied") throw new Error(applied.failure ?? "Blueprint proposal application failed");
        drafts.delete(input.proposalScopeId);
        return { outcome: "applied", detail: { proposalReceiptId: applied.id } } as OrchestratorResult;
      }
      if (hasAuthorDraft) {
        const applied = await authorLifecycle!.finalize(input.proposalScopeId);
        return { outcome: "applied", detail: { proposalReceiptId: applied.id } } as OrchestratorResult;
      }
      throw new Error(`No in-progress Blueprint proposal for request '${input.proposalScopeId}'`);
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