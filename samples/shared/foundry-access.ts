export const FOUNDRY_ACCESS_STORAGE_KEY = "gik.foundry-agent.access-key";
export const FOUNDRY_ACCESS_CHANGE_EVENT = "gik:foundry-access-change";

export function getFoundryAccessKey(): string {
  try {
    return globalThis.localStorage?.getItem(FOUNDRY_ACCESS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setFoundryAccessKey(value: string): void {
  const key = value.trim();
  try {
    if (key) globalThis.localStorage?.setItem(FOUNDRY_ACCESS_STORAGE_KEY, key);
    else globalThis.localStorage?.removeItem(FOUNDRY_ACCESS_STORAGE_KEY);
  } catch {
    // Storage is an optional host facility.
  }
  globalThis.dispatchEvent?.(new CustomEvent(FOUNDRY_ACCESS_CHANGE_EVENT, { detail: { available: key.length > 0 } }));
}

export function clearFoundryAccessKey(): void {
  setFoundryAccessKey("");
}