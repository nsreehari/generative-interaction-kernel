# @gik/kernel

The embeddable **Generative Interaction Kernel**: it interprets a portable UI-intent document into a
running, reactive interface, delegating everything domain- and framework-specific to pluggable
providers. The kernel owns the invariants (grammar, validation, reduction) and is dependency-free.

```bash
npm install @gik/kernel
```

```ts
import { Kernel, GIKClient, KernelTransportHost, InMemoryStateModel } from "@gik/kernel";

// Own the runtime in-process: one dispatch is one rev.
const kernel = new Kernel(/* manifest, document */);
```

## When to use

- You want local runtime authority and deterministic execution in-process.
- You are connecting a remote renderer to an authoritative host over the GIK wire protocol
  (`GIKClient` + `KernelTransportHost`).

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) for the full consumer manual,
and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
