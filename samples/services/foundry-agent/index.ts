import type { Json, ServiceDeclaration } from "../../../kernel/src/index";
import {
	serviceConfig,
	type ServiceKindFactory,
	type ServiceKindManifest,
} from "../../../face/src/services/service-kinds";
import type { ServiceAdapter, ServiceAdapterContext, ServiceRequest } from "../../../face/src/services/queueface";
import { createFoundryProxy, FoundryProxyError, type FoundryChatResponseSchema } from "../../shared/foundry-proxy";
import manifestJson from "./manifest.json";

const manifest = manifestJson as ServiceKindManifest;

function record(value: Json | undefined): Record<string, Json> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, Json>;
}

/** Accepts an explicit responseSchema passed by the caller through `request.input`. Useful when
 * one binding/operation (e.g. a generic "chat" operation shared across several logical
 * sub-operations) needs a different Structured Outputs schema per call rather than one fixed
 * schema per declared operation. */
function inputResponseSchema(input: Record<string, Json>): FoundryChatResponseSchema | undefined {
	const candidate = input.responseSchema;
	if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
	const { name, schema, strict } = candidate as Record<string, Json>;
	if (typeof name !== "string" || !schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
	return { name, schema: schema as Record<string, unknown>, strict: strict !== false };
}

function declaredResponseSchema(
	request: ServiceRequest,
	context: ServiceAdapterContext,
): FoundryChatResponseSchema | undefined {
	const validator = context.responseValidators?.find((rule) =>
		!Array.isArray(rule)
		&& rule.kind === "ajv-schema"
		&& rule.code === "provider-structured-output"
		&& rule.level !== "warning"
	);
	if (!validator || Array.isArray(validator) || validator.kind !== "ajv-schema") return undefined;
	const schema = validator.schema;
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
	const name = `${request.capabilityId || request.operation}_response`
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.slice(0, 64);
	return { name, schema: schema as Record<string, unknown>, strict: true };
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
		const operations = [...new Set(Object.values(declaration.operations).map(({ operation }) => operation))];
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
				capabilities: operations.map((operation) => ({
					id: operation,
					operation,
					version: declaration.version,
					inputSchema: {},
					assurance: "declared-and-locally-validated",
					supports: { validate: true },
				})),
			}),
			validate: (request) => operations.includes(request.operation)
				? { ok: true }
				: { ok: false, errors: [`Operation '${request.operation}' is not declared`] },
			probe: async () => {
				const agentName = configuredAgent;
				if (!agentName) return { ok: true, detail: { note: "Agent selected per request" } as Record<string, Json> };
				await (await client()).ping(agentName);
				return { ok: true, detail: { agentName } as Record<string, Json> };
			},
			execute: async (request, adapterContext) => {
				const input = record(request.input);
				try {
					if (request.operation === "check-access") {
						await (await client()).checkAccess();
						return { output: { ok: true } };
					}
					if (request.operation === "discover") {
						return { output: await (await client()).listAgents() };
					}
					if (request.operation !== "chat") throw new Error(`Unsupported foundry-agent operation '${request.operation}'`);
					const agentName = configuredAgent || String(input.agentName ?? "");
					if (!agentName) throw new Error("foundry-agent requires config.agent or input.agentName");
					const responseSchema = inputResponseSchema(input) ?? declaredResponseSchema(request, adapterContext);
					const response = await (await client()).chat({
						message: String(input.message ?? ""),
						agentName,
						conversationId: typeof input.conversationId === "string" ? input.conversationId : undefined,
						instructions: typeof input.instructions === "string" ? input.instructions : undefined,
						responseSchema,
					});
					let structuredOutput: Json | undefined;
					if (responseSchema) {
						try {
							structuredOutput = JSON.parse(response.reply) as Json;
						} catch {
							throw new Error("Foundry agent returned invalid structured JSON");
						}
					}
					return {
						output: structuredOutput ?? response as unknown as Json,
						detail: structuredOutput === undefined
							? undefined
							: { responseId: response.responseId, conversationId: response.conversationId },
					};
				} catch (error) {
					if (error instanceof FoundryProxyError && (error.status === 401 || error.status === 403)) {
						await context.clearCredential?.(credentialRef);
					}
					throw error;
				}
			},
		};
	},
	};
}

export const foundryAgentKind = createFoundryAgentKind();
