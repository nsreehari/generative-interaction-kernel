export const SAMPLE_CREDENTIAL_REFERENCES = {
  foundry: "foundry-agent/access-key",
  httpProxy: "http-proxy/access-key",
} as const;

export type SampleCredentialReference =
  typeof SAMPLE_CREDENTIAL_REFERENCES[keyof typeof SAMPLE_CREDENTIAL_REFERENCES];

export const SAMPLE_BLUEPRINT_CREDENTIAL_REFERENCES = [
  SAMPLE_CREDENTIAL_REFERENCES.foundry,
] as const satisfies readonly SampleCredentialReference[];

export function isSampleCredentialReference(reference: string): reference is SampleCredentialReference {
  return Object.values(SAMPLE_CREDENTIAL_REFERENCES).includes(reference as SampleCredentialReference);
}