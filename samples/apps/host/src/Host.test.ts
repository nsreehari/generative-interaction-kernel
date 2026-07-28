import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";

const capturedProps = vi.hoisted(() => ({
  scenariosJson: undefined as unknown,
}));

vi.mock("@gik/demo-runner-host", () => ({
  GikDemoBlueprintHost: (props: { scenariosJson?: unknown }) => {
    capturedProps.scenariosJson = props.scenariosJson;
    return null;
  },
}));

import { demoScenariosJson } from "../../../shared/demo-catalog";
import { Host } from "./Host";

test("sample host supplies scenarios to the public demo host", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://example.test/?b=live-workspace-soc&demo=1",
        search: "?b=live-workspace-soc&demo=1",
      },
    },
  });

  try {
    renderToStaticMarkup(React.createElement(Host));
    assert.equal(capturedProps.scenariosJson, demoScenariosJson);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});