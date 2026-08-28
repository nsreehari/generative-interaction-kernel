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
  verifyPackageArtifacts,
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
  return ["package.json", ...declaredEntryPoints(manifest)];
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

test("wildcard and parent-relative export targets are not verifiable entry points", () => {
  const entries = declaredEntryPoints({
    exports: { "./*": "./dist/*.js", "./shared": "../shared/index.js" },
  });

  assert.deepEqual(entries, []);
});

test("verification fails closed when a packed package omits declared build output", () => {
  const { errors } = verifyPackageArtifacts(root, (workspacePath: string) =>
    workspacePath === "packages/blueprint"
      ? ["package.json", "README.md"]
      : packedEntryPoints(workspacePath),
  );

  assert.ok(errors.length > 0);
  assert.ok(
    errors.some(
      (error: string) => error.includes("@gik-ai/blueprint") && error.includes("dist/index.js"),
    ),
  );
});

test("verification covers every stable package and passes when entry points are packed", () => {
  const { errors, verified } = verifyPackageArtifacts(root, packedEntryPoints);
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
