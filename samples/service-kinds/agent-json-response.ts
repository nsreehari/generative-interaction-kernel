import type { Json } from "@gik/kernel";

function hasOnlyUnclosedRootObject(value: string): boolean {
  const stack: Array<{ token: "{" | "["; index: number }> = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const token = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (token === "\\") escaped = true;
      else if (token === "\"") inString = false;
      continue;
    }
    if (token === "\"") inString = true;
    else if (token === "{" || token === "[") stack.push({ token, index });
    else if (token === "}" || token === "]") {
      const opened = stack.pop();
      if (!opened || (opened.token === "{") !== (token === "}")) return false;
    }
  }
  return !inString
    && stack.length === 1
    && stack[0].token === "{"
    && stack[0].index === value.search(/\S/);
}

export function parseAgentJsonReply(provider: string, reply: string): Json {
  try {
    return JSON.parse(reply) as Json;
  } catch (error) {
    if (hasOnlyUnclosedRootObject(reply)) {
      try {
        return JSON.parse(`${reply}}`) as Json;
      } catch {
        // Report the original parse failure below.
      }
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${provider} returned invalid JSON (${detail}; length=${reply.length})`, { cause: error });
  }
}
