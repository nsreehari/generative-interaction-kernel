export type SocPlane = "runtime" | "blueprint";

export interface SocNavigation {
  plane: SocPlane;
  context?: string;
}

export function readSocNavigation(search: string, validContexts: readonly string[]): SocNavigation {
  const params = new URLSearchParams(search);
  const requestedPlane = params.get("plane");
  const requestedContext = params.get("context");

  return {
    plane: requestedPlane === "blueprint" ? "blueprint" : "runtime",
    context: requestedContext && validContexts.includes(requestedContext) ? requestedContext : undefined,
  };
}

export function writeSocNavigation(url: string, plane: SocPlane, context?: string): string {
  const next = new URL(url);
  next.searchParams.set("plane", plane);
  if (context) next.searchParams.set("context", context);
  else next.searchParams.delete("context");
  return next.toString();
}
