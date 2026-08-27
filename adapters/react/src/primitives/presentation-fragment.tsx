// The single component every compiled presentation slot (capability `gik:presentation-fragment`)
// renders through, in both the in-memory and durable hosts. A slot with no `presentation.layout`
// entry renders as a bare Fragment -- no DOM wrapper, no arrangement -- exactly as before this
// component gained layout awareness. A slot with a `layout` entry (compiled onto `node.props.layout`
// by `composeCellProgram`) renders a plain flex `<div>` driven by that data, so arranging a
// presentation's named regions stays a Blueprint-authored, host-injected concern -- never an
// ordinary imported leaf capability (see `ProjectionViewImport`'s "nothing is ambient" rule: a real
// leaf capability like `primitive:container` must be explicitly imported via `runtime.externals`,
// which a compiler-synthesized reference never is).

import React from "react";
import type { PresentationSlotLayout } from "@gik-ai/blueprint";
import type { ProjectionView } from "../registry";

const GAP_PX: Record<NonNullable<PresentationSlotLayout["gap"]>, number> = {
  none: 0,
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
};

function isPresentationSlotLayout(value: unknown): value is PresentationSlotLayout {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const PresentationFragmentView: ProjectionView = ({ node, children }) => {
  const layout = isPresentationSlotLayout(node.props.layout) ? node.props.layout : undefined;
  if (!layout) return React.createElement(React.Fragment, null, children);
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: layout.direction ?? "row",
    gap: GAP_PX[layout.gap ?? "m"],
    alignItems: layout.align ?? "stretch",
    justifyContent: layout.justify ?? "start",
    flexWrap: layout.wrap ? "wrap" : "nowrap",
  };
  return React.createElement("div", { "data-presentation-slot": node.id, style }, children);
};
