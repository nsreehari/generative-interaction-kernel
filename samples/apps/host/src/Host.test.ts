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

import portfolioTwoTierDemo from "../../../scenarios/portfolio-tracker-2tiers-baseline/scenario.json" with { type: "json" };
import { Host } from "./Host";

test("unmigrated samples do not receive legacy demo scenarios", () => {
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
    assert.equal(capturedProps.scenariosJson, undefined);
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
    assert.deepEqual(capturedProps.scenariosJson, portfolioTwoTierDemo);
    assert.deepEqual(capturedProps.externalContext, { view: "desktop", attention: "detailed", marketMode: "live" });
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});