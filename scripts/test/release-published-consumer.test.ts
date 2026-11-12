// Regression coverage for the clean external-consumer gate of issue #36: the
// published packages must install from the public registry at exact versions
// with complete metadata, entry points, and dependency closure, and the gate
// must stay a GitHub-hosted, non-publishing job.

import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// @ts-expect-error - plain ESM release script without type declarations.
import {
  consumerManifest,
  consumerPeerDependencies,
  expectedPackages,
  importSubpaths,
  installPublishedPackages,
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
  name: "gik-example",
  version: "1.2.3-next.1",
  license: "MIT",
  repository: { type: "git", url: "https://example.invalid/repo.git" },
  dependencies: { "gik-kernel": "0.1.2-next.1" },
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
};
const expected = {
  name: "gik-example",
  version: "1.2.3-next.1",
  dependencies: { "gik-kernel": "0.1.2-next.1" },
  peerDependencies: {},
};
const installedVersions = new Map([["gik-kernel", "0.1.2-next.1"]]);

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
    name: "gik-example",
    exports: {
      ".": "./dist/index.js",
      "./worker": "./dist/worker.js",
      "./schemas/*": "./schemas/*",
      "./package.json": "./package.json",
    },
  });

  assert.deepEqual(subpaths, ["gik-example", "gik-example/worker"]);
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
    "gik-example resolved to version 1.2.3-next.0, expected 1.2.3-next.1",
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

  assert.deepEqual(errors, ["gik-example published metadata omits 'license'"]);
});

test("a published package missing its build output fails the consumer gate", () => {
  const errors = verifyInstalledPackage(
    expected,
    publishedManifest,
    ["package.json", "README.md"],
    installedVersions,
  );

  assert.deepEqual(errors.sort(), [
    "gik-example published package omits declared entry point 'dist/index.d.ts'",
    "gik-example published package omits declared entry point 'dist/index.js'",
  ]);
});

test("a dependency closure that resolves an unexpected version fails the consumer gate", () => {
  const errors = verifyInstalledPackage(
    expected,
    publishedManifest,
    installedFiles,
    new Map([["gik-kernel", "0.1.2-next.0"]]),
  );

  assert.deepEqual(errors, [
    "gik-example dependency closure resolved gik-kernel@0.1.2-next.0, expected 0.1.2-next.1",
  ]);
});

test("the consumer project installs exact package versions and every declared peer", () => {
  const manifest = consumerManifest(
    [
      { name: "gik-react", version: "0.3.1-next.1", peerDependencies: { react: "^18.3.1" } },
      {
        name: "gik-durable-runtime",
        version: "0.8.1-next.1",
        peerDependencies: { "@azure/cosmos": "^4.4.1", "gik-kernel": "0.1.2-next.1" },
      },
    ],
    { typescript: "^5.6.3" },
  );

  assert.deepEqual(manifest.dependencies, {
    "gik-react": "0.3.1-next.1",
    "gik-durable-runtime": "0.8.1-next.1",
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
    assert.ok(!peer.startsWith("gik-"), `${peer} must be installed as a package, not a peer`);
  }
});

test("the generated consumer sources exercise every published subpath", () => {
  const subpaths = ["gik-kernel", "gik-blueprint/worker"];

  const typescript = typescriptConsumerSource(subpaths);
  const runtime = runtimeConsumerSource(subpaths);

  for (const subpath of subpaths) {
    assert.ok(typescript.includes(`import * as module`) && typescript.includes(subpath));
    assert.ok(runtime.includes(JSON.stringify(subpath)));
  }
  assert.ok(runtime.includes("createInMemoryTransportPair"), "runtime behaviour must be exercised");
});

test("generated agent package smoke checks execute guidance, stateful tools, and proposal application", () => {
  const source = runtimeConsumerSource([
    "gik-kernel",
    "gik-agent-lifecycle-exp",
    "gik-blueprint-agent-host",
  ]);
  execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    stdio: "pipe",
  });
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
      verified: [attested("gik-kernel", "0.1.2-next.1"), attested("other", "1.0.0")],
    },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, []);
});

test("an invalid signature or attestation anywhere in the graph fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [{ name: "transitive", version: "2.0.0", code: "EINTEGRITYSIGNATURE" }],
      missing: [],
      verified: [attested("gik-kernel", "0.1.2-next.1")],
    },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
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
      verified: [attested("gik-kernel", "0.1.2-next.1")],
    },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, ["transitive@2.0.0 has a missing registry signature"]);
});

test("a stable package published without a provenance attestation fails the gate", () => {
  const errors = verifyProvenance(
    { invalid: [], missing: [], verified: [] },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, ["gik-kernel@0.1.2-next.1 has no verified attestation"]);
});

test("a signed stable package carrying no provenance attestation fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [],
      missing: [],
      verified: [{ name: "gik-kernel", version: "0.1.2-next.1", attestations: {} }],
    },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, ["gik-kernel@0.1.2-next.1 has no provenance attestation"]);
});

test("a stable package attested with a non-provenance predicate fails the gate", () => {
  const errors = verifyProvenance(
    {
      invalid: [],
      missing: [],
      verified: [
        {
          name: "gik-kernel",
          version: "0.1.2-next.1",
          attestations: { provenance: { predicateType: "https://example.invalid/other" } },
        },
      ],
    },
    [{ name: "gik-kernel", version: "0.1.2-next.1" }],
  );

  assert.deepEqual(errors, [
    "gik-kernel@0.1.2-next.1 attestation predicate " +
      "'https://example.invalid/other' is not " +
      provenancePredicateType,
  ]);
});

test("an empty or unreadable signature report fails closed", () => {
  const errors = verifyProvenance(undefined, [
    { name: "gik-kernel", version: "0.1.2-next.1" },
  ]);

  assert.deepEqual(errors, ["gik-kernel@0.1.2-next.1 has no verified attestation"]);
});

test("the consumer gate runs on GitHub-hosted infrastructure without publishing", () => {
  assert.ok(workflow.includes("runs-on: ubuntu-latest"));
  assert.ok(workflow.includes("npm run release:verify-published"));
  assert.ok(workflow.includes(publicRegistry));
  assert.ok(!workflow.includes("release:publish"));
  assert.ok(!workflow.includes("id-token"));
  assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./.test(workflow), "the gate needs no credentials");
});

test("consumer verification follows successful stable publication at the validated commit", () => {
  const publish = readFileSync(new URL("../../.github/workflows/publish.yml", import.meta.url), "utf8");
  const followup = publish.slice(publish.indexOf("\n  verify-published:"));
  assert.ok(followup.includes("needs: [validate, publish]"));
  assert.ok(followup.includes("github.event_name == 'release' && needs.validate.outputs.channel == 'latest'"));
  assert.ok(followup.includes("uses: ./.github/workflows/verify-published-packages.yml"));
  assert.ok(followup.includes("commit: ${{ needs.validate.outputs.commit }}"));
  assert.ok(!followup.includes("secrets: inherit"));
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("workflow_call:"));
  assert.ok(workflow.includes("ref: ${{ inputs.commit || github.sha }}"));
});

test("automatic version/release events use the repository-scoped App instead of suppressed token events", () => {
  const version = readFileSync(new URL("../../.github/workflows/version-packages.yml", import.meta.url), "utf8");
  assert.ok(version.includes("uses: actions/create-github-app-token@v2"));
  assert.ok(version.includes("repositories: ${{ github.event.repository.name }}"));
  assert.ok(version.includes("permission-contents: write"));
  assert.ok(version.includes("GH_TOKEN: ${{ steps.version-token.outputs.token }}"));
  assert.ok(version.includes("node scripts/write-implementation-release.mjs"));
  assert.ok(!version.includes("gh workflow run"));
  assert.ok(!version.includes("actions: write"));
});

test("only registry ETARGET propagation failures receive bounded installation retries", async () => {
  let attempts = 0;
  const waits: number[] = [];
  await installPublishedPackages(root, {
    execute(_command: string, args: string[]) {
      assert.ok(args.includes("--prefer-online"));
      attempts++;
      return attempts < 3 ? { status: 1, stderr: "npm error code ETARGET\n" } : { status: 0 };
    },
    async wait(milliseconds: number) { waits.push(milliseconds); },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [60_000, 60_000]);
  attempts = 0;
  await assert.rejects(installPublishedPackages(root, {
    execute() { attempts++; return { status: 1, stderr: "npm error code ETARGET\n" }; },
    async wait() {},
  }), /npm install failed/);
  assert.equal(attempts, 6);
});

test("other install failures and process errors fail without propagation retries", async () => {
  for (const result of [{ status: 1, stderr: "npm error code E401" }, { status: null, stderr: "code ETARGET" }, { error: new Error("spawn failed") }]) {
    let attempts = 0, waits = 0;
    await assert.rejects(installPublishedPackages(root, {
      execute() { attempts++; return result; },
      async wait() { waits++; },
    }));
    assert.equal(attempts, 1);
    assert.equal(waits, 0);
  }
});
