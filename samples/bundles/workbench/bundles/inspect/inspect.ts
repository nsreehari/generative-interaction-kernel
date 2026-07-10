// The inspector runtime. Like the chrome bundle, the inspector's panels + manifest + seed are DATA —
// authored in ./bundle.json and loaded by the shared floor host (see Workbench.tsx). What stays code
// here: the custom capability VIEWS (shared workbenchComponents) attached to the bundle, and the
// guest->inspect bridge payload (inspectSnapshot) that streams the live guest's artifacts into the
// inspector's `inspect` state — the second native cross-kernel seam.

import {
  type Patch,
  type ResolvedNode,
  type TraceEvent,
} from "../../../../../kernel/src/index";
import { bundleFromJson, type Bundle } from "../../../../../adapters/react/src/index";
import type { PresentationEdits } from "../../../../../interaction/src/index";
import { workbenchComponents } from "../shared/registry";
import { exportBundle } from "../../export";
import type { Session } from "../../session";
import inspectBundleJson from "./bundle.json";

/**
 * The inspector BUNDLE: the right artifact column as a self-contained app — authored in ./bundle.json,
 * with its custom views attached here. Loaded by the shared floor host like the chrome bundle; the
 * guest->inspect bridge (Workbench.tsx) streams the live guest's artifacts into its `inspect` state.
 */
export const inspectBundle: Bundle = bundleFromJson(inspectBundleJson, { projectionViews: workbenchComponents });

/** The `snapshot` payload the bridge feeds the inspector for the current guest state. */
export function inspectSnapshot(
  session: Session,
  tree: ResolvedNode | null,
  patch: Patch | null,
  edits: PresentationEdits
): Record<string, unknown> {
  const p = session.presentation;
  const bundle = exportBundle(session, edits);
  return {
    exportJson: JSON.stringify({ authored: bundle.authored, manifest: bundle.manifest }, null, 2),
    presentationHead: `${p.layout} · ${p.arrangement}`,
    regions: p.regions.map((r) => ({
      name: r.name,
      role: r.role,
      priority: r.priority,
      disclosure: r.disclosure,
      presentation: r.presentation ?? null,
      rationale: r.rationale ?? null,
    })),
    documentJson: JSON.stringify(session.document, null, 2),
    treeJson: JSON.stringify(tree, null, 2),
    traces: session.traces.map((t: TraceEvent) => ({
      event: t.event,
      node: t.node ?? "",
      detail: t.detail && Object.keys(t.detail).length > 0 ? JSON.stringify(t.detail) : "",
    })),
    patchLabel: `last patch: rev ${patch?.rev ?? "—"} · ${patch?.ops.length ?? 0} op(s)`,
  };
}
