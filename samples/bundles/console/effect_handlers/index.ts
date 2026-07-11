// The console's named effect handlers, as the standard bundle `effect_handlers/` directory. The host
// registry discovers a json bundle's handlers by this convention: `<id>/effect_handlers/index` whose
// DEFAULT export is the bundle's EffectHandlerMap.
//
// The console's handlers are a cohesive domain unit — they all share the same validation and store
// helpers — so the map stays defined beside that code in ../store rather than split one file per name.
// This index is just the convention entry point that re-exports it.
export { consoleEffects as default } from "../store";
