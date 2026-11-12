import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveEntryPoints, workspaceFiles } from "./verify-package-artifacts.mjs";
import { digest, validationInputs, workspacePaths } from "./workflow-validation.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const publicationDependencies = (manifest, workspaces) => Object.fromEntries(
  ["dependencies", "optionalDependencies", "peerDependencies"]
    .flatMap((field) => Object.entries(manifest[field] ?? {}))
    .filter(([name]) => workspaces.some(({ manifest: source }) => source.name === name)),
);

export function stableWorkspaces(root) {
  const { stable } = json(join(root, "config/npm-release.json"));
  const entries = workspacePaths(root).map((path) => ({ path, manifest: json(join(root, path, "package.json")) }))
    .filter(({ manifest }) => stable.includes(manifest.name));
  assert.equal(entries.length, stable.length, "Every stable package must have a workspace");
  assert.equal(new Set(entries.map(({ manifest }) => manifest.name)).size, entries.length);
  for (const { manifest } of entries) {
    assert.match(manifest.name, /^gik-[a-z0-9-]+$/);
    assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    assert.ok(!manifest.private, "Private packages cannot be published");
  }
  return entries;
}

export function publicationOrder(entries) {
  const pending = new Map(entries.map((entry) => [entry.name, entry]));
  const sorted = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((entry) => !Object.keys(entry.dependencies).some((name) => pending.has(name)));
    assert.ok(ready.length, "Cyclic stable publication dependencies");
    for (const entry of ready) {
      pending.delete(entry.name);
      sorted.push(entry);
    }
  }
  return sorted;
}

function npm(args, root) {
  assert.ok(process.env.npm_execpath, "Run release tooling through npm");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function checkedNpm(args, root) {
  const result = npm(args, root);
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

export async function registryPackage(name, version, _root, fetcher = fetch) {
  assert.match(name, /^gik-[a-z0-9-]+$/);
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const response = await fetcher(`https://registry.npmjs.org/${name}/${version}`, {
    redirect: "error", signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  assert.ok(response.ok, `Cannot determine publication state of ${name}@${version}: HTTP ${response.status}`);
  const manifest = await response.json();
  assert.equal(manifest.name, name);
  assert.equal(manifest.version, version);
  assert.ok(typeof manifest.dist?.integrity === "string", "Registry integrity is required");
  return manifest;
}

export function inspectTarball(root, workspace, archive, execute = spawnSync) {
  const tar = (...args) => {
    const result = execute("tar", args, { encoding: "utf8" });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `Cannot inspect archive: ${result.stderr}`);
    return result.stdout;
  };
  const entries = tar("-tzf", archive).trim().split(/\r?\n/);
  assert.ok(entries.every((entry) => entry.startsWith("package/") && !entry.includes("\\")
    && !entry.split("/").includes("..")), "Unsafe package archive path");
  const packed = JSON.parse(tar("-xOf", archive, "package/package.json"));
  assert.deepEqual(packed, workspace.manifest, "Packed manifest differs from reviewed source");
  const { targets, errors } = resolveEntryPoints(workspace.manifest, workspaceFiles(workspace.path, root));
  assert.deepEqual(errors, []);
  assert.ok(targets.length, "Package has no declared entry points");
  for (const target of targets) assert.ok(entries.includes(`package/${target}`), `Archive omits ${workspace.manifest.name} entry point ${target}`);
  return packed;
}

export async function packRelease(root, destination, { execute = checkedNpm, registry = registryPackage, inspect = inspectTarball } = {}) {
  const workspaces = stableWorkspaces(root);
  mkdirSync(destination, { recursive: true });
  assert.deepEqual(readdirSync(destination), [], "Release artifact directory must be empty");
  const packed = JSON.parse(execute(["pack", "--json", "--pack-destination", destination,
    ...workspaces.map(({ manifest }) => `--workspace=${manifest.name}`)], root));
  assert.equal(packed.length, workspaces.length);
  const packages = await Promise.all(workspaces.map(async (workspace) => {
    const { name, version } = workspace.manifest;
    const file = `${name}-${version}.tgz`;
    assert.ok(packed.some((entry) => entry.name === name && entry.version === version && entry.filename === file), `Missing packed package: ${name}`);
    inspect(root, workspace, join(destination, file));
    const bytes = readFileSync(join(destination, file));
    return {
      name, version, file, sha256: digest(bytes), integrity: integrity(bytes),
      dependencies: publicationDependencies(workspace.manifest, workspaces),
      publish: await registry(name, version, root) === null,
    };
  }));
  const manifest = { format: "gik-release-artifacts/1", inputs: validationInputs(root), packages };
  writeFileSync(join(destination, "release-artifacts.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyRelease(root, directory, expectedDigest, { inspect = inspectTarball } = {}) {
  assert.match(expectedDigest ?? "", /^[a-f0-9]{64}$/, "Expected artifact manifest checksum is required");
  const bytes = readFileSync(join(directory, "release-artifacts.json"));
  assert.equal(digest(bytes), expectedDigest, "Release artifact manifest checksum mismatch");
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.format, "gik-release-artifacts/1");
  // The publisher intentionally does not install dependencies or rebuild.
  // Compare reviewed source and toolchain while retaining the producer's
  // installed dependency fingerprint as evidence.
  const workspaces = stableWorkspaces(root);
  const git = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" });
  assert.equal(git.status, 0);
  assert.equal(manifest.inputs.tree, git.stdout.trim());
  assert.equal(manifest.inputs.lock, digest(readFileSync(join(root, "package-lock.json"))));
  assert.equal(manifest.inputs.node, process.version);
  assert.equal(manifest.inputs.npm, /^npm\/([^\s]+)/.exec(process.env.npm_config_user_agent ?? "")?.[1]);
  assert.equal(manifest.inputs.platform, process.platform);
  assert.equal(manifest.inputs.arch, process.arch);
  assert.equal(manifest.packages.length, workspaces.length);
  const seen = new Set();
  for (const entry of manifest.packages) {
    const workspace = workspaces.find(({ manifest: source }) => source.name === entry.name && source.version === entry.version);
    assert.ok(workspace && !seen.has(entry.name), "Unexpected or duplicate release package");
    seen.add(entry.name);
    assert.equal(entry.file, `${entry.name}-${entry.version}.tgz`);
    assert.equal(typeof entry.publish, "boolean");
    assert.deepEqual(entry.dependencies, publicationDependencies(workspace.manifest, workspaces));
    const archive = readFileSync(join(directory, entry.file));
    assert.equal(digest(archive), entry.sha256, `Release archive checksum mismatch: ${entry.name}`);
    assert.equal(integrity(archive), entry.integrity, `Release archive integrity mismatch: ${entry.name}`);
    inspect(root, workspace, join(directory, entry.file));
  }
  assert.deepEqual(readdirSync(directory).sort(), ["release-artifacts.json", ...manifest.packages.map((entry) => entry.file)].sort());
  publicationOrder(manifest.packages);
  return manifest;
}

export async function publishRelease(root, directory, expectedDigest, channel, { verify = verifyRelease, registry = registryPackage, execute = checkedNpm } = {}) {
  assert.ok(["latest", "next"].includes(channel), "Unknown release channel");
  const manifest = verify(root, directory, expectedDigest);
  for (const entry of publicationOrder(manifest.packages)) {
    const existing = await registry(entry.name, entry.version, root);
    if (!entry.publish) {
      assert.ok(existing, `Previously published version disappeared: ${entry.name}@${entry.version}`);
      console.log(`Already published before this release: ${entry.name}@${entry.version}`);
    } else if (existing) {
      assert.equal(existing.dist.integrity, entry.integrity, `Existing publication differs from release artifact: ${entry.name}`);
      console.log(`Verified completed publication: ${entry.name}@${entry.version}`);
    } else {
      const output = execute(["publish", join(directory, entry.file), "--tag", channel, "--access", "public", "--provenance", "--ignore-scripts"], root);
      process.stdout.write(output);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Release registry operations require GitHub Actions");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const [command] = process.argv.slice(2);
  const directory = resolve(root, ".artifacts/npm-release");
  if (command === "pack") {
    await packRelease(root, directory);
    const checksum = digest(readFileSync(join(directory, "release-artifacts.json")));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `manifest_sha256=${checksum}\n`);
  } else if (command === "publish") {
    await publishRelease(root, directory, process.env.RELEASE_MANIFEST_SHA256, process.env.RELEASE_CHANNEL);
  } else {
    throw new Error("Expected pack or publish command");
  }
}
