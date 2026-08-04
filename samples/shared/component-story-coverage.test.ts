import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { componentDefinitions } from "@gik/components";
import { ComponentStory, createAuthoredBlueprint, createEventSignature } from "../storybook/stories/ComponentStory";

interface ComponentStoryModule {
  default?: {
    args?: {
      definition?: {
        capability?: string;
      };
    };
    tags?: string[];
  };
}

const storyModules = import.meta.glob<ComponentStoryModule>(
  "../storybook/stories/*.stories.tsx",
  { eager: true },
);

test("every canonical component has exactly one autodocs story", () => {
  const storyCapabilities = Object.entries(storyModules).map(([path, storyModule]) => {
    assert.ok(storyModule.default?.tags?.includes("autodocs"), path);
    const capability = storyModule.default?.args?.definition?.capability;
    assert.ok(capability, path);
    return capability;
  });
  const expectedCapabilities = Object.values(componentDefinitions).map(
    (definition) => definition.capability,
  );

  assert.deepEqual(
    storyCapabilities.toSorted(),
    expectedCapabilities.toSorted(),
  );
});

test("component stories show authored blueprints and concise emit contracts", () => {
  const definition = componentDefinitions.button;
  const trial = definition.materializeTrial();

  assert.deepEqual(createAuthoredBlueprint(trial), {
    views: {
      "fluent-button-example": {
        capability: "fluent:button",
        props: trial.props,
      },
    },
  });
  assert.equal(createEventSignature({
    type: "object",
    required: ["itemId"],
    properties: { itemId: { type: "string" }, reason: { enum: ["manual", "timeout"] }, index: { type: "integer" } },
  }), '{ itemId: string, reason?: "manual" | "timeout", index?: number }');

  const markup = renderToStaticMarkup(React.createElement(ComponentStory, { definition }));
  assert.match(markup, /Authored blueprint/);
  assert.match(markup, /Emit contracts/);
  assert.match(markup, /press/);
});
