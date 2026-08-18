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
    readHostQuery("?b=ai-agent&ai=copilot").externalContext,
    { ai: "copilot" },
  );
  assert.deepEqual(
    readHostQuery("?b=portfolio-tracker-new&intelligence-model=semantic&market-prices=live&view=mobile").externalContext,
    { "intelligence-model": "semantic", "market-prices": "live", view: "mobile" },
  );
  assert.deepEqual(
    readHostQuery("?b=incident-analysis-new-shell&model=refinement&source-report=identity-compromise").externalContext,
    { model: "refinement", "source-report": "identity-compromise" },
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

test("host query canonicalizes legacy controls and redundant presentation state", () => {
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&context=war-room&plane=runtime&presentation=full-substrate",
    ),
    "https://example.test/?demo=soc-t3&b=live-workspace-soc&gik=1",
  );
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&harness=gik-control-harness&presentationContext=operator-focus",
    ),
    "https://example.test/?b=live-workspace-soc&gik=1&presentation=operator-focus",
  );
});
