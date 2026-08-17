import assert from "node:assert/strict";
import { test } from "vitest";
import { UnsatisfiedServiceDependencyError } from "@gik/controlface";
import { unwrap } from "@gik/kernel";
import { createNodeHost } from "./service";
import { getNodeBlueprintCatalog } from "./catalog";
import { openNodeLaunch } from "./runtime";

test("the Node host opens its registered launch profiles", async () => {
  const catalog = await getNodeBlueprintCatalog();
  const profileIds = catalog.launchProfiles.map(({ id }) => id);
  const profiles = profileIds.map((id) => catalog.launchProfiles.find((profile) => profile.id === id));
  assert.deepEqual(profiles.map((profile) => profile?.id), profileIds);
  for (const profileId of profileIds) {
    await openNodeLaunch(profileId, { "intelligence-model": "mock", view: "desktop" });
  }
});

test("the Node host can execute a Blueprint with a presentation program", async () => {
  const { runtime } = await openNodeLaunch("portfolio-tracker-new", {
    "intelligence-model": "mock",
    view: "desktop",
  });
  assert.ok(unwrap(runtime.program).root);
});

test("the Node host materializes ai-agent service endpoints from its environment", async () => {
  const { runtime } = await openNodeLaunch("ai-agent", undefined, {
    GIK_FOUNDRY_PROXY_ORIGIN: "http://localhost:7071",
  });
  const services = unwrap(runtime.vocabulary).externals?.services as Record<
    string,
    { config?: { endpoint?: string } }
  >;

  assert.equal(services.assistant.config?.endpoint, "http://localhost:7071");
});

test("the Node host throws an unsatisfied dependency when ai-agent discovery has no Foundry key", async () => {
  const host = await createNodeHost({
    profile: "ai-agent",
    port: 0,
    environment: {},
  });
  try {
    await assert.rejects(
      () => host.controlface.whenIdle(),
      (error: unknown) => error instanceof UnsatisfiedServiceDependencyError
        && error.dependency.kind === "credential"
        && error.dependency.ref === "foundry-agent/access-key",
    );
  } finally {
    await host.stop();
  }
});

