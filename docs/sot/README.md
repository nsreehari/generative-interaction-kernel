# Source-of-truth documents

This directory contains cross-package architecture, compatibility, and
governance contracts for GIK maintainers.

Consumer installation, package entry points, examples, and supported use cases
belong in each package's `README.md` and are included in npm tarballs. SOT files
may describe implementation boundaries that span multiple packages; they
should not duplicate package onboarding material or be copied verbatim into
consumer documentation.

When a public API changes, update:

1. The TypeScript exports and tests.
2. The owning package README.
3. Any cross-package SOT or ADR affected by the boundary change.

## Decision: package READMEs are the authoritative public documentation surface

Each published package's own `README.md` is the authoritative, consumer-facing
documentation for that package's exported API, purpose, and usage -- it is
what an npm consumer actually receives and reads. `docs/sot/gik-public/*.yaml`
remains maintainer/cross-package boundary reference material describing
implementation ownership and inter-package contracts; it is not a second
consumer-facing documentation surface, and its content should not be treated
as satisfying a package's own documentation obligation to its consumers. Where
a package's README was missing exported-API facts already captured in its SOT
file, that content has been migrated into the README directly.
