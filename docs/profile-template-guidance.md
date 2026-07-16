# Profile Template Guidance

This note records the current boundary between `profile-template` data and per-profile authored
data in the GenUI sample profiles.

## Template-Owned Today

- Shared taxonomy and other reusable resources referenced through `profile-template`.
- Cross-profile vocabularies that are consumed explicitly as resources rather than merged into a
  profile's authored structure.

The current `genui` template is correctly narrow: it provides shared resources, and profiles opt
into those resources by declaring `"profile-template": "genui"`.

## Good Candidates To Move Later

- Shared interaction-policy data such as common rank / priority / cap defaults, but only if it is
  introduced as an explicit template-owned resource.
- Shared runtime mapping vocabularies such as common role-to-capability defaults, again only if the
  profile consumes them explicitly as data.

These are good candidates because both sample profiles currently duplicate parts of that policy,
but they should move only through an explicit resource seam, not implicit template/profile merging.

## Keep Local Even If Duplicated

- Profile structure: `layers`, `recipes`, `kind`, and version.
- Profile-specific authoring input such as the `live-cards` interaction input form.
- Layout strategy and planner behavior that materially differs per profile.
- Runtime behavior tied to profile-specific named regions or profile-specific fallback rendering.

## Migration Rule

- If a concern is provided by a template, consumers should use it from the template.
- If a concern is not exposed through an explicit template-owned resource, keep it fully local.
- Do not introduce implicit structural merging between template data and local profile artifacts.

## Current Boundary

The executable GenUI interpreter now lives in `@gik/profile`, and the template-owned data lives in
`profile/profile-templates/*` and is exposed through the `@gik/profile` template resource APIs.

That means further cleanup should follow one rule:

- move reusable declarations into explicit template-owned resources
- move reusable interpreter mechanisms into `@gik/profile`
- keep sample folders limited to authored sample profile and recipe artifacts