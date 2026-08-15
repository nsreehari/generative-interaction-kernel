import {
  materializeBlueprint,
  parseBlueprintJson,
  parseBlueprintReference,
  type BlueprintArtifact,
  type BlueprintHostRegistry,
  type ExternalContext,
} from "@gik/blueprint";
import { openBlueprint, type BlueprintRuntime } from "@gik/controlface/blueprint";
import { createIndexedDbRecordLibrary } from "@gik/durable-runtime/storage/indexed-db";
import type { DemoRunnerDocument } from "@gik/demo-runner-host";
import {
  applyHostConfig,
  hostConfig,
  type HostConfig,
} from "../config/host-config";

export const sampleBlueprintCatalogUrl = "bootstrap/sample-blueprints.bundle.json";
const artifactKind = "blueprint-seed-artifact";
const demoScenariosKind = "blueprint-seed-demo-scenarios";
const metadataKind = "blueprint-seed-metadata";
const userArtifactKind = "blueprint-user-artifact";
const userNamespace = "gik-user-blueprints";
export const legacyLocalBlueprintStorageKey = "gik.manage-blueprints.blueprints.v1";

export interface BlueprintLaunchProfile {
  id: string;
  blueprint: string;
  requiredCapabilities?: readonly string[];
}

export interface BlueprintCatalogBundle {
  format: "gik-blueprint-catalog/1";
  bundleId: string;
  bundleVersion: string;
  digest: string;
  defaultBlueprint: string;
  blueprints: string[];
  launchProfiles: BlueprintLaunchProfile[];
  nativeFrom: Record<string, string>;
  projectionFrom: Record<string, string>;
  entries: Record<string, BlueprintArtifact>;
  demoScenarios: Record<string, DemoRunnerDocument>;
}

export interface BlueprintCatalogSnapshot {
  readonly bundleId: string;
  readonly bundleVersion: string;
  readonly digest: string;
  readonly defaultBlueprint: string;
  readonly blueprints: readonly string[];
  readonly launchProfiles: readonly BlueprintLaunchProfile[];
  readonly nativeFrom: Readonly<Record<string, string>>;
  readonly projectionFrom: Readonly<Record<string, string>>;
  readonly seedEntries: Readonly<Record<string, BlueprintArtifact>>;
  readonly entries: Readonly<Record<string, BlueprintArtifact>>;
  readonly demoScenarios: Readonly<Record<string, DemoRunnerDocument>>;
}

export interface BlueprintCatalogStore {
  admitSeed(bundle: BlueprintCatalogBundle): Promise<BlueprintCatalogSnapshot>;
  loadSeed(bundleId: string): Promise<BlueprintCatalogSnapshot | undefined>;
  readUserArtifacts(): Promise<{ blueprints: Record<string, BlueprintArtifact>; errors: string[] }>;
  writeUserArtifacts(blueprints: Record<string, BlueprintArtifact>): Promise<void>;
  close(): Promise<void>;
}

export const sampleBlueprints: Record<string, BlueprintArtifact> = {};
let catalog: BlueprintCatalogSnapshot | undefined;

export function installSampleBlueprintCatalog(snapshot: BlueprintCatalogSnapshot): void {
  catalog = snapshot;
  for (const id of Object.keys(sampleBlueprints)) delete sampleBlueprints[id];
  Object.assign(sampleBlueprints, snapshot.entries);
}

export function getSampleBlueprintCatalog(): BlueprintCatalogSnapshot {
  if (!catalog) throw new Error("Sample Blueprint catalog has not been bootstrapped.");
  return catalog;
}

export function resolveSampleLaunchExternalContext(id: string): ExternalContext | undefined {
  if (id === "incident-analysis-new-shell") {
    return { analyzer_blueprint_ref: "blueprint:incident-report-explorer-2@1.0.0" };
  }
  if (id === "portfolio-tracker-new") {
    return { "intelligence-model": "simple", view: "desktop" };
  }
  return undefined;
}

export function hasSampleBlueprint(id: string): boolean {
  return id in sampleBlueprints;
}

export function resolveSampleBlueprintSource(
  id: string,
  config: HostConfig = hostConfig,
): BlueprintArtifact {
  const blueprint = sampleBlueprints[id];
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return applyHostConfig(blueprint, config);
}

export function createSampleCatalogBlueprintRegistry(): BlueprintHostRegistry {
  return {
    resolveArtifact(reference) {
      const blueprint = resolveSampleBlueprintSource(reference.id);
      if (reference.version !== undefined && blueprint.payload.version !== reference.version) {
        throw new Error(`Blueprint '${reference.id}' version '${reference.version}' is unavailable`);
      }
      return blueprint;
    },
    resolve(reference, context) {
      const blueprint = this.resolveArtifact(reference, context);
      return {
        reference: { ...reference, version: reference.version ?? blueprint.payload.version },
        blueprint,
      };
    },
  };
}

export function openSampleBlueprint(
  id: string,
  externalContext?: ExternalContext,
  config: HostConfig = hostConfig,
): BlueprintRuntime {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource(id, config),
    externalContext,
    resolveBlueprint(reference) {
      const parsed = parseBlueprintReference(reference);
      const child = resolveSampleBlueprintSource(parsed.id, config);
      if (parsed.version !== undefined && child.payload.version !== parsed.version) {
        throw new Error(`Blueprint '${parsed.id}' version '${parsed.version}' is unavailable`);
      }
      return child;
    },
  });
  return openBlueprint(materialized.payload.terminalBlueprint);
}

export function installUserBlueprints(blueprints: Record<string, BlueprintArtifact>): void {
  installSampleBlueprintCatalog(withUserBlueprints(getSampleBlueprintCatalog(), blueprints));
}

export function parseBlueprintCatalogBundle(value: unknown): BlueprintCatalogBundle {
  if (!isRecord(value) || value.format !== "gik-blueprint-catalog/1") {
    throw new Error("Unsupported Blueprint catalog bundle format.");
  }
  if (typeof value.bundleId !== "string" || typeof value.bundleVersion !== "string" || typeof value.digest !== "string") {
    throw new Error("Blueprint catalog bundle identity is invalid.");
  }
  if (typeof value.defaultBlueprint !== "string" || !Array.isArray(value.blueprints) || !isRecord(value.entries)) {
    throw new Error("Blueprint catalog bundle metadata is invalid.");
  }
  const ids = value.blueprints.map(String);
  if (new Set(ids).size !== ids.length || !ids.includes(value.defaultBlueprint)) {
    throw new Error("Blueprint catalog IDs must be unique and include the default Blueprint.");
  }
  const entries: Record<string, BlueprintArtifact> = {};
  for (const [id, rawArtifact] of Object.entries(value.entries)) {
    const artifact = parseBlueprintJson(JSON.stringify(rawArtifact));
    if (artifact.payload.id !== id) throw new Error(`Blueprint catalog key '${id}' does not match '${artifact.payload.id}'.`);
    entries[id] = artifact;
  }
  for (const id of ids) {
    if (!entries[id]) throw new Error(`Listed Blueprint catalog entry '${id}' is missing.`);
  }
  const launchProfiles = blueprintLaunchProfiles(value.launchProfiles, entries);
  if (!launchProfiles.some((profile) => profile.blueprint === value.defaultBlueprint)) {
    throw new Error("The default Blueprint must have a launch profile.");
  }
  const demoScenarios = demoScenarioRecord(value.demoScenarios, entries);
  return {
    format: "gik-blueprint-catalog/1",
    bundleId: value.bundleId,
    bundleVersion: value.bundleVersion,
    digest: value.digest,
    defaultBlueprint: value.defaultBlueprint,
    blueprints: ids,
    launchProfiles,
    nativeFrom: stringRecord(value.nativeFrom),
    projectionFrom: stringRecord(value.projectionFrom),
    entries,
    demoScenarios,
  };
}

export function createBlueprintCatalogSnapshot(bundle: BlueprintCatalogBundle): BlueprintCatalogSnapshot {
  return {
    bundleId: bundle.bundleId,
    bundleVersion: bundle.bundleVersion,
    digest: bundle.digest,
    defaultBlueprint: bundle.defaultBlueprint,
    blueprints: Object.freeze([...bundle.blueprints]),
    launchProfiles: Object.freeze(bundle.launchProfiles.map((profile) => Object.freeze({
      ...profile,
      ...(profile.requiredCapabilities === undefined
        ? {}
        : { requiredCapabilities: Object.freeze([...profile.requiredCapabilities]) }),
    }))),
    nativeFrom: Object.freeze({ ...bundle.nativeFrom }),
    projectionFrom: Object.freeze({ ...bundle.projectionFrom }),
    seedEntries: Object.freeze({ ...bundle.entries }),
    entries: Object.freeze({ ...bundle.entries }),
    demoScenarios: Object.freeze({ ...bundle.demoScenarios }),
  };
}

export function withUserBlueprints(
  snapshot: BlueprintCatalogSnapshot,
  userBlueprints: Record<string, BlueprintArtifact>,
): BlueprintCatalogSnapshot {
  return {
    ...snapshot,
    entries: Object.freeze({ ...userBlueprints, ...snapshot.seedEntries }),
  };
}

export async function verifyBlueprintCatalogBundle(bundle: BlueprintCatalogBundle): Promise<void> {
  const catalog = {
    format: bundle.format,
    bundleId: bundle.bundleId,
    defaultBlueprint: bundle.defaultBlueprint,
    blueprints: bundle.blueprints,
    launchProfiles: bundle.launchProfiles,
    nativeFrom: bundle.nativeFrom,
    projectionFrom: bundle.projectionFrom,
    entries: bundle.entries,
    demoScenarios: bundle.demoScenarios,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(catalog));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (bundle.digest !== `sha256:${digest}` || bundle.bundleVersion !== digest.slice(0, 16)) {
    throw new Error("Blueprint catalog bundle digest is invalid.");
  }
}

export function createIndexedDbBlueprintCatalogStore(options: {
  databaseName?: string;
  indexedDB?: IDBFactory;
} = {}): BlueprintCatalogStore {
  const library = createIndexedDbRecordLibrary({
    databaseName: options.databaseName ?? "gik-samples-host",
    indexedDB: options.indexedDB,
  });
  return {
    async admitSeed(bundle) {
      await library.transaction("readwrite", async (store) => {
        const existing = await library.records(store, artifactKind, bundle.bundleId);
        const admittedIds = new Set<string>();
        for (const id of Object.keys(bundle.entries)) {
          const key = `${id}@${bundle.entries[id].payload.version}`;
          const recordId = library.id(artifactKind, bundle.bundleId, key);
          admittedIds.add(recordId);
          await library.request(store.put({
            id: recordId,
            namespace: bundle.bundleId,
            kind: artifactKind,
            key,
            blueprintId: id,
            artifact: bundle.entries[id],
          }));
        }
        for (const record of existing) {
          if (!admittedIds.has(record.id)) await library.request(store.delete(record.id));
        }
        const existingDemoScenarios = await library.records(store, demoScenariosKind, bundle.bundleId);
        const admittedDemoScenarioIds = new Set<string>();
        for (const [id, document] of Object.entries(bundle.demoScenarios)) {
          const recordId = library.id(demoScenariosKind, bundle.bundleId, id);
          admittedDemoScenarioIds.add(recordId);
          await library.request(store.put({
            id: recordId,
            namespace: bundle.bundleId,
            kind: demoScenariosKind,
            key: id,
            blueprintId: id,
            document,
          }));
        }
        for (const record of existingDemoScenarios) {
          if (!admittedDemoScenarioIds.has(record.id)) await library.request(store.delete(record.id));
        }
        await library.request(store.put({
          id: library.id(metadataKind, bundle.bundleId, "active"),
          namespace: bundle.bundleId,
          kind: metadataKind,
          key: "active",
          bundleVersion: bundle.bundleVersion,
          digest: bundle.digest,
          defaultBlueprint: bundle.defaultBlueprint,
          blueprints: bundle.blueprints,
          launchProfiles: bundle.launchProfiles,
          nativeFrom: bundle.nativeFrom,
          projectionFrom: bundle.projectionFrom,
        }));
      });
      const snapshot = await this.loadSeed(bundle.bundleId);
      if (!snapshot) throw new Error(`Admitted Blueprint catalog '${bundle.bundleId}' could not be loaded.`);
      return snapshot;
    },
    async loadSeed(bundleId) {
      return library.transaction("readonly", async (store) => {
        const metadata = await library.request(store.get(library.id(metadataKind, bundleId, "active"))) as Record<string, unknown> | undefined;
        if (!metadata) return undefined;
        const records = await library.records(store, artifactKind, bundleId);
        const entries: Record<string, BlueprintArtifact> = {};
        for (const record of records) {
          const id = String(record.blueprintId);
          entries[id] = parseBlueprintJson(JSON.stringify(record.artifact));
        }
        const demoScenarioRecords = await library.records(store, demoScenariosKind, bundleId);
        const demoScenarios = Object.fromEntries(demoScenarioRecords.map((record) => [
          String(record.blueprintId),
          record.document,
        ])) as Record<string, DemoRunnerDocument>;
        return createBlueprintCatalogSnapshot({
          format: "gik-blueprint-catalog/1",
          bundleId,
          bundleVersion: String(metadata.bundleVersion),
          digest: String(metadata.digest),
          defaultBlueprint: String(metadata.defaultBlueprint),
          blueprints: Array.isArray(metadata.blueprints) ? metadata.blueprints.map(String) : [],
          launchProfiles: blueprintLaunchProfiles(metadata.launchProfiles, entries),
          nativeFrom: stringRecord(metadata.nativeFrom),
          projectionFrom: stringRecord(metadata.projectionFrom),
          entries,
          demoScenarios,
        });
      });
    },
    async readUserArtifacts() {
      return library.transaction("readonly", async (store) => {
        const records = await library.records(store, userArtifactKind, userNamespace);
        const blueprints: Record<string, BlueprintArtifact> = {};
        const errors: string[] = [];
        for (const record of records) {
          try {
            const artifact = parseBlueprintJson(JSON.stringify(record.artifact));
            blueprints[artifact.payload.id] = artifact;
          } catch (error) {
            errors.push(`${record.key}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return { blueprints, errors };
      });
    },
    async writeUserArtifacts(blueprints) {
      const validated = Object.fromEntries(Object.entries(blueprints).map(([id, artifact]) => {
        const parsed = parseBlueprintJson(JSON.stringify(artifact));
        if (parsed.payload.id !== id) throw new Error(`User Blueprint key '${id}' does not match '${parsed.payload.id}'.`);
        return [id, parsed];
      }));
      await library.transaction("readwrite", async (store) => {
        const existing = await library.records(store, userArtifactKind, userNamespace);
        const admittedIds = new Set<string>();
        for (const [id, artifact] of Object.entries(validated)) {
          const recordId = library.id(userArtifactKind, userNamespace, id);
          admittedIds.add(recordId);
          await library.request(store.put({
            id: recordId,
            namespace: userNamespace,
            kind: userArtifactKind,
            key: id,
            artifact,
          }));
        }
        for (const record of existing) {
          if (!admittedIds.has(record.id)) await library.request(store.delete(record.id));
        }
      });
    },
    close: () => library.close(),
  };
}

export async function bootstrapSampleBlueprintCatalog(options: {
  seedUrl?: string;
  databaseName?: string;
  fetch?: typeof globalThis.fetch;
  indexedDB?: IDBFactory;
} = {}): Promise<BlueprintCatalogSnapshot> {
  const fetchSeed = options.fetch ?? globalThis.fetch;
  const response = await fetchSeed(options.seedUrl ?? new URL(sampleBlueprintCatalogUrl, document.baseURI).href);
  if (!response.ok) throw new Error(`Unable to load Blueprint catalog seed (${response.status}).`);
  const bundle = parseBlueprintCatalogBundle(await response.json());
  await verifyBlueprintCatalogBundle(bundle);
  const store = createIndexedDbBlueprintCatalogStore(options);
  try {
    const seed = await store.admitSeed(bundle);
    await migrateLegacyLocalBlueprints(store);
    const users = await store.readUserArtifacts();
    return withUserBlueprints(seed, users.blueprints);
  } finally {
    await store.close();
  }
}

export async function readUserBlueprintArtifacts(options: {
  databaseName?: string;
  indexedDB?: IDBFactory;
} = {}): Promise<{ blueprints: Record<string, BlueprintArtifact>; errors: string[] }> {
  const store = createIndexedDbBlueprintCatalogStore(options);
  try {
    return await store.readUserArtifacts();
  } finally {
    await store.close();
  }
}

export async function writeUserBlueprintArtifacts(
  blueprints: Record<string, BlueprintArtifact>,
  options: { databaseName?: string; indexedDB?: IDBFactory } = {},
): Promise<void> {
  const store = createIndexedDbBlueprintCatalogStore(options);
  try {
    await store.writeUserArtifacts(blueprints);
  } finally {
    await store.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

async function migrateLegacyLocalBlueprints(store: BlueprintCatalogStore): Promise<void> {
  if (typeof globalThis.localStorage === "undefined") return;
  const raw = globalThis.localStorage.getItem(legacyLocalBlueprintStorageKey);
  if (!raw) return;
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("Legacy local Blueprint storage must be an object.");
  const blueprints = Object.fromEntries(Object.entries(parsed).map(([id, artifact]) => [
    id,
    parseBlueprintJson(JSON.stringify(artifact)),
  ]));
  await store.writeUserArtifacts(blueprints);
  globalThis.localStorage.removeItem(legacyLocalBlueprintStorageKey);
}

function demoScenarioRecord(
  value: unknown,
  entries: Record<string, BlueprintArtifact>,
): Record<string, DemoRunnerDocument> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error("Blueprint catalog demo scenarios must be an object.");
  return Object.fromEntries(Object.entries(value).map(([id, document]) => {
    if (!entries[id]) throw new Error(`Demo scenarios reference unknown Blueprint '${id}'.`);
    if (!isRecord(document)
      || !isRecord(document.contextFormSpec)
      || !isRecord(document.namedPresetContexts)
      || !Array.isArray(document.scenarios)) {
      throw new Error(`Demo scenarios for Blueprint '${id}' are invalid.`);
    }
    return [id, structuredClone(document) as unknown as DemoRunnerDocument];
  }));
}

function blueprintLaunchProfiles(
  value: unknown,
  entries: Record<string, BlueprintArtifact>,
): BlueprintLaunchProfile[] {
  if (!Array.isArray(value)) throw new Error("Blueprint catalog launch profiles must be an array.");
  const profiles = value.map((item) => {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || typeof item.blueprint !== "string"
      || (item.requiredCapabilities !== undefined
        && (!Array.isArray(item.requiredCapabilities)
          || item.requiredCapabilities.some((capability) => typeof capability !== "string" || capability.length === 0)))) {
      throw new Error("Blueprint catalog contains an invalid launch profile.");
    }
    if (!entries[item.blueprint]) {
      throw new Error(`Blueprint launch profile '${item.id}' references unknown Blueprint '${item.blueprint}'.`);
    }
    const profile: BlueprintLaunchProfile = {
      id: item.id,
      blueprint: item.blueprint,
      ...(item.requiredCapabilities === undefined
        ? {}
        : { requiredCapabilities: [...new Set(item.requiredCapabilities as string[])] }),
    };
    return profile;
  });
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    throw new Error("Blueprint launch profile IDs must be unique.");
  }
  return profiles;
}