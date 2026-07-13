// Layer 3 — the Interaction Model (ADR-0018).
//
// An interaction is not a screen and not a component: it is a *human goal pattern*
// (investigate, compare, review, approve, monitor, ...). The same interaction shows up
// across every domain — "investigate an incident" (security), "investigate why a meeting
// failed" (productivity), "review a candidate" (HR) — the noun changes, the interaction
// does not. So this layer is domain-neutral and platform-owned.
//
import type { Json } from "../../../kernel/src/index";

import type { Action } from "../../../kernel/src/index";

// NOTE on the word "capabilities": at this layer it means experience *facets*
// (timeline / evidence / actions) an interaction is made of. This is a DIFFERENT concept
// from a kernel "capability" (a UI component kind like board/metric/table). We keep the
// user-facing DSL field named `capabilities` but resolve it internally as `facets`.

/** The interaction taxonomy — the platform's owned vocabulary of human goal patterns. */
export type InteractionKind =
  | "investigate"
  | "compare"
  | "review"
  | "approve"
  | "monitor"
  | "explore"
  | "create"
  | "configure"
  | "collaborate"
  | "plan"
  | "learn"
  | "decide";

/** A statement of interaction intent — the equivalent of a React component, one level up. */
export interface InteractionFacetView {
  /** Optional concrete kernel capability for this facet (e.g. ui:selection, ui:searchbox). */
  capability?: string;
  /** Optional static capability props/spec that must survive into node.props. */
  props?: Record<string, Json>;
  /** Optional explicit read edge overrides carried all the way to lowering. */
  read?: Record<string, string>;
  /** Optional explicit shaped read overrides carried all the way to lowering. */
  readExpr?: Record<string, string>;
  /** Optional explicit runtime event handlers carried all the way to lowering. */
  on?: Record<string, Action[]>;
  /** Optional concrete presentation hint (e.g. relationship_graph, timeline). */
  presentation?: string;
}

export interface InteractionSpec {
  interaction: InteractionKind;
  /** the domain noun under interaction (e.g. "incident", "candidate", "expense"). */
  subject: string;
  /** experience facets to provide; omitted = the taxonomy's default facets for this kind. */
  capabilities?: string[];
  /** the goal behind the interaction, carried for downstream compilation / telemetry. */
  intent?: { goal?: string; [k: string]: unknown };
  /** facet -> namespace path the facet reads its data from (domain/profile supplied). */
  data?: Record<string, string>;
  /** facet -> authored concrete capability/spec hints preserved into presentation + lowering. */
  facetViews?: Record<string, InteractionFacetView>;
}

/**
 * A facet's semantic display ROLE — what kind of thing it shows, still not a component.
 * A lowering recipe maps a role or region to one of a profile's kernel capabilities, so a
 * profile can stay data-driven instead of hard-coding facet-by-facet mappings in TypeScript.
 */
export type FacetRole =
  | "summary"
  | "collection"
  | "detail"
  | "timeline"
  | "graph"
  | "narrative"
  | "metrics"
  | "status"
  | "form"
  | "actions"
  | "comparison"
  | "recommendation";

/** One facet of an interaction: a named part, its display role, and whether it is core. */
export interface Facet {
  /** stable facet id; also the presentation region name. */
  name: string;
  /** semantic role a lowering recipe resolves to a capability. */
  role: FacetRole;
  /** required facets are never dropped on constrained surfaces; optional ones may be shed. */
  required: boolean;
}

/**
 * What each interaction is *made of*. This is the platform "already knowing" that an
 * investigation needs context/evidence/timeline/relationships/actions — the app never
 * chooses grid/panel/tree; it only states the interaction, and the platform owns the rest.
 * `required` marks the facets an interaction cannot be itself without.
 */
export const interactionTaxonomy: Record<InteractionKind, Facet[]> = {
  investigate: [
    { name: "context", role: "narrative", required: true },
    { name: "evidence", role: "collection", required: true },
    { name: "timeline", role: "timeline", required: true },
    { name: "relationships", role: "graph", required: false },
    { name: "explanation", role: "narrative", required: true },
    { name: "actions", role: "actions", required: true },
  ],
  compare: [
    { name: "left", role: "detail", required: true },
    { name: "right", role: "detail", required: true },
    { name: "diff", role: "comparison", required: true },
    { name: "recommendation", role: "recommendation", required: false },
  ],
  review: [
    { name: "summary", role: "summary", required: true },
    { name: "detail", role: "collection", required: true },
    { name: "actions", role: "actions", required: false },
  ],
  approve: [
    { name: "explanation", role: "narrative", required: true },
    { name: "action", role: "actions", required: true },
  ],
  monitor: [
    { name: "status", role: "status", required: true },
    { name: "metrics", role: "metrics", required: true },
    { name: "alerts", role: "collection", required: false },
  ],
  explore: [
    { name: "overview", role: "summary", required: true },
    { name: "facets", role: "collection", required: false },
    { name: "results", role: "collection", required: true },
  ],
  create: [
    { name: "form", role: "form", required: true },
    { name: "preview", role: "detail", required: false },
    { name: "actions", role: "actions", required: true },
  ],
  configure: [
    { name: "settings", role: "form", required: true },
    { name: "preview", role: "detail", required: false },
    { name: "actions", role: "actions", required: true },
  ],
  collaborate: [
    { name: "participants", role: "collection", required: false },
    { name: "thread", role: "collection", required: true },
    { name: "actions", role: "actions", required: true },
  ],
  plan: [
    { name: "timeline", role: "timeline", required: true },
    { name: "tasks", role: "collection", required: true },
    { name: "actions", role: "actions", required: false },
  ],
  learn: [
    { name: "content", role: "narrative", required: true },
    { name: "progress", role: "status", required: false },
    { name: "actions", role: "actions", required: false },
  ],
  decide: [
    { name: "options", role: "collection", required: true },
    { name: "criteria", role: "detail", required: false },
    { name: "recommendation", role: "recommendation", required: true },
    { name: "action", role: "actions", required: true },
  ],
};

/**
 * Resolve a spec's facets as full descriptors. Explicit `capabilities` override the
 * taxonomy: names that match a known facet keep their role/required; unknown names become
 * required `detail` facets.
 */
export function resolveFacets(spec: InteractionSpec): Facet[] {
  if (spec.capabilities?.length) {
    const byName = new Map(interactionTaxonomy[spec.interaction].map((f) => [f.name, f]));
    return spec.capabilities.map(
      (name) => byName.get(name) ?? { name, role: "detail" as FacetRole, required: true }
    );
  }
  return interactionTaxonomy[spec.interaction];
}
