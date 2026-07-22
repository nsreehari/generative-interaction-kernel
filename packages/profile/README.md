# @gik/profile

The generic **profile machinery** for the Generative Interaction Kernel — the kind *mechanism*. A
profile is a typed pipeline of kinded layers connected by recipes; each stage's transform is selected by
the `${fromKind}->${toKind}` pair and executed through an open executor registry (`traceStages`).

The concrete GenUI kind *values* (interaction / presentation / runtime-document), their recipe shapes,
and their executors currently live in the internal `packages/profile-genui` workspace.

This package also owns the canonical Blueprint artifact, schema validation, and template-aware
lowering loader (`BlueprintArtifact`, `validateBlueprintArtifact`, `loadBlueprint`).

```bash
npm install @gik/profile
```

```ts
import { loadBlueprint, traceStages } from "@gik/profile";
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
