import { getFoundryAccessKey } from "../../services/foundry-agent";

export function getSocFoundryKey(): string {
  return getFoundryAccessKey();
}