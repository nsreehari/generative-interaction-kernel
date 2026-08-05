import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { markdownDefinition, safeMarkdownHref } from "../src/primitives/markdown";

test("primitive:markdown renders structured content and rejects unsafe links", () => {
  const node = markdownDefinition.materializeTrial();
  node.props.value = "# Report\n\n| Alert | Verdict |\n| --- | --- |\n| Spray | True positive |\n\n[Details](https://example.com) [Unsafe](javascript:alert(1))";
  const Component = markdownDefinition.component;
  const markup = renderToStaticMarkup(<Component node={node} emit={() => undefined} children={undefined} />);
  assert.match(markup, /<h1>Report<\/h1>/);
  assert.match(markup, /<table/);
  assert.match(markup, /href="https:\/\/example.com"/);
  assert.doesNotMatch(markup, /href="javascript:/);
  assert.equal(safeMarkdownHref("javascript:alert(1)"), null);
  assert.equal(markdownDefinition.dataProp, "value");
  assert.deepEqual(markdownDefinition.variants, []);
  assert.equal(markdownDefinition.validate({ value: "# Valid" }).ok, true);
  assert.equal(markdownDefinition.validate({ text: "# Invalid" }).ok, false);
});