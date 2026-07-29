import type { Json } from "@gik/kernel";
import {
  bundleFromJson,
  setOp,
  type Bundle,
} from "@gik/react";
import uiFormPropsSchema from "../../../schemas/ui-form.schema.json" with { type: "json" };
import demoRunnerBundleJson from "./demoRunnerBundle.json" with { type: "json" };
import { demoRunnerEffects, demoRunnerLeaves } from "./demoRunnerLeaves";
import { fluentLeaves } from "./fluentLeaves";

export interface DemoRunnerHostCallbacks {
  onSelectDemo?: (demoId: string) => void;
  onSetExternalContext?: (values: Record<string, Json>) => void;
}

function asRecord(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

export function createDemoRunnerHostBundle(
  stateSeed?: Record<string, unknown>,
  callbacks?: DemoRunnerHostCallbacks,
): Bundle {
  const source = structuredClone(demoRunnerBundleJson);
  const capabilities = source.vocabulary.payload.capabilities as Record<string, { propsSchema: object }>;
  capabilities["ui:form"].propsSchema = structuredClone(uiFormPropsSchema);
  const state = source.state as Record<string, unknown>;
  if (stateSeed) Object.assign(state, stateSeed);

  return bundleFromJson(source, {
    effectHandlers: {
      ...demoRunnerEffects,
      selectDemo(ctx) {
        const value = String(ctx.payload.value ?? "");
        if (!value) return { outcome: "ignored" };
        callbacks?.onSelectDemo?.(value);
        return { outcome: "selected", ops: [setOp("runner.selectedDemoId", value)] };
      },
      setExternalContext(ctx) {
        const values = asRecord(ctx.payload.values as Json);
        callbacks?.onSetExternalContext?.(structuredClone(values));
        return { outcome: "updated" };
      },
    },
    projectionViews: {
      ...demoRunnerLeaves,
      ...fluentLeaves,
    },
  });
}
