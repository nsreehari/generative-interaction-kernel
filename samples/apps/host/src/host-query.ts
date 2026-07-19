export const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface HostQuery {
  targetId: string | null;
  demoId: string | null;
  harnessId: string | null;
  presentationContext: string | null;
}

export function resolvePresentationContext(
  requested: string | null | undefined,
  available: readonly string[],
  preferredDefault?: string | null
): string | null {
  if (requested && available.includes(requested)) return requested;
  if (preferredDefault && available.includes(preferredDefault)) return preferredDefault;
  if (available.includes(DEFAULT_PRESENTATION_CONTEXT)) return DEFAULT_PRESENTATION_CONTEXT;
  return available[0] ?? null;
}

function isGikEnabled(params: URLSearchParams): boolean {
  const value = params.get("gik");
  if (value === null) return false;
  if (value === "") return true;
  const numeric = Number(value);
  return !Number.isFinite(numeric) || numeric !== 0;
}

export function readHostQuery(search: string): HostQuery {
  const params = new URLSearchParams(search);
  const requestedPresentation = params.get("presentation") ?? params.get("presentationContext");
  return {
    targetId: params.get("bundle"),
    demoId: params.get("demo"),
    harnessId: isGikEnabled(params) || params.get("harness") === "gik-control-harness" || params.has("plane")
      ? "gik-control-harness"
      : null,
    presentationContext: requestedPresentation || null,
  };
}

export function canonicalizeHostUrl(href: string): string {
  const url = new URL(href);
  const params = url.searchParams;
  const legacyPresentation = params.get("presentationContext");

  if ((params.get("harness") === "gik-control-harness" || params.has("plane")) && !params.has("gik")) {
    params.set("gik", "1");
  }
  if (legacyPresentation && !params.has("presentation")) params.set("presentation", legacyPresentation);

  params.delete("harness");
  params.delete("plane");
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
