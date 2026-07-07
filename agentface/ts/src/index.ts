// GenUI AgentFace: the transport-free, agent-facing authoring/validation surface. JSON in,
// JSON out — MCP, HTTP, and in-process are all thin wrappers over these functions. The C#
// peer lives at agentface/dotnet/GenUI.AgentFace.

export * from "./catalog";
export * from "./document";
export * from "./capability";
export * from "./interaction";
export * from "./presentation";
export * from "./intent";
export * from "./mcp";
