// Presentation-context resolution — the pure, URL-agnostic core shared by the app host (which maps it
// to/from query params) and the demo host components (which seed it into the control context). Kept
// separate from host-query so any host surface can resolve a preset without pulling in URL parsing.

export const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface PresentationPreset {
  id: string;
  label?: string;
  audience?: string;
  focus?: string;
  context: Record<string, unknown>;
}

/** Choose the active preset: the requested id, else the preferred default, else the well-known default,
 *  else the first available, else null. */
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
