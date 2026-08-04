import React from "react";
import { Badge, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema, readPath, records, textAt } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";
import { SOURCE_LINE_CHANGES, sourceLinePrefix, sourceLineText, type SourceLineChange, type SourceViewerLine } from "../../shared/sourceLines";

export const SOURCE_VIEWER_VARIANTS = ["standard", "compact"] as const;
export const SOURCE_VIEWER_KINDS = ["source", "unified-diff", "split-diff"] as const;
type SourceViewerVariant = typeof SOURCE_VIEWER_VARIANTS[number];
type SourceViewerKind = typeof SOURCE_VIEWER_KINDS[number];

interface SourceViewerSpec {
  kind: SourceViewerKind;
  title?: string;
  description?: string;
  sourceLabel?: string;
  language?: string;
  emptyText?: string;
  wrap?: boolean;
  fields: {
    id?: string;
    number?: string;
    text?: string;
    beforeNumber?: string;
    beforeText?: string;
    afterNumber?: string;
    afterText?: string;
    annotation?: string;
    change?: string;
  };
}

const fieldSchema = { type: "string", minLength: 1 } as const;
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["lines", "spec"],
  properties: {
    ...componentStylePropsSchema,
    lines: { type: "array", items: { type: "object" } },
    variant: { enum: SOURCE_VIEWER_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "fields"],
      properties: {
        kind: { enum: SOURCE_VIEWER_KINDS },
        title: { type: "string" },
        description: { type: "string" },
        sourceLabel: { type: "string" },
        language: { type: "string" },
        emptyText: { type: "string" },
        wrap: { type: "boolean" },
        fields: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: fieldSchema,
            number: fieldSchema,
            text: fieldSchema,
            beforeNumber: fieldSchema,
            beforeText: fieldSchema,
            afterNumber: fieldSchema,
            afterText: fieldSchema,
            annotation: fieldSchema,
            change: fieldSchema,
          },
        },
      },
    },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalS, minWidth: 0 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: tokens.spacingHorizontalM },
  heading: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  description: { color: tokens.colorNeutralForeground3 },
  sourceLabel: { color: tokens.colorNeutralForeground3 },
  viewport: { overflow: "auto", border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  lines: { display: "grid", minWidth: "max-content", fontFamily: tokens.fontFamilyMonospace },
  line: { display: "grid", gridTemplateColumns: "3.5rem minmax(20rem, 1fr) minmax(10rem, .55fr)", minHeight: "2rem", borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}` },
  compactLine: { gridTemplateColumns: "3.5rem minmax(20rem, 1fr)" },
  splitLine: { gridTemplateColumns: "3.5rem minmax(16rem, 1fr) 3.5rem minmax(16rem, 1fr) minmax(10rem, .45fr)" },
  compactSplitLine: { gridTemplateColumns: "3.5rem minmax(16rem, 1fr) 3.5rem minmax(16rem, 1fr)" },
  number: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, color: tokens.colorNeutralForeground4, textAlign: "right", userSelect: "none", fontVariantNumeric: "tabular-nums" },
  code: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, whiteSpace: "pre", overflowWrap: "normal" },
  wrappedCode: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  annotation: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, fontFamily: tokens.fontFamilyBase },
  added: { backgroundColor: tokens.colorPaletteGreenBackground1 },
  removed: { backgroundColor: tokens.colorPaletteRedBackground1 },
  modified: { backgroundColor: tokens.colorPaletteYellowBackground1 },
  prefix: { display: "inline-block", width: "1.25rem", color: tokens.colorNeutralForeground3, userSelect: "none" },
  empty: { padding: tokens.spacingHorizontalM, color: tokens.colorNeutralForeground3 },
});

function mappedLines(source: Record<string, unknown>[], spec: SourceViewerSpec): SourceViewerLine[] {
  return source.map((line, index) => {
    const changeValue = textAt(line, spec.fields.change);
    const change = SOURCE_LINE_CHANGES.includes(changeValue as SourceLineChange) ? changeValue as SourceLineChange : "unchanged";
    return {
      id: textAt(line, spec.fields.id) || String(index),
      beforeNumber: textAt(line, spec.fields.beforeNumber || spec.fields.number),
      beforeText: textAt(line, spec.fields.beforeText || spec.fields.text),
      afterNumber: textAt(line, spec.fields.afterNumber || spec.fields.number),
      afterText: textAt(line, spec.fields.afterText || spec.fields.text),
      annotation: textAt(line, spec.fields.annotation),
      change,
    };
  });
}

export const SourceViewer: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const spec = (node.props.spec ?? {}) as unknown as SourceViewerSpec;
  const variant = SOURCE_VIEWER_VARIANTS.includes(node.props.variant as SourceViewerVariant) ? node.props.variant as SourceViewerVariant : "standard";
  const source = records(node.props.lines);
  const lines = spec.fields ? mappedLines(source, spec) : [];
  if (!spec.fields || lines.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No source available."}</Text>;
  const split = spec.kind === "split-diff";
  const showAnnotations = variant === "standard" && lines.some((line) => line.annotation);
  const lineClass = (line: SourceViewerLine) => mergeClasses(
    styles.line,
    variant === "compact" && styles.compactLine,
    split && styles.splitLine,
    split && variant === "compact" && styles.compactSplitLine,
    line.change === "added" && styles.added,
    line.change === "removed" && styles.removed,
    line.change === "modified" && styles.modified,
  );
  const codeClass = mergeClasses(styles.code, spec.wrap && styles.wrappedCode);

  return <figure {...componentRootProps(node, styles.root)} aria-label={spec.title ?? "Source viewer"}>
    {spec.title || spec.description || spec.sourceLabel || spec.language ? <figcaption className={styles.header}><div><div className={styles.heading}>{spec.title ? <Text weight="semibold">{spec.title}</Text> : null}{spec.language ? <Badge appearance="outline">{spec.language}</Badge> : null}</div>{spec.description ? <Text className={styles.description} size={200}>{spec.description}</Text> : null}</div>{spec.sourceLabel ? <Text className={styles.sourceLabel} size={200}>{spec.sourceLabel}</Text> : null}</figcaption> : null}
    <div className={styles.viewport}>
      <div className={styles.lines}>{lines.map((line) => split ? <div className={lineClass(line)} key={line.id}>
        <Text className={styles.number}>{line.beforeNumber}</Text><Text className={codeClass}>{line.beforeText}</Text>
        <Text className={styles.number}>{line.afterNumber}</Text><Text className={codeClass}>{line.afterText}</Text>
        {showAnnotations ? <Text className={styles.annotation} size={200}>{line.annotation}</Text> : null}
      </div> : <div className={lineClass(line)} key={line.id}>
        <Text className={styles.number}>{line.afterNumber || line.beforeNumber}</Text>
        <Text className={codeClass}>{spec.kind === "unified-diff" ? <><span className={styles.prefix} aria-hidden="true">{sourceLinePrefix(line.change)}</span>{sourceLineText(line)}</> : sourceLineText(line)}</Text>
        {showAnnotations ? <Text className={styles.annotation} size={200}>{line.annotation}</Text> : null}
      </div>)}</div>
    </div>
  </figure>;
};

const description: ComponentDescription = {
  capability: "primitive:source-viewer",
  summary: "Renders mapped source lines or precomputed unified and split diff rows with stable line references.",
  dataProp: "lines",
  events: [],
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full source rows with optional annotations.", useWhen: ["Source inspection is a primary surface", "Line annotations should remain visible"] },
    { value: "compact", summary: "Dense source rows without annotation details.", useWhen: ["Source supports another primary result", "Horizontal space is constrained"] },
  ],
  authoring: {
    useWhen: ["Exact source wording and stable line references matter", "A source or precomputed diff needs safe read-only rendering"],
    avoidWhen: ["Users must edit source content", "The component would need to calculate or interpret changes"],
    rules: ["Choose source, unified-diff, or split-diff through spec.kind", "Supply precomputed aligned diff rows", "Use variant only for density", "Preserve source text exactly"],
  },
};

export function getSourceViewerSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateSourceViewer(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([{ kind: "ajv-schema", schema: getSourceViewerSchema(), message: "Invalid primitive:source-viewer props", code: "source-viewer-schema" }], props as Json);
  if (!report.ok) return report;
  const value = props as { lines: Record<string, unknown>[]; spec: SourceViewerSpec };
  const fields = value.spec.fields;
  const sourceFieldsValid = Boolean(fields.number && fields.text);
  const diffFieldsValid = Boolean(fields.change && fields.beforeText && fields.afterText);
  const invalidChange = value.spec.kind !== "source" && value.lines.some((line) => !SOURCE_LINE_CHANGES.includes(String(readPath(line, fields.change)) as SourceLineChange));
  if ((value.spec.kind === "source" && !sourceFieldsValid) || (value.spec.kind !== "source" && !diffFieldsValid) || invalidChange) {
    report.ok = false;
    report.errors.push({ detail: "Source view requires number/text fields; diff views require change, beforeText, and afterText fields with recognized changes", code: "source-viewer-fields" });
  }
  return report;
}
export function materializeSourceViewerTrial() {
  return trialNode("primitive:source-viewer", {
    variant: "standard",
    lines: [
      { id: "41", beforeLine: 41, before: "if (riskScore > threshold) {", afterLine: 41, after: "if (riskScore >= threshold) {", change: "modified", note: "Threshold is now inclusive" },
      { id: "42", beforeLine: 42, before: "", afterLine: 42, after: "  await disableIdentity(subjectId);", change: "added", note: "Containment effect added" },
    ],
    spec: {
      kind: "split-diff",
      title: "Containment policy change",
      language: "TypeScript",
      sourceLabel: "policies/containment.ts",
      fields: { id: "id", beforeNumber: "beforeLine", beforeText: "before", afterNumber: "afterLine", afterText: "after", change: "change", annotation: "note" },
    },
  });
}
export const sourceViewerDefinition = defineComponent({ description, version: "1.0.0", component: SourceViewer, getSchema: getSourceViewerSchema, validate: validateSourceViewer, materializeTrial: materializeSourceViewerTrial });
