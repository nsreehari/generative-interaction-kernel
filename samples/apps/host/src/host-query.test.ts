import assert from "node:assert/strict";
import { test } from "vitest";

import {
  canonicalizeHostUrl,
  readHostQuery,
  resolvePresentationContext,
  writePresentationNavigation,
} from "./host-query";

test("host query enables GIK controls for any non-zero value", () => {
  assert.equal(readHostQuery("?b=live-workspace-soc").harnessId, null);
  assert.equal(readHostQuery("?b=live-workspace-soc&gik").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=1").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=-1").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=enabled").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=0").harnessId, null);
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=00").harnessId, null);
  assert.equal(readHostQuery("?b=live-workspace-soc&gik=0.0").harnessId, null);
});

test("host query reads only the short Blueprint selector", () => {
  assert.equal(readHostQuery("?b=example").blueprintId, "example");
  assert.equal(readHostQuery("?blueprint=legacy&bundle=legacy").blueprintId, null);
});

test("host query canonicalizes legacy controls and redundant presentation state", () => {
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?b=live-workspace-soc&demo=soc-t3&context=war-room&plane=runtime&presentation=full-substrate"
    ),
    "https://example.test/?b=live-workspace-soc&demo=soc-t3&gik=1"
  );
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?b=live-workspace-soc&harness=gik-control-harness&presentationContext=operator-focus"
    ),
    "https://example.test/?b=live-workspace-soc&gik=1&presentation=operator-focus"
  );
});

test("presentation navigation stores only non-default presentation state", () => {
  assert.equal(
    writePresentationNavigation(
      "https://example.test/?b=live-workspace-soc&demo=soc-t3&gik=1&presentation=operator-focus",
      "full-substrate"
    ),
    "https://example.test/?b=live-workspace-soc&demo=soc-t3&gik=1"
  );
});

test("presentation resolution prefers a valid request, then full substrate, then the first context", () => {
  assert.equal(
    resolvePresentationContext("war-room", ["full-substrate", "war-room"]),
    "war-room"
  );
  assert.equal(
    resolvePresentationContext(null, ["full-substrate", "war-room"]),
    "full-substrate"
  );
  assert.equal(
    resolvePresentationContext("unknown", ["portfolio-overview", "portfolio-advisor"]),
    "portfolio-overview"
  );
  assert.equal(resolvePresentationContext(null, []), null);
});

test("presentation resolution prefers a demo's declared default context over full substrate", () => {
  assert.equal(
    resolvePresentationContext(null, ["portfolio-overview", "portfolio-advisor"], "portfolio-advisor"),
    "portfolio-advisor"
  );
  assert.equal(
    resolvePresentationContext("portfolio-overview", ["portfolio-overview", "portfolio-advisor"], "portfolio-advisor"),
    "portfolio-overview"
  );
  assert.equal(
    resolvePresentationContext(null, ["full-substrate", "war-room"], "unknown-context"),
    "full-substrate"
  );
});
