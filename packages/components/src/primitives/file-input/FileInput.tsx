import React from "react";
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";

const useStyles = makeStyles({
  root: { display: "inline-flex" },
  dropzone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "96px",
    width: "100%",
    padding: tokens.spacingVerticalL,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    cursor: "pointer",
  },
  active: {
    boxShadow: `inset 0 0 0 1px ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  disabled: { cursor: "not-allowed", opacity: 0.6 },
});

type ReadMode = "metadata" | "text" | "base64";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function serializeFile(file: File, readAs: ReadMode): Promise<Record<string, Json>> {
  const record: Record<string, Json> = {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  };
  if (readAs === "text") return { ...record, text: await file.text(), encoding: "text" };
  if (readAs === "base64") {
    return { ...record, content: bytesToBase64(new Uint8Array(await file.arrayBuffer())), encoding: "base64" };
  }
  return record;
}

export const FileInput: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const styles = useStyles();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const disabled = props.bool("disabled");
  const multiple = props.bool("multiple");
  const variant = props.str("variant", "button");
  const readAs = props.str("readAs", "metadata") as ReadMode;
  const accept = props.str("accept", "");
  const label = props.str("label", multiple ? "Choose files" : "Choose file");

  const acceptFiles = async (list: FileList | null) => {
    if (disabled) return;
    const selected = Array.from(list ?? []);
    const files = await Promise.all((multiple ? selected : selected.slice(0, 1)).map((file) => serializeFile(file, readAs)));
    if (files.length === 0) return;
    await emit("select", { files, ...(multiple ? {} : { file: files[0] }) });
    if (inputRef.current) inputRef.current.value = "";
  };
  const input = <input ref={inputRef} type="file" hidden accept={accept || undefined} multiple={multiple} disabled={disabled} onChange={(event) => void acceptFiles(event.currentTarget.files)} />;

  if (variant === "dropzone") {
    return <div {...componentRootProps(node, styles.root)}>
      <div
        className={mergeClasses(styles.dropzone, dragActive && styles.active, disabled && styles.disabled)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); void acceptFiles(event.dataTransfer.files); }}
      >{label}</div>
      {input}
    </div>;
  }

  return <span {...componentRootProps(node, styles.root)}>
    <Button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>{label}</Button>
    {input}
  </span>;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    accept: { type: "string" },
    multiple: { type: "boolean" },
    disabled: { type: "boolean" },
    variant: { enum: ["button", "dropzone"] },
    readAs: { enum: ["metadata", "text", "base64"] },
    ...componentStylePropsSchema,
  },
} as const;

const normalizedFileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "type", "size", "lastModified"],
  properties: {
    name: { type: "string" },
    type: { type: "string" },
    size: { type: "number" },
    lastModified: { type: "number" },
    text: { type: "string" },
    content: { type: "string" },
    encoding: { enum: ["text", "base64"] },
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:file-input",
  summary: "Selects or drops one or more files and emits JSON-serializable file records.",
  events: ["select"],
  eventContracts: {
    select: eventContract("Files were selected or dropped.", {
      files: { type: "array", items: normalizedFileSchema },
      file: normalizedFileSchema,
    }, ["files"]),
  },
  semanticTokens: [],
  defaultVariant: "button",
  variants: [
    { value: "button", summary: "Opens a native file picker from a compact button.", useWhen: ["File selection is a secondary command"] },
    { value: "dropzone", summary: "Accepts drag-and-drop and click selection.", useWhen: ["File acquisition is a primary workflow"] },
  ],
  authoring: {
    useWhen: ["A declarative workflow needs local files or attachments"],
    avoidWhen: ["The host must acquire files without user interaction"],
    rules: ["Use text for textual documents", "Use base64 only when binary content must cross the event boundary", "Use metadata when content stays browser-owned"],
  },
};

export function validateFileInput(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:file-input props", code: "primitive-file-input-schema" }], props as Json);
}

export function materializeFileInputTrial() {
  return trialNode("primitive:file-input", { label: "Attach files", multiple: true, variant: "dropzone", readAs: "metadata" });
}

export const fileInputDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: FileInput,
  getSchema: () => schema,
  validate: validateFileInput,
  materializeTrial: materializeFileInputTrial,
});
