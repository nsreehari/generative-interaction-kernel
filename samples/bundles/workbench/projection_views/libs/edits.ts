// Presentation edits (ADR-0018, Layer 4): a small, serializable override model applied *on top of*
// a planner's output. The planner (deterministic or AI) stays the source of truth — it re-runs on
// every context change and keeps the presentation adaptive — while an authoring session records only
// the deltas a human deliberately imposed: which regions to hide, how to re-prioritize or disclose
// them, and a preferred order. Because edits are stored as overrides (not baked-in values), a change
// the user *didn't* touch keeps flowing from the planner (a novice/expert or mobile/desktop switch
// still re-derives disclosure for every region the user left alone). This is the "editing = patches
// on a state model" seam: `applyPresentationEdits` is the pure reducer those patches drive.
//
// These reducers are consumed only by the workbench bundle, so they live with the sample rather than
// leaking through the shared interaction runtime package. The `PresentationEdits` type they operate on is the
// platform's sanctioned override channel and stays in the interaction package.

import type {
  InteractionSpec,
  InteractionTaxonomy,
  PresentationSpec,
  PresentationRegion,
  RegionPriority,
  RegionDisclosure,
  PresentationEdits,
} from "@gik/profile";
import { resolveFacets } from "@gik/profile";

/** The no-op edit set: defer entirely to the planner. */
export const emptyEdits: PresentationEdits = { disabled: [], priority: {}, disclosure: {}, order: [] };

/**
 * Apply an authoring session's overrides to a planned presentation, yielding the edited one. Pure:
 * it hides disabled (non-required) regions, overrides priority/disclosure only where the user set
 * them, and pins the requested lead order — leaving everything else exactly as the planner decided.
 */
export function applyPresentationEdits(
  spec: PresentationSpec,
  edits: PresentationEdits,
  taxonomy: InteractionTaxonomy
): PresentationSpec {
  const required = new Set(resolveFacets(spec.source, taxonomy).filter((f) => f.required).map((f) => f.name));
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

/** The facet descriptors an authoring "facet list" surface renders, for the current interaction. */
export function facetsAsItems(
  spec: InteractionSpec,
  taxonomy: InteractionTaxonomy
): { name: string; role: string; required: boolean }[] {
  return resolveFacets(spec, taxonomy).map((f) => ({ name: f.name, role: f.role, required: f.required }));
}

/** One row of the editing surface: a facet plus its current enabled/priority/disclosure placement. */
export type EditRegion = {
  name: string;
  role: string;
  required: boolean;
  enabled: boolean;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
};

/**
 * The editable region list an authoring editor renders: every facet of the interaction (so hidden
 * ones can be re-enabled), in the presentation's effective order, each carrying its current
 * placement. Regions present in the presentation use its planned+edited placement; hidden ones fall
 * back to any override or the neutral default. The list order drives up/down reorder controls. Pure:
 * derived entirely from the presentation (its `source` interaction + regions) and the edits.
 */
export function editableRegions(
  presentation: PresentationSpec,
  edits: PresentationEdits,
  taxonomy: InteractionTaxonomy
): EditRegion[] {
  const facets = resolveFacets(presentation.source, taxonomy);
  const present = new Map(presentation.regions.map((r) => [r.name, r]));
  const disabled = new Set(edits.disabled);
  const order = [
    ...presentation.regions.map((r) => r.name),
    ...facets.map((f) => f.name).filter((n) => !present.has(n)),
  ];
  const byName = new Map(facets.map((f) => [f.name, f]));
  return order.map((name) => {
    const f = byName.get(name)!;
    const r = present.get(name);
    return {
      name,
      role: f.role,
      required: f.required,
      enabled: !disabled.has(name),
      priority: r?.priority ?? edits.priority[name] ?? "secondary",
      disclosure: r?.disclosure ?? edits.disclosure[name] ?? "always",
    };
  });
}

// --- Region edit transforms (the write side) --------------------------------------------
// Pure prev-edits -> next-edits reducers. The editing UI's controls funnel through these, but so
// can a NON-UI caller: an agent authoring region overrides programmatically, or a test, mutates a
// PresentationEdits exactly the way the drag/select surface does — the write-side counterpart of
// editableRegions above. The order-changing transforms take the current DISPLAY order (derived from
// the full region list, which can be wider than edits.order) so pinning starts from the real
// sequence; they return the SAME edits reference on a no-op so a caller can skip a needless re-plan.

/** Toggle a region's hidden state (add to / remove from `disabled`). */
export function toggleRegion(edits: PresentationEdits, name: string): PresentationEdits {
  return {
    ...edits,
    disabled: edits.disabled.includes(name)
      ? edits.disabled.filter((n) => n !== name)
      : [...edits.disabled, name],
  };
}

/** Override a region's priority. */
export function setRegionPriority(edits: PresentationEdits, name: string, value: RegionPriority): PresentationEdits {
  return { ...edits, priority: { ...edits.priority, [name]: value } };
}

/** Override a region's disclosure. */
export function setRegionDisclosure(edits: PresentationEdits, name: string, value: RegionDisclosure): PresentationEdits {
  return { ...edits, disclosure: { ...edits.disclosure, [name]: value } };
}

/** Move `dragged` into `target`'s slot within the display order and pin the result. No-op (same ref) if either name is absent or they're equal. */
export function reorderRegion(edits: PresentationEdits, order: string[], dragged: string, target: string): PresentationEdits {
  if (dragged === target) return edits;
  const from = order.indexOf(dragged);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return edits;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return { ...edits, order: next };
}

/** Nudge a region one slot up (dir -1) or down (dir +1) within the display order and pin the result. No-op (same ref) at the ends. */
export function moveRegion(edits: PresentationEdits, order: string[], name: string, dir: -1 | 1): PresentationEdits {
  const i = order.indexOf(name);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return edits;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return { ...edits, order: next };
}
