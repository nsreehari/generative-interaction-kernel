# @gik/evaluators

JSONata-based Cell evaluation and declarative validation for the Generative
Interaction Kernel.

```bash
npm install @gik/evaluators @gik/kernel
```

Use this package when a host needs to evaluate Cell inputs, derive system
inputs, or validate declarative values before they enter a GIK runtime.

```ts
import { evaluateCell, runDeclarativeValidators } from "@gik/evaluators";
```

## Included schemas

The package publishes its supported JSON schemas through
`@gik/evaluators/schemas/*`. Consumers may load those files directly without
depending on repository-relative paths.

## Package boundary

`@gik/evaluators` evaluates and validates declarative data. It does not own
runtime state, execute effects, render UI, or choose host policy. Those
responsibilities remain with `@gik/kernel` and the embedding host.

## License

MIT
