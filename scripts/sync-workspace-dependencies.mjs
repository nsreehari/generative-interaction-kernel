import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifests = new Map();

for (const workspacePath of rootManifest.workspaces) {
  const path = join(root, workspacePath, "package.json");
  if (!existsSync(path)) continue;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifests.set(manifest.name, { manifest, path });
}

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
let updates = 0;

for (const { manifest, path } of manifests.values()) {
  let changed = false;
  for (const field of dependencyFields) {
    for (const [name, declaredVersion] of Object.entries(manifest[field] ?? {})) {
      const workspaceVersion = manifests.get(name)?.manifest.version;
      if (!workspaceVersion || declaredVersion === workspaceVersion) continue;
      manifest[field][name] = workspaceVersion;
      changed = true;
      updates += 1;
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

console.log(`Synchronized ${updates} exact workspace dependency versions.`);
