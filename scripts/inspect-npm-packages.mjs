import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function inspectNpmPackages(root, { environment = process.env, run = spawnSync } = {}) {
  if (environment.GITHUB_ACTIONS !== "true") {
    throw new Error("Package publication inspection may run only in GitHub Actions.");
  }
  if (!environment.npm_execpath) throw new Error("Run package inspection through npm.");
  const { stable } = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
  const result = run(
    process.execPath,
    [environment.npm_execpath, "pack", "--dry-run", ...stable.map((name) => `--workspace=${name}`)],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = inspectNpmPackages(fileURLToPath(new URL("..", import.meta.url)));
}
