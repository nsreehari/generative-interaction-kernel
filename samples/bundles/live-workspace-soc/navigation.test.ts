import assert from "node:assert/strict";
import { test } from "vitest";

import { readSocNavigation, writeSocNavigation } from "./navigation";

const contexts = ["war-room", "priya-mobile"];

test("SOC navigation accepts canonical plane and context values", () => {
  assert.deepEqual(
    readSocNavigation("?bundle=live-workspace-soc&plane=blueprint&context=priya-mobile", contexts),
    { plane: "blueprint", context: "priya-mobile" }
  );
});

test("SOC navigation falls back for unknown plane and context values", () => {
  assert.deepEqual(
    readSocNavigation("?plane=compiler&context=unknown", contexts),
    { plane: "runtime", context: undefined }
  );
});

test("SOC navigation preserves unrelated query parameters when updated", () => {
  assert.equal(
    writeSocNavigation("http://localhost/?bundle=live-workspace-soc&theme=dark", "blueprint", "war-room"),
    "http://localhost/?bundle=live-workspace-soc&theme=dark&plane=blueprint&context=war-room"
  );
});