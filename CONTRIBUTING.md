# Contributing to GIK

Thank you for helping improve the Generative Interaction Kernel.

## Before starting

Search existing issues and pull requests before opening a new one. For a
substantial feature or public-contract change, open an issue first so scope and
compatibility can be discussed.

Never include credentials, customer data, private endpoints, or proprietary
material in an issue, fixture, commit, or pull request.

## Development

GIK requires Node.js 24 and npm 11.

```sh
npm install --no-audit --no-fund
npm run build:public-packages
npm test
```

Use the smallest focused test while iterating, then run the complete validation
commands before requesting review. Do not weaken tests or validation because a
failure appears unrelated.

## Changes

- Keep changes focused and include tests for changed behavior.
- Preserve public package boundaries and exact internal package pins.
- Add a Changeset when a change affects a public package's consumers.
- Update package-owned README documentation when public behavior changes.
- Keep cross-package contracts and architectural decisions in the existing
  `docs/` sources of truth.

Pull requests must pass `CI / Validate`. Security, dependencies, workflows,
publishing, public contracts, schemas, conformance, and governance changes
require explicit human review.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
