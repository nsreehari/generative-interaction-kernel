import assert from "node:assert/strict";
import React from "react";
import { test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json, ResolvedNode } from "@gik/kernel";
import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";

vi.mock("@fluentui/react-components", () => {
  const element = (tag: keyof React.JSX.IntrinsicElements) => ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(tag, props, children);

  return {
    Button: element("button"),
    Dialog: element("div"),
    DialogActions: element("div"),
    DialogBody: element("div"),
    DialogContent: element("div"),
    DialogSurface: element("div"),
    DialogTitle: element("h2"),
    Field: element("label"),
    Input: (props: Record<string, unknown>) => React.createElement("input", props),
    MessageBar: element("div"),
    MessageBarActions: element("div"),
    MessageBarBody: element("div"),
    Spinner: ({ label }: { label?: string }) => React.createElement("div", null, label ?? "Loading"),
    Text: element("p"),
    makeStyles: () => () => ({ stack: "stack", actions: "actions" }),
    tokens: { spacingVerticalM: "12px" },
  };
});

import foundryViews from "./index";
import { FUNCTION_ACCESS } from "../../../shared/function-access";

function gate(status: string, children: ResolvedNode[] = []): ResolvedNode {
  return {
    capability: "foundry:access-gate",
    id: "foundry-access-gate",
    props: { status, error: "" } as Record<string, Json>,
    visible: true,
    fallback: false,
    children,
  };
}

const registry = buildRegistryFromImports(
  {
    foundry: { from: "foundry", use: ["access-gate"] },
    test: { from: "test", use: ["content"] },
  },
  (from) => from === "foundry"
    ? foundryViews
    : from === "test"
      ? { content: ({ node }) => React.createElement("span", null, String(node.props.value ?? "")) }
      : undefined,
  FallbackView
);

test("foundry:access-gate prompts for access and withholds protected children", () => {
  const markup = renderToStaticMarkup(renderNode(gate("required", [{
    capability: "test:content",
    id: "protected",
    props: { value: "Protected content" },
    visible: true,
    fallback: false,
    children: [],
  }]), registry, () => {}));

  assert.match(markup, /Enter your access key to continue/);
  assert.doesNotMatch(markup, /Protected content/);
});

test("foundry:access-gate renders protected children when access is ready", () => {
  const markup = renderToStaticMarkup(renderNode(gate("ready", [{
    capability: "test:content",
    id: "protected",
    props: { value: "Protected content" },
    visible: true,
    fallback: false,
    children: [],
  }]), registry, () => {}));

  assert.match(markup, /Protected content/);
  assert.doesNotMatch(markup, /Connect to Foundry/);
});

test("foundry:access-gate offers reset key in the modal when a cached key exists", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => key === FUNCTION_ACCESS.foundry.storageKey ? "stale-key" : null,
    },
  });

  try {
    const markup = renderToStaticMarkup(renderNode(gate("error"), registry, () => {}));

    assert.match(markup, /Reset Key/);
    assert.match(markup, /Cancel/);
    assert.match(markup, /Retry/);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});