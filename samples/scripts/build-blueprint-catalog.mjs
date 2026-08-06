import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const samplesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(samplesDirectory, "blueprints/registry.json");
const outputPath = resolve(samplesDirectory, "apps/host/public/bootstrap/sample-blueprints.bundle.json");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const entries = {};
const blueprintDirectory = resolve(samplesDirectory, "blueprints");
const artifactIds = (await readdir(blueprintDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
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
}

const catalog = {
  format: "gik-blueprint-catalog/1",
  bundleId: "gik-samples",
  defaultBlueprint: registry.default,
  blueprints: registry.blueprints,
  nativeFrom: registry.nativeFrom ?? {},
  projectionFrom: registry.projectionFrom ?? {},
  entries,
};
const digest = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
const bundle = { ...catalog, bundleVersion: digest.slice(0, 16), digest: `sha256:${digest}` };
const serialized = `${JSON.stringify(bundle, null, 2)}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized);
console.log(`Wrote ${Object.keys(entries).length} Blueprints to ${outputPath} (${bundle.bundleVersion}).`);