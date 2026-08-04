import type { DurableProvider } from "../../../contracts";
import type { IndexedDbLibraryOptions } from "../library/index";

export type IndexedDbBroadcastChannel = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
};

export type IndexedDbStorageOptions = IndexedDbLibraryOptions & {
  createBroadcastChannel?: (name: string) => IndexedDbBroadcastChannel | null;
};
export type IndexedDbProviderOptions = IndexedDbStorageOptions;
export type IndexedDbDirectProviderFactory = (
  options?: IndexedDbStorageOptions,
) => DurableProvider;
