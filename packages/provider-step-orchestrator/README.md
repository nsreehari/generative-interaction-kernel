# gik-provider-step-orchestrator

Private workspace step/flow `Orchestrator` provider for the **Generative Interaction Kernel**. Registers named flows and
drives multi-step effects through the kernel dispatch seam.

This package is not published by the core release workflow. The example below
uses the local workspace package, not a supported public npm install.

```ts
import { StepOrchestrator, type FlowRegistry } from "gik-provider-step-orchestrator";

// A FlowRegistry is a map of flow name -> registration.
const registry: FlowRegistry = {
  /* checkout: { ...flow registration... } */
};
const orchestrator = new StepOrchestrator(registry);
```

## Documentation

The orchestrator executes registered flows; it is not the durable Blueprint
worker, Sense reconciler, or DPP participant scheduler. Hosts still decide
which effects may run. See the [kernel guide](../kernel/README.md) for the
effect seam and [Blueprint guide](../blueprint/README.md) for worker hosting.

## License

MIT
