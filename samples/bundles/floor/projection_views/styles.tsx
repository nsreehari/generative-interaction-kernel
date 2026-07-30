import React from "react";

/**
 * The floor design system as a single stylesheet, shipped WITH @gik/react so any consumer that
 * renders the floor primitives gets styled leaves — not just the sample host. Every rule targets
 * semantic role vars (`--panel`, `--text`, `--accent`, ...) that the consumer supplies via
 * {@link roleVars}, so the same sheet themes light/dark automatically.
 *
 * Rules are scoped under a root selector (default `.gx-host`) so the sheet never leaks onto
 * unrelated markup. Pass your own root to {@link floorStylesheet} / {@link FloorStyleSheet} when
 * you scope the FluentProvider (or role vars) to a different class.
 *
 * This sheet covers the floor LEAVES and layout utilities only. App-shell chrome (navigation rails,
 * flow-canvas surfaces, etc.) stays with the host that owns it.
 */
function buildFloorStylesheet(root: string): string {
  return `
${root} * { box-sizing: border-box; }
${root} *::before, ${root} *::after { box-sizing: border-box; }
${root} code { font-family: var(--fontFamilyMonospace); }
${root} .gx-muted { color: var(--muted); }

/* Layout utilities used by leaves. */
${root} .gx-row { display: flex; gap: var(--spacingHorizontalM); }
${root} .gx-row-between { justify-content: space-between; align-items: center; }
${root} .gx-col { display: flex; flex-direction: column; gap: var(--spacingVerticalM); }
${root} .gx-growing-container {
  width: 100%; height: 100%; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%;
  overflow: auto; overscroll-behavior: contain;
}
${root} .gx-growing-container-content { min-width: 0; min-height: 100%; }
${root} .gx-wrap { flex-wrap: wrap; }
${root} .gx-stack { display: grid; gap: var(--spacingVerticalS); }
${root} .gx-stack-tight { gap: var(--spacingVerticalXS); }
${root} .gx-stack-loose { gap: var(--spacingVerticalM); }
${root} .gx-inline { display: flex; gap: var(--spacingHorizontalS); align-items: center; }
${root} .gx-inline-wrap { display: flex; gap: var(--spacingHorizontalS); flex-wrap: wrap; }
${root} .gx-code { font-family: var(--fontFamilyMonospace); font-size: var(--fontSizeBase200); overflow-x: auto; }
${root} .gx-code pre { margin: 0; white-space: pre-wrap; word-break: break-word; }

${root} .gx-panel-inset,
${root} .gx-panel-tab {
  background: var(--panel-2);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingHorizontalM);
}
${root} .gx-panel-actions {
  display: flex;
  gap: var(--spacingHorizontalS);
  flex-wrap: wrap;
}
${root} .gx-text { display: inline-block; }
${root} .gx-text-title { font-weight: var(--fontWeightSemibold); font-size: var(--fontSizeBase300); }
${root} .gx-text-subtitle,
${root} .gx-text-caption,
${root} .gx-text-muted { color: var(--muted); }
${root} .gx-text-caption { font-size: var(--fontSizeBase100); }
${root} .gx-text-code { font-family: var(--fontFamilyMonospace); color: var(--accent); }
${root} .gx-heading { margin: 0 0 var(--spacingVerticalS); font-size: var(--fontSizeBase300); }

${root} .gx-note { margin: var(--spacingVerticalXS) 0; }
${root} .gx-note-muted { color: var(--muted); }
${root} .gx-note-info {
  background: var(--panel-2);
  border: var(--strokeWidthThin) solid var(--accent);
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  color: var(--text);
}

${root} .gx-badge {
  display: inline-block;
  font-size: var(--fontSizeBase100);
  text-transform: uppercase;
  letter-spacing: .4px;
  padding: var(--spacingVerticalXXS) var(--spacingHorizontalSNudge);
  border-radius: var(--borderRadiusCircular);
  border: var(--strokeWidthThin) solid var(--line);
  color: var(--muted);
}
${root} .gx-badge-draft { color: var(--warn); border-color: var(--warn); }
${root} .gx-badge-active { color: var(--good); border-color: var(--good); }
${root} .gx-badge-danger { color: var(--bad); border-color: var(--bad); }
${root} .gx-badge-read-only { color: var(--muted); border-color: var(--line); }
${root} .gx-badge-editable { color: var(--good); border-color: var(--good); }

${root} .gx-metric { display: flex; flex-direction: column; gap: var(--spacingVerticalXXS); }
${root} .gx-metric-label { font-size: var(--fontSizeBase100); color: var(--muted); }
${root} .gx-metric-value { font-size: var(--fontSizeBase500); }
${root} .gx-metric-detail { font-size: var(--fontSizeBase200); }

/* Markdown inline formatting: links are the only interactive inline element. */
${root} .gx-link { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
${root} .gx-link:hover { text-decoration-thickness: 2px; }
${root} .gx-markdown-code { overflow: auto; padding: var(--spacingVerticalM) var(--spacingHorizontalM); background: var(--field-bg); border: var(--strokeWidthThin) solid var(--line); border-radius: var(--borderRadiusMedium); }
${root} .gx-mermaid { overflow: auto; margin: var(--spacingVerticalM) 0; text-align: center; }
${root} .gx-mermaid svg { display: inline-block; max-width: 100%; height: auto; }

/* Field-level diff: one row per key, colored by add / remove / change. */
${root} .gx-diff { display: flex; flex-direction: column; }
${root} .gx-diff-row {
  display: grid;
  grid-template-columns: minmax(6rem, 1fr) 2fr auto 2fr;
  gap: var(--spacingHorizontalM);
  align-items: baseline;
  padding: var(--spacingVerticalXS) 0;
  border-bottom: var(--strokeWidthThin) solid var(--line);
}
${root} .gx-diff-row:last-child { border-bottom: none; }
${root} .gx-diff-key { font-size: var(--fontSizeBase200); color: var(--muted); font-family: var(--fontFamilyMonospace); }
${root} .gx-diff-before,
${root} .gx-diff-after { font-size: var(--fontSizeBase200); font-family: var(--fontFamilyMonospace); word-break: break-word; }
${root} .gx-diff-arrow { color: var(--muted); }
${root} .gx-diff-same { opacity: 0.6; }
${root} .gx-diff-added .gx-diff-after { color: var(--good); }
${root} .gx-diff-removed .gx-diff-before { color: var(--bad); text-decoration: line-through; }
${root} .gx-diff-changed .gx-diff-after { color: var(--accent); }
${root} .gx-diff-changed .gx-diff-before { color: var(--muted); text-decoration: line-through; }

${root} .gx-property { display: flex; flex-direction: column; gap: var(--spacingVerticalXXS); }
${root} .gx-property-label { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
${root} .gx-property-value { font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold, 600); }

${root} .gx-maplist { display: flex; flex-direction: column; }
${root} .gx-maplist-head,
${root} .gx-maplist-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--spacingHorizontalL); align-items: center; }
${root} .gx-maplist-head { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: var(--spacingVerticalXS); border-bottom: 1px solid var(--line); }
${root} .gx-maplist-row { padding: var(--spacingVerticalS) 0; border-bottom: 1px solid var(--line); }
${root} .gx-maplist-row:last-child { border-bottom: none; }
${root} .gx-maplist-from { font-size: var(--fontSizeBase300); color: var(--muted); }
${root} .gx-maplist-to { font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold, 600); }
${root} .gx-maplist-arrow { color: var(--muted); font-size: var(--fontSizeBase300); }

${root} .gx-vocab { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--spacingHorizontalM); align-items: start; }
${root} .gx-vocab-group { border: 1px solid var(--line); border-radius: 8px; padding: var(--spacingVerticalM) var(--spacingHorizontalM); background: var(--gx-subtle, var(--panel-2)); }
${root} .gx-vocab-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--spacingVerticalS); }
${root} .gx-vocab-label { font-size: var(--fontSizeBase100); color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--fontWeightSemibold, 600); }
${root} .gx-vocab-note { font-size: var(--fontSizeBase100); color: var(--muted); font-style: italic; }
${root} .gx-vocab-terms { display: flex; flex-wrap: wrap; gap: var(--spacingHorizontalXS); }
${root} .gx-vocab-term { font-family: var(--fontFamilyMonospace, monospace); font-size: var(--fontSizeBase200); background: var(--gx-card-bg, var(--field-bg)); border: 1px solid var(--line); border-radius: 4px; padding: 2px 7px; }
${root} .gx-vocab-empty { color: var(--muted); }

${root} .gx-list { list-style: none; margin: 0; padding: 0; }
${root} .gx-list-row {
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
${root} .gx-list-row:hover { background: var(--panel-2); }
${root} .gx-list-row.selected { border-color: var(--accent); background: var(--panel-2); }
${root} .gx-list-primary { font-weight: var(--fontWeightSemibold); }
${root} .gx-list-secondary,
${root} .gx-list-value { margin-left: auto; font-size: var(--fontSizeBase100); color: var(--muted); }

${root} .gx-table { width: 100%; border-collapse: collapse; }
${root} .gx-table th {
  text-align: left;
  font-size: var(--fontSizeBase100);
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: var(--strokeWidthThin) solid var(--line);
  padding: var(--spacingVerticalXS) var(--spacingHorizontalS);
}
${root} .gx-table td {
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalS);
  border-bottom: var(--strokeWidthThin) solid var(--line);
}
${root} .gx-table tbody tr { cursor: pointer; }
${root} .gx-table tbody tr:hover { background: var(--panel-2); }
${root} .gx-table th.gx-table-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
${root} .gx-table th.gx-table-sortable:hover { color: var(--text); }
${root} .gx-table-overflow { margin-top: var(--spacingVerticalXS); font-size: var(--fontSizeBase100); }

${root} .gx-editable-table { display: flex; flex-direction: column; gap: var(--spacingVerticalS); }
${root} .gx-table-editable tbody tr { cursor: default; }
${root} .gx-table-editable tbody tr:hover { background: transparent; }
${root} .gx-table-editable td { padding: 0; }
${root} .gx-table-editable td input {
  width: 100%;
  background: transparent;
  color: var(--text);
  border: var(--strokeWidthThin) solid transparent;
  border-radius: var(--borderRadiusSmall);
  padding: var(--spacingVerticalXS) var(--spacingHorizontalS);
  font: inherit;
}
${root} .gx-table-editable td input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--field-bg);
}
${root} .gx-table-editable .gx-cell-delete {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0 var(--spacingHorizontalXS);
  line-height: 1;
}
${root} .gx-table-editable .gx-cell-delete:hover { color: var(--bad); }

/* Data-visualization categorical palette — NOT theme roles. These named colors are chart *series*
   colors chosen for categorical distinguishability; they intentionally stay fixed rather than
   recoloring with the theme. They are the ONLY literal colors in this sheet, and they are named so
   nothing color-related here is anonymous. */
${root} {
  --gx-dataviz-violet: #8b5cf6;
  --gx-dataviz-cyan: #06b6d4;
  --gx-dataviz-magenta: #ec4899;
  --gx-dataviz-lime: #84cc16;
  --gx-dataviz-amber: #f59e0b;
  --gx-dataviz-slate: #64748b;
}

/* Chart series slots — 1-4 follow the theme's semantic roles (recolor with the theme); 5-10 draw
   from the categorical data-viz palette above. No raw hex lives in the chart component. */
${root} {
  --gx-chart-1: var(--accent);
  --gx-chart-2: var(--good);
  --gx-chart-3: var(--warn);
  --gx-chart-4: var(--bad);
  --gx-chart-5: var(--gx-dataviz-violet);
  --gx-chart-6: var(--gx-dataviz-cyan);
  --gx-chart-7: var(--gx-dataviz-magenta);
  --gx-chart-8: var(--gx-dataviz-lime);
  --gx-chart-9: var(--gx-dataviz-amber);
  --gx-chart-10: var(--gx-dataviz-slate);
}
${root} .gx-chart { display: flex; flex-direction: column; gap: var(--spacingVerticalS); }
${root} .gx-chart-grid { stroke: var(--line); stroke-width: 1; opacity: 0.5; }
${root} .gx-chart-axis-line { stroke: var(--muted); stroke-width: 1; opacity: 0.7; }
${root} .gx-chart-axis-label { fill: var(--muted); font-size: 9px; }
${root} .gx-chart-legend { display: flex; flex-wrap: wrap; gap: var(--spacingHorizontalM); }
${root} .gx-chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingHorizontalXS);
  font-size: var(--fontSizeBase100);
  color: var(--muted);
}
${root} .gx-chart-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

${root} .gx-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalXS);
  margin-bottom: var(--spacingVerticalMNudge);
}
${root} .gx-field-label { font-size: var(--fontSizeBase100); color: var(--muted); }
${root} .gx-field input,
${root} .gx-field textarea,
${root} .gx-field select {
  background: var(--field-bg);
  color: var(--text);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusMedium);
  padding: var(--spacingVerticalXS) var(--spacingHorizontalSNudge);
  font: inherit;
}
${root} .gx-field textarea { resize: vertical; }
${root} .gx-field input:read-only,
${root} .gx-field textarea:read-only,
${root} .gx-field select:disabled,
${root} .gx-field-check input:disabled { opacity: 0.55; cursor: not-allowed; }

/* Schema form: 12-column responsive grid + per-field helper text and checkbox rows. */
${root} .gx-form-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--spacingVerticalS) var(--spacingHorizontalM);
}
${root} .gx-field-cell { min-width: 0; }
${root} .gx-field-hint { font-size: var(--fontSizeBase100); color: var(--muted); }
${root} .gx-field-check {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
  margin-bottom: var(--spacingVerticalMNudge);
}
${root} .gx-col-span-1 { grid-column: span 1; }
${root} .gx-col-span-2 { grid-column: span 2; }
${root} .gx-col-span-3 { grid-column: span 3; }
${root} .gx-col-span-4 { grid-column: span 4; }
${root} .gx-col-span-5 { grid-column: span 5; }
${root} .gx-col-span-6 { grid-column: span 6; }
${root} .gx-col-span-7 { grid-column: span 7; }
${root} .gx-col-span-8 { grid-column: span 8; }
${root} .gx-col-span-9 { grid-column: span 9; }
${root} .gx-col-span-10 { grid-column: span 10; }
${root} .gx-col-span-11 { grid-column: span 11; }
${root} .gx-col-span-12 { grid-column: span 12; }
@media (max-width: 640px) {
  ${root} .gx-form-grid > * { grid-column: span 12; }
}

${root} .gx-json-field textarea.gx-json-input {
  font-family: var(--fontFamilyMonospace, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--fontSizeBase200);
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}
${root} .gx-json-field textarea.gx-json-input.invalid {
  border-color: var(--colorPaletteRedBorder2, var(--bad));
}
${root} .gx-json-error {
  font-size: var(--fontSizeBase100);
  color: var(--colorPaletteRedForeground1, var(--bad));
}
${root} .gx-form-errors { display: flex; flex-direction: column; gap: 2px; }

${root} .gx-btn {
  background: var(--colorNeutralBackground3);
  color: var(--text);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusMedium);
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalM);
  cursor: pointer;
  font: inherit;
}
${root} .gx-btn:hover { background: var(--colorNeutralBackground3Hover); }
${root} .gx-btn:disabled { opacity: .5; cursor: default; }
${root} .gx-btn-primary {
  background: var(--colorBrandBackground);
  color: var(--colorNeutralForegroundOnBrand);
  border-color: var(--colorBrandBackground);
}
${root} .gx-btn-primary:hover {
  background: var(--colorBrandBackgroundHover);
  border-color: var(--colorBrandBackgroundHover);
}
${root} .gx-btn-danger { border-color: var(--bad); color: var(--bad); }
${root} .gx-btn-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  margin-right: var(--spacingHorizontalXS);
  vertical-align: -0.15em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: gx-btn-spin 0.6s linear infinite;
}
@keyframes gx-btn-spin { to { transform: rotate(360deg); } }

${root} .gx-challenge-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: grid;
  place-items: center;
  padding: var(--spacingVerticalXXL) var(--spacingHorizontalXXL);
  background: color-mix(in srgb, var(--bg) 72%, transparent);
}
${root} .gx-challenge-dialog {
  width: min(440px, 100%);
  padding: var(--spacingVerticalXL) var(--spacingHorizontalXL);
  border: var(--strokeWidthThin) solid var(--line);
  border-top: 4px solid var(--bad);
  border-radius: var(--borderRadiusMedium);
  background: var(--panel);
  box-shadow: var(--shadow64);
}
${root} .gx-challenge-dialog h2 { margin: 0 0 var(--spacingVerticalS); font-size: var(--fontSizeBase500); }
${root} .gx-challenge-dialog p { margin: 0 0 var(--spacingVerticalL); color: var(--muted); }
${root} .gx-challenge-dialog form { display: grid; gap: var(--spacingVerticalS); }
${root} .gx-challenge-dialog input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusMedium);
  background: var(--panel-2);
  color: var(--text);
  font: inherit;
}
${root} .gx-challenge-dialog input[aria-invalid="true"] { border-color: var(--bad); }
${root} .gx-challenge-error { min-height: 1.25em; color: var(--bad); font-size: var(--fontSizeBase200); }
${root} .gx-challenge-actions { display: flex; justify-content: flex-end; gap: var(--spacingHorizontalS); }

${root} .gx-tabs {
  display: flex;
  gap: var(--spacingHorizontalXXS);
  border-bottom: var(--strokeWidthThin) solid var(--line);
  margin-bottom: var(--spacingVerticalM);
}
${root} .gx-tabs button {
  background: transparent;
  border: none;
  border-bottom: var(--strokeWidthThick) solid transparent;
  border-radius: 0;
  padding: var(--spacingVerticalSNudge) var(--spacingHorizontalM);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}
${root} .gx-tabs button:hover { color: var(--text); }
${root} .gx-tabs button.active { color: var(--text); border-bottom-color: var(--accent); }

${root} .gx-searchbox { display: flex; gap: var(--spacingHorizontalS); }
${root} .gx-searchbox input { flex: 1; }

${root} .gx-chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingHorizontalSNudge);
  margin: 0 0 var(--spacingVerticalMNudge);
  padding: 0;
}
${root} .gx-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingHorizontalSNudge);
  background: var(--field-bg);
  border: var(--strokeWidthThin) solid var(--line);
  border-radius: var(--borderRadiusCircular);
  padding: var(--spacingVerticalXXS) var(--spacingHorizontalSNudge) var(--spacingVerticalXXS) var(--spacingHorizontalMNudge);
}
${root} .gx-chip code { color: var(--accent); }
${root} .gx-chip-remove {
  background: transparent;
  border: none;
  padding: 0 var(--spacingHorizontalXS);
  color: var(--muted);
  line-height: 1;
  cursor: pointer;
}
${root} .gx-chip-remove:hover { color: var(--bad); }

/* Todo list rows. */
${root} .gx-todo-text { flex: 1; }
${root} .gx-todo-text.is-done { opacity: 0.65; text-decoration: line-through; }
`;
}

/**
 * Returns the floor design-system CSS text scoped under `root` (default `.gx-host`). Inject it into
 * a `<style>` element (or use {@link FloorStyleSheet}). Combine with {@link roleVars} applied to the
 * same root element so the `var(--role)` references resolve.
 */
export function floorStylesheet(root = ".gx-host"): string {
  return buildFloorStylesheet(root);
}

/** The floor stylesheet scoped under the default `.gx-host` root. */
export const FLOOR_STYLESHEET = buildFloorStylesheet(".gx-host");

export interface FloorStyleSheetProps {
  /** Root selector to scope the floor styles under. Defaults to `.gx-host`. */
  root?: string;
}

/** Injects {@link floorStylesheet} as a `<style>` element. */
export function FloorStyleSheet({ root = ".gx-host" }: FloorStyleSheetProps): React.ReactElement {
  return <style>{floorStylesheet(root)}</style>;
}
