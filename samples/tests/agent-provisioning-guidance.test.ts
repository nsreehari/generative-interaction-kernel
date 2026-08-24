import assert from "node:assert/strict";
import { test } from "vitest";

import {
  toCopilotAgentMarkdown,
  toFoundryPromptDefinition,
  type AgentProvisioningTemplate,
} from "@gik/agent-lifecycle-exp";

// The provisioning definitions are intentionally authored as executable ESM alongside the Blueprints.
// @ts-expect-error The JavaScript provisioning module has no declaration file.
import {
  copilotWorkspaceFiles,
  sampleAgentTemplates,
} from "../blueprints/agent-provisioning.mjs";

test("provisions shared guidance only for Blueprint-authoring agents", () => {
  const authorIds = new Set([
    "Portfolio-Semantic-Intelligence-Agent",
    "Incident-Report-Semantic-Agent",
    "Incident-Report-Refinement-Agent",
  ]);
  const templates = sampleAgentTemplates() as AgentProvisioningTemplate[];

  for (const template of templates) {
    const guidanceCount = template.instructions.filter((instruction) =>
      instruction.includes("# Blueprint Authoring Playbook")).length;
    assert.equal(guidanceCount, authorIds.has(template.id) ? 1 : 0, template.id);

    if (!authorIds.has(template.id)) continue;
    assert.match(toFoundryPromptDefinition(template, "gpt-test").instructions, /## Authoring loop/);
    assert.match(toCopilotAgentMarkdown(template, { model: "gpt-test" }), /## Authoring loop/);
  }
});

test("coaches the semantic portfolio agent without assigning sections to components", () => {
  const template = (sampleAgentTemplates() as AgentProvisioningTemplate[])
    .find(({ id }) => id === "Portfolio-Semantic-Intelligence-Agent");
  assert.ok(template);

  const instructions = template.instructions.join("\n");
  assert.match(instructions, /Sections are semantic obligations, not component assignments/);
  assert.match(instructions, /Accepted capabilities are a vocabulary, not a checklist/);
  assert.match(instructions, /FIT > VARIETY/);
  assert.match(instructions, /JSON-CHECK:/);
  assert.match(instructions, /"kind":"multiple-capabilities"/);
  assert.match(instructions, /Never issue serial detail calls/);
  assert.doesNotMatch(instructions, /Use primitive:chart for/);
  assert.doesNotMatch(instructions, /kind capability for exact/);

  const describe = template.tools?.find(({ name }) => name === "describe");
  assert.ok(describe);
  assert.deepEqual(
    (describe.parameters.properties?.kind as { enum?: unknown }).enum,
    ["catalog-capabilities", "multiple-capabilities"],
  );
  // TODO: revisit this budget -- it was raised from 8_000 to 30_000 to unblock the
  // sources/services and potentialViews model rewrites, then to 32_000 for the
  // CellSource.acceptanceCriteria addition, then to 33_000 for the headless-hosting
  // correction, then to 34_000 for the wrap mechanism closing the nested-composition
  // gap, then to 38_000 for independent lowering axes and closed projection vocabularies;
  // provisioning should be re-tightened before growing further.
  assert.ok(instructions.length < 38_000, `Provisioned instructions grew to ${instructions.length} characters`);
});

test("provisions the capability catalog required by the Copilot describe tool", () => {
  const files = copilotWorkspaceFiles([]);
  const catalogFile = files.find(({ path }) => path === ".gik/capability-catalog.json");
  assert.ok(catalogFile);

  const catalog = JSON.parse(catalogFile.content) as {
    catalog: Record<string, unknown>;
    details: Record<string, unknown>;
  };
  assert.ok(catalog.catalog["primitive:markdown"]);
  assert.ok(catalog.details["primitive:markdown"]);
  assert.ok(catalog.catalog["semantic:narrative"]);
  assert.ok(catalog.details["semantic:narrative"]);
});
