import assert from "node:assert/strict";
import { test } from "vitest";

import {
  canonicalizeHostUrl,
  readHostQuery,
  resolvePresentationContext,
  writePresentationNavigation,
} from "./host-query";

const presets = [
  { id: "full-substrate", context: { id: "full-substrate" } },
  { id: "war-room", context: { id: "war-room" } },
] as const;

const portfolioPresets = [
  { id: "portfolio-overview", context: { view: "portfolio-overview" } },
  { id: "portfolio-advisor", context: { view: "portfolio-advisor" } },
] as const;

test("host query enables GIK controls for any non-zero value", () => {
  assert.equal(readHostQuery("?bundle=live-workspace-soc").harnessId, null);
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=1").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=-1").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=enabled").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=0").harnessId, null);
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=00").harnessId, null);
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=0.0").harnessId, null);
});

test("host query disables demo mode only for an absent parameter or exact zero", () => {
  assert.equal(readHostQuery("?b=live-workspace-soc").demoEnabled, false);
  assert.equal(readHostQuery("?b=live-workspace-soc&demo").demoEnabled, true);
  assert.equal(readHostQuery("?b=live-workspace-soc&demo=0").demoEnabled, false);
  assert.equal(readHostQuery("?b=live-workspace-soc&demo=00").demoEnabled, true);
  assert.equal(readHostQuery("?b=live-workspace-soc&demo=anything").demoEnabled, true);
});

test("host query selects Blueprints with canonical b and legacy bundle parameters", () => {
  assert.equal(readHostQuery("?b=live-workspace-soc").targetId, "live-workspace-soc");
  assert.equal(readHostQuery("?bundle=portfolio-tracker").targetId, "portfolio-tracker");
  assert.equal(readHostQuery("?b=foundry-agent&bundle=portfolio-tracker").targetId, "foundry-agent");
  assert.equal(
    canonicalizeHostUrl("https://example.test/?bundle=live-workspace-soc"),
    "https://example.test/?b=live-workspace-soc"
  );
});

test("host query resolves cached Blueprint paths", () => {
  assert.equal(
    readHostQuery("", "/cached/incident-report-explorer-3/").targetId,
    "cached-incident-report-explorer-3",
  );
  assert.equal(
    readHostQuery("?b=incident-report-explorer-3", "/cached/incident-report-explorer-3/").targetId,
    "incident-report-explorer-3",
  );
});

test("host query canonicalizes legacy controls and redundant presentation state", () => {
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&context=war-room&plane=runtime&presentation=full-substrate"
    ),
    "https://example.test/?demo=soc-t3&b=live-workspace-soc&gik=1"
  );
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&harness=gik-control-harness&presentationContext=operator-focus"
    ),
    "https://example.test/?b=live-workspace-soc&gik=1&presentation=operator-focus"
  );
});

test("presentation navigation stores only non-default presentation state", () => {
  assert.equal(
    writePresentationNavigation(
      "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&gik=1&presentation=operator-focus",
      "full-substrate"
    ),
    "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&gik=1"
  );
});

test("presentation resolution prefers a valid request, then full substrate, then the first context", () => {
  assert.equal(
    resolvePresentationContext("war-room", presets)?.id,
    "war-room"
  );
  assert.equal(
    resolvePresentationContext(null, presets)?.id,
    "full-substrate"
  );
  assert.equal(
    resolvePresentationContext("unknown", portfolioPresets)?.id,
    "portfolio-overview"
  );
  assert.equal(resolvePresentationContext(null, []), null);
});

test("presentation resolution prefers a demo's declared default context over full substrate", () => {
  assert.equal(
    resolvePresentationContext(null, portfolioPresets, "portfolio-advisor")?.id,
    "portfolio-advisor"
  );
  assert.equal(
    resolvePresentationContext("portfolio-overview", portfolioPresets, "portfolio-advisor")?.id,
    "portfolio-overview"
  );
  assert.equal(
    resolvePresentationContext(null, presets, "unknown-context")?.id,
    "full-substrate"
  );
});
