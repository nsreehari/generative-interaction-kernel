/**
 * `gik` — batteries-included entry point for the Generative Interaction Kernel.
 *
 * This is a thin meta-package: it has no code of its own, it re-exports the core
 * `gik-*` packages under stable namespaces so newcomers can `npm i gik` and reach
 * the common surface from a single import. Real consumers should depend on the
 * individual `gik-*` packages directly for the leanest install and dependency graph.
 *
 * @example
 *   import { kernel, react } from "gik";
 *   const k = new kernel.Kernel(config);
 */
export * as kernel from "gik-kernel";
export * as evaluators from "gik-evaluators";
export * as react from "gik-react";
export * as agentface from "gik-agentface";
export * as controlface from "gik-controlface";
export * as transportHttpSse from "gik-transport-http-sse";
export * as transportMcpHttp from "gik-transport-mcp-http";
