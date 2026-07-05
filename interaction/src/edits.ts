// Presentation edits (ADR-0018, Layer 4): a small, serializable override model applied *on top of*
// a planner's output. The planner (deterministic or AI) stays the source of truth — it re-runs on
// every context change and keeps the presentation adaptive — while an authoring session records only
// the deltas a human deliberately imposed: which regions to hide, how to re-prioritize or disclose
// them, and a preferred order. Because edits are stored as overrides (not baked-in values), a change
// the user *didn't* touch keeps flowing from the planner (a novice/expert or mobile/desktop switch
// still re-derives disclosure for every region the user left alone). This is the "editing = patches
// on a state model" seam: `applyPresentationEdits` is the pure reducer those patches drive.

import { resolveFacets } from "./interaction";
import type {
  PresentationSpec,
  PresentationRegion,
  RegionPriority,
  RegionDisclosure,
} from "./presentation";

/**
 * The override deltas an authoring session imposes on a planned presentation. Every field is a
 * *sparse* override: an absent entry means "defer to the planner". `disabled` never drops a facet
 * the interaction marks required; `order` lists the region names to lead with (any region not named
 * keeps its planner-relative order behind them).
 */
export interface PresentationEdits {
  /** region names the user hid (required facets are ignored — they can't be dropped). */
  disabled: string[];
  /** per-region priority overrides (region name -> priority). */
  priority: Record<string, RegionPriority>;
  /** per-region disclosure overrides (region name -> disclosure). */
  disclosure: Record<string, RegionDisclosure>;
  /** the leading region order the user pinned (unlisted regions follow in planner order). */
  order: string[];
}

/** The no-op edit set: defer entirely to the planner. */
export const emptyEdits: PresentationEdits = { disabled: [], priority: {}, disclosure: {}, order: [] };

/**
 * Apply an authoring session's overrides to a planned presentation, yielding the edited one. Pure:
 * it hides disabled (non-required) regions, overrides priority/disclosure only where the user set
 * them, and pins the requested lead order — leaving everything else exactly as the planner decided.
 */
export function applyPresentationEdits(spec: PresentationSpec, edits: PresentationEdits): PresentationSpec {
  const required = new Set(resolveFacets(spec.source).filter((f) => f.required).map((f) => f.name));
  const disabled = new Set(edits.disabled);

  let regions: PresentationRegion[] = spec.regions
    .filter((r) => !(disabled.has(r.name) && !required.has(r.name)))
    .map((r) => {
      const priority = edits.priority[r.name] ?? r.priority;
      const disclosure = edits.disclosure[r.name] ?? r.disclosure;
      return priority === r.priority && disclosure === r.disclosure ? r : { ...r, priority, disclosure };
    });

  if (edits.order.length) {
    const rank = new Map(edits.order.map((n, i) => [n, i]));
    // stable sort: pinned names lead in their pinned order; the rest keep planner-relative order.
    regions = regions
      .map((r, i) => ({ r, key: rank.has(r.name) ? rank.get(r.name)! : edits.order.length + i }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.r);
  }

  return { ...spec, regions };
}
