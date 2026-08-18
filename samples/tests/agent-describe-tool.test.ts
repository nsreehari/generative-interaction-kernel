import assert from "node:assert/strict";
import { test } from "vitest";

import { createSampleAgentTools } from "../apps/shared/agent-tools";

test("sample describe tool exposes compact generated capability contracts", async () => {
  const [describe] = createSampleAgentTools();
  assert.equal(describe?.name, "describe");

  const catalog = await describe?.handler({
    kind: "catalog-capabilities",
    capabilities: ["primitive:form", "semantic:argument"],
  }) as { capabilities: Record<string, unknown> };
  assert.deepEqual(Object.keys(catalog.capabilities), [
    "primitive:form",
    "semantic:argument",
  ]);

  const detail = await describe?.handler({
    kind: "capability",
    capabilities: ["primitive:form"],
  }) as { capabilities: Record<string, any> };
  assert.deepEqual(detail.capabilities["primitive:form"].notes, [
    "Editing is draft-based; values are published only through save.",
  ]);
  assert.equal("version" in detail.capabilities["primitive:form"], false);
  assert.equal("semanticTokens" in detail.capabilities["primitive:form"], false);
  assert.equal("propsSchema" in detail.capabilities["primitive:form"], false);
});
