import { DataTrending24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";
import type { JournalEntry, Presentation, PresentationRegionFacet } from "./types";

export const ViewpointHeader: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const facet = node.props.facet as unknown as PresentationRegionFacet;
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];

  return (
    <header
      className={styles.viewpointIdentity}
      data-soc-region="summary"
      data-soc-concern={facet.concern}
      data-soc-group={facet.group}
      data-soc-priority={facet.priority}
      data-soc-disclosure={facet.disclosure}
      data-soc-presentation={facet.presentation}
      style={{ order: -2 }}
    >
      <div>
        <div className={styles.eyebrow}>{selectedContext.audience}</div>
        <h2 className={styles.viewpointName}>{selectedContext.label}</h2>
      </div>
      <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
    </header>
  );
};
