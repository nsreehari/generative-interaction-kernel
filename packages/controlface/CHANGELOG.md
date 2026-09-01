# @gik-ai/controlface

## 0.2.0

### Minor Changes

- 1e2a7b6: Add host-owned invocation authorization snapshots and explicit durable request correlation context.

  Ambiguous service operation names now require an explicit service reference instead of selecting the first matching service.

## 0.1.5

### Patch Changes

- 1217a63: Prepare the supported public package set with package-owned consumer
  documentation and validated release metadata.
- a11cb3f: Republish the public packages with their declared build output. The previous
  prerelease tarballs were produced without a build of the release commit, so
  installed packages were missing the `dist` entry points declared by their
  package manifests.

## 0.1.5-next.1

### Patch Changes

- a11cb3f: Republish the public packages with their declared build output. The previous
  prerelease tarballs were produced without a build of the release commit, so
  installed packages were missing the `dist` entry points declared by their
  package manifests.

## 0.1.5-next.0

### Patch Changes

- 49ef851: Prepare the supported public package set with package-owned consumer
  documentation and validated release metadata.
