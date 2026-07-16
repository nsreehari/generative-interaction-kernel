# GIK Samples

These samples consume only published GIK package entry points and can be copied into a standalone repository.

## Setup

```sh
npm install
npm run typecheck
npm test
npm run build
```

Run the generic browser host with `npm run dev`. Select a bundle with a URL such as `http://localhost:5175/?bundle=workbench`.

The backend examples have dedicated scripts: `start:backend`, `start:agent`, `start:control`, `start:continuity`, and `start:gik`.

All `@gik/*` dependencies must be released at the versions declared in `package.json` before installing this directory outside the GIK monorepo.
