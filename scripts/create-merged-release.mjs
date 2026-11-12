import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { newerStableVersion } from "./version-output-policy.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const parse = (sha, path) => JSON.parse(git("show", `${sha}:${path}`));
const root = parse(event.after, "package.json");
const stable = parse(event.after, "config/npm-release.json").stable;
const paths = root.workspaces.filter((path) => stable.includes(parse(event.after, `${path}/package.json`).name));
const prerelease = git("ls-tree", event.after, "--", ".changeset/pre.json") !== "";
let changed = false;
for (const path of paths) {
  const before = parse(event.before, `${path}/package.json`);
  const after = parse(event.after, `${path}/package.json`);
  if (before.version !== after.version) {
    if (prerelease || before.version.includes("-") || after.version.includes("-")) {
      console.log("Prerelease entry/promotion remains manual.");
      process.exit(0);
    }
    assert.ok(newerStableVersion(before.version, after.version), `${after.name} version must increase`);
    changed = true;
  }
}
if (!changed) {
  console.log("No public package version changed; no release.");
} else {
  const repository = event.repository.full_name;
  const api = (path) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}/${path}`], { encoding: "utf8" }));
  assert.equal(api("git/ref/heads/master").object.sha, event.after, "master advanced; do not tag stale versions");
  const timestamp = git("show", "-s", "--format=%ct", event.after);
  const day = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const tag = `npm-${day}.${timestamp}`;
  const releases = api("releases?per_page=100");
  if (releases.some((release) => release.tag_name === tag)) {
    assert.equal(git("rev-list", "-n", "1", tag), event.after, "Existing release targets another commit");
    console.log(`Release ${tag} already exists.`);
  } else {
    execFileSync("gh", ["release", "create", tag, "--repo", repository, "--target", event.after,
      "--title", tag, "--generate-notes"], { stdio: "inherit" });
  }
}
