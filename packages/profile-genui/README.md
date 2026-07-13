# @gik/profile-genui

Internal workspace for the current GenUI profile flavor and its transition code.

This workspace is no longer intended to be published as a separate npm package.
The target direction is to shrink this code into reusable JSON profile/template artifacts plus the
minimal irreducible runtime seams that stay inside the repo.

```ts
import {
  createProfileBundle,
  loadProfileBundle,
  validateProfileBundle,
} from "@gik/profile-genui";
```

## Documentation

See the project repository for current internal usage and migration work.

## License

MIT
