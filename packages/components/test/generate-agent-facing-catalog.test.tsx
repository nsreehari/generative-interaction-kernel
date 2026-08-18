import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { componentDefinitions } from "../src/shared/registry";
import { createAgentFacingCapabilityCatalog } from "../src/shared/component-authoring-internal";

test("generate renderer-free agent-facing capability catalog", () => {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = resolve(packageRoot, "src", "generated", "agent-facing-capability-catalog.ts");
  const catalog = createAgentFacingCapabilityCatalog(componentDefinitions);
  const source = [
    'import type { AgentFacingCapabilityCatalog } from "../shared/agent-facing";',
    "",
    `export const agentFacingComponentCatalog: AgentFacingCapabilityCatalog = ${JSON.stringify(catalog, null, 2)};`,
    "",
  ].join("\n");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, source, "utf8");
  console.log(`Generated ${Object.keys(catalog.catalog).length} agent-facing capability contracts.`);
});
