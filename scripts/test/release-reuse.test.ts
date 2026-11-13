import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error - release tooling is plain ESM.
import { digest, eligibleRun, restoreProof, restoreValidation, validateProof, validationInputs, writeValidation } from "../workflow-validation.mjs";
// @ts-expect-error - release tooling is plain ESM.
import { inspectTarball, packRelease, publicationOrder, publishRelease, registryPackage, verifyRelease } from "../release-artifacts.mjs";
// @ts-expect-error - release tooling is plain ESM.
import { publishedManifest, publishManifest } from "../announce-release.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gik-reuse-test-"));
  const write = (path: string, value: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  write("package.json", JSON.stringify({ workspaces: ["packages/a"] }));
  write("package-lock.json", '{"lockfileVersion":3}');
  write("node_modules/.package-lock.json", '{"lockfileVersion":3,"packages":{}}');
  write("packages/a/package.json", JSON.stringify({
    name: "gik-a", version: "1.0.0", exports: { ".": "./dist/index.js", "./schemas/*": "./schemas/*" },
  }));
  write("packages/a/dist/index.js", "export const value = 1;");
  write("packages/a/schemas/a.json", "{}");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init");
  git("add", "package.json", "package-lock.json", "packages/a/package.json", "packages/a/schemas/a.json");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  const environment = {
    npm_config_user_agent: "npm/11.6.2 node/v24",
    GITHUB_REPOSITORY: "owner/repo", GITHUB_RUN_ID: "10", GITHUB_RUN_ATTEMPT: "1", PR_HEAD_SHA: head,
  };
  return { root, write, head, environment, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("validation promotion verifies all output bytes, scope and inputs before restoring only dist", () => {
  const f = fixture();
  try {
    const directory = join(f.root, "proof");
    const proof = writeValidation(f.root, directory, "full", f.environment);
    const inputs = validationInputs(f.root, f.environment);
    validateProof(f.root, directory, proof, inputs, "full");
    f.write("packages/a/dist/stale.js", "stale");
    restoreProof(f.root, directory, proof);
    assert.throws(() => readFileSync(join(f.root, "packages/a/dist/stale.js")), /ENOENT/);
    assert.equal(readFileSync(join(f.root, "packages/a/dist/index.js"), "utf8"), "export const value = 1;");
    assert.throws(() => validateProof(f.root, directory, { ...proof, scope: "release" }, inputs, "full"), /scope/);
    assert.throws(() => validateProof(f.root, directory, proof, { ...inputs, lock: "different" }, "full"), /inputs differ/);
    assert.throws(() => validateProof(f.root, directory, { ...proof, files: [{ path: "packages/a/../../package.json" }] }, inputs, "full"), /Invalid output path/);
    f.write("proof/outputs/packages/a/dist/index.js", "tampered");
    assert.throws(() => validateProof(f.root, directory, proof, inputs, "full"), /checksum mismatch/);
  } finally { f.cleanup(); }
});

test("same-input metadata validation reuses only a successful internal CI run and independently verifies its Git tree", async () => {
  const f = fixture();
  try {
    const directory = join(f.root, "proof");
    const proof = writeValidation(f.root, directory, "full", f.environment);
    f.write("event.json", JSON.stringify({ pull_request: { head: { sha: f.head, repo: { full_name: "owner/repo" } } } }));
    const run = { id: 10, run_attempt: 1, event: "pull_request", conclusion: "success",
      path: ".github/workflows/ci.yml", repository: { full_name: "owner/repo" }, head_repository: { full_name: "owner/repo" }, head_sha: f.head };
    assert.equal(eligibleRun({ ...run, head_repository: { full_name: "fork/repo" } }, "owner/repo", f.head), false);
    assert.equal(eligibleRun({ ...run, path: ".github/workflows/untrusted.yml" }, "owner/repo", f.head), false);
    const options = {
      environment: { ...f.environment, GITHUB_RUN_ID: "11", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: join(f.root, "event.json") },
      request(path: string) {
        if (path.includes("/artifacts")) return { artifacts: [{ name: "gik-validation", expired: false }] };
        if (path.includes("/git/commits/")) return { tree: { sha: proof.inputs.tree } };
        return { workflow_runs: [run] };
      },
      download(...args: string[]) { cpSync(directory, args.at(-1)!, { recursive: true }); },
    };
    const result = await restoreValidation(f.root, "full", options);
    assert.equal(result.reused, true);
    f.write("node_modules/.package-lock.json", '{"changed":true}');
    assert.equal((await restoreValidation(f.root, "full", options)).reused, false);
  } finally { f.cleanup(); }
});

test("release promotion is opt-in and full source validation cannot be replaced by a policy-only proof", async () => {
  const f = fixture();
  try {
    f.write("event.json", "{}");
    const result = await restoreValidation(f.root, "full", {
      environment: { ...f.environment, GITHUB_EVENT_NAME: "release", GITHUB_EVENT_PATH: join(f.root, "event.json") },
      request() { throw new Error("Disabled release promotion must not query or trust PRs"); },
    });
    assert.equal(result.reused, false);
  } finally { f.cleanup(); }
});

test("opted-in post-merge promotion requires an associated internal merge and the exact validated tree", async () => {
  const f = fixture();
  try {
    const directory = join(f.root, "proof");
    const proof = writeValidation(f.root, directory, "full", f.environment);
    f.write("event.json", "{}");
    const run = { id: 10, run_attempt: 1, event: "pull_request", conclusion: "success",
      path: ".github/workflows/ci.yml", repository: { full_name: "owner/repo" }, head_repository: { full_name: "owner/repo" }, head_sha: f.head };
    const options = {
      environment: { ...f.environment, GITHUB_RUN_ID: "11", GITHUB_EVENT_NAME: "release",
        GITHUB_EVENT_PATH: join(f.root, "event.json"), ALLOW_PR_VALIDATION_REUSE: "true" },
      request(path: string) {
        if (path.endsWith("/pulls")) return [{ merged_at: "2026-11-12", merge_commit_sha: f.head, head: { sha: f.head, repo: { full_name: "owner/repo" } } }];
        if (path.includes("/artifacts")) return { artifacts: [{ name: "gik-validation", expired: false }] };
        if (path.includes("/git/commits/")) return { tree: { sha: proof.inputs.tree } };
        return { workflow_runs: [run] };
      },
      download(...args: string[]) { cpSync(directory, args.at(-1)!, { recursive: true }); },
    };
    assert.equal((await restoreValidation(f.root, "full", options)).reused, true);
    await assert.rejects(() => restoreValidation(f.root, "full", {
      ...options,
      request(path: string) {
        return path.includes("/git/commits/") ? { tree: { sha: "0".repeat(40) } } : options.request(path);
      },
    }), /tree mismatch/);
    assert.equal((await restoreValidation(f.root, "full", {
      ...options,
      request(path: string) { return path.endsWith("/pulls") ? [] : options.request(path); },
    })).reused, false);
  } finally { f.cleanup(); }
});

test("real archive inspection rejects omitted wildcard exports, not just missing named dist outputs", () => {
  const f = fixture();
  try {
    const manifest = JSON.parse(readFileSync(join(f.root, "packages/a/package.json"), "utf8"));
    f.write("packing/package/package.json", JSON.stringify(manifest));
    f.write("packing/package/dist/index.js", "export {};");
    const archive = join(f.root, "a.tgz");
    execFileSync("tar", ["-czf", archive, "-C", join(f.root, "packing"), "package"]);
    assert.throws(() => inspectTarball(f.root, { path: "packages/a", manifest }, archive), /schemas\/a.json/);
    f.write("packing/package/schemas/a.json", "{}");
    execFileSync("tar", ["-czf", archive, "-C", join(f.root, "packing"), "package"]);
    assert.deepEqual(inspectTarball(f.root, { path: "packages/a", manifest }, archive), manifest);
  } finally { f.cleanup(); }
});

test("release promotion binds actual archives to a producer checksum and the reviewed source", async () => {
  const f = fixture();
  try {
    f.write("config/npm-release.json", '{"stable":["gik-a"]}');
    const directory = join(f.root, "release");
    const manifest = JSON.parse(readFileSync(join(f.root, "packages/a/package.json"), "utf8"));
    f.write("packing/package/package.json", JSON.stringify(manifest));
    f.write("packing/package/dist/index.js", "export {};");
    f.write("packing/package/schemas/a.json", "{}");
    await packRelease(f.root, directory, {
      registry: () => null,
      execute() {
        execFileSync("tar", ["-czf", join(directory, "gik-a-1.0.0.tgz"), "-C", join(f.root, "packing"), "package"]);
        return JSON.stringify([{ name: "gik-a", version: "1.0.0", filename: "gik-a-1.0.0.tgz" }]);
      },
    });
    const checksum = digest(readFileSync(join(directory, "release-artifacts.json")));
    assert.equal(verifyRelease(f.root, directory, checksum).packages[0].name, "gik-a");
    assert.throws(() => verifyRelease(f.root, directory, "0".repeat(64)), /manifest checksum mismatch/);
    f.write("release/gik-a-1.0.0.tgz", "corrupt");
    assert.throws(() => verifyRelease(f.root, directory, checksum), /archive checksum mismatch/);
  } finally { f.cleanup(); }
});

test("publication preserves dependency order, skips existing versions, and resumes only identical partial publications", async () => {
  const entries = [
    { name: "gik-b", version: "1.0.0", file: "b.tgz", dependencies: { "gik-a": "1.0.0" }, publish: true, integrity: "sha512-b" },
    { name: "gik-a", version: "1.0.0", file: "a.tgz", dependencies: {}, publish: false, integrity: "sha512-a" },
  ];
  assert.deepEqual(publicationOrder(entries).map((entry: { name: string }) => entry.name), ["gik-a", "gik-b"]);
  const calls: string[][] = [];
  const options = {
    verify: () => ({ packages: entries }),
    registry: (name: string) => name === "gik-a" ? { dist: { integrity: "sha512-old-build" } } : null,
    execute: (args: string[]) => { calls.push(args); return ""; },
  };
  await publishRelease("root", "artifacts", "digest", "latest", options);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("--ignore-scripts"));
  assert.ok(calls[0].includes("--provenance"));
  await assert.rejects(() => publishRelease("root", "artifacts", "digest", "latest", {
    ...options, registry: () => ({ dist: { integrity: "sha512-tampered" } }),
  }), /differs from release artifact/);
  assert.throws(() => publicationOrder([
    { name: "a", dependencies: { b: "1" } }, { name: "b", dependencies: { a: "1" } },
  ]), /Cyclic/);
});

test("only explicit registry absence permits publication; auth and transport failures are blocking", async () => {
  assert.equal(await registryPackage("gik-a", "1.0.0", "root", async () => ({ status: 404 })), null);
  await assert.rejects(() => registryPackage("gik-a", "1.0.0", "root", async () => ({ status: 401, ok: false })), /Cannot determine/);
  await assert.rejects(() => registryPackage("gik-a", "1.0.0", "root", async () => { throw new Error("transport failure"); }), /transport failure/);
});

test("verified release manifest pins registry identities and never accepts a different published archive", async () => {
  const context = { repository: "nsreehari/generative-interaction-kernel", commit: "a".repeat(40), tag: "npm-2026-11-12.1", verificationRunId: "123" };
  const packages = [{ name: "gik-a", version: "1.0.0", publish: true, integrity: "sha512-YQ==" }];
  const fetcher = async () => ({ ok: true, json: async () => ({
    name: "gik-a", version: "1.0.0", dist: { integrity: "sha512-YQ==", tarball: "https://registry.npmjs.org/gik-a/-/gik-a-1.0.0.tgz" },
  }) });
  const manifest = await publishedManifest(packages, context, fetcher);
  assert.equal(manifest.format, "gik-release-manifest/1");
  assert.equal(manifest.packages[0].version, "1.0.0");
  await assert.rejects(() => publishedManifest([{ ...packages[0], integrity: "sha512-Yg==" }], context, fetcher), /Published bytes differ/);
  const f = fixture();
  try {
    f.write("manifest.json", JSON.stringify(manifest));
    const bytes = readFileSync(join(f.root, "manifest.json"));
    let queries = 0;
    publishManifest(context.repository, context.tag, join(f.root, "manifest.json"), () => {
      queries += 1;
      return queries === 1 ? JSON.stringify({ assets: [{ name: "gik-release-manifest.json", id: 1 }] }) : bytes;
    });
    assert.equal(queries, 2, "Existing identical manifest must not be overwritten");
    assert.equal(digest(bytes).length, 64);
  } finally { f.cleanup(); }
});
