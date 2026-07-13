// ADR-0018: the Interaction Model (L3) / Presentation Model (L4) split, with a context-aware
// presentation compiler between them. Verifies: the same interaction yields different
// presentations by context; a compiled presentation lowers to a valid, kernel-interpretable
// document; unbound facets render as graceful fallbacks (forward-compat); and the full
// Domain -> Interaction -> Presentation -> UI pipeline composes through the kernel seam.

import { test } from "vitest";
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
  interactionTaxonomy,
  lowerPresentation,
  planPresentationWithRecipe,
  recipeForKinds,
  resolveFacets,
  validatePresentationSpec,
  type InteractionSpec,
  type PresentationContext,
  type PresentationSpec,
} from "../src/index";
import { liveCardsProfile } from "./live-cards-fixture";

/** Non-throwing validation helper, local to the test: does the artifact pass its schema? */
const isValidPresentationSpec = (spec: unknown): boolean => {
  try {
    validatePresentationSpec(spec);
    return true;
  } catch {
    return false;
  }
};

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const manifestPayload = manifest.payload as ManifestPayload;
const liveCardsIToP = recipeForKinds(liveCardsProfile, "interaction", "presentation");
const planner = (spec: InteractionSpec, ctx: PresentationContext): PresentationSpec =>
  planPresentationWithRecipe(spec, ctx, liveCardsIToP);
const layoutTemplates = Object.fromEntries(liveCardsIToP.templates.map((t) => [t.name, t]));

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
  // default facet resolution returns the taxonomy facets in order
  assert.deepEqual(
    resolveFacets({ interaction: "investigate", subject: "incident" }).map((f) => f.name),
    investigate.map((f) => f.name)
  );
  // explicit capabilities override the default facet set
  assert.deepEqual(
    resolveFacets({ interaction: "investigate", subject: "incident", capabilities: ["evidence", "actions"] }).map(
      (f) => f.name
    ),
    ["evidence", "actions"]
  );
});

test("same interaction, different presentation by context (surface + space + attention)", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };

  const desktop = planner(spec, { surface: "desktop" });
  const mobile = planner(spec, { surface: "mobile" });
  const copilot = planner(spec, { surface: "copilot" });
  const compactDesktop = planner(spec, { surface: "desktop", space: "compact" });
  const glanceable = planner(spec, { surface: "desktop", attention: "glanceable" });

  assert.equal(desktop.layout, "investigate_workspace");
  assert.equal(desktop.arrangement, "grid");
  assert.equal(mobile.layout, "stack");
  assert.equal(copilot.layout, "narrative");
  // context refines beyond surface: a compact desktop stacks, a glanceable desktop narrates.
  assert.equal(compactDesktop.layout, "stack");
  assert.equal(glanceable.layout, "narrative");

  // desktop and mobile carry the SAME facets (nothing dropped) but adapt DISCLOSURE by context.
  assert.deepEqual(
    desktop.regions.map((r) => r.name),
    mobile.regions.map((r) => r.name)
  );
  const evidenceDesktop = desktop.regions.find((r) => r.name === "evidence");
  const evidenceMobile = mobile.regions.find((r) => r.name === "evidence");
  assert.equal(evidenceDesktop?.disclosure, "always", "secondary region shown up front on desktop");
  assert.equal(evidenceMobile?.disclosure, "collapsed", "same region folds on a constrained surface");
});

test("interaction-driven templates: compare→comparison, monitor→dashboard, create→wizard", () => {
  assert.equal(
    planner({ interaction: "compare", subject: "policy" }, { surface: "desktop" }).layout,
    "comparison"
  );
  assert.equal(
    planner({ interaction: "monitor", subject: "fleet" }, { surface: "desktop" }).arrangement,
    "dashboard"
  );
  assert.equal(
    planner({ interaction: "create", subject: "ticket" }, { surface: "desktop" }).arrangement,
    "wizard"
  );
  // every chosen layout name resolves to a catalog template or an interaction workspace.
  const p = planner({ interaction: "review", subject: "x" }, { surface: "desktop" });
  assert.equal(p.layout, "review_workspace");
  assert.equal(layoutTemplates.workspace.arrangement, "grid");
});

test("a capped template sheds optional facets but never a required one", () => {
  // investigate has 5 required facets + 1 optional (relationships); narrative caps at 3.
  const copilot = planner({ interaction: "investigate", subject: "incident" }, { surface: "copilot" });
  const names = copilot.regions.map((r) => r.name);
  const required = interactionTaxonomy.investigate.filter((f) => f.required).map((f) => f.name);
  for (const r of required) assert.ok(names.includes(r), `required facet ${r} kept`);
  assert.ok(!names.includes("relationships"), "optional facet dropped under the cap");
});

test("a region carries information hierarchy, disclosure, and a presentation-type hint", () => {
  const p = planner({ interaction: "investigate", subject: "incident" }, { surface: "desktop" });
  const lead = p.regions[0];
  assert.equal(lead.priority, "primary", "the lead region is primary");
  assert.equal(lead.disclosure, "always", "a primary region is always shown");

  const relationships = p.regions.find((r) => r.name === "relationships");
  assert.equal(relationships?.priority, "tertiary", "an optional facet is tertiary");
  assert.equal(relationships?.disclosure, "collapsed", "a tertiary region folds by default on desktop");
  assert.equal(relationships?.presentation, "relationship_graph", "graph role gets a presentation-type hint");

  // on a constrained surface, tertiary disclosure tightens further.
  const glance = planner(
    { interaction: "investigate", subject: "incident" },
    { surface: "desktop", attention: "glanceable" }
  );
  const tertiary = glance.regions.find((r) => r.priority === "tertiary");
  if (tertiary) assert.equal(tertiary.disclosure, "on-demand", "tertiary defers on a glanceable surface");
});

test("the planner adapts to accessibility context (device + expertise) and explains itself", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };

  const expert = planner(spec, { surface: "desktop", expertise: "expert" });
  const novice = planner(spec, { surface: "desktop", expertise: "novice" });

  // a secondary (required, non-lead) region: novices see it up front, experts tolerate it deferred.
  const evNovice = novice.regions.find((r) => r.name === "evidence");
  const evExpert = expert.regions.find((r) => r.name === "evidence");
  assert.equal(evNovice?.disclosure, "always", "novices are guided: more shown up front");
  assert.equal(evExpert?.disclosure, "collapsed", "experts tolerate denser, deferred detail");

  // voice is a constrained device even on a desktop surface.
  const voice = planner(spec, { surface: "desktop", device: "voice" });
  assert.equal(
    voice.regions.find((r) => r.name === "evidence")?.disclosure,
    "collapsed",
    "a voice device tightens disclosure"
  );

  // every region carries an inspectable rationale (the explainability output an AI planner fills).
  for (const r of expert.regions) {
    assert.ok(r.rationale && r.rationale.length > 0, `region ${r.name} carries a rationale`);
  }
  assert.ok(isValidPresentationSpec(expert), "the enriched spec still validates against its schema");
});

test("the Presentation DSL is a validatable artifact", () => {
  const p = planner({ interaction: "investigate", subject: "incident" }, { surface: "desktop" });
  assert.doesNotThrow(() => validatePresentationSpec(p), "a planned spec passes its own schema");
  assert.ok(isValidPresentationSpec(p));

  // a malformed artifact (bad enum) is rejected at this boundary.
  const bad = { ...p, regions: [{ name: "x", role: "summary", priority: "huge", disclosure: "always" }] };
  assert.ok(!isValidPresentationSpec(bad));
  assert.throws(() => validatePresentationSpec(bad));
});

test("a review interaction lowers to a valid, kernel-interpretable document", async () => {
  const spec: InteractionSpec = {
    interaction: "review",
    subject: "card_data",
    data: { summary: "computed_values.total", detail: "fetched_sources.orders" },
  };
  const ctx: PresentationContext = { surface: "desktop" };

  // validate-before-commit through the kernel seam
  const message = lowerToDocument((s: InteractionSpec) => compileInteraction(s, ctx, liveCardsProfile), spec);
  assert.equal(message.type, "document");
  assert.equal(message.payload.root.capability, "ui:board");

  const state = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  state.apply([
    { op: "set", path: "computed_values.total", value: 150 },
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 10 }] },
  ]);
  const k = new Kernel(manifest, message, { state });
  k.init();

  const resolved = await k.resolve();
  const summary = findResolved(resolved, "summary-region");
  assert.equal(summary?.capability, "ui:metric", "summary role bound to metric");
  assert.equal(summary?.props.value, 150, "metric reads its facet's data source");
  assert.equal(summary?.fallback, false);

  // the detail region's select event writes card_data.selected
  await k.dispatch({ node: "detail-region", name: "rowSelect", payload: { id: "order-42" } });
  assert.equal((k.state() as any).card_data.selected, "order-42");
});

test("specific live-cards regions can target distinct floor leaves above coarse role rules", async () => {
  const spec: InteractionSpec = { interaction: "plan", subject: "incident" };
  const message = lowerToDocument(
    (s: InteractionSpec) => compileInteraction(s, { surface: "desktop" }, liveCardsProfile),
    spec
  );
  const k = new Kernel(manifest, message, { state: new InMemoryStateModel(manifestPayload.namespaces ?? []) });
  k.init();
  const resolved = await k.resolve();

  assert.equal(findResolved(resolved, "tasks-region")?.capability, "ui:todo", "tasks region upgrades collection -> todo");
  assert.equal(findResolved(resolved, "tasks-region")?.fallback, false, "tasks region resolves through the floor");
});

test("graph and narrative regions resolve to distinct floor leaves when region rules override them", async () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };
  const message = lowerToDocument(
    (s: InteractionSpec) => compileInteraction(s, { surface: "desktop" }, liveCardsProfile),
    spec
  );
  const k = new Kernel(manifest, message, { state: new InMemoryStateModel(manifestPayload.namespaces ?? []) });
  k.init();
  const resolved = await k.resolve();

  assert.equal(findResolved(resolved, "relationships-region")?.capability, "ui:chart", "graph region resolves to chart");
  assert.equal(findResolved(resolved, "context-region")?.capability, "ui:markdown", "narrative region resolves to markdown");
  assert.equal(findResolved(resolved, "relationships-region")?.fallback, false, "graph region no longer falls back");
});

test("unbound facet roles still render as graceful fallbacks (forward-compatible)", async () => {
  // create/configure's `form` facet remains intentionally unbound until the upper layer can
  // discriminate richer form surfaces without collapsing them to one leaf too early.
  const spec: InteractionSpec = { interaction: "create", subject: "ticket" };
  const message = lowerToDocument(
    (s: InteractionSpec) => compileInteraction(s, { surface: "desktop" }, liveCardsProfile),
    spec
  );
  const k = new Kernel(manifest, message, { state: new InMemoryStateModel(manifestPayload.namespaces ?? []) });
  k.init();
  const resolved = await k.resolve();

  assert.equal(findResolved(resolved, "form-region")?.fallback, true, "unbound `form` role still falls back");
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
  // Interaction -> UI (L3 -> L4 -> UI): compile with a context + profile.
  const toDocument = (s: InteractionSpec): DocumentPayload =>
    compileInteraction(s, { surface: "mobile" }, liveCardsProfile);

  const compiled = pipeline(toInteraction).to(toDocument).build();
  const message = lowerToDocument(compiled, { incidentId: "INC-123", severity: "high" });
  assert.equal(message.payload.root.capability, "ui:board");
  assert.equal(message.payload.root.props?.layout, "stack", "mobile context chose the stack layout");
  assert.equal(message.payload.root.props?.arrangement, "stack");
});

// lowerPresentation is exercised indirectly via compileInteraction; assert it is exported/usable.
void lowerPresentation;

test("a region's static `props` flow generically into node props; data binds onto the capability's dataProp", () => {
  // The static "spec" channel is per-capability and orthogonal to the dynamic data edge: authored
  // props (columns/sortable for a table) land in node.props; bound data lands on the prop the
  // manifest says the capability reads (table -> "rows").
  const p: PresentationSpec = {
    layout: "stack",
    arrangement: "stack",
    source: { interaction: "review", subject: "card_data", data: { detail: "fetched_sources.orders" } },
    regions: [
      {
        name: "detail",
        role: "detail",
        priority: "primary",
        disclosure: "always",
        props: { columns: ["id", "amount"], sortable: true },
      },
    ],
  };

  const doc = lowerPresentation(recipeForKinds(liveCardsProfile, "presentation", "runtime-document"))(p);
  const detail = doc.root.edges?.children?.[0];

  assert.equal(detail?.capability, "ui:table", "detail role binds to table");
  assert.deepEqual(detail?.props?.columns, ["id", "amount"], "authored columns flow to props");
  assert.equal(detail?.props?.sortable, true, "authored sortable flows to props");
  assert.equal(detail?.props?.priority, "primary", "platform placement fields survive alongside authored props");
  assert.deepEqual(detail?.edges?.read, { rows: "fetched_sources.orders" }, "data binds onto the table's dataProp");
});

test("authored facetViews preserve form spec and concrete capability through planning/lowering", () => {
  const spec: InteractionSpec = {
    interaction: "configure",
    subject: "card_data",
    data: { settings: "card_data.status" },
    facetViews: {
      settings: {
        capability: "ui:selection",
        read: { options: "{{region.dataPath}}" },
        props: {
          fields: {
            properties: {
              status: { title: "Status", enum: ["open", "closed"] },
            },
            required: ["status"],
          },
        },
      },
    },
  };

  const doc = compileInteraction(spec, { surface: "desktop" }, liveCardsProfile);
  const settings = doc.root.edges?.children?.find((child) => child.id === "settings-region");

  assert.equal(settings?.capability, "ui:selection", "authored facet view overrides the coarse form rule");
  assert.deepEqual((settings?.props as Record<string, unknown>)?.fields, {
    properties: {
      status: { title: "Status", enum: ["open", "closed"] },
    },
    required: ["status"],
  }, "authored field spec survives into node props");
  assert.deepEqual(settings?.edges?.read, { options: "card_data.status" }, "selection binds through authored read");
});

test("authored facetViews can choose committed searchbox over the coarse form role", () => {
  const spec: InteractionSpec = {
    interaction: "create",
    subject: "card_data",
    data: { form: "card_data.query" },
    facetViews: {
      form: {
        capability: "ui:searchbox",
        read: { value: "{{region.dataPath}}" },
        props: {
          fields: {
            properties: {
              q: { title: "Query", type: "string" },
            },
          },
          actionLabel: "Run",
        },
      },
    },
  };

  const doc = compileInteraction(spec, { surface: "desktop" }, liveCardsProfile);
  const form = doc.root.edges?.children?.find((child) => child.id === "form-region");

  assert.equal(form?.capability, "ui:searchbox", "authored facet view can select searchbox");
  assert.equal((form?.props as Record<string, unknown>)?.actionLabel, "Run", "authored props survive into the node");
  assert.deepEqual(form?.edges?.read, { value: "card_data.query" }, "searchbox binds through authored read");
});
