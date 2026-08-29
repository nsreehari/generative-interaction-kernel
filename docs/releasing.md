# Releasing npm packages

GIK uses Changesets with independent package versions. Only packages listed in
the `stable` group in `config/npm-release.json` are eligible for npm
publication. They first publish as prereleases on `next`; validated releases
are later promoted through stable versions on `latest`.

## Prepare a package change

Add a changeset in the same pull request as a user-visible package change:

```bash
npm run changeset
```

Select the affected stable packages, choose the semantic version impact, and
write a consumer-facing summary. Internal and experimental workspaces are
private and excluded from production publishing.

After changesets reach `master`, the `Version npm packages` workflow maintains
a version pull request. That pull request updates package versions, pinned
internal dependencies, changelogs, and consumes the pending changeset files.
Because GitHub suppresses ordinary workflow events created by its built-in
token, the version workflow explicitly dispatches full CI for the generated
branch.

## Publish a prerelease

1. Merge the version pull request after `CI / Validate` passes.
2. Confirm `master` is green.
3. Confirm `.changeset/pre.json` is in `next` prerelease mode and that the
   version PR contains `-next.N` package versions.
4. Create a GitHub prerelease from the current `master` commit.
5. Use a tag in the form `npm-next-YYYY-MM-DD.N`, for example
   `npm-next-2026-08-16.1`.
6. Approve the protected `npm-publish` environment deployment.

The workflow requires the GitHub prerelease flag, prerelease tag, Changesets
mode, package versions, and `next` npm dist-tag to agree.

## Publish a stable release

After the prerelease has been consumed successfully, exit Changesets
prerelease mode in a reviewed change and merge the resulting stable version
PR. Then:

1. Confirm `master` is green.
2. Create a non-prerelease GitHub Release from the current `master` commit.
3. Use a tag in the form `npm-YYYY-MM-DD.N`, for example
   `npm-2026-08-16.1`.
4. Approve the protected `npm-publish` environment deployment.

The stable workflow rejects prerelease package versions and publishes with the
`latest` npm dist-tag.

The workflow rebuilds and tests the complete repository, validates the explicit
package policy, verifies that every packed tarball contains the entry points its
manifest declares, and inspects every npm tarball. Wildcard subpath exports such
as `./schemas/*` are expanded against the workspace tree, so every file they
expose must also be packed. The publication job repeats
the build, artifact verification, and tarball inspection on the verified release
commit before Changesets publishes only versions that do not already exist.

Package inspection uses npm's publication dry run and is deliberately guarded
to GitHub Actions. Do not run npm publication or registry-inspection commands
from restricted corporate networks.

## Verify a publication from the public registry

Publication-side verification cannot prove that an external consumer can use
the published packages. After a publication completes, run the
`Verify published packages` workflow. It runs `npm run release:verify-published`
on GitHub-hosted infrastructure, which installs the stable packages at the exact
workspace versions from `https://registry.npmjs.org` into a clean project and
fails closed when any of the following does not hold:

- every stable package resolves to its exact expected version,
- published metadata carries `name`, `version`, `license`, and `repository`,
- every declared entry point exists in the installed package,
- every pinned `@gik-ai` dependency resolves to the pinned version,
- `npm audit signatures` reports no invalid or missing registry signature or
  attestation anywhere in the installed dependency graph, and every stable
  package carries a verified npm provenance attestation,
- the installed type declarations typecheck for a consumer that imports every
  published subpath,
- every published subpath imports in Node.js and exposes exports, and
- minimal runtime behaviour works through the published build output.

The gate never publishes, requires no npm credentials, and does not use the
`npm-publish` environment. Do not run it from restricted corporate networks,
because it installs packages from the public registry and verifies signatures
and provenance against the public registry keys and Sigstore
(`tuf-repo-cdn.sigstore.dev`); it fails closed when either is unreachable.

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
  point, because the publishing job builds and verifies the release commit it
  publishes.
- The full release gate and package dry run complete before environment
  approval.
- Publication never runs for a manually dispatched workflow; manual dispatch
  is validation-only.
- Experimental and internal packages remain private.
- A separate credential-free consumer gate verifies published packages from the
  public registry after publication, including registry signatures and
  provenance attestations for the whole installed dependency graph.

Package publication is not transactional. If npm accepts one package and a
later package fails, fix the cause and rerun the same workflow. Changesets
skips versions already present and continues with unpublished versions.
