export type IndexedDbRecord = {
  id: string;
  namespace: string;
  kind: string;
  key: string;
  [key: string]: unknown;
};

export type IndexedDbLibraryOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory;
  databaseVersion?: number;
  objectStoreName?: string;
};

export interface IndexedDbRecordLibrary {
  readonly databaseName: string;
  readonly objectStoreName: string;
  id(kind: string, space: string, key: string): string;
  prefix(kind: string, space: string): string;
  range(kind: string, space: string): IDBKeyRange;
  request<T>(request: IDBRequest<T>): Promise<T>;
  transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T>;
  records(
    store: IDBObjectStore,
    kind: string,
    space: string,
  ): Promise<IndexedDbRecord[]>;
  close(): Promise<void>;
}
