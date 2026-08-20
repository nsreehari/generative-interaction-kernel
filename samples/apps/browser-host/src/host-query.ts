import type { Json } from "@gik/kernel";

const DEFAULT_PRESENTATION_CONTEXT = "full-substrate";

export interface HostQuery {
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

export function readHostQuery(search: string, pathname = ""): HostQuery {
  const params = new URLSearchParams(search);
  const externalContext = parseExternalContext(params.get("context"));
  return {
    targetId: params.get("b") ?? params.get("bundle") ?? cachedBlueprintFromPath(pathname),
    durableEnabled: isNonZeroEnabled(params, "durable"),
    ...(externalContext ? { externalContext } : {}),
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
  params.delete("presentationContext");
  if (params.get("presentation") === DEFAULT_PRESENTATION_CONTEXT) params.delete("presentation");

  return url.toString();
}
