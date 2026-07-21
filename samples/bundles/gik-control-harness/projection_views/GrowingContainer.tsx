import React from "react";

// Local copy of floor's GrowingContainer so the control harness carries no floor dependency.
// A scroll viewport that can auto-follow its growing content to the end (e.g. a live journal).

export type GrowingContainerFollowEnd = "always" | "when-at-end" | "off";

export interface GrowingContainerProps {
  children?: React.ReactNode;
  className?: string;
  followEnd?: GrowingContainerFollowEnd;
  ariaLabel?: string;
}

export function GrowingContainer({
  children,
  className,
  followEnd = "always",
  ariaLabel,
}: GrowingContainerProps): React.ReactElement {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pinnedToEndRef = React.useRef(true);

  const scrollToEnd = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || followEnd === "off") return;
    const observer = new ResizeObserver(() => {
      if (followEnd === "always" || pinnedToEndRef.current) scrollToEnd();
    });
    observer.observe(content);
    scrollToEnd();
    return () => observer.disconnect();
  }, [followEnd, scrollToEnd]);

  const onScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    pinnedToEndRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 8;
  };

  return (
    <div
      ref={viewportRef}
      className={["gx-growing-container", className].filter(Boolean).join(" ")}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      onScroll={onScroll}
      style={{
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        maxWidth: "100%",
        maxHeight: "100%",
        overflow: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div ref={contentRef} className="gx-growing-container-content" style={{ minWidth: 0, minHeight: "100%" }}>{children}</div>
    </div>
  );
}
