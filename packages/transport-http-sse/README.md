# gik-transport-http-sse

HTTP + Server-Sent Events transport for **Generative Interaction Kernel** projections. It carries the
render/patch stream (or a tool projection) between an authoritative host and a remote renderer; it never
decides capability policy.

```bash
npm install gik-transport-http-sse
```

```ts
import { SseTransportServer } from "gik-transport-http-sse/server";
import { GIKClient } from "gik-kernel";
```

## Subpath exports

| Import | Purpose |
|---|---|
| `gik-transport-http-sse` | Browser-safe client and codec exports; does not load the Node server. |
| `gik-transport-http-sse/server` | Server-side SSE transport (`SseTransportServer`). |
| `gik-transport-http-sse/client` | Client-side connector. |
| `gik-transport-http-sse/codec` | Wire codec for GIK envelopes. |

## Boundary

This package transports authorized messages and committed updates. It does not
select tools, grant capabilities, own credentials, or execute application
effects.

An SSE render stream is not a Blueprint Sense binding. Provider-specific
observation transports must enter through authorized service observation and
durable event admission, not by treating arbitrary client messages as trusted
Signals. See [Cell Senses](https://github.com/nsreehari/generative-interaction-kernel/blob/master/docs/senses.md).

## License

MIT
