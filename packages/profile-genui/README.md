# @gik/profile-genui

The **GenUI profile flavor** for the Generative Interaction Kernel: the concrete layer-kind vocabulary
(interaction / presentation / runtime-document), the `genui-profile` kind, the two lowering recipe
shapes and their schema/lint, the stage executors, and the full pipeline runner. It builds on the
generic kind *mechanism* in [`@gik/profile`](https://www.npmjs.com/package/@gik/profile).

```bash
npm install @gik/profile-genui
```

```ts
import {
  createProfileBundle,
  loadProfileBundle,
  validateProfileBundle,
} from "@gik/profile-genui";
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
