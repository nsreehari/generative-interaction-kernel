# gik-provider-blueprint-authoring

Blueprint-authoring provider engine for the **Generative Interaction Kernel**. Builds an authoring
registry and summarizes canonical blueprints for authoring workflows.

`summarizeBlueprint` exposes the four canonical lowering collections:
`serviceTiers`, `serviceRecipes`, `projectionTiers`, and `projectionRecipes`.
It does not emit the removed combined `tiers` or `recipes` fields.

When authoring native services, put concrete non-secret kind configuration on
the named Blueprint service declaration. This includes endpoints and opaque
`credentialRef` values. Service kinds define the config schema, while the host
authorizes endpoints and resolves literal secrets; never author a key, token,
or password into Blueprint data.

```bash
npm install gik-provider-blueprint-authoring
```

```ts
import {
  blueprintAuthoringFlow,
  createBlueprintAuthoringRegistry,
  summarizeBlueprint,
} from "gik-provider-blueprint-authoring";
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) (§14 · Provider engines &
building blocks) and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
