# Semantic component projection provider

This bundle exposes the domain-neutral information structures from `@gik/components/semantic`.
Domain meaning remains in the consuming vocabulary, document, data mappings, and behavior graph.
The bundle's projection views and capability descriptors derive from the same public definitions.

Import only the semantic structures a vocabulary uses:

```json
{
  "externals": {
    "projectionViews": {
      "semantic": {
        "from": "semantic",
        "use": ["event-series", "process", "semantic-graph"]
      }
    }
  }
}
```

Documents reference the imported capabilities as `semantic:event-series`, `semantic:process`, and
`semantic:semantic-graph`.