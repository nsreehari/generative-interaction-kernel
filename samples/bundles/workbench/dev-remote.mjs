import { spawn } from "node:child_process";

const env = {
  ...process.env,
  VITE_GUP_BASE_URL: process.env.VITE_GUP_BASE_URL || "http://127.0.0.1:8787",
};

const child = spawn("npm run dev:workbench -- --host 127.0.0.1", [], {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});