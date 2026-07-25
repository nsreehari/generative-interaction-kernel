import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";

import { switcherBundle } from "./index";

test("switcher constructs from canonical vocabulary and program messages", () => {
  const bundle = switcherBundle(["samples-overview", "manage-blueprints"], "manage-blueprints");

  assert.equal(unwrap(bundle.vocabulary).version, "genui-host-switcher/1.0");
  assert.equal(unwrap(bundle.program).root.id, "application-switcher");
  assert.deepEqual(bundle.state?.switcher, {
    items: ["samples-overview", "manage-blueprints"],
    current: "manage-blueprints",
  });
});