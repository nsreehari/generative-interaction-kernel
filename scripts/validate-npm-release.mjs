import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const release = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
const groups = new Map(
  Object.entries(release).flatMap(([group, names]) => names.map((name) => [name, group])),
);
const manifests = new Map();

for (const workspacePath of workspace.workspaces) {
  const manifestPath = join(root, workspacePath, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifests.set(manifest.name, { manifest, workspacePath });
}

const errors = [];
for (const [name, { manifest, workspacePath }] of manifests) {
  const group = groups.get(name);
  if (!group) {
    errors.push(`${name} is not classified in config/npm-release.json`);
    continue;
  }
  const shouldBePublic = group === "stable";
  if (Boolean(manifest.private) === shouldBePublic) {
    errors.push(
      `${name} must be ${shouldBePublic ? "public" : "private"} for release group '${group}'`,
    );
  }
  if (shouldBePublic) {
    if (!existsSync(join(root, workspacePath, "README.md"))) {
      errors.push(`${name} is missing README.md`);
    }
    if (name === "@gik-ai/kernel") {
      for (const notice of ["THIRD_PARTY_NOTICES.md", "jsonata.LICENSE"]) {
        if (!existsSync(join(root, workspacePath, notice))) {
          errors.push(`${name} is missing ${notice}`);
        }
      }
    }
    if (manifest.publishConfig?.access !== "public") {
      errors.push(`${name} must set publishConfig.access to 'public'`);
    }
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (!dependency.startsWith("@gik-ai/")) continue;
      if (groups.get(dependency) !== "stable") {
        errors.push(`${name} depends on non-stable package ${dependency}`);
      }
      const dependencyVersion = manifests.get(dependency)?.manifest.version;
      if (dependencyVersion !== version) {
        errors.push(`${name} pins ${dependency}@${version}, expected ${dependencyVersion}`);
      }
    }
  }
}

for (const [name, group] of groups) {
  if (!manifests.has(name)) errors.push(`${name} in release group '${group}' has no workspace`);
}

if (errors.length) {
  throw new Error(`Invalid npm release configuration:\n- ${errors.join("\n- ")}`);
}

console.log(
  `Validated ${release.stable.length} stable packages; ` +
    `${release.experimental.length} experimental and ${release.internal.length} internal packages are private.`,
);
