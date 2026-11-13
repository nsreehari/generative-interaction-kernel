# Releasing npm packages

GIK uses Changesets with independent package versions. Only packages listed in
the `stable` group in `config/npm-release.json` are eligible for npm
publication. They first publish as prereleases on `next`; validated releases
are later promoted through stable versions on `latest`.

## Prepare a package change

The automatic stable policy supplies patch intent for changed published
package inputs. Add a changeset in the same pull request for an explicit minor
or major change (or a consumer-facing patch summary):

```bash
npm run changeset
```

Select the affected stable packages, choose the semantic version impact, and
write a consumer-facing summary. Internal and experimental workspaces are
private and excluded from production publishing.

`gik-agent-lifecycle-exp` and `gik-blueprint-agent-host` participate in this
supported release channel with independent 0.x versions. The existing
`gik-agent-lifecycle-exp` npm name is retained for compatibility; its suffix
does not select an experimental dist-tag. Changesets versions both packages
and keeps the host's lifecycle dependency pinned.

Before their first publication, confirm both npm package names exist under the
maintainer's ownership and have the trusted publisher described below configured.
OIDC cannot bootstrap a nonexistent package; initial package registration is a
maintainer prerequisite, not a reason to add token fallback to this workflow.

## Change-aware validation

Every pull request reports the required `Validate` check; there are no
workflow-level path filters. Known docs, workflow, and release-policy changes
install dependencies and run `npm run test:release`, including workflow safety
and Changesets/pinning integration tests. That suite includes real workspace
consumer smoke checks, so public packages are built first on both paths;
these checks are not skipped to optimize documentation changes.
Production, configuration, and unknown paths run the complete `npm test`. Manual CI dispatch
always uses the full gate. The npm dependency cache remains enabled.

CI also preserves Turbo's `.turbo` task cache. Shared source roots outside the
workspaces are global build inputs; cache entries are separated by OS,
architecture, exact Node version, pinned npm 11.6.2 and lock/config hashes.
Turbo additionally checks task inputs and dependency hashes. A cache hit is
never itself a successful test result. Manual CI on `master` warms the
default-branch cache; PR caches remain scoped to their merge ref.

Successful CI uploads `gik-validation` for seven days. It contains only built
workspace `dist` files and `gik-validation/1` evidence, never `node_modules`,
credentials or local environment files. The evidence binds the Git tree,
resolved and installed lock hashes, exact Node/npm, platform/architecture,
runner image version, validation scope and output checksums to a run/attempt.
Metadata events do not cancel useful in-flight source validation; their new
required check reevaluates release policy and can restore identical successful
validation. Manual dispatch always executes validation instead of restoring it.

Post-merge PR promotion is disabled unless the repository variable
`GIK_REUSE_PR_VALIDATION` is `true`. Enable only after reviewing the workflow
and exercising a normal release. Promotion accepts successful internal
`ci.yml` PR runs associated with that exact merged commit, independently
verifies the validated commit's Git tree, and requires identical inputs and
full test scope. Forks, policy-only checks, expired artifacts, different merge
trees, changed tools/dependencies/images and absent evidence do not qualify:
the normal complete release gate runs with an explicit summary. Corrupt
matching evidence fails rather than becoming a cache miss. The publisher
never executes downloaded artifact scripts. Disabling the variable restores
the normal full gate without changing branch protection or approval.

## Automatic stable versions in the implementation PR

The version App updates metadata **in the existing implementation PR**, not a
separate version PR or a direct default-branch commit. Normal required CI and
review run again before merge. No branch protection or approval is bypassed.

- Changed public package inputs default to patch intent. Existing Changesets
  minor/major intent takes precedence. Transitive consumers are versioned so
  exact internal dependency pins remain consistent.
- A changeset-only follow-up can release an already-merged package change;
  explicit intent uses the same in-PR metadata workflow without requiring source edits.
- Ownership includes source outside `packages/`: kernel, Blueprint, faces,
  React, SSE, shared compiler inputs, and embedded schemas. Root dependency/build
  inputs conservatively affect all stable packages. Unowned inputs fail closed.
  Root docs/workflows/tests do not themselves request publication; packed
  package READMEs and docs do.
- The trusted `pull_request_target` workflow checks out only the base, installs
  base tooling with lifecycle scripts disabled, and reads PR JSON/Markdown as
  data. It never checks out or executes PR scripts with a write token.
- Changesets runs against an isolated data-only snapshot with trusted config
  and changelog implementation. The App writes only generated versions,
  exact workspace pins, workspace-only lock metadata, changelogs, consumed
  changesets, and `.changeset/implementation-release.json` tracking consumed
  intent for repeatable planning. External lock dependencies are not rewritten.
- Reruns recompute from the PR base, avoiding repeated bumps. Update a stale PR
  before merge; advanced PR/base heads fail instead of force-pushing stale
  metadata. Fork changes need maintainer adoption onto an internal branch.
- Workspace/publishing-policy changes and prerelease mode require manual
  maintainer adoption with the `release:manual` label and reviewed version
  metadata in the same PR. This disables only generated version planning, never
  the build/test or publication gates. Prerelease entry, exit, and `next`
  publication retain the explicit reviewed path below.

After the reviewed stable versions merge, the release App creates a deterministic
`npm-YYYY-MM-DD.<commit-timestamp>` release at that commit. If no public version
changed it does nothing. Existing matching releases are reused, not recreated;
an advanced default branch or mismatched release fails explicitly. Do not move
release tags; reconcile an interrupted release in a reviewed follow-up.

The App needs Contents write permission with existing `GIK_MAINTAINER_APP_ID`
and `GIK_MAINTAINER_APP_PRIVATE_KEY` configuration. App-created commits trigger
normal CI, and App-created releases trigger publication (the built-in token
suppresses these follow-up events). No secret values need inspecting. The
complete release gate, stable/prerelease tag checks, trusted npm publication,
consumer verification, and `npm-publish` approval remain mandatory.

## Publish a prerelease

1. Prepare and merge reviewed version metadata after `CI / Validate` passes.
2. Confirm the version metadata passed `CI / Validate`; the release
   workflow runs the complete gate against the tagged `master` commit, or
   verifies equivalent full PR validation when promotion is explicitly enabled.
3. Confirm `.changeset/pre.json` is in `next` prerelease mode and that the
   reviewed change contains `-next.N` package versions.
4. Create a GitHub prerelease from the current `master` commit.
5. Use a tag in the form `npm-next-YYYY-MM-DD.N`, for example
   `npm-next-2026-08-16.1`.
6. Approve the protected `npm-publish` environment deployment.

The workflow requires the GitHub prerelease flag, prerelease tag, Changesets
mode, package versions, and `next` npm dist-tag to agree.

## Publish a stable release

After the prerelease has been consumed successfully, exit Changesets
prerelease mode and prepare stable versions in a reviewed change. Then:

1. Confirm the merged stable version change passed `CI / Validate`; the
   release workflow runs the complete gate against the tagged `master` commit,
   or verifies equivalent full PR validation when promotion is explicitly enabled.
2. Create a non-prerelease GitHub Release from the current `master` commit.
3. Use a tag in the form `npm-YYYY-MM-DD.N`, for example
   `npm-2026-08-16.1`.
4. Approve the protected `npm-publish` environment deployment.

The stable workflow rejects prerelease package versions and publishes with the
`latest` npm dist-tag.

The workflow validates the explicit package policy and channel, builds and
tests the repository (or verifies equivalent validation), and runs
`npm run release:pack`. This packs every stable workspace once, including its
packaging lifecycle, and inspects the actual archives. Every declared entry
point must be present. Wildcard exports such as `./schemas/*` expand against
the workspace tree, so an omitted file cannot hide by being absent from the
archive. Private/experimental/internal packages are never publication targets.

The `gik-npm-release` artifact holds the actual `.tgz` files and a
`gik-release-artifacts/1` manifest for 30 days. The protected publisher downloads
that artifact, checks its manifest against the producer job's SHA-256 output,
checks every archive and reviewed package identity, and reverifies the release
tag. It neither installs workspace dependencies nor rebuilds/repackages.
`npm run release:publish-artifacts` publishes those exact archives in dependency
order with trusted publishing, provenance and lifecycle execution disabled.
Unchanged versions already published at planning time are skipped. A retry of
an interrupted publication skips a newly published version only when its npm
integrity equals the validated archive; different bytes fail explicitly.

Registry authentication, transport and malformed responses remain errors;
only an explicit registry HTTP 404 marks a version unpublished. Artifact digest mismatches
are hard failures, not just the download action's warnings. Manual dispatch is
still validation-only. The older `release:inspect`/`release:verify-artifacts`
commands remain available for focused diagnostics and bootstrap. Do not run
publication or registry-inspection commands from restricted corporate networks.

## Verify a publication from the public registry

Publication-side verification cannot prove that an external consumer can use
the published packages. After stable publication succeeds, the publishing
workflow automatically calls `Verify published packages`, pinned to the same
validated release commit. Prerelease and validation-only runs do not invoke
this stable gate. Manual dispatch remains available for rechecking a publication.
It runs `npm run release:verify-published`
on GitHub-hosted infrastructure, which installs the stable packages at the exact
workspace versions from `https://registry.npmjs.org` into a clean project and
fails closed when any of the following does not hold:

- every stable package resolves to its exact expected version,
- published metadata carries `name`, `version`, `license`, and `repository`,
- every declared entry point exists in the installed package,
- every pinned `gik-*` dependency resolves to the pinned version,
- `npm audit signatures` reports no invalid or missing registry signature or
  attestation anywhere in the installed dependency graph, and every stable
  package carries a verified npm provenance attestation,
- the installed type declarations typecheck for a consumer that imports every
  published subpath,
- every published subpath imports in Node.js and exposes exports, and
- minimal runtime behaviour works through the published build output.

The gate never publishes, requires no npm credentials, and does not use the
`npm-publish` environment. Initial installation retries only npm `ETARGET`
version-visibility failures, up to six attempts one minute apart, to allow
registry propagation. Other installation failures and all consumer verification
failures remain immediately blocking. Publishing approval and branch protection
are unchanged. Do not run it from restricted corporate networks,
because it installs packages from the public registry and verifies signatures
and provenance against the public registry keys and Sigstore
(`tuf-repo-cdn.sigstore.dev`); it fails closed when either is unreachable.

## Verified cross-repository release handoff

Only after stable publication **and** the clean registry-consumer gate succeed,
the workflow attaches `gik-release-manifest.json` to the GitHub Release.
`gik-release-manifest/1` identifies this repository, the exact source commit,
release tag, successful verification workflow run ID, and every stable
package's exact npm version, registry SRI integrity and allowlisted tarball URL.
Newly published integrity must equal the previously verified archive.
An identical existing asset is reused; a different one is never overwritten.

Roll out the coordinated `gik-samples` receiver workflow first. Then set the
GIK repository variable `GIK_SAMPLES_RELEASE_DISPATCH=true`; the existing
maintainer App must be installed on samples with Contents write permission.
A separately scoped samples-only App token sends `gik-release-verified` with
`{tag, commit, manifestSha256}`. The receiver must independently verify the
public release asset and successful source run, plan from trusted base code,
and open/update one dependency PR rather than push to `main`. Normal samples
CI and review remain required. Samples continues consuming npm packages,
never a sibling checkout or GIK build outputs.

Leave dispatch disabled until both coordinated changes are merged. Disabling
it stops automatic downstream updates without stopping GIK publication or its
consumer gate; the exact public manifest remains available for manual use.
Publication and deployment are separate operations, not a recursive release
trigger. Bootstrap workflows remain manual one-time registration tools.

For rollout, compare required-check latency, workflow/job runner time, queue
time, validation reuse notices, Turbo hit rate, artifact size/transfer time,
and the number of downstream PRs/deployments per release. Do not infer savings
solely from fewer jobs. Expired validation artifacts cause normal validation;
retain final release archives/manifests for the documented rollback horizon.

## Authentication

Configure each existing npm package to trust:

- Repository: `nsreehari/generative-interaction-kernel`
- Workflow: `publish.yml`
- Environment: `npm-publish`

Publication uses short-lived GitHub OIDC credentials. Every stable package must
have the trusted publisher above configured before its first release through
this workflow. No npm token is used or accepted as a fallback.

Production provenance requires the source repository to be public. Do not
publish the first production release while GIK remains private.

## Safety properties

- Draft releases cannot publish.
- GitHub prerelease state, release tag, Changesets mode, package versions, and
  npm dist-tag must identify the same channel.
- A release tag must point to the current `master` commit.
- Only one publication runs at a time.
- Publication fails closed when a package would ship without a declared entry
  point: validation inspects the actual archives and publication verifies those
  exact archives and their producer checksum against the release source.
- The full release gate and package dry run complete before environment
  approval.
- Publication never runs for a manually dispatched workflow; manual dispatch
  is validation-only.
- Experimental and internal packages remain private.
- A separate credential-free consumer gate verifies published packages from the
  public registry after publication, including registry signatures and
  provenance attestations for the whole installed dependency graph.

Package publication is not transactional. If npm accepts one package and a
later package fails, fix the cause and rerun the same workflow. Artifact
publication verifies completed versions by integrity and continues with
unpublished versions; it never replaces an existing version.
