import localConfig from "../config/host.local.json";
import productionConfig from "../config/host.production.json";

const FOUNDRY_PROXY_ORIGIN_TOKEN = "${GIK_FOUNDRY_PROXY_ORIGIN}";

export type HostConfig = {
  foundryProxyOrigin: string;
};

export const hostConfig: HostConfig = import.meta.env.PROD
  ? productionConfig
  : localConfig;

export function applyHostConfig<T>(value: T, config: HostConfig = hostConfig): T {
  if (value === FOUNDRY_PROXY_ORIGIN_TOKEN) {
    return config.foundryProxyOrigin as T;
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