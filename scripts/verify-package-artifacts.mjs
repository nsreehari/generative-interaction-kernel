import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    .filter((target) => !target.startsWith("../") && !target.includes("*"))
    .map((target) => target.replace(/^\.\//, ""))
    .filter((target) => target.length > 0);
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

export function verifyPackageArtifacts(root, listPackedFiles = packedFiles) {
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const release = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
  const stable = new Set(release.stable);
  const errors = [];
  const verified = [];

  for (const workspacePath of workspace.workspaces) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, workspacePath, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!stable.has(manifest.name)) continue;

    const entries = declaredEntryPoints(manifest);
    if (entries.length === 0) {
      errors.push(`${manifest.name} declares no entry points`);
      continue;
    }
    const files = new Set(listPackedFiles(workspacePath, root));
    for (const entry of entries) {
      if (!files.has(entry)) {
        errors.push(`${manifest.name} package would omit declared entry point '${entry}'`);
      }
    }
    verified.push({ name: manifest.name, entries: entries.length });
  }

  if (stable.size !== verified.length && errors.length === 0) {
    errors.push(
      `Expected ${stable.size} stable packages, verified ${verified.length}`,
    );
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
