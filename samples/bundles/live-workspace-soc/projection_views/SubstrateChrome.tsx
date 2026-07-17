import { DataTrending24Regular, ShieldLock24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";
import type { Incident, JournalEntry, Presentation, PresentationRegionFacet } from "./types";

export const SubstrateChrome: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const presentation = node.props.presentation as unknown as Presentation;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const facet = node.props.facet as unknown as PresentationRegionFacet;
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];

  return (
    <section className={styles.shared} aria-label="Shared incident substrate">
      <header
        className={styles.consoleChrome}
        data-soc-region="summary"
        data-soc-concern={facet.concern}
        data-soc-group={facet.group}
        data-soc-priority={facet.priority}
        data-soc-disclosure={facet.disclosure}
        data-soc-presentation={facet.presentation}
      >
        <div className={styles.consoleIdentity}>
          <div className={styles.eyebrow}>{selectedContext.audience}</div>
          <h2 className={styles.viewpointName}>{selectedContext.label}</h2>
        </div>
        <div className={styles.consoleStatus}>
          <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={styles.pill}>{incident.governance}</span>
        </div>
      </header>
      <div className={styles.sharedViewport} role="region" aria-label="Shared substrate content">
        <div className={styles.sharedViewportContent}>{children}</div>
      </div>
    </section>
  );
};
