import assert from "node:assert/strict";

const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

export function newerStableVersion(before, after) {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  assert.match(before, pattern);
  assert.match(after, pattern);
  const old = before.split(".").map(Number);
  const next = after.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== old[index]) return next[index] > old[index];
  }
  return false;
}

function stripVersionMetadata(manifest, versions) {
  const copy = structuredClone(manifest);
  delete copy.version;
  for (const field of fields) {
    for (const name of Object.keys(copy[field] ?? {})) {
      if (versions.has(name)) copy[field][name] = "<workspace-version>";
    }
  }
  return copy;
}

export function validateManifestOutput(before, after, versions) {
  assert.deepEqual(stripVersionMetadata(after, versions), stripVersionMetadata(before, versions),
    "Versioning must not change manifest structure or external dependencies");
  for (const field of fields) {
    for (const [name, version] of Object.entries(after[field] ?? {})) {
      if (versions.has(name)) assert.equal(version, versions.get(name), `${name} must be pinned exactly`);
    }
  }
  assert.match(after.version, /^\d+\.\d+\.\d+$/, "Only stable versions can be automated");
}

export function validateLockOutput(before, after, workspaces, versions) {
  const normalize = (lock) => {
    const copy = structuredClone(lock);
    for (const { path } of workspaces) {
      if (copy.packages?.[path]) {
        copy.packages[path] = stripVersionMetadata(copy.packages[path], versions);
      }
    }
    return copy;
  };
  assert.deepEqual(normalize(after), normalize(before), "Lockfile changes must contain workspace version metadata only");
  for (const { path, manifest } of workspaces) {
    const entry = after.packages[path];
    assert.equal(entry?.version, manifest.version, `${path} lock version must match`);
    for (const field of fields) {
      for (const [name, version] of Object.entries(entry[field] ?? {})) {
        if (versions.has(name)) assert.equal(version, versions.get(name));
      }
    }
  }
}

export function allowedVersionOutput(path, status, workspaces, stable, existingChangesets) {
  if (path === "package-lock.json") return status === "M";
  if (existingChangesets.includes(path)) return status === "D";
  return workspaces.some(({ path: workspace, manifest }) =>
    (path === `${workspace}/package.json` && status === "M")
    || (stable.includes(manifest.name) && path === `${workspace}/CHANGELOG.md` && ["A", "M"].includes(status)));
}
