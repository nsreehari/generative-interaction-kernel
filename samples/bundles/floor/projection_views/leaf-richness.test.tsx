import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";

import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";
import { FLOOR_COMPONENTS } from "./floorLeaves";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => from === "floor" ? FLOOR_COMPONENTS : undefined,
  FallbackView
);

function leaf(capability: string, props: Record<string, unknown>) {
  return {
    capability,
    id: capability,
    props: props as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

function render(capability: string, props: Record<string, unknown>): string {
  return renderToStaticMarkup(renderNode(leaf(capability, props), registry, () => {}));
}

// --- Markdown inline formatting --------------------------------------------------

test("markdown renders bold, italic, and inline code", () => {
  const markup = render("ui:markdown", { value: "A **bold** and *italic* and `code` word." });
  assert.match(markup, /<strong>bold<\/strong>/);
  assert.match(markup, /<em>italic<\/em>/);
  assert.match(markup, /<code class="gx-text-code">code<\/code>/);
});

test("markdown renders safe links and drops javascript: URLs", () => {
  const safe = render("ui:markdown", { value: "See [docs](https://example.com/x)." });
  assert.match(safe, /<a class="gx-link" href="https:\/\/example.com\/x" target="_blank"/);

  const unsafe = render("ui:markdown", { value: "Bad [x](javascript:alert(1))." });
  assert.doesNotMatch(unsafe, /<a /);
  assert.doesNotMatch(unsafe, /href=/);
});

test("markdown renders ordered lists distinct from bullet lists", () => {
  const ordered = render("ui:markdown", { value: "1. first\n2. second" });
  assert.match(ordered, /<ol>.*<li>first<\/li>.*<li>second<\/li>.*<\/ol>/s);
  assert.doesNotMatch(ordered, /<ul>/);

  const bullets = render("ui:markdown", { value: "- a\n- b" });
  assert.match(bullets, /<ul>.*<li>a<\/li>.*<li>b<\/li>.*<\/ul>/s);
});

test("markdown recognizes Mermaid and ordinary fenced code blocks", () => {
  const mermaid = render("ui:markdown", {
    value: "## Graph\n\n```mermaid\ngraph LR\n  attacker --> mailbox\n```",
  });
  assert.match(mermaid, /data-mermaid-fallback/);
  assert.match(mermaid, /class="language-mermaid"/);
  assert.match(mermaid, /graph LR\n  attacker --&gt; mailbox/);

  const code = render("ui:markdown", { value: "```typescript\nconst answer = 42;\n```" });
  assert.match(code, /class="gx-markdown-code"/);
  assert.match(code, /class="language-typescript"/);
});

test("markdown renders GFM tables with inline formatting", () => {
  const markup = render("ui:markdown", {
    value: "| Alert | Verdict | Evidence |\n|---|:---:|---|\n| Password spray | **True Positive** | 14 failed sign-ins |\n| Mailbox | High | Graph \\| audit |",
  });
  assert.match(markup, /class="gx-markdown-table-wrap"/);
  assert.match(markup, /<th>Alert<\/th>.*<th>Verdict<\/th>.*<th>Evidence<\/th>/s);
  assert.match(markup, /<td>Password spray<\/td>.*<strong>True Positive<\/strong>.*14 failed sign-ins/s);
  assert.match(markup, /<td>Mailbox<\/td>.*Graph \| audit/s);
  assert.doesNotMatch(markup, /\|---\|/);
});

// --- Field-level diff ------------------------------------------------------------

test("diff of two objects shows per-field change / add / remove rows", () => {
  const markup = render("ui:diff", {
    before: { name: "Ada", role: "eng", legacy: "x" },
    after: { name: "Ada", role: "lead", tenure: 5 },
  });
  assert.match(markup, /class="gx-diff"/);
  // unchanged
  assert.match(markup, /gx-diff-row gx-diff-same[^>]*>.*name.*<\/div>/s);
  // changed role eng -> lead
  assert.match(markup, /gx-diff-changed[^>]*>.*role.*eng.*lead/s);
  // removed legacy
  assert.match(markup, /gx-diff-removed[^>]*>.*legacy/s);
  // added tenure
  assert.match(markup, /gx-diff-added[^>]*>.*tenure.*5/s);
});

test("diff of primitives falls back to before/after JSON view", () => {
  const markup = render("ui:diff", { before: "old", after: "new" });
  assert.doesNotMatch(markup, /class="gx-diff"/);
  assert.match(markup, />Before</);
  assert.match(markup, />After</);
});

// --- Metric detail line ----------------------------------------------------------

test("metric renders an optional detail line below the value", () => {
  const markup = render("ui:metric", { label: "Revenue", value: "$1.2M", detail: "+12% vs last qtr" });
  assert.match(markup, /class="gx-metric-value">\$1.2M<\/strong>/);
  assert.match(markup, /class="gx-metric-detail[^"]*">\+12% vs last qtr<\/span>/);
});

test("metric omits the detail line when no detail is provided", () => {
  const markup = render("ui:metric", { label: "Revenue", value: "$1.2M" });
  assert.doesNotMatch(markup, /gx-metric-detail/);
});
