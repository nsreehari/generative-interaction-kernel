export type FocusKind = "actor" | "cell" | "token" | "entity" | "record" | "region" | "action";

export interface FocusRef {
  namespace: string;
  kind: FocusKind;
  id: string;
  relation?: "origin" | "affected" | "produced" | "consumed" | "authorized" | "observed";
}

export interface TimelineItem {
  id: string;
  source: "scenario" | "organism";
  title: string;
  summary: string;
  status: string;
  focusRefs: FocusRef[];
  scenarioStepId?: string;
  operationRecordId?: string;
  actorRef?: FocusRef;
  sequence?: number;
  timestamp?: string;
  detailFields?: Array<{ label: string; value: string }>;
  correlationId?: string;
}

export interface ControlSelection {
  source: TimelineItem["source"];
  itemId: string;
  focusRefs: FocusRef[];
}

export interface FocusTarget {
  ref: FocusRef;
  regionId: string;
  behavior: "highlight" | "select" | "reveal" | "center" | "dim-others";
  priority?: number;
}

export function selectionFromTimelineItem(item: TimelineItem): ControlSelection {
  return { source: item.source, itemId: item.id, focusRefs: [...item.focusRefs] };
}

export function focusRefMatches(candidate: FocusRef, target: FocusRef): boolean {
  return candidate.namespace === target.namespace
    && candidate.kind === target.kind
    && candidate.id === target.id;
}

export function selectionContainsFocus(
  selection: ControlSelection | undefined,
  targets: readonly FocusRef[]
): boolean {
  if (!selection) return false;
  return selection.focusRefs.some((candidate) => targets.some((target) => focusRefMatches(candidate, target)));
}

export function resolveFocusTargets(
  selection: ControlSelection | undefined,
  targets: readonly FocusTarget[]
): FocusTarget[] {
  if (!selection) return [];
  return targets
    .filter((target) => selectionContainsFocus(selection, [target.ref]))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}
