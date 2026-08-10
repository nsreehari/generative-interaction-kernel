import React, { Children, createContext, useContext, type ComponentType, type ReactElement, type ReactNode } from "react";
import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import type { ControlSelection, TimelineItem } from "./control-focus";
import { useStyles } from "./styles";
import type { Actor, Presentation, PresentationRegionFacet } from "./types";

const kanbanColumns: Array<{ group: PresentationRegionFacet["group"]; title: string }> = [
  { group: "kanban-frame", title: "Frame" },
  { group: "kanban-explore", title: "Explore" },
  { group: "kanban-establish", title: "Establish" },
  { group: "kanban-decide", title: "Decide" },
  { group: "kanban-record", title: "Record" },
];

interface ArrangementLayoutProps {
  children: ReactNode;
  styles: ReturnType<typeof useStyles>;
}

function FlowLayout({ children }: ArrangementLayoutProps) {
  return children;
}

function KanbanLayout({ children, styles }: ArrangementLayoutProps) {
  const groupedChildren = Children.toArray(children).map((child) => {
    const element = child as ReactElement<{ node: { props: { facet: PresentationRegionFacet } } }>;
    return { child, group: element.props.node.props.facet.group };
  });

  return <div className={styles.kanbanBoard} aria-label="Investigation board">
    {kanbanColumns.map((column) => {
      const titleId = `soc-${column.group}`;
      return <section className={styles.kanbanColumn} aria-labelledby={titleId} key={column.group}>
        <h3 className={styles.kanbanColumnTitle} id={titleId}>{column.title}</h3>
        <div className={styles.kanbanCards}>{groupedChildren.filter((item) => item.group === column.group).map((item) => item.child)}</div>
      </section>;
    })}
  </div>;
}

const arrangementLayouts: Partial<Record<Presentation["arrangement"], ComponentType<ArrangementLayoutProps>>> = {
  kanban: KanbanLayout,
};

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
  const activeSelection = node.props.selection as unknown as ControlSelection | undefined;
  const arrangementClasses: Record<Presentation["arrangement"], string> = {
    "war-room": styles.arrangementWarRoom,
    inspection: styles.arrangementInspection,
    kanban: styles.arrangementKanban,
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
  };
  const ArrangementLayout = arrangementLayouts[presentation.arrangement] ?? FlowLayout;

  return (
    <PresentationMaterializationContext.Provider value={value}>
      <div
        className={mergeClasses(styles.presentationLayout, arrangementClasses[presentation.arrangement])}
        data-soc-arrangement={presentation.arrangement}
      >
        <ArrangementLayout styles={styles}>{children as ReactNode}</ArrangementLayout>
      </div>
    </PresentationMaterializationContext.Provider>
  );
};