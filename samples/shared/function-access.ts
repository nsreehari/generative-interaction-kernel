import { hostConfig } from "./host-config";

export const FUNCTION_ACCESS = {
  foundry: {
    label: "Foundry",
    baseUrl: hostConfig.foundryProxyOrigin,
    storageKey: "gik.foundry-agent.access-key",
    changeEvent: "gik:foundry-access-change",
  },
  "http-proxy": {
    label: "HTTP proxy",
    baseUrl: hostConfig.httpProxyOrigin,
    storageKey: "gik.http-proxy.access-key",
    changeEvent: "gik:http-proxy-access-change",
  },
} as const;

export type FunctionAccessScope = keyof typeof FUNCTION_ACCESS;

export function getFunctionAccessKey(scope: FunctionAccessScope): string {
  try {
    return globalThis.localStorage?.getItem(FUNCTION_ACCESS[scope].storageKey) ?? "";
  } catch {
    return "";
  }
}

export function setFunctionAccessKey(scope: FunctionAccessScope, value: string): void {
  const key = value.trim();
  const config = FUNCTION_ACCESS[scope];
  try {
    if (key) globalThis.localStorage?.setItem(config.storageKey, key);
    else globalThis.localStorage?.removeItem(config.storageKey);
  } catch {
    // Storage is an optional host facility.
  }
  globalThis.dispatchEvent?.(new CustomEvent(config.changeEvent, { detail: { available: key.length > 0 } }));
}

export function clearFunctionAccessKey(scope: FunctionAccessScope): void {
  setFunctionAccessKey(scope, "");
}