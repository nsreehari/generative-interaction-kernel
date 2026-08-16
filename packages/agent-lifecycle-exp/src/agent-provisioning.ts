import type { AgentFunctionToolDefinition } from "./function-tools";
import type { JsonSchema } from "./types";

export interface AgentResponseFormat {
  readonly type: "json_schema";
  readonly name: string;
  readonly strict: boolean;
  readonly schema: JsonSchema;
}

export interface AgentProvisioningTemplate {
  readonly id: string;
  readonly description: string;
  readonly instructions: readonly string[];
  readonly reasoning?: Readonly<Record<string, unknown>>;
  readonly tools?: readonly AgentFunctionToolDefinition[];
  readonly responseFormat?: AgentResponseFormat;
  readonly executionAuthority: "host";
}

export interface FoundryPromptDefinition {
  readonly kind: "prompt";
  readonly model: string;
  readonly reasoning?: Readonly<Record<string, unknown>>;
  readonly instructions: string;
  readonly tools: readonly AgentFunctionToolDefinition[];
  readonly text?: { readonly format: AgentResponseFormat };
}

export interface CopilotAgentMarkdownOptions {
  readonly model: string;
  readonly name?: string;
}

function requireHostAuthority(template: AgentProvisioningTemplate): void {
  if (template.executionAuthority !== "host") {
    throw new Error(`Agent template '${template.id}' must use host execution authority`);
  }
}

function yamlString(value: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value);
}

export function toFoundryPromptDefinition(
  template: AgentProvisioningTemplate,
  model: string,
): FoundryPromptDefinition {
  requireHostAuthority(template);
  return {
    kind: "prompt",
    model,
    ...(template.reasoning ? { reasoning: template.reasoning } : {}),
    instructions: template.instructions.join(" "),
    tools: template.tools ?? [],
    ...(template.responseFormat ? { text: { format: template.responseFormat } } : {}),
  };
}

export function toCopilotAgentMarkdown(
  template: AgentProvisioningTemplate,
  options: CopilotAgentMarkdownOptions,
): string {
  requireHostAuthority(template);
  const tools = template.tools ?? [];
  const frontmatter = [
    "---",
    `name: ${yamlString(options.name ?? template.id)}`,
    `description: ${yamlString(template.description)}`,
    `model: ${yamlString(options.model)}`,
    ...(tools.length > 0 ? ["tools:", ...tools.map(({ name }) => `  - ${yamlString(name)}`)] : []),
    "---",
  ];
  const sections = [
    frontmatter.join("\n"),
    template.instructions.join("\n\n"),
    "Tool calls are proposals. The host runtime validates and executes every tool call.",
    ...(template.reasoning
      ? ["## Reasoning", "```json", JSON.stringify(template.reasoning, null, 2), "```"]
      : []),
    ...(template.responseFormat
      ? [
          "## Response contract",
          `Return JSON matching the strict ${template.responseFormat.name} schema:`,
          "```json",
          JSON.stringify(template.responseFormat.schema, null, 2),
          "```",
        ]
      : []),
  ];
  return `${sections.join("\n\n")}\n`;
}