import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import type { Json, OrchestratorResult, PatchOp } from "@gik/kernel";

import { createFoundryProxy } from "../../../shared/foundry-proxy";
import manifest from "../manifest.json";
import initialState from "../state.json";
import { getSocFoundryKey } from "../live-credentials";
import {
  buildAgentMessage,
  createSocAgentContract,
  type AgentValidationIssue,
  type CorrelationReply,
  type ResponseReply,
  type SocAgentOperation,
  type SocAgentReply,
} from "../live-agent";

type RecordValue = Record<string, Json>;
const resetState = JSON.parse(JSON.stringify(initialState.soc)) as RecordValue;

function list(ctx: EffectContext, path: string): Json[] {
  const value = ctx.get(path);
  return Array.isArray(value) ? value : [];
}

function actor(ctx: EffectContext, fallback: string): string {
  return ctx.actorId ?? fallback;
}

function entry(
  id: string,
  time: string,
  actorId: string,
  result: string,
  summary: string,
  affected: string[]
): RecordValue {
  return { id, time, actorId, result, summary, affected };
}

function appendJournal(ctx: EffectContext, next: RecordValue): Json[] {
  return [...list(ctx, "soc.journal"), next];
}

function updateActor(
  ctx: EffectContext,
  actorId: string,
  status: string,
  activity: string
): Json[] {
  return list(ctx, "soc.actors").map((value) => {
    const current = value as RecordValue;
    return current.id === actorId ? { ...current, status, activity } : current;
  });
}

function updateActors(
  ctx: EffectContext,
  updates: Record<string, { status: string; activity: string }>
): Json[] {
  return list(ctx, "soc.actors").map((value) => {
    const current = value as RecordValue;
    const update = updates[String(current.id)];
    return update ? { ...current, ...update } : current;
  });
}

function roleFor(ctx: EffectContext, actorId: string): string | undefined {
  const found = list(ctx, "soc.actors").find(
    (value) => (value as RecordValue).id === actorId
  ) as RecordValue | undefined;
  return typeof found?.role === "string" ? found.role : undefined;
}

interface ProviderRecord extends RecordValue {
  mode: "mock" | "live";
  status: string;
  agentName: string;
  conversationId: string;
}

const LIVE_OPERATIONS: Record<string, { actorId: "agent-correlation" | "agent-response"; operation: SocAgentOperation }> = {
  suggestExploration: { actorId: "agent-correlation", operation: "suggest-exploration" },
  replanExploration: { actorId: "agent-correlation", operation: "replan-exploration" },
  commitPartialFindings: { actorId: "agent-correlation", operation: "commit-partial-findings" },
  completeCorrelation: { actorId: "agent-correlation", operation: "complete-correlation" },
  evaluateDc01Policy: { actorId: "agent-response", operation: "assess-policy-candidate" },
  proposeHostA: { actorId: "agent-response", operation: "propose-contained-response" },
  calculateResponse: { actorId: "agent-response", operation: "validate-response" },
};

function providers(ctx: EffectContext): Record<string, ProviderRecord> {
  return ctx.get("soc.agentProviders") as unknown as Record<string, ProviderRecord>;
}

function incidentContext(ctx: EffectContext): Record<string, unknown> {
  return {
    incident: ctx.get("soc.incident"),
    intent: ctx.get("soc.intent"),
    constraints: ctx.get("soc.constraints"),
    dataSources: ctx.get("soc.dataSources"),
    explorations: ctx.get("soc.explorations"),
    evidence: ctx.get("soc.evidence"),
    entities: ctx.get("soc.entities"),
    hypothesis: ctx.get("soc.hypothesis"),
    proposal: ctx.get("soc.proposal"),
  };
}

function assertKnownReferences(ctx: EffectContext, reply: SocAgentReply): void {
  const knownEntities = new Set(list(ctx, "soc.entities").map((value) => String((value as RecordValue).id)));
  const knownEvidence = new Set(list(ctx, "soc.evidence").map((value) => String((value as RecordValue).id)));
  const entityIds = "entityIds" in reply
    ? [...reply.entityIds, ...reply.findings.flatMap((finding) => finding.entityIds)]
    : [reply.proposal.targetEntityId].filter(Boolean);
  const evidenceIds = "evidenceIds" in reply
    ? [...reply.evidenceIds, ...reply.findings.flatMap((finding) => finding.evidenceIds)]
    : reply.proposal.evidenceIds;
  if (entityIds.some((id) => !knownEntities.has(id))) throw new Error("Agent response referenced an unknown entity.");
  if (evidenceIds.some((id) => !knownEvidence.has(id))) throw new Error("Agent response referenced unknown evidence.");
}

function replaceSet(ops: PatchOp[], path: string, update: (value: Json) => Json): PatchOp[] {
  return ops.map((op) => op.op === "set" && op.path === path && op.value !== undefined
    ? { ...op, value: update(op.value) }
    : op);
}

function lowerLiveReply(result: OrchestratorResult, operation: SocAgentOperation, reply: SocAgentReply): OrchestratorResult {
  let ops = result.ops ?? [];
  if (operation === "suggest-exploration" && "exploration" in reply) {
    ops = replaceSet(ops, "soc.explorations", (value) => (value as Json[]).map((item) => ({
      ...(item as RecordValue),
      question: reply.exploration.objective || reply.exploration.queries[0] || (item as RecordValue).question,
      safety: reply.exploration.constraints.join("; ") || (item as RecordValue).safety,
    })));
  }
  if (operation === "replan-exploration" && "exploration" in reply) {
    ops = replaceSet(ops, "soc.explorations", (value) => (value as Json[]).map((item) => ({
      ...(item as RecordValue),
      question: reply.exploration.objective || (item as RecordValue).question,
    })));
  }
  if ((operation === "commit-partial-findings" || operation === "complete-correlation") && "findings" in reply) {
    ops = replaceSet(ops, "soc.evidence", (value) => {
      const evidence = value as Json[];
      const offset = Math.max(0, evidence.length - reply.findings.length);
      return evidence.map((item, index) => {
      const finding = index >= offset ? reply.findings[index - offset] : undefined;
      return finding ? { ...(item as RecordValue), summary: finding.statement, confidence: Math.round(finding.confidence * 100) } : item;
      });
    });
    ops = replaceSet(ops, "soc.hypothesis", (value) => ({
      ...(value as RecordValue),
      statement: reply.summary || (value as RecordValue).statement,
      confidence: Math.round(reply.confidence * 100),
    }));
  }
  if (operation === "assess-policy-candidate" && "assessment" in reply) {
    ops = replaceSet(ops, "soc.proposal", (value) => ({
      ...(value as RecordValue),
      liveAssessment: reply.summary,
    }));
  }
  if (operation === "propose-contained-response" && "proposal" in reply) {
    ops = replaceSet(ops, "soc.proposal", (value) => ({
      ...(value as RecordValue),
      action: reply.proposal.objective || (value as RecordValue).action,
      sequence: reply.proposal.sequence.length > 0 ? reply.proposal.sequence : (value as RecordValue).sequence,
    }));
  }
  if (operation === "validate-response" && "proposal" in reply) {
    ops = replaceSet(ops, "soc.proposal", (value) => ({
      ...(value as RecordValue),
      blastRadius: reply.proposal.blastRadius || (value as RecordValue).blastRadius,
      reversible: reply.proposal.reversible,
      evidenceReady: reply.proposal.evidenceReady,
      operationalDependencies: reply.proposal.operationalDependencies,
    }));
  }
  return { ...result, ops };
}

function annotateProvider(
  result: OrchestratorResult,
  ctx: EffectContext,
  actorId: string,
  provider: ProviderRecord,
  used: "mock" | "live",
  fallbackReason: string,
  conversationId = "",
  responseId = "",
  validationAttempts = 0,
  repaired = false
): OrchestratorResult {
  const currentProvider = providers(ctx)[actorId] ?? provider;
  const nextProvider: ProviderRecord = {
    ...provider,
    mode: currentProvider.mode,
    status: fallbackReason ? "fallback" : "ready",
    conversationId: conversationId || provider.conversationId,
    responseId,
    lastProvider: used,
    fallbackReason,
    validationAttempts,
    repaired,
  };
  let ops = result.ops ?? [];
  ops = replaceSet(ops, "soc.journal", (value) => {
    const journal = value as Json[];
    const latest = journal.at(-1) as RecordValue | undefined;
    if (!latest || latest.actorId !== actorId) return value;
    return [...journal.slice(0, -1), {
      ...latest,
      provider: used,
      agentName: provider.agentName,
      conversationId: conversationId || provider.conversationId,
      responseId,
      fallbackReason,
      validationAttempts,
      repaired,
    }];
  });
  return {
    ...result,
    ops: [
      ...ops,
      setOp(`soc.agentProviders.${actorId}`, nextProvider),
    ],
  };
}

const deterministicEffects: EffectHandlerMap = {
  requestNextAct(ctx) {
    const presenter = ctx.get("soc.presenter") as RecordValue;
    if (presenter.locked === true) return { outcome: "ignored" };
    return {
      outcome: "requested",
      ops: [setOp("soc.presenter", {
        ...presenter,
        locked: true,
        advanceToken: Number(presenter.advanceToken ?? 0) + 1,
      })],
    };
  },

  setPace(ctx) {
    const presenter = ctx.get("soc.presenter") as RecordValue;
    const pace = ctx.payload.pace === "auto" ? "auto" : "manual";
    return {
      outcome: "updated",
      ops: [setOp("soc.presenter", {
        ...presenter,
        pace,
        durationMs: pace === "auto" ? 2000 : 120000,
      })],
    };
  },

  setPresentationContext(ctx) {
    const presentation = ctx.get("soc.presentation") as RecordValue;
    const contexts = Array.isArray(presentation.contexts) ? presentation.contexts : [];
    const requested = typeof ctx.payload.contextId === "string" ? ctx.payload.contextId : "";
    const exists = contexts.some((value) => (value as RecordValue).id === requested);
    if (!exists || presentation.selectedContext === requested) return { outcome: "ignored" };
    return {
      outcome: "projected",
      ops: [setOp("soc.presentation", {
        ...presentation,
        selectedContext: requested,
        revision: Number(presentation.revision ?? 0) + 1,
      })],
    };
  },

  finishAct(ctx) {
    const presenter = ctx.get("soc.presenter") as RecordValue;
    const authorization = ctx.get("soc.authorization") as RecordValue | undefined;
    const complete = ctx.get("soc.incident.status") === "Contained";
    return {
      outcome: "settled",
      ops: [setOp("soc.presenter", {
        ...presenter,
        locked: complete || authorization?.status === "pending",
      })],
    };
  },

  establishIntent(ctx) {
    const actorId = actor(ctx, "human-morgan");
    return {
      outcome: "committed",
      ops: [
        setOp("soc.act", 1),
        setOp("soc.step", "intent-established"),
        setOp("soc.stage", "Human intent and constraint"),
        setOp("soc.intent", {
          statement: "Determine the execution origin, contain safely, preserve evidence.",
          actorId,
        }),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-01", "09:40:00", actorId, "committed", "Established investigation intent", ["intent"]))
        ),
      ],
    };
  },

  addConstraint(ctx) {
    const actorId = actor(ctx, "human-priya");
    return {
      outcome: "committed",
      ops: [
        setOp("soc.act", 2),
        setOp("soc.step", "constraint-added"),
        setOp("soc.constraints", [{
          id: "constraint-payroll",
          actorId,
          rule: "Do not disrupt DC-01 without commander authorization.",
          affected: ["DC-01"],
          active: true,
        }]),
        setOp("soc.incident.governance", "Protected constraint active"),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-02", "09:40:18", actorId, "committed", "Protected the active payroll cutover", ["constraints", "DC-01"]))
        ),
      ],
    };
  },

  suggestExploration(ctx) {
    const actorId = actor(ctx, "agent-correlation");
    return {
      outcome: "suggested",
      ops: [
        setOp("soc.act", 3),
        setOp("soc.step", "exploration-suggested"),
        setOp("soc.stage", "Suggested exploration and human reorientation"),
        setOp("soc.explorations", [{
          id: "explore-1",
          revision: 1,
          actorId,
          status: "suggested",
          question: "Where did the privileged session execute?",
          sources: ["identity", "pam", "endpoint", "network"],
          windowMinutes: 60,
          correlationKey: "source-ip+time",
          safety: "standard queries",
        }]),
        setOp("soc.actors", updateActor(ctx, actorId, "needs-review", "Exploration suggested to Morgan")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-03", "09:41:00", actorId, "suggested", "Suggested cross-source correlation", ["explore-1"]))
        ),
      ],
    };
  },

  amendExploration(ctx) {
    const actorId = actor(ctx, "human-morgan");
    const superseded = list(ctx, "soc.explorations").map((value) => ({
      ...(value as RecordValue),
      status: "superseded",
    }));
    return {
      outcome: "superseded",
      ops: [
        setOp("soc.act", 4),
        setOp("soc.step", "exploration-amended"),
        setOp("soc.explorations", [...superseded, {
          id: "explore-2",
          revision: 2,
          actorId,
          suggestedBy: "agent-correlation",
          status: "accepted",
          question: "Where did the privileged session execute?",
          sources: ["identity", "pam", "endpoint", "network"],
          windowMinutes: 15,
          correlationKey: "token+session",
          safety: "passive-only; preserve Host-A volatile evidence",
          supersedes: "explore-1",
        }]),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-04", "09:41:18", actorId, "amended", "Narrowed the window and changed correlation to token/session identity", ["explore-1", "explore-2"]))
        ),
      ],
    };
  },

  replanExploration(ctx) {
    const actorId = actor(ctx, "agent-correlation");
    const explorations = list(ctx, "soc.explorations").map((value) => {
      const current = value as RecordValue;
      return current.id === "explore-2" ? { ...current, status: "running" } : current;
    });
    return {
      outcome: "replanned",
      ops: [
        setOp("soc.act", 5),
        setOp("soc.step", "exploration-running"),
        setOp("soc.explorations", explorations),
        setOp("soc.actors", updateActor(ctx, actorId, "working", "Running Morgan's amended passive correlation")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-05", "09:41:31", actorId, "replanned", "Replanned against the accepted exploration", ["explore-2"]))
        ),
      ],
    };
  },

  commitPartialFindings(ctx) {
    const actorId = actor(ctx, "agent-correlation");
    const evidence = [
      { id: "ev-1", actorId, source: "identity+pam", summary: "Impossible travel preceded privileged token issuance.", confidence: 94 },
      { id: "ev-2", actorId, source: "endpoint+network", summary: "Host-A created a remote service while the session appeared to involve DC-01.", confidence: 82 },
    ];
    return {
      outcome: "partial",
      ops: [
        setOp("soc.act", 6),
        setOp("soc.step", "partial-findings"),
        setOp("soc.stage", "Cross-source result and governed overreach"),
        setOp("soc.evidence", evidence),
        setOp("soc.hypothesis", {
          statement: "The token path involves both DC-01 and Host-A; origin remains unresolved.",
          confidence: 63,
          evidenceIds: ["ev-1", "ev-2"],
        }),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-06", "09:42:06", actorId, "partial", "Committed attributed partial findings", ["evidence", "hypothesis"]))
        ),
      ],
    };
  },

  evaluateDc01Policy(ctx) {
    const actorId = actor(ctx, "agent-response");
    return {
      outcome: "rejected",
      detail: { fallback: "increase-telemetry" },
      ops: [
        setOp("soc.act", 7),
        setOp("soc.step", "dc01-rejected"),
        setOp("soc.incident.governance", "Policy blocked; fallback active"),
        setOp("soc.proposal", {
          id: "proposal-dc01",
          actorId,
          action: "Isolate DC-01",
          target: "DC-01",
          status: "rejected",
          reason: "Evidence is incomplete, DC-01 is protected, and Response lacks commander authority.",
          fallback: "Increase DC-01 telemetry, restrict the compromised account, preserve Host-A evidence.",
        }),
        setOp("soc.entities", [
          { id: "DC-01", kind: "domain-controller", criticality: "protected", dependency: "Active payroll cutover", state: "enhanced-telemetry" },
          { id: "Host-A", kind: "admin-workstation", criticality: "non-critical", dependency: "No active payroll dependency", state: "evidence-preserved" },
        ]),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-07", "09:42:24", actorId, "rejected+fallback", "Blocked DC-01 isolation and applied safe fallback", ["proposal-dc01", "DC-01", "Host-A"]))
        ),
      ],
    };
  },

  completeCorrelation(ctx) {
    const actorId = actor(ctx, "agent-correlation");
    const evidence = [
      ...list(ctx, "soc.evidence"),
      { id: "ev-3", actorId, source: "token+session", summary: "The privileged session was replayed from Host-A; DC-01 only brokered authentication.", confidence: 97 },
      { id: "ev-4", actorId, source: "endpoint", summary: "Host-A continued beaconing after DC-01 indicators cleared.", confidence: 98 },
    ];
    return {
      outcome: "validated",
      ops: [
        setOp("soc.act", 8),
        setOp("soc.step", "origin-resolved"),
        setOp("soc.evidence", evidence),
        setOp("soc.correlations", [{
          id: "corr-1",
          actorId,
          evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4"],
          relationship: "Host-A replayed the token; DC-01 brokered authentication",
          strength: 97,
        }]),
        setOp("soc.hypothesis", {
          statement: "Host-A is the compromised execution point; DC-01 is a protected dependency, not the containment target.",
          confidence: 97,
          evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4"],
        }),
        setOp("soc.actors", updateActor(ctx, actorId, "complete", "Resolved Host-A as the execution origin")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-08", "09:42:47", actorId, "validated", "Resolved Host-A as the execution origin", ["corr-1", "hypothesis", "Host-A"]))
        ),
      ],
    };
  },

  proposeHostA(ctx) {
    const actorId = actor(ctx, "agent-response");
    return {
      outcome: "suggested",
      ops: [
        setOp("soc.act", 9),
        setOp("soc.step", "response-suggested"),
        setOp("soc.stage", "Response suggestion and human reorientation"),
        setOp("soc.proposal", {
          id: "proposal-host-a",
          revision: 1,
          actorId,
          action: "Capture volatile state, restrict network access, isolate Host-A",
          target: "Host-A",
          status: "suggested",
          sequence: ["capture", "restrict", "isolate"],
        }),
        setOp("soc.actors", updateActor(ctx, actorId, "input-awaited", "Bounded containment proposal awaiting human review")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-09", "09:43:04", actorId, "suggested", "Suggested bounded Host-A containment", ["proposal-host-a"]))
        ),
      ],
    };
  },

  reviseResponse(ctx) {
    const actorId = actor(ctx, "human-morgan");
    const proposal = ctx.get("soc.proposal") as RecordValue;
    return {
      outcome: "superseded",
      ops: [
        setOp("soc.act", 10),
        setOp("soc.step", "response-revised"),
        setOp("soc.proposal", {
          ...proposal,
          revision: 2,
          status: "revised",
          revisedBy: actorId,
          sequence: ["preserve-forensics", "verify-payroll-dependency", "restrict", "isolate"],
        }),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-10", "09:43:19", actorId, "amended", "Required forensic preservation and payroll dependency verification first", ["proposal-host-a"]))
        ),
      ],
    };
  },

  calculateResponse(ctx) {
    const actorId = actor(ctx, "agent-response");
    const proposal = ctx.get("soc.proposal") as RecordValue;
    return {
      outcome: "validated",
      ops: [
        setOp("soc.act", 11),
        setOp("soc.step", "response-validated"),
        setOp("soc.proposal", {
          ...proposal,
          status: "ready-for-recommendation",
          blastRadius: "Endpoint only",
          payrollDependency: "None",
          reversible: true,
          evidenceReady: true,
        }),
        setOp("soc.actors", updateActor(ctx, actorId, "waiting", "Response validated; waiting for commander authorization")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-11", "09:43:35", actorId, "validated", "Verified endpoint-only blast radius and no payroll dependency", ["proposal-host-a", "Host-A"]))
        ),
      ],
    };
  },

  recommendContainment(ctx) {
    const actorId = actor(ctx, "human-morgan");
    return {
      outcome: "recommended",
      ops: [
        setOp("soc.act", 12),
        setOp("soc.step", "awaiting-commander"),
        setOp("soc.incident.governance", "Awaiting commander"),
        setOp("soc.recommendation", {
          id: "rec-1",
          actorId,
          proposalId: "proposal-host-a",
          rationale: "Host-A is the confirmed origin and can be isolated without payroll impact.",
        }),
        setOp("soc.authorization", {
          proposalId: "proposal-host-a",
          requiredRole: "Incident Commander",
          status: "pending",
        }),
        setOp("soc.actors", updateActor(ctx, "human-priya", "input-awaited", "Authorization decision required")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-12", "09:43:48", actorId, "recommended", "Recommended Host-A isolation; commander authority required", ["rec-1", "proposal-host-a"]))
        ),
      ],
    };
  },

  authorizeContainment(ctx) {
    const actorId = actor(ctx, "human-priya");
    if (roleFor(ctx, actorId) !== "Incident Commander") {
      return {
        outcome: "rejected",
        detail: { reason: "commander-authority-required" },
        ops: [
          setOp(
            "soc.journal",
            appendJournal(ctx, entry("j-auth-rejected", "09:44:00", actorId, "rejected", "Authorization rejected; Incident Commander authority required", ["authorization"]))
          ),
        ],
      };
    }
    const presenter = ctx.get("soc.presenter") as RecordValue;
    return {
      outcome: "authorized",
      ops: [
        setOp("soc.act", 13),
        setOp("soc.step", "authorized"),
        setOp("soc.stage", "Correct authority and execution"),
        setOp("soc.incident.governance", "Authorized"),
        setOp("soc.authorization", {
          proposalId: "proposal-host-a",
          requiredRole: "Incident Commander",
          status: "authorized",
          actorId,
        }),
        setOp("soc.actors", updateActors(ctx, {
          "human-priya": { status: "active", activity: "Authorized evidence-backed containment" },
          "agent-response": { status: "waiting", activity: "Authorized; waiting for presenter to run containment" },
        })),
        setOp("soc.presenter", { ...presenter, locked: false }),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-13", "09:44:08", actorId, "authorized", "Authorized the evidence-backed Host-A isolation", ["authorization", "proposal-host-a"]))
        ),
      ],
    };
  },

  executeContainment(ctx) {
    const authorization = ctx.get("soc.authorization") as RecordValue | undefined;
    if (authorization?.status !== "authorized") {
      return { outcome: "rejected", detail: { reason: "authorization-required" } };
    }
    const actorId = actor(ctx, "agent-response");
    const proposal = ctx.get("soc.proposal") as RecordValue;
    const entities = list(ctx, "soc.entities").map((value) => {
      const entity = value as RecordValue;
      return entity.id === "Host-A" ? { ...entity, state: "isolated" } : entity;
    });
    return {
      outcome: "executed",
      ops: [
        setOp("soc.act", 14),
        setOp("soc.step", "contained"),
        setOp("soc.stage", "Containment complete"),
        setOp("soc.incident.status", "Contained"),
        setOp("soc.incident.governance", "Executed"),
        setOp("soc.proposal", { ...proposal, status: "executed", executedBy: actorId }),
        setOp("soc.entities", entities),
        setOp("soc.actors", updateActor(ctx, actorId, "complete", "Host-A isolated under commander authorization")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-14", "09:44:12", actorId, "executed", "Isolated Host-A under Priya's authorization", ["Host-A", "proposal-host-a"]))
        ),
      ],
    };
  },

  resetScenario() {
    return {
      outcome: "reset",
      ops: [
        ...Object.entries(resetState).map(([key, value]) =>
          setOp(`soc.${key}`, JSON.parse(JSON.stringify(value)) as Json)
        ),
        setOp("soc.act", 0),
        setOp("soc.step", "ready"),
        setOp("soc.presenter", {
          pace: "manual",
          durationMs: 120000,
          locked: false,
          advanceToken: 0,
        }),
      ],
    };
  },
};

const RUNNER_EFFECT_NAMES = new Set([
  "requestNextAct",
  "setPace",
  "finishAct",
  "resetScenario",
]);

export const demoRunnerEffects = Object.fromEntries(
  Object.entries(deterministicEffects).filter(([name]) => RUNNER_EFFECT_NAMES.has(name))
) as EffectHandlerMap;

export const socOrganismEffects = Object.fromEntries(
  Object.entries(deterministicEffects).filter(([name]) => !RUNNER_EFFECT_NAMES.has(name))
) as EffectHandlerMap;

export function createSocEffects(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  accessKey: () => string = getSocFoundryKey
): EffectHandlerMap {
  const wrapped: EffectHandlerMap = { ...deterministicEffects };

  wrapped.setAgentMode = async (ctx) => {
    const actorId = typeof ctx.payload.agentId === "string" ? ctx.payload.agentId : "";
    const mode = ctx.payload.mode === "live" ? "live" : "mock";
    const currentProviders = providers(ctx);
    const provider = currentProviders[actorId];
    if (!provider || !["agent-correlation", "agent-response"].includes(actorId)) {
      return { outcome: "rejected", detail: { reason: "unknown-agent" } };
    }
    if (mode === "mock") {
      const accessRequired = Object.entries(currentProviders).some(([id, current]) => id !== actorId && current.mode === "live");
      return {
        outcome: "updated",
        ops: [
          setOp(`soc.agentProviders.${actorId}`, { ...provider, mode, status: "ready", lastProvider: "mock", fallbackReason: "" }),
          setOp("soc.foundry.required", accessRequired),
        ],
      };
    }

    const key = accessKey().trim();
    if (!key) {
      return {
        outcome: "fallback",
        ops: [
          setOp(`soc.agentProviders.${actorId}`, { ...provider, mode, status: "fallback", fallbackReason: "Access key required for Live mode." }),
          setOp("soc.foundry.required", true),
        ],
      };
    }
    try {
      await createFoundryProxy({ baseUrl: manifest.payload.config.proxyBase, key, fetch: fetchImpl }).ping(provider.agentName);
      return {
        outcome: "updated",
        ops: [
          setOp(`soc.agentProviders.${actorId}`, { ...provider, mode, status: "ready", fallbackReason: "" }),
          setOp("soc.foundry.required", true),
        ],
      };
    } catch (error) {
      return {
        outcome: "fallback",
        ops: [
          setOp(`soc.agentProviders.${actorId}`, { ...provider, mode, status: "fallback", fallbackReason: error instanceof Error ? error.message : "Foundry agent is unavailable." }),
          setOp("soc.foundry.required", true),
        ],
      };
    }
  };

  wrapped.acceptSocFoundryAccess = (ctx) => {
    const key = typeof ctx.payload.key === "string" ? ctx.payload.key.trim() : "";
    const agentNames = Array.isArray(ctx.payload.agentNames)
      ? ctx.payload.agentNames.filter((value): value is string => typeof value === "string")
      : [];
    const nextProviders = Object.fromEntries(Object.entries(providers(ctx)).map(([id, provider]) => [id, provider.mode === "live"
      ? { ...provider, status: agentNames.includes(provider.agentName) ? "ready" : "fallback", fallbackReason: agentNames.includes(provider.agentName) ? "" : `${provider.agentName} is not available for this key.` }
      : provider]));
    return {
      outcome: "updated",
      ops: [
        setOp("soc.foundry.key", key),
        setOp("soc.foundry.agentNames", agentNames),
        setOp("soc.agentProviders", nextProviders),
      ],
    };
  };

  wrapped.clearSocFoundryAccess = () => ({
    outcome: "updated",
    ops: [
      setOp("soc.foundry.key", ""),
      setOp("soc.foundry.agentNames", []),
    ],
  });

  for (const [handlerName, live] of Object.entries(LIVE_OPERATIONS)) {
    const deterministic = deterministicEffects[handlerName];
    wrapped[handlerName] = async (ctx) => {
      const provider = providers(ctx)[live.actorId];
      const capturedMode = provider?.mode === "live" ? "live" : "mock";
      if (capturedMode === "mock") {
        const result = await deterministic(ctx) as OrchestratorResult | void;
        return annotateProvider(result ?? {}, ctx, live.actorId, provider, "mock", "");
      }

      const key = accessKey().trim();
      let conversationId = provider.conversationId;
      let responseId = "";
      let validationAttempts = 0;
      try {
        if (!key) throw new Error("Access key required for Live mode.");
        const proxy = createFoundryProxy({
          baseUrl: manifest.payload.config.proxyBase,
          key,
          fetch: fetchImpl,
        });
        const contract = createSocAgentContract(live.operation);
        let response = await proxy.chat({
          message: buildAgentMessage(live.operation, incidentContext(ctx)),
          agentName: provider.agentName,
          conversationId: provider.conversationId || undefined,
          instructions: contract.instructions,
        });
        conversationId = response.conversationId;
        responseId = response.responseId;
        validationAttempts = 1;
        let validation = contract.validate(response.reply);
        let issues: AgentValidationIssue[] = validation.ok ? [] : validation.issues;
        if (validation.ok) {
          try {
            assertKnownReferences(ctx, validation.value);
          } catch (error) {
            issues = [{ path: "$", code: "unknown-reference", message: error instanceof Error ? error.message : "Response contains an unknown reference." }];
          }
        }

        if (issues.length > 0) {
          response = await proxy.chat({
            message: contract.buildCorrectionPrompt(issues),
            agentName: provider.agentName,
            conversationId,
            instructions: contract.instructions,
          });
          conversationId = response.conversationId;
          responseId = response.responseId;
          validationAttempts = 2;
          validation = contract.validate(response.reply);
          issues = validation.ok ? [] : validation.issues;
          if (validation.ok) {
            try {
              assertKnownReferences(ctx, validation.value);
            } catch (error) {
              issues = [{ path: "$", code: "unknown-reference", message: error instanceof Error ? error.message : "Response contains an unknown reference." }];
            }
          }
        }

        if (!validation.ok || issues.length > 0) {
          throw new Error(`Live response failed validation after correction: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
        }
        const reply = validation.value;
        const result = await deterministic(ctx) as OrchestratorResult | void;
        const lowered = lowerLiveReply(result ?? {}, live.operation, reply);
        return annotateProvider(lowered, ctx, live.actorId, provider, "live", "", conversationId, responseId, validationAttempts, validationAttempts > 1);
      } catch (error) {
        const result = await deterministic(ctx) as OrchestratorResult | void;
        return annotateProvider(
          result ?? {},
          ctx,
          live.actorId,
          provider,
          "mock",
          error instanceof Error ? error.message : "Live response failed validation.",
          conversationId,
          responseId,
          validationAttempts,
          false
        );
      }
    };
  }

  return wrapped;
}

export function createSocOrganismEffects(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  accessKey: () => string = getSocFoundryKey
): EffectHandlerMap {
  const effects = createSocEffects(fetchImpl, accessKey);
  return Object.fromEntries(
    Object.entries(effects).filter(([name]) => !RUNNER_EFFECT_NAMES.has(name))
  ) as EffectHandlerMap;
}

export const demoEffects = createSocEffects();
export const effects = createSocOrganismEffects();
export default effects;