import assert from "node:assert/strict";
import { test } from "vitest";

import { createCapabilityDescribeTool } from "../src";

const catalog = {
  catalog: {
    "primitive:form": {
      for: ["Edit an object and explicitly commit it."],
      notFor: ["Immediate field updates."],
      interaction: "committed-input",
    },
    "semantic:argument": {
      for: ["Present authored inferential links."],
    },
  },
  details: {
    "primitive:form": {
      dataProps: { value: { type: "object" } },
      emits: { save: { summary: "Commit values." } },
    },
    "semantic:argument": {
      dataProps: { argument: { type: "object" } },
      constraints: ["Relations reference declared claims."],
    },
  },
} as const;

test("describe lists compact capability selection guidance", async () => {
  const tool = createCapabilityDescribeTool(catalog);
  assert.deepEqual(await tool.handler({
    kind: "catalog-capabilities",
    capabilities: ["primitive:form"],
  }), {
    capabilities: {
      "primitive:form": catalog.catalog["primitive:form"],
    },
  });
});

test("describe returns only requested Blueprint authoring contracts", async () => {
  const tool = createCapabilityDescribeTool(catalog);
  assert.deepEqual(await tool.handler({
    kind: "multiple-capabilities",
    capabilities: ["semantic:argument", "primitive:form"],
  }), {
    capabilities: {
      "semantic:argument": catalog.details["semantic:argument"],
      "primitive:form": catalog.details["primitive:form"],
    },
  });
  await assert.rejects(
    async () => tool.handler({ kind: "multiple-capabilities", capabilities: ["unknown:thing"] }),
    /Unknown capabilities: unknown:thing/,
  );
  await assert.rejects(
    async () => tool.handler({ kind: "multiple-capabilities", capabilities: [] }),
    /requires at least one capability ID/,
  );
  await assert.rejects(
    async () => tool.handler({ kind: "capability", capabilities: ["primitive:form"] }),
    /Unsupported describe kind 'capability'/,
  );
  const properties = tool.inputSchema.properties as Record<string, unknown> | undefined;
  assert.deepEqual(
    (properties?.kind as { enum?: unknown } | undefined)?.enum,
    ["catalog-capabilities", "multiple-capabilities"],
  );
  assert.equal(
    "uniqueItems" in (properties?.capabilities as Record<string, unknown>),
    false,
  );
});
