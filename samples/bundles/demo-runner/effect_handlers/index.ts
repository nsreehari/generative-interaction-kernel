import { setOp, type EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";
import type { ScenarioPlan, ScenarioStep, TimelineItem } from "../../../shared/demo-runner";

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

function timeline(ctx: Parameters<EffectHandlerMap[string]>[0]): TimelineItem[] {
  const value = ctx.get("demo.timeline");
  return Array.isArray(value) ? value as unknown as TimelineItem[] : [];
}

const effects: EffectHandlerMap = {
  requestNextAct(ctx) {
    const presenter = record(ctx.get("demo.presenter"));
    const act = Number(ctx.get("demo.act") ?? 0);
    const step = stepAt(ctx, act);
    if (!step || presenter.locked === true) return { outcome: "ignored" };
    const token = Number(presenter.advanceToken ?? 0) + 1;
    const correlationId = `${plan(ctx).id}:${step.id}:${token}`;
    const scenarioItem: TimelineItem = {
      id: `scenario:${correlationId}`,
      source: "scenario",
      title: step.title,
      summary: step.kind === "human-gate" ? "Awaiting governed human authorization" : `Dispatch ${step.command}`,
      status: step.kind === "human-gate" ? "awaiting-human" : "requested",
      scenarioStepId: step.id,
      sequence: act + 1,
      actorRef: step.actorRef ?? step.humanBoundary,
      focusRefs: [step.actorRef ?? step.humanBoundary, ...(step.focusRefs ?? [])].filter(Boolean) as TimelineItem["focusRefs"],
      correlationId,
    };
    const ops = [
      setOp("demo.presenter", { ...presenter, locked: true, advanceToken: token }),
      setOp("demo.timeline", [...timeline(ctx), scenarioItem] as unknown as Json),
    ];
    if (step.kind === "dispatch" && step.command) {
      ops.push(setOp("demo.request", {
        token,
        command: step.command,
        actorId: step.actorRef?.id ?? "",
        waitAfterMs: step.waitAfterMs ?? 0,
        correlationId,
      }));
      ops.push(setOp(`demo.commands.${step.command}`, token));
    } else if (step.kind === "human-gate") {
      ops.push(setOp("demo.request", {
        token,
        command: "$human-gate",
        actorId: step.humanBoundary?.id ?? "",
        waitAfterMs: step.waitAfterMs ?? 0,
        correlationId,
      }));
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
    const correlationId = String(request.correlationId ?? "");
    const nextTimeline = timeline(ctx).map((item) => item.correlationId === correlationId && item.source === "scenario"
      ? { ...item, status: "complete", summary: "Scenario step completed" }
      : item);
    return {
      outcome: "settled",
      ops: [
        setOp("demo.act", nextAct),
        setOp("demo.presenter", { ...presenter, locked: nextAct >= plan(ctx).steps.length }),
        setOp("demo.request", null),
        setOp("demo.timeline", nextTimeline as unknown as Json),
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
        setOp("demo.timeline", []),
        setOp("demo.selection", null),
      ],
    };
  },
};

export default effects;
