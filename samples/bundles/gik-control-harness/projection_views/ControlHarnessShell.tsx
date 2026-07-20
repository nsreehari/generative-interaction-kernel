import React from "react";
import { Button, Tab, TabList, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronLeft20Regular, ChevronRight20Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { GrowingContainer } from "../../../../adapters/react/src/primitives/registry";

const useStyles = makeStyles({
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
    "@media (max-width: 700px)": { maxWidth: "calc(100vw - 8px)" },
  },
  panel: { minHeight: 0, overflow: "hidden", backgroundColor: "var(--panel)" },
  journalPanelContent: { height: "100%", minWidth: 0, minHeight: 0, padding: "14px", boxSizing: "border-box" },
  scrollPanelContent: { minWidth: 0, minHeight: "100%", padding: "14px", boxSizing: "border-box" },
});

export const ControlHarnessShell: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const harnessRef = React.useRef<HTMLElement>(null);
  const requestedTab = String(node.props.activeTab ?? "journal");
  const activeTab = requestedTab === "blueprint" || requestedTab === "participants" ? requestedTab : "journal";
  const expanded = node.props.expanded !== false;
  const panels = React.Children.toArray(children);
  const activePanel = activeTab === "blueprint" ? panels[0] : activeTab === "participants" ? panels[2] : panels[1];

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
    <>
      <div className={styles.contextStrip} aria-label="Harness context">
        {panels[3]}
      </div>
      <aside
        ref={harnessRef}
        aria-label="GIK control harness"
        className={styles.harness}
        style={{
          position: "fixed",
          inset: "64px 0 72px auto",
          zIndex: 30,
          width: expanded ? "min(500px, calc(100vw - 32px))" : "48px",
          height: expanded ? "calc(100dvh - 136px)" : "48px",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          overflow: "hidden",
          border: "1px solid color-mix(in srgb, #315f72 42%, var(--line))",
          borderRight: 0,
          borderRadius: "8px 0 0 8px",
          background: "linear-gradient(180deg, #f9fcfd 0%, var(--panel) 28%, #f2f7f9 100%)",
          boxShadow: "-3px 3px 7px rgba(31, 67, 83, .14), -14px 18px 34px rgba(31, 67, 83, .16)",
          "--accent": "#315f72",
          "--panel": "#f7fbfc",
          "--panel-2": "#e7f0f3",
          "--line": "#abc1ca",
        } as React.CSSProperties}
      >
      <header style={{ position: "relative", display: "grid", gap: "12px", padding: expanded ? "12px 14px 0" : 0, borderBottom: expanded ? "1px solid var(--line)" : 0, background: "color-mix(in srgb, #d7e8ee 72%, var(--panel))" }}>
        <div style={{ minHeight: "32px", display: "flex", alignItems: "center", paddingRight: "44px" }}>
          {expanded ? <strong>GIK control harness</strong> : null}
          <Button
            appearance="primary"
            icon={expanded ? <ChevronRight20Regular /> : <ChevronLeft20Regular />}
            aria-label={expanded ? "Collapse control harness" : "Expand control harness"}
            title={expanded ? "Collapse control harness" : "Expand control harness"}
            style={{ position: "absolute", top: 0, right: 0, width: "44px", minWidth: "44px", height: "44px", borderRadius: "0 0 0 6px", backgroundColor: "#315f72", color: "white" }}
            onClick={toggleExpanded}
          />
        </div>
        {expanded ? <TabList
          aria-label="Control harness panels"
          size="small"
          selectedValue={activeTab}
          style={{ maxWidth: "100%", overflowX: "auto" }}
          onTabSelect={(_, data) => emit("selectTab", { tab: data.value })}
        >
          <Tab value="journal">Journal / Ledger</Tab>
          <Tab value="blueprint">Blueprint</Tab>
          <Tab value="participants">Participants</Tab>
        </TabList> : null}
      </header>
      {expanded ? <div role="tabpanel" aria-label={activeTab === "blueprint" ? "Blueprint" : activeTab === "participants" ? "Participants" : "Journal and Ledger"} className={styles.panel}>
        {activeTab === "journal"
          ? <div className={styles.journalPanelContent}>{activePanel}</div>
          : <GrowingContainer followEnd="off"><div className={styles.scrollPanelContent}>{activePanel}</div></GrowingContainer>}
      </div> : null}
      </aside>
    </>
  );
};
