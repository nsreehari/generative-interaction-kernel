import React from "react";
import { Select } from "@fluentui/react-components";
import { ShieldLock24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { GrowingContainer } from "../../../../adapters/react/src/primitives/registry";
import { SOC_BLUEPRINT_CONTEXTS } from "../../../profiles/live-workspace-soc/compile";
import { readSocNavigation, writeSocNavigation, type SocPlane } from "../navigation";
import { useStyles } from "./styles";
import type { Incident, Presentation } from "./types";

export const SubstrateChrome: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const presentation = node.props.presentation as unknown as Presentation;
  const consolePlane = String(node.props.consolePlane ?? "runtime") as SocPlane;
  const [inspectorMode, ...faces] = React.Children.toArray(children);
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
    <section className={styles.shared} aria-label="Shared incident substrate">
      <header className={styles.consoleChrome}>
        <div className={styles.workspaceModeSwitch}>{inspectorMode}</div>
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
        <div className={styles.consoleStatus}>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={styles.pill}>{incident.governance}</span>
        </div>
      </header>
      <GrowingContainer className={styles.sharedViewport} ariaLabel="Shared substrate content">
        <div className={styles.sharedViewportContent}>{faces}</div>
      </GrowingContainer>
    </section>
  );
};
