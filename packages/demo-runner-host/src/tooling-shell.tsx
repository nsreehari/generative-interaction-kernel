import React from "react";
import { createPortal } from "react-dom";

export type ToolingSurface = "runner" | "inspector";

export function GikToolingShell({
  children,
  runnerVisible,
  inspectorVisible,
}: {
  children: React.ReactNode;
  runnerVisible: boolean;
  inspectorVisible: boolean;
}): React.ReactElement {
  return (
    <div
      data-gik-tooling-shell=""
      data-runner-visible={runnerVisible ? "true" : "false"}
      data-inspector-visible={inspectorVisible ? "true" : "false"}
      style={{ display: "contents", ["--gik-tooling-runner-offset" as string]: runnerVisible ? "72px" : "8px" }}
    >
      {children}
      {runnerVisible ? <div data-gik-tooling-surface="runner" /> : null}
      {inspectorVisible ? <div data-gik-tooling-surface="inspector" /> : null}
    </div>
  );
}

export function ToolingPortal({
  surface,
  children,
}: {
  surface: ToolingSurface;
  children: React.ReactNode;
}): React.ReactElement | null {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [root, setRoot] = React.useState<Element | null>(null);

  React.useLayoutEffect(() => {
    setRoot(document.querySelector(`[data-gik-tooling-surface="${surface}"]`));
  }, [surface]);

  if (typeof document === "undefined") return null;
  return (
    <>
      <span ref={anchorRef} hidden />
      {root ? createPortal(children, root) : null}
    </>
  );
}
