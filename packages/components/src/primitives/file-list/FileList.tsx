import React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
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
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, margin: 0, padding: 0, listStyleType: "none" },
  item: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, padding: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  metadata: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  empty: { color: tokens.colorNeutralForeground3 },
});

type FileRecord = Record<string, Json>;

function formatSize(value: Json | undefined): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileList: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const styles = useStyles();
  const files = Array.isArray(node.props.files) ? node.props.files as FileRecord[] : [];
  const removable = props.bool("removable");
  if (files.length === 0) return <div {...componentRootProps(node, styles.empty)}>{props.str("emptyText", "No files")}</div>;

  return <ul {...componentRootProps(node, styles.root)}>
    {files.map((file, index) => {
      const name = String(file.name ?? `File ${index + 1}`);
      const url = typeof file.url === "string" ? file.url : "";
      const size = formatSize(file.size);
      return <li className={styles.item} key={String(file.id ?? `${name}-${index}`)}>
        {url
          ? <a className={styles.name} href={url} download={name} onClick={() => void emit("download", { index, file })}>{name}</a>
          : <button className={styles.name} type="button" onClick={() => void emit("select", { index, file })}>{name}</button>}
        {size ? <span className={styles.metadata}>{size}</span> : null}
        {removable ? <Button size="small" appearance="subtle" type="button" onClick={() => void emit("remove", { index, file })}>Remove</Button> : null}
      </li>;
    })}
  </ul>;
};

const fileSchema = {
  type: "object",
  additionalProperties: true,
  required: ["name"],
  properties: {
    id: { type: ["string", "number"] },
    name: { type: "string" },
    type: { type: "string" },
    size: { type: "number" },
    url: { type: "string" },
  },
} as const;
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    files: { type: "array", items: fileSchema },
    removable: { type: "boolean" },
    emptyText: { type: "string" },
    ...componentStylePropsSchema,
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:file-list",
  summary: "Presents normalized file records with optional download and removal actions.",
  dataProp: "files",
  events: ["select", "download", "remove"],
  eventContracts: {
    select: eventContract("A non-downloadable file was selected.", { index: { type: "integer" }, file: fileSchema }),
    download: eventContract("A URL-backed file download was requested.", { index: { type: "integer" }, file: fileSchema }),
    remove: eventContract("A file removal was requested.", { index: { type: "integer" }, file: fileSchema }),
  },
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A workflow presents uploaded, staged, or downloadable files"],
    avoidWhen: ["Only one command-style download is needed; use file-download"],
    rules: ["Bind JSON-serializable normalized file records", "Keep upload and storage effects outside the component", "Provide URLs only for host-authorized downloads"],
  },
};

export function validateFileList(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:file-list props", code: "primitive-file-list-schema" }], props as Json);
}

export function materializeFileListTrial() {
  return trialNode("primitive:file-list", { files: [{ name: "report.pdf", type: "application/pdf", size: 2048, url: "/report.pdf" }], removable: true });
}

export const fileListDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: FileList,
  getSchema: () => schema,
  validate: validateFileList,
  materializeTrial: materializeFileListTrial,
});
