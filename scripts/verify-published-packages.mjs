// External-consumer gate for issue #36: install the published stable packages
// from the public npm registry into a clean project and prove that the exact
// versions, metadata, declared entry points, dependency closure, TypeScript
// consumption, JavaScript imports, and minimal runtime behaviour all work.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveEntryPoints, workspaceFiles } from "./verify-package-artifacts.mjs";

export const publicRegistry = "https://registry.npmjs.org";

const requiredMetadata = ["name", "version", "license", "repository"];

export function expectedPackages(root) {
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const release = JSON.parse(readFileSync(join(root, "config", "npm-release.json"), "utf8"));
  const stable = new Set(release.stable);
  const packages = [];

  for (const workspacePath of workspace.workspaces) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, workspacePath, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!stable.has(manifest.name)) continue;
    packages.push({
      name: manifest.name,
      version: manifest.version,
      dependencies: Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).filter(([dependency]) =>
          dependency.startsWith("@gik-ai/"),
        ),
      ),
      peerDependencies: { ...manifest.peerDependencies },
    });
  }

  const missing = [...stable].filter((name) => !packages.some((entry) => entry.name === name));
  if (missing.length) {
    throw new Error(`Stable packages have no workspace: ${missing.join(", ")}`);
  }
  return packages;
}

// Wildcard and `./package.json` targets are not consumer import surfaces, so
// the consumer sources exercise only the concrete subpaths a consumer imports.
export function importSubpaths(manifest) {
  const exported = manifest.exports;
  if (typeof exported === "string" || exported === undefined) return [manifest.name];
  return Object.keys(exported)
    .filter((subpath) => !subpath.includes("*") && subpath !== "./package.json")
    .map((subpath) => (subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`));
}

export function verifyInstalledPackage(expected, installed, installedFiles, installedVersions) {
  const errors = [];

  for (const field of requiredMetadata) {
    if (!installed?.[field]) errors.push(`${expected.name} published metadata omits '${field}'`);
  }
  if (installed?.name !== expected.name) {
    errors.push(`${expected.name} resolved to package '${installed?.name}'`);
  }
  if (installed?.version !== expected.version) {
    errors.push(
      `${expected.name} resolved to version ${installed?.version}, expected ${expected.version}`,
    );
  }

  const { targets, errors: resolutionErrors } = resolveEntryPoints(installed ?? {}, installedFiles);
  for (const error of resolutionErrors) errors.push(`${expected.name} ${error}`);
  if (targets.length === 0) errors.push(`${expected.name} declares no entry points`);
  const files = new Set(installedFiles);
  for (const target of targets) {
    if (!files.has(target)) {
      errors.push(`${expected.name} published package omits declared entry point '${target}'`);
    }
  }

  for (const [dependency, range] of Object.entries(expected.dependencies)) {
    if (installed?.dependencies?.[dependency] !== range) {
      errors.push(
        `${expected.name} published dependency ${dependency}@` +
          `${installed?.dependencies?.[dependency]} does not pin ${range}`,
      );
    }
    if (installedVersions.get(dependency) !== range) {
      errors.push(
        `${expected.name} dependency closure resolved ${dependency}@` +
          `${installedVersions.get(dependency)}, expected ${range}`,
      );
    }
  }

  return errors;
}

// A consumer that imports every published subpath must also install every
// declared peer, including the optional ones, so their type declarations and
// runtime modules resolve exactly as they would in a real application.
export function consumerPeerDependencies(packages) {
  const peers = {};
  for (const { peerDependencies } of packages) {
    for (const [peer, range] of Object.entries(peerDependencies ?? {})) {
      if (peer.startsWith("@gik-ai/")) continue;
      peers[peer] = range;
    }
  }
  return peers;
}

export function consumerManifest(packages, tooling) {
  return {
    name: "gik-published-package-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      ...Object.fromEntries(packages.map(({ name, version }) => [name, version])),
      ...consumerPeerDependencies(packages),
    },
    devDependencies: tooling,
  };
}

export function typescriptConsumerSource(subpaths) {
  return [
    ...subpaths.map((subpath, index) => `import * as module${index} from "${subpath}";`),
    "",
    `const modules: Record<string, unknown> = {${subpaths
      .map((subpath, index) => `\n  ${JSON.stringify(subpath)}: module${index},`)
      .join("")}\n};`,
    "",
    "export const consumed = Object.keys(modules).length;",
    "",
  ].join("\n");
}

export function runtimeConsumerSource(subpaths) {
  return [
    'import assert from "node:assert/strict";',
    'import { createInMemoryTransportPair } from "@gik-ai/kernel";',
    "",
    `const subpaths = ${JSON.stringify(subpaths, undefined, 2)};`,
    "",
    "for (const subpath of subpaths) {",
    "  const namespace = await import(subpath);",
    "  assert.ok(",
    "    Object.keys(namespace).length > 0,",
    "    `${subpath} exposes no exports to an external consumer`,",
    "  );",
    "}",
    "",
    "const [host, client] = createInMemoryTransportPair();",
    "const received = [];",
    "client.subscribe((message) => received.push(message));",
    'await host.send({ type: "hello" });',
    'assert.deepEqual(received, [{ type: "hello" }], "in-memory transport pair must deliver");',
    "",
    "console.log(`Imported ${subpaths.length} published entry points.`);",
    "",
  ].join("\n");
}

function run(command, args, cwd) {
  const result = spawnSync(process.platform === "win32" ? `${command}.cmd` : command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

// `npm audit signatures` verifies every installed package against the registry
// signing keys and Sigstore, so it is the authoritative provenance check for the
// whole dependency graph. It needs no credentials and never mutates the project.
export function auditSignatures(project) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "audit",
    "signatures",
    "--json",
    "--include-attestations",
    "--registry",
    publicRegistry,
  ], { cwd: project, encoding: "utf8" });
  if (result.error) throw result.error;
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `npm audit signatures produced no verifiable report:\n${result.stdout}\n${result.stderr}`,
    );
  }
  if (report?.error) {
    throw new Error(`npm audit signatures failed: ${report.error.summary ?? report.error.code}`);
  }
  return report;
}

export const provenancePredicateType = "https://slsa.dev/provenance/v1";

// Every stable package is published with npm trusted publishing, so a package
// without a verified provenance attestation is a release integrity failure even
// when its registry signature is valid.
export function verifyProvenance(report, packages) {
  const errors = [];

  for (const entry of report?.invalid ?? []) {
    errors.push(`${entry.name}@${entry.version} has an invalid signature or attestation`);
  }
  for (const entry of report?.missing ?? []) {
    errors.push(`${entry.name}@${entry.version} has a missing registry signature`);
  }

  const verified = new Map(
    (report?.verified ?? []).map((entry) => [`${entry.name}@${entry.version}`, entry]),
  );
  for (const { name, version } of packages) {
    const entry = verified.get(`${name}@${version}`);
    if (!entry) {
      errors.push(`${name}@${version} has no verified attestation`);
      continue;
    }
    if (entry.attestations?.provenance?.predicateType !== provenancePredicateType) {
      errors.push(
        `${name}@${version} attestation predicate ` +
          `'${entry.attestations?.provenance?.predicateType}' is not ${provenancePredicateType}`,
      );
    }
  }

  return errors;
}

export function verifyPublishedPackages(root) {
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const packages = expectedPackages(root);
  const project = mkdtempSync(join(tmpdir(), "gik-consumer-"));

  writeFileSync(
    join(project, "package.json"),
    `${JSON.stringify(
      consumerManifest(packages, {
        "@types/node": workspace.devDependencies["@types/node"],
        "@types/react": workspace.devDependencies["@types/react"],
        typescript: workspace.devDependencies.typescript,
      }),
      undefined,
      2,
    )}\n`,
  );
  writeFileSync(
    join(project, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "nodenext",
          moduleResolution: "nodenext",
          target: "es2022",
          jsx: "react-jsx",
          lib: ["es2022", "dom"],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["src"],
      },
      undefined,
      2,
    )}\n`,
  );

  run("npm", ["install", "--registry", publicRegistry, "--no-audit", "--no-fund"], project);

  const errors = [];
  const installedVersions = new Map();
  const installedManifests = new Map();
  for (const { name } of packages) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(project, "node_modules", name, "package.json"), "utf8"),
      );
      installedManifests.set(name, manifest);
      installedVersions.set(name, manifest.version);
    } catch {
      errors.push(`${name} is not installed from ${publicRegistry}`);
    }
  }

  const subpaths = [];
  for (const expected of packages) {
    const installed = installedManifests.get(expected.name);
    if (!installed) continue;
    errors.push(
      ...verifyInstalledPackage(
        expected,
        installed,
        workspaceFiles(join("node_modules", expected.name), project),
        installedVersions,
      ),
    );
    subpaths.push(...importSubpaths(installed));
  }

  errors.push(...verifyProvenance(auditSignatures(project), packages));

  if (errors.length) {
    throw new Error(`Published packages failed consumer verification:\n- ${errors.join("\n- ")}`);
  }

  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "consumer.ts"), typescriptConsumerSource(subpaths));
  writeFileSync(join(project, "consumer.mjs"), runtimeConsumerSource(subpaths));

  run("npx", ["--no-install", "tsc", "--project", "tsconfig.json"], project);
  run("node", ["consumer.mjs"], project);

  return { project, packages, subpaths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { packages, subpaths } = verifyPublishedPackages(root);
  console.log(
    `Verified ${packages.length} published packages from ${publicRegistry} ` +
      `(${subpaths.length} entry points, signatures and provenance attestations) ` +
      "as an external consumer.",
  );
}
