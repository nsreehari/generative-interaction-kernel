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

.gx-host .gx-metric { display: flex; flex-direction: column; gap: var(--spacingVerticalXXS); }
.gx-host .gx-metric-label { font-size: var(--fontSizeBase100); color: var(--muted); }
.gx-host .gx-metric-value { font-size: var(--fontSizeBase500); }

.gx-host .gx-list { list-style: none; margin: 0; padding: 0; }
.gx-host .gx-list-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "primary badge" "value value";
  gap: var(--spacingVerticalXXS) var(--spacingHorizontalS);
  width: 100%;
  text-align: left;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  border: var(--strokeWidthThin) solid transparent;
  border-radius: var(--borderRadiusLarge);
  padding: var(--spacingVerticalS) var(--spacingHorizontalMNudge);
  margin-bottom: var(--spacingVerticalXS);
}
.gx-host .gx-list-row:hover { background: var(--panel-2); }
.gx-host .gx-list-row.selected { border-color: var(--accent); background: var(--panel-2); }
.gx-host .gx-list-primary { grid-area: primary; font-weight: var(--fontWeightSemibold); }
.gx-host .gx-list-row .gx-badge { grid-area: badge; }
.gx-host .gx-list-secondary,
.gx-host .gx-list-value { grid-area: value; font-size: var(--fontSizeBase100); }

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