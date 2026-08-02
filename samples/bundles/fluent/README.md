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
      "fluent": { "from": "fluent", "use": ["button", "chips", "dropdown", "icon-button", "searchbox", "switch", "tab-bar", "text-field", "textarea", "toggle"] }
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

`fluent:icon-button` accepts `icon` (`edit`, `full-screen-maximize`, or `full-screen-minimize`), `ariaLabel`,
`title`, and `disabled`. It emits `press`.

`fluent:button` accepts `label`, `appearance`, `ariaLabel`, and `disabled`. It emits `press`.

`fluent:text-field` and `fluent:textarea` accept `value`, `label`, `placeholder`, `required`, and
`disabled`; text fields also accept `secret`, and textareas accept `rows`. Both emit `input` with
`{ "value": string }`.

`fluent:searchbox` accepts `value`, `label`, `placeholder`, `ariaLabel`, `required`, and `disabled`.
It emits `submit` with `{ "value": string }` when its form is submitted.

`fluent:tab-bar` accepts `active`, `ariaLabel`, `disabled`, and `options`
(`{ value, label, disabled? }[]`). It emits `select` with `{ "value": string }`.

`fluent:chips` accepts `ariaLabel`, `disabled`, and `items` (`{ value, label, disabled? }[]`). It
emits `remove` with `{ "value": string }` when a Fluent tag is dismissed.