import { createContext, useContext, type ReactNode } from "react";
import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import {
  selectionFromTimelineItem,
  type DemoSelection,
  type TimelineItem,
} from "../../../shared/demo-runner";
import { socJournalTimelineItem } from "./helpers";
import { useStyles } from "./styles";
import type { Actor, JournalEntry, Presentation } from "./types";

interface PresentationMaterialization {
  activeSelection?: DemoSelection;
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
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const selectedJournalId = typeof node.props.selectedJournalId === "string" ? node.props.selectedJournalId : null;
  const demoEnabled = node.props.demoEnabled === true;
  const demoTimeline = (node.props.demoTimeline ?? []) as unknown as TimelineItem[];
  const demoSelection = (node.props.demoSelection ?? undefined) as unknown as DemoSelection | undefined;
  const latestEntry = journal.at(-1);
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? latestEntry
    : latestEntry;
  const organismTimeline = journal.map(socJournalTimelineItem);
  const timelineItems = demoEnabled ? demoTimeline : organismTimeline;
  const selectedTimelineItem = demoSelection
    ? timelineItems.find((item) => item.id === demoSelection.itemId)
    : selectedEntry ? socJournalTimelineItem(selectedEntry) : timelineItems.at(-1);
  const activeSelection = demoSelection ?? (selectedTimelineItem ? selectionFromTimelineItem(selectedTimelineItem) : undefined);
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
    activeSelection,
    actorNames: new Map(actors.map((item) => [item.id, item.name])),
    selectedTimelineItem,
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