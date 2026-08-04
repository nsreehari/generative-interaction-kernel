import React from "react";
import {
  Checkbox,
  Field,
  List,
  ListItem,
  Text,
} from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../../shared/component";

interface TodoListFields {
  properties?: Record<string, Record<string, unknown>>;
}

export function updateTodoListValues(
  values: Readonly<Record<string, boolean>>,
  key: string,
  checked: boolean,
): Record<string, boolean> {
  return { ...values, [key]: checked };
}

export const TodoList: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const fields = props.obj<TodoListFields>("fields", {});
  const properties = fields.properties ?? {};
  const incoming = props.obj<Record<string, boolean>>("value", {});
  const incomingSignature = JSON.stringify(incoming);
  const [values, setValues] = React.useState(incoming);
  const compact = node.props.variant === "compact";

  React.useEffect(() => setValues(incoming), [incomingSignature]);

  return (
    <div {...componentRootProps(node)}>
      {Object.keys(properties).length === 0 ? <Text>{props.str("emptyText", "Nothing here yet.")}</Text> : null}
      <List aria-label={props.str("ariaLabel", "Todo list")}>
        {Object.entries(properties).map(([key, field]) => {
          const title = String(field.title ?? key);
          const hint = typeof field.description === "string" ? field.description : typeof field.hint === "string" ? field.hint : undefined;
          const checked = Boolean(values[key]);
          return (
          <ListItem key={key}>
            <Field hint={hint}>
              <Checkbox
                checked={checked}
                size={compact ? "medium" : "large"}
                label={<Text strikethrough={checked}>{title}</Text>}
                disabled={field.readOnly === true || field.disabled === true}
                onChange={(_, data) => {
                  const nextValues = updateTodoListValues(values, key, data.checked === true);
                  setValues(nextValues);
                  void emit("save", { values: nextValues });
                }}
              />
            </Field>
          </ListItem>
          );
        })}
      </List>
    </div>
  );
};

const checkboxFieldSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "title"],
  properties: {
    type: { const: "boolean" },
    title: { type: "string" },
    description: { type: "string" },
    hint: { type: "string" },
    readOnly: { type: "boolean" },
    disabled: { type: "boolean" },
  },
} as const;

const publicSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["fields", "value"],
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      required: ["properties"],
      properties: {
        properties: { type: "object", additionalProperties: checkboxFieldSchema },
      },
    },
    value: { type: "object", additionalProperties: { type: "boolean" } },
    variant: { type: "string", enum: ["standard", "compact"] },
    ariaLabel: { type: "string" },
    emptyText: { type: "string" },
  },
} as const);

const description: ComponentDescription = {
  capability: "primitive:todo-list",
  summary: "Renders boolean form fields as a todo list and immediately saves each changed value.",
  dataProp: "value",
  events: ["save"],
  eventContracts: { save: eventContract("A todo change commits the complete next values object.", { values: { type: "object", additionalProperties: { type: "boolean" } } }) },
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Uses standard Fluent control sizing.", useWhen: ["The todo editor appears in a normal panel or form"] },
    { value: "compact", summary: "Uses native compact Fluent control sizing.", useWhen: ["The todo editor appears in a dense or constrained surface"] },
  ],
  authoring: {
    useWhen: ["Boolean form fields should be presented as immediately committed todo items"],
    avoidWhen: ["Values require an explicit Save or Discard step; use primitive:form", "Items are read-only; use fluent:list"],
    rules: ["Define every field as a titled boolean property", "Provide values as a keyed boolean object", "Handle each save payload values object as the complete next value", "Keep persistence outside the component"],
  },
};

export function validateTodoList(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: publicSchema,
    message: "Invalid primitive:todo-list props",
    code: "primitive-todo-list-schema",
  }], props as Json);
}

export function materializeTodoListTrial() {
  return trialNode("primitive:todo-list", {
    variant: "standard",
    fields: {
      properties: {
        shipComponent: { type: "boolean", title: "Ship the component" },
        publishDocs: { type: "boolean", title: "Publish the docs" },
      },
    },
    value: { shipComponent: false, publishDocs: true },
  });
}

export const todoListDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: TodoList,
  getSchema: () => publicSchema,
  validate: validateTodoList,
  materializeTrial: materializeTodoListTrial,
});