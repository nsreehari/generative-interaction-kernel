import { ShieldLock24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { GrowingContainer } from "../../../../adapters/react/src/primitives/registry";
import { useStyles } from "./styles";
import type { Incident } from "./types";

export const SubstrateChrome: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;

  return (
    <section className={styles.shared} aria-label="Shared incident substrate">
      <header className={styles.consoleChrome}>
        <div className={styles.consoleStatus}>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={styles.pill}>{incident.governance}</span>
        </div>
      </header>
      <GrowingContainer className={styles.sharedViewport} ariaLabel="Shared substrate content">
        <div className={styles.sharedViewportContent}>{children}</div>
      </GrowingContainer>
    </section>
  );
};
