import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const channel = process.argv[2];
if (!["latest", "next"].includes(channel)) {
  throw new Error("Release channel must be 'latest' or 'next'.");
}

const root = fileURLToPath(new URL("..", import.meta.url));
const release = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifests = new Map();

for (const workspacePath of workspace.workspaces) {
  const path = join(root, workspacePath, "package.json");
  if (!existsSync(path)) continue;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifests.set(manifest.name, manifest);
}

const prereleaseStatePath = join(root, ".changeset", "pre.json");
const prereleaseState = existsSync(prereleaseStatePath)
  ? JSON.parse(readFileSync(prereleaseStatePath, "utf8"))
  : undefined;
const nextVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-next\.(0|[1-9]\d*)$/;
const errors = [];

if (channel === "next") {
  if (prereleaseState?.mode !== "pre" || prereleaseState.tag !== "next") {
    errors.push("Changesets must be in 'next' prerelease mode.");
  }
} else if (prereleaseState) {
  errors.push("Stable publication requires Changesets prerelease mode to be exited.");
}

for (const name of release.stable) {
  const version = manifests.get(name)?.version;
  if (!version) {
    errors.push(`${name} has no workspace version.`);
  } else if (channel === "next" && !nextVersionPattern.test(version)) {
    errors.push(`${name}@${version} is not a next prerelease.`);
  } else if (channel === "latest" && version.includes("-")) {
    errors.push(`${name}@${version} is not a stable version.`);
  }
}

if (errors.length) {
  throw new Error(`Invalid ${channel} release:\n- ${errors.join("\n- ")}`);
}

console.log(`Validated ${release.stable.length} packages for the '${channel}' channel.`);
