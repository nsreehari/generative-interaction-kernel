import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const samplesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(samplesDirectory, "blueprints/registry.json");
const outputPath = resolve(samplesDirectory, "catalog/bootstrap/sample-blueprints.bundle.json");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const entries = {};
const demoScenarios = {};
const bootstrapAssets = {};
const blueprintDirectory = resolve(samplesDirectory, "blueprints");
const artifactIds = (await readdir(blueprintDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "half-baked")
  .map((entry) => entry.name)
  .sort();

for (const id of artifactIds) {
  const artifactPath = resolve(samplesDirectory, `blueprints/${id}/blueprint.json`);
  let artifact;
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (artifact?.type !== "blueprint" || artifact?.payload?.id !== id) {
    throw new Error(`${artifactPath} does not contain Blueprint '${id}'.`);
  }
  entries[id] = artifact;
  try {
    demoScenarios[id] = JSON.parse(await readFile(resolve(samplesDirectory, `blueprints/${id}/demo-scenarios.json`), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const relativePath of [
    `blueprints/${id}/bootstrap-assets.json`,
    `blueprints/${id}/bootstrap-assets/catalog.json`,
  ]) {
    try {
      const document = JSON.parse(await readFile(resolve(samplesDirectory, relativePath), "utf8"));
      if (bootstrapAssets[id]) {
        throw new Error(`Blueprint '${id}' defines more than one bootstrap-assets catalog.`);
      }
      bootstrapAssets[id] = document;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

if (entries["blueprint-studio-crud"]) {
  const descriptors = Object.entries(entries)
    .map(([id, artifact]) => ({
      id,
      label: id,
      version: artifact.payload.version,
      kind: artifact.payload.kind,
      source: "repo",
      readonly: true,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  bootstrapAssets["blueprint-studio-crud"] = {
    format: "gik-blueprint-bootstrap-assets/1",
    records: [
      { key: "index:blueprints", value: descriptors },
      ...descriptors.map((descriptor) => ({
        key: `blueprint:${descriptor.id}`,
        value: {
          ...descriptor,
          artifact: entries[descriptor.id],
          ref: `blueprint:${descriptor.id}@${descriptor.version}`,
          draft: null,
        },
      })),
    ],
  };
}

const catalog = {
  format: "gik-blueprint-catalog/1",
  bundleId: "gik-samples",
  defaultBlueprint: registry.default,
  blueprints: Object.keys(entries),
  launchProfiles: registry.launchProfiles,
  nativeFrom: registry.nativeFrom ?? {},
  projectionFrom: registry.projectionFrom ?? {},
  entries,
  demoScenarios,
  bootstrapAssets,
};
const digest = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
const bundle = { ...catalog, bundleVersion: digest.slice(0, 16), digest: `sha256:${digest}` };
const serialized = `${JSON.stringify(bundle, null, 2)}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized);
console.log(`Wrote ${Object.keys(entries).length} Blueprints to ${outputPath} (${bundle.bundleVersion}).`);