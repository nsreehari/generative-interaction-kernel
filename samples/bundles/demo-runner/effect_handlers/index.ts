import { setOp, type EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";
import { scenarioStepCommands, type PresentationPreset, type ScenarioPlan, type ScenarioStep, type TimelineItem } from "../../../shared/demo-runner";
import type { ControlReceipt } from "../../../shared/control-runtime";

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
    const commands = scenarioStepCommands(step);
    const scenarioItem: TimelineItem = {
      id: `scenario:${correlationId}`,
      source: "scenario",
      title: step.title,
      summary: step.kind === "human-gate" ? "Awaiting governed human authorization" : commands.length > 1 ? `Dispatch ${commands.length} stitched operations` : `Dispatch ${commands[0]}`,
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
    if (step.kind === "dispatch" && commands[0]) {
      const request = {
        id: correlationId,
        targetBlueprintId: plan(ctx).targetBlueprintId,
        token,
        command: commands[0],
        commands,
        commandIndex: 0,
        actorId: step.actorRef?.id ?? "",
        payload: step.payload ?? {},
        waitAfterMs: step.waitAfterMs ?? 0,
        correlationId,
      };
      ops.push(setOp("demo.request", request));
      ops.push(setOp("control.request", request));
      ops.push(setOp(`control.commands.${commands[0]}`, token));
    } else if (step.kind === "human-gate") {
      const request = {
        id: correlationId,
        targetBlueprintId: plan(ctx).targetBlueprintId,
        token,
        command: "$human-gate",
        commands,
        commandIndex: 0,
        actorId: step.humanBoundary?.id ?? "",
        waitAfterMs: step.waitAfterMs ?? 0,
        correlationId,
      };
      ops.push(setOp("demo.request", request));
      ops.push(setOp("control.request", request));
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

  selectDemo(ctx) {
    const value = String(ctx.payload.value ?? "");
    return value
      ? { outcome: "selected", ops: [setOp("runner.selectedDemoId", value)] }
      : { outcome: "ignored" };
  },

  setPresentationContext(ctx) {
    const value = String(ctx.payload.value ?? "");
    const presets = ctx.get("runner.presentationPresets");
    const preset = Array.isArray(presets)
      ? (presets as unknown as PresentationPreset[]).find((candidate) => candidate.id === value)
      : undefined;
    return preset
      ? {
          outcome: "selected",
          ops: [
            setOp("control.presentationPresetId", preset.id),
            setOp("control.presentationContext", preset.context),
            setOp("control.inspection.presentation.selectedContext", preset.id),
          ],
        }
      : { outcome: "ignored" };
  },

  finishAct(ctx) {
    const presenter = record(ctx.get("demo.presenter"));
    const request = record(ctx.get("demo.request"));
    const receipt = record(ctx.get("control.receipt")) as unknown as ControlReceipt;
    if (request.command === "$reset" || request.token !== receipt.token || request.command !== receipt.command || receipt.status !== "completed") return { outcome: "ignored" };
    const result = record(receipt.result as Json);
    const resultItem: TimelineItem | undefined = Object.keys(result).length > 0 ? {
      id: `organism:${String(result.id ?? receipt.requestId)}`,
      source: "organism",
      title: String(result.result ?? receipt.outcome ?? "completed"),
      summary: String(result.summary ?? ""),
      status: String(result.result ?? receipt.status),
      operationRecordId: String(result.id ?? ""),
      timestamp: String(result.time ?? ""),
      actorRef: { namespace: "soc", kind: "actor", id: String(result.actorId ?? ""), relation: "origin" },
      focusRefs: [
        { namespace: "soc", kind: "actor", id: String(result.actorId ?? ""), relation: "origin" },
        ...(Array.isArray(result.affected) ? result.affected : []).map((id) => ({ namespace: "soc", kind: "record" as const, id: String(id), relation: "affected" as const })),
      ],
      correlationId: String(request.correlationId ?? ""),
    } : undefined;
    const commands = Array.isArray(request.commands) ? request.commands.map(String) : [String(request.command ?? "")];
    const commandIndex = Number(request.commandIndex ?? 0);
    const nextCommand = commands[commandIndex + 1];
    if (nextCommand) {
      return {
        outcome: "continued",
        ops: [
          ...(resultItem ? [setOp("demo.timeline", [...timeline(ctx), resultItem] as unknown as Json)] : []),
          setOp("demo.request", {
            ...request,
            command: nextCommand,
            commandIndex: commandIndex + 1,
          }),
          setOp("control.request", { ...request, command: nextCommand, commandIndex: commandIndex + 1 }),
          setOp(`control.commands.${nextCommand}`, request.token),
        ],
      };
    }
    const nextAct = Math.min(Number(ctx.get("demo.act") ?? 0) + 1, plan(ctx).steps.length);
    const correlationId = String(request.correlationId ?? "");
    const nextTimeline = timeline(ctx).map((item) => item.correlationId === correlationId && item.source === "scenario"
      ? { ...item, status: "complete", summary: "Scenario step completed" }
      : item);
    if (resultItem) nextTimeline.push(resultItem);
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
        setOp("demo.request", { id: `${scenario.id}:reset:${token}`, targetBlueprintId: scenario.targetBlueprintId, token, command: "$reset", actorId: "", waitAfterMs: 0 }),
        setOp("control.request", { id: `${scenario.id}:reset:${token}`, targetBlueprintId: scenario.targetBlueprintId, token, command: "$reset", actorId: "", waitAfterMs: 0 }),
        setOp("control.commands.reset", token),
        setOp("demo.timeline", []),
        setOp("demo.selection", null),
      ],
    };
  },
};

export default effects;
