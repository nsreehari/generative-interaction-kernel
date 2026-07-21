import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import type { Json, ResolvedNode } from "@gik/kernel";
import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";

vi.mock("@fluentui/react-components", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement("button", props, children),
  Field: ({ children, label, validationMessage }: React.PropsWithChildren<{ label?: string; validationMessage?: string }>) =>
    React.createElement("label", null, label, children, validationMessage),
  Select: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement("select", props, children),
  Spinner: ({ label }: { label?: string }) => React.createElement("div", null, label),
  Text: ({ children }: React.PropsWithChildren) => React.createElement("p", null, children),
  makeStyles: () => () => ({ askPage: "askPage", askPageTitle: "askPageTitle" }),
  tokens: {
    spacingVerticalXXL: "24px",
    spacingVerticalL: "16px",
    fontSizeBase300: "16px",
    colorNeutralForeground3: "gray",
  },
}));

import agentViews from "./index";

function selector(agentsStatus: string, agentOptions: string[] = [], agentsError = ""): ResolvedNode {
  return {
    capability: "agent:agent-selector",
    id: "agent-selector",
    props: {
      agentName: agentOptions[0] ?? "",
      agentOptions,
      agentsStatus,
      agentsError,
    } as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

const registry = buildRegistryFromImports(
  { agent: { from: "agent", use: ["agent-selector"] } },
  (from) => from === "agent" ? agentViews : undefined,
  FallbackView
);

test("agent selector owns the agent-list loading state", () => {
  const markup = renderToStaticMarkup(renderNode(selector("loading"), registry, () => {}));

  assert.match(markup, /Loading agents/);
  assert.doesNotMatch(markup, /Checking access/);
});

test("agent selector exposes discovery failures and retry", () => {
  const markup = renderToStaticMarkup(renderNode(selector("error", [], "Discovery unavailable"), registry, () => {}));

  assert.match(markup, /Discovery unavailable/);
  assert.match(markup, /Retry loading agents/);
});

test("agent selector renders discovered agents when ready", () => {
  const markup = renderToStaticMarkup(renderNode(selector("ready", ["Agent One", "Agent Two"]), registry, () => {}));

  assert.match(markup, /Agent One/);
  assert.match(markup, /Agent Two/);
  assert.doesNotMatch(markup, /Loading agents/);
});
