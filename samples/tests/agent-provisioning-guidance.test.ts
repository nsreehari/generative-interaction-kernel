import assert from "node:assert/strict";
import { test } from "vitest";

import {
  toCopilotAgentMarkdown,
  toFoundryPromptDefinition,
  type AgentProvisioningTemplate,
} from "@gik/agent-lifecycle-exp";

// The provisioning definitions are intentionally authored as executable ESM alongside the Blueprints.
// @ts-expect-error The JavaScript provisioning module has no declaration file.
import { sampleAgentTemplates } from "../blueprints/agent-provisioning.mjs";

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
  assert.doesNotMatch(instructions, /Use primitive:chart for/);
  assert.ok(instructions.length < 8_000, `Provisioned instructions grew to ${instructions.length} characters`);
});
