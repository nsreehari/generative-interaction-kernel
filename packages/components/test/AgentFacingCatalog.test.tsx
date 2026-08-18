import assert from "node:assert/strict";
import { test } from "vitest";

import {
  agentFacingComponentCatalog,
  mergeAgentFacingCapabilityCatalogs,
} from "../src/shared";

test("agent-facing catalog derives compact form authoring facts", () => {
  assert.deepEqual(agentFacingComponentCatalog.catalog["primitive:form"], {
    for: ["Users edit a schema-defined object and explicitly commit or discard the draft"],
    notFor: [
      "Each field must emit immediately without an explicit commit",
      "The data is naturally edited as rows; use editable-table",
    ],
    interaction: "committed-input",
  });
  const detail = agentFacingComponentCatalog.details["primitive:form"];
  assert.deepEqual(detail?.dataProps, { value: { type: "object" } });
  assert.equal("className" in (detail?.props ?? {}), false);
  assert.equal("style" in (detail?.props ?? {}), false);
  assert.equal("layout" in (detail?.props ?? {}), false);
  assert.deepEqual(detail?.notes, [
    "Editing is draft-based; values are published only through save.",
  ]);
  assert.deepEqual(detail?.example?.bindings, {
    value: { from: "<state-path>" },
  });
});

test("agent-facing catalog derives semantic argument variants and data contract", () => {
  const detail = agentFacingComponentCatalog.details["semantic:argument"];
  assert.deepEqual(Object.keys(detail?.variants ?? {}), ["map", "outline", "text"]);
  assert.equal(
    (detail?.variants?.map as { default?: boolean } | undefined)?.default,
    true,
  );
  assert.deepEqual(
    ((detail?.dataProps?.argument as { required?: string[] } | undefined)?.required),
    ["claims", "relations"],
  );
  assert.deepEqual(detail?.notes, [
    "Relations express authored inference, not merely visual connectivity.",
  ]);
});

test("agent-facing catalogs merge host extensions and reject collisions", () => {
  const extension = {
    catalog: {
      "contoso:risk": { for: ["Present a host-defined risk."] },
    },
    details: {
      "contoso:risk": { dataProps: { risk: { type: "object" } } },
    },
  } as const;
  const merged = mergeAgentFacingCapabilityCatalogs(agentFacingComponentCatalog, extension);
  assert.deepEqual(merged.details["contoso:risk"], extension.details["contoso:risk"]);
  assert.throws(
    () => mergeAgentFacingCapabilityCatalogs(extension, extension),
    /Duplicate agent-facing capability 'contoso:risk'/,
  );
});
