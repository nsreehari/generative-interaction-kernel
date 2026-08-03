# Fluent projection provider

This provider exposes `fluentComponentViews` from `@gik/components/fluent` without adding
framework-branded controls to the platform floor. The package owns each renderer, schema,
description, event contract, agent guidance, validator, and trial materializer. The provider is
discovered by the host's projection-view resolver but is not a mountable application.

Import controls through a manifest alias:

```json
{
  "externals": {
    "projectionViews": {
      "fluent": { "from": "fluent", "use": ["button", "chips", "data-grid", "dropdown", "list", "searchbox", "switch", "tab-bar", "table", "text-field", "textarea", "toggle"] }
    }
  }
}
```

Both `fluent:switch` and `fluent:toggle` accept `value`, `onValue`, `offValue`, `onLabel`,
`offLabel`, and `disabled`. Both emit `toggle` with the next
`{ "checked": boolean, "value": string }`.

`fluent:dropdown` accepts `value`, `options` (`{ value, label, disabled? }[]`), `placeholder`, and
`ariaLabel`. It emits `select` with `{ "value": string, "label": string }`.

`fluent:button` accepts `label`, `icon`, `appearance`, `shape`, `size`, `ariaLabel`, and `disabled`.
Its closed variants are `action`, `primary`, `subtle`, `icon`, `circular`, `floating`, and `inline`;
each maps only to native Fluent button props. Icon-only variants require `icon` and `ariaLabel`.
It emits `press`.

`fluent:text-field` and `fluent:textarea` accept `value`, `label`, `placeholder`, `required`, and
`disabled`; text fields also accept `secret`, and textareas accept `rows`. Both emit `input` with
`{ "value": string }`.

`fluent:searchbox` accepts `value`, `label`, `placeholder`, `ariaLabel`, `required`, and `disabled`.
It emits `submit` with `{ "value": string }` when its form is submitted.

`fluent:tab-bar` accepts `active`, `ariaLabel`, `disabled`, and `options`
(`{ value, label, disabled? }[]`). It emits `select` with `{ "value": string }`.

`fluent:chips` accepts `ariaLabel`, `disabled`, and `items` (`{ value, label, disabled? }[]`). It
emits `remove` with `{ "value": string }` when a Fluent tag is dismissed.

`fluent:list` accepts `items` (`{ value, label, disabled? }[]`), optional `selectionMode`, and
controlled `selectedValues`. It emits `select` with `{ "values": string[] }`.

`fluent:table` accepts explicit `columns` (`{ id, label }[]`) and `rows`
(`{ id, cells }[]`) for read-only tabular display. Cell values are JSON scalars.

`fluent:data-grid` uses the same explicit column and row contracts, with optional controlled
selection and sort state. It emits `select` with `{ "rowIds": string[] }` and `sort` with
`{ "columnId": string, "direction": "ascending" | "descending" }`. Fluent React v9 has no
control named Datasheet; `data-grid` is the canonical interactive tabular control.