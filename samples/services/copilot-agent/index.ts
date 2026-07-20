import type { ServiceKindManifest } from "../../../face/src/services/service-kinds";
import { createWorkerServiceKind } from "../worker-service-kind";
import manifestJson from "./manifest.json";

export const copilotAgentKind = createWorkerServiceKind(manifestJson as ServiceKindManifest);
