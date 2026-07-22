export interface FoundryProxyOptions {
  baseUrl: string;
  key: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface FoundryChatResponseSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface FoundryChatRequest {
  message: string;
  agentName: string;
  conversationId?: string;
  instructions?: string;
  /** Requests Structured Outputs (Responses API `text.format`) so the model itself is
   * constrained to emit JSON matching this schema, rather than relying solely on
   * post-hoc validation of a free-text reply. */
  responseSchema?: FoundryChatResponseSchema;
}

export interface FoundryChatResponse {
  conversationId: string;
  responseId: string;
  reply: string;
}

export class FoundryProxyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FoundryProxyError";
  }
}

const DEFAULT_FOUNDRY_PROXY_TIMEOUT_MS = 10_000;

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}

export function createFoundryProxy(options: FoundryProxyOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FOUNDRY_PROXY_TIMEOUT_MS;
  const request = async (input: string, init: RequestInit): Promise<Response> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = globalThis.setTimeout?.(() => {
        reject(new FoundryProxyError(
          "Timed out checking Foundry access. Retry or enter a new access key.",
          408
        ));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fetchImpl(input, init), timeout]);
    } catch (error) {
      if (error instanceof FoundryProxyError) throw error;
      throw new FoundryProxyError(
        `Could not reach Foundry at ${baseUrl}. Verify the server is running.`,
        503
      );
    } finally {
      if (timeoutId) {
        globalThis.clearTimeout?.(timeoutId);
      }
    }
  };

  const post = async (path: string, body: Record<string, unknown>): Promise<Response> => {
    const response = await request(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-functions-key": options.key,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new FoundryProxyError((await responseError(response)) || `Foundry proxy returned ${response.status}.`, response.status);
    }
    return response;
  };

  return {
    async checkAccess(): Promise<void> {
      let response: Response;
      try {
        response = await request(`${baseUrl}/api/access/check`, {
          method: "GET",
          headers: { "x-functions-key": options.key },
        });
      } catch (error) {
        if (!(error instanceof FoundryProxyError) || (error.status !== 408 && error.status !== 503)) throw error;
        try {
          await request(baseUrl, { method: "GET" });
        } catch {
          throw new FoundryProxyError(
            `Could not reach Foundry at ${baseUrl}. Verify the server is running.`,
            503
          );
        }
        throw new FoundryProxyError(
          `Foundry at ${baseUrl} is reachable, but ${baseUrl}/api/access/check could not be reached.`,
          503
        );
      }
      if (!response.ok) {
        throw new FoundryProxyError((await responseError(response)) || `Foundry proxy returned ${response.status}.`, response.status);
      }
    },

    async ping(agentName: string): Promise<string> {
      const response = await post("/api/agent/ping", { agentName });
      const body = (await response.json()) as { agentName?: unknown };
      return typeof body.agentName === "string" ? body.agentName : agentName;
    },

    // New Foundry Agent Service: agents are listed by NAME under /agents (api-version=v1),
    // not the classic /assistants endpoint. Returns the enabled agent names.
    async listAgents(): Promise<string[]> {
      const response = await request(`${baseUrl}/api/foundry/agents?api-version=v1`, {
        method: "GET",
        headers: { "x-functions-key": options.key },
      });
      if (!response.ok) {
        throw new FoundryProxyError((await responseError(response)) || `Foundry proxy returned ${response.status}.`, response.status);
      }
      const body = (await response.json()) as { data?: Array<{ name?: unknown; state?: unknown }> };
      return (Array.isArray(body?.data) ? body.data : [])
        .filter((a) => a && typeof a.name === "string" && a.name.trim() !== "" && a.state !== "disabled")
        .map((a) => String((a as { name: string }).name));
    },

    async chat(request: FoundryChatRequest): Promise<FoundryChatResponse> {
      const response = await post("/api/agent/chat", {
        message: request.message,
        agentName: request.agentName,
        conversationId: request.conversationId || undefined,
        instructions: request.instructions || undefined,
        responseSchema: request.responseSchema || undefined,
      });
      const body = (await response.json()) as Partial<FoundryChatResponse>;
      if (typeof body.conversationId !== "string" || typeof body.responseId !== "string" || typeof body.reply !== "string") {
        throw new FoundryProxyError("Foundry proxy returned an invalid chat response.", response.status);
      }
      return body as FoundryChatResponse;
    },
  };
}