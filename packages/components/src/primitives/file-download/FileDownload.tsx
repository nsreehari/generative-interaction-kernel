import React from "react";
import { Button } from "@fluentui/react-components";
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

function base64Bytes(content: string): Uint8Array<ArrayBuffer> {
  const binary = atob(content);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export const FileDownload: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const filename = props.str("filename", "download.txt");
  const content = props.str("content", "");
  const mediaType = props.str("mediaType", "text/plain");
  const encoding = props.str("encoding", "text");
  const disabled = props.bool("disabled");

  const download = () => {
    if (disabled) return;
    const body: BlobPart = encoding === "base64" ? base64Bytes(content) : content;
    const url = URL.createObjectURL(new Blob([body], { type: mediaType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    void emit("download", { filename });
  };

  return <Button {...componentRootProps(node)} type="button" disabled={disabled} onClick={download}>{props.str("label", "Download")}</Button>;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    filename: { type: "string", minLength: 1 },
    content: { type: "string" },
    mediaType: { type: "string" },
    encoding: { enum: ["text", "base64"] },
    disabled: { type: "boolean" },
    ...componentStylePropsSchema,
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:file-download",
  summary: "Downloads declaratively supplied text or base64 content as a local file.",
  events: ["download"],
  eventContracts: { download: eventContract("The file download was requested.", { filename: { type: "string" } }) },
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A workflow exposes generated or persisted content as a local download"],
    avoidWhen: ["A remote URL should be navigated directly"],
    rules: ["Bind filename and content from committed state", "Specify the media type", "Use base64 only for binary content"],
  },
};

export function validateFileDownload(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:file-download props", code: "primitive-file-download-schema" }], props as Json);
}

export function materializeFileDownloadTrial() {
  return trialNode("primitive:file-download", { label: "Download report", filename: "report.txt", content: "Ready", mediaType: "text/plain" });
}

export const fileDownloadDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: FileDownload,
  getSchema: () => schema,
  validate: validateFileDownload,
  materializeTrial: materializeFileDownloadTrial,
});
