import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ignoredDirectories = new Set(["node_modules", ".git", ".turbo"]);

const entryFields = ["main", "module", "types", "typings", "browser"];

function collectExportTargets(node, targets) {
  if (typeof node === "string") {
    targets.add(node);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const value of Object.values(node)) collectExportTargets(value, targets);
}

export function declaredEntryPoints(manifest) {
  const targets = new Set();
  for (const field of entryFields) {
    if (typeof manifest[field] === "string") targets.add(manifest[field]);
  }
  if (typeof manifest.bin === "string") targets.add(manifest.bin);
  else if (manifest.bin && typeof manifest.bin === "object") {
    for (const value of Object.values(manifest.bin)) {
      if (typeof value === "string") targets.add(value);
    }
  }
  collectExportTargets(manifest.exports, targets);
  return [...targets]
    .filter((target) => !target.startsWith("../"))
    .map((target) => target.replace(/^\.\//, ""))
    .filter((target) => target.length > 0);
}

function wildcardPattern(target) {
  const source = target
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(.*)");
  return new RegExp(`^${source}$`);
}

// Subpath patterns such as './schemas/*' export whatever the workspace holds, so
// they are resolved against the workspace tree rather than the packed tarball.
// Resolving them against the tarball would let an omitted file silently pass.
export function resolveEntryPoints(manifest, workspaceFileList) {
  const targets = new Set();
  const errors = [];

  for (const target of declaredEntryPoints(manifest)) {
    if (!target.includes("*")) {
      targets.add(target);
      continue;
    }
    const pattern = wildcardPattern(target);
    const matches = workspaceFileList.filter((file) => pattern.test(file));
    if (matches.length === 0) {
      errors.push(`export pattern '${target}' matches no workspace file`);
      continue;
    }
    for (const match of matches) targets.add(match);
  }

  return { targets: [...targets], errors };
}

export function workspaceFiles(workspacePath, root) {
  const base = join(root, workspacePath);
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        walk(join(directory, entry.name));
      } else if (entry.isFile()) {
        files.push(relative(base, join(directory, entry.name)).split(sep).join("/"));
      }
    }
  };
  walk(base);
  return files;
}

export function packedFiles(workspacePath, root) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--silent"],
    { cwd: join(root, workspacePath), encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm pack failed for ${workspacePath}:\n${result.stderr}`);
  }
  const [packed] = JSON.parse(result.stdout);
  return (packed?.files ?? []).map((file) => file.path);
}

export function verifyPackageArtifacts(
  root,
  listPackedFiles = packedFiles,
  listWorkspaceFiles = workspaceFiles,
) {
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const release = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
  const stable = new Set(release.stable);
  const errors = [];
  const inspected = new Set();
  const verified = [];

  for (const workspacePath of workspace.workspaces) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, workspacePath, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!stable.has(manifest.name)) continue;
    inspected.add(manifest.name);

    const { targets, errors: resolutionErrors } = resolveEntryPoints(
      manifest,
      listWorkspaceFiles(workspacePath, root),
    );
    for (const error of resolutionErrors) errors.push(`${manifest.name} ${error}`);
    if (targets.length === 0) {
      errors.push(`${manifest.name} declares no entry points`);
      continue;
    }
    const files = new Set(listPackedFiles(workspacePath, root));
    for (const entry of targets) {
      if (!files.has(entry)) {
        errors.push(`${manifest.name} package would omit declared entry point '${entry}'`);
      }
    }
    verified.push({ name: manifest.name, entries: targets.length });
  }

  for (const name of stable) {
    if (!inspected.has(name)) errors.push(`${name} has no workspace to verify`);
  }
  return { errors, verified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { errors, verified } = verifyPackageArtifacts(root);
  if (errors.length) {
    throw new Error(`Publishable packages are missing build output:\n- ${errors.join("\n- ")}`);
  }
  console.log(
    `Verified packed contents of ${verified.length} stable packages ` +
      `(${verified.reduce((total, entry) => total + entry.entries, 0)} declared entry points).`,
  );
}
