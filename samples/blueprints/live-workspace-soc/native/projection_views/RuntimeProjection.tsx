import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";
import type { Presentation, SocPresentationSpec } from "./types";

export const RuntimeProjection: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const frame = node.props.frame as SocPresentationSpec["frame"];
  const frameClasses: Record<SocPresentationSpec["frame"], string | undefined> = {
    shared: undefined,
    mobile: styles.frameMobile,
    laptop: styles.frameLaptop,
    pager: styles.framePager,
    workstation: styles.frameWorkstation,
    "agent-console": styles.frameAgent,
  };

  return (
    <div className={mergeClasses(styles.contextProjection, frameClasses[frame])} data-soc-viewpoint={presentation.selectedContext}>{children}</div>
  );
};
