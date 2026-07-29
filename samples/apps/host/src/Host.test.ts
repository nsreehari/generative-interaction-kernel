import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";

const capturedProps = vi.hoisted(() => ({
  scenariosJson: undefined as unknown,
  externalContext: undefined as unknown,
}));

vi.mock("@gik/demo-runner-host", () => ({
  GikDemoBlueprintHost: (props: { scenariosJson?: unknown; externalContext?: unknown }) => {
    capturedProps.scenariosJson = props.scenariosJson;
    capturedProps.externalContext = props.externalContext;
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

test("two-tier portfolio supplies controlled desktop detailed context defaults", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://example.test/?b=portfolio-tracker-2tiers&demo=portfolio-2tiers-baseline&gik=1",
        search: "?b=portfolio-tracker-2tiers&demo=portfolio-2tiers-baseline&gik=1",
      },
    },
  });

  try {
    renderToStaticMarkup(React.createElement(Host));
    assert.deepEqual(capturedProps.externalContext, { surface: "desktop", attention: "detailed" });
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});