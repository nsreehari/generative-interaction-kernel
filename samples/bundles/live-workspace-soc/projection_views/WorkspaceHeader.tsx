import React from "react";
import { Button, Select } from "@fluentui/react-components";
import { ArrowLeft24Regular, ShieldLock24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { SOC_BLUEPRINT_CONTEXTS } from "../../../profiles/live-workspace-soc/compile";
import { readSocNavigation, writeSocNavigation, type SocPlane } from "../navigation";
import type { Incident, Presentation } from "./types";
import { useStyles } from "./styles";

function openOverview() {
  const url = new URL(window.location.href);
  url.searchParams.set("bundle", "samples-overview");
  window.location.href = url.toString();
}

export const WorkspaceHeader: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const presentation = node.props.presentation as unknown as Presentation;
  const consolePlane = String(node.props.consolePlane ?? "runtime") as SocPlane;
  const validContextIds = SOC_BLUEPRINT_CONTEXTS.map((item) => item.id);
  const initialNavigationRef = React.useRef(readSocNavigation(window.location.search, validContextIds));
  const emitRef = React.useRef(emit);
  const skipNavigationSyncRef = React.useRef(true);
  emitRef.current = emit;

  React.useEffect(() => {
    const requested = initialNavigationRef.current;
    if (requested.context && requested.context !== presentation.selectedContext) {
      emitRef.current("setPresentationContext", { contextId: requested.context });
    }
    if (requested.plane !== consolePlane) {
      emitRef.current("setConsolePlane", { plane: requested.plane });
    }
  }, []);

  React.useEffect(() => {
    if (skipNavigationSyncRef.current) {
      skipNavigationSyncRef.current = false;
      return;
    }
    window.history.replaceState(null, "", writeSocNavigation(window.location.href, consolePlane, presentation.selectedContext));
  }, [consolePlane, presentation.selectedContext]);

  return (
    <header className={styles.commandBar}>
      <div className={styles.identity}>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} aria-label="Return to overview" onClick={openOverview} />
        <div className={styles.identityCopy}>
          <div className={styles.eyebrow}>{incident.id} · Live Workspace : SOC</div>
          <h1 className={styles.title}>{incident.title}</h1>
        </div>
      </div>
      <div className={styles.controls}>
        <div className={styles.workspaceModeSwitch}>{children}</div>
        <label className={styles.viewpointControl}>
          <span className={styles.viewpointLabel}>View as</span>
          <Select
            className={styles.contextSelect}
            aria-label="View shared substrate as"
            value={presentation.selectedContext}
            onChange={(_, data) => emit("setPresentationContext", { contextId: data.value })}
          >
            {presentation.contexts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
        </label>
        <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
        <span className={styles.pill}>{incident.governance}</span>
      </div>
    </header>
  );
};