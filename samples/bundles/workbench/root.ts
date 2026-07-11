// The workbench is a `native-root` bundle: this shim re-exports its React root under the conventional
// `Root` name the host's bundle registry discovers by globbing `bundles/*/root.ts`. Keeping the shim
// here (beside the composition) is what lets the registry stay data-driven — no per-bundle import list.
export { WorkbenchRoot as Root } from "./Workbench";
