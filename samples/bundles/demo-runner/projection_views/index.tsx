import React from "react";
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  ArrowReset24Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  DataTrending24Regular,
} from "@fluentui/react-icons";
import { readProps, useCountdownTimer, type ProjectionView, type ProjectionViewProps } from "@gik/react";
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
  runnerDrawer: {
    position: "relative", zIndex: 40, width: "100%", boxSizing: "border-box",
    border: "1px solid rgba(126, 91, 45, .38)", borderBottom: 0, borderLeft: 0, borderRight: 0,
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
  collapsed: { maxWidth: "100vw" },
  expanded: { borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0` },
  header: { minHeight: "64px", display: "grid", gridTemplateColumns: "auto minmax(220px, 1fr) minmax(420px, 560px) auto auto", alignItems: "center", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalM} 0 0`, backgroundColor: "transparent", "@media (max-width: 1100px)": { gridTemplateColumns: "auto minmax(160px, 1fr) auto auto" } },
  headerCollapsed: { gridTemplateColumns: "auto minmax(0, 1fr) auto", paddingRight: tokens.spacingHorizontalXS },
  toggle: { alignSelf: "stretch", minWidth: "48px", borderRadius: 0, paddingLeft: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalM, justifyContent: "flex-start", color: "var(--text)", "&:hover": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" } },
  title: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  actBar: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXXS },
  actNumber: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, textTransform: "uppercase", fontWeight: tokens.fontWeightSemibold },
  actTitle: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    "@media (max-width: 600px)": {
      display: "-webkit-box",
      whiteSpace: "normal",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
    },
  },
  dots: { display: "flex", gap: tokens.spacingHorizontalXS },
  dot: { width: "12px", height: "4px", backgroundColor: "var(--line)" },
  dotDone: { backgroundColor: "var(--accent)" },
  field: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "center", gap: tokens.spacingHorizontalS, "@media (max-width: 1100px)": { display: "none" } },
  demoDropdown: {
    minWidth: 0,
    "& .gx-fluent-dropdown": {
      backgroundColor: "transparent",
      boxShadow: "none",
      "&:hover": { backgroundColor: "transparent" },
      "&:focus-within": { backgroundColor: "transparent" },
    },
    "& .gx-fluent-dropdown > button": {
      minHeight: "36px",
      paddingInline: tokens.spacingHorizontalS,
      border: "1px solid transparent",
      borderBottom: "1px solid rgba(126, 91, 45, .26)",
      borderRadius: tokens.borderRadiusSmall,
      backgroundColor: "transparent",
      color: "color-mix(in srgb, var(--text) 82%, transparent)",
      boxShadow: "none",
      fontSize: tokens.fontSizeBase200,
      transition: "border-color 120ms ease-out, box-shadow 120ms ease-out, background-color 120ms ease-out",
      "&:hover": {
        border: "1px solid rgba(126, 91, 45, .18)",
        borderBottom: "1px solid rgba(126, 91, 45, .48)",
        backgroundColor: "rgba(255, 255, 255, .28)",
        boxShadow: "none",
      },
      "&[aria-expanded=true]": {
        border: "1px solid rgba(126, 91, 45, .24)",
        borderBottom: "1px solid rgba(126, 91, 45, .58)",
        backgroundColor: "rgba(255, 255, 255, .38)",
      },
      "&:focus-visible": {
        outline: "2px solid var(--colorStrokeFocus2)",
        outlineOffset: "2px",
      },
    },
  },
  controls: { display: "flex", alignItems: "center" },
  floorControls: { minWidth: "118px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS, paddingRight: tokens.spacingHorizontalS, "& > button": { minHeight: "32px" }, "& .gx-btn": { minWidth: "118px" } },
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
      transition: "transform 120ms ease-out, box-shadow 120ms ease-out, background-color 120ms ease-out, color 120ms ease-out",
      "&[aria-pressed=true]": {
        border: "1px solid rgba(15, 108, 189, .58)",
        backgroundColor: "rgba(15, 108, 189, .14)",
        color: "#084b7a",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, .42), 0 2px 5px rgba(0, 71, 120, .14)",
      },
      "&:hover:not(:disabled)": {
        transform: "translateY(-1px)",
        backgroundColor: "rgba(15, 108, 189, .2)",
        boxShadow: "0 4px 10px rgba(0, 71, 120, .16)",
      },
      "&:active:not(:disabled)": {
        transform: "translateY(0)",
        boxShadow: "0 1px 2px rgba(0, 71, 120, .12)",
      },
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
      transition: "transform 120ms ease-out, box-shadow 120ms ease-out, background-color 120ms ease-out",
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
      "&:hover:not(:disabled)": {
        transform: "translateY(-1px)",
        boxShadow: "0 3px 6px rgba(0, 71, 120, .24), 0 8px 18px rgba(0, 71, 120, .2)",
      },
      "&:active:not(:disabled)": {
        transform: "translateY(0)",
        boxShadow: "0 1px 2px rgba(0, 71, 120, .22)",
      },
      "&:focus-visible": {
        outline: "2px solid var(--colorStrokeFocus2)",
        outlineOffset: "2px",
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
    },
  },
  floorControlsCollapsed: { "& .gx-fluent-toggle": { display: "none" } },
});

const DemoRunner: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const demo = node.props.demo as unknown as DemoState;
  const plan = node.props.plan as unknown as ScenarioPlan;
  const catalog = (node.props.catalog ?? []) as unknown as DemoCatalogEntry[];
  const entry = node.props.entry as unknown as DemoCatalogEntry;
  const selectedDemoId = String(node.props.selectedDemoId ?? "");
  const [expanded, setExpanded] = React.useState(false);
  const drawerRef = React.useRef<HTMLElement>(null);
  const processedAckRef = React.useRef("");
  const act = Number(demo.act ?? 0);
  const complete = act >= plan.steps.length;
  const displayAct = Math.min(act + 1, plan.steps.length);
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
  }, [node.props.receipt, demo.request?.token, demo.request?.command]);

  React.useEffect(() => {
    if (!selectedDemoId || selectedDemoId === entry.id) return;
    const selected = catalog.find((item) => item.id === selectedDemoId);
    if (selected) window.location.assign(writeDemoNavigation(window.location.href, selected));
  }, [selectedDemoId, entry.id, catalog]);

  const reset = () => {
    processedAckRef.current = "";
    emit("reset", {});
  };

  const toggleExpanded = () => {
    setExpanded((value) => !value);
  };

  return <aside ref={drawerRef} className={mergeClasses(styles.runnerDrawer, expanded ? styles.expanded : styles.collapsed)} aria-label="Scenario runner">
    <div className={mergeClasses(styles.header, !expanded ? styles.headerCollapsed : undefined)}>
      <Button
        appearance="subtle"
        className={styles.toggle}
        icon={expanded ? <ChevronLeft20Regular /> : <ChevronRight20Regular />}
        aria-label={expanded ? "Collapse scenario runner" : "Expand scenario runner"}
        title={expanded ? "Collapse scenario runner" : "Expand scenario runner"}
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        {expanded ? <span className={styles.title}><DataTrending24Regular />Scenario runner</span> : null}
      </Button>
      <section className={styles.actBar} aria-live="polite">
        <div className={styles.actNumber}>{complete ? "Journey complete" : `Act ${displayAct} of ${plan.steps.length}`}</div>
        <p className={styles.actTitle}>{complete ? `${plan.title} complete` : plan.steps[act]?.title}</p>
        <div className={styles.dots} aria-hidden="true">
          {plan.steps.map((step, index) => <span key={step.id} className={mergeClasses(styles.dot, index < act || complete ? styles.dotDone : undefined)} />)}
        </div>
      </section>
      {expanded ? <div className={styles.field}>
        <div className={styles.demoDropdown}>{demoDropdown}</div>
        <div className={styles.demoDropdown}>{presentationDropdown}</div>
      </div> : null}
      {expanded ? <div className={styles.controls}>
        <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" disabled={demo.presenter.locked} onClick={reset} />
      </div> : null}
      <div className={mergeClasses(styles.floorControls, styles.floorControlsCompact, !expanded ? styles.floorControlsCollapsed : undefined)}>{floorControls}</div>
    </div>
  </aside>;
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
    <button
      className={`gx-btn gx-btn-${p.str("tone", "default")}`}
      disabled={disabled}
      aria-label={`${label}, ${timer.remainingSeconds} seconds remaining`}
      onClick={press}
    >
      <span className="gx-timer-label">{label}</span>
      {node.props.showCountdown !== false ? <>
        <span className="gx-timer-separator" aria-hidden="true"> · </span>
        <span className="gx-timer-count">{timer.remainingSeconds}</span>
      </> : null}
    </button>
  );
}

export default { runner: DemoRunner, "timer-button": TimerButton };
