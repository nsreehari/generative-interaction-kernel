import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { allowedVersionOutput } from "./version-output-policy.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const plan = JSON.parse(readFileSync("release-metadata.json", "utf8"));
const pr = event.pull_request;
assert.equal(pr.head.repo.full_name, event.repository.full_name, "Forks require maintainer adoption");
assert.equal(plan.head, pr.head.sha);
assert.equal(plan.base, pr.base.sha);
assert.equal(plan.pullRequest, pr.number);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const root = JSON.parse(git("show", `${plan.base}:package.json`));
const workspaces = root.workspaces.map((path) => ({
  path, manifest: JSON.parse(git("show", `${plan.base}:${path}/package.json`)),
}));
const stable = JSON.parse(git("show", `${plan.base}:config/npm-release.json`)).stable;
const existingChangesets = git("ls-tree", "-r", "--name-only", plan.head, ".changeset").split("\n")
  .filter((path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md");
const api = (path, body) => JSON.parse(execFileSync("gh", [
  "api", ...(body ? ["--method", "POST", "--input", "-"] : []),
  `repos/${event.repository.full_name}/${path}`,
], { encoding: "utf8", ...(body ? { input: JSON.stringify(body) } : {}) }));

const entries = Object.entries(plan.outputs);
if (!entries.length) {
  console.log("Version metadata already matches the implementation PR.");
} else {
  const tree = [];
  for (const [path, content] of entries) {
    const exists = git("ls-tree", plan.head, "--", path) !== "";
    assert.ok(path === ".changeset/implementation-release.json"
      || allowedVersionOutput(path, content === null ? "D" : exists ? "M" : "A",
        workspaces, stable, existingChangesets), `Disallowed output ${path}`);
    assert.ok(content === null || typeof content === "string");
    const sha = content === null ? null : api("git/blobs", { content, encoding: "utf-8" }).sha;
    tree.push({ path, mode: "100644", type: "blob", sha });
  }
  assert.equal(api(`git/ref/heads/${pr.head.ref}`).object.sha, plan.head, "PR advanced; replan its new head");
  assert.equal(api("git/ref/heads/master").object.sha, plan.base, "Base advanced; update the implementation PR");
  const newTree = api("git/trees", { base_tree: git("rev-parse", `${plan.head}^{tree}`), tree }).sha;
  const commit = api("git/commits", {
    message: "chore: prepare package versions in implementation PR\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
    tree: newTree, parents: [plan.head],
  });
  execFileSync("gh", ["api", "--method", "PATCH",
    `repos/${event.repository.full_name}/git/refs/heads/${pr.head.ref}`, "--input", "-"], {
    input: JSON.stringify({ sha: commit.sha, force: false }), stdio: ["pipe", "inherit", "inherit"],
  });
}
