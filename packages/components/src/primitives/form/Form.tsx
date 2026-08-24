import React from "react";
import {
  Button,
  Checkbox,
  Dropdown,
  Field,
  Input,
  Option,
  Spinner,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular } from "@fluentui/react-icons";
import type { Json } from "@gik/kernel";
import {
  runDeclarativeValidators,
  validateDeclarativeFormValues,
  type DeclarativeFormSchema,
} from "@gik/evaluators";
import { readProps, resolveLayoutSlots, type ProjectionView } from "@gik/react";

import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import {
  componentLayoutPropsSchema,
  componentRootProps,
  withComponentStylePropsSchema,
} from "../../shared/component";

interface OptionValue {
  value: string;
  label: string;
}

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalL },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  span1: { gridColumn: "span 1" }, span2: { gridColumn: "span 2" },
  span3: { gridColumn: "span 3" }, span4: { gridColumn: "span 4" },
  span5: { gridColumn: "span 5" }, span6: { gridColumn: "span 6" },
  span7: { gridColumn: "span 7" }, span8: { gridColumn: "span 8" },
  span9: { gridColumn: "span 9" }, span10: { gridColumn: "span 10" },
  span11: { gridColumn: "span 11" }, span12: { gridColumn: "span 12" },
  actions: { display: "flex", justifyContent: "flex-end", gap: tokens.spacingHorizontalS },
  success: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteGreenForeground1,
  },
  // Fixed-height footer slot reserved for the actions row / saving state / success confirmation /
  // save error / nothing (a pristine, unsaved form shows neither). Keeping its height constant
  // across every state -- rather than only rendering a row when there's something to show --
  // avoids the surrounding layout jumping every time a save toggles between states.
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    height: "32px",
  },
  footerError: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorPaletteRedForeground1,
  },
  errors: { display: "grid", gap: tokens.spacingVerticalXXS, color: tokens.colorPaletteRedForeground1 },
  fullWidth: { width: "100%" },
  checkbox: { alignSelf: "end" },
});

function useDraftState<T>(incoming: T, initiallyDirty: boolean) {
  const signature = JSON.stringify(incoming);
  const [draft, setDraft] = React.useState(incoming);
  const [dirty, setDirty] = React.useState(initiallyDirty);
  React.useEffect(() => {
    setDraft(incoming);
    setDirty(initiallyDirty);
  }, [signature, initiallyDirty]);
  const reset = React.useCallback(() => {
    setDraft(incoming);
    setDirty(initiallyDirty);
  }, [signature, initiallyDirty]);
  return { draft, setDraft, dirty, setDirty, reset };
}

function optionsFrom(field: Record<string, unknown>, multiple = false): OptionValue[] {
  const source = multiple ? (field.items as Record<string, unknown> | undefined) ?? {} : field;
  if (Array.isArray(source.oneOf)) {
    return source.oneOf.map((item) => {
      const option = item as Record<string, unknown>;
      return { value: String(option.const ?? ""), label: String(option.title ?? option.const ?? "") };
    });
  }
  if (Array.isArray(field.options)) {
    return field.options.map((item) => typeof item === "string"
      ? { value: item, label: item }
      : { value: String((item as OptionValue).value), label: String((item as OptionValue).label) });
  }
  if (Array.isArray(source.enum)) {
    const names = Array.isArray(source.enumNames) ? source.enumNames : [];
    return source.enum.map((value, index) => ({ value: String(value ?? ""), label: String(names[index] ?? value ?? "") }));
  }
  return [];
}

function isJsonField(field: Record<string, unknown>) {
  return field.format === "json" || field.type === "json";
}

function isMultiSelect(field: Record<string, unknown>) {
  const items = (field.items ?? {}) as Record<string, unknown>;
  return field.type === "array" && (Array.isArray(items.enum) || Array.isArray(items.oneOf) || Array.isArray(field.options));
}

function isTextarea(field: Record<string, unknown>) {
  return field.format === "textarea" || field.multiline === true;
}

function inputType(field: Record<string, unknown>): "text" | "password" | "number" | "date" | "time" | "datetime-local" {
  if (field.format === "password" || field.secret === true) return "password";
  if (field.format === "date") return "date";
  if (field.format === "time") return "time";
  if (field.format === "date-time" || field.format === "datetime") return "datetime-local";
  return field.type === "number" || field.type === "integer" ? "number" : "text";
}

function fieldSpan(field: Record<string, unknown>): number {
  const explicit = field.colSpan ?? field.span;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.min(12, Math.max(1, Math.round(explicit)));
  const compact = field.type === "number" || field.type === "integer" || optionsFrom(field).length > 0
    || isMultiSelect(field) || ["date", "time", "date-time", "datetime"].includes(String(field.format));
  return compact && !isTextarea(field) ? 6 : 12;
}

function temporalValue(field: Record<string, unknown>, value: unknown): string {
  const text = value == null ? "" : String(value);
  if (field.format === "date") return text.slice(0, 10);
  if (field.format === "time") return text.slice(0, 5);
  if (field.format === "date-time" || field.format === "datetime") return text.slice(0, 16);
  return text;
}

export const Form: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const styles = useStyles();
  const schema = props.obj<DeclarativeFormSchema>(
    "fields",
    props.obj<DeclarativeFormSchema>("schema", { properties: {} }),
  );
  const fields = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const incoming = props.obj<Record<string, unknown>>("value", props.obj<Record<string, unknown>>("data", {}));
  const validationContext = props.obj<Record<string, Json>>("validationContext", {});
  const readOnly = props.bool("readOnly");
  const initiallyDirty = props.bool("initiallyDirty");
  // Whether the host Blueprint actually binds `saving`/`saveError` (as opposed to those props
  // simply being absent) -- present only when a Cell wires this Form to its own ordinary save
  // state (an author-declared `assign` set true at dispatch, cleared to false by the operation's
  // `settlement`/`failureSettlement` transform once it actually resolves). Untracked forms keep
  // the prior optimistic behavior below (success shown as soon as `save` is emitted).
  const savingTracked = node.props.saving !== undefined;
  const saving = props.bool("saving");
  const saveError = props.str("saveError");
  const { draft: values, setDraft: setValues, dirty, setDirty, reset } = useDraftState(incoming, initiallyDirty);
  const jsonKeys = Object.entries(fields).filter(([, field]) => isJsonField(field)).map(([key]) => key);
  const jsonSignature = jsonKeys.join("\u0000");
  const jsonTextFrom = React.useCallback((source: Record<string, unknown>) => Object.fromEntries(jsonKeys.map((key) => {
    const value = source[key];
    return [key, value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2)];
  })), [jsonSignature]);
  const [jsonText, setJsonText] = React.useState<Record<string, string>>(() => jsonTextFrom(incoming));
  const [jsonErrors, setJsonErrors] = React.useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  // Local, transient confirmation shown in place of the action row right after a successful save --
  // the commit itself (what `save` does with the values) is entirely the host Blueprint's concern;
  // this only reflects that *this* component's own submit just completed without error. Cleared by
  // any further edit, discard, or a genuinely new incoming value (the same signal that already resets
  // jsonText/validationErrors below), never by a timer -- so it stays visible until the user acts again.
  const [justSaved, setJustSaved] = React.useState(false);

  React.useEffect(() => {
    setJsonText(jsonTextFrom(incoming));
    setJsonErrors({});
    setValidationErrors([]);
    setJustSaved(false);
  }, [JSON.stringify(incoming), jsonTextFrom]);

  // Reacts to the tracked save this Form itself triggered actually settling -- not to `emit()`
  // returning, which (in the durable runtime) only resolves once the triggering event is queued,
  // long before the invoked service settles. The host Blueprint owns `saving` as ordinary state:
  // an `assign` sets it true at dispatch, and the operation's own `settlement`/`failureSettlement`
  // transform sets it back to false once the save actually resolves -- so a true-to-false edge on
  // `saving` here means *this* save just completed. Success clears the draft and shows `justSaved`;
  // failure leaves the draft (and its actions) in place so the user can retry, with `saveError`
  // shown alongside.
  const wasSavingRef = React.useRef(false);
  React.useEffect(() => {
    if (savingTracked && wasSavingRef.current && !saving && !saveError) {
      setDirty(false);
      setJustSaved(true);
    }
    wasSavingRef.current = saving;
  }, [saving, saveError, savingTracked]);

  const setField = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setJustSaved(false);
  };
  const setJsonField = (key: string, text: string) => {
    setJsonText((current) => ({ ...current, [key]: text }));
    setDirty(true);
    setJustSaved(false);
    if (!text.trim()) {
      setJsonErrors((current) => ({ ...current, [key]: "" }));
      setValues((current) => ({ ...current, [key]: undefined }));
      return;
    }
    try {
      const value = JSON.parse(text) as unknown;
      setJsonErrors((current) => ({ ...current, [key]: "" }));
      setValues((current) => ({ ...current, [key]: value }));
    } catch (error) {
      setJsonErrors((current) => ({ ...current, [key]: error instanceof Error ? error.message : "Invalid JSON" }));
    }
  };
  const discard = () => {
    reset();
    setJsonText(jsonTextFrom(incoming));
    setJsonErrors({});
    setValidationErrors([]);
    setJustSaved(false);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || saving) return;
    if (Object.values(jsonErrors).some(Boolean)) return;
    const report = validateDeclarativeFormValues(
      schema,
      values as Record<string, Json>,
      { bindings: validationContext },
    );
    setValidationErrors(report.errors.map((issue) => issue.detail));
    if (!report.ok) return;
    void emit("save", { values });
    if (!savingTracked) {
      setDirty(false);
      setJustSaved(true);
    }
  };
  const spanClasses = [styles.span1, styles.span2, styles.span3, styles.span4, styles.span5, styles.span6,
    styles.span7, styles.span8, styles.span9, styles.span10, styles.span11, styles.span12];
  const fieldLayout = resolveLayoutSlots(
    Object.entries(fields).map(([key, field]) => ({ key, content: { key, field } })),
    node.props.layout,
  );
  const fieldGroups = [
    { slot: "children", fields: fieldLayout.children },
    ...Object.entries(fieldLayout.slots).map(([slot, slottedFields]) => ({ slot, fields: slottedFields })),
  ].filter((group) => group.fields.length > 0);

  return (
    <form {...componentRootProps(node, styles.root)} onSubmit={submit}>
      {fieldGroups.map((group) => <div key={group.slot} className={mergeClasses(styles.grid, "gx-form-grid")} data-layout-slot={group.slot}>
        {group.fields.map(({ key, field }) => {
          const title = String(field.title ?? key);
          const hint = typeof field.description === "string" ? field.description : typeof field.hint === "string" ? field.hint : undefined;
          const disabled = readOnly || field.readOnly === true || field.disabled === true;
          const isRequired = required.has(key);
          const current = values[key];
          const span = fieldSpan(field);
          const className = mergeClasses(spanClasses[span - 1], "gx-field-cell", `gx-col-span-${span}`);
          const hintContent = hint ? <span className="gx-field-hint">{hint}</span> : undefined;
          if (isJsonField(field)) {
            const error = jsonErrors[key];
            return <Field key={key} className={className} label={title} hint={hintContent} required={isRequired} validationState={error ? "error" : "none"} validationMessage={error || undefined}>
              <Textarea className={styles.fullWidth} rows={Number(field.rows ?? 8)} resize="vertical" value={jsonText[key] ?? ""} placeholder={String(field.placeholder ?? "")} readOnly={disabled} onChange={(_, data) => setJsonField(key, data.value)} />
            </Field>;
          }
          if (field.type === "boolean") {
            return <Field key={key} className={mergeClasses(className, styles.checkbox)} hint={hintContent}><Checkbox label={title} checked={Boolean(current)} disabled={disabled} onChange={(_, data) => setField(key, data.checked)} /></Field>;
          }
          if (isMultiSelect(field)) {
            const selected = Array.isArray(current) ? current.map(String) : [];
            const options = optionsFrom(field, true);
            return <Field key={key} className={className} label={title} hint={hintContent} required={isRequired}>
              <Dropdown multiselect className={styles.fullWidth} selectedOptions={selected} value={options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(", ")} disabled={disabled} onOptionSelect={(_, data) => setField(key, data.selectedOptions)}>
                {options.map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
              </Dropdown>
            </Field>;
          }
          const options = optionsFrom(field);
          if (options.length > 0) {
            const value = current == null ? "" : String(current);
            return <Field key={key} className={className} label={title} hint={hintContent} required={isRequired}>
              <Dropdown className={styles.fullWidth} selectedOptions={value ? [value] : []} value={options.find((option) => option.value === value)?.label ?? ""} placeholder={String(field.placeholder ?? "All")} disabled={disabled} onOptionSelect={(_, data) => setField(key, data.optionValue ?? "")}>
                {options.map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
              </Dropdown>
            </Field>;
          }
          if (isTextarea(field)) {
            return <Field key={key} className={className} label={title} hint={hintContent} required={isRequired}>
              <Textarea className={styles.fullWidth} rows={Number(field.rows ?? 4)} resize="vertical" value={current == null ? "" : String(current)} placeholder={String(field.placeholder ?? "")} readOnly={disabled} minLength={typeof field.minLength === "number" ? field.minLength : undefined} maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined} onChange={(_, data) => setField(key, data.value)} />
            </Field>;
          }
          const type = inputType(field);
          return <Field key={key} className={className} label={title} hint={hintContent} required={isRequired}>
            <Input className={styles.fullWidth} type={type} value={temporalValue(field, current)} placeholder={String(field.placeholder ?? "")} readOnly={disabled} min={typeof field.minimum === "number" ? field.minimum : undefined} max={typeof field.maximum === "number" ? field.maximum : undefined} step={field.type === "integer" ? 1 : field.type === "number" ? "any" : undefined} minLength={type === "text" && typeof field.minLength === "number" ? field.minLength : undefined} maxLength={type === "text" && typeof field.maxLength === "number" ? field.maxLength : undefined} pattern={type === "text" && typeof field.pattern === "string" ? field.pattern : undefined} onChange={(_, data) => setField(key, type === "number" && data.value !== "" ? Number.parseFloat(data.value) : data.value)} />
          </Field>;
        })}
      </div>)}
      {validationErrors.length > 0 ? <div className={styles.errors} role="alert">{validationErrors.map((error) => <span key={error}>{error}</span>)}</div> : null}
      {readOnly ? null : (
        <div className={styles.footer}>
          {justSaved && !dirty ? (
            <div className={styles.success} role="status">
              <CheckmarkCircleRegular aria-hidden="true" />
              <span>{props.str("successLabel", "Saved")}</span>
            </div>
          ) : dirty ? (
            <>
              {saveError ? <span className={styles.footerError} role="alert" title={saveError}>{saveError}</span> : null}
              <div className={styles.actions}>
                <Button type="button" onClick={discard} disabled={saving}>{props.str("discardLabel", "Discard")}</Button>
                <Button
                  type="submit"
                  appearance="primary"
                  disabled={saving || Object.values(jsonErrors).some(Boolean)}
                  icon={saving ? <Spinner size="tiny" /> : undefined}
                >
                  {saving ? props.str("savingLabel", "Saving…") : props.str("saveLabel", "Save")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </form>
  );
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: { type: "object" }, schema: { type: "object" }, value: { type: "object" }, data: { type: "object" }, validationContext: { type: "object" },
    saveLabel: { type: "string" }, discardLabel: { type: "string" }, successLabel: { type: "string" }, savingLabel: { type: "string" },
    saving: { type: "boolean" }, saveError: { type: "string" },
    initiallyDirty: { type: "boolean" }, readOnly: { type: "boolean" },
    ...componentLayoutPropsSchema,
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:form",
  summary: "Renders a schema-driven committed form using Fluent 2 controls and emits saved values.",
  dataProp: "value",
  events: ["save"],
  eventContracts: { save: eventContract("The user commits the edited form values.", { values: { type: "object", additionalProperties: true } }) },
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["Users edit a schema-defined object and explicitly commit or discard the draft"],
    avoidWhen: ["Each field must emit immediately without an explicit commit", "The data is naturally edited as rows; use editable-table"],
    rules: ["Define fields through JSON Schema properties", "Handle save payload values", "Use readOnly for inspect-only forms", "Pass external validator bindings through validationContext", "Use initiallyDirty only for drafts not yet persisted", "Keep workflow effects outside the component", "The component itself shows a local success confirmation (successLabel) after a save with no further edits -- do not also author a separate saved-confirmation view for the common case", "For a save that resolves asynchronously in the host Blueprint (e.g. a durable service invoke), bind `saving`/`saveError` to ordinary Blueprint state the Cell's own behavior manages -- an `assign` sets `saving` true at dispatch, and the operation's `settlement`/`failureSettlement` transform sets it back to false (plus `saveError` on failure) -- rather than relying on the optimistic success shown as soon as `save` is emitted"],
  },
  agentFacing: {
    catalog: { interaction: "committed-input" },
    detail: {
      notes: ["Editing is draft-based; values are published only through save."],
    },
  },
};

const publicSchema = withComponentStylePropsSchema(schema);

export function validateForm(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema: publicSchema, message: "Invalid primitive:form props", code: "primitive-form-schema" }], props as Json);
}

export function materializeFormTrial() {
  return trialNode("primitive:form", {
    fields: { properties: { name: { type: "string", title: "Name" }, active: { type: "boolean", title: "Active" } }, required: ["name"] },
    value: { name: "Ada", active: true },
  });
}

export const formDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: Form,
  getSchema: () => publicSchema,
  validate: validateForm,
  materializeTrial: materializeFormTrial,
});