import type { Json } from "@gik/kernel";

const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface HostQuery {
  /** The explicitly selected Blueprint, or `null` when nothing named one. `null` is never
   * substituted with the catalog's default Blueprint: it selects the host's application root. */
  targetId: string | null;
  durableEnabled: boolean;
  externalContext?: Record<string, Json>;
}

function isNonZeroEnabled(params: URLSearchParams, name: string): boolean {
  const value = params.get(name);
  if (value === null) return false;
  if (value === "") return true;
  const numeric = Number(value);
  return !Number.isFinite(numeric) || numeric !== 0;
}

function cachedBlueprintFromPath(pathname: string): string | null {
  const match = /(?:^|\/)cached\/([^/]+)\/?$/.exec(pathname);
  return match ? `cached-${decodeURIComponent(match[1])}` : null;
}

function parseExternalContext(value: string | null): Record<string, Json> | undefined {
  if (value === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("Host context must be a URL-encoded JSON object.", { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Host context must be a URL-encoded JSON object.");
  }
  return Object.keys(parsed).length === 0 ? undefined : parsed as Record<string, Json>;
}

function selectedBlueprintId(params: URLSearchParams, pathname: string): string | null {
  // An explicit, non-empty `b` (or its legacy `bundle` spelling, which canonicalizes to `b`) is the
  // only thing that names a Blueprint to open. Absent or blank is not "the default Blueprint" -- it
  // means the host has no single current Blueprint at all.
  for (const name of ["b", "bundle"] as const) {
    const value = params.get(name)?.trim();
    if (value) return value;
  }
  return cachedBlueprintFromPath(pathname);
}

export function readHostQuery(search: string, pathname = ""): HostQuery {
  const params = new URLSearchParams(search);
  const externalContext = parseExternalContext(params.get("context"));
  return {
    targetId: selectedBlueprintId(params, pathname),
    durableEnabled: isNonZeroEnabled(params, "durable"),
    ...(externalContext ? { externalContext } : {}),
  };
}

export function canonicalizeHostUrl(href: string): string {
  const url = new URL(href);
  const params = url.searchParams;
  const legacyPresentation = params.get("presentationContext");
  const legacyTarget = params.get("bundle")?.trim();

  if (params.has("b") && !params.get("b")?.trim()) params.delete("b");
  if (legacyTarget && !params.has("b")) params.set("b", legacyTarget);

  if ((params.get("harness") === "gik-control-harness" || params.has("plane")) && !params.has("gik")) {
    params.set("gik", "1");
  }
  if (legacyPresentation && !params.has("presentation")) params.set("presentation", legacyPresentation);

  params.delete("harness");
  params.delete("plane");
  params.delete("bundle");
  params.delete("presentationContext");
  if (params.get("presentation") === DEFAULT_PRESENTATION_CONTEXT) params.delete("presentation");

  return url.toString();
}
