import assert from "node:assert/strict";
import { test } from "vitest";

import { createStatelessAgentFaceDispatcher } from "@gik/agentface";
import { getSemanticComponentAgentKit } from "@gik/components";

test("semantic component tools compose into AgentFace and dispatch over MCP", () => {
  const componentAgentKit = getSemanticComponentAgentKit(["timeline", "action-board"]);
  const dispatcher = createStatelessAgentFaceDispatcher(componentAgentKit.tools);
  const list = dispatcher.handleMcpMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  }) as { result: { tools: Array<{ name: string }> } };
  const names = new Set(list.result.tools.map((tool) => tool.name));

  for (const name of [
    "listSemanticComponents",
    "describeSemanticComponent",
    "validateSemanticComponentProps",
    "preflightSemanticComponent",
    "materializeSemanticComponentTrial",
  ]) {
    assert.ok(names.has(name), `missing tool ${name}`);
  }

  const call = dispatcher.handleMcpMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "materializeSemanticComponentTrial",
      arguments: { capability: "semantic:timeline", variant: "minimal" },
    },
  }) as {
    result: {
      structuredContent: { capability: string; props: { variant: string } };
      content: Array<{ type: string; text: string }>;
    };
  };

  assert.equal(call.result.structuredContent.capability, "semantic:timeline");
  assert.equal(call.result.structuredContent.props.variant, "minimal");
  assert.equal(call.result.content[0].type, "text");
});