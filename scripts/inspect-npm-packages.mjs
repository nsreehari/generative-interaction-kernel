import { spawnSync } from "node:child_process";

if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Package publication inspection may run only in GitHub Actions.");
}

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["publish", "--workspaces", "--dry-run"],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
