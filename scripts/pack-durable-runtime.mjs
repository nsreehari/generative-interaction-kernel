import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageDir = path.join(repoRoot, "packages", "durable-runtime");
const artifactDir = path.join(repoRoot, ".artifacts", "durable-runtime");
const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script through npm run pack:durable-runtime.");

function runNpm(args, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return result.stdout?.trim() ?? "";
}

mkdirSync(artifactDir, { recursive: true });
for (const entry of readdirSync(artifactDir)) {
  if (/^gik-durable-runtime-.*\.tgz$/.test(entry)) rmSync(path.join(artifactDir, entry));
}

runNpm(["exec", "--", "turbo", "run", "build", `--filter=${packageJson.name}`]);
const filename = runNpm(
  ["pack", packageDir, "--pack-destination", artifactDir, "--silent"],
  true,
).split(/\r?\n/).at(-1);
if (!filename) throw new Error("npm pack did not report a tarball filename.");

const tarballPath = path.join(artifactDir, filename);
const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
writeFileSync(path.join(artifactDir, "durable-runtime.package.json"), `${JSON.stringify({
  package: packageJson.name,
  version: packageJson.version,
  file: filename,
  sha256,
}, null, 2)}\n`);

console.log(tarballPath);
console.log(`SHA-256: ${sha256}`);
