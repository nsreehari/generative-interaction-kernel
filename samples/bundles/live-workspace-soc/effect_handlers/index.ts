import { setOp, type EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

const activeActors = [
  { id: "agent-triage", name: "Triage", role: "Investigation lead", status: "working", activity: "Correlating identity and endpoint evidence", authority: "derive, invoke" },
  { id: "agent-identity", name: "Identity", role: "Identity specialist", status: "working", activity: "Validating impossible-travel sequence", authority: "derive, invoke" },
  { id: "agent-endpoint", name: "Endpoint", role: "Endpoint specialist", status: "working", activity: "Inspecting remote service creation", authority: "derive, invoke" },
  { id: "agent-response", name: "Response", role: "Containment planner", status: "waiting", activity: "Waiting for confidence threshold", authority: "route, confirm" },
] as const;

const evidence = [
  { id: "ev-1", sourceActorId: "agent-identity", kind: "Identity", summary: "Impossible travel followed by privileged token issuance", confidence: 94, time: "09:41" },
  { id: "ev-2", sourceActorId: "agent-endpoint", kind: "Endpoint", summary: "New remote service created on Host-A from DC-01", confidence: 88, time: "09:42" },
  { id: "ev-3", sourceActorId: "agent-triage", kind: "Correlation", summary: "Signals align within a four-minute lateral-movement window", confidence: 91, time: "09:43" },
] as const;

function appendLedger(current: Json, entry: Record<string, Json>): Json[] {
  return [...(Array.isArray(current) ? current : []), entry] as Json[];
}

const initialActors = activeActors.map((actor) => ({
  ...actor,
  status: "waiting",
  activity: "Ready to join the investigation",
}));

export const effects: EffectHandlerMap = {
  parallelInvestigation(ctx) {
    return {
      outcome: "validated",
      detail: { contributionCount: 3 },
      ops: [
        setOp("soc.act", 2),
        setOp("soc.stage", "Investigate in parallel"),
        setOp("soc.actors", activeActors as unknown as Json),
        setOp("soc.evidence", evidence as unknown as Json),
        setOp("soc.hypothesis", {
          statement: "A compromised privileged identity moved laterally from DC-01 to Host-A.",
          confidence: 91,
        }),
        setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
          time: "09:43:12",
          actorId: ctx.actorId ?? "agent-triage",
          result: "validated",
          summary: "Three attributed findings committed to shared state",
        })),
      ],
    };
  },

  policyGuard(ctx) {
    const actors = activeActors.map((actor) =>
      actor.id === "agent-response"
        ? { ...actor, status: "blocked", activity: "Unsafe containment proposal rejected by policy" }
        : actor
    );
    return {
      outcome: "rejected",
      detail: { target: "DC-01", fallback: "increase-telemetry" },
      ops: [
        setOp("soc.act", 3),
        setOp("soc.stage", "Governance says no"),
        setOp("soc.actors", actors as unknown as Json),
        setOp("soc.proposal", {
          id: "proposal-dc01",
          actorId: ctx.actorId ?? "agent-response",
          action: "Isolate DC-01",
          target: "DC-01",
          authorityResult: "rejected+fallback",
          reason: "Protected domain controller; evidence does not justify blast radius.",
          fallback: "Increase telemetry and preserve volatile evidence.",
        }),
        setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
          time: "09:44:03",
          actorId: ctx.actorId ?? "agent-response",
          result: "rejected",
          summary: "Protected asset isolation blocked; safe fallback applied",
        })),
      ],
    };
  },

  autonomousContinuation(ctx) {
    const autonomousEvidence = [
      ...evidence,
      { id: "ev-4", sourceActorId: "agent-endpoint", kind: "Endpoint", summary: "Host-A beacon persisted while DC-01 indicators cleared", confidence: 97, time: "09:48" },
    ];
    const actors = activeActors.map((actor) => ({
      ...actor,
      status: "working",
      activity: actor.id === "agent-response" ? "Recalculating containment target" : "Continuing under autonomous monitoring",
    }));
    return {
      outcome: "validated",
      detail: { mode: "autonomous" },
      ops: [
        setOp("soc.act", 4),
        setOp("soc.stage", "Autonomous continuation"),
        setOp("soc.mode", "Autonomous"),
        setOp("soc.actors", actors as unknown as Json),
        setOp("soc.evidence", autonomousEvidence as unknown as Json),
        setOp("soc.hypothesis", {
          statement: "Host-A is the compromised endpoint; DC-01 was a transient source, not the containment target.",
          confidence: 97,
        }),
        setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
          time: "09:48:29",
          actorId: ctx.actorId ?? "analyst-morgan",
          result: "mode-shift",
          summary: "Agent team continued on the same governed state while analyst stepped away",
        })),
      ],
    };
  },

  requestContainment(ctx) {
    const actors = activeActors.map((actor) =>
      actor.id === "agent-response"
        ? { ...actor, status: "needs-approval", activity: "Host-A isolation awaiting analyst confirmation" }
        : { ...actor, status: "waiting", activity: "Evidence chain complete" }
    );
    return {
      outcome: "confirmation-required",
      detail: { target: "Host-A", confidence: 97 },
      ops: [
        setOp("soc.act", 5),
        setOp("soc.stage", "Governed return"),
        setOp("soc.mode", "Collaborative"),
        setOp("soc.actors", actors as unknown as Json),
        setOp("soc.proposal", {
          id: "proposal-host-a",
          actorId: ctx.actorId ?? "agent-response",
          action: "Isolate Host-A",
          target: "Host-A",
          authorityResult: "confirmation-required",
          reason: "97% confidence; endpoint-only blast radius; evidence preserved.",
          evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4"],
        }),
        setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
          time: "09:49:11",
          actorId: ctx.actorId ?? "agent-response",
          result: "confirmation-required",
          summary: "Host-A isolation returned to analyst with complete evidence chain",
        })),
      ],
    };
  },

  executeContainment(ctx) {
    const proposal = ctx.get("soc.proposal") as Record<string, Json> | undefined;
    if (proposal?.authorityResult !== "confirmation-required") {
      return {
        outcome: "rejected",
        detail: { reason: "no-confirmation-pending" },
        ops: [
          setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
            time: "09:49:12",
            actorId: ctx.actorId ?? "analyst-morgan",
            result: "rejected",
            summary: "Execution blocked because no confirmation-gated proposal was pending",
          })),
        ],
      };
    }
    return {
      outcome: "executed",
      detail: { target: "Host-A" },
      ops: [
        setOp("soc.incident.status", "Contained"),
        setOp("soc.stage", "Containment complete"),
        setOp("soc.proposal", { ...proposal, authorityResult: "executed", approvedBy: ctx.actorId ?? "analyst-morgan" }),
        setOp("soc.actors", activeActors.map((actor) => ({ ...actor, status: "idle", activity: "Investigation complete" })) as unknown as Json),
        setOp("soc.ledger", appendLedger(ctx.get("soc.ledger"), {
          time: "09:49:27",
          actorId: ctx.actorId ?? "analyst-morgan",
          result: "executed",
          summary: "Host-A isolated after explicit analyst confirmation",
        })),
      ],
    };
  },

  resetScenario() {
    return {
      ops: [
        setOp("soc.act", 1),
        setOp("soc.stage", "Assemble the team"),
        setOp("soc.mode", "Collaborative"),
        setOp("soc.incident.status", "Investigating"),
        setOp("soc.actors", initialActors as unknown as Json),
        setOp("soc.evidence", []),
        setOp("soc.hypothesis", { statement: "Suspicious identity activity may be connected to lateral movement on Host-A.", confidence: 32 }),
        setOp("soc.proposal", null),
        setOp("soc.ledger", [{ time: "09:40:00", actorId: "analyst-morgan", result: "intent", summary: "Establish scope, contain safely, preserve evidence" }]),
      ],
    };
  },
};

export default effects;
