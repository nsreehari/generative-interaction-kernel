import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyRelease } from "./release-artifacts.mjs";
import { digest } from "./workflow-validation.mjs";

export async function publishedManifest(packages, { repository, commit, tag, verificationRunId }, fetcher = fetch) {
  assert.equal(repository, "nsreehari/generative-interaction-kernel");
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.match(tag, /^npm-\d{4}-\d{2}-\d{2}\.[1-9]\d*$/);
  assert.match(verificationRunId, /^[1-9]\d*$/);
  const seen = new Set();
  const published = [];
  for (const entry of packages) {
    assert.match(entry.name, /^gik-[a-z0-9-]+$/);
    assert.match(entry.version, /^\d+\.\d+\.\d+$/);
    assert.ok(!seen.has(entry.name), "Duplicate release package");
    seen.add(entry.name);
    const response = await fetcher(`https://registry.npmjs.org/${entry.name}/${entry.version}`, {
      redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    assert.ok(response.ok, `Cannot retrieve verified package ${entry.name}@${entry.version}: HTTP ${response.status}`);
    const metadata = await response.json();
    assert.equal(metadata.name, entry.name);
    assert.equal(metadata.version, entry.version);
    assert.match(metadata.dist?.integrity ?? "", /^sha512-[A-Za-z0-9+/=]+$/);
    const tarball = new URL(metadata.dist.tarball);
    assert.ok(tarball.protocol === "https:" && tarball.hostname === "registry.npmjs.org"
      && !tarball.port && !tarball.username && !tarball.password, "Unexpected published tarball origin");
    if (entry.publish) assert.equal(metadata.dist.integrity, entry.integrity, "Published bytes differ from validated archive");
    published.push({ name: entry.name, version: entry.version, integrity: metadata.dist.integrity, tarball: tarball.href });
  }
  assert.ok(published.length > 0, "Empty verified release");
  return { format: "gik-release-manifest/1", repository, commit, tag, verificationRunId, packages: published };
}

export function publishManifest(repository, tag, path, execute = execFileSync) {
  const release = JSON.parse(execute("gh", ["api", `repos/${repository}/releases/tags/${tag}`], { encoding: "utf8" }));
  assert.ok(!release.draft && !release.prerelease, "Only verified stable releases may be announced");
  const existing = release.assets.find((asset) => asset.name === "gik-release-manifest.json");
  if (existing) {
    const bytes = execute("gh", ["api", "-H", "Accept: application/octet-stream", `repos/${repository}/releases/assets/${existing.id}`]);
    assert.equal(digest(bytes), digest(readFileSync(path)), "Existing verified release manifest differs; do not overwrite it");
    return;
  }
  execute("gh", ["release", "upload", tag, path, "--repo", repository], { stdio: "inherit" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.GITHUB_EVENT_NAME, "release");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const path = join(root, ".artifacts/gik-release-manifest.json");
  const repository = process.env.GITHUB_REPOSITORY;
  const tag = process.env.RELEASE_TAG;
  const [command] = process.argv.slice(2);
  if (command === "write") {
    const bundle = verifyRelease(root, join(root, ".artifacts/npm-release"), process.env.RELEASE_MANIFEST_SHA256);
    const manifest = await publishedManifest(bundle.packages, {
      repository, commit: process.env.RELEASE_COMMIT, tag, verificationRunId: process.env.GITHUB_RUN_ID,
    });
    mkdirSync(join(root, ".artifacts"), { recursive: true });
    const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(path, bytes);
    writeFileSync(join(root, ".artifacts/gik-release-dispatch.json"), `${JSON.stringify({
      event_type: "gik-release-verified",
      client_payload: { tag, commit: manifest.commit, manifestSha256: digest(bytes) },
    }, null, 2)}\n`);
  } else if (command === "publish") {
    assert.equal(repository, "nsreehari/generative-interaction-kernel");
    assert.match(tag ?? "", /^npm-\d{4}-\d{2}-\d{2}\.[1-9]\d*$/);
    publishManifest(repository, tag, path);
  } else {
    throw new Error("Expected write or publish command");
  }
}
