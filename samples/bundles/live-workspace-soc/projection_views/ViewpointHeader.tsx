import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";
import type { Presentation } from "./types";

export const ViewpointHeader: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];

  return (
    <header className={styles.viewpointIdentity} style={{ order: -2 }}>
      <div>
        <div className={styles.eyebrow}>{selectedContext.audience}</div>
        <h2 className={styles.viewpointName}>{selectedContext.label}</h2>
      </div>
      <span className={styles.viewpointDevice}>{presentation.frame} · {presentation.arrangement}</span>
    </header>
  );
};
