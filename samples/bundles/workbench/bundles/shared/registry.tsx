// The workbench profile's capability -> React component map (the "vocabulary side" of the chrome
// runtime). Each component is a thin, dumb view: it reads its bound props (populated by the node's
// `read` edges) and reports interaction back through `emit`, which the kernel routes to the node's
// `on` handlers. No component holds app state — state lives in the `workbench` namespace.

import React from "react";
import {
  readProps,
  type ProjectionView,
  type ProjectionViewProps,
} from "@gik/react";
import {
  type PresentationEdits,
  type RegionDisclosure,
  type RegionPriority,
} from "../../../../../interaction/src/index";
import {
  emptyEdits,
  moveRegion,
  reorderRegion,
  setRegionDisclosure,
  setRegionPriority,
  toggleRegion,
} from "../../projection_views/libs/edits";

interface Option {
  value: string;
  label: string;
}

function PanelGroup({ children }: ProjectionViewProps) {
  return <>{children}</>;
}

// --- Editing surface (Slice 2) ----------------------------------------------------

interface EditRegionItem {
  name: string;
  role: string;
  required: boolean;
  enabled: boolean;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
}

const PRIORITY_OPTS: Option[] = [
  { value: "primary", label: "primary" },
  { value: "secondary", label: "secondary" },
  { value: "tertiary", label: "tertiary" },
];
const DISCLOSURE_OPTS: Option[] = [
  { value: "always", label: "always" },
  { value: "collapsed", label: "collapsed" },
  { value: "on-demand", label: "on-demand" },
];

/**
 * The editing surface: a controlled view over the region list + the current override set. Every
 * control computes the *next* override set from the current one (preserving only what the user has
 * deliberately set) and emits it whole as `edit` — the on-handler stores it and the bridge re-plans.
 */
function RegionEditor({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const items = p.list<EditRegionItem>("items");
  const edits = p.obj<PresentationEdits>("edits", emptyEdits);
  const order = items.map((r) => r.name);
  const push = (next: PresentationEdits) => emit("edit", { edits: next });

  // Drag-reorder state. The dragged name lives in a ref so `onDrop` reads it synchronously (a state
  // value could still be stale in the drop closure if React hasn't re-rendered since dragstart); the
  // hovered name is state because the drop-target highlight needs a re-render. The authoritative order
  // is the pushed `edits.order`, so the list re-renders from state after a drop.
  const dragName = React.useRef<string | null>(null);
  const [overName, setOverName] = React.useState<string | null>(null);

  const toggle = (name: string) => push(toggleRegion(edits, name));
  const setPriority = (name: string, value: string) => push(setRegionPriority(edits, name, value as RegionPriority));
  const setDisclosure = (name: string, value: string) =>
    push(setRegionDisclosure(edits, name, value as RegionDisclosure));
  // Both the drag handle and the ↑/↓ buttons funnel through the shared reorder/move transforms, so
  // the pipeline sees one reorder shape; skip the emit when the transform is a no-op (same ref).
  const reorder = (dragged: string, target: string) => {
    const next = reorderRegion(edits, order, dragged, target);
    if (next !== edits) push(next);
  };
  const move = (name: string, dir: -1 | 1) => {
    const next = moveRegion(edits, order, name, dir);
    if (next !== edits) push(next);
  };
  const endDrag = () => {
    dragName.current = null;
    setOverName(null);
  };

  return (
    <div className="region-editor">
      <span className="muted">regions</span>
      <ul>
        {items.map((r, i) => (
          <li
            key={r.name}
            className={[r.enabled ? "" : "off", overName === r.name && dragName.current !== r.name ? "drop-target" : ""]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => {
              if (!dragName.current) return;
              e.preventDefault();
              if (overName !== r.name) setOverName(r.name);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragName.current) reorder(dragName.current, r.name);
              endDrag();
            }}
          >
            <label className="region-toggle">
              <span
                className="drag-grip"
                draggable
                onDragStart={(e) => {
                  dragName.current = r.name;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={endDrag}
                aria-label="drag to reorder"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <input
                type="checkbox"
                checked={r.enabled}
                disabled={r.required}
                onChange={() => toggle(r.name)}
              />
              <code>{r.name}</code>
              <span className="muted">{r.role}</span>
            </label>
            <div className="region-controls">
              <select
                value={r.priority}
                disabled={!r.enabled}
                onChange={(e) => setPriority(r.name, e.target.value)}
              >
                {PRIORITY_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={r.disclosure}
                disabled={!r.enabled}
                onChange={(e) => setDisclosure(r.name, e.target.value)}
              >
                {DISCLOSURE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button disabled={i === 0} onClick={() => move(r.name, -1)} aria-label="move up">
                ↑
              </button>
              <button disabled={i === items.length - 1} onClick={() => move(r.name, 1)} aria-label="move down">
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The workbench chrome profile's EXTRA capability -> component map: ONLY the specialized controls
 * the shared floor doesn't provide — the passthrough `panelGroup` and the stateful `regionEditor`.
 * These are attached to the chrome/inspect bundles as their `self` provider components; everything
 * else (panel, select, field, textarea, button, note, tabBar, and the passive list/table displays
 * for facets, agent steps, region rows, and traces) resolves through the `ui` (floor) provider that
 * each bundle's manifest `externals.projectionViews` declares (see `buildBundleRegistry`). Nothing is
 * ambient: a reference resolves only through an explicitly imported provider, else the fallback.
 */
export const workbenchComponents: Record<string, ProjectionView> = {
  panelGroup: PanelGroup,
  regionEditor: RegionEditor,
};
