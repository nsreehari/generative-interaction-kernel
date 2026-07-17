import { createContext, useContext, type ReactNode } from "react";
import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import type { ControlSelection, TimelineItem } from "../../../shared/control-focus";
import { useStyles } from "./styles";
import type { Actor, Presentation } from "./types";

interface PresentationMaterialization {
  activeSelection?: ControlSelection;
  actorNames: Map<string, string>;
  selectedTimelineItem?: TimelineItem;
}

const PresentationMaterializationContext = createContext<PresentationMaterialization>({
  actorNames: new Map(),
});

export function usePresentationMaterialization(): PresentationMaterialization {
  return useContext(PresentationMaterializationContext);
}

export const PresentationLayout: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const arrangementClasses: Record<Presentation["arrangement"], string> = {
    "war-room": styles.arrangementWarRoom,
    inspection: styles.arrangementInspection,
    decision: styles.arrangementDecision,
    command: styles.arrangementCommand,
    glanceable: styles.arrangementGlanceable,
    investigation: styles.arrangementInvestigation,
    "agent-correlation": styles.arrangementAgent,
    "agent-response": styles.arrangementAgent,
  };

  const value: PresentationMaterialization = {
    actorNames: new Map(actors.map((item) => [item.id, item.name])),
  };

  return (
    <PresentationMaterializationContext.Provider value={value}>
      <div
        className={mergeClasses(styles.presentationLayout, arrangementClasses[presentation.arrangement])}
        data-soc-arrangement={presentation.arrangement}
      >
        {children as ReactNode}
      </div>
    </PresentationMaterializationContext.Provider>
  );
};