import assert from "node:assert/strict";
import { test } from "vitest";

import { canonicalizeHostUrl, readHostQuery } from "./host-query";

test("host query enables durable IndexedDB mode for any non-zero value", () => {
  assert.equal(readHostQuery("?b=samples-overview").durableEnabled, false);
  assert.equal(
    readHostQuery("?b=samples-overview&durable").durableEnabled,
    true,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=1").durableEnabled,
    true,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=-1").durableEnabled,
    true,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=enabled").durableEnabled,
    true,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=0").durableEnabled,
    false,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=00").durableEnabled,
    false,
  );
  assert.equal(
    readHostQuery("?b=samples-overview&durable=0.0").durableEnabled,
    false,
  );
});

test("host query selects Blueprints with canonical b and legacy bundle parameters", () => {
  assert.equal(
    readHostQuery("?b=live-workspace-soc").targetId,
    "live-workspace-soc",
  );
  assert.equal(
    readHostQuery("?bundle=portfolio-tracker-new").targetId,
    "portfolio-tracker-new",
  );
  assert.equal(
    readHostQuery("?b=ai-agent&bundle=portfolio-tracker-new").targetId,
    "ai-agent",
  );
  assert.deepEqual(
    readHostQuery("?b=ai-agent&context=%7B%22ai%22%3A%22copilot%22%7D").externalContext,
    { ai: "copilot" },
  );
  assert.deepEqual(
    readHostQuery(`?b=portfolio-tracker-new&context=${encodeURIComponent(JSON.stringify({
      "intelligence-model": "semantic",
      "market-prices": "live",
      semantic: "rich-components",
      view: "mobile",
      limits: { positions: 10 },
    }))}`).externalContext,
    {
      "intelligence-model": "semantic",
      "market-prices": "live",
      semantic: "rich-components",
      view: "mobile",
      limits: { positions: 10 },
    },
  );
  assert.deepEqual(
    readHostQuery("?b=incident-analysis-new-shell&context=%7B%22model%22%3A%22refinement%22%2C%22source-report%22%3A%22identity-compromise%22%7D").externalContext,
    { model: "refinement", "source-report": "identity-compromise" },
  );
  assert.equal(readHostQuery("?b=ai-agent&ai=copilot").externalContext, undefined);
  assert.throws(
    () => readHostQuery("?b=ai-agent&context=copilot"),
    /URL-encoded JSON object/,
  );
  assert.throws(
    () => readHostQuery("?b=ai-agent&context=%5B%22copilot%22%5D"),
    /URL-encoded JSON object/,
  );
  assert.equal(
    canonicalizeHostUrl("https://example.test/?bundle=live-workspace-soc"),
    "https://example.test/?b=live-workspace-soc",
  );
});

test("host query resolves cached Blueprint paths", () => {
  assert.equal(
    readHostQuery("", "/cached/example-report/").targetId,
    "cached-example-report",
  );
  assert.equal(
    readHostQuery("", "/v1.0.10/cached/example-report/").targetId,
    "cached-example-report",
  );
  assert.equal(
    readHostQuery(
      "?b=incident-analysis-new-shell",
      "/cached/example-report/",
    ).targetId,
    "incident-analysis-new-shell",
  );
});

test("host query reports no Blueprint when no explicit selection names one", () => {
  assert.equal(readHostQuery("").targetId, null);
  assert.equal(readHostQuery("?durable=1").targetId, null);
  assert.equal(readHostQuery("?demo=1&gik=1", "/").targetId, null);
  assert.equal(readHostQuery("?b=", "/").targetId, null);
  assert.equal(readHostQuery("?b=%20&bundle=%20", "/").targetId, null);
  assert.equal(
    readHostQuery("?context=%7B%22mode%22%3A%22embedded%22%7D").targetId,
    null,
  );
  // Canonicalization is what turns every legacy selection into the one explicit `b` shape, so no
  // route ever has to re-derive a target from a legacy parameter after the first replaceState.
  assert.equal(
    canonicalizeHostUrl("https://example.test/?durable=1"),
    "https://example.test/?durable=1",
  );
  assert.equal(
    canonicalizeHostUrl("https://example.test/?b=&durable=1"),
    "https://example.test/?durable=1",
  );
  assert.equal(
    canonicalizeHostUrl("https://example.test/?b=&bundle=live-workspace-soc"),
    "https://example.test/?b=live-workspace-soc",
  );
});

test("host query canonicalizes legacy controls and redundant presentation state", () => {
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&context=%7B%22mode%22%3A%22war-room%22%7D&plane=runtime&presentation=full-substrate",
    ),
    "https://example.test/?demo=soc-t3&context=%7B%22mode%22%3A%22war-room%22%7D&b=live-workspace-soc&gik=1",
  );
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&harness=gik-control-harness&presentationContext=operator-focus",
    ),
    "https://example.test/?b=live-workspace-soc&gik=1&presentation=operator-focus",
  );
});
