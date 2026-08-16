# @gik/transport-http-sse

HTTP + Server-Sent Events transport for **Generative Interaction Kernel** projections. It carries the
render/patch stream (or a tool projection) between an authoritative host and a remote renderer; it never
decides capability policy.

```bash
npm install @gik/transport-http-sse
```

```ts
import { SseTransportServer } from "@gik/transport-http-sse/server";
import { GIKClient } from "@gik/kernel";
```

## Subpath exports

| Import | Purpose |
|---|---|
| `@gik/transport-http-sse/server` | Server-side SSE transport (`SseTransportServer`). |
| `@gik/transport-http-sse/client` | Client-side connector. |
| `@gik/transport-http-sse/codec` | Wire codec for GIK envelopes. |

## Boundary

This package transports authorized messages and committed updates. It does not
select tools, grant capabilities, own credentials, or execute application
effects.

## License

MIT
