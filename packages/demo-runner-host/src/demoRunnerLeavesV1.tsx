// Leaf authoring invariant: component-local hook state and React context are allowed.
// External state must arrive through props and changes must leave through emit handlers.
// Do not add mutable module-level runtime state, caches, registries, or shared memory here.

import React from "react";
import {
  Badge,
  Button,
  Persona,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
  type ButtonProps,
} from "@fluentui/react-components";
import {
  ChevronLeft20Regular,
  ChevronRight20Regular,
  ArrowCounterclockwise20Regular,
  Person20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import type { MaterializedBlueprint } from "@gik/blueprint";
import { unwrap } from "@gik/kernel";
import {
  readProps,
  useCountdownTimer,
  type ProjectionViewProps,
  type ProviderMap,
} from "@gik/react";
import { ToolingPortal } from "./tooling-shell";

interface ScenarioActor {
  name: string;
  type: "human" | "agent" | "service";
  description?: string;
}

interface ActJournalEntry {
  id: string;
  entryId: string;
  kind: "act" | "wait" | "observe";
  participantId?: string;
  title: string;
  description?: string;
  status: "running" | "completed" | "failed";
  event?: unknown;
  condition?: string;
  observations?: Record<string, unknown>;
  sequence: number;
}

interface RuntimeLedgerEntry {
  id: string;
  sequence: number;
  event: unknown;
  effects: unknown[];
  blueprintPatchProposals: unknown[];
}

const useStyles = makeStyles({
  tooling: { display: "contents" },
  runner: { position: "fixed", right: 0, bottom: 0, left: 0, zIndex: 40, display: "grid", rowGap: tokens.spacingVerticalM, padding: tokens.spacingVerticalM, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow16 },
  runnerHeader: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalM },
  runnerBody: { display: "grid", rowGap: tokens.spacingVerticalXS, minWidth: 0, flexGrow: 1 },
  controls: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  progress: { display: "flex", columnGap: tokens.spacingHorizontalXS },
  progressItem: { width: tokens.spacingHorizontalS, height: tokens.spacingVerticalXS, backgroundColor: tokens.colorNeutralBackground5 },
  progressItemDone: { backgroundColor: tokens.colorBrandBackground },
  controlPanel: { position: "fixed", inset: "0 0 var(--gik-tooling-runner-offset, 0) auto", zIndex: 30, width: "min(500px, 100vw)", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow16 },
  controlHeader: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalM, padding: tokens.spacingVerticalS },
  controlTitle: { flexGrow: 1 },
  controlBody: { minHeight: 0, overflow: "hidden" },
  inspection: { display: "grid", rowGap: tokens.spacingVerticalL, padding: tokens.spacingVerticalM },
  inspectionHeader: { display: "flex", justifyContent: "space-between", columnGap: tokens.spacingHorizontalM },
  fieldGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalM },
  field: { display: "grid", rowGap: tokens.spacingVerticalXXS },
  stageList: { display: "grid", rowGap: tokens.spacingVerticalS },
  stage: { display: "grid", rowGap: tokens.spacingVerticalXXS, padding: tokens.spacingVerticalS, backgroundColor: tokens.colorNeutralBackground2 },
  code: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  journal: { display: "grid", rowGap: tokens.spacingVerticalM, minHeight: 0 },
  journalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", columnGap: tokens.spacingHorizontalM },
  journalList: { display: "grid", rowGap: tokens.spacingVerticalS },
  journalItem: { display: "grid", rowGap: tokens.spacingVerticalXXS, textAlign: "left", padding: tokens.spacingVerticalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  journalItemSelected: { backgroundColor: tokens.colorBrandBackground2, boxShadow: `inset 0 0 0 ${tokens.strokeWidthThin} ${tokens.colorBrandStroke1}` },
  journalMeta: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
  muted: { color: tokens.colorNeutralForeground3 },
  participants: { display: "grid", rowGap: tokens.spacingVerticalL },
  participantGroup: { display: "grid", rowGap: tokens.spacingVerticalS },
  participantGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalS },
  participant: { display: "grid", rowGap: tokens.spacingVerticalS, padding: tokens.spacingVerticalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` },
  participantActive: { backgroundColor: tokens.colorBrandBackground2, boxShadow: `inset 0 0 0 ${tokens.strokeWidthThin} ${tokens.colorBrandStroke1}` },
});

function ToolingLeaf({ children }: ProjectionViewProps) {
  const styles = useStyles();
  return <div className={styles.tooling}>{children}</div>;
}

function RunnerPanelLeaf({ node, emit, children }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  if (props.bool("hidden")) return null;

  const current = Number(node.props.currentActNumber ?? 0);
  const total = Number(node.props.totalActs ?? 0);
  const complete = props.bool("complete");
  const kind = props.str("currentKind", "entry");
  const kindLabel = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;

  return (
    <ToolingPortal surface="runner"><section className={styles.runner} aria-label={props.str("ariaLabel", "Scenario runner")}>
      <div className={styles.runnerHeader}>
        <div className={styles.runnerBody} aria-live="polite">
          <strong>{complete ? props.str("completeLabel", "Scenario complete") : `${kindLabel} ${current} of ${total}`}</strong>
          <span>{props.str("actTitle")}</span>
          {props.str("actDescription") ? <span className={styles.muted}>{props.str("actDescription")}</span> : null}
          <div className={styles.progress} aria-hidden="true">
            {Array.from({ length: Math.max(0, total) }, (_, index) => (
              <span key={index} className={mergeClasses(styles.progressItem, index < current ? styles.progressItemDone : undefined)} />
            ))}
          </div>
        </div>
        <Button appearance="subtle" size="small" icon={<ArrowCounterclockwise20Regular />} aria-label="Reset demo runner" title="Reset demo runner" onClick={() => emit("reset", {})} />
      </div>
      <div className={styles.controls}>{children}</div>
    </section></ToolingPortal>
  );
}

function ControlPanelLeaf({ node, emit, children }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  if (props.bool("hidden")) return null;
  const expanded = node.props.expanded !== false;

  return (
    <ToolingPortal surface="inspector"><aside className={styles.controlPanel} aria-label={props.str("ariaLabel", "GIK control panel")}>
      <header className={styles.controlHeader}>
        {expanded ? <strong className={styles.controlTitle}>{props.str("title", "GIK control panel")}</strong> : null}
        <Button
          appearance="subtle"
          size="small"
          icon={expanded ? <ChevronRight20Regular /> : <ChevronLeft20Regular />}
          aria-label={expanded ? props.str("collapseLabel", "Collapse control panel") : props.str("expandLabel", "Expand control panel")}
          onClick={() => emit("toggle", { expanded: !expanded })}
        />
      </header>
      {expanded ? <div className={styles.controlBody}>{children}</div> : null}
    </aside></ToolingPortal>
  );
}

function LoweredBlueprintLeaf({ node }: ProjectionViewProps) {
  const styles = useStyles();
  const materialized = node.props.blueprint as unknown as MaterializedBlueprint | null | undefined;
  if (!materialized) return null;
  const blueprint = materialized.payload.terminalBlueprint.payload;
  const cells = Object.entries(blueprint.cells ?? {});
  const program = unwrap(materialized.payload.program);

  return (
    <section className={styles.inspection} aria-label="Lowered Blueprint">
      <header className={styles.inspectionHeader}>
        <div><h2>{blueprint.id}</h2><p>{blueprint.kind} · {blueprint.version}</p></div>
        <Badge appearance="tint" color="success">Materialized</Badge>
      </header>
      <div className={styles.fieldGrid}>
        <div className={styles.field}><strong>Cells</strong><span>{cells.length}</span></div>
        <div className={styles.field}><strong>External context</strong><span>{JSON.stringify(materialized.payload.externalContext)}</span></div>
      </div>
      <div className={styles.stageList} aria-label="Lowered cells">
        {cells.map(([id, cell]) => <article key={id} className={styles.stage}><strong>{id}</strong><span>{cell.kind}</span><pre className={styles.code}>{JSON.stringify(cell, null, 2)}</pre></article>)}
      </div>
      <details><summary>Lowered program</summary><pre className={styles.code}>{JSON.stringify(program, null, 2)}</pre></details>
    </section>
  );
}

function JournalLeaf({ node, emit }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  const entries = props.list<ActJournalEntry>("entries");
  const selectedId = props.str("selectedId");
  const selected = entries.find((entry) => entry.id === selectedId);

  return (
    <section className={styles.journal} aria-label={props.str("ariaLabel", "Scenario journal")}>
      <header className={styles.journalHeader}><strong>{props.str("title", "Journal")}</strong>{selectedId ? <Button appearance="subtle" size="small" onClick={() => emit("select", { id: null })}>Latest</Button> : null}</header>
      <GrowingContainerLeaf node={{ ...node, props: { ariaLabel: "Journal timeline" } }} emit={emit}>
        <div className={styles.journalList}>
          {entries.length === 0 ? <span className={styles.muted}>{props.str("emptyLabel", "No acts have run")}</span> : entries.map((entry) => (
            <button key={entry.id} type="button" className={mergeClasses(styles.journalItem, entry.id === selectedId ? styles.journalItemSelected : undefined)} aria-pressed={entry.id === selectedId} onClick={() => emit("select", { id: entry.id })}>
              <span className={styles.journalMeta}>
                <Badge appearance="tint" color={entry.kind === "act" ? "brand" : entry.kind === "wait" ? "warning" : "success"}>{entry.kind}</Badge>
                <span className={styles.muted}>#{entry.sequence} · {entry.status}{entry.participantId ? ` · ${entry.participantId}` : ""}</span>
              </span>
              <strong>{entry.title}</strong>
              {entry.description ? <span>{entry.description}</span> : null}
            </button>
          ))}
          {selected ? <details open><summary>Entry details</summary><pre className={styles.code}>{JSON.stringify({ event: selected.event, condition: selected.condition, observations: selected.observations }, null, 2)}</pre></details> : null}
        </div>
      </GrowingContainerLeaf>
    </section>
  );
}

function RuntimeLedgerLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  const entries = props.list<RuntimeLedgerEntry>("entries");

  return (
    <section className={styles.journal} aria-label={props.str("ariaLabel", "Runtime ledger")}>
      <header className={styles.journalHeader}><strong>{props.str("title", "Ledger")}</strong></header>
      <GrowingContainerLeaf node={{ ...node, props: { ariaLabel: "Runtime event and effect ledger" } }} emit={() => undefined}>
        <div className={styles.journalList}>
          {entries.length === 0 ? <span className={styles.muted}>No runtime transitions</span> : entries.map((entry) => (
            <article key={entry.id} className={styles.journalItem}>
              <span className={styles.journalMeta}><Badge appearance="tint" color="informative">event</Badge><span className={styles.muted}>#{entry.sequence}</span></span>
              <strong>{String((entry.event as { node?: unknown })?.node ?? "unknown")} / {String((entry.event as { name?: unknown })?.name ?? "unknown")}</strong>
              <pre className={styles.code}>{JSON.stringify(entry.event, null, 2)}</pre>
              {entry.effects.length > 0 ? <details><summary>{entry.effects.length} effect{entry.effects.length === 1 ? "" : "s"}</summary><pre className={styles.code}>{JSON.stringify(entry.effects, null, 2)}</pre></details> : null}
              {entry.blueprintPatchProposals.length > 0 ? <details><summary>{entry.blueprintPatchProposals.length} projection patch proposal{entry.blueprintPatchProposals.length === 1 ? "" : "s"}</summary><pre className={styles.code}>{JSON.stringify(entry.blueprintPatchProposals, null, 2)}</pre></details> : null}
            </article>
          ))}
        </div>
      </GrowingContainerLeaf>
    </section>
  );
}

function ActorsLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  const actors = props.obj<Record<string, ScenarioActor>>("actors", {});
  const currentParticipantId = props.str("currentParticipantId");

  return <section className={styles.participants} aria-label="Scenario actors">{(["human", "agent", "service"] as const).map((type) => {
    const group = Object.entries(actors).filter(([, actor]) => actor.type === type);
    if (group.length === 0) return null;
    return <section key={type} className={styles.participantGroup}><h3>{type === "human" ? "Humans" : type === "agent" ? "Agents" : "Services"}</h3><div className={styles.participantGrid}>{group.map(([id, actor]) => {
      const active = id === currentParticipantId;
      return <article key={id} className={mergeClasses(styles.participant, active ? styles.participantActive : undefined)}><Persona name={actor.name} size="small" avatar={{ initials: null, icon: type === "human" ? <Person20Regular /> : <Sparkle20Regular /> }} secondaryText={actor.description} />{active ? <Badge appearance="tint" color="brand">Current actor</Badge> : null}</article>;
    })}</div></section>;
  })}</section>;
}

function TimerButtonLeaf({ node, emit }: ProjectionViewProps) {
  const props = readProps(node);
  const styles = useStyles();
  const [pace, setPace] = React.useState<"manual" | "auto">(
    () => node.props.defaultPace === "auto" ? "auto" : "manual",
  );
  const configuredDuration = Number(
    pace === "auto"
      ? node.props.autoDurationMs ?? node.props.durationMs ?? 3000
      : node.props.manualDurationMs ?? node.props.durationMs ?? 3000,
  );
  const durationMs = Number.isFinite(configuredDuration) ? Math.max(0, configuredDuration) : 3000;
  const disabled = props.bool("disabled");
  const showCountdown = node.props.showCountdown !== false;
  const showPaceSwitch = node.props.showPaceSwitch !== false;
  const externalResetKey = node.props.resetKey ?? node.props.advanceToken ?? "";
  const previousResetKey = React.useRef(externalResetKey);
  React.useEffect(() => {
    const previous = Number(previousResetKey.current);
    const current = Number(externalResetKey);
    previousResetKey.current = externalResetKey;
    if (Number.isFinite(previous) && Number.isFinite(current) && current < previous) {
      setPace(node.props.defaultPace === "auto" ? "auto" : "manual");
    }
  }, [externalResetKey, node.props.defaultPace]);
  const timer = useCountdownTimer({
    durationMs,
    running: pace === "auto" && node.props.autoStart !== false && !disabled,
    resetKey: `${String(externalResetKey)}:${pace}`,
    onElapsed: () => emit("press", { reason: "timeout" }),
  });
  if (props.bool("hidden")) return null;

  const label = props.str("label");
  return (
    <div className={styles.controls}>
      {showPaceSwitch ? <ToggleButton
        checked={pace === "auto"}
        size="small"
        aria-label="Automatically advance sequence"
        onClick={() => setPace((current) => current === "auto" ? "manual" : "auto")}
      >
        {pace === "auto" ? "Auto" : "Manual"}
      </ToggleButton> : null}
      <Button
        appearance={props.str("appearance", "secondary") as ButtonProps["appearance"]}
        aria-label={pace === "auto" && showCountdown ? `${label}, ${timer.remainingSeconds} seconds remaining` : props.str("ariaLabel") || label}
        disabled={disabled}
        size={props.str("size", "small") as ButtonProps["size"]}
        onClick={() => {
          emit("press", { reason: "manual" });
          timer.restart();
        }}
      >
        {label}
        {pace === "auto" && showCountdown ? ` · ${timer.remainingSeconds}` : null}
      </Button>
    </div>
  );
}

function GrowingContainerLeaf({ node, children }: ProjectionViewProps) {
  const props = readProps(node);
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

  if (props.bool("hidden")) return null;
  const ariaLabel = props.str("ariaLabel") || undefined;

  return (
    <div
      ref={viewportRef}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      style={{ height: "100%", minHeight: 0, overflow: "auto" }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

export const demoRunnerLeavesV1: ProviderMap = {
  actors: ActorsLeaf,
  "control-panel": ControlPanelLeaf,
  "growing-container": GrowingContainerLeaf,
  "act-journal": JournalLeaf,
  "runtime-ledger": RuntimeLedgerLeaf,
  "lowered-blueprint": LoweredBlueprintLeaf,
  "runner-panel": RunnerPanelLeaf,
  "timer-button": TimerButtonLeaf,
  tooling: ToolingLeaf,
};