// ADR-0018: the Interaction Model (L3) / Presentation Model (L4) split, with a context-aware
// presentation compiler between them. Verifies: the same interaction yields different
// presentations by context; a compiled presentation lowers to a valid, kernel-interpretable
// document; unbound facets render as graceful fallbacks (forward-compat); and the full
// Domain -> Interaction -> Presentation -> UI pipeline composes through the kernel seam.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  InMemoryStateModel,
  Kernel,
  lowerToDocument,
  pipeline,
  type DocumentPayload,
  type ManifestPayload,
  type ResolvedNode,
} from "../../kernel/src/index";
import {
  compileInteraction,
  defaultPresentationCompiler,
  facetsFor,
  facetsOf,
  interactionTaxonomy,
  layoutTemplates,
  liveCardsBinding,
  lowerPresentation,
  requiredFacets,
  type InteractionSpec,
  type PresentationContext,
} from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const manifestPayload = manifest.payload as ManifestPayload;

function findResolved(n: ResolvedNode, id: string): ResolvedNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children) {
    const hit = findResolved(c, id);
    if (hit) return hit;
  }
  return undefined;
}

test("interaction taxonomy: facets carry a role + required flag; capabilities override names", () => {
  const investigate = interactionTaxonomy.investigate;
  assert.ok(investigate.every((f) => typeof f.role === "string" && typeof f.required === "boolean"));
  assert.deepEqual(
    facetsFor({ interaction: "investigate", subject: "incident" }),
    investigate.map((f) => f.name)
  );
  // required facets are the non-optional subset
  assert.deepEqual(
    requiredFacets("investigate").map((f) => f.name),
    facetsOf("investigate").filter((f) => f.required).map((f) => f.name)
  );
  // explicit capabilities override the default facet set
  assert.deepEqual(
    facetsFor({ interaction: "investigate", subject: "incident", capabilities: ["evidence", "actions"] }),
    ["evidence", "actions"]
  );
});

test("same interaction, different presentation by context (surface + space + attention)", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };

  const desktop = defaultPresentationCompiler(spec, { surface: "desktop" });
  const mobile = defaultPresentationCompiler(spec, { surface: "mobile" });
  const copilot = defaultPresentationCompiler(spec, { surface: "copilot" });
  const compactDesktop = defaultPresentationCompiler(spec, { surface: "desktop", space: "compact" });
  const glanceable = defaultPresentationCompiler(spec, { surface: "desktop", attention: "glanceable" });

  assert.equal(desktop.layout, "investigate_workspace");
  assert.equal(desktop.arrangement, "grid");
  assert.equal(mobile.layout, "stack");
  assert.equal(copilot.layout, "narrative");
  // context refines beyond surface: a compact desktop stacks, a glanceable desktop narrates.
  assert.equal(compactDesktop.layout, "stack");
  assert.equal(glanceable.layout, "narrative");
});

test("interaction-driven templates: compare→comparison, monitor→dashboard, create→wizard", () => {
  assert.equal(
    defaultPresentationCompiler({ interaction: "compare", subject: "policy" }, { surface: "desktop" }).layout,
    "comparison"
  );
  assert.equal(
    defaultPresentationCompiler({ interaction: "monitor", subject: "fleet" }, { surface: "desktop" }).arrangement,
    "dashboard"
  );
  assert.equal(
    defaultPresentationCompiler({ interaction: "create", subject: "ticket" }, { surface: "desktop" }).arrangement,
    "wizard"
  );
  // every chosen layout name resolves to a catalog template or an interaction workspace.
  const p = defaultPresentationCompiler({ interaction: "review", subject: "x" }, { surface: "desktop" });
  assert.equal(p.layout, "review_workspace");
  assert.equal(layoutTemplates.workspace.arrangement, "grid");
});

test("a capped template sheds optional facets but never a required one", () => {
  // investigate has 4 required facets + 1 optional (relationships); narrative caps at 3.
  const copilot = defaultPresentationCompiler({ interaction: "investigate", subject: "incident" }, { surface: "copilot" });
  const required = requiredFacets("investigate").map((f) => f.name);
  for (const r of required) assert.ok(copilot.regions.includes(r), `required facet ${r} kept`);
  assert.ok(!copilot.regions.includes("relationships"), "optional facet dropped under the cap");
});

test("a review interaction lowers to a valid, kernel-interpretable document", async () => {
  const spec: InteractionSpec = {
    interaction: "review",
    subject: "card_data",
    data: { summary: "computed_values.total", detail: "fetched_sources.orders" },
  };
  const ctx: PresentationContext = { surface: "desktop" };

  // validate-before-commit through the kernel seam
  const message = lowerToDocument((s: InteractionSpec) => compileInteraction(s, ctx, liveCardsBinding), spec);
  assert.equal(message.type, "document");
  assert.equal(message.payload.root.capability, "board");

  const state = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  state.apply([
    { op: "set", path: "computed_values.total", value: 150 },
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 10 }] },
  ]);
  const k = new Kernel(manifest, message, { state });
  k.init();

  const resolved = await k.resolve();
  const summary = findResolved(resolved, "summary-region");
  assert.equal(summary?.capability, "metric", "summary role bound to metric");
  assert.equal(summary?.props.value, 150, "metric reads its facet's data source");
  assert.equal(summary?.fallback, false);

  // the detail region's select event writes card_data.selected
  await k.dispatch({ node: "detail-region", name: "rowSelect", payload: { id: "order-42" } });
  assert.equal((k.state() as any).card_data.selected, "order-42");
});

test("unbound facet roles render as graceful fallbacks (forward-compatible)", async () => {
  // investigate's `relationships` facet has role `graph`, which live-cards does not bind;
  // its `actions` facet (role `actions`) is bound. Bound roles resolve; unbound fall back.
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };
  const message = lowerToDocument(
    (s: InteractionSpec) => compileInteraction(s, { surface: "desktop" }, liveCardsBinding),
    spec
  );
  const k = new Kernel(manifest, message, { state: new InMemoryStateModel(manifestPayload.namespaces ?? []) });
  k.init();
  const resolved = await k.resolve();

  assert.equal(findResolved(resolved, "relationships-region")?.fallback, true, "unbound `graph` role falls back");
  assert.equal(findResolved(resolved, "actions-region")?.fallback, false, "bound `actions` role resolves");
});

test("full pipeline: Domain -> Interaction -> Presentation -> UI composes through the seam", () => {
  interface IncidentDomain {
    incidentId: string;
    severity: string;
  }
  // Domain -> Interaction (L2 -> L3): the domain team states the interaction, not the UI.
  const toInteraction = (d: IncidentDomain): InteractionSpec => ({
    interaction: "investigate",
    subject: "incident",
    intent: { goal: "identify_root_cause", severity: d.severity, id: d.incidentId },
  });
  // Interaction -> UI (L3 -> L4 -> UI): compile with a context + profile binding.
  const toDocument = (s: InteractionSpec): DocumentPayload =>
    compileInteraction(s, { surface: "mobile" }, liveCardsBinding);

  const compiled = pipeline(toInteraction).to(toDocument).build();
  const message = lowerToDocument(compiled, { incidentId: "INC-123", severity: "high" });
  assert.equal(message.payload.root.capability, "board");
  assert.equal(message.payload.root.props?.layout, "stack", "mobile context chose the stack layout");
  assert.equal(message.payload.root.props?.arrangement, "stack");
});

// lowerPresentation is exercised indirectly via compileInteraction; assert it is exported/usable.
void lowerPresentation;
