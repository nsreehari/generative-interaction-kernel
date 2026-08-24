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

The package also owns the shared declarative form contract used by
`primitive:form` and Blueprint `contextFormSpec` declarations. Use
`validateDeclarativeFormValues` to enforce the field schema and its
declarative validators, and `resolveDeclarativeFormInitialValue` to combine
field defaults, form defaults, and caller-provided values.

## Exported API

### JSONata evaluation

- `evalSyncJsonata(expr, data, bindings?)` evaluates one JSONata expression
  synchronously, returns plain JSON, and converts an `undefined` result to
  `null`.
- `evalAsyncJsonata(expr, data, bindings?)` is the asynchronous equivalent and
  applies the same plain-JSON and `undefined`-to-`null` normalization.
- `validateJsonataExpression(expr, options?)` validates one expression and
  returns `{ ok, error? }`. `options.mode` accepts `"full"` or `"safe"` and
  defaults to `"full"`.

### Sequential step execution

- `type SyncJsonataStep = { expr: string; writeTo: string }`
- `type ExecuteSyncJsonataStepsInput = { steps: readonly SyncJsonataStep[];
  data: Json; bindings?: Record<string, Json>; returnKeys?: readonly string[]
  }`
- `type ExecuteSyncJsonataStepsOutput = Record<string, Json>`
- `executeSyncJsonataSteps(input)` evaluates `steps` in declaration order
  against the same `data` value, exposes each step result to later steps under
  `writeTo`, and returns either the whole environment or only the requested
  `returnKeys`.
- The companion schema exports are `syncJsonataStepSchema`,
  `executeSyncJsonataStepsInputSchema`, and
  `executeSyncJsonataStepsOutputSchema`.

### Cell evaluation

- `evaluateCell(input)` validates the supplied Cell, resolves only the tokens
  named in `systemInputs`, evaluates `compute` entries in order, and returns
  `computed`, `operations`, `outputs`, and `effects`.
- `validateCell(value)` validates one Cell definition and reports Cell-specific
  errors and warnings.
- `validateTier(value)` validates one standalone Tier definition.
- `validateServiceRecipe(value)` validates one standalone service-axis lowering recipe
  (`implementationPrograms` + `implementationFallback`).
- `validateProjectionRecipe(value)` validates one standalone projection-axis lowering recipe
  (`representations` + `fallback`).

### Declarative validators

- `runDeclarativeValidators(rawValidators, value, options?)` normalizes the
  recognized validator entries, ignores malformed or unrecognized entries, runs
  recognized validators in declaration order, and returns `{ ok, errors,
  warnings }`.
- Supported validator kinds:
  - `jsonata` — evaluates a JSONata predicate and passes only when the result
    is exactly `true`.
  - `ajv-schema` — validates the value against a JSON Schema, with optional
    referenced schemas.
  - `jsonata-expression` — checks that the value is a string containing a
    valid JSONata expression.
  - `typedef` — checks whether the value matches one or more JSON value kinds.
  - `blueprint-cell` — validates one Blueprint Cell document.
  - `blueprint-tier` — validates one Blueprint Tier document.
  - `blueprint-service-recipe` — validates one service-axis lowering recipe
    document.
  - `blueprint-projection-recipe` — validates one projection-axis lowering recipe
    document.
  - `blueprint` — validates one Blueprint document, including its embedded
    Cells and both axes' recipes.

### System-input helpers

- `systemInputTokens`, `SystemInputToken`, `systemInputDefinitions`,
  `SystemInputContext`, and `SystemInputDefinition` describe the exported
  system-input registry. The current token is `numSourcesRunning`.
- `isSystemInputToken(value)` checks whether a string is a supported
  system-input token.
- `resolveSystemInputs(tokens, context)` resolves the requested token values
  for one Cell evaluation context.
- `systemInputRuntimeExpression(token, cellId)` returns the runtime expression
  string for one supported token and Cell id.

### Declarative form helpers

- `validateDeclarativeFormValues(fields, values, options?)` validates form
  values against the field-derived JSON Schema and then runs any declarative
  validators attached to `fields`.
- `resolveDeclarativeFormInitialValue(spec, value?)` merges field defaults,
  `spec.initialValue`, and caller-provided values in that order.

## Included schemas

The package publishes its supported JSON schemas through
`@gik/evaluators/schemas/*`. Consumers may load those files directly without
depending on repository-relative paths.

`blueprint.schema.json` requires `serviceTiers`, `serviceRecipes`,
`projectionTiers`, and `projectionRecipes` and rejects the removed `tiers` and
`recipes` fields. `lowering-recipe.schema.json` publishes strict
`serviceRecipe` and `projectionRecipe` definitions; neither dialect accepts the
other axis' fields.

## Package boundary

`@gik/evaluators` evaluates and validates declarative data. It does not own
runtime state, execute effects, render UI, or choose host policy. Those
responsibilities remain with `@gik/kernel` and the embedding host.

## License

MIT
