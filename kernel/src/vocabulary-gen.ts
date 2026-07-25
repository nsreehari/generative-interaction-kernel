// Manifest generation: derive a GIK manifest from an authored document. This is the inverse of the
// authoring path — given a document composed from the closed grammar (by a planner, a no-code
// builder, or an agent), walk it and emit the minimal manifest it needs: the capabilities it uses,
// the namespaces its edges touch, and the action families it invokes. This is what makes an authored
// artifact PORTABLE — export a document and its generated manifest and another host can load it.
//
// When a `catalog` of known descriptors is supplied (for example, the Blueprint's manifest), each used
// capability reuses its descriptor (propsSchema/emits/slots/dataProp) so nothing is lost; capabilities
// absent from the catalog get a permissive descriptor, so the document still validates and renders
// (unknown capabilities fall back gracefully at runtime anyway).

import type { CapabilityDescriptor, DocNode, ExecutableProgramDefinition, ProjectedVocabularyManifest } from "./types";

/** The descriptor used for a capability the document uses but the catalog doesn't describe. */
const PERMISSIVE: CapabilityDescriptor = { propsSchema: { type: "object", additionalProperties: true } };

export interface GenerateVocabularyOptions {
  /** manifest version string (default "generated/1.0"). */
  version?: string;
  /** expression dialect (default "jsonata"). */
  expression?: string;
  /** known capability descriptors to reuse for the capabilities the document uses. */
  catalog?: Record<string, CapabilityDescriptor>;
  /** namespaces to always include even if no edge references them. */
  namespaces?: string[];
}

function firstSegment(path: string): string {
  return path.split(".")[0];
}

/**
 * Derive the manifest an authored document needs by walking its closed grammar. Collects every
 * capability used (reusing catalog descriptors where available), every namespace an edge or machine
 * touches, and every action family a handler runs — the minimal, honest vocabulary the document relies on.
 */
export function generateVocabulary(doc: ExecutableProgramDefinition, opts: GenerateVocabularyOptions = {}): ProjectedVocabularyManifest {
  const capabilities: Record<string, CapabilityDescriptor> = {};
  const namespaces = new Set<string>(opts.namespaces ?? []);
  const actions = new Set<string>();

  const addNs = (path: string): void => {
    const ns = firstSegment(path);
    if (ns) namespaces.add(ns);
  };
  const addActions = (list: { do: string; target?: string }[] | undefined): void => {
    for (const a of list ?? []) {
      actions.add(a.do);
      if (a.target) addNs(a.target);
    }
  };

  const walk = (n: DocNode): void => {
    if (!(n.capability in capabilities)) {
      capabilities[n.capability] = opts.catalog?.[n.capability] ?? PERMISSIVE;
    }
    for (const path of Object.values(n.edges?.read ?? {})) addNs(path);
    for (const w of Object.values(n.edges?.write ?? {})) addNs(w.to);
    for (const list of Object.values(n.edges?.on ?? {})) addActions(list);
    for (const child of n.edges?.children ?? []) walk(child);
  };

  if (doc.root) walk(doc.root);
  for (const handler of doc.handlers ?? []) {
    for (const list of Object.values(handler.on)) addActions(list);
  }
  for (const reaction of doc.reactions ?? []) addActions(reaction.run);

  for (const m of doc.machines ?? []) {
    addNs(m.context);
    for (const st of Object.values(m.states)) {
      addActions(st.entry);
      addActions(st.exit);
      for (const t of Object.values(st.on ?? {})) {
        if (typeof t !== "string") addActions(t.actions);
      }
    }
  }

  return {
    version: opts.version ?? "generated/1.0",
    expression: opts.expression ?? "jsonata",
    namespaces: [...namespaces],
    actions: [...actions],
    capabilities,
  };
}
