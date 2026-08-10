import {
  SAMPLE_CREDENTIAL_REFERENCES,
  type SampleCredentialReference,
} from "./credential-references";

export const FUNCTION_ACCESS = {
  foundry: {
    credentialRef: SAMPLE_CREDENTIAL_REFERENCES.foundry,
    label: "Foundry",
    storageKey: "gik.foundry-agent.access-key",
    changeEvent: "gik:foundry-access-change",
  },
  "http-proxy": {
    credentialRef: SAMPLE_CREDENTIAL_REFERENCES.httpProxy,
    label: "HTTP proxy",
    storageKey: "gik.http-proxy.access-key",
    changeEvent: "gik:http-proxy-access-change",
  },
} as const;

export type FunctionAccessScope = keyof typeof FUNCTION_ACCESS;

const CREDENTIAL_SCOPES = Object.fromEntries(
  Object.entries(FUNCTION_ACCESS).map(([scope, config]) => [config.credentialRef, scope]),
) as Record<SampleCredentialReference, FunctionAccessScope>;

export function functionAccessScopeForCredential(reference: string): FunctionAccessScope {
  const scope = CREDENTIAL_SCOPES[reference as SampleCredentialReference];
  if (!scope) throw new Error(`Unknown credential reference '${reference}'`);
  return scope;
}

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

export async function resolveBrowserCredential(reference: string): Promise<string> {
  const scope = functionAccessScopeForCredential(reference);
  const key = getFunctionAccessKey(scope).trim();
  if (!key) throw new Error(`${FUNCTION_ACCESS[scope].label} access is required`);
  return key;
}

export function clearBrowserCredential(reference: string): void {
  clearFunctionAccessKey(functionAccessScopeForCredential(reference));
}