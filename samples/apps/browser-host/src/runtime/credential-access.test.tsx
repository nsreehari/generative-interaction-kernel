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
    Checkbox: element("input"),
    Dialog: element("div"),
    DialogActions: element("div"),
    DialogBody: element("div"),
    DialogContent: element("div"),
    DialogSurface: element("div"),
    DialogTitle: element("h2"),
    Field: element("label"),
    Input: (props: Record<string, unknown>) => React.createElement("input", props),
    Dropdown: element("div"),
    Option: element("div"),
    MessageBar: element("div"),
    MessageBarActions: element("div"),
    MessageBarBody: element("div"),
    Spinner: ({ label }: { label?: string }) => React.createElement("div", null, label ?? "Loading"),
    Text: element("p"),
    Textarea: element("textarea"),
    makeStyles: () => () => ({ stack: "stack", actions: "actions" }),
    mergeClasses: (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(" "),
    tokens: { spacingVerticalM: "12px" },
  };
});

import {
  CredentialClearButtonProjection,
  credentialAccessViews,
} from "./credential-access";
import { browserCredentialStorageKey } from "./browser-credentials";

const FOUNDRY_CREDENTIAL_REFERENCE = "foundry-agent/access-key";

function gate(status: string, children: ResolvedNode[] = []): ResolvedNode {
  return {
    capability: "host:credential-access",
    id: "foundry-access-gate",
    props: {
      dependency: {
        kind: "credential",
        ref: FOUNDRY_CREDENTIAL_REFERENCE,
      },
      access: {
        title: "Connect to Foundry",
        requiredMessage: "Enter your access key to continue.",
        checkingMessage: "Checking Foundry access...",
        errorMessage: "Couldn't verify Foundry access.",
        triggered: status !== "ready" && status !== "empty",
        status: status === "checking" ? "checking" : status === "required" ? "required" : "error",
        error: "",
      },
    } as Record<string, Json>,
    visible: true,
    fallback: false,
    children,
  };
}

const registry = buildRegistryFromImports(
  {
    host: { from: "host", use: ["credential-access"] },
    test: { from: "test", use: ["content"] },
  },
  (from) => from === "host"
    ? credentialAccessViews
    : from === "test"
      ? { content: ({ node }) => React.createElement("span", null, String(node.props.value ?? "")) }
      : undefined,
  FallbackView
);

test("host:credential-access prompts for access and withholds protected children", () => {
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

test("host:credential-access renders protected children when access is ready", () => {
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

test("host:credential-access offers reset key in the modal when a cached key exists", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => key === browserCredentialStorageKey(FOUNDRY_CREDENTIAL_REFERENCE) ? "stale-key" : null,
    },
  });

  try {
    const markup = renderToStaticMarkup(renderNode(gate("error"), registry, () => {}));

    assert.match(markup, /Reset Key/);
    assert.match(markup, /Retry/);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("host:credential-clear-button clears the host credential before emitting press", async () => {
  const values = new Map([[browserCredentialStorageKey(FOUNDRY_CREDENTIAL_REFERENCE), "access-key"]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  const events: string[] = [];

  try {
    const button = CredentialClearButtonProjection({
      node: {
        capability: "host:credential-clear-button",
        id: "sign-out",
        props: {
          label: "Sign out",
          dependency: { kind: "credential", ref: FOUNDRY_CREDENTIAL_REFERENCE },
        },
        visible: true,
        fallback: false,
        children: [],
      },
      emit: (event) => {
        assert.equal(values.has(browserCredentialStorageKey(FOUNDRY_CREDENTIAL_REFERENCE)), false);
        events.push(event);
      },
      children: null,
    });

    await button.props.onClick();
    assert.deepEqual(events, ["press"]);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});