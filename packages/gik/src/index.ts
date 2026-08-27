/**
 * `gik` — batteries-included entry point for the Generative Interaction Kernel.
 *
 * This is a thin meta-package: it has no code of its own, it re-exports the core
 * `@gik-ai/*` packages under stable namespaces so newcomers can `npm i gik` and reach
 * the common surface from a single import. Real consumers should depend on the
 * individual `@gik-ai/*` packages directly for the leanest install and dependency graph.
 *
 * @example
 *   import { kernel, react } from "gik";
 *   const k = new kernel.Kernel(config);
 */
export * as kernel from "@gik-ai/kernel";
export * as evaluators from "@gik-ai/evaluators";
export * as react from "@gik-ai/react";
export * as agentface from "@gik-ai/agentface";
export * as controlface from "@gik-ai/controlface";
export * as transportHttpSse from "@gik-ai/transport-http-sse";
export * as transportMcpHttp from "@gik-ai/transport-mcp-http";
