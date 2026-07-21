import localConfig from "../config/host.local.json";
import productionConfig from "../config/host.production.json";

const FOUNDRY_PROXY_ORIGIN_TOKEN = "${GIK_FOUNDRY_PROXY_ORIGIN}";
const HTTP_PROXY_ORIGIN_TOKEN = "${GIK_HTTP_PROXY_ORIGIN}";

export type HostConfig = {
  foundryProxyOrigin: string;
  httpProxyOrigin: string;
};

export type HostEnvironment = "local" | "production";

type HostEnvironmentInput = {
  MODE: string;
  VITE_GIK_HOST_ENV?: string;
};

export function resolveHostEnvironment(env: HostEnvironmentInput): HostEnvironment {
  const configured = env.VITE_GIK_HOST_ENV?.trim();
  if (configured === "local" || configured === "production") return configured;
  if (configured) throw new Error(`Unsupported VITE_GIK_HOST_ENV '${configured}'`);
  if (env.MODE === "gik-local") return "local";
  return "production";
}

export const hostEnvironment = resolveHostEnvironment(import.meta.env);
export const hostConfig: HostConfig = hostEnvironment === "production"
  ? productionConfig
  : localConfig;

export function applyHostConfig<T>(value: T, config: HostConfig = hostConfig): T {
  if (value === FOUNDRY_PROXY_ORIGIN_TOKEN) {
    return config.foundryProxyOrigin as T;
  }
  if (value === HTTP_PROXY_ORIGIN_TOKEN) {
    return config.httpProxyOrigin as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => applyHostConfig(entry, config)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyHostConfig(entry, config)])
    ) as T;
  }
  return value;
}