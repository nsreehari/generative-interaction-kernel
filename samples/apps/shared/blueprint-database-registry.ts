import {
  type BlueprintArtifact,
  type BlueprintReference,
  type HostedBlueprintResolutionContext,
} from "@gik/blueprint";

import { resolveSampleBlueprintSource } from "../../catalog/blueprint-catalog";
import type { BlueprintStorageConnectionFactory } from "./blueprint-storage";

interface StoredBlueprintEntry {
  ref?: unknown;
  artifact?: unknown;
  draft?: {
    ref?: unknown;
    artifact?: unknown;
  } | null;
}

const BLUEPRINT_STUDIO_ID = "blueprint-studio";
const BLUEPRINT_STUDIO_CRUD_ID = "blueprint-studio-crud";
const DRAFT_ID_SUFFIX = ".draft";

export function resolveBlueprintDatabaseRoot(
  context: HostedBlueprintResolutionContext,
  roots: Set<string>,
): string | undefined {
  if (context.parentBlueprintId === BLUEPRINT_STUDIO_ID) {
    roots.add(context.parentInstanceId);
    return context.parentInstanceId;
  }
  return [...roots]
    .filter((root) => context.parentInstanceId.startsWith(`${root}/cells/`))
    .sort((left, right) => right.length - left.length)[0];
}

export async function resolveBlueprintDatabaseArtifact(
  reference: BlueprintReference,
  databaseRootInstanceId: string | undefined,
  storage: BlueprintStorageConnectionFactory | undefined,
): Promise<BlueprintArtifact | undefined> {
  if (!storage || !databaseRootInstanceId) return undefined;

  const studio = resolveSampleBlueprintSource(BLUEPRINT_STUDIO_ID);
  const crud = resolveSampleBlueprintSource(BLUEPRINT_STUDIO_CRUD_ID);
  const instanceId = [
    databaseRootInstanceId,
    `${studio.payload.id}@${studio.payload.version}`,
    `${crud.payload.id}@${crud.payload.version}`,
  ].join("/services/");
  const connection = storage({ blueprintId: crud.payload.id, instanceId });
  const logicalId = reference.id.endsWith(DRAFT_ID_SUFFIX)
    ? reference.id.slice(0, -DRAFT_ID_SUFFIX.length)
    : reference.id;
  const stored = await connection.api.dispatch({
    ref: connection.ref,
    capability: "kv",
    operation: "read",
    args: [`blueprint:${logicalId}`],
  }) as StoredBlueprintEntry | null | undefined;
  if (!stored) return undefined;

  const draftRequested = reference.id.endsWith(DRAFT_ID_SUFFIX);
  const candidateRecord = draftRequested ? stored.draft : stored;
  const candidateRef = typeof candidateRecord?.ref === "string" ? candidateRecord.ref : undefined;
  const requestedVersion = reference.version;
  const candidate = candidateRef
    && (requestedVersion === undefined || candidateRef.endsWith(`@${requestedVersion}`))
    ? candidateRecord?.artifact
    : undefined;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  return candidate as BlueprintArtifact;
}
