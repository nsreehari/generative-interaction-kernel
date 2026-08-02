import { runDeclarativeValidators } from "@gik/evaluators";
import type { Json } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  trialNode,
  type ComponentDescription,
  type DeclarativeComponentDefinition,
} from "../shared/definition";

export function defineFluentComponent(
  description: ComponentDescription,
  schema: Record<string, unknown>,
  component: ProjectionView,
  trialProps: Record<string, Json>,
): DeclarativeComponentDefinition {
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

  return {
    capability: description.capability,
    version: "1.0.0",
    summary: description.summary,
    dataProp: description.dataProp,
    slots: description.slots,
    events: description.events,
    semanticTokens: description.semanticTokens,
    defaultVariant: description.defaultVariant,
    variants: description.variants,
    authoring: description.authoring,
    component,
    describe: () => description,
    getSchema: () => propsSchema,
    validate: (props) => runDeclarativeValidators([{
      kind: "ajv-schema",
      schema: propsSchema,
      message: `Invalid ${description.capability} props`,
      code: `${description.capability.replace(":", "-")}-schema`,
    }], props as Json),
    materializeTrial: () => trialNode(description.capability, materializedTrialProps),
  };
}
