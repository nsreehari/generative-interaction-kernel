import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// These sources are imported from outside the npm workspace directories.
const sharedInputs = [
  ["kernel/", ["gik-kernel"]],
  ["blueprint/", ["gik-blueprint"]],
  ["face/", ["gik-controlface", "gik-agentface"]],
  ["adapters/react/", ["gik-react"]],
  ["transports/http-sse/", ["gik-transport-http-sse"]],
  ["providers/", ["gik-react"]],
  ["schemas/", ["gik-kernel", "gik-controlface", "gik-agentface", "gik-react"]],
  ["packages/evaluators/schemas/", ["gik-kernel"]],
];
const globalInputs = new Set([
  "package.json", "package-lock.json", "turbo.json", "LICENSE",
  "scripts/sync-package-license.mjs",
]);

export function lightweightPath(path) {
  return /^(docs\/|\.github\/|scripts\/test\/)/.test(path)
    || /^\.changeset\/[^/]+\.md$/.test(path)
    || /^\.changeset\/implementation-release\.json$/.test(path)
    || /^scripts\/(change-policy|prepare-implementation-release|write-implementation-release|create-merged-release|version-output-policy|validate-npm-release|validate-release-channel|verify-package-artifacts|verify-published-packages|inspect-npm-packages|sync-workspace-dependencies|workflow-validation|release-artifacts|announce-release)\.mjs$/.test(path)
    || /(^|\/)(AGENTS\.md|README\.md|CHANGELOG\.md)$/.test(path)
    || /^[^/]+\.md$/.test(path);
}

export function fullValidation(paths) {
  // Unknown paths always take the full gate; release/workflow policy still has tests.
  return paths.some((path) => !lightweightPath(path));
}

export function affectedPackages(paths, workspaces, stable) {
  const affected = new Set();
  for (const path of paths) {
    if (path === "kernel/tsconfig.json") {
      ["gik-kernel", "gik-evaluators", "gik-durable-runtime"].forEach((name) => affected.add(name));
      continue;
    }
    if (globalInputs.has(path)) {
      stable.forEach((name) => affected.add(name));
      continue;
    }
    if (/(^|\/)(test|tests|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) continue;
    let known = false;
    for (const [prefix, owners] of sharedInputs) {
      if (path.startsWith(prefix) && !path.endsWith(".md")) {
        known = true;
        owners.forEach((name) => affected.add(name));
      }
    }
    for (const { path: workspace, manifest } of workspaces) {
      if (!path.startsWith(`${workspace}/`)) continue;
      known = true;
      if (!stable.includes(manifest.name)) continue;
      const relative = path.slice(workspace.length + 1);
      if (relative === "CHANGELOG.md") continue;
      affected.add(manifest.name);
    }
    if (!known && !lightweightPath(path)
      && !/^(conformance\/|theme\/|transports\/mcp-http\/)/.test(path)
      && ![".gitignore", ".changeset/config.json", "vitest.config.mjs",
        "config/npm-release.json", ".changeset/implementation-release.json",
        "scripts/pack-durable-runtime.mjs"].includes(path)) {
      throw new Error(`Unknown published-package input ownership: ${path}; review ownership before automatic release.`);
    }
  }
  return [...affected].filter((name) => stable.includes(name)).sort();
}

export function dependencyClosure(seeds, workspaces, stable) {
  const selected = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { manifest } of workspaces) {
      if (!stable.includes(manifest.name) || selected.has(manifest.name)) continue;
      const dependencies = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
        .flatMap((field) => Object.keys(manifest[field] ?? {}));
      if (dependencies.some((name) => selected.has(name))) {
        selected.add(manifest.name);
        changed = true;
      }
    }
  }
  return [...selected].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) throw new Error("Expected base and head commits.");
  const paths = execFileSync("git", ["diff", "--name-only", "-z", base, head], { encoding: "utf8" })
    .split("\0").filter(Boolean);
  appendFileSync(process.env.GITHUB_OUTPUT, `full=${fullValidation(paths)}\n`);
}
