import { getFoundryAccessKey } from "../foundry-agent/access-storage";

export function getSocFoundryKey(): string {
  return getFoundryAccessKey();
}