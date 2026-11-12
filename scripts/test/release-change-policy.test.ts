import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - release tooling is plain ESM.
import { affectedPackages, dependencyClosure, fullValidation } from "../change-policy.mjs";
// @ts-expect-error - release tooling is plain ESM.
import { allowedVersionOutput, validateLockOutput, validateManifestOutput } from "../version-output-policy.mjs";
// @ts-expect-error - release tooling is plain ESM.
import { syncWorkspaceDependencies } from "../sync-workspace-dependencies.mjs";
// @ts-expect-error - release tooling is plain ESM.
import { prepareImplementationRelease } from "../prepare-implementation-release.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const policy = JSON.parse(readFileSync(join(root, "config/npm-release.json"), "utf8"));
const workspaces = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces
  .map((path: string) => ({ path, manifest: JSON.parse(readFileSync(join(root, path, "package.json"), "utf8")) }));

test("required Validate uses a small policy gate only for known documentation/workflow inputs", () => {
  assert.equal(fullValidation(["docs/releasing.md", ".github/workflows/ci.yml", "AGENTS.md", "scripts/change-policy.mjs"]), false);
  for (const path of ["kernel/src/index.ts", "config/npm-release.json", ".changeset/config.json",
    "turbo.json", "package-lock.json", "scripts/sync-package-license.mjs", "scripts/new-tool.mjs", "unknown/input"]) {
    assert.equal(fullValidation([path]), true, path);
  }
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /name: Validate/);
  assert.doesNotMatch(workflow, /^\s+paths(?:-ignore)?:/m);
  assert.match(workflow, /run: npm run test:release/);
  assert.match(workflow, /run: npm test/);
});

test("release ownership includes sources outside packages and excludes docs, workflow, and test-only changes", () => {
  const affected = (paths: string[]) => affectedPackages(paths, workspaces, policy.stable);
  assert.deepEqual(affected(["docs/releasing.md", ".github/workflows/ci.yml", "kernel/test/kernel.test.ts", "packages/kernel/CHANGELOG.md"]), []);
  assert.deepEqual(affected(["kernel/src/index.ts"]), ["gik-kernel"]);
  assert.deepEqual(affected(["blueprint/src/worker.ts"]), ["gik-blueprint"]);
  assert.deepEqual(affected(["face/src/tool-surface.ts"]), ["gik-agentface", "gik-controlface"]);
  assert.deepEqual(affected(["adapters/react/src/index.ts"]), ["gik-react"]);
  assert.deepEqual(affected(["transports/http-sse/src/server.ts"]), ["gik-transport-http-sse"]);
  assert.deepEqual(affected(["packages/durable-runtime/src/index.ts"]), ["gik-durable-runtime"]);
  assert.deepEqual(affected(["packages/kernel/README.md"]), ["gik-kernel"]);
  assert.deepEqual(affected(["packages/evaluators/schemas/program.schema.json"]), ["gik-evaluators", "gik-kernel"]);
  assert.ok(affected(["kernel/tsconfig.json"]).includes("gik-durable-runtime"));
  assert.deepEqual(affected(["package-lock.json"]), [...policy.stable].sort());
  assert.throws(() => affected(["new-production/input.ts"]), /Unknown.*ownership/);
});

test("version output allowlist and semantic comparison reject unrelated edits", () => {
  const packages = [{ path: "packages/a", manifest: { name: "a" } }];
  const allowed = (path: string, status: string) =>
    allowedVersionOutput(path, status, packages, ["a"], [".changeset/intent.md"]);
  assert.equal(allowed(".changeset/intent.md", "D"), true);
  assert.equal(allowed(".changeset/config.json", "M"), false);
  assert.equal(allowed("packages/a/src/index.ts", "M"), false);
  assert.equal(allowed("packages/a/package.json", "M"), true);
  assert.equal(allowed("packages/a/CHANGELOG.md", "A"), true);
  const versions = new Map([["a", "1.1.0"]]);
  const before = { name: "b", version: "1.0.0", dependencies: { a: "1.0.0", external: "^2.0.0" } };
  const after = { ...before, version: "1.0.1", dependencies: { a: "1.1.0", external: "^2.0.0" } };
  assert.doesNotThrow(() => validateManifestOutput(before, after, versions));
  assert.throws(() => validateManifestOutput(before, { ...after, scripts: { postinstall: "bad" } }, versions));
  assert.throws(() => validateManifestOutput(before, { ...after, dependencies: { ...after.dependencies, a: "^1.1.0" } }, versions));
  const lock = { packages: { "packages/a": { version: "1.0.0" }, "node_modules/external": { integrity: "original" } } };
  const updated = { packages: { ...lock.packages, "packages/a": { version: "1.1.0" } } };
  assert.doesNotThrow(() => validateLockOutput(lock, updated,
    [{ path: "packages/a", manifest: { version: "1.1.0" } }], versions));
  assert.throws(() => validateLockOutput(lock, { packages: { ...updated.packages, "node_modules/external": { integrity: "changed" } } },
    [{ path: "packages/a", manifest: { version: "1.1.0" } }], versions));
});

test.each(["minor", "major"])("Changesets preserves explicit %s over automatic patches and exact transitive pins", (intent) => {
  const fixture = join(root, "scripts/test", `.release-fixture-${randomUUID()}`);
  const writeJson = (path: string, value: unknown) => writeFileSync(join(fixture, path), `${JSON.stringify(value, null, 2)}\n`);
  mkdirSync(join(fixture, ".changeset"), { recursive: true });
  try {
    writeJson("package.json", { private: true, workspaces: ["packages/*"] });
    const config = JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8"));
    writeJson(".changeset/config.json", { ...config, ignore: [] });
    const packages = [
      { path: "packages/a", manifest: { name: "a", version: "0.1.0" } },
      { path: "packages/b", manifest: { name: "b", version: "0.1.0", dependencies: { a: "0.1.0" } } },
      { path: "packages/c", manifest: { name: "c", version: "0.1.0", peerDependencies: { b: "0.1.0" } } },
    ];
    for (const { path, manifest } of packages) {
      mkdirSync(join(fixture, path), { recursive: true });
      writeJson(`${path}/package.json`, manifest);
    }
    const selected = dependencyClosure(["a"], packages, ["a", "b", "c"]);
    assert.deepEqual(selected, ["a", "b", "c"]);
    writeFileSync(join(fixture, ".changeset/intent.md"), `---\n"a": ${intent}\n---\n\nExplicit release intent.\n`);
    writeFileSync(join(fixture, ".changeset/automatic.md"), `---\n${selected.map((name: string) => `"${name}": patch`).join("\n")}\n---\n\nChanged inputs.\n`);
    execFileSync(process.execPath, [join(root, "node_modules/@changesets/cli/bin.js"), "version"], { cwd: fixture, stdio: "pipe" });
    // The existing sync script expects explicit workspace paths.
    writeJson("package.json", { private: true, workspaces: packages.map(({ path }) => path) });
    syncWorkspaceDependencies(fixture);
    const manifests = packages.map(({ path }) => JSON.parse(readFileSync(join(fixture, path, "package.json"), "utf8")));
    assert.equal(manifests[0].version, intent === "minor" ? "0.2.0" : "1.0.0");
    assert.notEqual(manifests[1].version, "0.1.0");
    assert.notEqual(manifests[2].version, "0.1.0");
    assert.equal(manifests[1].dependencies.a, manifests[0].version);
    assert.equal(manifests[2].peerDependencies.b, manifests[1].version);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("versioning uses trusted base data, the implementation PR and an App event chain", () => {
  const version = readFileSync(join(root, ".github/workflows/version-packages.yml"), "utf8");
  const publish = readFileSync(join(root, ".github/workflows/publish.yml"), "utf8");
  const script = readFileSync(join(root, "scripts/write-implementation-release.mjs"), "utf8");
  const release = readFileSync(join(root, ".github/workflows/release-merged.yml"), "utf8");
  assert.match(version, /pull_request_target:/);
  assert.match(version, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(version, /npm install --ignore-scripts/);
  assert.match(version, /GH_TOKEN: \$\{\{ steps\.version-token\.outputs\.token \}\}/);
  assert.match(release, /GH_TOKEN: \$\{\{ steps\.app\.outputs\.token \}\}/);
  assert.match(publish, /environment: npm-publish/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /run: npm run release:gate/);
  assert.match(script, /force: false/);
  assert.doesNotMatch(script, /"--force"|--force-with-lease/);
  assert.doesNotMatch(version, /HEAD:refs\/heads\/master/);
});

test.each(["source-and-changeset", "changeset-only"])("implementation-PR planning retains minor intent and is idempotent: %s", (change) => {
  const fixture = join(root, "scripts/test", `.release-fixture-${randomUUID()}`);
  const write = (path: string, value: string) => {
    mkdirSync(join(fixture, path, ".."), { recursive: true });
    writeFileSync(join(fixture, path), value);
  };
  const json = (path: string, value: unknown) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: fixture, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  mkdirSync(fixture, { recursive: true });
  try {
    git("init");
    git("config", "user.name", "Release fixture");
    git("config", "user.email", "fixture@example.invalid");
    const packages = ["packages/a", "packages/b"];
    json("package.json", { private: true, workspaces: packages });
    json(".changeset/config.json", {
      ...JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8")), ignore: [],
    });
    json("config/npm-release.json", { stable: ["a", "b"] });
    json("packages/a/package.json", { name: "a", version: "1.0.0" });
    json("packages/b/package.json", { name: "b", version: "1.0.0", dependencies: { a: "1.0.0" } });
    json("package-lock.json", { lockfileVersion: 3, packages: {
      "": {}, "packages/a": { version: "1.0.0" },
      "packages/b": { version: "1.0.0", dependencies: { a: "1.0.0" } },
    } });
    // The planner uses only trusted CLI code, even when its input repository is a fixture.
    mkdirSync(join(fixture, "node_modules/@changesets/cli"), { recursive: true });
    write("node_modules/@changesets/cli/bin.js",
      `import ${JSON.stringify(new URL("../../node_modules/@changesets/cli/bin.js", import.meta.url).href)};\n`);
    write("node_modules/@changesets/cli/package.json", '{"type":"module"}');
    git("add", "package.json", "package-lock.json", ".changeset", "config", "packages");
    git("commit", "-m", "baseline");
    const base = git("rev-parse", "HEAD");
    if (change === "source-and-changeset") write("packages/a/src/index.js", "export const value = 1;\n");
    write(".changeset/intent.md", '---\n"a": minor\n---\n\nImprove the public API.\n');
    git("add", "packages", ".changeset");
    git("commit", "-m", "implementation");
    const plan = prepareImplementationRelease({ root: fixture, base, head: git("rev-parse", "HEAD"), pullRequest: 12 });
    assert.ok(plan.outputs["packages/a/package.json"], "Explicit minor intent must generate a version even without source changes");
    assert.equal(JSON.parse(plan.outputs["packages/a/package.json"]).version, "1.1.0");
    assert.equal(JSON.parse(plan.outputs["packages/b/package.json"]).dependencies.a, "1.1.0");
    assert.equal(plan.outputs[".changeset/intent.md"], null);
    for (const [path, content] of Object.entries(plan.outputs) as [string, string | null][]) {
      if (content === null) rmSync(join(fixture, path));
      else write(path, content);
    }
    git("add", "packages", ".changeset", "package-lock.json");
    git("commit", "-m", "version metadata");
    const again = prepareImplementationRelease({ root: fixture, base, head: git("rev-parse", "HEAD"), pullRequest: 12 });
    assert.deepEqual(again.outputs, {});
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
