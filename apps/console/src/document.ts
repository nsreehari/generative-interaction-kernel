// The console UI as a declarative GUP document — composed ENTIRELY from shared platform primitives.
//
// There are no console-specific capabilities anymore: this document uses the same fixed vocabulary
// (screen/panel/list/field/button/tabBar/chips/table/text/note/embed) that every bundle uses.
// Controls read their values from the `console` namespace (`read` edges) and report interaction back
// through `on` handlers. UI-only edits use `assignFrom`; consequential operations use `invoke`,
// which the shared effect dispatcher routes to the console's named handlers (see store.ts). The
// Preview tab embeds a nested BUNDLE via the `embed` primitive — a bundle composing a bundle.

import {
  authorDocument,
  assignFrom,
  invoke,
  node,
  unwrap,
  type DocNode,
  type DocumentMessage,
} from "../../../kernel/src/index";
import { CONSOLE_MANIFEST } from "./manifest";

const MANIFEST_VERSION = unwrap(CONSOLE_MANIFEST).version;

// --- Left rail: the profile list + create form ------------------------------------

function listRail(): DocNode {
  return node("panel", "list-rail", {
    props: { title: "Profiles", variant: "rail" },
    children: [
      node("list", "profile-list", {
        props: { idKey: "id", primaryKey: "name", badgeKey: "status", valueKey: "version" },
        read: { items: "console.profiles", selectedId: "console.selectedId" },
        on: { select: [invoke("loadProfile")] },
      }),
      node("panel", "create-panel", {
        props: { title: "New profile", variant: "inset" },
        children: [
          node("field", "new-name", {
            props: { label: "Name", placeholder: "e.g. Support Triage" },
            read: { value: "console.newName" },
            on: { input: [assignFrom("console.newName", "$event.value")] },
          }),
          node("button", "create-btn", {
            props: { label: "Create profile", tone: "primary" },
            on: { press: [invoke("createProfile")] },
          }),
        ],
      }),
    ],
  });
}

// --- Detail tabs -------------------------------------------------------------------

function editorTab(): DocNode {
  return node("panel", "editor-tab", {
    props: { variant: "tab" },
    gate: "console.tab = 'editor'",
    children: [
      node("field", "draft-name", {
        props: { label: "Name" },
        read: { value: "console.draft.name" },
        on: { input: [assignFrom("console.draft.name", "$event.value")] },
      }),
      node("textarea", "draft-description", {
        props: { label: "Description" },
        read: { value: "console.draft.description" },
        on: { input: [assignFrom("console.draft.description", "$event.value")] },
      }),
      node("panel", "cap-panel", {
        props: { title: "Capabilities", variant: "inset" },
        children: [
          node("chips", "cap-editor", {
            props: { emptyText: "No capabilities yet." },
            read: { items: "console.draft.capabilities" },
            on: { remove: [invoke("removeCapability")] },
          }),
          node("field", "new-cap", {
            props: { label: "Add capability", placeholder: "e.g. ticketList" },
            read: { value: "console.newCapName" },
            on: { input: [assignFrom("console.newCapName", "$event.value")] },
          }),
          node("button", "add-cap-btn", {
            props: { label: "Add", tone: "default" },
            on: { press: [invoke("addCapability")] },
          }),
        ],
      }),
      node("panel", "editor-actions", {
        props: { variant: "actions" },
        children: [
          node("button", "save-btn", {
            props: { label: "Save draft", tone: "default" },
            on: { press: [invoke("saveDraft")] },
          }),
          node("button", "validate-btn", {
            props: { label: "Validate", tone: "default" },
            on: { press: [invoke("validateProfile")] },
          }),
          node("button", "promote-btn", {
            props: { label: "Promote to active", tone: "primary" },
            on: { press: [invoke("promoteProfile")] },
          }),
        ],
      }),
    ],
  });
}

function validationTab(): DocNode {
  return node("panel", "validation-tab", {
    props: { variant: "tab" },
    gate: "console.tab = 'validation'",
    children: [
      node("panel", "validation-status", {
        props: { title: "Status", variant: "inset" },
        children: [
          node("text", "validation-status-text", {
            props: { variant: "code" },
            read: { value: "console.validation.status" },
          }),
        ],
      }),
      node("panel", "validation-errors", {
        props: { title: "Errors", variant: "inset" },
        children: [
          node("list", "validation-error-list", {
            props: { emptyText: "No errors." },
            read: { items: "console.validation.errors" },
          }),
        ],
      }),
      node("panel", "validation-warnings", {
        props: { title: "Warnings", variant: "inset" },
        children: [
          node("list", "validation-warning-list", {
            props: { emptyText: "No warnings." },
            read: { items: "console.validation.warnings" },
          }),
        ],
      }),
    ],
  });
}

function previewTab(): DocNode {
  return node("panel", "preview-tab", {
    props: { variant: "tab" },
    gate: "console.tab = 'preview'",
    children: [
      // A nested BUNDLE: the effect handlers rebuild `console.previewBundle` from the draft on every
      // draft-changing operation, so this live preview re-renders whenever capabilities change.
      node("embed", "preview-mount", {
        props: { emptyText: "Nothing to preview yet." },
        read: { bundle: "console.previewBundle" },
      }),
    ],
  });
}

function playgroundTab(): DocNode {
  return node("panel", "playground-tab", {
    props: { variant: "tab" },
    gate: "console.tab = 'playground'",
    children: [
      // The SAME shared Playground builder as Preview, in its interactive mode: each capability card
      // is selectable, and the nested bundle tracks its own selection declaratively. Preview is just
      // this bundle's read-only variant — one common Playground, embedded per-profile.
      node("embed", "playground-mount", {
        props: { emptyText: "Nothing to play with yet." },
        read: { bundle: "console.playgroundBundle" },
      }),
    ],
  });
}

function versionsTab(): DocNode {
  return node("panel", "versions-tab", {
    props: { variant: "tab" },
    gate: "console.tab = 'versions'",
    children: [
      node("table", "version-list", {
        props: {
          idKey: "version",
          emptyText: "No versions captured yet.",
          columns: [
            { key: "version", label: "Version" },
            { key: "status", label: "Status" },
            { key: "capabilityCount", label: "Capabilities" },
            { key: "capturedAt", label: "Captured" },
          ],
        },
        read: { rows: "console.versions" },
      }),
    ],
  });
}

// --- Detail column -----------------------------------------------------------------

function detail(): DocNode {
  return node("panel", "detail", {
    props: { title: "Editor", variant: "detail" },
    children: [
      // Empty state until a profile is chosen: a scratch Playground, hosted BY NAME. This is the
      // standalone Playground *app* (registered as "playground") mounted as a leaf inside the
      // console — the same bundle that could be an app shell on its own. No separate app required.
      node("panel", "empty-state", {
        props: { variant: "tab" },
        gate: "console.selectedId = ''",
        children: [
          node("note", "empty-hint", {
            props: {
              tone: "muted",
              value: "Select a profile on the left, or create one — meanwhile, here's a scratch Playground.",
            },
          }),
          node("embed", "scratch-playground", {
            props: { app: "playground", emptyText: "Playground app not registered." },
          }),
        ],
      }),
      node("panel", "detail-body", {
        props: { variant: "detail-body" },
        gate: "console.selectedId != ''",
        children: [
          node("tabBar", "detail-tabs", {
            props: {
              options: [
                { value: "editor", label: "Editor" },
                { value: "validation", label: "Validation" },
                { value: "preview", label: "Preview" },
                { value: "playground", label: "Playground" },
                { value: "versions", label: "Versions" },
              ],
            },
            read: { active: "console.tab" },
            on: { select: [assignFrom("console.tab", "$event.value")] },
          }),
          editorTab(),
          validationTab(),
          previewTab(),
          playgroundTab(),
          versionsTab(),
        ],
      }),
      node("note", "toast", {
        props: { tone: "info" },
        read: { value: "console.toast" },
        gate: "console.toast != ''",
      }),
    ],
  });
}

// --- Root --------------------------------------------------------------------------

function consoleRoot(): DocNode {
  return node("screen", "console-root", {
    props: {
      title: "GenUI Profile Console",
      subtitle: "Author, validate, preview, and promote GenUI profiles",
    },
    children: [
      node("row", "console-layout", {
        props: { variant: "split" },
        children: [listRail(), detail()],
      }),
    ],
  });
}

/** The authored, validated console document message. */
export function buildConsoleDocument(): DocumentMessage {
  return authorDocument(consoleRoot(), { manifest: MANIFEST_VERSION });
}
