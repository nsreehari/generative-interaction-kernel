import React from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Persona,
  Select,
  Spinner,
  Switch,
  Tab,
  TabList,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowReset24Regular,
  CheckmarkCircle20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Clock20Regular,
  DataTrending24Regular,
  DismissCircle20Regular,
  Person24Regular,
  QuestionCircle20Regular,
  Sparkle24Regular,
  WeatherMoon20Regular,
} from "@fluentui/react-icons";
import type { Json } from "@gik/kernel";
import {
  bundleFromJson,
  readProps,
  setOp,
  useCountdownTimer,
  type Bundle,
  type EffectHandlerMap,
  type ProjectionView,
  type ProjectionViewProps,
} from "@gik/react";
import {
  selectionContainsFocus,
  selectionFromTimelineItem,
  type ControlSelection,
  type TimelineItem,
} from "./control-focus";
import type {
  BlueprintInspection,
  InspectionParticipant,
  InspectionStatus,
  ParticipantStatus,
  ParticipantToggleSetting,
} from "./control-inspection";
import type { ControlReceipt, ControlRequest } from "./control-runtime";
import {
  GIK_DEMO_RESET_STATE_COMMAND,
  isBuiltInDemoCommand,
  scenarioStepCommands,
  writeDemoNavigation,
  type DemoCatalogEntry,
  type PresentationPreset,
  type ScenarioPlan,
  type ScenarioStep,
} from "./demo-runner";

type RecordValue = Record<string, Json>;

type DemoState = {
  act: number;
  presenter: {
    locked: boolean;
  };
  request?: ControlRequest | null;
};

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

const demoRunnerEffects: EffectHandlerMap = {
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
      summary: step.kind === "human-gate"
        ? "Awaiting governed human authorization"
        : commands.length > 1
          ? `Dispatch ${commands.length} stitched operations`
          : `Dispatch ${commands[0]}`,
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
      if (!isBuiltInDemoCommand(commands[0])) {
        ops.push(setOp(`control.commands.${commands[0]}`, token));
      }
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
    return value ? { outcome: "selected", ops: [setOp("runner.selectedDemoId", value)] } : { outcome: "ignored" };
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
    if (request.token !== receipt.token || request.command !== receipt.command || receipt.status !== "completed") {
      return { outcome: "ignored" };
    }
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
          setOp("demo.request", { ...request, command: nextCommand, commandIndex: commandIndex + 1 }),
          setOp("control.request", { ...request, command: nextCommand, commandIndex: commandIndex + 1 }),
          ...(!isBuiltInDemoCommand(nextCommand) ? [setOp(`control.commands.${nextCommand}`, request.token)] : []),
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
    const request = {
      id: `${scenario.id}:reset:${token}`,
      targetBlueprintId: scenario.targetBlueprintId,
      token,
      command: GIK_DEMO_RESET_STATE_COMMAND,
      actorId: "",
      waitAfterMs: 0,
    };
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
        setOp("demo.request", null),
        setOp("control.request", request),
        setOp("demo.timeline", []),
        setOp("demo.selection", null),
      ],
    };
  },
};

const shellColors = {
  line: "#abc1ca",
  panel: "#f7fbfc",
  panel2: "#e7f0f3",
  accent: "#315f72",
  text: "#15313c",
  muted: "#5f7681",
  good: "#25664a",
  bad: "#9a2e2e",
  warning: "#8a5b00",
};

const useOverlayStyles = makeStyles({
  runnerDrawer: {
    position: "fixed",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(126, 91, 45, .38)",
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0`,
    backgroundColor: "rgba(255, 239, 211, .78)",
    backgroundImage: "linear-gradient(100deg, rgba(255, 255, 255, .42), rgba(255, 255, 255, .08) 42%, rgba(186, 120, 28, .06))",
    boxShadow: "0 -4px 8px rgba(92, 65, 30, .12), 0 -12px 28px rgba(92, 65, 30, .1)",
    backdropFilter: "blur(18px) saturate(135%)",
    overflow: "hidden",
    transitionProperty: "box-shadow, background-color",
    transitionDuration: "220ms",
    transitionTimingFunction: "cubic-bezier(.33, 0, .1, 1)",
    "&:focus-within": { boxShadow: "0 -6px 12px rgba(92, 65, 30, .14), 0 -16px 34px rgba(92, 65, 30, .13)" },
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  runnerExpanded: {},
  runnerCollapsed: { right: "auto", width: "auto", maxWidth: "100vw" },
  runnerHeader: {
    minHeight: "64px",
    display: "grid",
    gridTemplateColumns: "auto minmax(220px, 1fr) minmax(420px, 560px) auto auto",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `0 ${tokens.spacingHorizontalM} 0 0`,
    backgroundColor: "transparent",
    "@media (max-width: 1100px)": { gridTemplateColumns: "auto minmax(160px, 1fr) auto auto" },
  },
  runnerHeaderCollapsed: { gridTemplateColumns: "auto minmax(220px, auto) auto", paddingRight: tokens.spacingHorizontalXS },
  runnerToggle: {
    alignSelf: "stretch",
    minWidth: "48px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM}`,
    border: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    color: shellColors.text,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    "&:hover": { backgroundColor: "rgba(49, 95, 114, .08)" },
    "&:focus-visible": { outline: `2px solid ${shellColors.accent}`, outlineOffset: "-2px" },
  },
  runnerTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  runnerActBar: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXXS },
  runnerActNumber: { color: shellColors.muted, fontSize: tokens.fontSizeBase100, textTransform: "uppercase", fontWeight: tokens.fontWeightSemibold },
  runnerActTitle: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    "@media (max-width: 600px)": { display: "-webkit-box", whiteSpace: "normal", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 },
  },
  runnerDots: { display: "flex", gap: tokens.spacingHorizontalXS, marginTop: tokens.spacingVerticalXXS },
  runnerDot: { width: "12px", height: "4px", backgroundColor: "var(--line)" },
  runnerDotDone: { backgroundColor: tokens.colorBrandBackground },
  runnerFields: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    "@media (max-width: 1100px)": { display: "none" },
  },
  runnerField: { minWidth: 0 },
  runnerSelect: {
    width: "100%",
    minHeight: "36px",
    paddingInline: tokens.spacingHorizontalS,
    border: "1px solid transparent",
    borderBottom: "1px solid rgba(126, 91, 45, .26)",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: "transparent",
    color: "color-mix(in srgb, var(--text) 82%, transparent)",
    boxShadow: "none",
    fontSize: tokens.fontSizeBase200,
    transitionProperty: "border-color, box-shadow, background-color",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease-out",
    "&:hover": {
      border: "1px solid rgba(126, 91, 45, .18)",
      borderBottom: "1px solid rgba(126, 91, 45, .48)",
      backgroundColor: "rgba(255, 255, 255, .28)",
      boxShadow: "none",
    },
    "&:focus-visible": { outline: "2px solid var(--colorStrokeFocus2)", outlineOffset: "2px" },
  },
  runnerControls: { display: "flex", alignItems: "center" },
  floorControls: {
    minWidth: "118px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    "& > button": { minHeight: "32px" },
    "& .gx-btn": { minWidth: "118px" },
  },
  floorControlsCompact: {
    minWidth: "60px",
    paddingLeft: tokens.spacingHorizontalXS,
    "& .gx-fluent-toggle": {
      minWidth: "72px",
      height: "34px",
      border: "1px solid rgba(15, 108, 189, .34)",
      borderRadius: tokens.borderRadiusCircular,
      backgroundColor: "rgba(255, 255, 255, .64)",
      color: "#0b5c96",
      fontWeight: tokens.fontWeightSemibold,
      boxShadow: "0 1px 3px rgba(0, 71, 120, .1)",
      transitionProperty: "transform, box-shadow, background-color, color",
      transitionDuration: "120ms",
      transitionTimingFunction: "ease-out",
      "&[aria-pressed=true]": {
        border: "1px solid rgba(15, 108, 189, .58)",
        backgroundColor: "rgba(15, 108, 189, .14)",
        color: "#084b7a",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, .42), 0 2px 5px rgba(0, 71, 120, .14)",
      },
      "&:hover:not(:disabled)": { transform: "translateY(-1px)", backgroundColor: "rgba(15, 108, 189, .2)", boxShadow: "0 4px 10px rgba(0, 71, 120, .16)" },
      "&:active:not(:disabled)": { transform: "translateY(0)", boxShadow: "0 1px 2px rgba(0, 71, 120, .12)" },
      "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
    },
    "& .gx-timer-label": { display: "none" },
    "& .gx-timer-separator": { display: "none" },
    "& .gx-btn.gx-btn-primary": {
      width: "54px",
      minWidth: "54px",
      height: "36px",
      minHeight: "36px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px",
      padding: "0 5px",
      border: 0,
      borderRadius: tokens.borderRadiusCircular,
      boxShadow: "0 2px 4px rgba(0, 71, 120, .22), 0 5px 12px rgba(0, 71, 120, .18)",
      transitionProperty: "transform, box-shadow, background-color",
      transitionDuration: "120ms",
      transitionTimingFunction: "ease-out",
      "&::after": {
        content: '""',
        width: "7px",
        height: "7px",
        flex: "0 0 7px",
        marginRight: "1px",
        borderTop: "2px solid currentColor",
        borderRight: "2px solid currentColor",
        transform: "rotate(45deg)",
      },
      "&:hover:not(:disabled)": { transform: "translateY(-1px)", boxShadow: "0 3px 6px rgba(0, 71, 120, .24), 0 8px 18px rgba(0, 71, 120, .2)" },
      "&:active:not(:disabled)": { transform: "translateY(0)", boxShadow: "0 1px 2px rgba(0, 71, 120, .22)" },
      "&:focus-visible": { outline: "2px solid var(--colorStrokeFocus2)", outlineOffset: "2px" },
      "&:disabled": {
        backgroundColor: "rgba(15, 108, 189, .12)",
        color: "#5f7681",
        boxShadow: "none",
        opacity: 1,
      },
      "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
    },
    "& .gx-btn.gx-btn-primary .gx-timer-count": {
      minWidth: "16px",
      flex: "0 0 16px",
      display: "inline-grid",
      placeItems: "center",
      fontSize: tokens.fontSizeBase200,
      fontWeight: tokens.fontWeightSemibold,
      fontVariantNumeric: "tabular-nums",
      lineHeight: "16px",
      color: "currentColor",
    },
  },
  floorControlsCollapsed: { "& .gx-fluent-toggle": { display: "none" } },
  harness: {
    transitionProperty: "box-shadow",
    transitionDuration: "220ms",
    transitionTimingFunction: "cubic-bezier(.33, 0, .1, 1)",
    "&:focus-within": {
      boxShadow: "-4px 4px 8px rgba(31, 67, 83, .16), -18px 22px 42px rgba(31, 67, 83, .2)",
    },
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  contextStrip: {
    position: "fixed",
    top: 0,
    right: 0,
    zIndex: 35,
    width: "max-content",
    maxWidth: "100vw",
    minHeight: "56px",
    display: "flex",
    alignItems: "stretch",
    border: "1px solid color-mix(in srgb, #315f72 42%, #c9cecf)",
    borderTop: 0,
    borderRight: 0,
    borderRadius: `0 0 0 ${tokens.borderRadiusMedium}`,
    backgroundColor: "rgba(246, 247, 245, .5)",
    boxShadow: "inset 0 -2px 0 rgba(49, 95, 114, .18), -3px 4px 10px rgba(31, 67, 83, .12)",
    backdropFilter: "blur(16px) saturate(80%)",
    overflow: "hidden",
  },
  harnessPanel: { minHeight: 0, overflow: "hidden", backgroundColor: shellColors.panel },
  harnessJournalPanel: { height: "100%", minWidth: 0, minHeight: 0, padding: "14px", boxSizing: "border-box" },
  harnessScrollPanel: { minWidth: 0, minHeight: "100%", padding: "14px", boxSizing: "border-box" },
  eyebrow: { color: shellColors.muted, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  sharedTitle: { margin: 0, fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700, color: shellColors.text },
  sharedSubhead: { margin: 0, color: shellColors.muted },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusCircular,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: "rgba(230, 244, 234, .85)",
    color: shellColors.good,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    alignSelf: "start",
  },
  blueprintIntro: { display: "grid", gap: tokens.spacingVerticalM, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" },
  contextMatrix: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  contextChip: {
    borderRadius: tokens.borderRadiusCircular,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${shellColors.line}`,
    backgroundColor: "#fff",
    color: shellColors.text,
    fontSize: tokens.fontSizeBase200,
  },
  contextChipActive: { backgroundColor: shellColors.panel2, boxShadow: `inset 0 0 0 2px ${shellColors.accent}` },
  blueprintContextContract: { display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: tokens.spacingHorizontalL, border: `1px solid ${shellColors.line}`, borderRadius: tokens.borderRadiusMedium, background: "rgba(255,255,255,.72)", padding: tokens.spacingVerticalM },
  blueprintContextIdentity: { display: "grid", gap: tokens.spacingVerticalXXS, alignContent: "start" },
  blueprintKind: { color: shellColors.muted, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  blueprintContextBody: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: tokens.spacingHorizontalM },
  blueprintContextField: { display: "grid", gap: tokens.spacingVerticalXXS, color: shellColors.muted, fontSize: tokens.fontSizeBase200 },
  blueprintContextValue: { color: shellColors.text, fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  blueprintPipeline: { display: "grid", gap: tokens.spacingVerticalS },
  blueprintStage: { display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: tokens.spacingHorizontalL, border: `1px solid ${shellColors.line}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingVerticalM, background: "rgba(255,255,255,.78)" },
  blueprintStageIdentity: { display: "grid", gap: tokens.spacingVerticalXXS, alignContent: "start" },
  blueprintLayer: { color: shellColors.text, fontWeight: tokens.fontWeightSemibold },
  blueprintStageBody: { display: "grid", gap: tokens.spacingVerticalS },
  blueprintRecipe: { color: shellColors.text, fontWeight: tokens.fontWeightSemibold },
  blueprintOutput: { margin: 0, padding: tokens.spacingVerticalS, borderRadius: tokens.borderRadiusMedium, background: "rgba(21, 49, 60, .06)", color: shellColors.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "Consolas, monospace", fontSize: tokens.fontSizeBase200 },
  sectionTitle: { margin: 0, color: shellColors.text },
  blueprintResources: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: tokens.spacingHorizontalS },
  blueprintResource: { display: "grid", gap: tokens.spacingVerticalXXS, border: `1px solid ${shellColors.line}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingVerticalM, background: "rgba(255,255,255,.72)", color: shellColors.muted },
  blueprintResourceValue: { color: shellColors.text, fontWeight: tokens.fontWeightSemibold },
  journalRail: { height: "100%", minHeight: 0 },
  journalSticky: { position: "sticky", top: 0, display: "grid", gap: tokens.spacingVerticalM },
  journalHeader: { display: "flex", justifyContent: "space-between", gap: tokens.spacingHorizontalM, alignItems: "start" },
  journalTabs: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  journalList: { display: "grid", gap: tokens.spacingVerticalS },
  empty: { display: "grid", justifyItems: "start", gap: tokens.spacingVerticalXS, color: shellColors.muted, padding: tokens.spacingVerticalM, border: `1px dashed ${shellColors.line}`, borderRadius: tokens.borderRadiusMedium },
  fallback: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS, color: shellColors.good },
  journalEntry: { textAlign: "left", border: `1px solid ${shellColors.line}`, background: "rgba(255,255,255,.82)", borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingVerticalM, display: "grid", gap: tokens.spacingVerticalXXS, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,49,60,.06)" },
  journalEntryActive: { background: shellColors.panel2, boxShadow: `inset 0 0 0 2px ${shellColors.accent}` },
  journalTime: { color: shellColors.muted, fontSize: tokens.fontSizeBase100 },
  journalResult: { fontSize: tokens.fontSizeBase100, color: shellColors.muted },
  journalSummary: { color: shellColors.text },
  ledgerMeta: { marginTop: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase100, color: shellColors.muted, overflowWrap: "anywhere" },
  compact: { minWidth: 0, display: "flex", alignItems: "stretch" },
  compactContent: { minWidth: 0, minHeight: "55px", display: "flex", alignItems: "center", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, color: shellColors.text },
  summaries: { minWidth: 0, display: "flex", justifyContent: "center", gap: tokens.spacingHorizontalS, overflow: "hidden", "@media (max-width: 620px)": { display: "none" } },
  compactPersona: { width: "128px", minWidth: "128px", borderRadius: tokens.borderRadiusMedium, boxSizing: "border-box", "& > div:last-child": { minWidth: 0 }, "& .fui-Persona__primaryText": { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular }, "& span": { textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" } },
  compactPersonaActive: { backgroundColor: "rgba(49, 95, 114, .14)", boxShadow: "inset 0 0 0 1px rgba(49, 95, 114, .42), inset 0 -2px 0 #315f72" },
  compactStatus: { minWidth: 0, color: shellColors.muted, fontSize: tokens.fontSizeBase100 },
  statusIcon: { width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: shellColors.muted },
  statusWorking: { color: shellColors.accent },
  statusAttention: { color: shellColors.warning },
  statusComplete: { color: shellColors.good },
  statusError: { color: shellColors.bad },
  participants: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalL },
  group: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalS },
  groupTitle: { margin: 0, color: shellColors.muted, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  grid: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalS },
  card: { position: "relative", minWidth: 0, padding: tokens.spacingVerticalM, border: `1px solid ${shellColors.line}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: shellColors.panel, boxShadow: "0 6px 18px rgba(21,49,60,.06)" },
  cardActive: { backgroundColor: "color-mix(in srgb, #315f72 9%, #f7fbfc)", outline: `2px solid ${shellColors.accent}`, outlineOffset: "-2px" },
  persona: { minWidth: 0, "& > div:last-child": { minWidth: 0 }, "& span": { overflowWrap: "anywhere" } },
  details: { marginTop: tokens.spacingVerticalS, color: shellColors.muted, fontSize: tokens.fontSizeBase100, "& summary": { width: "fit-content", color: shellColors.text, cursor: "pointer" }, "& ul": { margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: tokens.spacingHorizontalL } },
  setting: { marginTop: tokens.spacingVerticalS, paddingTop: tokens.spacingVerticalS, borderTop: `1px solid ${shellColors.line}` },
  settingMessage: { color: shellColors.muted, fontSize: tokens.fontSizeBase100, overflowWrap: "anywhere" },
});

function isToggleOn(value: unknown, onValue: unknown): boolean {
  if (value === onValue) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (typeof onValue === "boolean") {
      return onValue ? normalized === "true" || normalized === "1" || normalized === "on" : normalized === "false" || normalized === "0" || normalized === "off";
    }
    if (typeof onValue === "string") {
      return normalized === onValue.trim().toLowerCase();
    }
  }
  return false;
}

function ViewportPortal({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [target, setTarget] = React.useState<Element | null>(null);
  React.useLayoutEffect(() => {
    setTarget(anchorRef.current?.closest(".fui-FluentProvider") ?? document.body);
  }, []);
  if (typeof document === "undefined") return null;
  return (
    <>
      <span ref={anchorRef} hidden />
      {target ? createPortal(children, target) : null}
    </>
  );
}

function statusLabel(status: ParticipantStatus): string {
  return status.replaceAll("-", " ");
}

function statusBadge(status: ParticipantStatus): string {
  if (status === "working") return "working";
  if (status === "waiting") return "waiting";
  if (status === "input-required") return "needs input";
  if (status === "inactive") return "inactive";
  if (status === "error") return "error";
  if (status === "completed") return "done";
  return "ready";
}

const NativeDropdown: ProjectionView = ({ node, emit }) => {
  const styles = useOverlayStyles();
  const value = node.props.value;
  const options = Array.isArray(node.props.options) ? node.props.options as Array<Record<string, unknown>> : [];
  const placeholder = typeof node.props.placeholder === "string" ? node.props.placeholder : "Select";
  const ariaLabel = typeof node.props.ariaLabel === "string" ? node.props.ariaLabel : placeholder;
  return (
    <div className={styles.runnerField}>
      <Select
        className={styles.runnerSelect}
        aria-label={ariaLabel}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => emit("select", { value: event.currentTarget.value })}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const id = typeof option.id === "string" ? option.id : "";
          const label = typeof option.label === "string" ? option.label : id;
          return <option key={id} value={id}>{label}</option>;
        })}
      </Select>
    </div>
  );
};

const NativeToggle: ProjectionView = ({ node, emit }) => {
  const styles = useOverlayStyles();
  if (node.props.hidden === true) return null;
  const value = node.props.value;
  const onValue = node.props.onValue ?? "on";
  const offValue = node.props.offValue ?? "off";
  const checked = isToggleOn(value, onValue);
  const label = checked ? String(node.props.onLabel ?? onValue) : String(node.props.offLabel ?? offValue);
  return (
    <Button
      type="button"
      size="small"
      appearance="subtle"
      className={mergeClasses("gx-fluent-toggle", styles.runnerControls)}
      aria-pressed={checked}
      onClick={() => emit("toggle", { value: checked ? offValue : onValue })}
    >
      {label}
    </Button>
  );
};

const timerDeadlines = new Map<string, { durationMs: number; deadline: number }>();

function TimerButton({ node, emit }: ProjectionViewProps) {
  const styles = useOverlayStyles();
  const p = readProps(node);
  const label = p.str("label");
  const configuredDuration = Number(node.props.durationMs ?? node.props.duration ?? 3000);
  const durationMs = Number.isFinite(configuredDuration) ? Math.max(250, configuredDuration) : 3000;
  const disabled = p.bool("disabled");
  const tone = p.str("tone", "default");
  const advanceToken = node.props.advanceToken ?? 0;
  const timerKey = `${node.id}:${String(advanceToken)}`;
  const countdownDurationMs = React.useMemo(() => {
    const stored = timerDeadlines.get(timerKey);
    const deadline = stored?.durationMs === durationMs ? stored.deadline : Date.now() + durationMs;
    timerDeadlines.set(timerKey, { durationMs, deadline });
    if (timerDeadlines.size > 100) timerDeadlines.delete(timerDeadlines.keys().next().value!);
    return Math.max(250, deadline - Date.now());
  }, [durationMs, timerKey]);
  const running = node.props.autoStart !== false && !disabled;
  const timer = useCountdownTimer({
    durationMs: countdownDurationMs,
    running,
    resetKey: advanceToken,
    onElapsed: () => {
      emit("press", { reason: "timeout" });
      timer.restart();
    },
  });

  const press = () => {
    emit("press", { reason: "manual" });
    timer.restart();
  };

  return (
    <Button
      type="button"
      size="small"
      disabled={disabled}
      appearance={tone === "primary" ? "primary" : "secondary"}
      className={mergeClasses(`gx-btn gx-btn-${tone}`, styles.runnerControls)}
      aria-label={`${label}, ${timer.remainingSeconds} seconds remaining`}
      onClick={press}
    >
      <span className="gx-timer-label">{label}</span>
      {node.props.showCountdown !== false ? <>
        <span className="gx-timer-separator" aria-hidden="true"> · </span>
        <span className="gx-timer-count">{timer.remainingSeconds}</span>
      </> : null}
    </Button>
  );
}

const DemoRunner: ProjectionView = ({ node, emit, children }) => {
  const styles = useOverlayStyles();
  const demo = node.props.demo as unknown as DemoState;
  const planValue = node.props.plan as unknown as ScenarioPlan;
  const catalog = (node.props.catalog ?? []) as unknown as DemoCatalogEntry[];
  const entry = node.props.entry as unknown as DemoCatalogEntry;
  const selectedDemoId = String(node.props.selectedDemoId ?? "");
  const [expanded, setExpanded] = React.useState(false);
  const processedAckRef = React.useRef("");
  const act = Number(demo.act ?? 0);
  const complete = act >= planValue.steps.length;
  const displayAct = Math.min(act + 1, planValue.steps.length);
  const controls = React.Children.toArray(children);
  const demoDropdown = controls[0];
  const presentationDropdown = controls[1];
  const floorControls = controls.slice(2);

  React.useEffect(() => {
    const request = demo.request;
    const receipt = node.props.receipt as unknown as { token?: number; command?: string; status?: string } | undefined;
    if (!request || request.command === "$reset" || !receipt || receipt.token !== request.token || receipt.command !== request.command || receipt.status !== "completed") return;
    const ackKey = `${receipt.token}:${receipt.command}`;
    if (processedAckRef.current === ackKey) return;
    processedAckRef.current = ackKey;
    const timer = window.setTimeout(() => {
      void emit("finishAct", {});
    }, request.waitAfterMs ?? 0);
    return () => window.clearTimeout(timer);
  }, [demo.request, emit, node.props.receipt]);

  React.useEffect(() => {
    if (!selectedDemoId || selectedDemoId === entry.id) return;
    const selected = catalog.find((item) => item.id === selectedDemoId);
    if (selected) window.location.assign(writeDemoNavigation(window.location.href, selected));
  }, [catalog, entry.id, selectedDemoId]);

  return (
    <ViewportPortal>
      <aside
        aria-label="Scenario runner"
        className={mergeClasses(styles.runnerDrawer, expanded ? styles.runnerExpanded : styles.runnerCollapsed)}
        style={{
          width: expanded ? "100%" : "max-content",
          right: expanded ? 0 : "auto",
          ["--accent" as string]: shellColors.accent,
          ["--text" as string]: shellColors.text,
          ["--muted" as string]: shellColors.muted,
          ["--line" as string]: shellColors.line,
        } as React.CSSProperties}
      >
      <div className={mergeClasses(styles.runnerHeader, !expanded ? styles.runnerHeaderCollapsed : undefined)}>
        <button
          type="button"
          className={styles.runnerToggle}
          aria-label={expanded ? "Collapse scenario runner" : "Expand scenario runner"}
          title={expanded ? "Collapse scenario runner" : "Expand scenario runner"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronLeft20Regular /> : <ChevronRight20Regular />}
          {expanded ? <span className={styles.runnerTitle}><DataTrending24Regular />Scenario runner</span> : null}
        </button>
        <section className={styles.runnerActBar} aria-live="polite">
          <div className={styles.runnerActNumber}>{complete ? "Journey complete" : `Act ${displayAct} of ${planValue.steps.length}`}</div>
          <p className={styles.runnerActTitle}>{complete ? `${planValue.title} complete` : planValue.steps[act]?.title}</p>
          <div className={styles.runnerDots} aria-hidden="true">
            {planValue.steps.map((step, index) => <span key={step.id} className={mergeClasses(styles.runnerDot, index < act || complete ? styles.runnerDotDone : undefined)} />)}
          </div>
        </section>
        {expanded ? <div className={styles.runnerFields}>{demoDropdown}{presentationDropdown}</div> : null}
        {expanded ? <div className={styles.runnerControls}>
          <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" disabled={demo.presenter.locked} onClick={() => { processedAckRef.current = ""; emit("reset", {}); }} />
        </div> : null}
        <div className={mergeClasses(styles.floorControls, styles.floorControlsCompact, !expanded ? styles.floorControlsCollapsed : undefined)}>{floorControls}</div>
      </div>
      </aside>
    </ViewportPortal>
  );
};

function GrowingContainer({ children, ariaLabel }: { children?: React.ReactNode; ariaLabel?: string }) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={viewportRef} role={ariaLabel ? "region" : undefined} aria-label={ariaLabel} style={{ overflow: "auto", minHeight: 0, height: "100%" }}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

const ControlHarnessShell: ProjectionView = ({ node, emit, children }) => {
  const styles = useOverlayStyles();
  const harnessRef = React.useRef<HTMLElement>(null);
  const requestedTab = String(node.props.activeTab ?? "journal");
  const activeTab = requestedTab === "blueprint" || requestedTab === "participants" ? requestedTab : "journal";
  const expanded = node.props.expanded !== false;
  const visible = isToggleOn(node.props.visible, true);
  const panels = React.Children.toArray(children);
  const activePanel = activeTab === "blueprint" ? panels[0] : activeTab === "participants" ? panels[2] : panels[1];

  if (!visible) return null;

  const toggleExpanded = () => {
    const harness = harnessRef.current;
    const startBounds = harness?.getBoundingClientRect();
    const nextExpanded = !expanded;
    if (harness && startBounds && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const endWidth = nextExpanded ? Math.min(500, document.documentElement.clientWidth - 32) : 48;
      const endHeight = nextExpanded ? window.innerHeight - 136 : 48;
      harness.getAnimations().forEach((animation) => animation.cancel());
      harness.animate(
        [
          { width: `${startBounds.width}px`, height: `${startBounds.height}px` },
          { width: `${endWidth}px`, height: `${endHeight}px` },
        ],
        { duration: 220, easing: "cubic-bezier(.33, 0, .1, 1)" },
      );
    }
    emit("toggleHarness", { expanded: nextExpanded });
  };

  return (
    <ViewportPortal>
      <>
      <div aria-label="Harness context" className={styles.contextStrip}>
        {panels[3]}
      </div>
      <aside ref={harnessRef} aria-label="GIK control harness" className={styles.harness} style={{ position: "fixed", inset: "64px 0 72px auto", zIndex: 30, width: expanded ? "min(500px, calc(100vw - 32px))" : "48px", height: expanded ? "calc(100dvh - 136px)" : "48px", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden", border: "1px solid color-mix(in srgb, #315f72 42%, var(--line))", borderRight: 0, borderRadius: "8px 0 0 8px", background: "linear-gradient(180deg, #f9fcfd 0%, var(--panel) 28%, #f2f7f9 100%)", boxShadow: "-3px 3px 7px rgba(31, 67, 83, .14), -14px 18px 34px rgba(31, 67, 83, .16)", ["--accent" as string]: shellColors.accent, ["--panel" as string]: shellColors.panel, ["--panel-2" as string]: shellColors.panel2, ["--line" as string]: shellColors.line } as React.CSSProperties}>
        <header style={{ position: "relative", display: "grid", gap: "12px", padding: expanded ? "12px 14px 0" : 0, borderBottom: expanded ? "1px solid var(--line)" : 0, background: "color-mix(in srgb, #d7e8ee 72%, var(--panel))" }}>
          <div style={{ minHeight: "32px", display: "flex", alignItems: "center", paddingRight: "44px" }}>
            {expanded ? <strong>GIK control harness</strong> : null}
            <Button
              appearance="primary"
              icon={expanded ? <ChevronRight20Regular /> : <ChevronLeft20Regular />}
              aria-label={expanded ? "Collapse control harness" : "Expand control harness"}
              title={expanded ? "Collapse control harness" : "Expand control harness"}
              style={{ position: "absolute", top: 0, right: 0, width: "44px", minWidth: "44px", height: "44px", borderRadius: "0 0 0 6px", backgroundColor: shellColors.accent, color: "white" }}
              onClick={toggleExpanded}
            />
          </div>
          {expanded ? <TabList aria-label="Control harness panels" size="small" selectedValue={activeTab} style={{ maxWidth: "100%", overflowX: "auto" }} onTabSelect={(_, data) => emit("selectTab", { tab: data.value })}>
            <Tab value="journal">Journal / Ledger</Tab>
            <Tab value="blueprint">Blueprint</Tab>
            <Tab value="participants">Participants</Tab>
          </TabList> : null}
        </header>
        {expanded ? <div role="tabpanel" aria-label={activeTab === "blueprint" ? "Blueprint" : activeTab === "participants" ? "Participants" : "Journal and Ledger"} className={styles.harnessPanel}>
          {activeTab === "journal" ? <div className={styles.harnessJournalPanel}>{activePanel}</div> : <GrowingContainer><div className={styles.harnessScrollPanel}>{activePanel}</div></GrowingContainer>}
        </div> : null}
      </aside>
      </>
    </ViewportPortal>
  );
};

const BlueprintInspector: ProjectionView = ({ node }) => {
  const styles = useOverlayStyles();
  const blueprint = node.props.blueprint as unknown as BlueprintInspection | null | undefined;
  if (!blueprint) return null;
  return (
    <div style={{ display: "grid", gap: 16, color: shellColors.text }}>
      <header className={styles.blueprintIntro}>
        <div>
          <div className={styles.eyebrow}>Executable semantic blueprint</div>
          <h2 className={styles.sharedTitle}>{blueprint.title}</h2>
          <p className={styles.sharedSubhead}>{blueprint.description}</p>
        </div>
        <span className={styles.pill}><CheckmarkCircle20Regular />{blueprint.status}</span>
      </header>
      <div className={styles.contextMatrix} aria-label="Authored presentation contexts">
        {blueprint.contextIds.map((id) => <span key={id} className={mergeClasses(styles.contextChip, id === blueprint.selectedContext ? styles.contextChipActive : undefined)}>{id}</span>)}
      </div>
      <section className={styles.blueprintContextContract} aria-label="Selected projection contract">
        <div className={styles.blueprintContextIdentity}>
          <span className={styles.blueprintKind}>Selected projection contract</span>
          <strong>{blueprint.selectedContext}</strong>
        </div>
        <div className={styles.blueprintContextBody}>
          {blueprint.fields.map((field) => <div key={field.label} className={styles.blueprintContextField}><strong>{field.label}</strong><span className={styles.blueprintContextValue}>{field.value}</span></div>)}
        </div>
      </section>
      <section className={styles.blueprintPipeline} aria-label="Blueprint lowering trace">
        {blueprint.stages.map((stage) => <article key={stage.tier} className={styles.blueprintStage}>
          <div className={styles.blueprintStageIdentity}>
            <span className={styles.blueprintKind}>{stage.kind}</span>
            <span className={styles.blueprintLayer}>{stage.tier}</span>
          </div>
          <div className={styles.blueprintStageBody}>
            <span className={styles.blueprintRecipe}>{stage.recipe}</span>
            <pre className={styles.blueprintOutput}>{stage.summary}</pre>
          </div>
        </article>)}
      </section>
      <section style={{ display: "grid", gap: 8 }}>
        <h3 className={styles.sectionTitle}>Blueprint-owned resources</h3>
        <div className={styles.blueprintResources}>
          {blueprint.resources.map((resource) => <div key={resource.label} className={styles.blueprintResource}><strong>{resource.label}</strong><span className={styles.blueprintResourceValue}>{resource.value}</span></div>)}
        </div>
      </section>
    </div>
  );
};

const JournalRail: ProjectionView = ({ node, emit }) => {
  const styles = useOverlayStyles();
  const participants = (node.props.participants ?? []) as unknown as InspectionParticipant[];
  const timelineValue = (node.props.timeline ?? []) as unknown as TimelineItem[];
  const status = node.props.status as unknown as InspectionStatus | null | undefined;
  const demoEnabled = node.props.demoEnabled === true;
  const demoTimeline = (node.props.demoTimeline ?? []) as unknown as TimelineItem[];
  const demoSelection = (node.props.demoSelection ?? undefined) as unknown as ControlSelection | undefined;
  const selectedJournalId = typeof node.props.selectedJournalId === "string" ? node.props.selectedJournalId : null;
  const journalMode = node.props.journalMode === "ledger" ? "ledger" : "journal";
  const latestEntry = timelineValue.at(-1);
  const selectedEntry = selectedJournalId ? timelineValue.find((item) => item.operationRecordId === selectedJournalId || item.id === selectedJournalId) ?? latestEntry : latestEntry;
  const timelineItems = demoEnabled ? demoTimeline : timelineValue;
  const visibleTimelineItems = journalMode === "journal" ? timelineItems.filter((item) => item.source === "organism") : timelineItems;
  const selectedTimelineItem = demoSelection ? timelineItems.find((item) => item.id === demoSelection.itemId) : selectedEntry ?? timelineItems.at(-1);
  const actorNames = new Map(participants.map((item) => [item.id, item.name]));

  return (
    <aside className={styles.journalRail} aria-label="Journal and ledger">
      <div className={styles.journalSticky}>
        <header className={styles.journalHeader}>
          <div><div className={styles.eyebrow}>Causal record</div><strong>Journal / Ledger</strong></div>
          <div className={styles.journalTabs}>
            {(demoSelection || selectedJournalId) ? <Button size="small" appearance="subtle" onClick={() => demoEnabled ? emit("clearTimelineSelection", {}) : emit("selectJournal", { id: null })}>Latest</Button> : null}
            <Button size="small" appearance={journalMode === "journal" ? "primary" : "subtle"} onClick={() => emit("setJournalMode", { mode: "journal" })}>Journal</Button>
            <Button size="small" appearance={journalMode === "ledger" ? "primary" : "subtle"} onClick={() => emit("setJournalMode", { mode: "ledger" })}>Ledger</Button>
          </div>
        </header>
        <GrowingContainer ariaLabel="Journal timeline">
          <div className={styles.journalList}>
            {visibleTimelineItems.length === 0 ? <div className={styles.empty}><Clock20Regular /><p>The first attributable action will appear here.</p></div> : visibleTimelineItems.map((item) => (
              <button
                type="button"
                aria-pressed={selectedTimelineItem?.id === item.id}
                aria-label={`${item.status}: ${item.title}`}
                onClick={() => demoEnabled ? emit("selectTimeline", { selection: selectionFromTimelineItem(item) }) : emit("selectJournal", { id: item.operationRecordId ?? item.id })}
                key={item.id}
                className={mergeClasses(styles.journalEntry, selectedTimelineItem?.id === item.id ? styles.journalEntryActive : undefined)}
              >
                <span className={styles.journalTime}>{item.timestamp ?? `#${item.sequence ?? "-"}`}</span>
                <div>
                  <div className={styles.journalResult}>{journalMode === "ledger" ? `${item.source === "scenario" ? "Scenario instruction" : "SOC outcome"} · ` : ""}{item.status}{item.actorRef ? ` · ${actorNames.get(item.actorRef.id) ?? item.actorRef.id}` : ""}</div>
                  <div className={styles.journalSummary}>{item.summary}</div>
                  {journalMode === "ledger" ? <div className={styles.ledgerMeta}>item={item.scenarioStepId ?? item.operationRecordId ?? item.id}<br />focus={item.focusRefs.map((ref) => `${ref.kind}:${ref.id}`).join(", ")}{item.correlationId ? <><br />correlation={item.correlationId}</> : null}</div> : null}
                </div>
              </button>
            ))}
            {status?.kind === "success" ? <div className={styles.fallback}><CheckmarkCircle20Regular /> <strong>{status.message}</strong></div> : null}
          </div>
        </GrowingContainer>
      </div>
    </aside>
  );
};

function ParticipantStatusIcon({ status }: { status: ParticipantStatus }): React.ReactElement {
  const styles = useOverlayStyles();
  const className = mergeClasses(
    styles.statusIcon,
    status === "working" ? styles.statusWorking : undefined,
    status === "input-required" ? styles.statusAttention : undefined,
    status === "completed" ? styles.statusComplete : undefined,
    status === "error" ? styles.statusError : undefined,
  );
  if (status === "working") return <span className={className} title="Working"><Spinner size="tiny" /></span>;
  if (status === "waiting") return <span className={className} title="Waiting"><Clock20Regular /></span>;
  if (status === "input-required") return <span className={className} title="Input required"><QuestionCircle20Regular /></span>;
  if (status === "inactive") return <span className={className} title="Inactive"><WeatherMoon20Regular /></span>;
  if (status === "error") return <span className={className} title="Error"><DismissCircle20Regular /></span>;
  return <span className={className} title={status === "completed" ? "Completed" : "Available"}><CheckmarkCircle20Regular /></span>;
}

const Participants: ProjectionView = ({ node, emit }) => {
  const styles = useOverlayStyles();
  const participants = (node.props.participants ?? []) as unknown as InspectionParticipant[];
  const selection = (node.props.selection ?? undefined) as unknown as ControlSelection | undefined;

  if (node.props.compact === true) {
    return <section className={styles.compact} aria-label="Participant status">
      <div className={styles.compactContent}>
        <div className={styles.summaries}>
        {participants.map((participant) => {
          const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
          return <Persona
            aria-current={active ? "true" : undefined}
            className={mergeClasses(styles.compactPersona, active ? styles.compactPersonaActive : undefined)}
            data-participant-id={participant.id}
            key={participant.id}
            name={participant.name}
            size="extra-small"
            avatar={{ initials: null, icon: <ParticipantStatusIcon status={participant.status} /> }}
            secondaryText={<span className={styles.compactStatus}>{statusLabel(participant.status)}</span>}
          />;
        })}
        </div>
      </div>
    </section>;
  }

  const renderSetting = (participant: InspectionParticipant, setting: ParticipantToggleSetting) => <div className={styles.setting} key={setting.id}>
    <Switch
      checked={setting.value === setting.onValue}
      label={setting.value === setting.onValue ? setting.onLabel : setting.offLabel}
      aria-label={`${participant.name} ${setting.label}`}
      onChange={(_, data) => emit("configureParticipant", {
        participantId: participant.id,
        settingId: setting.id,
        value: data.checked ? setting.onValue : setting.offValue,
      })}
    />
    {setting.message ? <div className={styles.settingMessage}>{setting.message}</div> : null}
  </div>;

  const renderParticipant = (participant: InspectionParticipant) => {
    const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
    return <article data-participant-id={participant.id} key={participant.id} className={mergeClasses(styles.card, active ? styles.cardActive : undefined)}>
      <Persona
        className={styles.persona}
        name={participant.name}
        size="small"
        textAlignment="center"
        avatar={{ initials: null, icon: participant.kind === "human" ? <Person24Regular /> : <Sparkle24Regular /> }}
        secondaryText={[participant.role, statusBadge(participant.status)].filter(Boolean).join(" · ")}
      />
      {participant.capabilities?.length ? <details className={styles.details}>
        <summary>Capabilities</summary>
        <ul>{participant.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
      </details> : null}
      {participant.settings?.map((setting) => renderSetting(participant, setting))}
    </article>;
  };

  return <section className={styles.participants} aria-label="Human and agent participants">
    {(["human", "agent"] as const).map((kind) => {
      const grouped = participants.filter((participant) => participant.kind === kind);
      if (grouped.length === 0) return null;
      return <section className={styles.group} key={kind}>
        <h3 className={styles.groupTitle}>{kind === "human" ? "Humans" : "Agents"}</h3>
        <div className={styles.grid}>{grouped.map(renderParticipant)}</div>
      </section>;
    })}
  </section>;
};

const demoRunnerManifest = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "demo-runner/1.0",
    expression: "jsonata",
    namespaces: ["runner"],
    contexts: ["demo", "control"],
    actions: ["assign", "derive", "emit", "invoke"],
    capabilities: {
      "demo:runner": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"], emits: ["reset", "finishAct"] },
      "demo:timer-button": { propsSchema: { type: "object", additionalProperties: true }, emits: ["press"] },
      "demo-runner-host:toggle": { propsSchema: { type: "object", additionalProperties: true }, emits: ["toggle"] },
      "demo-runner-host:dropdown": { propsSchema: { type: "object", additionalProperties: true }, emits: ["select"] },
    },
    externals: {
      projectionViews: {
        demo: { from: "self" },
        "demo-runner-host": { from: "self", use: ["toggle", "dropdown"] },
      },
      effectHandlers: ["requestNextAct", "setPace", "selectDemo", "setPresentationContext", "finishAct", "resetDemo"],
    },
  },
} as const;

const demoRunnerDocument = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "demo:runner",
      id: "demo-runner",
      edges: {
        read: {
          demo: "demo",
          receipt: "control.receipt",
          plan: "runner.plan",
          catalog: "runner.catalog",
          entry: "runner.entry",
          selectedDemoId: "runner.selectedDemoId",
          presentationPresetId: "control.presentationPresetId",
        },
        on: {
          reset: [{ do: "invoke", args: { tool: "resetDemo" } }],
          finishAct: [{ do: "invoke", args: { tool: "finishAct" } }],
        },
        children: [
          {
            capability: "demo-runner-host:dropdown",
            id: "demo-blueprint-dropdown-region",
            props: { ariaLabel: "Select demo Blueprint", placeholder: "Select a demo" },
            edges: { read: { value: "runner.entry.id", options: "runner.catalog" }, on: { select: [{ do: "invoke", args: { tool: "selectDemo" } }] } },
          },
          {
            capability: "demo-runner-host:dropdown",
            id: "presentation-context-dropdown-region",
            props: { ariaLabel: "Select presentation context", placeholder: "Select a presentation" },
            edges: { read: { value: "control.presentationPresetId", options: "runner.presentationPresets" }, on: { select: [{ do: "invoke", args: { tool: "setPresentationContext" } }] } },
          },
          {
            capability: "demo-runner-host:toggle",
            id: "presenter-pace-toggle-region",
            props: { onValue: "auto", offValue: "manual", onLabel: "Auto", offLabel: "Manual" },
            edges: { read: { value: "demo.presenter.pace" }, on: { toggle: [{ do: "invoke", args: { tool: "setPace" } }] } },
          },
          {
            capability: "demo-runner-host:toggle",
            id: "gik-visibility-toggle-region",
            props: { hidden: true, onValue: true, offValue: false, onLabel: "Hide GIK", offLabel: "Show GIK" },
            edges: { read: { value: "control.ui.gikVisible" }, on: { toggle: [{ do: "assign", target: "control.ui.gikVisible", args: { from: "$event.value" } }] } },
          },
          {
            capability: "demo:timer-button",
            id: "next-act-timer-region",
            props: { label: "Next act", tone: "primary", showCountdown: true },
            edges: { read: { durationMs: "demo.presenter.durationMs", disabled: "demo.presenter.locked", advanceToken: "demo.presenter.advanceToken" }, on: { press: [{ do: "invoke", args: { tool: "requestNextAct" } }] } },
          },
        ],
      },
    },
  },
} as const;

const demoRunnerState = {
  runner: {
    plan: null,
    catalog: [],
    entry: null,
    presentationPresets: [],
  },
} as const;

const harnessManifest = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "gik-control-harness/1.0",
    expression: "jsonata",
    namespaces: ["control"],
    contexts: ["soc", "control", "demo"],
    actions: ["assign"],
    capabilities: {
      "harness:shell": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"], emits: ["selectTab", "toggleHarness"] },
      "harness:blueprint-inspector": { propsSchema: { type: "object", additionalProperties: true } },
      "harness:journal": { propsSchema: { type: "object", additionalProperties: true }, emits: ["setJournalMode", "selectTimeline", "clearTimelineSelection", "selectJournal"] },
      "harness:participants": { propsSchema: { type: "object", additionalProperties: true }, emits: ["configureParticipant"] },
    },
    externals: { projectionViews: { harness: { from: "self" } } },
  },
} as const;

const harnessDocument = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "harness:shell",
      id: "gik-control-harness",
      edges: {
        read: { activeTab: "control.ui.activeTab", expanded: "control.ui.harnessExpanded", visible: "control.ui.gikVisible" },
        on: {
          selectTab: [{ do: "assign", target: "control.ui.activeTab", args: { from: "$event.tab" } }],
          toggleHarness: [{ do: "assign", target: "control.ui.harnessExpanded", args: { from: "$event.expanded" } }],
        },
        children: [
          { capability: "harness:blueprint-inspector", id: "control-blueprint-inspector", edges: { read: { blueprint: "control.inspection.blueprint" } } },
          {
            capability: "harness:journal",
            id: "control-journal",
            edges: {
              read: {
                participants: "control.inspection.participants",
                timeline: "control.inspection.timeline",
                status: "control.inspection.status",
                journalMode: "control.ui.journalMode",
                selectedJournalId: "control.ui.selectedJournalId",
                demoEnabled: "demo.enabled",
                demoTimeline: "demo.timeline",
                demoSelection: "demo.selection",
              },
              on: {
                setJournalMode: [{ do: "assign", target: "control.ui.journalMode", args: { from: "$event.mode" } }],
                selectTimeline: [{ do: "assign", target: "demo.selection", args: { from: "$event.selection" } }],
                clearTimelineSelection: [{ do: "assign", target: "demo.selection", args: { value: null } }],
                selectJournal: [{ do: "assign", target: "control.ui.selectedJournalId", args: { from: "$event.id" } }],
              },
            },
          },
          {
            capability: "harness:participants",
            id: "control-participants",
            edges: {
              read: { participants: "control.inspection.participants", selection: "demo.selection" },
              on: { configureParticipant: [{ do: "assign", target: "control.participantConfigurationRequest", args: { from: "$event" } }] },
            },
          },
          {
            capability: "harness:participants",
            id: "control-participant-status",
            props: { compact: true },
            edges: { read: { participants: "control.inspection.participants", selection: "demo.selection" } },
          },
        ],
      },
    },
  },
} as const;

const harnessState = {
  control: {
    ui: {
      activeTab: "journal",
      gikVisible: false,
      harnessExpanded: false,
      journalMode: "journal",
      selectedJournalId: null,
    },
    inspection: {
      participants: [],
      presentation: { selectedContext: "", contexts: [] },
      blueprint: null,
      timeline: [],
      status: null,
    },
    presentationContext: null,
    presentationPresetId: null,
    participantConfigurationRequest: null,
    agentModeRequest: null,
    authorizationRequest: null,
  },
} as const;

const demoRunnerViews = {
  runner: DemoRunner,
  "timer-button": TimerButton,
  toggle: NativeToggle,
  dropdown: NativeDropdown,
};

const harnessViews = {
  shell: ControlHarnessShell,
  "blueprint-inspector": BlueprintInspector,
  journal: JournalRail,
  participants: Participants,
};

export function createDemoRunnerBundle(stateSeed?: Record<string, unknown>): Bundle {
  const state = structuredClone(demoRunnerState) as Record<string, unknown>;
  if (stateSeed) Object.assign(state, stateSeed);
  return bundleFromJson({
    manifest: structuredClone(demoRunnerManifest),
    document: structuredClone(demoRunnerDocument),
    state,
  }, {
    effectHandlers: demoRunnerEffects,
    projectionViews: demoRunnerViews,
  });
}

export function createGikControlHarnessBundle(stateSeed?: Record<string, unknown>): Bundle {
  const state = structuredClone(harnessState) as Record<string, unknown>;
  if (stateSeed) Object.assign(state, stateSeed);
  return bundleFromJson({
    manifest: structuredClone(harnessManifest),
    document: structuredClone(harnessDocument),
    state,
  }, {
    projectionViews: harnessViews,
  });
}
