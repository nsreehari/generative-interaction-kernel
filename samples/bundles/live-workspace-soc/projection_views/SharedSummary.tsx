import { DataTrending24Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";
import type { JournalEntry, Presentation, SubstrateRegion } from "./types";

export const SharedSummary: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const regionOrder = (...regions: SubstrateRegion[]) => Math.min(...regions.map((region) => {
    const index = presentation.regions.indexOf(region);
    return index < 0 ? 50 : index;
  }));

  return (
    <header className={styles.sharedHeader} style={{ order: regionOrder("summary") }}>
      <div>
        <div className={styles.eyebrow}>One governed operational state</div>
        <h2 className={styles.sharedTitle}>Shared investigation</h2>
        <p className={styles.sharedSubhead}>Every contribution changes or challenges the same incident record.</p>
      </div>
      <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
    </header>
  );
};
