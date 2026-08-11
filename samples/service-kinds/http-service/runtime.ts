import type { Json } from "@gik/kernel";
import type { WorkerServiceInvocation } from "../worker-service-kind";

export interface HttpServiceExecutionOptions {
  proxyOrigin: string;
  accessKey: string;
  fetch?: typeof globalThis.fetch;
}

export class HttpServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpServiceError";
  }
}

interface HttpServiceRequestSpec {
  key?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Json;
  meta?: Json;
}

interface HttpServiceRequestInput {
  requests?: HttpServiceRequestSpec | HttpServiceRequestSpec[];
}

function asRequestInput(value: Json): HttpServiceRequestInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("http-service request input must be an object");
  }
  return value as HttpServiceRequestInput;
}

function asRequestSpec(value: HttpServiceRequestSpec, index: number): Required<Pick<HttpServiceRequestSpec, "url">> & HttpServiceRequestSpec {
  const url = String(value.url ?? "").trim();
  if (!url) throw new Error(`http-service request ${index} requires a url`);
  return { ...value, url };
}

async function readResponseBody(response: Response): Promise<Json> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json() as Json;
  }
  return await response.text();
}

export async function executeHttpServiceInvocation(
  request: WorkerServiceInvocation,
  options: HttpServiceExecutionOptions
): Promise<Json> {
  const proxyOrigin = options.proxyOrigin.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  if (request.operation === "check-access") {
    const response = await fetchImpl(`${proxyOrigin}/api/access/check`, {
      method: "GET",
      headers: { "x-functions-key": options.accessKey },
    });
    if (!response.ok) throw new HttpServiceError(`HTTP proxy returned ${response.status}.`, response.status);
    return { ok: true };
  }
  const input = asRequestInput(request.input);
  const requests = Array.isArray(input.requests)
    ? input.requests
    : input.requests
      ? [input.requests]
      : [];
  const results = await Promise.all(requests.map(async (entry, index) => {
    const spec = asRequestSpec(entry, index);
    const response = await fetchImpl(`${proxyOrigin}/api/http-proxy`, {
      method: spec.method ?? "GET",
      cache: "no-store",
      headers: {
        ...spec.headers,
        "x-functions-key": options.accessKey,
        "x-http-proxy-url": spec.url,
      },
      body: typeof spec.body === "string" ? spec.body : spec.body === undefined ? undefined : JSON.stringify(spec.body),
    });
    if (!response.ok) {
      throw new HttpServiceError(`http-service request ${index} failed with ${response.status} ${response.statusText}`.trim(), response.status);
    }
    return {
      key: spec.key ?? spec.url,
      status: response.status,
      url: spec.url,
      meta: spec.meta ?? null,
      body: await readResponseBody(response),
    } satisfies Record<string, Json>;
  }));

  return { results } satisfies Record<string, Json>;
}