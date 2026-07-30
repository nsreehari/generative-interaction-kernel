import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import type { Json, OrchestratorResult, PatchOp } from "@gik/kernel";
import blueprint from "../../blueprint.json";
import { projectSocInspection, projectSocParticipants } from "./inspection";
import type { Actor, AgentProvider, Incident, JournalEntry, Presentation } from "../projection_views/types";

type RecordValue = Record<string, Json>;
const blueprintState = blueprint.payload.runtime.state as unknown as RecordValue;
const resetState = JSON.parse(JSON.stringify(blueprintState.soc)) as RecordValue;
const resetInspection = JSON.parse(JSON.stringify(blueprintState.inspection)) as RecordValue;

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
  mode: "mock";
  status: string;
  agentName: string;
  conversationId: string;
}

const AGENT_OPERATIONS: Record<string, { actorId: "agent-correlation" | "agent-response" }> = {
  suggestExploration: { actorId: "agent-correlation" },
  replanExploration: { actorId: "agent-correlation" },
  commitPartialFindings: { actorId: "agent-correlation" },
  completeCorrelation: { actorId: "agent-correlation" },
  evaluateDc01Policy: { actorId: "agent-response" },
  proposeHostA: { actorId: "agent-response" },
  calculateResponse: { actorId: "agent-response" },
};

function providers(ctx: EffectContext): Record<string, ProviderRecord> {
  return ctx.get("soc.agentProviders") as unknown as Record<string, ProviderRecord>;
}

function inspectionParticipants(
  actors: Json[],
  providerRecords: Record<string, ProviderRecord>,
): Json {
  return projectSocParticipants(
    actors as unknown as Actor[],
    providerRecords as unknown as Record<string, AgentProvider>,
  ) as unknown as Json;
}

function participantOps(ctx: EffectContext, actors: Json[]): PatchOp[] {
  return [
    setOp("soc.actors", actors),
    setOp("control.inspection.participants", inspectionParticipants(actors, providers(ctx))),
  ];
}

function providerOps(ctx: EffectContext, actorId: string, provider: ProviderRecord): PatchOp[] {
  const nextProviders = { ...providers(ctx), [actorId]: provider };
  return [
    setOp(`soc.agentProviders.${actorId}`, provider),
    setOp("control.inspection.participants", inspectionParticipants(list(ctx, "soc.actors"), nextProviders)),
  ];
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

function replaceSet(ops: PatchOp[], path: string, update: (value: Json) => Json): PatchOp[] {
  return ops.map((op) => op.op === "set" && op.path === path && op.value !== undefined
    ? { ...op, value: update(op.value) }
    : op);
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
      ...providerOps(ctx, actorId, nextProvider),
    ],
  };
}

const deterministicEffects: EffectHandlerMap = {
  syncInspection(ctx) {
    return {
      outcome: "projected",
      ops: [setOp("control.inspection", projectSocInspection(
        list(ctx, "soc.actors") as unknown as Actor[],
        providers(ctx) as unknown as Record<string, AgentProvider>,
        ctx.get("soc.presentation") as unknown as Presentation,
        list(ctx, "soc.journal") as unknown as JournalEntry[],
        ctx.get("soc.incident") as unknown as Incident,
      ) as unknown as Json)],
    };
  },

  establishIntent(ctx) {
    const actorId = actor(ctx, "human-morgan");
    return {
      outcome: "committed",
      ops: [
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
        ...participantOps(ctx, updateActor(ctx, actorId, "needs-review", "Exploration suggested to Morgan")),
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
        setOp("soc.explorations", explorations),
        ...participantOps(ctx, updateActor(ctx, actorId, "working", "Running Morgan's amended passive correlation")),
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
        ...participantOps(ctx, updateActor(ctx, actorId, "complete", "Resolved Host-A as the execution origin")),
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
        ...participantOps(ctx, updateActor(ctx, actorId, "input-awaited", "Bounded containment proposal awaiting human review")),
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
        setOp("soc.proposal", {
          ...proposal,
          status: "ready-for-recommendation",
          blastRadius: "Endpoint only",
          payrollDependency: "None",
          reversible: true,
          evidenceReady: true,
        }),
        ...participantOps(ctx, updateActor(ctx, actorId, "waiting", "Response validated; waiting for commander authorization")),
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
        ...participantOps(ctx, updateActor(ctx, "human-priya", "input-awaited", "Authorization decision required")),
        setOp(
          "soc.journal",
          appendJournal(ctx, entry("j-12", "09:43:48", actorId, "recommended", "Recommended Host-A isolation; commander authority required", ["rec-1", "proposal-host-a"]))
        ),
      ],
    };
  },

  authorizeContainment(ctx) {
    const authorizationRequest = ctx.get("control.authorizationRequest") as RecordValue | undefined;
    const actorId = actor(ctx, typeof authorizationRequest?.actorId === "string" ? authorizationRequest.actorId : "human-priya");
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
    const controlRequest = ctx.get("control.request") as RecordValue | undefined;
    return {
      outcome: "authorized",
      ops: [
        setOp("soc.stage", "Correct authority and execution"),
        setOp("soc.incident.governance", "Authorized"),
        setOp("soc.authorization", {
          proposalId: "proposal-host-a",
          requiredRole: "Incident Commander",
          status: "authorized",
          actorId,
        }),
        ...participantOps(ctx, updateActors(ctx, {
          "human-priya": { status: "active", activity: "Authorized evidence-backed containment" },
          "agent-response": { status: "waiting", activity: "Authorized; waiting for presenter to run containment" },
        })),
        ...(controlRequest?.command === "$human-gate" && typeof controlRequest.token === "number" ? [
          setOp("control.receipt", {
            requestId: String(controlRequest.id ?? controlRequest.correlationId ?? controlRequest.token),
            token: controlRequest.token,
            command: "$human-gate",
            status: "completed",
            outcome: "authorized",
            result: {
              id: "j-13",
              actorId,
              result: "authorized",
              summary: "Authorized the evidence-backed Host-A isolation",
              affected: ["authorization", "proposal-host-a"],
              time: "09:44:08",
            },
          }),
        ] : []),
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
        setOp("soc.stage", "Containment complete"),
        setOp("soc.incident.status", "Contained"),
        setOp("soc.incident.governance", "Executed"),
        setOp("soc.proposal", { ...proposal, status: "executed", executedBy: actorId }),
        setOp("soc.entities", entities),
        ...participantOps(ctx, updateActor(ctx, actorId, "complete", "Host-A isolated under commander authorization")),
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
        setOp("control.inspection", JSON.parse(JSON.stringify(resetInspection)) as Json),
      ],
    };
  },
};

export const socOrganismEffects = deterministicEffects;

export function createSocEffects(
  _fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  _accessKey: () => string = () => ""
): EffectHandlerMap {
  const wrapped: EffectHandlerMap = { ...deterministicEffects };

  for (const [handlerName, agent] of Object.entries(AGENT_OPERATIONS)) {
    const deterministic = deterministicEffects[handlerName];
    wrapped[handlerName] = async (ctx) => {
      const provider = providers(ctx)[agent.actorId];
      const result = await deterministic(ctx) as OrchestratorResult | void;
      return annotateProvider(
        result ?? {},
        ctx,
        agent.actorId,
        provider,
        "mock",
        ""
      );
    };
  }

  const commandHandlers: Record<string, string> = {
    establishIntent: "establishIntent",
    addConstraint: "addConstraint",
    suggestExploration: "suggestExploration",
    amendExploration: "amendExploration",
    replanExploration: "replanExploration",
    commitPartialFindings: "commitPartialFindings",
    proposeDc01: "evaluateDc01Policy",
    completeCorrelation: "completeCorrelation",
    proposeHostA: "proposeHostA",
    reviseResponse: "reviseResponse",
    calculateResponse: "calculateResponse",
    recommendContainment: "recommendContainment",
    executeContainment: "executeContainment",
    $reset: "resetScenario",
  };
  for (const [command, handlerName] of Object.entries(commandHandlers)) {
    const handler = wrapped[handlerName];
    if (!handler) continue;
    wrapped[handlerName] = async (ctx) => {
      const result = await handler(ctx) as OrchestratorResult | void;
      const request = ctx.get("control.request") as RecordValue | undefined;
      if (request?.command !== command || typeof request.token !== "number") return result;
      const journalOp = result?.ops?.find((op) => op.path === "soc.journal" && Array.isArray(op.value));
      const journal = Array.isArray(journalOp?.value) ? journalOp.value : [];
      const journalEntry = journal.at(-1) as RecordValue | undefined;
      const actorId = String(journalEntry?.actorId ?? "");
      const focusRefs = journalEntry ? [
        { namespace: "soc", kind: "actor", id: actorId, relation: "origin" },
        ...(Array.isArray(journalEntry.affected) ? journalEntry.affected : []).map((id) => ({
          namespace: "soc",
          kind: "record",
          id: String(id),
          relation: "affected",
        })),
      ] : [];
      return {
        ...(result ?? {}),
        ops: [
          ...(result?.ops ?? []),
          setOp("control.receipt", {
            requestId: String(request.id ?? request.correlationId ?? request.token),
            token: request.token,
            command,
            status: "completed",
            outcome: String(result?.outcome ?? "completed"),
            ...(command !== "$reset" && journalEntry ? {
              result: {
                ...journalEntry,
                actorRef: { namespace: "soc", kind: "actor", id: actorId, relation: "origin" },
                focusRefs,
              },
            } : {}),
          }),
        ],
      };
    };
  }
  return wrapped;
}

export function createSocOrganismEffects(
  _fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  _accessKey: () => string = () => ""
): EffectHandlerMap {
  return createSocEffects();
}

export const effects = createSocOrganismEffects();
export default effects;