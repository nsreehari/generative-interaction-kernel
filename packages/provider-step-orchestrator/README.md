# @gik-ai/provider-step-orchestrator

Step/flow `Orchestrator` provider for the **Generative Interaction Kernel**. Registers named flows and
drives multi-step effects through the kernel dispatch seam.

```bash
npm install @gik-ai/provider-step-orchestrator
```

```ts
import { StepOrchestrator, type FlowRegistry } from "@gik-ai/provider-step-orchestrator";

// A FlowRegistry is a map of flow name -> registration.
const registry: FlowRegistry = {
  /* checkout: { ...flow registration... } */
};
const orchestrator = new StepOrchestrator(registry);
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
