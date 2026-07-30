import type { ReactNode } from "react";
import { mergeClasses } from "@fluentui/react-components";
import {
  BrainCircuit24Regular,
  DataTrending24Regular,
  ShieldLock24Regular,
  Sparkle24Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { selectionTargetsRecord } from "./helpers";
import { usePresentationMaterialization } from "./PresentationLayout";
import { useStyles } from "./styles";
import type { PresentationRegionFacet, SubstrateRegion } from "./types";

const icons = {
  intent: BrainCircuit24Regular,
  constraints: ShieldLock24Regular,
  hypothesis: BrainCircuit24Regular,
  exploration: Sparkle24Regular,
  evidence: Sparkle24Regular,
  response: ShieldLock24Regular,
  authorization: ShieldLock24Regular,
  "causal-record": DataTrending24Regular,
  "agent-request": Sparkle24Regular,
} as const;

export const RegionSurface: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const facet = node.props.facet as unknown as PresentationRegionFacet;
  const region = node.props.region as SubstrateRegion;
  const title = String(node.props.title ?? region);
  const focusTargets = (node.props.focusTargets ?? []) as unknown as string[];
  const metricValue = node.props.metricValue;
  const metricSuffix = String(node.props.metricSuffix ?? "");
  const Icon = icons[region as keyof typeof icons];
  const priorityClasses = {
    supporting: styles.regionPrioritySupporting,
    primary: styles.regionPriorityPrimary,
    critical: styles.regionPriorityCritical,
  };
  const presentationClasses = {
    brief: styles.regionPresentationBrief,
    finding: styles.regionPresentationFinding,
    collection: styles.regionPresentationCollection,
    decision: styles.regionPresentationDecision,
    audit: styles.regionPresentationAudit,
    "agent-request": styles.regionPresentationAgentRequest,
  };
  const disclosureClasses = {
    status: styles.regionDisclosureStatus,
    summary: styles.regionDisclosureSummary,
    detail: styles.regionDisclosureDetail,
    omitted: styles.regionDisclosureOmitted,
  };

  return (
    <section
      className={mergeClasses(
        styles.regionSurface,
        priorityClasses[facet.priority],
        presentationClasses[facet.presentation],
        disclosureClasses[facet.disclosure],
        selectionTargetsRecord(activeSelection, focusTargets) ? styles.causalHighlight : undefined,
      )}
      data-soc-region={region}
      data-soc-concern={facet.concern}
      data-soc-group={facet.group}
      data-soc-priority={facet.priority}
      data-soc-disclosure={facet.disclosure}
      data-soc-presentation={facet.presentation}
      style={{ order: facet.rank }}
    >
      <header className={styles.regionSurfaceHeader}>
        <h3 className={styles.regionSurfaceTitle}>{Icon ? <Icon /> : null}{title}</h3>
        {metricValue !== undefined && metricValue !== null ? <strong className={styles.regionSurfaceMetric}>{String(metricValue)}{metricSuffix}</strong> : null}
      </header>
      <div className={styles.regionSurfaceBody}>{children as ReactNode}</div>
    </section>
  );
};