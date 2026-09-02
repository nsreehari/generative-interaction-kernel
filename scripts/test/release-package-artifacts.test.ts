// Regression coverage for issue #36: published packages shipped without their
// declared build output because the publish job never built the release commit.
// These tests pin both the packed-contents verifier and the publication job
// boundary that must build and verify before `changeset publish` runs.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// @ts-expect-error - plain ESM release script without type declarations.
import {
  declaredEntryPoints,
  resolveEntryPoints,
  verifyPackageArtifacts,
  workspaceFiles,
} from "../verify-package-artifacts.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/publish.yml", import.meta.url)),
  "utf8",
);

function packedEntryPoints(workspacePath: string): string[] {
  const manifest = JSON.parse(
    readFileSync(new URL(`../../${workspacePath}/package.json`, import.meta.url), "utf8"),
  );
  const { targets } = resolveEntryPoints(manifest, workspaceFiles(workspacePath, root));
  return ["package.json", ...targets];
}

test("declared entry points cover exports, main, types, and bin targets", () => {
  const entries = declaredEntryPoints({
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    bin: { gik: "./dist/cli.js" },
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./worker": { types: "./dist/worker.d.ts", import: "./dist/worker.js" },
      "./package.json": "./package.json",
    },
  });

  assert.deepEqual(entries.sort(), [
    "dist/cli.js",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/worker.d.ts",
    "dist/worker.js",
    "package.json",
  ]);
});

test("parent-relative export targets are not verifiable entry points", () => {
  const entries = declaredEntryPoints({ exports: { "./shared": "../shared/index.js" } });

  assert.deepEqual(entries, []);
});

test("wildcard export targets expand to every matching workspace file", () => {
  const { targets, errors } = resolveEntryPoints(
    { main: "./dist/index.js", exports: { "./schemas/*": "./schemas/*" } },
    ["dist/index.js", "schemas/cell.schema.json", "schemas/tier.schema.json", "src/index.ts"],
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(targets.sort(), [
    "dist/index.js",
    "schemas/cell.schema.json",
    "schemas/tier.schema.json",
  ]);
});

test("a wildcard export matching no workspace file fails closed", () => {
  const { targets, errors } = resolveEntryPoints(
    { exports: { "./schemas/*": "./schemas/*" } },
    ["dist/index.js"],
  );

  assert.deepEqual(targets, []);
  assert.deepEqual(errors, ["export pattern 'schemas/*' matches no workspace file"]);
});

test("gik-evaluators resolves its published schema files through its wildcard export", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../packages/evaluators/package.json", import.meta.url), "utf8"),
  );
  const { targets, errors } = resolveEntryPoints(
    manifest,
    workspaceFiles("packages/evaluators", root),
  );

  assert.deepEqual(errors, []);
  assert.ok(targets.includes("schemas/cell.schema.json"));
  assert.ok(targets.filter((target: string) => target.startsWith("schemas/")).length > 1);
});

test("verification fails closed when a wildcard-exported file is omitted from the tarball", () => {
  const { errors } = verifyPackageArtifacts(
    root,
    (workspacePath: string) =>
      workspacePath === "packages/evaluators"
        ? packedEntryPoints(workspacePath).filter(
            (file) => file !== "schemas/cell.schema.json",
          )
        : packedEntryPoints(workspacePath),
    workspaceFiles,
  );

  assert.deepEqual(errors, [
    "gik-evaluators package would omit declared entry point 'schemas/cell.schema.json'",
  ]);
});

test("verification fails closed when a packed package omits declared build output", () => {
  const { errors } = verifyPackageArtifacts(
    root,
    (workspacePath: string) =>
      workspacePath === "packages/blueprint"
        ? ["package.json", "README.md"]
        : packedEntryPoints(workspacePath),
    workspaceFiles,
  );

  assert.ok(errors.length > 0);
  assert.ok(
    errors.some(
      (error: string) => error.includes("gik-blueprint") && error.includes("dist/index.js"),
    ),
  );
});

test("verification covers every stable package and passes when entry points are packed", () => {
  const { errors, verified } = verifyPackageArtifacts(root, packedEntryPoints, workspaceFiles);
  const stable = JSON.parse(
    readFileSync(new URL("../../config/npm-release.json", import.meta.url), "utf8"),
  ).stable as string[];

  assert.deepEqual(errors, []);
  assert.deepEqual(
    verified.map((entry: { name: string }) => entry.name).sort(),
    [...stable].sort(),
  );
});

test("the publish job builds and verifies the release commit before publishing", () => {
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));

  const build = publishJob.indexOf("npm run build:public-packages");
  const verify = publishJob.indexOf("npm run release:verify-artifacts");
  const inspect = publishJob.indexOf("npm run release:inspect");
  const publish = publishJob.indexOf("npm run release:publish");

  assert.ok(build > 0, "publish job must build packages");
  assert.ok(verify > build, "publish job must verify packed output after building");
  assert.ok(inspect > build, "publish job must inspect package contents after building");
  assert.ok(publish > verify, "publication must run after verification");
});

test("the publish job reverifies the release tag without requiring master to stay unchanged", () => {
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));
  const reverifyStep = publishJob.slice(
    publishJob.indexOf("      - name: Reverify release ref"),
    publishJob.indexOf("      - name: Setup Node.js"),
  );

  assert.ok(
    reverifyStep.includes('git fetch --force origin "refs/tags/$TAG:refs/tags/$TAG"'),
  );
  assert.ok(reverifyStep.includes('git rev-list -n 1 "$TAG"'));
  assert.ok(!reverifyStep.includes("origin/master"));
});

test("the validate job keeps the release gate, verification, and inspection", () => {
  const validateJob = workflow.slice(
    workflow.indexOf("\n  validate:"),
    workflow.indexOf("\n  publish:"),
  );

  for (const step of [
    "npm run release:validate",
    "npm run release:gate",
    "npm run release:verify-artifacts",
    "npm run release:inspect",
  ]) {
    assert.ok(validateJob.includes(step), `validate job must run ${step}`);
  }
  assert.ok(!validateJob.includes("npm run release:publish"));
});
