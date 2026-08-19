# Portfolio Tracker New: Canonical Test Cases

Every end-to-end run starts with explicit external context:

```json
{
  "intelligence-model": "simple",
  "view": "desktop"
}
```

The test matrix covers `simple|mock|semantic` intelligence and `desktop|mobile`
presentation. Tests assert Blueprint behavior rather than generic host, lowering,
or external-context transport behavior.

## Cell contract

| Cell | Inputs | Outputs |
| --- | --- | --- |
| `portfolio-holdings` | none | `holdings` |
| `market-prices` | `holdings` | `stock-quotes` |
| `portfolio-value-cell` | `holdings`, `stock-quotes` | `portfolio-value` |
| `portfolio-intelligence` | `portfolio-value` | none |
| `portfolio-intelligence-as-of` | none | none |
| `board` | none | none |

## Behavioral cases

1. Initial holdings trigger quote retrieval, exact position/value calculation,
   intelligence generation, and board presentation.
2. Adding a holding refreshes the exact ticker set and recomputes value and
   intelligence.
3. Removing a holding removes stale quotes and positions from downstream output.
4. Rapid edits settle to the final holdings, quotes, value, and intelligence.
5. Position values, cost basis, gain/loss, and totals agree to two decimals.
6. `intelligence-model: simple` uses the existing Foundry
   `Portfolio-Intelligence-Agent` configuration.
7. `intelligence-model: mock` uses the deterministic test-service path to return
   predictable semantic-shaped intelligence for the current portfolio values.
8. `intelligence-model: semantic` uses one logical
   `portfolio-semantic-intelligence/v1` service contract and the
   `Portfolio-Semantic-Intelligence-Agent`. Provider lowering replaces that same
   service declaration with its Foundry or Copilot implementation. The request
   selects `simple-markdown` or `rich-components` through `presentationMode`;
   both modes use the same operation and agent-facing capability tools.
   The host stamps report generation time and renders it above the nested report.
9. `view: desktop` presents portfolio value as total value, holdings-value pie
   chart, and exact positions table in the desktop board arrangement.
10. `view: mobile` presents the same portfolio total and holdings-value pie chart
   without the positions table in the mobile board arrangement.
11. All six explicit context combinations preserve domain results while selecting
    the requested intelligence source and board arrangement.

The Node-host HTTP and Blueprint behavior tests use `mock` so they remain predictable
and credential-free. Selection tests verify the two Foundry configurations without
invoking them. Browser-host tests exercise editing, mock intelligence, and both
recipe-selected portfolio-value presentations through visible controls. Existing
portfolio market-price and Foundry intelligence services are reused.