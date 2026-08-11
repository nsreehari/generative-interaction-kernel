import { parseRef } from "../../../refs";
import { createStorageRef, type StorageApi, type StorageApiRequest } from "../../api";
import {
	createIndexedDbRecordLibrary,
	type IndexedDbLibraryOptions,
} from "../library";

export { createIndexedDbProvider, createIndexedDbStorage } from "../runtime";

export interface IndexedDbStorageApi extends StorageApi {
	close(): Promise<void>;
}

export type IndexedDbStorageRequest = StorageApiRequest;

const kvRecordKind = "storage-kv";

export function createIndexedDbStorageRef(namespace: string): string {
	return createStorageRef("indexed-db", namespace);
}

export function createIndexedDbStorageApi(
	options: IndexedDbLibraryOptions = {},
): IndexedDbStorageApi {
	const library = createIndexedDbRecordLibrary(options);

	function namespaceForRef(ref: string): string {
		const parsed = parseRef(ref);
		if (parsed.kind !== "indexed-db") {
			throw new Error(`Unsupported storage ref kind: ${parsed.kind}`);
		}
		if (!parsed.value.trim()) throw new Error("Storage ref value must not be empty.");
		return parsed.value;
	}

	return {
		async dispatch(request) {
			const namespace = namespaceForRef(request.ref);
			const args = request.args ?? [];
			switch (request.operation) {
				case "read":
					return library.transaction("readonly", async (store) => {
						const key = String(args[0]);
						const record = await library.request(
							store.get(library.id(kvRecordKind, namespace, key)),
						);
						return (record as { value?: unknown } | undefined)?.value ?? null;
					});
				case "write":
					return library.transaction("readwrite", async (store) => {
						const key = String(args[0]);
						await library.request(store.put({
							id: library.id(kvRecordKind, namespace, key),
							namespace,
							kind: kvRecordKind,
							key,
							value: args[1],
						}));
					});
				case "delete":
					return library.transaction("readwrite", async (store) => {
						const key = String(args[0]);
						await library.request(
							store.delete(library.id(kvRecordKind, namespace, key)),
						);
					});
				case "listKeys":
					return library.transaction("readonly", async (store) => {
						const prefix = args[0] == null ? "" : String(args[0]);
						const records = await library.records(store, kvRecordKind, namespace);
						return records.map((record) => record.key).filter((key) => key.startsWith(prefix));
					});
			}
		},
		close: () => library.close(),
	};
}
