import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const validationArtifact = "gik-validation";
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const api = (path) => JSON.parse(gh("api", path));

export function workspacePaths(root) {
  const paths = json(join(root, "package.json")).workspaces;
  assert.ok(Array.isArray(paths) && paths.every((path) => /^packages\/[a-z0-9-]+$/.test(path)), "Expected explicit workspace paths");
  return paths;
}

export function validationInputs(root, environment = process.env) {
  const npm = /^npm\/([^\s]+)/.exec(environment.npm_config_user_agent ?? "")?.[1];
  assert.ok(npm, "Run validation tooling through npm");
  assert.ok(existsSync(join(root, "node_modules/.package-lock.json")), "An installed dependency lock is required");
  return {
    tree: git(root, "rev-parse", "HEAD^{tree}"),
    lock: digest(readFileSync(join(root, "package-lock.json"))),
    installedLock: digest(readFileSync(join(root, "node_modules/.package-lock.json"))),
    node: process.version,
    npm,
    platform: process.platform,
    arch: process.arch,
    image: environment.ImageOS ?? "",
    imageVersion: environment.ImageVersion ?? "",
    nodeEnv: environment.NODE_ENV ?? "",
  };
}

function filesIn(directory, prefix = "") {
  assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), "Output directory must not be a symlink");
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    const entry = lstatSync(path);
    assert.ok(!entry.isSymbolicLink(), `Symlink is not a validation output: ${path}`);
    return entry.isDirectory() ? filesIn(path, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

export function writeValidation(root, destination, scope, environment = process.env) {
  assert.ok(["full", "release"].includes(scope), "Unknown validation scope");
  const files = [];
  for (const workspace of workspacePaths(root)) {
    const directory = join(root, workspace, "dist");
    assert.ok(existsSync(directory), `Missing built workspace: ${workspace}`);
    for (const file of filesIn(directory)) {
      const path = `${workspace}/dist/${file}`;
      const target = join(destination, "outputs", path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, path), target);
      files.push({ path, sha256: digest(readFileSync(target)) });
    }
  }
  assert.ok(files.length, "No build outputs to preserve");
  const proof = {
    format: "gik-validation/1",
    repository: environment.GITHUB_REPOSITORY,
    runId: environment.GITHUB_RUN_ID,
    attempt: environment.GITHUB_RUN_ATTEMPT,
    commit: git(root, "rev-parse", "HEAD"),
    head: environment.PR_HEAD_SHA || git(root, "rev-parse", "HEAD"),
    scope,
    inputs: validationInputs(root, environment),
    files,
  };
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "validation.json"), `${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}

export function validateProof(root, directory, proof, expected, scope) {
  assert.equal(proof.format, "gik-validation/1");
  assert.ok(proof.scope === "full" || scope === "release" && proof.scope === "release", "Insufficient validation scope");
  assert.deepEqual(proof.inputs, expected, "Validation inputs differ");
  assert.ok(/^[a-f0-9]{40}$/.test(proof.commit), "Invalid validated commit");
  assert.ok(Array.isArray(proof.files) && proof.files.length > 0, "Empty validation output");
  const workspaces = workspacePaths(root);
  const outputFiles = filesIn(join(directory, "outputs"));
  const seen = new Set();
  for (const file of proof.files) {
    assert.ok(typeof file.path === "string" && !file.path.includes("\\") && !file.path.split("/").some((part) => ["", ".", ".."].includes(part)), "Invalid output path");
    assert.ok(workspaces.some((workspace) => file.path.startsWith(`${workspace}/dist/`)), "Output is outside workspace dist");
    assert.ok(!seen.has(file.path), "Duplicate validation output");
    seen.add(file.path);
    const source = join(directory, "outputs", file.path);
    assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink(), "Output must be a regular file");
    assert.equal(digest(readFileSync(source)), file.sha256, `Validation output checksum mismatch: ${file.path}`);
  }
  for (const workspace of workspaces) {
    assert.ok([...seen].some((path) => path.startsWith(`${workspace}/dist/`)), `Missing workspace output: ${workspace}`);
  }
  assert.deepEqual(outputFiles.sort(), [...seen].sort(), "Unexpected validation output files");
  return proof;
}

export function restoreProof(root, directory, proof) {
  for (const workspace of workspacePaths(root)) {
    // A restore must not leave stale files from an earlier build behind.
    rmSync(join(root, workspace, "dist"), { recursive: true, force: true });
  }
  for (const file of proof.files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(directory, "outputs", file.path), target);
  }
}

export function eligibleRun(run, repository, head) {
  return run.event === "pull_request" && run.conclusion === "success"
    && run.path === ".github/workflows/ci.yml"
    && run.repository?.full_name === repository && run.head_repository?.full_name === repository
    && run.head_sha === head;
}

export async function restoreValidation(root, scope, { environment = process.env, request = api, download = gh } = {}) {
  const repository = environment.GITHUB_REPOSITORY;
  assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/);
  const event = json(environment.GITHUB_EVENT_PATH);
  let head;
  if (environment.GITHUB_EVENT_NAME === "pull_request") {
    if (event.pull_request.head.repo.full_name !== repository) return { reused: false, reason: "fork artifacts are not eligible" };
    head = event.pull_request.head.sha;
  } else if (environment.GITHUB_EVENT_NAME === "release" && environment.ALLOW_PR_VALIDATION_REUSE === "true") {
    const commit = git(root, "rev-parse", "HEAD");
    const pulls = request(`repos/${repository}/commits/${commit}/pulls`);
    const pull = pulls.find((item) => item.merged_at && item.merge_commit_sha === commit && item.head.repo?.full_name === repository);
    if (!pull) return { reused: false, reason: "no merged internal PR for this exact commit" };
    head = pull.head.sha;
  } else {
    return { reused: false, reason: "manual validation or release promotion disabled" };
  }
  assert.match(head, /^[a-f0-9]{40}$/);
  const expected = validationInputs(root, environment);
  const runs = request(`repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=10`).workflow_runs;
  for (const run of runs.filter((item) => eligibleRun(item, repository, head) && String(item.id) !== environment.GITHUB_RUN_ID)) {
    const artifacts = request(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`).artifacts;
    if (!artifacts.some((artifact) => artifact.name === validationArtifact && !artifact.expired)) continue;
    const temporary = mkdtempSync(join(tmpdir(), "gik-validation-"));
    try {
      download("run", "download", String(run.id), "--repo", repository, "--name", validationArtifact, "--dir", temporary);
      const proof = json(join(temporary, "validation.json"));
      assert.equal(proof.repository, repository);
      assert.equal(proof.runId, String(run.id));
      assert.equal(proof.attempt, String(run.run_attempt));
      assert.equal(proof.head, head);
      // Input drift is a cache miss, not a successful validation. Corrupt matching
      // artifacts, on the other hand, are errors and must never be swallowed.
      if (JSON.stringify(proof.inputs) !== JSON.stringify(expected) || proof.scope !== "full" && scope === "full") continue;
      assert.match(proof.commit, /^[a-f0-9]{40}$/);
      assert.equal(request(`repos/${repository}/git/commits/${proof.commit}`).tree.sha, expected.tree, "Validated commit tree mismatch");
      validateProof(root, temporary, proof, expected, scope);
      restoreProof(root, temporary, proof);
      return { reused: true, reason: `verified ${scope} validation from run ${run.id}`, runId: String(run.id) };
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return { reused: false, reason: "no successful artifact with identical tree, dependencies, toolchain, image and scope" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const [command, scope = "full", directory = ".artifacts/validation"] = process.argv.slice(2);
  if (command === "write") {
    writeValidation(root, resolve(root, directory), scope);
  } else if (command === "restore") {
    const result = await restoreValidation(root, scope);
    console.log(`::notice::${result.reason}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reused=${result.reused}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Validation reuse\n\n${result.reason}\n`);
  } else {
    throw new Error("Expected write or restore command");
  }
}
