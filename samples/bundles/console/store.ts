// The console's DOMAIN: types, seed data, pure validation, and its named effect handlers.
//
// Under the "everything is JSON" model the console has no bespoke Orchestrator class. Its UI is a
// JSON document composed from shared primitives; its consequential operations are registered
// NATIVE effect handlers (create/save/validate/promote a profile) that the shared effect
// dispatcher routes `invoke("<name>")` to. Each handler reads the live store (the kernel applies
// reducer ops before effects run) and returns store deltas — the reducer stays pure. Only genuinely
// effectful/derived logic lives here in code; everything above it is data.

import { type Json } from "../../../kernel/src/index";
import {
  buildPlaygroundBundle,
  setOp,
  type EffectContext,
  type EffectHandlerMap,
  type SerializableBundle,
} from "../../../adapters/react/src/index";

// ---- Domain types ----------------------------------------------------------------

export type ProfileStatus = "draft" | "active";

export interface Profile {
  id: string;
  name: string;
  description: string;
  status: ProfileStatus;
  version: string;
  capabilities: string[];
  updatedAt: string;
}

export interface Draft {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
}

export interface Version {
  version: string;
  status: ProfileStatus;
  capturedAt: string;
  capabilityCount: number;
}

export interface ValidationResult {
  status: "unknown" | "ok" | "error";
  errors: string[];
  warnings: string[];
}

export type ConsoleTab = "editor" | "validation" | "preview" | "versions";

const EMPTY_DRAFT: Draft = { id: "", name: "", description: "", capabilities: [] };

// ---- Timestamps -------------------------------------------------------------------

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ---- Pure validation --------------------------------------------------------------

// A capability name must be a lowerCamel / alnum identifier (mirrors how manifest keys look).
const CAP_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** Validate a draft profile. Pure: (draft) -> result. Errors block promotion; warnings don't. */
export function validateDraft(draft: Draft): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!draft.name.trim()) errors.push("Profile name is required.");
  if (draft.capabilities.length === 0) {
    errors.push("A profile needs at least one capability.");
  }

  const seen = new Set<string>();
  for (const cap of draft.capabilities) {
    if (!CAP_NAME.test(cap)) errors.push(`Capability '${cap}' is not a valid identifier.`);
    if (seen.has(cap)) warnings.push(`Capability '${cap}' is listed more than once.`);
    seen.add(cap);
  }

  if (!draft.description.trim()) warnings.push("A description helps others adopt this profile.");

  return { status: errors.length > 0 ? "error" : "ok", errors, warnings };
}

// ---- Store read helpers -----------------------------------------------------------

function readProfiles(ctx: EffectContext): Profile[] {
  const v = ctx.get("console.profiles");
  return Array.isArray(v) ? (v as unknown as Profile[]) : [];
}

function readDraft(ctx: EffectContext): Draft {
  const v = ctx.get("console.draft");
  return v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as Draft) : { ...EMPTY_DRAFT };
}

function readStr(ctx: EffectContext, path: string): string {
  const v = ctx.get(path);
  return v == null ? "" : String(v);
}

function draftOf(p: Profile): Draft {
  return { id: p.id, name: p.name, description: p.description, capabilities: [...p.capabilities] };
}

function bumpPatch(version: string): string {
  const parts = version.split(".").map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join(".");
}

function slugify(name: string, taken: Set<string>): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// ---- Preview / Playground bundles (composition) -----------------------------------

// The Preview and Playground surfaces are BUNDLES the console embeds via the `bundle` primitive.
// There is ONE shared builder (`buildPlaygroundBundle` in the floor): Preview is simply its
// read-only `"preview"` mode, and the Playground tab is its `"interactive"` mode. Both are derived
// from the same draft, so authoring a capability updates both embedded runtimes live — proving
// bundle-in-bundle composition and that "Preview is a variant of the Playground".
export function buildPreviewBundle(draft: Draft): SerializableBundle {
  return buildPlaygroundBundle({ name: draft.name, capabilities: draft.capabilities, mode: "preview" });
}

export function buildProfilePlaygroundBundle(draft: Draft): SerializableBundle {
  return buildPlaygroundBundle({ name: draft.name, capabilities: draft.capabilities, mode: "interactive" });
}

// The two embedded surfaces rebuilt together whenever the draft changes.
const surfaceOps = (draft: Draft) => [
  setOp("console.previewBundle", buildPreviewBundle(draft) as unknown as Json),
  setOp("console.playgroundBundle", buildProfilePlaygroundBundle(draft) as unknown as Json),
];

function versionsFor(profile: Profile | undefined): Version[] {
  if (!profile) return [];
  return [
    {
      version: profile.version,
      status: profile.status,
      capturedAt: profile.updatedAt,
      capabilityCount: profile.capabilities.length,
    },
  ];
}

// ---- Named effect handlers --------------------------------------------------------

// The console's consequential operations. The shared effect dispatcher routes each
// `invoke("<name>")` from the JSON document to the matching handler; the handler reads the live
// store and returns store deltas the kernel applies (one dispatch, one rev). No Orchestrator class.
export const consoleEffects: EffectHandlerMap = {
  loadProfile(ctx) {
    const id = String(ctx.payload.id ?? "");
    const profile = readProfiles(ctx).find((p) => p.id === id);
    if (!profile) return { ops: [setOp("console.toast", `Profile '${id}' not found.`)] };
    const draft = draftOf(profile);
    return {
      ops: [
        setOp("console.selectedId", id),
        setOp("console.draft", draft as unknown as Json),
        setOp("console.validation", { status: "unknown", errors: [], warnings: [] } as unknown as Json),
        setOp("console.versions", versionsFor(profile) as unknown as Json),
        setOp("console.tab", "editor"),
        setOp("console.newCapName", ""),
        setOp("console.toast", ""),
        ...surfaceOps(draft),
      ],
    };
  },

  createProfile(ctx) {
    const name = readStr(ctx, "console.newName").trim();
    if (!name) return { ops: [setOp("console.toast", "Enter a name to create a profile.")] };
    const profiles = readProfiles(ctx);
    const id = slugify(name, new Set(profiles.map((p) => p.id)));
    const profile: Profile = {
      id,
      name,
      description: "",
      status: "draft",
      version: "0.1.0",
      capabilities: [],
      updatedAt: nowStamp(),
    };
    const draft = draftOf(profile);
    return {
      ops: [
        setOp("console.profiles", [profile, ...profiles] as unknown as Json),
        setOp("console.selectedId", id),
        setOp("console.draft", draft as unknown as Json),
        setOp("console.validation", { status: "unknown", errors: [], warnings: [] } as unknown as Json),
        setOp("console.versions", [] as unknown as Json),
        setOp("console.tab", "editor"),
        setOp("console.newName", ""),
        setOp("console.newCapName", ""),
        setOp("console.toast", `Created '${name}'.`),
        ...surfaceOps(draft),
      ],
    };
  },

  saveDraft(ctx) {
    const draft = readDraft(ctx);
    if (!draft.id) return { ops: [setOp("console.toast", "Select or create a profile first.")] };
    const next = readProfiles(ctx).map((p) =>
      p.id === draft.id
        ? {
            ...p,
            name: draft.name,
            description: draft.description,
            capabilities: [...draft.capabilities],
            status: "draft" as ProfileStatus,
            updatedAt: nowStamp(),
          }
        : p
    );
    return {
      ops: [setOp("console.profiles", next as unknown as Json), setOp("console.toast", "Draft saved.")],
    };
  },

  addCapability(ctx) {
    const name = readStr(ctx, "console.newCapName").trim();
    const draft = readDraft(ctx);
    if (!draft.id) return { ops: [setOp("console.toast", "Select or create a profile first.")] };
    if (!name) return { ops: [setOp("console.toast", "Enter a capability name.")] };
    if (draft.capabilities.includes(name)) {
      return { ops: [setOp("console.newCapName", ""), setOp("console.toast", `'${name}' already added.`)] };
    }
    const nextDraft: Draft = { ...draft, capabilities: [...draft.capabilities, name] };
    return {
      ops: [
        setOp("console.draft", nextDraft as unknown as Json),
        setOp("console.newCapName", ""),
        setOp("console.toast", ""),
        ...surfaceOps(nextDraft),
      ],
    };
  },

  removeCapability(ctx) {
    const name = String(ctx.payload.value ?? ctx.payload.name ?? "");
    const draft = readDraft(ctx);
    const nextDraft: Draft = { ...draft, capabilities: draft.capabilities.filter((c) => c !== name) };
    return {
      ops: [setOp("console.draft", nextDraft as unknown as Json), ...surfaceOps(nextDraft)],
    };
  },

  validateProfile(ctx) {
    const result = validateDraft(readDraft(ctx));
    return {
      ops: [
        setOp("console.validation", result as unknown as Json),
        setOp("console.tab", "validation"),
        setOp(
          "console.toast",
          result.status === "ok" ? "Validation passed." : `Validation found ${result.errors.length} error(s).`
        ),
      ],
    };
  },

  promoteProfile(ctx) {
    const draft = readDraft(ctx);
    if (!draft.id) return { ops: [setOp("console.toast", "Select or create a profile first.")] };
    // Promotion requires a clean validation — enforced here, not trusted from the UI.
    const result = validateDraft(draft);
    if (result.status !== "ok") {
      return {
        ops: [
          setOp("console.validation", result as unknown as Json),
          setOp("console.tab", "validation"),
          setOp("console.toast", "Fix validation errors before promoting."),
        ],
      };
    }
    const profiles = readProfiles(ctx);
    const current = profiles.find((p) => p.id === draft.id);
    const nextVersion = bumpPatch(current?.version ?? "0.1.0");
    const next = profiles.map((p) =>
      p.id === draft.id
        ? {
            ...p,
            name: draft.name,
            description: draft.description,
            capabilities: [...draft.capabilities],
            status: "active" as ProfileStatus,
            version: nextVersion,
            updatedAt: nowStamp(),
          }
        : p
    );
    const promoted = next.find((p) => p.id === draft.id)!;
    const versions = [
      {
        version: nextVersion,
        status: "active" as ProfileStatus,
        capturedAt: nowStamp(),
        capabilityCount: draft.capabilities.length,
      },
      ...versionsFor(current),
    ];
    return {
      ops: [
        setOp("console.profiles", next as unknown as Json),
        setOp("console.versions", versions as unknown as Json),
        setOp("console.draft", draftOf(promoted) as unknown as Json),
        setOp("console.tab", "versions"),
        setOp("console.toast", `Promoted to v${nextVersion} (active).`),
      ],
    };
  },
};
