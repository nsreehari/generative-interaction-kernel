import type { GuardrailRule, Json, ServiceDeclaration } from "../../../kernel/src/index";
import {
	serviceConfig,
	type ServiceAdapter,
	type ServiceKindFactory,
	type ServiceKindManifest,
} from "@gik/controlface";
import { createFoundryProxy, type FoundryChatResponseSchema } from "../../shared/foundry-proxy";
import manifestJson from "./manifest.json";

const manifest = manifestJson as ServiceKindManifest;

function record(value: Json | undefined): Record<string, Json> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, Json>;
}

/** Finds the `ajv-schema` guardrail (if any) declared for this operation's output policy and turns
 * it into a Responses API Structured Outputs request. This lets the model itself be constrained to
 * emit schema-conformant JSON — the tool-level correctness the provider already supports — rather
 * than relying only on post-hoc guardrail validation of a free-text reply. Guardrail enforcement
 * still runs afterward regardless (it also covers cross-field checks a JSON Schema can't express). */
function responseSchemaFor(operation: string, guardrails: readonly GuardrailRule[] | undefined): FoundryChatResponseSchema | undefined {
	const rule = guardrails?.find((candidate): candidate is Extract<GuardrailRule, { kind: "ajv-schema" }> =>
		typeof candidate === "object" && !Array.isArray(candidate) && candidate.kind === "ajv-schema"
	);
	if (!rule) return undefined;
	const name = operation.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "response";
	return { name, schema: rule.schema as Record<string, unknown>, strict: true };
}


export function createFoundryAgentKind(fetch?: typeof globalThis.fetch): ServiceKindFactory {
	return {
	manifest,
	validate: (declaration, context) => {
		if (!context.resolveCredential) {
			return { ok: false, errors: ["foundry-agent requires a host credential resolver"] };
		}
		const config = serviceConfig(declaration);
		try {
			const endpoint = new URL(String(config.endpoint));
			if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
				return { ok: false, errors: ["foundry-agent endpoint must use HTTPS"] };
			}
			if (!context.authorizeEndpoint) {
				return { ok: false, errors: [`foundry-agent endpoint '${endpoint.origin}' is not authorized by the host`] };
			}
			const authorized = context.authorizeEndpoint(manifest.id, endpoint);
			if (authorized instanceof Promise) {
				return authorized.then((allowed) => allowed
					? { ok: true }
					: { ok: false, errors: [`foundry-agent endpoint '${endpoint.origin}' is not authorized by the host`] });
			}
			if (!authorized) {
				return { ok: false, errors: [`foundry-agent endpoint '${endpoint.origin}' is not authorized by the host`] };
			}
		} catch {
			return { ok: false, errors: ["foundry-agent requires a valid endpoint"] };
		}
		return { ok: true };
	},
	create: (declaration: ServiceDeclaration, context): ServiceAdapter => {
		const config = serviceConfig(declaration);
		const endpoint = String(config.endpoint);
		const credentialRef = String(config.credentialRef);
		const configuredAgent = typeof config.agent === "string" ? config.agent : "";
		const client = async () => createFoundryProxy({
			baseUrl: endpoint,
			key: String(await context.resolveCredential!(credentialRef)),
			fetch,
		});
		const providerId = `foundry-agent:${context.identity?.serviceId ?? "anonymous"}`;
		return {
			provider: { id: providerId, version: manifest.version, title: manifest.title },
			discover: async () => ({
				provider: { id: providerId, version: manifest.version, title: manifest.title },
				revision: manifest.version,
				discoveredAt: new Date().toISOString(),
				capabilities: declaration.operations.map((operation) => ({
					id: operation,
					operation,
					version: declaration.version,
					inputSchema: {},
					assurance: "declared-and-locally-validated",
					supports: { validate: true },
				})),
			}),
			validate: (request) => declaration.operations.includes(request.operation)
				? { ok: true }
				: { ok: false, errors: [`Operation '${request.operation}' is not declared`] },
			probe: async () => {
				const agentName = configuredAgent;
				if (!agentName) return { ok: true, detail: { note: "Agent selected per request" } as Record<string, Json> };
				await (await client()).ping(agentName);
				return { ok: true, detail: { agentName } as Record<string, Json> };
			},
			execute: async (request, context) => {
				const input = record(request.input);
				const agentName = configuredAgent || String(input.agentName ?? "");
				if (!agentName) throw new Error("foundry-agent requires config.agent or input.agentName");
				if (request.operation === "discover") {
					return { output: await (await client()).listAgents() };
				}
				if (request.operation !== "chat") throw new Error(`Unsupported foundry-agent operation '${request.operation}'`);
				return {
					output: await (await client()).chat({
						message: String(input.message ?? ""),
						agentName,
						conversationId: typeof input.conversationId === "string" ? input.conversationId : undefined,
						instructions: typeof input.instructions === "string" ? input.instructions : undefined,
						responseSchema: responseSchemaFor(request.operation, context.outputPolicy?.guardrails),
					}) as unknown as Json,
				};
			},
		};
	},
	};
}

export const foundryAgentKind = createFoundryAgentKind();
