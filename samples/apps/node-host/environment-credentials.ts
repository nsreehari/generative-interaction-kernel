import {
  SAMPLE_CREDENTIAL_REFERENCES,
  type SampleCredentialReference,
} from "../../service-kinds/credential-references";

export const SAMPLE_CREDENTIAL_ENVIRONMENT_VARIABLES: Record<SampleCredentialReference, string> = {
  [SAMPLE_CREDENTIAL_REFERENCES.foundry]: "GIK_FOUNDRY_ACCESS_KEY",
  [SAMPLE_CREDENTIAL_REFERENCES.httpProxy]: "GIK_HTTP_PROXY_ACCESS_KEY",
};

export function createEnvironmentCredentialResolver(
  environment: Readonly<Record<string, string | undefined>>,
): (reference: string) => Promise<string> {
  return async (reference) => {
    const variable = SAMPLE_CREDENTIAL_ENVIRONMENT_VARIABLES[reference as SampleCredentialReference];
    if (!variable) throw new Error(`Unknown credential reference '${reference}'`);
    const value = environment[variable]?.trim();
    if (!value) throw new Error(`Environment variable '${variable}' is required for '${reference}'`);
    return value;
  };
}