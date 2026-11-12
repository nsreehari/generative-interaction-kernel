# Source-of-truth documents

This directory contains cross-package architecture, compatibility, and
governance contracts for GIK maintainers.

Each package's `README.md` is the authoritative consumer-facing guide included
in its npm tarball. SOT files preserve cross-package invariants, compatibility
detail, and implementation limitations, not a second onboarding manual.
TypeScript exports/declarations and tests determine implemented API behavior;
explicitly marked future designs do not promise an available API. Package
manifests, rather than duplicated version fields here, determine versions.

When a public API changes, update:

1. The TypeScript exports and tests.
2. The owning package README.
3. Any cross-package SOT or ADR affected by the boundary change.

Consumer navigation starts at the [documentation guide](../README.md).
