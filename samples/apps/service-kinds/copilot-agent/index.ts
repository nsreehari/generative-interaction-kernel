import type { ServiceKindManifest } from "@gik/controlface";
import { createWorkerServiceKind } from "../worker-service-kind";
import manifestJson from "./manifest.json";

export const copilotAgentKind = createWorkerServiceKind(manifestJson as ServiceKindManifest);
