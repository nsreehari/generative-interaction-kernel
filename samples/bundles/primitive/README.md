# Primitive component projection provider

This bundle exposes the domain-neutral rendering and interaction mechanics from
`@gik/components/primitives`. Its projection views and capability descriptors come from the same
package definitions, so the provider cannot drift from the public component contracts.

Import only the primitives a vocabulary uses:

```json
{
  "externals": {
    "projectionViews": {
      "primitive": {
        "from": "primitive",
        "use": ["chart", "growing-container", "timer-button"]
      }
    }
  }
}
```

Documents reference the imported capabilities as `primitive:chart` and
`primitive:growing-container`, or `primitive:timer-button`.