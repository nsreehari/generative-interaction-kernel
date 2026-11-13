// Regression coverage for issue #36: published packages shipped without their
// declared build output because the publish job never built the release commit.
// Publication must use the exact verified archive, rather than rebuilding
// different bytes after the release gate.

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
// @ts-expect-error - plain ESM release script without type declarations.
import { inspectNpmPackages } from "../inspect-npm-packages.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/publish.yml", import.meta.url)),
  "utf8",
);

test("package inspection packs only stable workspaces without checking registry publication eligibility", () => {
  const environment = { GITHUB_ACTIONS: "true", npm_execpath: "npm-cli.js" };
  const { stable, experimental, internal } = JSON.parse(
    readFileSync(new URL("../../config/npm-release.json", import.meta.url), "utf8"),
  );
  let invoked = false;
  const status = inspectNpmPackages(root, {
    environment,
    run(command: string, args: string[], options: { cwd: string; stdio: string }) {
      invoked = true;
      assert.equal(command, process.execPath);
      assert.deepEqual(args, ["npm-cli.js", "pack", "--dry-run", ...stable.map((name: string) => `--workspace=${name}`)]);
      assert.equal(options.cwd, root);
      assert.equal(options.stdio, "inherit");
      for (const name of [...experimental, ...internal]) assert.ok(!args.includes(`--workspace=${name}`));
      return { status: 0 };
    },
  });
  assert.ok(invoked);
  assert.equal(status, 0);
});

test("package inspection preserves failures and the GitHub Actions boundary", () => {
  const environment = { GITHUB_ACTIONS: "true", npm_execpath: "npm-cli.js" };
  assert.throws(() => inspectNpmPackages(root, { environment: {} }), /only in GitHub Actions/);
  assert.throws(() => inspectNpmPackages(root, { environment: { GITHUB_ACTIONS: "true" } }), /through npm/);
  assert.equal(inspectNpmPackages(root, { environment, run: () => ({ status: 7 }) }), 7);
  assert.equal(inspectNpmPackages(root, { environment, run: () => ({ status: null }) }), 1);
  const error = new Error("could not start npm");
  assert.throws(() => inspectNpmPackages(root, { environment, run: () => ({ error }) }), error);
});

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

test("the publisher promotes verified artifacts without reinstalling, rebuilding or executing package scripts", () => {
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"), workflow.indexOf("\n  verify-published:"));
  const download = publishJob.indexOf("name: gik-npm-release");
  const publish = publishJob.indexOf("npm run release:publish-artifacts");
  assert.ok(download > 0 && publish > download);
  assert.ok(publishJob.includes("RELEASE_MANIFEST_SHA256: ${{ needs.validate.outputs.manifest_sha256 }}"));
  assert.ok(publishJob.includes("environment: npm-publish"));
  assert.ok(publishJob.includes("id-token: write"));
  assert.ok(!publishJob.includes("npm run build:"));
  assert.ok(!publishJob.includes("npm install --no-audit"));
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

test("the validate job keeps the full gate and packs verified artifacts before protected publication", () => {
  const validateJob = workflow.slice(
    workflow.indexOf("\n  validate:"),
    workflow.indexOf("\n  publish:"),
  );

  for (const step of [
    "npm run release:validate",
    "npm run release:gate",
    "npm run release:pack",
    "name: gik-npm-release",
  ]) {
    assert.ok(validateJob.includes(step), `validate job must run ${step}`);
  }
  assert.ok(!validateJob.includes("npm run release:publish"));
});
