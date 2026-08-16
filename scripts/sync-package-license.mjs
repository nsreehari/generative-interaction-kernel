import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const licenseFile = path.join(repoRoot, "LICENSE");
const targets = process.argv.slice(2);

if (targets.length === 0) {
  throw new Error("Provide at least one package path to sync docs into.");
}

for (const target of targets) {
  const packageRoot = path.resolve(repoRoot, target);
  const packageJsonPath = path.join(packageRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error(`Package manifest not found: ${packageJsonPath}`);
  }

  if (existsSync(licenseFile)) {
    cpSync(licenseFile, path.join(packageRoot, "LICENSE"));
  }
}
