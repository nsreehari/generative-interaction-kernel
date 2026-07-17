import React from "react";
import { Button, Select, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  ArrowReset24Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  DataTrending24Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { writeDemoNavigation, type DemoCatalogEntry, type ScenarioPlan } from "../../../shared/demo-runner";

interface DemoState {
  act: number;
  presenter: {
    locked: boolean;
  };
  request?: {
    token: number;
    command: string;
    waitAfterMs: number;
  } | null;
  ack?: {
    token: number;
    command: string;
  } | null;
}

const useStyles = makeStyles({
  runnerDrawer: { position: "fixed", top: tokens.spacingVerticalM, right: "clamp(16px, 3vw, 40px)", zIndex: 40, border: "1px solid rgba(126, 91, 45, .3)", borderRadius: tokens.borderRadiusMedium, backgroundColor: "rgba(255, 235, 202, .58)", boxShadow: "0 16px 42px rgba(92, 65, 30, .16)", backdropFilter: "blur(12px) saturate(120%)", overflow: "hidden", transitionProperty: "width", transitionDuration: tokens.durationNormal, transitionTimingFunction: tokens.curveEasyEase },
  collapsed: { width: "auto" },
  expanded: { width: "min(1320px, calc(100vw - 80px))" },
  header: { minHeight: "64px", display: "grid", gridTemplateColumns: "auto minmax(260px, 1fr) minmax(250px, auto) auto auto", alignItems: "center", gap: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalS, backgroundColor: "transparent" },
  headerCollapsed: { gridTemplateColumns: "auto auto", gap: 0 },
  toggle: { alignSelf: "stretch", minWidth: 0, display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, border: 0, backgroundColor: "transparent", color: "var(--text)", font: "inherit", textAlign: "left", cursor: "pointer", "&:hover": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" }, "&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: "-2px" } },
  collapsedAct: { whiteSpace: "nowrap", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  title: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  actBar: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXXS },
  actNumber: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, textTransform: "uppercase", fontWeight: tokens.fontWeightSemibold },
  actTitle: { margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  dots: { display: "flex", gap: tokens.spacingHorizontalXS },
  dot: { width: "12px", height: "4px", backgroundColor: "var(--line)" },
  dotDone: { backgroundColor: "var(--accent)" },
  field: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  label: { color: "var(--muted)", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap" },
  select: { minWidth: "210px" },
  controls: { display: "flex", alignItems: "center" },
  floorControls: { minWidth: "118px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS, paddingRight: tokens.spacingHorizontalS, "& > button": { minHeight: "32px" }, "& .gx-btn": { minWidth: "118px" } },
  floorControlsCompact: { minWidth: "54px", paddingLeft: tokens.spacingHorizontalXS, "& .gx-fluent-toggle": { display: "none" }, "& .gx-timer-label": { display: "none" }, "& .gx-timer-separator": { display: "none" }, "& .gx-btn": { minWidth: "46px", width: "auto", paddingLeft: tokens.spacingHorizontalS, paddingRight: tokens.spacingHorizontalS } },
});

const DemoRunner: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const demo = node.props.demo as unknown as DemoState;
  const plan = node.props.plan as unknown as ScenarioPlan;
  const catalog = (node.props.catalog ?? []) as unknown as DemoCatalogEntry[];
  const entry = node.props.entry as unknown as DemoCatalogEntry;
  const [expanded, setExpanded] = React.useState(true);
  const processedAckRef = React.useRef("");
  const act = Number(demo.act ?? 0);
  const complete = act >= plan.steps.length;
  const displayAct = Math.min(act + 1, plan.steps.length);

  React.useEffect(() => {
    const request = demo.request;
    const ack = demo.ack;
    if (!request || request.command === "$reset" || !ack || ack.token !== request.token || ack.command !== request.command) return;
    const ackKey = `${ack.token}:${ack.command}`;
    if (processedAckRef.current === ackKey) return;
    processedAckRef.current = ackKey;
    const timer = window.setTimeout(() => {
      void emit("finishAct", {});
    }, request.waitAfterMs ?? 0);
    return () => window.clearTimeout(timer);
  }, [demo.ack?.token, demo.ack?.command, demo.request?.token, demo.request?.command]);

  const selectDemo = (id: string) => {
    const selected = catalog.find((item) => item.id === id);
    if (selected) window.location.assign(writeDemoNavigation(window.location.href, selected));
  };

  const reset = () => {
    processedAckRef.current = "";
    emit("reset", {});
  };

  return <aside className={mergeClasses(styles.runnerDrawer, expanded ? styles.expanded : styles.collapsed)} aria-label="Scenario runner">
    <div className={mergeClasses(styles.header, !expanded ? styles.headerCollapsed : undefined)}>
      <button type="button" className={styles.toggle} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronRight20Regular /> : <ChevronLeft20Regular />}
        {expanded
          ? <span className={styles.title}><DataTrending24Regular />Scenario runner</span>
          : <span className={styles.collapsedAct}>Act {displayAct} of {plan.steps.length}</span>}
      </button>
      {expanded ? <section className={styles.actBar} aria-live="polite">
        <div className={styles.actNumber}>{complete ? "Journey complete" : `Act ${displayAct} of ${plan.steps.length}`}</div>
        <p className={styles.actTitle}>{complete ? "Containment complete" : plan.steps[act]?.title}</p>
        <div className={styles.dots} aria-hidden="true">
          {plan.steps.map((step, index) => <span key={step.id} className={mergeClasses(styles.dot, index < act || complete ? styles.dotDone : undefined)} />)}
        </div>
      </section> : null}
      {expanded ? <label className={styles.field}>
        <span className={styles.label}>Demo</span>
        <Select className={styles.select} aria-label="Select demo Blueprint" value={entry.id} onChange={(_, data) => selectDemo(data.value)}>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </label> : null}
      {expanded ? <div className={styles.controls}>
        <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" disabled={demo.presenter.locked} onClick={reset} />
      </div> : null}
      <div className={mergeClasses(styles.floorControls, !expanded ? styles.floorControlsCompact : undefined)}>{children}</div>
    </div>
  </aside>;
};

export default { runner: DemoRunner };
