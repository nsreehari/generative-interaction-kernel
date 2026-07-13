# @gik/profile

The generic **profile machinery** for the Generative Interaction Kernel — the kind *mechanism*. A
profile is a typed pipeline of kinded layers connected by recipes; each stage's transform is selected by
the `${fromKind}->${toKind}` pair and executed through an open executor registry (`traceStages`).

The concrete GenUI kind *values* (interaction / presentation / runtime-document), their recipe shapes,
and their executors live in [`@gik/profile-genui`](https://www.npmjs.com/package/@gik/profile-genui).

```bash
npm install @gik/profile
```

```ts
import { traceStages } from "@gik/profile";
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
