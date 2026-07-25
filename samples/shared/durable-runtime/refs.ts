export type KindValueRef = { kind: string; value: string };

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function parseRef(ref: string): KindValueRef {
  if (!ref.startsWith("b64:")) throw new Error("Invalid durable ref format.");
  const parsed = JSON.parse(fromBase64Url(ref.slice(4))) as Partial<KindValueRef>;
  if (typeof parsed.kind !== "string" || typeof parsed.value !== "string") {
    throw new Error("Invalid durable ref payload.");
  }
  return { kind: parsed.kind, value: parsed.value };
}

export function assertSameRefKind(refs: string[]): string {
  const kinds = new Set(refs.map((ref) => parseRef(ref).kind));
  if (kinds.size !== 1) throw new Error("A durable transition cannot span storage provider kinds.");
  return [...kinds][0];
}