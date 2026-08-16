# Releasing npm packages

GIK uses Changesets with independent package versions. Only packages listed in
the `stable` group in `config/npm-release.json` are eligible for the production
`latest` channel.

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

## Publish

1. Merge the version pull request after `CI / Validate` passes.
2. Confirm `master` is green.
3. Create and publish a GitHub Release from the current `master` commit.
4. Use a tag in the form `npm-YYYY-MM-DD.N`, for example
   `npm-2026-08-16.1`.
5. Approve the protected `npm-publish` environment deployment.

The workflow rebuilds and tests the complete repository, validates the explicit
package policy, inspects every npm tarball, and then uses Changesets to publish
only versions that do not already exist.

Package inspection uses npm's publication dry run and is deliberately guarded
to GitHub Actions. Do not run npm publication or registry-inspection commands
from restricted corporate networks.

## Authentication

Configure each existing npm package to trust:

- Repository: `nsreehari/generative-interaction-kernel`
- Workflow: `publish.yml`
- Environment: `npm-publish`

Trusted publishing uses short-lived GitHub OIDC credentials. Initial publication of a new package name requires an environment-scoped
granular npm token named `NPM_TOKEN`. Once a package exists, configure its
trusted publisher before removing the token fallback. Provenance remains
enabled for token-authenticated publication when the source repository is
public.

Production provenance requires the source repository to be public. Do not
publish the first production release while GIK remains private.

## Safety properties

- Draft and prerelease GitHub Releases cannot publish.
- A release tag must point to the current `master` commit.
- Only one publication runs at a time.
- The full release gate and package dry run complete before environment
  approval.
- Publication never runs for a manually dispatched workflow; manual dispatch
  is validation-only.
- Experimental and internal packages remain private.

Package publication is not transactional. If npm accepts one package and a
later package fails, fix the cause and rerun the same workflow. Changesets
skips versions already present and continues with unpublished versions.
