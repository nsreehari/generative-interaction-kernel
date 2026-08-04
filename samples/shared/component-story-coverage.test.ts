import assert from "node:assert/strict";
import { test } from "vitest";

import { componentDefinitions } from "@gik/components";

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
