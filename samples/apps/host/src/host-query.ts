import {
  DEFAULT_PRESENTATION_CONTEXT,
  resolvePresentationContext,
  type PresentationPreset,
} from "../../../shared/presentation";

// Re-exported for existing consumers; the canonical definitions live in shared/presentation.
export { DEFAULT_PRESENTATION_CONTEXT, resolvePresentationContext, type PresentationPreset };

export interface HostQuery {
  targetId: string | null;
  demoEnabled: boolean;
  durableEnabled: boolean;
  harnessId: string | null;
  presentationContext: string | null;
}

function isNonZeroEnabled(params: URLSearchParams, name: string): boolean {
  const value = params.get(name);
  if (value === null) return false;
  if (value === "") return true;
  const numeric = Number(value);
  return !Number.isFinite(numeric) || numeric !== 0;
}

function isDemoEnabled(params: URLSearchParams): boolean {
  const value = params.get("demo");
  return value !== null && value !== "0";
}

function cachedBlueprintFromPath(pathname: string): string | null {
  const match = /(?:^|\/)cached\/([^/]+)\/?$/.exec(pathname);
  return match ? `cached-${decodeURIComponent(match[1])}` : null;
}

export function readHostQuery(search: string, pathname = ""): HostQuery {
  const params = new URLSearchParams(search);
  const requestedPresentation = params.get("presentation") ?? params.get("presentationContext");
  return {
    targetId: params.get("b") ?? params.get("bundle") ?? cachedBlueprintFromPath(pathname),
    demoEnabled: isDemoEnabled(params),
    durableEnabled: isNonZeroEnabled(params, "durable"),
    harnessId: isNonZeroEnabled(params, "gik") || params.get("harness") === "gik-control-harness" || params.has("plane")
      ? "gik-control-harness"
      : null,
    presentationContext: requestedPresentation || null,
  };
}

export function canonicalizeHostUrl(href: string): string {
  const url = new URL(href);
  const params = url.searchParams;
  const legacyPresentation = params.get("presentationContext");
  const legacyTarget = params.get("bundle");

  if (legacyTarget && !params.has("b")) params.set("b", legacyTarget);

  if ((params.get("harness") === "gik-control-harness" || params.has("plane")) && !params.has("gik")) {
    params.set("gik", "1");
  }
  if (legacyPresentation && !params.has("presentation")) params.set("presentation", legacyPresentation);

  params.delete("harness");
  params.delete("plane");
  params.delete("bundle");
  params.delete("context");
  params.delete("presentationContext");
  if (params.get("presentation") === DEFAULT_PRESENTATION_CONTEXT) params.delete("presentation");

  return url.toString();
}

export function writePresentationNavigation(href: string, presentationContext: string): string {
  const url = new URL(href);
  url.searchParams.delete("presentationContext");
  if (presentationContext === DEFAULT_PRESENTATION_CONTEXT) url.searchParams.delete("presentation");
  else url.searchParams.set("presentation", presentationContext);
  return url.toString();
}
