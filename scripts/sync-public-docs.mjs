import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDocsDir = path.join(repoRoot, "docs", "public");
const licenseFile = path.join(repoRoot, "LICENSE");
const targets = process.argv.slice(2);

if (!existsSync(sourceDocsDir)) {
  throw new Error(`Public docs directory not found: ${sourceDocsDir}`);
}

if (targets.length === 0) {
  throw new Error("Provide at least one package path to sync docs into.");
}

for (const target of targets) {
  const packageRoot = path.resolve(repoRoot, target);
  const packageJsonPath = path.join(packageRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error(`Package manifest not found: ${packageJsonPath}`);
  }

  const docsDir = path.join(packageRoot, "docs");
  rmSync(docsDir, { recursive: true, force: true });
  mkdirSync(docsDir, { recursive: true });

  for (const entry of readdirSync(sourceDocsDir)) {
    cpSync(path.join(sourceDocsDir, entry), path.join(docsDir, entry), { recursive: true });
  }

  if (existsSync(licenseFile)) {
    cpSync(licenseFile, path.join(packageRoot, "LICENSE"));
  }
}
