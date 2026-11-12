import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { affectedPackages, dependencyClosure } from "./change-policy.mjs";
import { syncWorkspaceDependencies } from "./sync-workspace-dependencies.mjs";
import { validateLockOutput, validateManifestOutput } from "./version-output-policy.mjs";

const journalPath = ".changeset/implementation-release.json";
const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
export function normalizeManifest(manifest, versions) {
  const copy = structuredClone(manifest);
  copy.version = versions.get(copy.name);
  for (const field of fields) {
    for (const name of Object.keys(copy[field] ?? {})) {
      if (versions.has(name)) copy[field][name] = versions.get(name);
    }
  }
  return copy;
}

export function updateLock(lock, workspaces, rootManifest) {
  const copy = structuredClone(lock);
  assert.ok([2, 3].includes(copy.lockfileVersion), "Unsupported lockfile format");
  assert.ok(!copy.dependencies, "Legacy lockfile dependency trees require maintainer adoption");
  for (const { path, manifest } of [{ path: "", manifest: rootManifest }, ...workspaces]) {
    const entry = copy.packages[path];
    assert.ok(entry, `Missing lockfile workspace ${path}`);
    for (const field of fields) {
      const desired = manifest[field] ?? {};
      const locked = entry[field] ?? {};
      assert.deepEqual(Object.keys(locked).sort(), Object.keys(desired).sort(), `${path} lock dependency keys must match`);
      for (const [name, version] of Object.entries(desired)) {
        const internal = workspaces.some(({ manifest: other }) => other.name === name);
        if (internal) locked[name] = version;
        else assert.equal(locked[name], version, `${path} external lock dependency ${name} is stale`);
      }
    }
    if (path) entry.version = manifest.version;
  }
  return copy;
}

export function prepareImplementationRelease({ root, base, head, pullRequest }) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trimEnd();
  const blob = (commit, path) => {
    if (git("ls-tree", commit, "--", path) === "") return null;
    return git("show", `${commit}:${path}`);
  };
  const parse = (commit, path) => JSON.parse(blob(commit, path));
  assert.match(base, /^[a-f0-9]{40}$/);
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(pullRequest) && pullRequest > 0);
  git("merge-base", "--is-ancestor", base, head);
  const rootManifest = parse(base, "package.json");
  const sourceRoot = parse(head, "package.json");
  assert.deepEqual(sourceRoot.workspaces, rootManifest.workspaces, "Workspace changes require maintainer adoption");
  assert.equal(blob(head, ".changeset/config.json"), blob(base, ".changeset/config.json"),
    "Changesets policy changes require maintainer adoption before package versioning");
  assert.equal(blob(head, "config/npm-release.json"), blob(base, "config/npm-release.json"),
    "Publication policy changes require maintainer adoption");
  assert.equal(blob(head, ".changeset/pre.json"), null, "Prereleases require the manual reviewed path");
  const stable = parse(base, "config/npm-release.json").stable;
  const before = rootManifest.workspaces.map((path) => ({ path, manifest: parse(base, `${path}/package.json`) }));
  const versions = new Map(before.map(({ manifest }) => [manifest.name, manifest.version]));
  assert.ok([...versions.values()].every((version) => /^\d+\.\d+\.\d+$/.test(version)), "Prereleases require manual versioning");
  const source = before.map(({ path }) => ({ path, manifest: parse(head, `${path}/package.json`) }));
  for (let index = 0; index < before.length; index += 1) {
    assert.equal(source[index].manifest.name, before[index].manifest.name, "Package renames require maintainer adoption");
    assert.equal(Boolean(source[index].manifest.private), Boolean(before[index].manifest.private),
      "Publication visibility changes require maintainer adoption");
  }
  const normalized = source.map(({ path, manifest }) => ({ path, manifest: normalizeManifest(manifest, versions) }));
  const changedPaths = git("diff", "--name-only", "-z", base, head).split("\0").filter(Boolean);
  const substantive = changedPaths.filter((path) => {
    const index = before.findIndex((entry) => path === `${entry.path}/package.json`);
    return index < 0 || encode(normalized[index].manifest) !== encode(before[index].manifest);
  }).filter((path) => path !== "package-lock.json"
    || encode(stripLockMetadata(parse(head, path), before)) !== encode(stripLockMetadata(parse(base, path), before)));
  const changesets = {};
  const oldJournal = blob(head, journalPath);
  if (oldJournal) {
    const journal = JSON.parse(oldJournal);
    if (journal.pullRequest === pullRequest) Object.assign(changesets, journal.changesets);
  }
  for (const path of git("ls-tree", "-r", "--name-only", head, ".changeset").split("\n")) {
    if (/^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md") {
      changesets[path] = blob(head, path);
    }
  }
  for (const [path, content] of Object.entries(changesets)) {
    assert.match(path, /^\.changeset\/[a-zA-Z0-9_-]+\.md$/);
    assert.ok(path !== ".changeset/README.md" && typeof content === "string" && content.length < 100_000,
      "Invalid retained changeset data");
  }
  assert.ok(!Object.hasOwn(changesets, ".changeset/automatic-patch.md"),
    "automatic-patch.md is reserved for generated release intent");
  const scratch = join(root, ".release-input");
  assert.ok(!existsSync(scratch), "Release snapshot already exists");
  mkdirSync(join(scratch, ".changeset"), { recursive: true });
  const write = (path, content) => {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), content);
  };
  const outputs = {};
  try {
    // Only JSON/Markdown data is materialized. Never copy PR config, scripts, or source.
    write("package.json", encode({ private: true, workspaces: rootManifest.workspaces }));
    write(".changeset/config.json", encode(parse(base, ".changeset/config.json")));
    for (const { path, manifest } of normalized) {
      write(`${path}/package.json`, encode(manifest));
      const changelog = blob(base, `${path}/CHANGELOG.md`);
      if (changelog !== null) write(`${path}/CHANGELOG.md`, `${changelog}\n`);
    }
    for (const [path, content] of Object.entries(changesets)) write(path, content);
    const cli = join(root, "node_modules/@changesets/cli/bin.js");
    const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: scratch, stdio: "pipe" });
    const seeds = affectedPackages(substantive, normalized, stable);
    // A trusted generated empty changeset lets status parse explicit intent even on
    // metadata-only retries; no status git-diff heuristic is used.
    write(".changeset/automatic-patch.md", "---\n---\n\nAutomatic release planning.\n");
    run("status", "--since=HEAD", "--output=plan.json");
    const plan = JSON.parse(readFileSync(join(scratch, "plan.json"), "utf8"));
    const explicit = plan.releases.map(({ name }) => name);
    assert.ok(explicit.every((name) => stable.includes(name)), "Only stable packages may be versioned");
    const selected = dependencyClosure([...seeds, ...explicit], normalized, stable);
    if (selected.length) {
      write(".changeset/automatic-patch.md", `---\n${selected.map((name) => `"${name}": patch`).join("\n")}\n---\n\nUpdate published package inputs and exact workspace dependency pins.\n`);
      run("version");
      syncWorkspaceDependencies(scratch);
    }
    const updated = normalized.map(({ path }) => ({
      path, manifest: JSON.parse(readFileSync(join(scratch, path, "package.json"), "utf8")),
    }));
    const nextVersions = new Map(updated.map(({ manifest }) => [manifest.name, manifest.version]));
    for (let index = 0; index < updated.length; index += 1) {
      validateManifestOutput(normalized[index].manifest, updated[index].manifest, nextVersions);
      outputs[`${updated[index].path}/package.json`] = encode(updated[index].manifest);
      const path = `${updated[index].path}/CHANGELOG.md`;
      if (existsSync(join(scratch, path))) outputs[path] = readFileSync(join(scratch, path), "utf8");
    }
    const lock = parse(head, "package-lock.json");
    const updatedLock = updateLock(lock, updated, sourceRoot);
    validateLockOutput(lock, updatedLock, updated, nextVersions);
    outputs["package-lock.json"] = encode(updatedLock);
    for (const path of Object.keys(changesets)) {
      if (blob(head, path) !== null) outputs[path] = null;
    }
    outputs[journalPath] = selected.length
      ? encode({ pullRequest, base, changesets }) : blob(base, journalPath);
    return {
      base, head, pullRequest,
      outputs: Object.fromEntries(Object.entries(outputs).filter(([path, content]) => {
        const old = blob(head, path);
        return old === null ? content !== null : content === null || old !== content.trimEnd();
      })),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function stripLockMetadata(lock, workspaces) {
  const copy = structuredClone(lock);
  const versions = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest.version]));
  for (const { path, manifest } of workspaces) {
    if (copy.packages?.[path]) {
      copy.packages[path] = normalizeManifest({ ...copy.packages[path], name: manifest.name }, versions);
    }
  }
  return copy;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Only run in GitHub Actions.");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = prepareImplementationRelease({
    root, base: process.env.BASE_SHA, head: process.env.HEAD_SHA, pullRequest: Number(process.env.PR_NUMBER),
  });
  writeFileSync(join(root, "release-metadata.json"), encode(result));
}
