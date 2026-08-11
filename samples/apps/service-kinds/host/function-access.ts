const CREDENTIAL_CHANGE_EVENT = "gik:credential-access-change";

function normalizedCredentialReference(reference: string): string {
  const normalized = reference.trim();
  if (!normalized || !/^[a-z0-9][a-z0-9._/-]*$/i.test(normalized)) {
    throw new Error(`Invalid credential reference '${reference}'`);
  }
  return normalized;
}

export function browserCredentialStorageKey(reference: string): string {
  return `gik.${normalizedCredentialReference(reference).replaceAll("/", ".")}`;
}

export function getFunctionAccessKey(reference: string): string {
  try {
    return globalThis.localStorage?.getItem(browserCredentialStorageKey(reference)) ?? "";
  } catch {
    return "";
  }
}

export function setFunctionAccessKey(reference: string, value: string): void {
  const credentialRef = normalizedCredentialReference(reference);
  const key = value.trim();
  try {
    if (key) globalThis.localStorage?.setItem(browserCredentialStorageKey(credentialRef), key);
    else globalThis.localStorage?.removeItem(browserCredentialStorageKey(credentialRef));
  } catch {
    // Storage is an optional host facility.
  }
  globalThis.dispatchEvent?.(new CustomEvent(CREDENTIAL_CHANGE_EVENT, {
    detail: { credentialRef, available: key.length > 0 },
  }));
}

export function clearFunctionAccessKey(reference: string): void {
  setFunctionAccessKey(reference, "");
}

export async function resolveBrowserCredential(reference: string): Promise<string> {
  const credentialRef = normalizedCredentialReference(reference);
  const key = getFunctionAccessKey(credentialRef).trim();
  if (!key) throw new Error(`Credential '${credentialRef}' is required`);
  return key;
}

export function clearBrowserCredential(reference: string): void {
  clearFunctionAccessKey(reference);
}

export function subscribeToBrowserCredential(reference: string, listener: () => void): () => void {
  const credentialRef = normalizedCredentialReference(reference);
  const accessChanged = (event: Event) => {
    if ((event as CustomEvent).detail?.credentialRef === credentialRef) listener();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === browserCredentialStorageKey(credentialRef)) listener();
  };
  globalThis.addEventListener?.(CREDENTIAL_CHANGE_EVENT, accessChanged);
  globalThis.addEventListener?.("storage", storageChanged);
  return () => {
    globalThis.removeEventListener?.(CREDENTIAL_CHANGE_EVENT, accessChanged);
    globalThis.removeEventListener?.("storage", storageChanged);
  };
}