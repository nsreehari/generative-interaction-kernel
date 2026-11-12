# gik-provider-blueprint-authoring

Private workspace Blueprint-authoring provider engine for the **Generative Interaction Kernel**. Builds an authoring
registry and summarizes canonical blueprints for authoring workflows.

This package is not published by the core release workflow. The import below
is for workspace development, not a public npm installation contract. Public
artifact validation and materialization belong to `gik-blueprint`.

`summarizeBlueprint` exposes the four canonical lowering collections:
`serviceTiers`, `serviceRecipes`, `projectionTiers`, and `projectionRecipes`.
It does not emit the removed combined `tiers` or `recipes` fields.

When authoring native services, put concrete non-secret kind configuration on
the named Blueprint service declaration. This includes endpoints and opaque
`credentialRef` values. Service kinds define the config schema, while the host
authorizes endpoints and resolves literal secrets; never author a key, token,
or password into Blueprint data.

```ts
import {
  blueprintAuthoringFlow,
  createBlueprintAuthoringRegistry,
  summarizeBlueprint,
} from "gik-provider-blueprint-authoring";
```

## Documentation

`summarizeBlueprint` reports identity and lowering collections, not a full
serialization of Cells or DPP manifests. An authoring plan is not a validated
artifact or permission to apply it. Use the
[Blueprint package guide](../blueprint/README.md) for the canonical artifact
contract and the [lifecycle guide](../agent-lifecycle-exp/README.md) for proposals.

## License

MIT
