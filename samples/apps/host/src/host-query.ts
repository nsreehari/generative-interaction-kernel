export const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface PresentationPreset {
  id: string;
  label?: string;
  audience?: string;
  focus?: string;
  context: Record<string, unknown>;
}

export interface HostQuery {
  targetId: string | null;
  demoId: string | null;
  harnessId: string | null;
  presentationContext: string | null;
}

export function resolvePresentationContext(
  requested: string | null | undefined,
  available: readonly PresentationPreset[],
  preferredDefault?: string | null
): PresentationPreset | null {
  if (requested) {
    const preset = available.find((entry) => entry.id === requested);
    if (preset) return preset;
  }
  if (preferredDefault) {
    const preset = available.find((entry) => entry.id === preferredDefault);
    if (preset) return preset;
  }
  return available.find((entry) => entry.id === DEFAULT_PRESENTATION_CONTEXT) ?? available[0] ?? null;
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
