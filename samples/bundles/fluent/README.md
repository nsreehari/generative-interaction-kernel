# Fluent projection provider

This provider supplies Fluent UI-specific projection views without adding framework-branded controls
to the platform floor. It is discovered by the host's projection-view provider resolver but is not
listed in `samples/bundles/registry.json`, so it is not a mountable or switcher-visible app bundle.

Import controls through a manifest alias:

```json
{
  "externals": {
    "projectionViews": {
      "fluent": { "from": "fluent", "use": ["dropdown", "switch", "toggle"] }
    }
  }
}
```

Both `fluent:switch` and `fluent:toggle` accept `value`, `onValue`, `offValue`, `onLabel`,
`offLabel`, and `disabled`. `fluent:toggle` also accepts a CSS `minWidth` number or string so labels
can change without shifting adjacent controls. Both emit `toggle` with the next
`{ "checked": boolean, "value": string }`.

`fluent:dropdown` accepts `value`, `options` (`{ value, label, disabled? }[]`), `placeholder`, and
`ariaLabel`. It emits `select` with `{ "value": string, "label": string }`.