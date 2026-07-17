import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { PresentationLayout } from "./PresentationLayout";
import type { PresentationRegionFacet } from "./types";

const groups: PresentationRegionFacet["group"][] = [
  "kanban-frame",
  "kanban-explore",
  "kanban-establish",
  "kanban-decide",
  "kanban-record",
];

function Card({ node }: { node: { props: { facet: Pick<PresentationRegionFacet, "group"> } } }) {
  return createElement("article", { "data-card": node.props.facet.group }, node.props.facet.group);
}

test("kanban arrangement renders lowered region groups as investigation columns", () => {
  const node = {
    capability: "soc:presentation-layout",
    id: "presentation-layout",
    props: {
      presentation: {
        selectedContext: "investigation-board",
        revision: 1,
        frame: "shared",
        arrangement: "kanban",
        regionFacets: {},
        contexts: [],
      },
      actors: [],
    },
    visible: true,
    fallback: false,
    children: [],
  };
  const cards = groups.map((group) => createElement(Card, {
    key: group,
    node: { props: { facet: { group } } },
  }));
  const markup = renderToStaticMarkup(createElement(
    PresentationLayout,
    { node, emit: () => {} },
    cards,
  ));

  assert.match(markup, /aria-label="Investigation board"/);
  assert.match(markup, />Frame</);
  assert.match(markup, />Explore</);
  assert.match(markup, />Establish</);
  assert.match(markup, />Decide</);
  assert.match(markup, />Record</);
  for (const group of groups) {
    assert.match(markup, new RegExp(`data-card="${group}"`));
  }
});