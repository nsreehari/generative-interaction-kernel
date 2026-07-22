import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proxyRoot = resolve(repoRoot, "../azure-function-proxy/apps");
const configPath = resolve(repoRoot, "samples/config/host.local.json");
const npmCli = process.env.npm_execpath;
const dryRun = process.argv.includes("--dry-run");

if (!npmCli && !dryRun) throw new Error("func:local must be started through npm");

const functions = [
  { configKey: "foundryProxyOrigin", app: "foundry-bff" },
  { configKey: "httpProxyOrigin", app: "http-proxy" },
  { configKey: "storesProxyOrigin", app: "stores-proxy" },
];

function localPort(origin, configKey) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.port) {
    throw new Error(`${configKey} must be an http://localhost origin with an explicit port`);
  }
  return url.port;
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const commands = functions.map(({ configKey, app }) => ({
  app,
  port: localPort(config[configKey], configKey),
  cwd: resolve(proxyRoot, app),
}));

if (new Set(commands.map(({ port }) => port)).size !== commands.length) {
  throw new Error("Local Function origins must use distinct ports");
}

for (const { app, port } of commands) {
  console.log(`[func:local] ${app} -> http://localhost:${port}`);
}

if (!dryRun) {
  const children = commands.map(({ cwd, port }) => spawn(
    process.execPath,
    [npmCli, "run", "start", "--", "--port", port],
    {
      cwd,
      stdio: "inherit",
      env: { ...process.env, FUNCTIONS_WORKER_RUNTIME: "node" },
    }
  ));
  let stopping = false;

  const stop = (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.pid || child.exitCode !== null) continue;
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    }
    process.exitCode = exitCode;
  };

  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  for (const child of children) {
    child.on("error", (error) => {
      console.error(`[func:local] Failed to start a Function app: ${error.message}`);
      stop(1);
    });
    child.on("exit", (code, signal) => {
      if (stopping) return;
      if (code !== 0) console.error(`[func:local] Function app exited (${signal ?? code})`);
      stop(code ?? (signal ? 1 : 0));
    });
  }
}