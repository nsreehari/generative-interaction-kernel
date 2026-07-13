# @gik/provider-reactive-state-model

Reactive `StateModel` provider for the **Generative Interaction Kernel**, built over a continuous event
graph: derived/computed cells recompute automatically when their dependencies change. Plug it into the
kernel's `StateModel` seam.

```bash
npm install @gik/provider-reactive-state-model
```

```ts
import { ReactiveStateModel } from "@gik/provider-reactive-state-model";

const state = new ReactiveStateModel(/* initial + derive edges */);
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
