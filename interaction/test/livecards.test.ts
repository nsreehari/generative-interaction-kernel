// The live-cards Domain profile (L2): archetype classification, Domain -> Interaction lowering,
// and the full Domain -> Interaction -> Presentation -> UI pipeline for a real board. Verifies
// that a card's authored content selects the right interaction, that bound elements supply the
// interaction's facet data by role, and that a lowered card resolves to a valid, kernel-
// interpretable document through the live-cards binding.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  InMemoryStateModel,
  Kernel,
  lowerToDocument,
  type ManifestPayload,
  type ResolvedNode,
} from "../../kernel/src/index";
import {
  cardToInteraction,
  classifyCard,
  compileLiveCardsBoard,
  inferArchetype,
  liveCardsBinding,
  lowerLiveCardsBoard,
  compileInteraction,
  liveCardsCapabilities,
  type LiveCard,
  type LiveCardsBoard,
  type PresentationContext,
} from "../src/index";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)), "utf8"));

const board = fx("live-cards.board.json") as LiveCardsBoard;
const manifest = fx("live-cards.manifest.json");
const manifestPayload = manifest.payload as ManifestPayload;

const card = (id: string): LiveCard => {
  const c = board.cards.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

function findResolved(n: ResolvedNode, id: string): ResolvedNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children) {
    const hit = findResolved(c, id);
    if (hit) return hit;
  }
  return undefined;
}

test("archetype inference: a card's content selects its interaction", () => {
  // narrative + a data-flow (sources/compute) => analysis => investigate.
  assert.equal(inferArchetype(card("regional-sales")), "analysis");
  assert.equal(classifyCard(card("regional-sales")).interaction, "investigate");

  // metric/badge/list KPI tiles => kpi => monitor.
  assert.equal(inferArchetype(card("dominance")), "kpi");
  assert.equal(classifyCard(card("dominance")).interaction, "monitor");

  // a committed-input form => entry => create.
  assert.equal(inferArchetype(card("add-note")), "entry");
  assert.equal(classifyCard(card("add-note")).interaction, "create");
});

test("an explicit archetype overrides inference", () => {
  const forced: LiveCard = { ...card("dominance"), archetype: "decision" };
  assert.equal(classifyCard(forced).archetype, "decision");
  assert.equal(classifyCard(forced).interaction, "approve");
});

test("Domain -> Interaction: bound elements supply the interaction's facet data by role", () => {
  // monitor facets: status, metrics, alerts(collection). The card's metric -> metrics,
  // badge -> status, list -> alerts.
  const spec = cardToInteraction(card("dominance"));
  assert.equal(spec.interaction, "monitor");
  assert.equal(spec.subject, "card_data", "writes resolve against the card_data namespace");
  assert.equal(spec.data?.metrics, "computed_values.top_share");
  assert.equal(spec.data?.status, "computed_values.dominance");
  assert.equal(spec.data?.alerts, "computed_values.risk_factors");
  assert.equal(spec.intent?.goal, "Regional Dominance", "the human title rides in intent.goal");
});

test("two same-role facets take distinct elements", () => {
  // investigate has context(narrative) + explanation(narrative). Only one narrative element
  // exists, so context binds and explanation stays unbound (each element consumed once).
  const spec = cardToInteraction(card("regional-sales"));
  assert.equal(spec.interaction, "investigate");
  assert.equal(spec.data?.context, "computed_values.summary");
  assert.equal(spec.data?.evidence, "computed_values.region_totals", "collection facet -> the table");
  assert.equal(spec.data?.explanation, undefined, "no second narrative element to bind");
});

test("a board lowers to one interaction spec per card, in order", () => {
  const specs = lowerLiveCardsBoard(board);
  assert.deepEqual(
    specs.map((s) => s.interaction),
    ["investigate", "monitor", "create"]
  );
});

test("a lowered card resolves to a valid, kernel-interpretable document", async () => {
  const ctx: PresentationContext = { surface: "desktop" };
  const spec = cardToInteraction(card("dominance"));

  const message = lowerToDocument(
    (s) => compileInteraction(s, ctx, liveCardsBinding, undefined, liveCardsCapabilities),
    spec
  );
  assert.equal(message.type, "document");
  assert.equal(message.payload.root.capability, "board");

  const state = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  state.apply([
    { op: "set", path: "computed_values.top_share", value: 0.62 },
    { op: "set", path: "computed_values.dominance", value: "dominant" },
  ]);
  const k = new Kernel(manifest, message, { state });
  k.init();
  const resolved = await k.resolve();

  const metrics = findResolved(resolved, "metrics-region");
  assert.equal(metrics?.capability, "metric", "metrics role bound to the metric capability");
  assert.equal(metrics?.props.value, 0.62, "the metric reads its facet's namespace path");
  assert.equal(metrics?.fallback, false);
});

test("compileLiveCardsBoard runs the whole board through the pipeline", () => {
  const lowered = compileLiveCardsBoard(board, { surface: "desktop" });
  assert.equal(lowered.length, 3);
  for (const { document } of lowered) {
    assert.equal(document.root.capability, "board");
    assert.ok((document.root.edges?.children?.length ?? 0) > 0, "the board root has region children");
  }
});

test("text/status/form roles bind to their own capabilities (not collapsed onto metric)", async () => {
  const ctx: PresentationContext = { surface: "desktop" };

  // monitor: status -> badge (was metric), metrics -> metric.
  const dominance = cardToInteraction(card("dominance"));
  const dMsg = lowerToDocument(
    (s) => compileInteraction(s, ctx, liveCardsBinding, undefined, liveCardsCapabilities),
    dominance
  );
  const dState = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  dState.apply([
    { op: "set", path: "computed_values.top_share", value: 0.62 },
    { op: "set", path: "computed_values.dominance", value: "dominant" },
  ]);
  const dk = new Kernel(manifest, dMsg, { state: dState });
  dk.init();
  const dResolved = await dk.resolve();

  const status = findResolved(dResolved, "status-region");
  assert.equal(status?.capability, "badge", "status role binds to the badge capability");
  assert.equal(status?.fallback, false);
  assert.equal(status?.props.value, "dominant", "badge reads its facet onto the `value` prop");
  assert.equal(findResolved(dResolved, "metrics-region")?.capability, "metric", "metrics stays a metric");

  // create: form -> form (was an unmapped graceful fallback).
  const addNote = cardToInteraction(card("add-note"));
  const fMsg = lowerToDocument(
    (s) => compileInteraction(s, ctx, liveCardsBinding, undefined, liveCardsCapabilities),
    addNote
  );
  const fk = new Kernel(manifest, fMsg, { state: new InMemoryStateModel(manifestPayload.namespaces ?? []) });
  fk.init();
  const fResolved = await fk.resolve();

  const form = findResolved(fResolved, "form-region");
  assert.equal(form?.capability, "form", "form role binds to the form capability");
  assert.equal(form?.fallback, false, "form is no longer a graceful fallback");
});

test("a card's narrative binds to the narrative capability, reading onto `text`", async () => {
  const ctx: PresentationContext = { surface: "desktop" };
  const spec = cardToInteraction(card("regional-sales")); // investigate: context has role narrative
  const msg = lowerToDocument(
    (s) => compileInteraction(s, ctx, liveCardsBinding, undefined, liveCardsCapabilities),
    spec
  );
  const state = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  state.apply([{ op: "set", path: "computed_values.summary", value: "Top region is East" }]);
  const k = new Kernel(manifest, msg, { state });
  k.init();
  const resolved = await k.resolve();

  const context = findResolved(resolved, "context-region");
  assert.equal(context?.capability, "narrative", "narrative role binds to the narrative capability");
  assert.equal(context?.fallback, false);
  assert.equal(context?.props.text, "Top region is East", "narrative reads its facet onto the `text` prop");
});
