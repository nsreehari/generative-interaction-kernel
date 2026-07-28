import type { DurableProvider } from "../../../contracts";
import type { IndexedDbLibraryOptions } from "../library/index";

export type IndexedDbStorageOptions = IndexedDbLibraryOptions;
export type IndexedDbProviderOptions = IndexedDbStorageOptions;
export type IndexedDbDirectProviderFactory = (
  options?: IndexedDbStorageOptions,
) => DurableProvider;
