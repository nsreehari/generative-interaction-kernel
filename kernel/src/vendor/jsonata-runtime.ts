// @ts-ignore -- vendored CommonJS bundle ships no type declarations.
import * as jsonataModule from "./jsonata.cjs";

const factory = (jsonataModule as { default?: unknown }).default
  ?? (globalThis as typeof globalThis & { jsonata?: unknown }).jsonata;

export default factory;