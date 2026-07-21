import React from "react";
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
import type { ControlReceipt } from "./control-runtime";
import {
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
  request?: {
    token: number;
    command: string;
    waitAfterMs: number;
  } | null;
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
    if (request.command === "$reset" || request.token !== receipt.token || request.command !== receipt.command || receipt.status !== "completed") {
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

function buttonStyle(active = false, primary = false): React.CSSProperties {
  return {
    border: `1px solid ${primary || active ? shellColors.accent : shellColors.line}`,
    background: primary || active ? shellColors.accent : "#ffffff",
    color: primary || active ? "#ffffff" : shellColors.text,
    borderRadius: 999,
    padding: "6px 12px",
    cursor: "pointer",
    font: "inherit",
  };
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
  const value = node.props.value;
  const options = Array.isArray(node.props.options) ? node.props.options as Array<Record<string, unknown>> : [];
  const placeholder = typeof node.props.placeholder === "string" ? node.props.placeholder : "Select";
  const ariaLabel = typeof node.props.ariaLabel === "string" ? node.props.ariaLabel : placeholder;
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: shellColors.muted }}>{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => emit("select", { value: event.currentTarget.value })}
        style={{ minHeight: 36, minWidth: 0, borderRadius: 8, border: `1px solid ${shellColors.line}`, padding: "0 10px", font: "inherit" }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const id = typeof option.id === "string" ? option.id : "";
          const label = typeof option.label === "string" ? option.label : id;
          return <option key={id} value={id}>{label}</option>;
        })}
      </select>
    </label>
  );
};

const NativeToggle: ProjectionView = ({ node, emit }) => {
  const value = typeof node.props.value === "string" ? node.props.value : "manual";
  const onValue = typeof node.props.onValue === "string" ? node.props.onValue : "on";
  const offValue = typeof node.props.offValue === "string" ? node.props.offValue : "off";
  const checked = value === onValue;
  const label = checked ? String(node.props.onLabel ?? onValue) : String(node.props.offLabel ?? offValue);
  return (
    <button type="button" aria-pressed={checked} onClick={() => emit("toggle", { value: checked ? offValue : onValue })} style={buttonStyle(checked)}>
      {label}
    </button>
  );
};

function TimerButton({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const configuredDuration = Number(node.props.durationMs ?? node.props.duration ?? 3000);
  const durationMs = Number.isFinite(configuredDuration) ? Math.max(250, configuredDuration) : 3000;
  const disabled = p.bool("disabled");
  const running = node.props.autoStart !== false && !disabled;
  const timer = useCountdownTimer({
    durationMs,
    running,
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
    <button type="button" disabled={disabled} aria-label={`${label}, ${timer.remainingSeconds} seconds remaining`} onClick={press} style={buttonStyle(false, p.str("tone", "default") === "primary")}>
      {label}
      {node.props.showCountdown !== false ? ` (${timer.remainingSeconds})` : ""}
    </button>
  );
}

const DemoRunner: ProjectionView = ({ node, emit, children }) => {
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
    <aside aria-label="Scenario runner" style={{ borderTop: `1px solid ${shellColors.line}`, background: "#fff7ea", padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: expanded ? "auto minmax(180px,1fr) minmax(240px, 420px) auto" : "auto minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} style={buttonStyle(false)}>
          {expanded ? "Collapse runner" : "Expand runner"}
        </button>
        <section aria-live="polite" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: shellColors.muted, textTransform: "uppercase" }}>{complete ? "Journey complete" : `Act ${displayAct} of ${planValue.steps.length}`}</div>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{complete ? `${planValue.title} complete` : planValue.steps[act]?.title}</div>
        </section>
        {expanded ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>{demoDropdown}{presentationDropdown}</div> : null}
        {expanded ? <button type="button" disabled={demo.presenter.locked} onClick={() => { processedAckRef.current = ""; emit("reset", {}); }} style={buttonStyle(false)}>
          Reset scenario
        </button> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{floorControls}</div>
      </div>
    </aside>
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
  const requestedTab = String(node.props.activeTab ?? "journal");
  const activeTab = requestedTab === "blueprint" || requestedTab === "participants" ? requestedTab : "journal";
  const expanded = node.props.expanded !== false;
  const panels = React.Children.toArray(children);
  const activePanel = activeTab === "blueprint" ? panels[0] : activeTab === "participants" ? panels[2] : panels[1];

  return (
    <>
      <div aria-label="Harness context" style={{ position: "fixed", top: 0, right: 0, zIndex: 35, minHeight: 56, display: "flex", alignItems: "stretch", border: `1px solid ${shellColors.line}`, borderTop: 0, borderRight: 0, borderRadius: "0 0 0 8px", background: "rgba(246,247,245,.9)", overflow: "hidden" }}>
        {panels[3]}
      </div>
      <aside aria-label="GIK control harness" style={{ position: "fixed", inset: "64px 0 72px auto", zIndex: 30, width: expanded ? "min(500px, calc(100vw - 32px))" : 48, height: expanded ? "calc(100dvh - 136px)" : 48, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden", border: `1px solid ${shellColors.line}`, borderRight: 0, borderRadius: "8px 0 0 8px", background: shellColors.panel, boxShadow: "-3px 3px 7px rgba(31,67,83,.14)" }}>
        <header style={{ display: "grid", gap: 12, padding: expanded ? "12px 14px 0" : 0, borderBottom: expanded ? `1px solid ${shellColors.line}` : 0, background: shellColors.panel2 }}>
          <div style={{ minHeight: 32, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {expanded ? <strong>GIK control harness</strong> : null}
            <button type="button" aria-label={expanded ? "Collapse control harness" : "Expand control harness"} onClick={() => emit("toggleHarness", { expanded: !expanded })} style={buttonStyle(false, true)}>
              {expanded ? "Close" : "Open"}
            </button>
          </div>
          {expanded ? <div aria-label="Control harness panels" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => emit("selectTab", { tab: "journal" })} style={buttonStyle(activeTab === "journal")}>Journal</button>
            <button type="button" onClick={() => emit("selectTab", { tab: "blueprint" })} style={buttonStyle(activeTab === "blueprint")}>Blueprint</button>
            <button type="button" onClick={() => emit("selectTab", { tab: "participants" })} style={buttonStyle(activeTab === "participants")}>Participants</button>
          </div> : null}
        </header>
        {expanded ? <div role="tabpanel" aria-label={activeTab} style={{ minHeight: 0, overflow: "hidden", padding: 14 }}>
          {activeTab === "journal" ? activePanel : <GrowingContainer>{activePanel}</GrowingContainer>}
        </div> : null}
      </aside>
    </>
  );
};

const BlueprintInspector: ProjectionView = ({ node }) => {
  const blueprint = node.props.blueprint as unknown as BlueprintInspection | null | undefined;
  if (!blueprint) return null;
  return (
    <div style={{ display: "grid", gap: 16, color: shellColors.text }}>
      <header style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", color: shellColors.muted }}>Executable semantic blueprint</div>
        <h2 style={{ margin: 0, fontSize: 22 }}>{blueprint.title}</h2>
        <p style={{ margin: 0, color: shellColors.muted }}>{blueprint.description}</p>
        <div><span style={{ display: "inline-block", borderRadius: 999, background: "#e6f4ea", color: shellColors.good, padding: "4px 10px" }}>{blueprint.status}</span></div>
      </header>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {blueprint.contextIds.map((id) => <span key={id} style={{ borderRadius: 999, padding: "4px 10px", border: `1px solid ${id === blueprint.selectedContext ? shellColors.accent : shellColors.line}`, background: id === blueprint.selectedContext ? shellColors.panel2 : "#fff" }}>{id}</span>)}
      </div>
      <section style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 12, color: shellColors.muted }}>Selected projection contract</span>
          <strong>{blueprint.selectedContext}</strong>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {blueprint.fields.map((field) => <div key={field.label} style={{ display: "grid", gap: 4 }}><strong>{field.label}</strong><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{field.value}</span></div>)}
        </div>
      </section>
      <section style={{ display: "grid", gap: 10 }}>
        {blueprint.stages.map((stage) => <article key={stage.tier} style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 12, border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: shellColors.muted }}>{stage.kind}</span>
            <strong>{stage.tier}</strong>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span>{stage.recipe}</span>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "Consolas, monospace", fontSize: 12 }}>{stage.summary}</pre>
          </div>
        </article>)}
      </section>
      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Blueprint-owned resources</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {blueprint.resources.map((resource) => <div key={resource.label} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: 10, display: "grid", gap: 4 }}><strong>{resource.label}</strong><span>{resource.value}</span></div>)}
        </div>
      </section>
    </div>
  );
};

const JournalRail: ProjectionView = ({ node, emit }) => {
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
    <aside aria-label="Journal and ledger" style={{ height: "100%", minHeight: 0 }}>
      <div style={{ position: "sticky", top: 0, display: "grid", gap: 12 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div><div style={{ fontSize: 12, color: shellColors.muted, textTransform: "uppercase" }}>Causal record</div><strong>Journal / Ledger</strong></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(demoSelection || selectedJournalId) ? <button type="button" onClick={() => demoEnabled ? emit("clearTimelineSelection", {}) : emit("selectJournal", { id: null })} style={buttonStyle(false)}>Latest</button> : null}
            <button type="button" onClick={() => emit("setJournalMode", { mode: "journal" })} style={buttonStyle(journalMode === "journal")}>Journal</button>
            <button type="button" onClick={() => emit("setJournalMode", { mode: "ledger" })} style={buttonStyle(journalMode === "ledger")}>Ledger</button>
          </div>
        </header>
        <GrowingContainer ariaLabel="Journal timeline">
          <div style={{ display: "grid", gap: 8 }}>
            {visibleTimelineItems.length === 0 ? <div style={{ color: shellColors.muted }}>The first attributable action will appear here.</div> : visibleTimelineItems.map((item) => (
              <button
                type="button"
                aria-pressed={selectedTimelineItem?.id === item.id}
                aria-label={`${item.status}: ${item.title}`}
                onClick={() => demoEnabled ? emit("selectTimeline", { selection: selectionFromTimelineItem(item) }) : emit("selectJournal", { id: item.operationRecordId ?? item.id })}
                key={item.id}
                style={{ textAlign: "left", border: `1px solid ${selectedTimelineItem?.id === item.id ? shellColors.accent : shellColors.line}`, background: selectedTimelineItem?.id === item.id ? shellColors.panel2 : "#fff", borderRadius: 8, padding: 10, display: "grid", gap: 4, cursor: "pointer" }}
              >
                <span style={{ color: shellColors.muted, fontSize: 12 }}>{item.timestamp ?? `#${item.sequence ?? "-"}`}</span>
                <div>
                  <div style={{ fontSize: 12, color: shellColors.muted }}>{journalMode === "ledger" ? `${item.source === "scenario" ? "Scenario instruction" : "SOC outcome"} · ` : ""}{item.status}{item.actorRef ? ` · ${actorNames.get(item.actorRef.id) ?? item.actorRef.id}` : ""}</div>
                  <div>{item.summary}</div>
                  {journalMode === "ledger" ? <div style={{ marginTop: 4, fontSize: 12, color: shellColors.muted }}>item={item.scenarioStepId ?? item.operationRecordId ?? item.id}<br />focus={item.focusRefs.map((ref) => `${ref.kind}:${ref.id}`).join(", ")}{item.correlationId ? <><br />correlation={item.correlationId}</> : null}</div> : null}
                </div>
              </button>
            ))}
            {status?.kind === "success" ? <div style={{ color: shellColors.good }}><strong>{status.message}</strong></div> : null}
          </div>
        </GrowingContainer>
      </div>
    </aside>
  );
};

const Participants: ProjectionView = ({ node, emit }) => {
  const participants = (node.props.participants ?? []) as unknown as InspectionParticipant[];
  const selection = (node.props.selection ?? undefined) as unknown as ControlSelection | undefined;

  if (node.props.compact === true) {
    return <section aria-label="Participant status" style={{ display: "flex", alignItems: "center", padding: "8px 10px" }}>
      <div style={{ display: "flex", gap: 8, overflow: "hidden", flexWrap: "wrap" }}>
        {participants.map((participant) => {
          const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
          return <div key={participant.id} aria-current={active ? "true" : undefined} style={{ minWidth: 96, borderRadius: 8, border: `1px solid ${active ? shellColors.accent : shellColors.line}`, background: active ? shellColors.panel2 : "#fff", padding: "6px 8px", display: "grid", gap: 2 }}>
            <strong style={{ fontSize: 12 }}>{participant.name}</strong>
            <span style={{ fontSize: 11, color: shellColors.muted }}>{statusLabel(participant.status)}</span>
          </div>;
        })}
      </div>
    </section>;
  }

  const renderSetting = (participant: InspectionParticipant, setting: ParticipantToggleSetting) => {
    const checked = setting.value === setting.onValue;
    return <label key={setting.id} style={{ display: "grid", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${shellColors.line}` }}>
      <span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => emit("configureParticipant", {
            participantId: participant.id,
            settingId: setting.id,
            value: event.currentTarget.checked ? setting.onValue : setting.offValue,
          })}
        /> {checked ? setting.onLabel : setting.offLabel}
      </span>
      {setting.message ? <span style={{ color: shellColors.muted, fontSize: 12 }}>{setting.message}</span> : null}
    </label>;
  };

  const renderParticipant = (participant: InspectionParticipant) => {
    const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
    return <article key={participant.id} style={{ border: `1px solid ${active ? shellColors.accent : shellColors.line}`, background: active ? shellColors.panel2 : shellColors.panel, borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 2 }}>
        <strong>{participant.name}</strong>
        <span style={{ color: shellColors.muted, fontSize: 12 }}>{[participant.role, statusBadge(participant.status)].filter(Boolean).join(" · ")}</span>
      </div>
      {participant.capabilities?.length ? <details>
        <summary>Capabilities</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{participant.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
      </details> : null}
      {participant.settings?.map((setting) => renderSetting(participant, setting))}
    </article>;
  };

  return <section aria-label="Human and agent participants" style={{ display: "grid", gap: 18 }}>
    {(["human", "agent"] as const).map((kind) => {
      const grouped = participants.filter((participant) => participant.kind === kind);
      if (grouped.length === 0) return null;
      return <section key={kind} style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, color: shellColors.muted, fontSize: 12, textTransform: "uppercase" }}>{kind === "human" ? "Humans" : "Agents"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>{grouped.map(renderParticipant)}</div>
      </section>;
    })}
  </section>;
};

const demoRunnerManifest = {
  gik: "0.1",
  type: "manifest",
  payload: {
    version: "demo-runner/1.0",
    expression: "jsonata",
    namespaces: ["runner"],
    contexts: ["demo", "control"],
    actions: ["assign", "derive", "emit", "invoke"],
    capabilities: {
      "demo:runner": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"], emits: ["reset", "finishAct"] },
      "demo:timer-button": { propsSchema: { type: "object", additionalProperties: true }, emits: ["press"] },
      "blueprint-host:toggle": { propsSchema: { type: "object", additionalProperties: true }, emits: ["toggle"] },
      "blueprint-host:dropdown": { propsSchema: { type: "object", additionalProperties: true }, emits: ["select"] },
    },
    externals: {
      projectionViews: {
        demo: { from: "self" },
        "blueprint-host": { from: "self", use: ["toggle", "dropdown"] },
      },
      effectHandlers: ["requestNextAct", "setPace", "selectDemo", "setPresentationContext", "finishAct", "resetDemo"],
    },
  },
} as const;

const demoRunnerDocument = {
  gik: "0.1",
  type: "document",
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
            capability: "blueprint-host:dropdown",
            id: "demo-blueprint-dropdown-region",
            props: { ariaLabel: "Select demo Blueprint", placeholder: "Select a demo" },
            edges: { read: { value: "runner.entry.id", options: "runner.catalog" }, on: { select: [{ do: "invoke", args: { tool: "selectDemo" } }] } },
          },
          {
            capability: "blueprint-host:dropdown",
            id: "presentation-context-dropdown-region",
            props: { ariaLabel: "Select presentation context", placeholder: "Select a presentation" },
            edges: { read: { value: "control.presentationPresetId", options: "runner.presentationPresets" }, on: { select: [{ do: "invoke", args: { tool: "setPresentationContext" } }] } },
          },
          {
            capability: "blueprint-host:toggle",
            id: "presenter-pace-toggle-region",
            props: { onValue: "auto", offValue: "manual", onLabel: "Auto", offLabel: "Manual" },
            edges: { read: { value: "demo.presenter.pace" }, on: { toggle: [{ do: "invoke", args: { tool: "setPace" } }] } },
          },
          {
            capability: "demo:timer-button",
            id: "next-act-timer-region",
            props: { label: "Next act", tone: "primary", showCountdown: true },
            edges: { read: { durationMs: "demo.presenter.durationMs", disabled: "demo.presenter.locked" }, on: { press: [{ do: "invoke", args: { tool: "requestNextAct" } }] } },
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
  type: "manifest",
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
  type: "document",
  payload: {
    root: {
      capability: "harness:shell",
      id: "gik-control-harness",
      edges: {
        read: { activeTab: "control.ui.activeTab", expanded: "control.ui.harnessExpanded" },
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
