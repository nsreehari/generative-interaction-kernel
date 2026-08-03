import { runDeclarativeValidators } from "@gik/evaluators";
import type { Json } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  defineComponent,
  trialNode,
  type ComponentDescription,
} from "../shared/definition";

export function defineFluentComponent(
  description: ComponentDescription,
  schema: Record<string, unknown>,
  component: ProjectionView,
  trialProps: Record<string, Json>,
): ReturnType<typeof defineComponent> {
  const variantValues = description.variants.map((variant) => variant.value);
  const propsSchema = variantValues.length === 0
    ? schema
    : {
        ...schema,
        properties: {
          ...(schema.properties as Record<string, unknown> | undefined),
          variant: { type: "string", enum: variantValues },
        },
      };
  const materializedTrialProps = description.defaultVariant && trialProps.variant === undefined
    ? { ...trialProps, variant: description.defaultVariant }
    : trialProps;

  return defineComponent({
    description,
    version: "1.0.0",
    component,
    getSchema: () => propsSchema,
    validate: (props) => runDeclarativeValidators([{
      kind: "ajv-schema",
      schema: propsSchema,
      message: `Invalid ${description.capability} props`,
      code: `${description.capability.replace(":", "-")}-schema`,
    }], props as Json),
    materializeTrial: () => trialNode(description.capability, materializedTrialProps),
  });
}
