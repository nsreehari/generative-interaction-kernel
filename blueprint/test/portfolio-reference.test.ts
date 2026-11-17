import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GIKEvent, Json } from "gik-kernel";
import { materializeBlueprint, parseBlueprintJson, runMaterializedTransition } from "../src";

function reference() {
  return parseBlueprintJson(readFileSync(new URL("../references/portfolio.blueprint.json", import.meta.url), "utf8"));
}

function persisted(state: Record<string, Json>): Record<string, Json> {
  return JSON.parse(JSON.stringify(state));
}

async function transition(state: Record<string, Json>, events: GIKEvent[]) {
  // Re-read and rematerialize on every call: no executor, graph cache, or session survives.
  const result = await runMaterializedTransition({
    materializedBlueprint: materializeBlueprint({ blueprint: reference() }),
    state: persisted(state),
    events,
  });
  expect(result.effects).toBeUndefined();
  return persisted(result.state);
}

function initialState() {
  return materializeBlueprint({ blueprint: reference() }).payload.initialState;
}

describe("durable advisory portfolio reference", () => {
  it("reconstructs all three independent host cadences from committed runtime state", async () => {
    const charter = {
      purpose: "Explain portfolio evidence to the owner.",
      successMeasures: ["Uncertainty is documented"],
      constraints: ["Advisory only", "No domain mutations"],
    };
    const initial: Record<string, Json> = { ...initialState(), charter };
    let state = await transition(initial, []);
    expect(state.operationalAdvisory).toBeNull();
    expect(state.progressAdvisory).toBeNull();
    expect(state.strategyAdvisory).toBeNull();

    state = await transition(state, [{ node: "operations", name: "heartbeat", payload: { sequence: 5 } }]);
    expect(state.operationalAdvisory).toEqual({
      kind: "operational", advisoryOnly: true, sequence: 5,
      requestId: "portfolio-review-1", requestPending: true,
      pendingActionIds: ["collect-evidence", "review-evidence"],
    });
    expect(state.progressPulse).toBe(0);
    expect(state.strategyPulse).toBe(0);

    state = await transition(state, [{ node: "progress", name: "heartbeat", payload: { sequence: 2 } }]);
    expect(state.progressAdvisory).toMatchObject({
      kind: "progress", sequence: 2, completedActions: 0, totalActions: 2,
      successMeasures: charter.successMeasures,
    });
    expect(state.strategyPulse).toBe(0);

    state = await transition(state, [{ node: "strategy", name: "heartbeat", payload: { sequence: 1 } }]);
    expect(state.strategyAdvisory).toMatchObject({
      kind: "strategy", sequence: 1, purpose: charter.purpose, constraints: charter.constraints,
    });
    for (const key of ["charter", "strategy", "planActions", "requestCondition"]) {
      expect(state[key]).toEqual(initial[key]);
    }

    for (const sequence of [5, 3]) {
      expect(await transition(state, [{ node: "operations", name: "heartbeat", payload: { sequence } }])).toEqual(state);
    }
  });

  it("preserves the charter, request condition, and action identities through revisions and reviews", async () => {
    const initial = initialState();
    let state = await transition(initial, [{
      node: "strategy", name: "revise",
      payload: { approach: "Review uncertainty with the owner.", priorities: ["Explain evidence gaps"] },
    }]);
    state = await transition(state, [{
      node: "plan", name: "revise",
      payload: { actionId: "collect-evidence", description: "Evidence gaps documented.", status: "complete" },
    }]);
    state = await transition(state, [{ node: "strategy", name: "heartbeat", payload: { sequence: 1 } }]);
    state = await transition(state, [{ node: "progress", name: "heartbeat", payload: { sequence: 1 } }]);
    state = await transition(state, [{ node: "operations", name: "heartbeat", payload: { sequence: 1 } }]);

    expect(state.charter).toEqual(initial.charter);
    expect(state.requestCondition).toEqual(initial.requestCondition);
    expect(state.strategy).toEqual({
      revision: 2, approach: "Review uncertainty with the owner.", priorities: ["Explain evidence gaps"],
    });
    expect(state.planActions).toEqual([
      { id: "collect-evidence", description: "Evidence gaps documented.", status: "complete" },
      { id: "review-evidence", description: "Review evidence with the owner.", status: "pending" },
    ]);
    expect(state.strategyAdvisory).toMatchObject({
      kind: "strategy", sequence: 1, advisoryOnly: true, requiresJudgment: true,
      strategy: state.strategy,
    });
    expect(state.progressAdvisory).toMatchObject({ completedActions: 1, totalActions: 2 });
    expect(state.operationalAdvisory).toMatchObject({ pendingActionIds: ["review-evidence"] });

    expect(await transition(state, [])).toEqual(state);
    state = await transition(state, [{
      node: "plan", name: "revise",
      payload: { actionId: "review-evidence", description: "Awaiting owner evidence.", status: "blocked" },
    }]);
    expect(state.operationalAdvisory).toMatchObject({ sequence: 1, pendingActionIds: [] });
    expect(state.progressAdvisory).toMatchObject({ sequence: 1, completedActions: 1, totalActions: 2 });
    expect(state.planActions).toEqual([
      { id: "collect-evidence", description: "Evidence gaps documented.", status: "complete" },
      { id: "review-evidence", description: "Awaiting owner evidence.", status: "blocked" },
    ]);
    expect(state.charter).toEqual(initial.charter);
    expect(state.requestCondition).toEqual(initial.requestCondition);
  });

  it.each(["fulfilled", "cancelled"])("uses a persisted %s request condition without inventing a lifecycle", async (status) => {
    const initial = initialState();
    const requestCondition = { requestId: "portfolio-review-1", status, desiredOutcome: "An evidence-grounded advisory review" };
    const state = await transition({ ...initial, requestCondition }, [
      { node: "operations", name: "heartbeat", payload: { sequence: 1 } },
    ]);
    expect(state.requestCondition).toEqual(requestCondition);
    expect(state.operationalAdvisory).toMatchObject({ requestPending: false });
    expect((await transition(state, [])).requestCondition).toEqual(requestCondition);
  });

  const invalidEvents: GIKEvent[] = [
    { node: "strategy", name: "revise", payload: { approach: "Override", priorities: [], constraints: [] } },
    { node: "plan", name: "revise", payload: { actionId: "new-action", description: "Replace identity", status: "pending" } },
    { node: "plan", name: "revise", payload: { actionId: "collect-evidence", id: "replacement", description: "Replace identity", status: "pending" } },
    { node: "operations", name: "heartbeat", payload: { sequence: -1 } },
  ];
  it.each(invalidEvents)("rejects invalid or authority-expanding input: $node/$name", async (event) => {
    await expect(transition(initialState(), [event])).rejects.toThrow();
  });
});
