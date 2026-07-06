// The live-cards profile — Layer 2 (Domain), plus its presentation binding into the
// live-cards kernel capabilities (ADR-0016/0017/0018).
//
//   Intent (agents) -> [Domain (this file)] -> Interaction Model (L3) ->
//     Presentation Model (L4) -> UI DSL / kernel doc -> Renderer
//
// This is the first real Domain profile: it models the live-cards product (the
// demo-boards-frontend board/card data model) rather than an invented example. A board is
// a set of cards; each card is authored as `view.elements[]` over the namespaces
// { card_data, requires, fetched_sources, computed_values }, with a declarative
// requires/provides/compute data-flow (see yaml-flow/schema/live-cards.schema.json).
//
// The frontend resolves a board imperatively (BoardRenderer -> PaneRenderer -> CardRenderer
// -> CardviewRenderer -> the NodeRenderer engine), and in doing so *conflates* domain with
// presentation (the pane layout is hard-coded). The platform's job is to make that lowering
// declarative and layered: a card's archetype states an INTERACTION, and the platform owns
// how it appears. This module supplies only the Domain -> Interaction step; the existing
// planner + compiler own everything below it.

import type { CapabilityDescriptor, DocumentPayload } from "../../kernel/src/index";
import {
  facetsOf,
  type FacetRole,
  type InteractionKind,
  type InteractionSpec,
} from "./interaction";
import {
  defaultPresentationPlanner,
  type PresentationContext,
  type PresentationPlanner,
} from "./presentation";
import { compileInteraction, type PresentationBinding } from "./lowering";

// --- Domain DSL (L2): the live-cards board/card/element shape --------------------------------

/** One authored render element of a card's view. A faithful subset of the schema's
 * `render_element`: value in `data` ({ bind } dynamic | { value } static), config in `spec`,
 * write target in `writeTo`, visibility predicate in `visible`. */
export interface LiveCardElement {
  /** one of the live-cards render-element kinds (metric, table, narrative, form, actions, ...). */
  kind: string;
  id?: string;
  label?: string;
  /** the value source: a namespace path (`{ bind }`) or a static literal (`{ value }`). */
  data?: { bind?: string; value?: unknown };
  /** the write target namespace path for a committed input (e.g. `card_data.note`). */
  writeTo?: string;
  /** a namespace path — the element is shown only when it resolves truthy. */
  visible?: string;
  /** per-kind static configuration. */
  spec?: Record<string, unknown>;
}

/** A card's declarative archetype — the shape of interaction it affords. Explicit on a card,
 * else inferred from its elements + data-flow (see {@link inferArchetype}). */
export type LiveCardArchetype = "kpi" | "collection" | "analysis" | "entry" | "decision";

/** A single card: its view elements plus the declarative data-flow the schema defines. */
export interface LiveCard {
  id: string;
  meta?: { title?: string; tags?: string[]; presentation?: Record<string, unknown> };
  /** optional explicit archetype; when omitted it is inferred from the card's content. */
  archetype?: LiveCardArchetype;
  /** ids of upstream cards this card depends on. */
  requires?: string[];
  /** named tokens this card exposes downstream. */
  provides?: { bindTo: string; ref: string }[];
  /** ordered compute steps writing into `computed_values`. */
  compute?: { bindTo: string; expr: string }[];
  /** external source fetches feeding `fetched_sources`. */
  sources?: { bindTo: string; outputFile: string; [k: string]: unknown }[];
  view: { elements: LiveCardElement[] };
}

/** A board: an ordered set of cards. */
export interface LiveCardsBoard {
  id: string;
  title?: string;
  cards: LiveCard[];
}

// --- Classification: card archetype -> interaction kind -------------------------------------

/** Element kinds that commit user input (the schema's COMMIT preset). */
const COMMIT_KINDS = new Set([
  "form",
  "notes",
  "selection",
  "searchbox",
  "query",
  "editable-table",
  "todo",
]);

/** Each archetype maps to exactly one platform interaction kind. */
const ARCHETYPE_INTERACTION: Record<LiveCardArchetype, InteractionKind> = {
  kpi: "monitor",
  collection: "explore",
  analysis: "investigate",
  entry: "create",
  decision: "approve",
};

/**
 * Infer a card's archetype from its content, in precedence order:
 *   1. narrative + a data-flow (sources/compute) => an analysis to investigate;
 *   2. any committed-input element         => a data-entry form to create;
 *   3. a metric/alert/badge/chart tile     => a KPI to monitor (a KPI card may also carry a
 *      supplementary list/table, so this wins over a bare collection);
 *   4. a table/list read                   => a collection to explore;
 *   5. actions with no read                => a decision to approve;
 *   6. otherwise a KPI (safe default).
 */
export function inferArchetype(card: LiveCard): LiveCardArchetype {
  const kinds = new Set(card.view.elements.map((e) => e.kind));
  const has = (...ks: string[]) => ks.some((k) => kinds.has(k));
  const hasDataFlow = (card.sources?.length ?? 0) > 0 || (card.compute?.length ?? 0) > 0;

  if (has("narrative", "markdown", "text", "markup") && hasDataFlow) return "analysis";
  if (card.view.elements.some((e) => COMMIT_KINDS.has(e.kind))) return "entry";
  if (has("metric", "alert", "badge", "chart")) return "kpi";
  if (has("table", "list", "editable-table")) return "collection";
  if (has("actions", "multi-file-upload")) return "decision";
  return "kpi";
}

/** Resolve a card's archetype (explicit wins) and the interaction it lowers to. */
export function classifyCard(card: LiveCard): { archetype: LiveCardArchetype; interaction: InteractionKind } {
  const archetype = card.archetype ?? inferArchetype(card);
  return { archetype, interaction: ARCHETYPE_INTERACTION[archetype] };
}

// --- Domain -> Interaction lowering (L2 -> L3) ----------------------------------------------

/** A live-cards render-element kind -> the facet ROLE it can satisfy. This is what lets a
 * card's authored elements be matched to the facets its interaction is made of. */
const ELEMENT_ROLE: Record<string, FacetRole> = {
  metric: "metrics",
  chart: "metrics",
  alert: "status",
  badge: "status",
  table: "collection",
  list: "collection",
  "editable-table": "collection",
  todo: "collection",
  narrative: "narrative",
  text: "narrative",
  markdown: "narrative",
  markup: "narrative",
  form: "form",
  notes: "form",
  selection: "form",
  searchbox: "form",
  query: "form",
  actions: "actions",
  "multi-file-upload": "actions",
};

/**
 * Build the interaction's `data` map (facet name -> namespace path) by matching the card's
 * data-bound elements to the interaction's facets by role. Each element is consumed at most
 * once, so two same-role facets (e.g. investigate's context + explanation) take distinct
 * elements. Static (`{ value }`) elements contribute no read edge and are skipped.
 */
function buildFacetData(card: LiveCard, interaction: InteractionKind): Record<string, string> {
  const pool = card.view.elements
    .filter((e) => typeof e.data?.bind === "string" && e.data.bind)
    .map((e) => ({ role: ELEMENT_ROLE[e.kind], bind: e.data!.bind as string, used: false }));

  const data: Record<string, string> = {};
  for (const facet of facetsOf(interaction)) {
    const match = pool.find((p) => !p.used && p.role === facet.role);
    if (match) {
      match.used = true;
      data[facet.name] = match.bind;
    }
  }
  return data;
}

/**
 * Lower one card to an interaction spec. The card's archetype picks the interaction; its
 * bound elements supply the facet data. `subject` is `card_data` — the namespace a live-cards
 * card writes into — so downstream select-edges (`${subject}.selected`) resolve to a legal
 * state path; the human title rides in `intent.goal`.
 */
export function cardToInteraction(card: LiveCard): InteractionSpec {
  const { interaction } = classifyCard(card);
  const spec: InteractionSpec = {
    interaction,
    subject: "card_data",
    intent: { goal: card.meta?.title ?? card.id, card: card.id },
    data: buildFacetData(card, interaction),
  };
  return spec;
}

/** Lower a whole board to interaction specs — one per card, in board order. */
export function lowerLiveCardsBoard(board: LiveCardsBoard): InteractionSpec[] {
  return board.cards.map(cardToInteraction);
}

// --- Presentation binding + capabilities for the live-cards kernel profile ------------------

/**
 * The live-cards profile's presentation binding: maps facet ROLES to live-cards kernel
 * capabilities (bind once per role, not per facet). The one remaining unmapped role (`graph`)
 * falls back to the region name as the capability and renders as a graceful fallback node —
 * the forward-compatible path for a facet the profile hasn't implemented yet.
 *
 * Text/status/form roles bind to their OWN capabilities (narrative/badge/form) rather than
 * collapsing onto metric: a prose narrative, a status badge, and a data-entry form are distinct
 * surfaces in the demo-boards vocabulary, and flattening them to `metric` was lossy. `summary`
 * stays on `metric` — a review/explore headline is a KPI-style figure.
 */
export const liveCardsBinding: PresentationBinding = {
  container: "board",
  roleCapability: {
    summary: "metric",
    metrics: "metric",
    status: "badge",
    narrative: "narrative",
    recommendation: "narrative",
    collection: "table",
    detail: "table",
    timeline: "table",
    comparison: "table",
    form: "form",
    actions: "actions",
    // `graph` intentionally unmapped -> graceful fallback (no chart capability yet).
  },
  regionSelectEvent: {
    detail: "rowSelect",
    left: "rowSelect",
    right: "rowSelect",
    results: "rowSelect",
    options: "rowSelect",
    alerts: "rowSelect",
    tasks: "rowSelect",
    thread: "rowSelect",
  },
};

/** The live-cards capability descriptors the compiler consults for the read-edge prop
 * (metric -> `value`, narrative -> `text`, badge -> `value`, table -> `rows`), so bound facet
 * data lands on the prop each capability actually reads. `form` is a write surface (no bound
 * read); it emits `submit`. */
export const liveCardsCapabilities: Record<string, CapabilityDescriptor> = {
  board: { slots: ["children"] },
  metric: { dataProp: "value" },
  narrative: { dataProp: "text" },
  badge: { dataProp: "value" },
  table: { dataProp: "rows", emits: ["rowSelect"] },
  form: { emits: ["submit"] },
  actions: { emits: ["tap"] },
};

/** A card lowered all the way to a kernel document, with the intermediate interaction kept. */
export interface LoweredLiveCard {
  card: LiveCard;
  interaction: InteractionSpec;
  document: DocumentPayload;
}

/**
 * The full profile pipeline for a board: Domain -> Interaction -> Presentation -> UI document,
 * one document per card, using the live-cards binding + capabilities. Swap `planner` to drop in
 * an AI presentation planner. Each card lowers to its own board-rooted document (composing the
 * cards into a single board doc is a later slice).
 */
export function compileLiveCardsBoard(
  board: LiveCardsBoard,
  ctx: PresentationContext,
  planner: PresentationPlanner = defaultPresentationPlanner
): LoweredLiveCard[] {
  return board.cards.map((card) => {
    const interaction = cardToInteraction(card);
    const document = compileInteraction(interaction, ctx, liveCardsBinding, planner, liveCardsCapabilities);
    return { card, interaction, document };
  });
}
