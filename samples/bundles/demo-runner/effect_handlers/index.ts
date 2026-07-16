import { setOp, type EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";
import type { ScenarioPlan, ScenarioStep } from "../../../shared/demo-runner";

type RecordValue = Record<string, Json>;

function record(value: Json): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function plan(ctx: Parameters<EffectHandlerMap[string]>[0]): ScenarioPlan {
  return ctx.get("runner.plan") as unknown as ScenarioPlan;
}

function stepAt(ctx: Parameters<EffectHandlerMap[string]>[0], index: number): ScenarioStep | undefined {
  return plan(ctx).steps[index];
}

const effects: EffectHandlerMap = {
  requestNextAct(ctx) {
    const presenter = record(ctx.get("demo.presenter"));
    const act = Number(ctx.get("demo.act") ?? 0);
    const step = stepAt(ctx, act);
    if (!step || presenter.locked === true) return { outcome: "ignored" };
    const token = Number(presenter.advanceToken ?? 0) + 1;
    const ops = [
      setOp("demo.presenter", { ...presenter, locked: true, advanceToken: token }),
    ];
    if (step.kind === "dispatch" && step.command) {
      ops.push(setOp("demo.request", {
        token,
        command: step.command,
        actorId: step.actorRef?.id ?? "",
        waitAfterMs: step.waitAfterMs ?? 0,
      }));
      ops.push(setOp(`demo.commands.${step.command}`, token));
    }
    return { outcome: step.kind === "human-gate" ? "awaiting-human" : "requested", ops };
  },

  setPace(ctx) {
    const presenter = record(ctx.get("demo.presenter"));
    const scenario = plan(ctx);
    const pace = (ctx.payload.pace ?? ctx.payload.value) === "auto" ? "auto" : "manual";
    return {
      outcome: "updated",
      ops: [setOp("demo.presenter", {
        ...presenter,
        pace,
        durationMs: pace === "auto" ? scenario.pace.autoDurationMs : scenario.pace.manualDurationMs,
      })],
    };
  },

  finishAct(ctx) {
    const presenter = record(ctx.get("demo.presenter"));
    const request = record(ctx.get("demo.request"));
    const ack = record(ctx.get("demo.ack"));
    if (request.command === "$reset" || request.token !== ack.token) return { outcome: "ignored" };
    const nextAct = Math.min(Number(ctx.get("demo.act") ?? 0) + 1, plan(ctx).steps.length);
    return {
      outcome: "settled",
      ops: [
        setOp("demo.act", nextAct),
        setOp("demo.presenter", { ...presenter, locked: nextAct >= plan(ctx).steps.length }),
        setOp("demo.request", null),
      ],
    };
  },

  resetDemo(ctx) {
    const scenario = plan(ctx);
    const presenter = record(ctx.get("demo.presenter"));
    const token = Number(presenter.advanceToken ?? 0) + 1;
    return {
      outcome: "reset",
      ops: [
        setOp("demo.act", 0),
        setOp("demo.presenter", {
          pace: scenario.pace.default,
          durationMs: scenario.pace.default === "auto" ? scenario.pace.autoDurationMs : scenario.pace.manualDurationMs,
          locked: false,
          advanceToken: token,
        }),
        setOp("demo.request", { token, command: "$reset", actorId: "", waitAfterMs: 0 }),
        setOp("demo.commands.reset", token),
      ],
    };
  },
};

export default effects;
