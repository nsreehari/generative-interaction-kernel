// Narrow service-infrastructure surface: QueueFace/DefaultServiceHost/service-kinds only, without the
// agent tool catalogs (`fullCatalogTools`/`controlFaceTools`) or MCP dispatcher/tool-surface types that
// the root "." entry also bundles. Consumers that only need to construct/drive a service host (not
// expose an agent-facing tool catalog) should import from here to avoid loading that unrelated surface.
export * from "../../../face/src/services/queueface";
export * from "../../../face/src/services/service-host";
export * from "../../../face/src/services/service-kinds";
