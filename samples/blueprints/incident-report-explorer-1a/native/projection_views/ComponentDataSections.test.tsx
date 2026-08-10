import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { ComponentDataSections } from "./ComponentDataSections";

test("renders preferred and complementary data, not alternatives", () => {
  const sections = [{
    id: "summary",
    sourceHeading: "Summary",
    order: 1,
    options: [
      { id: "preferred", capability: "semantic:narrative", relationship: "preferred", data: JSON.stringify([{ id: "summary", heading: "Finding", body: "Mailbox access was confirmed.", order: 1 }]) },
      { id: "alternative", capability: "semantic:narrative", relationship: "alternative", data: JSON.stringify([{ id: "alternative", heading: "Hidden alternative", body: "Do not render this option.", order: 1 }]) },
      { id: "complement", capability: "semantic:measure-set", relationship: "complementary", data: JSON.stringify([{ id: "events", label: "Observable events", value: "6", order: 1 }]) },
    ],
  }];
  const markup = renderToStaticMarkup(<ComponentDataSections node={{ id: "sections", capability: "incident1a:component-data-sections", props: { sections }, visible: true, fallback: false, children: [] } as never} emit={async () => undefined} children={undefined} />);

  assert.match(markup, /Mailbox access was confirmed/);
  assert.match(markup, /Observable events/);
  assert.doesNotMatch(markup, /Hidden alternative/);
});

test("does not repeat matching source and semantic headings", () => {
  const sections = [
    { id: "verdict", sourceHeading: "Verdict", order: 1, options: [{ id: "decision", capability: "semantic:decision", relationship: "preferred", data: JSON.stringify({ title: "Verdict", summary: "Confirmed compromise.", outcome: "confirmed" }) }] },
    { id: "summary", sourceHeading: "Summary", order: 2, options: [{ id: "narrative", capability: "semantic:narrative", relationship: "preferred", data: JSON.stringify([{ id: "summary", heading: "Summary", body: "Mailbox access was confirmed.", order: 1 }]) }] },
  ];
  const markup = renderToStaticMarkup(<ComponentDataSections node={{ id: "sections", capability: "incident1a:component-data-sections", props: { sections }, visible: true, fallback: false, children: [] } as never} emit={async () => undefined} children={undefined} />);

  assert.equal(markup.match(/Verdict/g)?.length, 1);
  assert.equal(markup.match(/Summary/g)?.length, 1);
});