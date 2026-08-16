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
