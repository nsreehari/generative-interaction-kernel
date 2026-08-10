import assert from "node:assert/strict";
import { test } from "vitest";
import { getSampleBlueprintCatalog } from "../shared/blueprint-catalog";
import {
  isSampleCredentialReference,
  SAMPLE_CREDENTIAL_REFERENCES,
} from "../services/host/credential-references";
import {
  createEnvironmentCredentialResolver,
  SAMPLE_CREDENTIAL_ENVIRONMENT_VARIABLES,
} from "../services/host/environment-credentials";
import {
  clearBrowserCredential,
  FUNCTION_ACCESS,
  resolveBrowserCredential,
  setFunctionAccessKey,
} from "../services/host/function-access";
import { createHeadlessServiceRegistryOptions } from "../services/host/headless-service-runtime";
import { createSampleServiceRegistryOptions } from "../services/host/service-registry-options";
import { browserServiceRegistryOptions } from "../services/host/service-runtime";

function collectCredentialReferences(value: unknown, references: string[] = []): string[] {
  if (!value || typeof value !== "object") return references;
  if (Array.isArray(value)) {
    for (const entry of value) collectCredentialReferences(entry, references);
    return references;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "credentialRef" && typeof entry === "string") references.push(entry);
    collectCredentialReferences(entry, references);
  }
  return references;
}

function credentialLikePaths(value: unknown, parent = "", paths: string[] = []): string[] {
  if (!value || typeof value !== "object") return paths;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => credentialLikePaths(entry, `${parent}[${index}]`, paths));
    return paths;
  }
  for (const [key, entry] of Object.entries(value)) {
    const path = parent ? `${parent}.${key}` : key;
    if (/access.?key|credential|secret|token/i.test(key)) paths.push(path);
    credentialLikePaths(entry, path, paths);
  }
  return paths;
}

test("all registered sample credential references use the host-owned catalog", () => {
  const found = new Set<string>();
  const catalog = getSampleBlueprintCatalog();
  for (const id of catalog.blueprints) {
    const blueprint = catalog.entries[id];
    for (const reference of collectCredentialReferences(blueprint)) {
      assert.equal(isSampleCredentialReference(reference), true, `${id} uses unknown credential reference '${reference}'`);
      found.add(reference);
    }
    assert.deepEqual(credentialLikePaths(blueprint.payload.context), [], `${id} stores credential-like data in Blueprint context`);
    assert.deepEqual(credentialLikePaths(blueprint.payload.runtime.state), [], `${id} stores credential-like data in application state`);
  }
  assert.deepEqual([...found].sort(), Object.values(SAMPLE_CREDENTIAL_REFERENCES).sort());
});

test("browser credential resolution reads the existing GitHub Pages localStorage keys", async () => {
  const values = new Map<string, string>([
    [FUNCTION_ACCESS.foundry.storageKey, " browser-foundry-key "],
    [FUNCTION_ACCESS["http-proxy"].storageKey, "browser-http-key"],
  ]);
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    assert.equal(await resolveBrowserCredential(SAMPLE_CREDENTIAL_REFERENCES.foundry), "browser-foundry-key");
    assert.equal(await resolveBrowserCredential(SAMPLE_CREDENTIAL_REFERENCES.httpProxy), "browser-http-key");
    clearBrowserCredential(SAMPLE_CREDENTIAL_REFERENCES.foundry);
    assert.equal(values.has(FUNCTION_ACCESS.foundry.storageKey), false);
    assert.equal(values.has(FUNCTION_ACCESS["http-proxy"].storageKey), true);
    setFunctionAccessKey("foundry", "replacement-foundry-key");
    assert.equal(values.get(FUNCTION_ACCESS.foundry.storageKey), "replacement-foundry-key");
    await assert.rejects(() => resolveBrowserCredential("unknown/access-key"), /Unknown credential reference/);
    assert.throws(() => clearBrowserCredential("unknown/access-key"), /Unknown credential reference/);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
  }
});

test("headless credential resolution uses explicit environment variables", async () => {
  const resolve = createEnvironmentCredentialResolver({
    GIK_FOUNDRY_ACCESS_KEY: " headless-foundry-key ",
    GIK_HTTP_PROXY_ACCESS_KEY: "headless-http-key",
  });
  assert.equal(await resolve(SAMPLE_CREDENTIAL_REFERENCES.foundry), "headless-foundry-key");
  assert.equal(await resolve(SAMPLE_CREDENTIAL_REFERENCES.httpProxy), "headless-http-key");
  assert.equal(
    SAMPLE_CREDENTIAL_ENVIRONMENT_VARIABLES[SAMPLE_CREDENTIAL_REFERENCES.httpProxy],
    "GIK_HTTP_PROXY_ACCESS_KEY",
  );
  await assert.rejects(
    () => createEnvironmentCredentialResolver({})(SAMPLE_CREDENTIAL_REFERENCES.foundry),
    /GIK_FOUNDRY_ACCESS_KEY.*required/,
  );
  await assert.rejects(() => resolve("unknown/access-key"), /Unknown credential reference/);
});

test("headless registry options use environment credentials and endpoint policy", async () => {
  const options = createHeadlessServiceRegistryOptions({
    GIK_FOUNDRY_ACCESS_KEY: "foundry-key",
    GIK_HTTP_PROXY_ACCESS_KEY: "http-key",
    GIK_FOUNDRY_PROXY_ORIGIN: "https://foundry.example/path",
    GIK_HTTP_PROXY_ORIGIN: "https://http.example/path",
  });

  assert.equal(await options.resolveCredential?.(SAMPLE_CREDENTIAL_REFERENCES.foundry), "foundry-key");
  assert.equal(await options.authorizeEndpoint?.("foundry-agent", new URL("https://foundry.example/agents")), true);
  assert.equal(await options.authorizeEndpoint?.("http-service", new URL("https://http.example/proxy")), true);
  assert.equal(await options.authorizeEndpoint?.("http-service", new URL("https://foundry.example/proxy")), false);
});

test("HTTP authentication failures clear the credential through the active host adapter", async () => {
  const cleared: string[] = [];
  const options = createSampleServiceRegistryOptions({
    resolveCredential: async () => "rejected-key",
    clearCredential: (reference) => { cleared.push(reference); },
  }, {
    foundryProxyOrigin: "https://foundry.example",
    httpProxyOrigin: "https://http.example",
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    await assert.rejects(() => options.execute?.({
      kind: "http-service",
      declaration: {
        kind: "http-service",
        version: "1",
        operations: {},
        config: {
          endpoint: "https://http.example",
          credentialRef: SAMPLE_CREDENTIAL_REFERENCES.httpProxy,
        },
      },
      operation: "check-access",
      input: null,
    }), /HTTP proxy returned 401/);
    assert.deepEqual(cleared, [SAMPLE_CREDENTIAL_REFERENCES.httpProxy]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("browser services require the host-owned credential resolver in every environment", () => {
  assert.equal(browserServiceRegistryOptions.resolveCredential, resolveBrowserCredential);
});