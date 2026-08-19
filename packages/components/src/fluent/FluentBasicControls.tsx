import React from "react";
import {
  Field,
  Input,
  SearchBox,
  Tab,
  TabList,
  Tag,
  TagGroup,
  Textarea,
} from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

import { eventContract, type ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";
import { FLUENT_CONTROL_SIZES, resolveControlSize, STANDARD_COMPACT_VARIANTS } from "./fluentVariants";
import { fluentOptionSchema, readFluentOptions } from "./readFluentOptions";

  function useSyncedValue(incoming: string): [string, React.Dispatch<React.SetStateAction<string>>] {
    const [value, setValue] = React.useState(incoming);
    React.useEffect(() => setValue(incoming), [incoming]);
    return [value, setValue];
  }

  export const FluentTextField: ProjectionView = ({ node, emit }) => {
    const props = readProps(node);
    return (
      <Field {...componentRootProps(node)} label={props.str("label") || undefined} required={props.bool("required")}>
        <Input
          type={props.bool("secret") ? "password" : "text"}
          size={resolveControlSize(props.str("size"), node.props.variant)}
          value={props.str("value")}
          placeholder={props.str("placeholder") || undefined}
          disabled={props.bool("disabled")}
          onChange={(_, data) => void emit("input", { value: data.value })}
        />
      </Field>
    );
  };

  export const FluentTextarea: ProjectionView = ({ node, emit }) => {
    const props = readProps(node);
    const rows = typeof node.props.rows === "number" ? node.props.rows : undefined;
    return (
      <Field {...componentRootProps(node)} label={props.str("label") || undefined} required={props.bool("required")}>
        <Textarea
          rows={rows}
          size={resolveControlSize(props.str("size"), node.props.variant)}
          value={props.str("value")}
          placeholder={props.str("placeholder") || undefined}
          disabled={props.bool("disabled")}
          onChange={(_, data) => void emit("input", { value: data.value })}
        />
      </Field>
    );
  };

  export const FluentSearchbox: ProjectionView = ({ node, emit }) => {
    const props = readProps(node);
    const [value, setValue] = useSyncedValue(props.str("value"));
    const label = props.str("label");
    return (
      <form
        {...componentRootProps(node)}
        onSubmit={(event) => {
          event.preventDefault();
          void emit("submit", { value });
        }}
      >
        <Field label={label || undefined} required={props.bool("required")}>
          <SearchBox
            value={value}
            size={resolveControlSize(props.str("size"), node.props.variant)}
            placeholder={props.str("placeholder") || undefined}
            disabled={props.bool("disabled")}
            aria-label={props.str("ariaLabel") || label || undefined}
            onChange={(_, data) => setValue(data.value)}
          />
        </Field>
      </form>
    );
  };

  export const FluentTabBar: ProjectionView = ({ node, emit, children }) => {
    const props = readProps(node);
    const legacyOptions = readFluentOptions(node.props.options);
    const tabs = Array.isArray(node.props.tabs)
      ? node.props.tabs.flatMap((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
          const tab = candidate as Record<string, unknown>;
          if (typeof tab.value !== "string" || typeof tab.headerLabel !== "string") return [];
          return [{
            value: tab.value,
            label: tab.headerLabel,
            disabled: tab.disabled === true,
          }];
        })
      : legacyOptions;
    const panes = React.Children.toArray(children);
    const controlled = typeof node.props.active === "string";
    const [localActive, setLocalActive] = React.useState(
      () => props.str("defaultActive") || tabs[0]?.value,
    );
    const requestedActive = controlled ? props.str("active") : localActive;
    const active = tabs.some((tab) => tab.value === requestedActive)
      ? requestedActive
      : tabs[0]?.value;
    const activeIndex = tabs.findIndex((tab) => tab.value === active);
    const activePane = activeIndex >= 0 ? panes[activeIndex] : undefined;
    return (
      <div {...componentRootProps(node)}>
        <TabList
          selectedValue={active}
          size={resolveControlSize(props.str("size"), node.props.variant)}
          aria-label={props.str("ariaLabel") || undefined}
          disabled={props.bool("disabled")}
          onTabSelect={(_, data) => {
            const value = String(data.value);
            if (!controlled) setLocalActive(value);
            void emit("select", { value });
          }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} value={tab.value} disabled={tab.disabled}>{tab.label}</Tab>
          ))}
        </TabList>
        {node.props.tabs === undefined
          ? panes
          : activePane === undefined ? null : <div role="tabpanel">{activePane}</div>}
      </div>
    );
  };

  export const FluentChips: ProjectionView = ({ node, emit }) => {
    const props = readProps(node);
    const items = readFluentOptions(node.props.items);
    const size = props.str("size");
    const resolvedSize = size === "extra-small" || size === "small" || size === "medium"
      ? size
      : node.props.variant === "compact" ? "small" : undefined;
    return (
      <TagGroup
        {...componentRootProps(node)}
        dismissible
        disabled={props.bool("disabled")}
        aria-label={props.str("ariaLabel") || undefined}
        onDismiss={(_, data) => void emit("remove", { value: String(data.value) })}
      >
        {items.map((item) => <Tag key={item.value} value={item.value} disabled={item.disabled} size={resolvedSize}>{item.label}</Tag>)}
      </TagGroup>
    );
  };

  const stringProperty = { type: "string" } as const;
  const inputProperties = {
    value: stringProperty,
    label: stringProperty,
    placeholder: stringProperty,
    required: { type: "boolean" },
    disabled: { type: "boolean" },
    size: { type: "string", enum: FLUENT_CONTROL_SIZES },
  } as const;
  const textFieldSchema = withComponentStylePropsSchema({
    type: "object",
    additionalProperties: false,
    properties: { ...inputProperties, secret: { type: "boolean" } },
  } as const);
  const textareaSchema = withComponentStylePropsSchema({
    type: "object",
    additionalProperties: false,
    properties: { ...inputProperties, rows: { type: "number", minimum: 1 } },
  } as const);
  const searchboxSchema = withComponentStylePropsSchema({
    type: "object",
    additionalProperties: false,
    properties: { ...inputProperties, ariaLabel: stringProperty },
  } as const);
  const tabBarSchema = withComponentStylePropsSchema({
    type: "object",
    additionalProperties: false,
    anyOf: [
      { required: ["tabs"] },
      { required: ["options"] },
    ],
    properties: {
      active: stringProperty,
      defaultActive: stringProperty,
      ariaLabel: stringProperty,
      disabled: { type: "boolean" },
      size: { type: "string", enum: FLUENT_CONTROL_SIZES },
      tabs: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "headerLabel"],
          properties: {
            value: { type: "string", minLength: 1 },
            headerLabel: { type: "string", minLength: 1 },
            disabled: { type: "boolean" },
          },
        },
      },
      options: { type: "array", items: fluentOptionSchema },
    },
  } as const);
  const chipsSchema = withComponentStylePropsSchema({
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      ariaLabel: stringProperty,
      disabled: { type: "boolean" },
      size: { type: "string", enum: ["extra-small", ...FLUENT_CONTROL_SIZES] },
      items: { type: "array", items: fluentOptionSchema },
    },
  } as const);

  const textFieldDescription: ComponentDescription = {
    capability: "fluent:text-field",
    summary: "Renders a Fluent 2 text input that emits each edited value.",
    dataProp: "value",
    events: ["input"],
    eventContracts: { input: eventContract("The edited text value changes.", { value: { type: "string" } }) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: {
      useWhen: ["A short text value must update as the user types"],
      avoidWhen: ["The value requires multiple lines", "The value should commit only on form submission"],
      rules: ["Use secret only for obscured text entry", "Handle input outside the component"],
    },
  };
  const textareaDescription: ComponentDescription = {
    capability: "fluent:textarea",
    summary: "Renders a Fluent 2 multiline input that emits each edited value.",
    dataProp: "value",
    events: ["input"],
    eventContracts: { input: eventContract("The edited multiline value changes.", { value: { type: "string" } }) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: {
      useWhen: ["A multiline text value must update as the user types"],
      avoidWhen: ["The value is short enough for a text field", "The value should commit only on form submission"],
      rules: ["Use rows only when the authored surface requires a specific initial height", "Handle input outside the component"],
    },
  };
  const searchboxDescription: ComponentDescription = {
    capability: "fluent:searchbox",
    summary: "Renders a Fluent 2 search box that emits its value when submitted.",
    dataProp: "value",
    events: ["submit"],
    eventContracts: { submit: eventContract("The user submits the search value.", { value: { type: "string" } }) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: {
      useWhen: ["A search or filtering value should be committed explicitly"],
      avoidWhen: ["Every keystroke must update the result set; use text-field"],
      rules: ["Provide label or ariaLabel", "Handle submit outside the component"],
    },
  };
  const tabBarDescription: ComponentDescription = {
    capability: "fluent:tab-bar",
    summary: "Renders Fluent 2 tabs and their ordered authored panes as one composed region.",
    dataProp: "tabs",
    events: ["select"],
    eventContracts: { select: eventContract("The active tab changes.", { value: { type: "string" } }) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: {
      useWhen: ["Peer views share one region and exactly one is active"],
      avoidWhen: ["The choices set a form value rather than switching views"],
      rules: [
        "Provide stable tab values and headerLabel values",
        "Place one authored child for each tab, in the same order",
        "Prefer local tab state and use defaultActive only to choose the initial tab",
        "Bind active only when application behavior, persistence, or cross-Cell coordination controls the active tab",
        "Handle select only when the application needs to observe or control tab selection",
      ],
    },
  };
  const chipsDescription: ComponentDescription = {
    capability: "fluent:chips",
    summary: "Renders a Fluent 2 group of dismissible tags.",
    dataProp: "items",
    events: ["remove"],
    eventContracts: { remove: eventContract("The user removes a chip.", { value: { type: "string" } }) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: {
      useWhen: ["Users need to review and remove a compact set of discrete values"],
      avoidWhen: ["Values are read-only", "Users must add values within the same control"],
      rules: ["Provide stable item values and labels", "Handle remove outside the component"],
    },
  };

  export const fluentTextFieldDefinition = defineFluentComponent(textFieldDescription, textFieldSchema, FluentTextField, {
    label: "Name",
    value: "Ada",
  });
  export const fluentTextareaDefinition = defineFluentComponent(textareaDescription, textareaSchema, FluentTextarea, {
    label: "Notes",
    value: "Draft",
    rows: 4,
  });
  export const fluentSearchboxDefinition = defineFluentComponent(searchboxDescription, searchboxSchema, FluentSearchbox, {
    label: "Search incidents",
    value: "credential access",
  });
  export const fluentTabBarDefinition = defineFluentComponent(tabBarDescription, tabBarSchema, FluentTabBar, {
    defaultActive: "all",
    ariaLabel: "Incident views",
    tabs: [{ value: "all", headerLabel: "All" }, { value: "open", headerLabel: "Open" }],
  });
  export const fluentChipsDefinition = defineFluentComponent(chipsDescription, chipsSchema, FluentChips, {
    ariaLabel: "Selected techniques",
    items: [{ value: "credential-access", label: "Credential access" }],
  });
