// The transport-free tool IMPLEMENTATIONS that do not need a live runtime. These are the pure
// authoring/validation tools: manifest/document/spec come in as JSON args and JSON comes back out.
// Projections decide whether these appear in ControlFace, AgentFace, or some other filtered view.

import { describeCatalog, namespaces, effects } from "./catalog";
import { validateDocument, lint, authorDocument } from "./document";
import { validateCapability } from "./capability";
import { describeInteractions, validateInteraction } from "./interaction";
import { validatePresentation } from "./presentation";
import { validateIntent, intentToEdits } from "./intent";
import type { McpTool } from "../tool-surface";

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const any = { type: "object" } as const;

// Every authoring tool is design-time and pure (JSON in, JSON out), so all are agent-safe.
const platformAuthoringTools: McpTool[] = [
  {
    name: "describeCatalog",
    description: "Project a manifest into a discovery catalog (capabilities, namespaces, effects).",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => describeCatalog(a.manifest),
  },
  {
    name: "namespaces",
    description: "List the state namespaces a manifest declares.",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => namespaces(a.manifest),
  },
  {
    name: "effects",
    description: "List the external effect handlers a manifest declares.",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => effects(a.manifest),
  },
  {
    name: "validateDocument",
    description: "Dry-run validate a UI document against a manifest (structure + reference lint).",
    inputSchema: obj({ manifest: any, document: any }, ["manifest", "document"]),
    handler: (a) => validateDocument(a.manifest, a.document),
  },
  {
    name: "lintDocument",
    description: "Lint a UI document's references against a manifest (non-throwing warnings only).",
    inputSchema: obj({ manifest: any, document: any }, ["manifest", "document"]),
    handler: (a) => lint(a.manifest, a.document),
  },
  {
    name: "authorDocument",
    description: "Validate then commit a UI document, returning a wire message or a shaped error.",
    inputSchema: obj({ document: any, manifest: any }, ["document"]),
    handler: (a) => authorDocument(a.document, a.manifest as never),
  },
  {
    name: "validateCapability",
    description: "Validate a capability DEFINITION (leaf track); optional registry view enables render/floor checks.",
    inputSchema: obj({ capability: any, registryView: any }, ["capability"]),
    handler: (a) => validateCapability(a.capability, a.registryView as never),
  },
  {
    name: "describeInteractions",
    description: "List the interaction taxonomy (every kind with its facets) — vocabulary discovery.",
    inputSchema: obj({}),
    handler: () => describeInteractions(),
  },
  {
    name: "validateInteraction",
    description: "Validate an InteractionSpec (kind known, subject present, facet/data references).",
    inputSchema: obj({ spec: any }, ["spec"]),
    handler: (a) => validateInteraction(a.spec),
  },
  {
    name: "validatePresentation",
    description: "Validate a Presentation DSL artifact (structure + the required-facet-survives invariant).",
    inputSchema: obj({ spec: any }, ["spec"]),
    handler: (a) => validatePresentation(a.spec),
  },
  {
    name: "validateIntent",
    description: "Validate an IntentSpec; when an interaction is supplied, check targets against its facets.",
    inputSchema: obj({ intent: any, interaction: any }, ["intent"]),
    handler: (a) => validateIntent(a.intent, a.interaction as never),
  },
  {
    name: "intentToEdits",
    description: "Project an IntentSpec into PresentationEdits (the sanctioned override channel).",
    inputSchema: obj({ intent: any }, ["intent"]),
    handler: (a) => intentToEdits(a.intent as never),
  },
];

export const authoringTools: McpTool[] = platformAuthoringTools.map((t) => ({ ...t, agentSafe: true }));
