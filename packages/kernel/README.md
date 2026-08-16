# @gik/kernel

The embeddable **Generative Interaction Kernel**: it interprets a portable UI-intent document into a
running, reactive interface, delegating everything domain- and framework-specific to pluggable
providers. The kernel owns the invariants (grammar, validation, reduction) and is dependency-free.

```bash
npm install @gik/kernel
```

```ts
import { Kernel, GIKClient, KernelTransportHost, InMemoryStateModel } from "@gik/kernel";

// Own the runtime in process: one dispatch produces one revision.
const kernel = new Kernel(/* manifest, document */);
```

## When to use

- You want local runtime authority and deterministic execution in-process.
- You are connecting a remote renderer to an authoritative host over the GIK wire protocol
  (`GIKClient` + `KernelTransportHost`).

## Package boundary

The kernel owns document validation, state revisions, deterministic reduction,
effect declarations, snapshots, and compensation. Renderers, storage,
transports, domain components, and effect execution are supplied by other
packages or by the host application.

The TypeScript exports are the API authority. See the
[project documentation](https://github.com/nsreehari/generative-interaction-kernel/tree/master/docs)
for architecture, protocol, and compatibility contracts.

## License

MIT
