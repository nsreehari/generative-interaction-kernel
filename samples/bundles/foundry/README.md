# Foundry projection provider

This provider supplies Foundry-specific UI without coupling projection views to the headless
`foundry-agent` service kind or adding provider-specific controls to the platform floor. It is
discovered by the host projection-provider resolver but is not a mountable application.

Import the access gate explicitly:

```json
{
  "externals": {
    "projectionViews": {
      "foundry": { "from": "foundry", "use": ["access-gate"] }
    }
  }
}
```

`foundry:access-gate` reads a non-secret `status` and `error`, emits `accessRequested` and
`accessCleared`, and renders its children only when access is ready. Dismissing its credential dialog
collapses it to an inline message with an **Enter Access Key** action.