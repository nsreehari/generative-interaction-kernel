import assert from "node:assert/strict";
import { test } from "vitest";

import { canonicalizeHostUrl, readHostQuery, writePresentationNavigation } from "./host-query";

test("host query enables GIK controls only for the canonical flag forms", () => {
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=1").harnessId, "gik-control-harness");
  assert.equal(readHostQuery("?bundle=live-workspace-soc&gik=0").harnessId, null);
});

test("host query canonicalizes legacy controls and redundant presentation state", () => {
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&context=war-room&plane=runtime&presentation=full-substrate"
    ),
    "https://example.test/?bundle=live-workspace-soc&demo=soc-t3&gik=1"
  );
  assert.equal(
    canonicalizeHostUrl(
      "https://example.test/?bundle=live-workspace-soc&harness=gik-control-harness&presentationContext=operator-focus"
    ),
    "https://example.test/?bundle=live-workspace-soc&gik=1&presentation=operator-focus"
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
