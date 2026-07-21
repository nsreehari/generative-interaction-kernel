export const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface PresentationPreset {
  id: string;
  label?: string;
  audience?: string;
  focus?: string;
  context: Record<string, unknown>;
}

export function resolvePresentationContext(
  requested: string | null | undefined,
  available: readonly PresentationPreset[],
  preferredDefault?: string | null,
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
