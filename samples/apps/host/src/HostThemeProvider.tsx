import React from "react";
import {
  FluentProvider,
  mergeClasses,
  makeStyles,
  tokens,
  webLightTheme,
} from "@fluentui/react-components";
import { roleVars } from "@gik/react";

const HOST_THEME_CSS = `
.gx-host * { box-sizing: border-box; }
.gx-host *::before { box-sizing: border-box; }
.gx-host *::after { box-sizing: border-box; }
.gx-host code { font-family: var(--fontFamilyMonospace); }
.gx-host .gx-muted { color: var(--muted); }

.gx-host .gx-screen { display: flex; flex-direction: column; min-height: 100vh; }
.gx-host .gx-screen-head {
  display: flex;
  align-items: baseline;
  gap: var(--spacingHorizontalM);
  padding: var(--spacingVerticalM) var(--spacingHorizontalL);
  border-bottom: var(--strokeWidthThin) solid var(--line);
  background: var(--panel);
}
.gx-host .gx-screen-head h1 { font-size: var(--fontSizeBase400); margin: 0; }
.gx-host .gx-screen-body { flex: 1; min-height: 0; display: flex; }

.gx-host .gx-row { display: flex; gap: var(--spacingHorizontalM); }
.gx-host .gx-row-split { flex: 1; min-height: 0; display: grid; grid-template-columns: 320px 1fr; width: 100%; }
.gx-host .gx-row-split > * { min-width: 0; }
.gx-host .gx-col { display: flex; flex-direction: column; gap: var(--spacingVerticalM); }

.gx-host .gx-panel { overflow-y: auto; padding: var(--spacingHorizontalL); }
.gx-host .gx-panel-rail { background: var(--panel); border-right: var(--strokeWidthThin) solid var(--line); }
.gx-host .gx-panel-detail { display: flex; flex-direction: column; gap: var(--spacingVerticalL); }
.gx-host .gx-panel-inset,
.gx-host .gx-panel-tab,
.gx-host .gx-panel-actions {
  background: var(--panel-2);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingHorizontalM);
}
.gx-host .gx-panel-actions { display: flex; gap: var(--spacingHorizontalS); flex-wrap: wrap; }
.gx-host .gx-panel-detail-body { display: flex; flex-direction: column; gap: var(--spacingVerticalM); }
.gx-host .gx-panel-footer {
  position: sticky;
  bottom: 0;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(10px);
  border-top: var(--strokeWidthThin) solid var(--line);
  margin-top: auto;
}
.gx-host .gx-panel-title {
  font-size: var(--fontSizeBase100);
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--muted);
  margin-bottom: var(--spacingVerticalSNudge);
}

.gx-host .gx-text { display: inline-block; }
.gx-host .gx-text-title { font-weight: var(--fontWeightSemibold); font-size: var(--fontSizeBase300); }
.gx-host .gx-text-subtitle,
.gx-host .gx-text-caption,
.gx-host .gx-text-muted { color: var(--muted); }
.gx-host .gx-text-caption { font-size: var(--fontSizeBase100); }
.gx-host .gx-text-code { font-family: var(--fontFamilyMonospace); color: var(--accent); }
.gx-host .gx-heading { margin: 0 0 var(--spacingVerticalS); font-size: var(--fontSizeBase300); }

.gx-host .gx-note { margin: var(--spacingVerticalXS) 0; }
.gx-host .gx-note-muted { color: var(--muted); }
.gx-host .gx-note-info {
  background: var(--panel-2);
  border: var(--strokeWidthThin) solid var(--accent);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  color: var(--text);
}

.gx-host .gx-badge {
  display: inline-block;
  font-size: var(--fontSizeBase100);
  text-transform: uppercase;
  letter-spacing: .4px;
  padding: var(--spacingVerticalXXS) var(--spacingHorizontalSNudge);
  border-radius: var(--borderRadiusCircular);
  border: var(--strokeWidthThin) solid var(--line);
  color: var(--muted);
}
.gx-host .gx-badge-draft { color: var(--warn); border-color: var(--warn); }
.gx-host .gx-badge-active { color: var(--good); border-color: var(--good); }
.gx-host .gx-badge-danger { color: var(--bad); border-color: var(--bad); }
.gx-host .gx-badge-read-only { color: var(--muted); border-color: var(--line); }
.gx-host .gx-badge-editable { color: var(--good); border-color: var(--good); }

.gx-host .gx-metric { display: flex; flex-direction: column; gap: var(--spacingVerticalXXS); }
.gx-host .gx-metric-label { font-size: var(--fontSizeBase100); color: var(--muted); }
.gx-host .gx-metric-value { font-size: var(--fontSizeBase500); }

.gx-host .gx-property { display: flex; flex-direction: column; gap: var(--spacingVerticalXXS); }
.gx-host .gx-property-label { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.gx-host .gx-property-value { font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold, 600); }

.gx-host .gx-maplist { display: flex; flex-direction: column; }
.gx-host .gx-maplist-head,
.gx-host .gx-maplist-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--spacingHorizontalL); align-items: center; }
.gx-host .gx-maplist-head { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: var(--spacingVerticalXS); border-bottom: 1px solid var(--line); }
.gx-host .gx-maplist-row { padding: var(--spacingVerticalS) 0; border-bottom: 1px solid var(--line); }
.gx-host .gx-maplist-row:last-child { border-bottom: none; }
.gx-host .gx-maplist-from { font-size: var(--fontSizeBase300); color: var(--muted); }
.gx-host .gx-maplist-to { font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold, 600); }
.gx-host .gx-maplist-arrow { color: var(--muted); font-size: var(--fontSizeBase300); }

.gx-host .gx-vocab { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--spacingHorizontalM); align-items: start; }
.gx-host .gx-vocab-group { border: 1px solid var(--line); border-radius: 8px; padding: var(--spacingVerticalM) var(--spacingHorizontalM); background: var(--gx-subtle, rgba(127, 127, 127, 0.04)); }
.gx-host .gx-vocab-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--spacingVerticalS); }
.gx-host .gx-vocab-label { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--fontWeightSemibold, 600); }
.gx-host .gx-vocab-note { font-size: var(--fontSizeBase100); color: var(--muted); font-style: italic; }
.gx-host .gx-vocab-terms { display: flex; flex-wrap: wrap; gap: var(--spacingHorizontalXS); }
.gx-host .gx-vocab-term { font-family: var(--fontFamilyMonospace, monospace); font-size: var(--fontSizeBase200); background: var(--gx-card-bg, rgba(127, 127, 127, 0.12)); border: 1px solid var(--line); border-radius: 4px; padding: 2px 7px; }
.gx-host .gx-vocab-empty { color: var(--muted); }

.gx-host .gx-list { list-style: none; margin: 0; padding: 0; }
.gx-host .gx-list-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacingHorizontalS);
  width: 100%;
  text-align: left;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  border: var(--strokeWidthThin) solid transparent;
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalMNudge);
  margin-bottom: var(--spacingVerticalXXS);
}
.gx-host .gx-list-row:hover { background: var(--panel-2); }
.gx-host .gx-list-row.selected { border-color: var(--accent); background: var(--panel-2); }
.gx-host .gx-list-primary { font-weight: var(--fontWeightSemibold); }
.gx-host .gx-list-secondary,
.gx-host .gx-list-value { margin-left: auto; font-size: var(--fontSizeBase100); color: var(--muted); }

.gx-host .gx-table { width: 100%; border-collapse: collapse; }
.gx-host .gx-table th {
  text-align: left;
  font-size: var(--fontSizeBase100);
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: var(--strokeWidthThin) solid var(--line);
  padding: var(--spacingVerticalXS) var(--spacingHorizontalS);
}
.gx-host .gx-table td {
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalS);
  border-bottom: var(--strokeWidthThin) solid var(--line);
}
.gx-host .gx-table tbody tr { cursor: pointer; }
.gx-host .gx-table tbody tr:hover { background: var(--panel-2); }

.gx-host .gx-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalXS);
  margin-bottom: var(--spacingVerticalMNudge);
}
.gx-host .gx-field-label { font-size: var(--fontSizeBase100); color: var(--muted); }
.gx-host .gx-field input,
.gx-host .gx-field textarea {
  background: var(--field-bg);
  color: var(--text);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusMedium);
  padding: var(--spacingVerticalXS) var(--spacingHorizontalSNudge);
  font: inherit;
}
.gx-host .gx-field textarea { resize: vertical; }

.gx-host .gx-btn {
  background: var(--colorNeutralBackground3);
  color: var(--text);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusMedium);
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalM);
  cursor: pointer;
  font: inherit;
}
.gx-host .gx-btn:hover { background: var(--colorNeutralBackground3Hover); }
.gx-host .gx-btn:disabled { opacity: .5; cursor: default; }
.gx-host .gx-btn-primary {
  background: var(--colorBrandBackground);
  color: var(--colorNeutralForegroundOnBrand);
  border-color: var(--colorBrandBackground);
}
.gx-host .gx-btn-primary:hover {
  background: var(--colorBrandBackgroundHover);
  border-color: var(--colorBrandBackgroundHover);
}
.gx-host .gx-btn-danger { border-color: var(--bad); color: var(--bad); }

.gx-host .gx-tabs {
  display: flex;
  gap: var(--spacingHorizontalXXS);
  border-bottom: var(--strokeWidthThin) solid var(--line);
  margin-bottom: var(--spacingVerticalM);
}
.gx-host .gx-tabs button {
  background: transparent;
  border: none;
  border-bottom: var(--strokeWidthThick) solid transparent;
  border-radius: 0;
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalM);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}
.gx-host .gx-tabs button:hover { color: var(--text); }
.gx-host .gx-tabs button.active { color: var(--text); border-bottom-color: var(--accent); }

.gx-host .gx-chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingHorizontalSNudge);
  margin: 0 0 var(--spacingVerticalMNudge);
  padding: 0;
}
.gx-host .gx-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingHorizontalSNudge);
  background: var(--field-bg);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusCircular);
  padding: var(--spacingVerticalXXS) var(--spacingHorizontalSNudge) var(--spacingVerticalXXS) var(--spacingHorizontalMNudge);
}
.gx-host .gx-chip code { color: var(--accent); }
.gx-host .gx-chip-remove {
  background: transparent;
  border: none;
  padding: 0 var(--spacingHorizontalXS);
  color: var(--muted);
  line-height: 1;
  cursor: pointer;
}
.gx-host .gx-chip-remove:hover { color: var(--bad); }

.gx-host .gx-bundle {
  border: var(--strokeWidthThin) dashed var(--line);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingHorizontalM);
  background: var(--field-bg);
}
.gx-host .gx-bundle .gx-panel-preview-board { padding: 0; overflow: visible; }
.gx-host .gx-bundle .gx-panel-preview-board > .gx-panel-title {
  color: var(--text);
  font-size: var(--fontSizeBase200);
}
.gx-host .gx-bundle .gx-panel-preview-card {
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingHorizontalMNudge);
  margin-bottom: var(--spacingVerticalMNudge);
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalXS);
}

.gx-host .gx-flow-canvas-shell {
  position: relative;
  height: 260px;
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusLarge);
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 88%, white 12%), var(--panel-2));
}
.gx-host .gx-flow-canvas-viewport {
  height: 100%;
}
.gx-host .gx-flow-canvas {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 12%, transparent), transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 92%, transparent), var(--panel-2));
}
.gx-host .infinite-canvas-edge-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
.gx-host .infinite-canvas-edge {
  pointer-events: auto;
  cursor: pointer;
}
.gx-host .infinite-canvas-edge__flow {
  animation: gx-infinite-canvas-edge-run 1.05s linear infinite;
}
.gx-host .infinite-canvas-edge.is-dimmed .infinite-canvas-edge__main,
.gx-host .infinite-canvas-edge.is-dimmed .infinite-canvas-edge__flow,
.gx-host .infinite-canvas-edge.is-dimmed .infinite-canvas-edge-label {
  opacity: 0.18;
}
.gx-host .infinite-canvas-edge-label {
  fill: var(--muted);
  font-size: 12px;
  font-weight: var(--fontWeightMedium);
}
.gx-host .infinite-canvas-edge-label.is-highlighted {
  fill: var(--text);
  font-weight: var(--fontWeightSemibold);
}
.gx-host .infinite-canvas-edge-label.is-running {
  fill: color-mix(in srgb, var(--accent) 72%, var(--text));
}
.gx-host .infinite-canvas-edge.selected .infinite-canvas-edge-label {
  fill: var(--text);
  font-weight: var(--fontWeightSemibold);
}
@keyframes gx-infinite-canvas-edge-run {
  from {
    stroke-dashoffset: 44;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.gx-host .infinite-canvas-node__row {
  display: flex;
  align-items: center;
}
.gx-host .infinite-canvas-node__rail--left,
.gx-host .infinite-canvas-node__rail--right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
.gx-host .infinite-canvas-node__rail--top,
.gx-host .infinite-canvas-node__rail--bottom {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.gx-host .infinite-canvas-node__body {
  flex: 1 1 auto;
}
.gx-host .gx-flow-node {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalXXS);
  min-width: 180px;
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusLarge);
  background: color-mix(in srgb, var(--panel) 96%, white 4%);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}
.gx-host .gx-flow-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), 0 12px 30px rgba(15, 23, 42, 0.14);
}
.gx-host .gx-flow-node-title {
  font-weight: var(--fontWeightSemibold);
  color: var(--text);
}
.gx-host .gx-flow-node-subtitle,
.gx-host .gx-flow-node-meta {
  font-size: var(--fontSizeBase100);
  color: var(--muted);
}
.gx-host .gx-flow-node-port {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.gx-host .gx-flow-node-port-left {
  justify-content: flex-start;
}
.gx-host .gx-flow-node-port-right {
  justify-content: flex-end;
}
.gx-host .gx-flow-node-port-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 82%, white 18%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--panel) 92%, white 8%);
}
.gx-host .gx-flow-node-port-label {
  white-space: nowrap;
}
.gx-host .gx-flow-node-handle {
  width: 8px;
  height: 8px;
  opacity: 0;
  pointer-events: none;
  border: 0;
  background: transparent;
}
.gx-host .gx-flow-canvas .react-flow__attribution { display: none; }
.gx-host .gx-flow-canvas .react-flow__controls,
.gx-host .gx-flow-canvas .react-flow__minimap { display: none; }
`;

const useStyles = makeStyles({
  host: {
    minHeight: "100vh",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
  },
});

interface HostThemeProviderProps {
  children: React.ReactNode;
}

export function HostThemeProvider({ children }: HostThemeProviderProps): React.ReactElement {
  const styles = useStyles();

  React.useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const prevHtmlHeight = html.style.height;
    const prevBodyMargin = body.style.margin;
    const prevBodyHeight = body.style.height;
    const prevRootHeight = root?.style.height ?? "";

    html.style.height = "100%";
    body.style.margin = "0";
    body.style.height = "100%";
    if (root) root.style.height = "100%";

    return () => {
      html.style.height = prevHtmlHeight;
      body.style.margin = prevBodyMargin;
      body.style.height = prevBodyHeight;
      if (root) root.style.height = prevRootHeight;
    };
  }, []);

  return (
    <FluentProvider theme={webLightTheme} className={mergeClasses("gx-host", styles.host)} style={roleVars(tokens)}>
      <style>{HOST_THEME_CSS}</style>
      {children}
    </FluentProvider>
  );
}