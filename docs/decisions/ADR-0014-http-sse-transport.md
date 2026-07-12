# ADR-0014: Concrete transport binding — HTTP + SSE, kept out of the portable core

**Status:** Accepted

## Context

[ADR-0010](ADR-0010-transport-seam.md) defined the transport seam and shipped an in-memory reference
pair; [ADR-0012](ADR-0012-reconnection.md) made the host a broker with resume-aware onboarding. Open
item #7 still lacked a *concrete network* transport and a way to convey `fromRev` across the wire. The
first onboarding profile already uses SSE, so a Server-Sent-Events binding is the natural first real
transport.

## Decision

Add an HTTP/SSE binding as a **separate package folder** (`transports/http-sse/`), not in the kernel
core:

- **Direction split fits SSE's shape.** SSE is one-directional (server → client), and GIK's
  host → client traffic (`manifest`/`document`/`patch`/`trace`) is exactly that. The client → host
  direction (only `event`) is a plain **HTTP POST**. So one SSE stream + a POST endpoint carry the full
  bidirectional protocol.
- **Session correlation via a header.** On `GET {path}/stream` the server generates a session id and
  returns it as the `X-GIK-Session` response header; the client echoes it on `POST {path}/event` so the
  event routes to the right connection/endpoint. No new GIK message — correlation is transport metadata.
- **Each stream is one broker connection.** The server wraps the request/response as a
  `TransportProvider` and calls `host.attach(endpoint, fromRev?)`; `req` close triggers `detach`.
- **`fromRev` rides the query string.** `GET {path}/stream?fromRev=N` maps straight onto the broker's
  resume path — a reconnecting client gets an incremental patch replay instead of a full re-onboard.
  This closes the "convey `fromRev` over the transport" part of #7.
- **Pure codec, separately tested.** SSE framing (`encodeSseFrame` / `SseFrameParser`) is socket-free
  and unit-tested, including frames split across byte-chunks and ignored heartbeat comments.
- **The runtime is unchanged.** `GIKClient` and `KernelTransportHost` are used as-is; only new
  `TransportProvider` implementations were added. This is the payoff of the seam.

## Alternatives considered

- **Put the binding in `kernel/src` and re-export it from the index.** Rejected: it would pull
  `node:http`/`node:crypto` into the portable core, breaking a browser bundle that imports the kernel
  index (the client is meant to run in a renderer). Infra stays in its own folder with its own
  tsconfig, mirroring `adapters/react/`.
- **WebSocket first.** Reasonable, but the first profile already speaks SSE, and SSE needs no duplex
  upgrade — server → stream, client → POST is simpler and directly reuses the broker. WebSocket/stdio
  remain open as additional bindings behind the same seam.
- **Bidirectional over the SSE stream (long-poll tricks).** Rejected: SSE is one-directional by
  design; a POST endpoint for the single client → host message type is simpler and idiomatic.
- **A `session`/`hello` GIK message to hand out the id.** Rejected for the same reason as ADR-0012:
  correlation is a connection concern, carried as an HTTP header, not a protocol message.

## Consequences

- The platform now has a real network transport, verified end-to-end over a loopback socket: a
  `GIKClient` onboards and round-trips an event across HTTP/SSE with zero runtime changes, and a
  `?fromRev=N` stream replays only the missing patches (no manifest/document re-onboard).
- The portable core stays browser-safe: `node:http` lives only under `transports/http-sse/`.
- Open surface: additional bindings (WebSocket, stdio, in-proc), heartbeats/keep-alive tuning, auth on
  the endpoints, and session persistence across host restarts.
