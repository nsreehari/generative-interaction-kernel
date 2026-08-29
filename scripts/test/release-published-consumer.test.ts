// Regression coverage for the clean external-consumer gate of issue #36: the
// published packages must install from the public registry at exact versions
// with complete metadata, entry points, and dependency closure, and the gate
// must stay a GitHub-hosted, non-publishing job.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// @ts-expect-error - plain ESM release script without type declarations.
import {
  consumerManifest,
  consumerPeerDependencies,
  expectedPackages,
  importSubpaths,
  provenancePredicateType,
  publicRegistry,
  runtimeConsumerSource,
  typescriptConsumerSource,
  verifyInstalledPackage,
  verifyProvenance,
} from "../verify-published-packages.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const stable = JSON.parse(
  readFileSync(new URL("../../config/npm-release.json", import.meta.url), "utf8"),
).stable as string[];
const workflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/verify-published-packages.yml", import.meta.url)),
  "utf8",
);

const installedFiles = ["package.json", "dist/index.js", "dist/index.d.ts", "README.md"];
const publishedManifest = {
  name: "@gik-ai/example",
  version: "1.2.3-next.1",
  license: "MIT",
  repository: { type: "git", url: "https://example.invalid/repo.git" },
  dependencies: { "@gik-ai/kernel": "0.1.2-next.1" },
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
};
const expected = {
  name: "@gik-ai/example",
  version: "1.2.3-next.1",
  dependencies: { "@gik-ai/kernel": "0.1.2-next.1" },
  peerDependencies: {},
};
const installedVersions = new Map([["@gik-ai/kernel", "0.1.2-next.1"]]);

test("the consumer gate expects every stable package at its exact workspace version", () => {
  const packages = expectedPackages(root);

  assert.deepEqual(
    packages.map((entry: { name: string }) => entry.name).sort(),
    [...stable].sort(),
  );
  for (const entry of packages) {
    assert.match(entry.version, /^\d+\.\d+\.\d+(-next\.\d+)?$/);
    for (const range of Object.values(entry.dependencies) as string[]) {
      assert.ok(!/[\^~*]/.test(range), "workspace dependencies must be exactly pinned");
    }
  }
});

test("import subpaths cover concrete exports and exclude wildcards and package.json", () => {
  const subpaths = importSubpaths({
    name: "@gik-ai/example",
    exports: {
      ".": "./dist/index.js",
      "./worker": "./dist/worker.js",
      "./schemas/*": "./schemas/*",
      "./package.json": "./package.json",
    },
  });

  assert.deepEqual(subpaths, ["@gik-ai/example", "@gik-ai/example/worker"]);
});

test("a fully published package passes consumer verification", () => {
  const errors = verifyInstalledPackage(
    expected,
    publishedManifest,
    installedFiles,
    installedVersions,
  );

  assert.deepEqual(errors, []);
});

test("a version other than the expected one fails the consumer gate", () => {
  const errors = verifyInstalledPackage(
    expected,
    { ...publishedManifest, version: "1.2.3-next.0" },
    installedFiles,
    installedVersions,
  );

  assert.deepEqual(errors, [
    "@gik-ai/example resolved to version 1.2.3-next.0, expected 1.2.3-next.1",
  ]);
});

test("missing published metadata fails the consumer gate", () => {
  const { license, ...withoutLicense } = publishedManifest;

  const errors = verifyInstalledPackage(
    expected,
    withoutLicense,
    installedFiles,
    installedVersions,
  );

  assert.deepEqual(errors, ["@gik-ai/example published metadata omits 'license'"]);
});

test("a published package missing its build output fails the consumer gate", () => {
  const errors = verifyInstalledPackage(
    expected,
    publishedManifest,
    ["package.json", "README.md"],
    installedVersions,
  );

  assert.deepEqual(errors.sort(), [
    "@gik-ai/example published package omits declared entry point 'dist/index.d.ts'",
    "@gik-ai/example published package omits declared entry point 'dist/index.js'",
  ]);
});

test("a dependency closure that resolves an unexpected version fails the consumer gate", () => {
  const errors = verifyInstalledPackage(
    expected,
    publishedManifest,
    installedFiles,
    new Map([["@gik-ai/kernel", "0.1.2-next.0"]]),
  );

  assert.deepEqual(errors, [
    "@gik-ai/example dependency closure resolved @gik-ai/kernel@0.1.2-next.0, expected 0.1.2-next.1",
  ]);
});

test("the consumer project installs exact package versions and every declared peer", () => {
  const manifest = consumerManifest(
    [
      { name: "@gik-ai/react", version: "0.3.1-next.1", peerDependencies: { react: "^18.3.1" } },
      {
        name: "@gik-ai/durable-runtime",
        version: "0.8.1-next.1",
        peerDependencies: { "@azure/cosmos": "^4.4.1", "@gik-ai/kernel": "0.1.2-next.1" },
      },
    ],
    { typescript: "^5.6.3" },
  );

  assert.deepEqual(manifest.dependencies, {
    "@gik-ai/react": "0.3.1-next.1",
    "@gik-ai/durable-runtime": "0.8.1-next.1",
    react: "^18.3.1",
    "@azure/cosmos": "^4.4.1",
  });
  assert.deepEqual(manifest.devDependencies, { typescript: "^5.6.3" });
  assert.equal(manifest.private, true);
});

test("workspace peers are installed while workspace packages are not duplicated as peers", () => {
  const peers = consumerPeerDependencies(expectedPackages(root));

  assert.ok(peers.react, "the React peer must be installed by the consumer");
  for (const peer of Object.keys(peers)) {
    assert.ok(!peer.startsWith("@gik-ai/"), `${peer} must be installed as a package, not a peer`);
  }
});

test("the generated consumer sources exercise every published subpath", () => {
  const subpaths = ["@gik-ai/kernel", "@gik-ai/blueprint/worker"];

  const typescript = typescriptConsumerSource(subpaths);
  const runtime = runtimeConsumerSource(subpaths);

  for (const subpath of subpaths) {
    assert.ok(typescript.includes(`import * as module`) && typescript.includes(subpath));
    assert.ok(runtime.includes(JSON.stringify(subpath)));
  }
  assert.ok(runtime.includes("createInMemoryTransportPair"), "runtime behaviour must be exercised");
});

const attested = (name: string, version: string) => ({
  name,
  version,
  attestations: { provenance: { predicateType: provenancePredicateType } },
});

test("verified signatures and provenance attestations pass the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [],
      missing: [],
      verified: [attested("@gik-ai/kernel", "0.1.2-next.1"), attested("other", "1.0.0")],
    },
    [{ name: "@gik-ai/kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, []);
});

test("an invalid signature or attestation anywhere in the graph fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [{ name: "transitive", version: "2.0.0", code: "EINTEGRITYSIGNATURE" }],
      missing: [],
      verified: [attested("@gik-ai/kernel", "0.1.2-next.1")],
    },
    [{ name: "@gik-ai/kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, [
    "transitive@2.0.0 has an invalid signature or attestation",
  ]);
});

test("a missing registry signature anywhere in the graph fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [],
      missing: [{ name: "transitive", version: "2.0.0" }],
      verified: [attested("@gik-ai/kernel", "0.1.2-next.1")],
    },
    [{ name: "@gik-ai/kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, ["transitive@2.0.0 has a missing registry signature"]);
});

test("a stable package published without a provenance attestation fails the gate", () => {
  const errors = verifyProvenance(
    { invalid: [], missing: [], verified: [] },
    [{ name: "@gik-ai/kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, ["@gik-ai/kernel@0.1.2-next.1 has no verified attestation"]);
});

test("a stable package attested with a non-provenance predicate fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [],
      missing: [],
      verified: [
        {
          name: "@gik-ai/kernel",
          version: "0.1.2-next.1",
          attestations: { provenance: { predicateType: "https://example.invalid/other" } },
        },
      ],
    },
    [{ name: "@gik-ai/kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, [
    "@gik-ai/kernel@0.1.2-next.1 attestation predicate " +
      "'https://example.invalid/other' is not " +
      provenancePredicateType,
  ]);
});

test("an empty or unreadable signature report fails closed", () => {
  const errors = verifyProvenance(undefined, [
    { name: "@gik-ai/kernel", version: "0.1.2-next.1" },
  ]);

  assert.deepEqual(errors, ["@gik-ai/kernel@0.1.2-next.1 has no verified attestation"]);
});

test("the consumer gate runs on GitHub-hosted infrastructure without publishing", () => {
  assert.ok(workflow.includes("runs-on: ubuntu-latest"));
  assert.ok(workflow.includes("npm run release:verify-published"));
  assert.ok(workflow.includes(publicRegistry));
  assert.ok(!workflow.includes("release:publish"));
  assert.ok(!workflow.includes("id-token"));
  assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./.test(workflow), "the gate needs no credentials");
});
