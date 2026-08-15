import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { UnsatisfiedServiceDependencyError } from "@gik/controlface";

import {
  browserServiceDependencyAccessTesting,
  runWithBrowserServiceDependencies,
} from "./service-dependency-access";

const dependency = { kind: "credential", ref: "foundry-agent/access-key" };

afterEach(() => browserServiceDependencyAccessTesting.reset());

test("host dependency access waits for a credential and retries the blocked invocation", async () => {
  let attempts = 0;
  const result = runWithBrowserServiceDependencies(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new UnsatisfiedServiceDependencyError("Foundry access is required", dependency);
    }
    return "analysis";
  });

  await Promise.resolve();
  const request = browserServiceDependencyAccessTesting.current();
  assert.deepEqual(request?.dependency, dependency);
  assert.equal(request?.message, "Foundry access is required");

  request?.resolve();
  assert.equal(await result, "analysis");
  assert.equal(attempts, 2);
});

test("host dependency access does not intercept unrelated service failures", async () => {
  await assert.rejects(
    runWithBrowserServiceDependencies(async () => {
      throw new Error("provider failed");
    }),
    /provider failed/,
  );
  assert.equal(browserServiceDependencyAccessTesting.current(), undefined);
});
