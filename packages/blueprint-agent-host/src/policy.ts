import type { AgentProposal } from "gik-agent-lifecycle-exp";
import { evalSyncJsonata, validateJsonataExpression } from "gik-evaluators";
import type {
  BlueprintApplicationPolicyDecision,
  BlueprintHostDecision,
  BlueprintProposalActor,
  BlueprintTargetSnapshot,
} from "./types";

export type BlueprintJsonataPolicyPhase = "authorization" | "admission" | "application";

export interface BlueprintJsonataPolicyArtifact {
  readonly id: string;
  readonly version: string;
  readonly kind: "jsonata";
  readonly phase: BlueprintJsonataPolicyPhase;
  readonly expression: string;
  readonly denyReason: string;
}

export interface BlueprintJsonataPolicySet {
  readonly authorization: BlueprintJsonataPolicyArtifact;
  readonly admission: BlueprintJsonataPolicyArtifact;
  readonly application: BlueprintJsonataPolicyArtifact;
}

export interface BlueprintJsonataPolicyInput<TProposal extends AgentProposal = AgentProposal> {
  readonly proposal: TProposal;
  readonly actor: BlueprintProposalActor;
  readonly snapshot: BlueprintTargetSnapshot;
  readonly validation?: BlueprintHostDecision;
}

function validateArtifact(artifact: BlueprintJsonataPolicyArtifact, phase: BlueprintJsonataPolicyPhase): void {
  if (!artifact.id.trim()) throw new Error(`${phase} policy id is required`);
  if (!artifact.version.trim()) throw new Error(`${phase} policy version is required`);
  if (artifact.phase !== phase) {
    throw new Error(`Policy '${artifact.id}' has phase '${artifact.phase}', expected '${phase}'`);
  }
  const validation = validateJsonataExpression(artifact.expression, { mode: "safe" });
  if (!validation.ok) throw new Error(`Policy '${artifact.id}' is invalid: ${validation.error}`);
}

function decisionFromResult(artifact: BlueprintJsonataPolicyArtifact, result: unknown): BlueprintHostDecision {
  const provenance = { policyId: artifact.id, policyVersion: artifact.version, policyKind: artifact.kind };
  if (typeof result === "boolean") {
    return result
      ? { ok: true, detail: provenance }
      : { ok: false, reason: artifact.denyReason, detail: provenance };
  }
  if (result && typeof result === "object" && typeof (result as { ok?: unknown }).ok === "boolean") {
    const value = result as { ok: boolean; reason?: unknown; detail?: unknown };
    return {
      ok: value.ok,
      ...(!value.ok ? { reason: typeof value.reason === "string" ? value.reason : artifact.denyReason } : {}),
      detail: { ...provenance, result: value.detail ?? null },
    };
  }
  return {
    ok: false,
    reason: `Policy '${artifact.id}' returned an indeterminate decision`,
    detail: provenance,
  };
}

export function evaluateBlueprintJsonataPolicy<TProposal extends AgentProposal>(
  artifact: BlueprintJsonataPolicyArtifact,
  input: BlueprintJsonataPolicyInput<TProposal>,
): BlueprintHostDecision {
  try {
    const result = evalSyncJsonata(artifact.expression, input as never);
    return decisionFromResult(artifact, result);
  } catch (error) {
    return {
      ok: false,
      reason: `Policy '${artifact.id}' evaluation failed`,
      detail: {
        policyId: artifact.id,
        policyVersion: artifact.version,
        policyKind: artifact.kind,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function evaluateBlueprintJsonataApplicationPolicy<TProposal extends AgentProposal>(
  artifact: BlueprintJsonataPolicyArtifact,
  input: BlueprintJsonataPolicyInput<TProposal>,
): BlueprintApplicationPolicyDecision {
  const provenance = { policyId: artifact.id, policyVersion: artifact.version, policyKind: artifact.kind };
  try {
    const result = evalSyncJsonata(artifact.expression, input as never);
    if (typeof result === "boolean") {
      return {
        automatic: result,
        ...(!result ? { reason: artifact.denyReason } : {}),
        detail: provenance,
      };
    }
    if (result && typeof result === "object" && typeof (result as { automatic?: unknown }).automatic === "boolean") {
      const value = result as { automatic: boolean; reason?: unknown; detail?: unknown };
      return {
        automatic: value.automatic,
        ...(!value.automatic ? { reason: typeof value.reason === "string" ? value.reason : artifact.denyReason } : {}),
        detail: { ...provenance, result: value.detail ?? null },
      };
    }
    return {
      automatic: false,
      reason: `Policy '${artifact.id}' returned an indeterminate application disposition`,
      detail: provenance,
    };
  } catch (error) {
    return {
      automatic: false,
      reason: `Policy '${artifact.id}' evaluation failed`,
      detail: {
        ...provenance,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function validateBlueprintJsonataPolicySet(
  artifacts: BlueprintJsonataPolicySet,
): BlueprintJsonataPolicySet {
  validateArtifact(artifacts.authorization, "authorization");
  validateArtifact(artifacts.admission, "admission");
  validateArtifact(artifacts.application, "application");
  return artifacts;
}